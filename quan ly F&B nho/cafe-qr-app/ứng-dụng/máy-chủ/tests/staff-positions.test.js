// Integration test (SQL Server thật) F-078 — phân quyền rõ ràng, đợt 2 (ADR-036 D-162…D-166): vị trí của nhân viên (Thu ngân / Pha chế /
// Phục vụ — để trống = mọi vị trí) và cấp (Thử việc / Chính thức). Máy chủ chặn việc theo vị trí (403 POSITION_REQUIRED, kiểm trước
// cả kiểm dữ liệu gửi lên — nên gọi với body rỗng vẫn biết có bị chặn hay không); thử việc: giảm giá tay, chi quỹ, sửa / xóa món cần duyệt.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, cats, users, tok;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const ok = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body;
};
const tableId = async (code) => (await q1(`SELECT TableId FROM dbo.Tables WHERE Code = '${code}'`))[0].TableId;
const water = (quantity = 1) => [{ menuItemId: ids['Nước suối'], quantity }];

async function createUser(username, role, extra = {}) {
  return ok(await call(admin, 'post', '/api/admin/users', { username, password: 'Pass@123', fullName: `TK ${username}`, role, ...extra }), 201);
}
/** Khách quét QR bàn `code` và gọi món → đơn PENDING (chờ quầy tiếp nhận). */
async function qrOrder(code) {
  const c = await app.customer();
  const sessionId = await app.seat(c, code);
  const o = await c.post('/api/orders', { sessionId, items: water() });
  assert.equal(o.status, 201, JSON.stringify(o.body));
  return { sessionId, orderId: o.body.orderId };
}
/** 403 POSITION_REQUIRED hay không (status khác 403 = qua được cửa vị trí). */
async function blocked(token, method, path, body = {}) {
  const r = await call(token, method, path, body);
  if (r.status === 403 && r.body.code === 'POSITION_REQUIRED') return true;
  assert.notEqual(r.status, 403, `${method} ${path}: ${JSON.stringify(r.body)}`);
  return false;
}

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  ids = await app.ids();
  await createUser('pc1', 'STAFF', { positions: ['BARISTA'] });
  await createUser('pv1', 'STAFF', { positions: ['SERVER'] });
  await createUser('tn1', 'STAFF', { positions: ['CASHIER'] });
  await createUser('tv1', 'STAFF', { level: 'PROBATION' });
  await createUser('lead_p', 'MANAGER', { positions: ['BARISTA'], level: 'PROBATION' });
  users = Object.fromEntries((await q1('SELECT UserId, Username FROM dbo.Users')).map((u) => [u.Username, u.UserId]));
  staff = await app.login('staff1', 'Staff@123');
  tok = {};
  for (const u of ['pc1', 'pv1', 'tn1', 'tv1', 'lead_p']) tok[u] = await app.login(u, 'Pass@123');
  cats = Object.fromEntries((await call(staff, 'get', '/api/cash-categories')).body.map((c) => [c.name, c.categoryId]));
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 2_000_000 }), 201);
});

after(() => app.close());

describe('Vị trí + cấp nhân viên (F-078)', () => {
  test('AC-078-01: chủ quán đặt vị trí + cấp khi tạo / sửa tài khoản; tài khoản cũ = mọi vị trí, chính thức; vai khác nhân viên bỏ qua vị trí / cấp; vị trí sai / rỗng → 400; sửa không gửi vị trí → giữ nguyên; /auth/me trả vị trí', async () => {
    const list = ok(await call(admin, 'get', '/api/admin/users'));
    const by = Object.fromEntries(list.map((u) => [u.username, u]));
    assert.deepEqual([by.pc1.positions, by.pc1.level], [['BARISTA'], 'OFFICIAL']);
    assert.deepEqual([by.tv1.positions, by.tv1.level], [null, 'PROBATION']);
    assert.deepEqual([by.staff1.positions, by.staff1.level], [null, 'OFFICIAL'], 'tài khoản cũ giữ nguyên');
    assert.deepEqual([by.lead_p.positions, by.lead_p.level], [null, 'OFFICIAL'], 'trưởng ca không có vị trí / cấp');
    for (const positions of [['COOK'], [], ['CASHIER', 'CASHIER']]) {
      const r = await call(admin, 'post', '/api/admin/users', {
        username: `bad${positions.length}`,
        password: 'Pass@123',
        fullName: 'X',
        role: 'STAFF',
        positions,
      });
      assert.equal(r.status, 400, JSON.stringify(positions));
    }
    const edited = ok(await call(admin, 'put', `/api/admin/users/${users.pv1}`, { fullName: 'Phục vụ 1', role: 'STAFF' }));
    assert.deepEqual([edited.positions, edited.level], [['SERVER'], 'OFFICIAL'], 'không gửi vị trí → giữ');
    const two = ok(await call(admin, 'put', `/api/admin/users/${users.tn1}`, { fullName: 'Thu ngân 1', role: 'STAFF', positions: ['CASHIER', 'SERVER'] }));
    assert.deepEqual(two.positions, ['CASHIER', 'SERVER']);
    ok(await call(admin, 'put', `/api/admin/users/${users.tn1}`, { fullName: 'Thu ngân 1', role: 'STAFF', positions: ['CASHIER'] }));
    const me = ok(await call(tok.pc1, 'get', '/api/auth/me'));
    assert.deepEqual([me.user.positions, me.user.level], [['BARISTA'], 'OFFICIAL']);
    assert.equal((await call(staff, 'put', `/api/admin/users/${users.pc1}`, { fullName: 'X', role: 'STAFF', positions: ['CASHIER'] })).status, 403);
  });

  test('AC-078-02: Pha chế — tiếp nhận / hoàn tất đơn, sơ chế, hủy hàng, nhận hàng được; thu tiền, bán mang đi, mở / đóng ca, hoàn tiền, ghi chi quỹ, mở bàn / gọi món tại bàn → 403 POSITION_REQUIRED', async () => {
    const { orderId } = await qrOrder('02');
    ok(await call(tok.pc1, 'post', `/api/orders/${orderId}/accept`));
    ok(await call(tok.pc1, 'post', `/api/orders/${orderId}/complete`));
    for (const path of ['/api/prep/batches', '/api/waste', '/api/lots/1/write-off', '/api/receiving/purchase-orders/1/receive']) {
      assert.equal(await blocked(tok.pc1, 'post', path), false, path);
    }
    const tid = await tableId('03');
    for (const [method, path] of [
      ['post', '/api/orders/takeaway'],
      ['post', '/api/sessions/00000000-0000-0000-0000-000000000001/settle'],
      ['post', '/api/splits/1/settle'],
      ['post', '/api/shifts/open'],
      ['post', '/api/shifts/1/close'],
      ['post', '/api/payments/1/refunds'],
      ['post', '/api/cash-transactions'],
      ['post', '/api/gift-drinks'],
      ['post', `/api/tables/${tid}/sessions`],
      ['post', '/api/sessions/00000000-0000-0000-0000-000000000001/orders'],
      ['post', '/api/sessions/00000000-0000-0000-0000-000000000001/move'],
    ]) {
      assert.equal(await blocked(tok.pc1, method, path), true, `${method} ${path}`);
    }
    const r = await call(tok.pc1, 'post', '/api/orders/takeaway', { items: water(), amountReceived: 50000 });
    assert.match(r.body.message, /Thu ngân/);
  });

  test('AC-078-03: Phục vụ — mở bàn, gọi món tại bàn, chuyển bàn được; tiếp nhận / hoàn tất, thu tiền, bán mang đi → 403', async () => {
    const tid = await tableId('04');
    const session = ok(await call(tok.pv1, 'post', `/api/tables/${tid}/sessions`, {}), 201).session;
    const order = ok(await call(tok.pv1, 'post', `/api/sessions/${session.sessionId}/orders`, { items: water(2) }), 201).order;
    assert.equal(await blocked(tok.pv1, 'post', `/api/sessions/${session.sessionId}/move`), false);
    assert.equal(await blocked(tok.pv1, 'post', `/api/orders/${order.orderId}/complete`), true);
    assert.equal(await blocked(tok.pv1, 'post', `/api/sessions/${session.sessionId}/settle`), true);
    assert.equal(await blocked(tok.pv1, 'post', '/api/orders/takeaway'), true);
    // Thu ngân thu tiền bàn phục vụ vừa mở
    const pv = ok(await call(tok.tn1, 'post', `/api/sessions/${session.sessionId}/settle/preview`, {}));
    ok(await call(tok.tn1, 'post', `/api/sessions/${session.sessionId}/settle`, { amountReceived: 100000, expectedAmountDue: pv.totals.amountDue }));
  });

  test('AC-078-04: Thu ngân — bán mang đi, thu tiền, ghi chi quỹ được; tiếp nhận / hoàn tất, mở bàn → 403; nhân viên chưa đặt vị trí và trưởng ca làm được mọi việc; Tra cứu API ghi vị trí', async () => {
    const sale = ok(await call(tok.tn1, 'post', '/api/orders/takeaway', { items: water(), amountReceived: 50000 }), 201);
    ok(await call(tok.tn1, 'post', '/api/cash-transactions', { categoryId: cats['Mua đá'], amount: 1000, reason: 'đá' }), 201);
    assert.equal(await blocked(tok.tn1, 'post', `/api/orders/${sale.order.orderId}/complete`), true);
    assert.equal(await blocked(tok.tn1, 'post', `/api/tables/${await tableId('05')}/sessions`), true);
    // staff1 (mọi vị trí) và trưởng ca (vị trí gửi lên bị bỏ qua) không bị chặn
    for (const token of [staff, tok.lead_p]) {
      assert.equal(await blocked(token, 'post', '/api/orders/takeaway'), false);
      assert.equal(await blocked(token, 'post', `/api/orders/${sale.order.orderId}/complete`), false);
      assert.equal(await blocked(token, 'post', '/api/sessions/00000000-0000-0000-0000-000000000001/orders'), false);
    }
    const docs = ok(await call(admin, 'get', '/api/admin/api-docs'));
    const find = (m, p) => docs.endpoints.find((e) => e.method === m && e.path === p);
    assert.deepEqual(find('POST', '/api/orders/takeaway').positions, ['CASHIER']);
    assert.deepEqual(find('POST', '/api/orders/:id/accept').positions, ['BARISTA']);
    assert.deepEqual(find('POST', '/api/sessions/:id/orders').positions, ['SERVER']);
    assert.equal(find('GET', '/api/orders').positions, null);
    assert.equal(find('POST', '/api/orders/takeaway').access, 'STAFF');
  });

  test('AC-078-05: Thử việc — giảm giá tay bất kỳ cần trưởng ca duyệt (chính thức 5 % tự giảm được), khoản chi nhỏ vẫn chờ duyệt, xóa món của đơn chưa tiếp nhận cần người duyệt', async () => {
    const quote = async (token) =>
      ok(
        await call(token, 'post', '/api/orders/takeaway/quote', {
          items: water(10),
          manualDiscount: { kind: 'PERCENT', value: 5 },
          manualReason: 'khách quen',
        }),
      ).needsApproval;
    assert.equal(await quote(staff), false);
    assert.equal(await quote(tok.tv1), true);
    const sale = (creds = {}) =>
      call(tok.tv1, 'post', '/api/orders/takeaway', {
        items: water(10),
        amountReceived: 1_000_000,
        manualDiscount: { kind: 'PERCENT', value: 5 },
        manualReason: 'khách quen',
        ...creds,
      });
    assert.equal((await sale()).body.code, 'ADMIN_APPROVAL_REQUIRED');
    const approved = ok(await sale({ adminUsername: 'lead_p', adminPassword: 'Pass@123' }), 201);
    assert.equal((await q1(`SELECT ApprovedBy FROM dbo.Payments WHERE PaymentId = ${approved.payment.paymentId}`))[0].ApprovedBy, users.lead_p);

    const mine = ok(await call(tok.tv1, 'post', '/api/cash-transactions', { categoryId: cats['Mua đá'], amount: 1000, reason: 'đá' }), 201);
    const official = ok(await call(staff, 'post', '/api/cash-transactions', { categoryId: cats['Mua đá'], amount: 1000, reason: 'đá' }), 201);
    assert.deepEqual([mine.status, official.status], ['PENDING', 'APPROVED']);
    ok(await call(tok.lead_p, 'post', `/api/cash-transactions/${mine.cashTxnId}/approve`, {}));

    const { orderId } = await qrOrder('06');
    const item = (await q1(`SELECT OrderItemId FROM dbo.OrderItems WHERE OrderId = ${orderId}`))[0].OrderItemId;
    const voidBody = { quantity: 0, reason: 'Khách đổi ý', stockMode: 'RESTOCK' };
    const denied = await call(tok.tv1, 'post', `/api/order-items/${item}/void`, voidBody);
    assert.equal(denied.status, 403, JSON.stringify(denied.body));
    assert.equal(denied.body.code, 'ADMIN_APPROVAL_REQUIRED');
    const voided = await call(tok.tv1, 'post', `/api/order-items/${item}/void`, { ...voidBody, adminUsername: 'lead_p', adminPassword: 'Pass@123' });
    assert.equal(voided.status, 200, JSON.stringify(voided.body));
    const by = await q1(`SELECT TOP 1 ApprovedBy FROM dbo.OrderItemVoids WHERE OrderItemId = ${item} ORDER BY VoidId DESC`);
    assert.equal(by[0].ApprovedBy, users.lead_p);
  });
});
