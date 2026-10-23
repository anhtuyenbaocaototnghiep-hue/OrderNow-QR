// Integration test (SQL Server thật) F-055 — chưa mở ca thì không nhận và không xử lý đơn (ADR-017 D-64…D-66).
// Mỗi test tự mở / đóng ca theo nhu cầu; DB test sạch nên lúc đầu chưa có ca nào.
import { after, afterEach, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, tables;

const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const currentShift = async () => (await call(staff, 'get', '/api/shifts/current')).body.shift;
async function openShift() {
  const r = await call(staff, 'post', '/api/shifts/open', { openingCash: 0 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.shift;
}
async function closeShift() {
  const cur = await currentShift();
  assert.ok(cur, 'không có ca mở để đóng');
  const r = await call(staff, 'post', `/api/shifts/${cur.shiftId}/close`, { countedCash: cur.expectedCash });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}
const expectNoShift = (r, what) => {
  assert.equal(r.status, 409, `${what}: ${r.status} ${JSON.stringify(r.body)}`);
  assert.equal(r.body.code, 'NO_OPEN_SHIFT', what);
};

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  tables = Object.fromEntries((await q1('SELECT TableId, Code, QrToken FROM dbo.Tables')).map((t) => [t.Code, t]));
});

// Dọn ca sau mỗi test: một test lỗi giữa chừng không được để ca mở làm hỏng các test sau (review G3)
afterEach(async () => {
  const cur = await currentShift();
  if (cur) await call(staff, 'post', `/api/shifts/${cur.shiftId}/close`, { countedCash: cur.expectedCash });
});

after(() => app.close());

describe('Chưa mở ca thì không nhận và không xử lý đơn (F-055)', () => {
  test('AC-055-01: chưa mở ca — khách gửi đơn → 409 NO_OPEN_SHIFT, không tạo đơn; menu shiftOpen = false; báo giá vẫn 200; mở ca → shiftOpen = true, gửi đơn 201', async () => {
    assert.equal(await currentShift(), null, 'DB test phải chưa có ca mở');
    const C = await app.customer();
    const menu = await C.get('/api/menu');
    assert.equal(menu.status, 200);
    assert.equal(menu.body.store.shiftOpen, false);
    assert.equal(menu.body.store.acceptingOrders, true, 'công tắc nhận đơn QR giữ nguyên nghĩa');
    const s = await app.seat(C, '01');
    const items = [{ menuItemId: ids['Cà phê đen'], quantity: 1 }];
    const quote = await C.post('/api/orders/quote', { items });
    assert.equal(quote.status, 200, JSON.stringify(quote.body));
    expectNoShift(await C.post('/api/orders', { sessionId: s, items }), 'khách gửi đơn');
    assert.equal((await q1(`SELECT COUNT(*) AS n FROM dbo.Orders WHERE SessionId = '${s}'`))[0].n, 0);
    const store = await call(staff, 'get', '/api/store');
    assert.equal(store.body.shiftOpen, false);

    await openShift();
    assert.equal((await C.get('/api/menu')).body.store.shiftOpen, true);
    assert.equal((await call(staff, 'get', '/api/store')).body.shiftOpen, true);
    const ok = await C.post('/api/orders', { sessionId: s, items });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    // dọn: hủy đơn vừa gửi, đóng ca
    assert.equal((await call(staff, 'post', `/api/orders/${ok.body.orderId}/cancel`, { reason: 'test' })).status, 200);
    await closeShift();
  });

  test('AC-055-02: mở ca → khách nhận store.status_changed có shiftOpen = true; đóng ca → shiftOpen = false', async () => {
    const C = await app.customer();
    const s = await app.seat(C, '02');
    const sock = await app.connect({ auth: { sessionId: s }, extraHeaders: { cookie: C.cookie } });
    const opened = app.waitFor(sock, 'store.status_changed', (p) => p.shiftOpen === true);
    await openShift();
    const p1 = await opened;
    assert.equal(p1.acceptingOrders, true);
    const closed = app.waitFor(sock, 'store.status_changed', (p) => p.shiftOpen === false);
    await closeShift();
    assert.equal((await closed).shiftOpen, false);
  });

  test('AC-055-03: đơn từ ca trước còn chờ, ca đã đóng — tiếp nhận, hoàn tất, hủy, gọi món tại bàn, sửa / xóa món, xóa đơn, hủy bàn, chuyển bàn, chia bill → 409 NO_OPEN_SHIFT, dữ liệu không đổi; mở ca → xử lý được', async () => {
    await openShift();
    const C = await app.customer();
    const s = await app.seat(C, '03');
    const send = async (name) => {
      const r = await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids[name], quantity: 2 }] });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      return r.body.orderId;
    };
    const pending = await send('Cà phê đen');
    const preparing = await send('Bạc xỉu');
    assert.equal((await call(staff, 'post', `/api/orders/${preparing}/accept`)).status, 200);
    await closeShift();

    const snapshot = async () => ({
      orders: await q1(`SELECT OrderId, Status FROM dbo.Orders WHERE SessionId = '${s}' ORDER BY OrderId`),
      items: await q1(
        `SELECT oi.OrderItemId, oi.Quantity FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId WHERE o.SessionId = '${s}' ORDER BY oi.OrderItemId`,
      ),
      stock: await q1('SELECT IngredientId, StockQty, ReservedQty FROM dbo.Ingredients ORDER BY IngredientId'),
      session: await q1(`SELECT TableId, Status FROM dbo.Sessions WHERE SessionId = '${s}'`),
      splits: await q1(`SELECT COUNT(*) AS n FROM dbo.SessionSplits WHERE SessionId = '${s}'`),
    });
    const before = await snapshot();
    const itemId = before.items[0].OrderItemId;
    const voidBody = { reason: 'khách đổi ý', stockMode: 'RESTOCK' };
    expectNoShift(await call(staff, 'post', `/api/orders/${pending}/accept`), 'tiếp nhận');
    expectNoShift(await call(staff, 'post', `/api/orders/${preparing}/complete`), 'hoàn tất');
    expectNoShift(await call(staff, 'post', `/api/orders/${pending}/cancel`, { reason: 'x' }), 'hủy đơn');
    expectNoShift(await call(staff, 'post', `/api/sessions/${s}/orders`, { items: [{ menuItemId: ids['Cà phê đen'], quantity: 1 }] }), 'gọi món tại bàn');
    expectNoShift(await call(staff, 'post', `/api/order-items/${itemId}/void`, { quantity: 1, ...voidBody }), 'sửa món');
    expectNoShift(await call(staff, 'post', `/api/orders/${pending}/void`, voidBody), 'xóa đơn');
    expectNoShift(await call(staff, 'post', `/api/sessions/${s}/cancel`, voidBody), 'hủy bàn');
    expectNoShift(await call(staff, 'post', `/api/sessions/${s}/move`, { toTableId: tables['06'].TableId }), 'chuyển bàn');
    expectNoShift(await call(staff, 'post', `/api/sessions/${s}/splits`, { label: 'An' }), 'chia bill — tạo phần (quầy)');
    expectNoShift(await C.post(`/api/sessions/${s}/splits`, { label: 'Bình' }), 'chia bill — tạo phần (khách)');
    expectNoShift(await call(staff, 'put', `/api/sessions/${s}/items/${itemId}/split`, { splitId: null }), 'chia bill — gán món');
    expectNoShift(await call(staff, 'post', `/api/sessions/${s}/splits/merge`), 'chia bill — gộp');
    assert.deepEqual(await snapshot(), before, 'dữ liệu phải giữ nguyên khi bị chặn');

    await openShift();
    assert.equal((await call(staff, 'post', `/api/orders/${pending}/accept`)).status, 200);
    assert.equal((await call(staff, 'post', `/api/orders/${preparing}/complete`)).status, 200);
    assert.equal((await call(staff, 'post', `/api/orders/${pending}/complete`)).status, 200);
    const settle = await call(staff, 'post', `/api/sessions/${s}/settle`, { amountReceived: 1_000_000 });
    assert.equal(settle.status, 200, JSON.stringify(settle.body));
    await closeShift();
  });

  test('AC-055-04: chưa mở ca vẫn làm được — mở bàn + ghi chú bàn, xem đơn / bàn, xem tồn kho ở quầy, ghi phiếu hủy hàng, xem báo cáo quản lý, mở ca', async () => {
    assert.equal(await currentShift(), null);
    const opened = await call(staff, 'post', `/api/tables/${tables['05'].TableId}/sessions`, { note: 'khách quen' });
    assert.equal(opened.status, 201, JSON.stringify(opened.body));
    const sid = opened.body.session.sessionId;
    assert.equal((await call(staff, 'put', `/api/sessions/${sid}/note`, { note: 'ngồi ngoài' })).status, 200);
    assert.equal((await call(staff, 'get', '/api/orders?status=PENDING,PREPARING')).status, 200);
    assert.equal((await call(staff, 'get', '/api/tables')).status, 200);
    const ingredients = await call(staff, 'get', '/api/ops/ingredients');
    assert.equal(ingredients.status, 200);
    const ing = ingredients.body.find((i) => Number(i.stockQty ?? i.available ?? 0) > 1) ?? ingredients.body[0];
    const waste = await call(staff, 'post', '/api/waste', { ingredientId: ing.ingredientId, qty: 1, reason: 'SPILL' });
    assert.equal(waste.status, 201, JSON.stringify(waste.body));
    const report = await call(admin, 'get', `/api/admin/reports/revenue?from=${todayVn()}&to=${todayVn()}`);
    assert.equal(report.status, 200, JSON.stringify(report.body));
    assert.equal((await call(staff, 'post', `/api/sessions/${sid}/close`)).status, 200, 'đóng bàn trống');
    await openShift();
    await closeShift();
  });
});
