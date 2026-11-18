// Integration test (SQL Server thật) F-088 — màn quầy một màn hình (ADR-049 D-214…D-219): cài đặt một màn hình / mang ra bàn,
// trạm làm món (Pha chế / Quầy lấy), "Đã mang" đơn tại bàn, báo hết món ngay ở quầy, đơn chỉ có món trạm Quầy do người đứng Quầy xong.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, sleep, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, tok, publicSock, categoryOf;

const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body;
};
const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;

async function createUser(username, role, extra = {}) {
  return ok(await call(admin, 'post', '/api/admin/users', { username, password: 'Pass@123', fullName: `TK ${username}`, role, ...extra }), 201);
}

/** Khách quét QR bàn `code` và gọi `items` → { C, sessionId, orderId } (đơn PENDING). */
async function guestOrder(code, items) {
  const C = await app.customer();
  const sessionId = await app.seat(C, code);
  const o = await C.post('/api/orders', { sessionId, items });
  assert.equal(o.status, 201, JSON.stringify(o.body));
  return { C, sessionId, orderId: o.body.orderId };
}

/** Nhận + hoàn tất (như nút "Xong" 1 chạm). */
async function makeDone(token, orderId) {
  ok(await call(token, 'post', `/api/orders/${orderId}/accept`));
  return ok(await call(token, 'post', `/api/orders/${orderId}/complete`)).order;
}

const menuItem = async (C, menuItemId) => {
  const menu = (await C.get('/api/menu')).body;
  return menu.categories.flatMap((c) => c.items).find((i) => i.id === menuItemId);
};

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  await createUser('pc88', 'STAFF', { positions: ['BARISTA'] });
  await createUser('tn88', 'STAFF', { positions: ['CASHIER'] });
  await createUser('pv88', 'STAFF', { positions: ['SERVER'] });
  await createUser('ql88', 'STORE_MGR');
  tok = {};
  for (const u of ['pc88', 'tn88', 'pv88', 'ql88']) tok[u] = await app.login(u, 'Pass@123');
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 0 }), 201);
  categoryOf = Object.fromEntries(
    (await q1('SELECT MenuItemId, CategoryId FROM dbo.MenuItems WHERE DeletedAt IS NULL')).map((r) => [r.MenuItemId, r.CategoryId]),
  );
  publicSock = await app.connect({});
});

after(() => app.close());

describe('Màn quầy một màn hình (F-088)', () => {
  test('AC-088-01: cài đặt mặc định một màn hình + mang ra bàn; /api/auth/me trả pos.singleScreen, pos.serveMode; lưu được, giá trị lạ → 400; quản lý cửa hàng đổi được; phiên khách có serveMode', async () => {
    let me = ok(await call(staff, 'get', '/api/auth/me'));
    assert.equal(me.pos.singleScreen, true);
    assert.equal(me.pos.serveMode, 'TABLE');

    ok(await call(admin, 'put', '/api/admin/settings', { singleScreen: false, serveMode: 'COUNTER' }));
    me = ok(await call(staff, 'get', '/api/auth/me'));
    assert.deepEqual([me.pos.singleScreen, me.pos.serveMode], [false, 'COUNTER']);
    const settings = ok(await call(admin, 'get', '/api/admin/settings'));
    assert.deepEqual([settings.singleScreen, settings.serveMode], [false, 'COUNTER']);

    const bad = await call(admin, 'put', '/api/admin/settings', { serveMode: 'KITCHEN' });
    assert.equal(bad.status, 400, JSON.stringify(bad.body));
    assert.equal(bad.body.code, 'VALIDATION_ERROR');

    // Vận hành quầy như "quy trình 1 chạm" (F-076) → quản lý cửa hàng đổi được
    ok(await call(tok.ql88, 'put', '/api/admin/settings', { singleScreen: true, serveMode: 'TABLE' }));
    me = ok(await call(staff, 'get', '/api/auth/me'));
    assert.deepEqual([me.pos.singleScreen, me.pos.serveMode], [true, 'TABLE']);

    const C = await app.customer();
    const sessionId = await app.seat(C, '01');
    const s = ok(await C.get(`/api/sessions/${sessionId}`));
    assert.equal(s.serveMode, 'TABLE');
  });

  test('AC-088-02: món có trạm làm món — tạo "Quầy lấy" trả COUNTER, sửa không gửi trạm thì giữ nguyên, tạo không gửi trạm là BAR, trạm lạ → 400; đơn có món đó ghi station ở danh sách đơn quầy và chi tiết đơn', async () => {
    const categoryId = categoryOf[ids['Bánh croissant']];
    const counter = ok(await call(admin, 'post', '/api/admin/menu-items', { categoryId, name: 'Bánh quy bơ', price: 15000, station: 'COUNTER' }), 201);
    assert.equal(counter.station, 'COUNTER');
    ids['Bánh quy bơ'] = counter.menuItemId;
    const edited = ok(await call(admin, 'put', `/api/admin/menu-items/${counter.menuItemId}`, { categoryId, name: 'Bánh quy bơ', price: 16000 }));
    assert.equal(edited.station, 'COUNTER', 'sửa không gửi trạm → giữ nguyên');
    assert.equal(edited.price, 16000);

    const bar = ok(await call(admin, 'post', '/api/admin/menu-items', { categoryId, name: 'Trà gừng nóng', price: 25000 }), 201);
    assert.equal(bar.station, 'BAR', 'mặc định pha chế');
    const bad = await call(admin, 'put', `/api/admin/menu-items/${bar.menuItemId}`, { categoryId, name: 'Trà gừng nóng', price: 25000, station: 'KITCHEN' });
    assert.equal(bad.status, 400, JSON.stringify(bad.body));

    const { orderId } = await guestOrder('02', [
      { menuItemId: ids['Cà phê đen'], quantity: 1 },
      { menuItemId: counter.menuItemId, quantity: 2 },
    ]);
    const listed = ok(await call(staff, 'get', '/api/orders')).find((o) => o.orderId === orderId);
    const stationOf = (o, id) => o.items.find((i) => i.menuItemId === id).station;
    assert.equal(stationOf(listed, counter.menuItemId), 'COUNTER');
    assert.equal(stationOf(listed, ids['Cà phê đen']), 'BAR');
    const detail = ok(await call(staff, 'get', `/api/orders/${orderId}`));
    assert.equal(stationOf(detail, counter.menuItemId), 'COUNTER');
  });

  test('AC-088-03: không còn bước "Đã mang" (ADR-064 D-253) — đơn tại bàn xong là xong: POST /api/orders/{id}/served → 404, đơn ở quầy và phiên khách không có servedAt, CSDL không ghi ServedAt / ServedBy', async () => {
    const { C, sessionId, orderId } = await guestOrder('03', [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    await makeDone(staff, orderId);
    const gone = await call(tok.pv88, 'post', `/api/orders/${orderId}/served`);
    assert.equal(gone.status, 404, JSON.stringify(gone.body));
    const listed = ok(await call(staff, 'get', '/api/orders')).find((o) => o.orderId === orderId);
    assert.deepEqual([listed.status, 'servedAt' in listed], ['COMPLETED', false]);
    const mine = ok(await C.get(`/api/sessions/${sessionId}`)).orders.find((o) => o.orderId === orderId);
    assert.deepEqual([mine.status, 'servedAt' in mine], ['COMPLETED', false]);
    const row = (await q1(`SELECT ServedAt, ServedBy FROM dbo.Orders WHERE OrderId = ${orderId}`))[0];
    assert.deepEqual([row.ServedAt, row.ServedBy], [null, null]);
  });

  test('AC-088-04: báo hết món ngay ở quầy — Pha chế tắt Latte → menu khách không đặt được, phát menu.availability_changed, có nhật ký menu.availability; bật lại đặt được; chỉ Thu ngân → 403 POSITION_REQUIRED; món không có → 404', async () => {
    const latte = ids['Latte'];
    const C = await app.customer();
    assert.equal((await menuItem(C, latte)).isAvailable, true);

    const off = app.waitFor(publicSock, 'menu.availability_changed', (p) => p.menuItemId === latte && p.isAvailable === false);
    const item = ok(await call(tok.pc88, 'patch', `/api/menu-items/${latte}/availability`, { isAvailable: false }));
    assert.equal(item.isAvailable, false);
    await off;
    assert.equal((await menuItem(C, latte)).isAvailable, false, 'menu khách: hết');

    let logged = [];
    for (let i = 0; i < 20 && !logged.length; i++) {
      logged = await q1(`SELECT Action, Entity, EntityId FROM dbo.AuditLogs WHERE Action = 'menu.availability' AND EntityId = '${latte}'`);
      if (!logged.length) await sleep(100);
    }
    assert.equal(logged.length, 1, 'có dòng nhật ký thao tác');
    assert.equal(logged[0].Entity, 'MenuItem');

    const blocked = await call(tok.tn88, 'patch', `/api/menu-items/${latte}/availability`, { isAvailable: true });
    assert.equal(blocked.status, 403, JSON.stringify(blocked.body));
    assert.equal(blocked.body.code, 'POSITION_REQUIRED');

    ok(await call(tok.pc88, 'patch', `/api/menu-items/${latte}/availability`, { isAvailable: true }));
    assert.equal((await menuItem(C, latte)).isAvailable, true, 'bật lại đặt được');

    const missing = await call(tok.pc88, 'patch', '/api/menu-items/999999/availability', { isAvailable: false });
    assert.equal(missing.status, 404, JSON.stringify(missing.body));
  });

  test('AC-088-05: đơn chỉ có món trạm Quầy — Thu ngân / Phục vụ (không có vị trí Pha chế) nhận + xong được; đơn có món trạm Bar → Thu ngân bị chặn 403 POSITION_REQUIRED như F-078', async () => {
    // Món riêng của bài này (không phụ thuộc bài AC-088-02)
    const categoryId = categoryOf[ids['Bánh croissant']];
    const cookie = ok(await call(admin, 'post', '/api/admin/menu-items', { categoryId, name: 'Bánh quy dừa', price: 12000, station: 'COUNTER' }), 201);
    const counterOnly = await guestOrder('04', [{ menuItemId: cookie.menuItemId, quantity: 1 }]);
    assert.equal((await makeDone(tok.tn88, counterOnly.orderId)).status, 'COMPLETED');
    const forServer = await guestOrder('06', [{ menuItemId: cookie.menuItemId, quantity: 2 }]);
    assert.equal((await makeDone(tok.pv88, forServer.orderId)).status, 'COMPLETED', 'Phục vụ cũng xong được đơn chỉ có món Quầy');

    const withBar = await guestOrder('05', [
      { menuItemId: ids['Cà phê đen'], quantity: 1 },
      { menuItemId: cookie.menuItemId, quantity: 1 },
    ]);
    for (const step of ['accept', 'complete']) {
      const r = await call(tok.tn88, 'post', `/api/orders/${withBar.orderId}/${step}`);
      assert.equal(r.status, 403, `${step}: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.code, 'POSITION_REQUIRED');
    }
    // Người pha vẫn làm bình thường
    assert.equal((await makeDone(tok.pc88, withBar.orderId)).status, 'COMPLETED');
  });
});
