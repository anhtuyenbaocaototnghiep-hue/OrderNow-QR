// Integration test API + realtime trên SQL Server thật (DB test). Phủ AC của FEATURE-001…012 ở mức API.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import supertest from 'supertest';
import { io as ioc } from 'socket.io-client';
import { resetTestDatabase, inventoryViolations } from './helpers/testDb.js';

let ctx, pool, server, base, api, adminToken, staffToken, ids, tables;
const sockets = [];

// ---------- helpers ----------
async function login(username, password) {
  const r = await api.post('/api/auth/login').send({ username, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.accessToken;
}
const auth = (token) => ({ Authorization: `Bearer ${token}` });

/** Một "điện thoại khách": giữ cookie cf_client. */
async function customer() {
  const r = await api.get('/api/menu');
  const cookie = r.headers['set-cookie'].find((c) => c.startsWith('cf_client=')).split(';')[0];
  const call = (method, path, body, headers = {}) => {
    const req = api[method](path).set('Cookie', cookie).set(headers);
    return body === undefined ? req : req.send(body);
  };
  return { cookie, get: (p) => call('get', p), post: (p, b, h) => call('post', p, b ?? {}, h) };
}

function connect(opts) {
  return new Promise((resolve, reject) => {
    const s = ioc(base, { transports: ['websocket'], reconnection: false, ...opts });
    sockets.push(s);
    s.on('ready', () => resolve(s));
    s.on('connect_error', reject);
  });
}

function waitFor(socket, event, predicate = () => true, ms = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout chờ ${event}`)), ms);
    const handler = (payload) => {
      if (predicate(payload)) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(payload);
      }
    };
    socket.on(event, handler);
  });
}

function collect(socket, event) {
  const got = [];
  socket.on(event, (p) => got.push(p));
  return got;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  ctx = await resetTestDatabase();
  pool = ctx.pool;
  const { seedDemo } = await import('../../../kịch-bản/seed-data.js');
  await seedDemo(pool, ctx.adminId);
  const { createApp } = await import('../src/app.js');
  const { attachRealtime } = await import('../src/realtime/io.js');
  const { initAvailability } = await import('../src/services/menuService.js');
  server = http.createServer(createApp());
  attachRealtime(server);
  await initAvailability();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  api = supertest(server);
  adminToken = await login('admin', 'Admin@123');
  staffToken = await login('staff1', 'Staff@123');
  ids = Object.fromEntries((await pool.request().query('SELECT MenuItemId, Name FROM dbo.MenuItems')).recordset.map((m) => [m.Name, m.MenuItemId]));
  tables = Object.fromEntries((await pool.request().query('SELECT Code, QrToken FROM dbo.Tables')).recordset.map((t) => [t.Code, t.QrToken]));
});

after(async () => {
  sockets.forEach((s) => s.close());
  const violations = await inventoryViolations(pool);
  await new Promise((r) => server.close(r));
  const { closePool } = await import('../src/db.js');
  await closePool();
  await pool.close();
  assert.deepEqual(violations, []);
});

// ---------- tests ----------
describe('Hạ tầng & đăng nhập (FEATURE-009)', () => {
  test('health, trang tĩnh, 404 JSON cho API lạ', async () => {
    assert.equal((await api.get('/api/health')).body.status, 'ok');
    const page = await api.get(`/t/${tables['01']}`);
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type'], /html/);
    assert.equal((await api.get('/api/khong-co').set(auth(staffToken))).status, 404);
  });

  test('sai mật khẩu → 401; đúng → token + /auth/me; username không phân biệt hoa thường', async () => {
    const bad = await api.post('/api/auth/login').send({ username: 'admin', password: 'sai' });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.message, 'Sai tên đăng nhập hoặc mật khẩu');
    const ok = await api.post('/api/auth/login').send({ username: 'ADMIN', password: 'Admin@123' });
    assert.equal(ok.status, 200);
    const me = await api.get('/api/auth/me').set(auth(ok.body.accessToken));
    assert.equal(me.body.user.role, 'ADMIN');
  });

  test('ma trận quyền: khách → API quầy/admin 401; STAFF → admin 403 (AC-007-07, AC-009-01, AC-010-05, AC-012-04)', async () => {
    const guest = [
      ['get', '/api/orders'],
      ['post', '/api/orders/1/accept'],
      ['post', '/api/orders/1/complete'],
      ['post', '/api/orders/takeaway'],
      ['post', '/api/sessions/00000000-0000-0000-0000-000000000000/settle'],
      ['get', '/api/admin/users'],
      ['get', '/api/admin/reports/revenue?from=2026-10-01&to=2026-10-10'],
    ];
    for (const [m, p] of guest) assert.equal((await api[m](p).send({})).status, 401, `${m} ${p}`);
    for (const p of ['/api/admin/users', '/api/admin/menu-items', '/api/admin/reports/revenue?from=2026-10-01&to=2026-10-10']) {
      assert.equal((await api.get(p).set(auth(staffToken))).status, 403, p);
    }
    assert.equal((await api.get('/api/orders').set(auth(staffToken))).status, 200);
  });
});

describe('Luồng khách → quầy → thu tiền (FEATURE-001…007)', () => {
  let A, B, C, sessionA, sessionC, staffSock, sockA, sockC, order1;

  test('quét QR: bàn trống → NEW; bàn có người → OCCUPIED; Gộp → cùng phiên; Cá nhân → phiên riêng (AC-001-01…03, 05)', async () => {
    A = await customer();
    B = await customer();
    C = await customer();
    assert.equal((await A.post('/api/sessions/scan', { qrToken: 'f'.repeat(32) })).status, 404);
    const a = await A.post('/api/sessions/scan', { qrToken: tables['01'] });
    assert.equal(a.body.state, 'NEW');
    sessionA = a.body.session.sessionId;
    assert.equal((await A.post('/api/sessions/scan', { qrToken: tables['01'] })).body.state, 'MEMBER');
    const b = await B.post('/api/sessions/scan', { qrToken: tables['01'] });
    assert.equal(b.body.state, 'OCCUPIED');
    assert.equal(b.body.openSessions.length, 1);
    assert.equal(b.body.openSessions[0].sessionId, sessionA);
    assert.equal((await B.post(`/api/sessions/${sessionA}/join`, { qrToken: tables['01'] })).status, 200);
    const c = await C.post('/api/sessions', { qrToken: tables['01'] });
    assert.equal(c.status, 201);
    sessionC = c.body.session.sessionId;
    assert.notEqual(sessionC, sessionA);
    assert.equal((await C.get(`/api/sessions/${sessionA}`)).status, 403);
    assert.equal((await B.get(`/api/sessions/${sessionA}`)).status, 200);
    assert.equal((await B.post(`/api/sessions/${sessionA}/join`, { qrToken: tables['02'] })).status, 404);
  });

  test('gửi đơn: giá từ DB, realtime tới quầy + phiên, phiên khác không nhận (AC-003-01, 03, AC-004-03, AC-007-01)', async () => {
    staffSock = await connect({ auth: { token: staffToken } });
    sockA = await connect({ auth: { sessionId: sessionA }, extraHeaders: { cookie: A.cookie } });
    sockC = await connect({ auth: { sessionId: sessionC }, extraHeaders: { cookie: C.cookie } });
    await assert.rejects(connect({ auth: { sessionId: sessionA }, extraHeaders: { cookie: C.cookie } }), /FORBIDDEN/);
    await assert.rejects(connect({ auth: { token: 'sai' } }), /UNAUTHORIZED/);
    const cGot = collect(sockC, 'order.created');
    const staffEvt = waitFor(staffSock, 'order.created');
    const aEvt = waitFor(sockA, 'order.created');
    const t0 = Date.now();
    const r = await A.post('/api/orders', {
      sessionId: sessionA,
      items: [
        { menuItemId: ids['Cà phê sữa'], quantity: 2, note: 'ít đá', price: 1 },
        { menuItemId: ids['Trà đào'], quantity: 1 },
      ],
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.totalAmount, 2 * 29000 + 35000);
    assert.equal(r.body.status, 'PENDING');
    order1 = r.body.order;
    const evt = await staffEvt;
    assert.equal(evt.order.orderId, order1.orderId);
    assert.equal(evt.order.items[0].note, 'ít đá');
    assert.ok(Date.now() - t0 < 2000, 'NFR-001 < 2s trên máy dev');
    await aEvt;
    await sleep(300);
    assert.equal(cGot.length, 0);
  });

  test('Idempotency-Key gửi lặp → trả cùng đơn; phiên khác → 403 (AC-003-05)', async () => {
    const body = { sessionId: sessionA, items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] };
    const [r1, r2] = await Promise.all([
      A.post('/api/orders', body, { 'Idempotency-Key': 'k-123' }),
      A.post('/api/orders', body, { 'Idempotency-Key': 'k-123' }),
    ]);
    assert.equal(r1.status, 201);
    assert.equal(r1.body.orderId, r2.body.orderId);
    assert.equal((await C.post('/api/orders', body)).status, 403);
    await api.post(`/api/orders/${r1.body.orderId}/cancel`).set(auth(staffToken)).send({ reason: 'test' });
  });

  test('hết nguyên liệu → 409 OUT_OF_STOCK kèm tên món, không tạo đơn (AC-003-02)', async () => {
    await pool.request().query("UPDATE dbo.Ingredients SET StockQty = ReservedQty + 10 WHERE Name = N'Cốt trà đào'");
    const r = await A.post('/api/orders', {
      sessionId: sessionA,
      items: [
        { menuItemId: ids['Trà đào'], quantity: 1 },
        { menuItemId: ids['Cà phê đen'], quantity: 1 },
      ],
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'OUT_OF_STOCK');
    assert.deepEqual(r.body.details.items, [{ menuItemId: ids['Trà đào'], name: 'Trà đào' }]);
    assert.match(r.body.message, /Trà đào vừa hết món/);
    const menu = await A.get('/api/menu');
    const tra = menu.body.categories.flatMap((c) => c.items).find((i) => i.id === ids['Trà đào']);
    assert.equal(tra.isAvailable, false);
    assert.equal(tra.soldOut, true);
    await pool.request().query("UPDATE dbo.Ingredients SET StockQty = 1000 WHERE Name = N'Cốt trà đào'");
  });

  test('tiếp nhận → khách nhận "Đang chuẩn bị"; hoàn tất đồng thời → 1 thành công 1 ALREADY_PROCESSED (AC-004-01, AC-007-02…04)', async () => {
    assert.equal((await api.post(`/api/orders/${order1.orderId}/complete`).set(auth(staffToken))).body.code, 'INVALID_STATE');
    const evtA = waitFor(sockA, 'order.status_changed', (p) => p.status === 'PREPARING');
    const acc = await api.post(`/api/orders/${order1.orderId}/accept`).set(auth(staffToken));
    assert.equal(acc.body.order.status, 'PREPARING');
    await evtA;
    const acc2 = await api.post(`/api/orders/${order1.orderId}/accept`).set(auth(adminToken));
    assert.equal(acc2.status, 409);
    assert.equal(acc2.body.code, 'ALREADY_PROCESSED');
    const done = waitFor(sockA, 'order.status_changed', (p) => p.status === 'COMPLETED');
    const [x, y] = await Promise.all([
      api.post(`/api/orders/${order1.orderId}/complete`).set(auth(staffToken)),
      api.post(`/api/orders/${order1.orderId}/complete`).set(auth(adminToken)),
    ]);
    const statuses = [x.status, y.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const okRes = x.status === 200 ? x : y;
    assert.equal(okRes.body.inventoryDeducted.length, 5);
    assert.equal((x.status === 409 ? x : y).body.message, 'Đơn hàng này đã được nhân viên khác xử lý');
    await done;
  });

  test('gọi thanh toán: phiên khác 403; thành viên → PAYMENT_REQUESTED + POS nhận sự kiện (AC-005-01, 05)', async () => {
    assert.equal((await C.post(`/api/sessions/${sessionA}/request-payment`)).status, 403);
    assert.equal((await C.post(`/api/sessions/${sessionC}/request-payment`)).body.code, 'NO_ORDERS');
    const evt = waitFor(staffSock, 'session.payment_requested', (p) => p.sessionId === sessionA);
    const r = await B.post(`/api/sessions/${sessionA}/request-payment`);
    assert.equal(r.status, 200);
    assert.equal(r.body.amountDue, 93000);
    const p = await evt;
    assert.equal(p.table.code, '01');
    const list = await api.get('/api/sessions?status=PAYMENT_REQUESTED').set(auth(staffToken));
    assert.ok(list.body.some((s) => s.sessionId === sessionA));
  });

  test('gọi thêm món khi đã gọi thanh toán → phiên về OPEN + session.payment_cancelled', async () => {
    const evt = waitFor(staffSock, 'session.payment_cancelled', (p) => p.sessionId === sessionA);
    const r = await A.post('/api/orders', { sessionId: sessionA, items: [{ menuItemId: ids['Bánh croissant'], quantity: 1 }] });
    assert.equal(r.status, 201);
    await evt;
    const s = await A.get(`/api/sessions/${sessionA}`);
    assert.equal(s.body.status, 'OPEN');
    assert.equal(s.body.amountDue, 93000 + 25000);
  });

  test('thu tiền: còn PENDING → 409 kèm orderIds; tiền thiếu 400; thành công → CLOSED, khách nhận settled (AC-006-01, 03)', async () => {
    const pending = (await A.get(`/api/sessions/${sessionA}`)).body.orders.find((o) => o.status === 'PENDING');
    const r1 = await api.post(`/api/sessions/${sessionA}/settle`).set(auth(staffToken)).send({ amountReceived: 200000 });
    assert.equal(r1.status, 409);
    assert.equal(r1.body.code, 'HAS_PENDING_ORDERS');
    assert.deepEqual(r1.body.details.orderIds, [pending.orderId]);
    await api.post(`/api/orders/${pending.orderId}/accept`).set(auth(staffToken));
    assert.equal((await api.post(`/api/sessions/${sessionA}/settle`).set(auth(staffToken)).send({ amountReceived: 1000 })).body.code, 'INSUFFICIENT_AMOUNT');
    assert.equal(
      (await api.post(`/api/sessions/${sessionA}/settle`).set(auth(staffToken)).send({ amountReceived: 200000, expectedAmountDue: 93000 })).body.code,
      'AMOUNT_CHANGED',
    );
    const settled = waitFor(sockA, 'session.settled');
    const r = await api.post(`/api/sessions/${sessionA}/settle`).set(auth(staffToken)).send({ amountReceived: 200000, expectedAmountDue: 118000 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.payment.changeGiven, 82000);
    assert.equal(r.body.session.status, 'CLOSED');
    assert.equal((await settled).amountReceived, 200000);
    const again = await api.post(`/api/sessions/${sessionA}/settle`).set(auth(adminToken)).send({ amountReceived: 200000 });
    assert.equal(again.body.code, 'ALREADY_SETTLED');
    await api.post(`/api/orders/${pending.orderId}/complete`).set(auth(staffToken));
  });

  test('sau khi đóng: khách gửi thêm → SESSION_CLOSED; Gộp vào phiên đã đóng → 409 (AC-001-04, BR-020)', async () => {
    const r = await A.post('/api/orders', { sessionId: sessionA, items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] });
    assert.equal(r.body.code, 'SESSION_CLOSED');
    const D = await customer();
    const j = await D.post(`/api/sessions/${sessionA}/join`, { qrToken: tables['01'] });
    assert.equal(j.status, 409);
    assert.equal(j.body.code, 'SESSION_CLOSED');
    const s = await A.get(`/api/sessions/${sessionA}`);
    assert.equal(s.body.payment.amountReceived, 200000);
  });

  test('hóa đơn: final chỉ khi đã thu; tạm tính in được khi chưa thu (BR-014, AC-006-04)', async () => {
    const fin = await api.get(`/api/sessions/${sessionA}/receipt?mode=final`).set(auth(staffToken));
    assert.equal(fin.status, 200);
    assert.equal(fin.body.lines.length, 3);
    assert.equal(fin.body.payment.changeGiven, 82000);
    assert.equal(fin.body.shop.name.length > 0, true);
    const C2 = await C.post('/api/orders', { sessionId: sessionC, items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] });
    assert.equal(C2.status, 201);
    assert.equal((await api.get(`/api/sessions/${sessionC}/receipt?mode=final`).set(auth(staffToken))).body.code, 'UNPAID');
    const prov = await api.get(`/api/sessions/${sessionC}/receipt?mode=provisional`).set(auth(staffToken));
    assert.equal(prov.body.mode, 'provisional');
    assert.equal(prov.body.amountDue, 10000);
    // Đóng bàn trống: còn đơn → 409; hủy đơn rồi đóng
    assert.equal((await api.post(`/api/sessions/${sessionC}/close`).set(auth(staffToken))).body.code, 'HAS_ORDERS');
    await api.post(`/api/orders/${C2.body.orderId}/cancel`).set(auth(staffToken)).send({});
    assert.equal((await api.post(`/api/sessions/${sessionC}/close`).set(auth(staffToken))).status, 200);
  });
});

describe('Bán mang đi (FEATURE-008)', () => {
  test('thu tiền & tạo đơn PREPARING/PAID, tiền thừa; thiếu tiền 400; hóa đơn đơn (AC-008-01…04)', async () => {
    const bad = await api
      .post('/api/orders/takeaway')
      .set(auth(staffToken))
      .send({ items: [{ menuItemId: ids['Cà phê sữa'], quantity: 1 }], amountReceived: 1000 });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'INSUFFICIENT_AMOUNT');
    const noMoney = await api
      .post('/api/orders/takeaway')
      .set(auth(staffToken))
      .send({ items: [{ menuItemId: ids['Cà phê sữa'], quantity: 1 }] });
    assert.equal(noMoney.status, 400);
    const r = await api
      .post('/api/orders/takeaway')
      .set(auth(staffToken))
      .send({
        items: [
          { menuItemId: ids['Cà phê sữa'], quantity: 1 },
          { menuItemId: ids['Nước suối'], quantity: 1 },
          { menuItemId: ids['Bánh croissant'], quantity: 0 },
        ],
        amountReceived: 50000,
      });
    assert.equal(r.status, 400, 'số lượng 0 bị từ chối');
    const ok = await api
      .post('/api/orders/takeaway')
      .set(auth(staffToken))
      .send({
        items: [
          { menuItemId: ids['Cà phê sữa'], quantity: 1 },
          { menuItemId: ids['Nước suối'], quantity: 1 },
        ],
        amountReceived: 50000,
      });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.order.status, 'PREPARING');
    assert.equal(ok.body.order.paymentStatus, 'PAID');
    assert.equal(ok.body.payment.changeGiven, 11000);
    const rc = await api.get(`/api/orders/${ok.body.order.orderId}/receipt`).set(auth(staffToken));
    assert.equal(rc.body.amountDue, 39000);
    const done = await api.post(`/api/orders/${ok.body.order.orderId}/complete`).set(auth(staffToken));
    assert.equal(done.body.order.status, 'COMPLETED');
  });
});

describe('Quản trị (FEATURE-009…012)', () => {
  test('tài khoản: trùng username (khác hoa thường) 409; khóa → token cũ 403; không tự khóa; mật khẩu là hash (AC-009-02…05)', async () => {
    const c = await api.post('/api/admin/users').set(auth(adminToken)).send({ username: 'staff2', password: '123456', fullName: 'NV 2', role: 'STAFF' });
    assert.equal(c.status, 201);
    const dup = await api.post('/api/admin/users').set(auth(adminToken)).send({ username: 'STAFF2', password: '123456', fullName: 'X', role: 'STAFF' });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.message, 'Tên đăng nhập đã tồn tại, vui lòng chọn tên khác');
    const t2 = await login('staff2', '123456');
    assert.equal((await api.get('/api/orders').set(auth(t2))).status, 200);
    await api.patch(`/api/admin/users/${c.body.userId}/active`).set(auth(adminToken)).send({ isActive: false });
    const locked = await api.get('/api/orders').set(auth(t2));
    assert.equal(locked.status, 403);
    assert.equal(locked.body.code, 'ACCOUNT_LOCKED');
    assert.equal((await api.post('/api/auth/login').send({ username: 'staff2', password: '123456' })).status, 403);
    const self = await api.patch(`/api/admin/users/${ctx.adminId}/active`).set(auth(adminToken)).send({ isActive: false });
    assert.equal(self.body.code, 'CANNOT_LOCK_SELF');
    const hash = (await pool.request().query("SELECT PasswordHash FROM dbo.Users WHERE Username = 'staff2'")).recordset[0].PasswordHash;
    assert.match(hash, /^\$2[aby]\$/);
  });

  test('menu: tạo món → có trên menu khách; tắt "hết món" → realtime tới khách (AC-010-01, 02)', async () => {
    const guest = await connect({});
    const item = await api.post('/api/admin/menu-items').set(auth(adminToken)).send({ categoryId: 1, name: 'Cold brew', price: 35000 });
    assert.equal(item.status, 201);
    const menu = await api.get('/api/menu');
    assert.ok(menu.body.categories.flatMap((c) => c.items).some((i) => i.name === 'Cold brew' && i.isAvailable));
    const evt = waitFor(guest, 'menu.availability_changed', (p) => p.menuItemId === item.body.menuItemId && p.isAvailable === false);
    await api.patch(`/api/admin/menu-items/${item.body.menuItemId}/availability`).set(auth(adminToken)).send({ isAvailable: false });
    await evt;
    assert.equal((await api.post('/api/admin/menu-items').set(auth(adminToken)).send({ categoryId: 1, name: 'X', price: -1 })).status, 400);
  });

  test('bàn + QR: tạo bàn có ảnh QR; tạo lại QR → QR cũ 404 (AC-010-03, 04)', async () => {
    const t = await api.post('/api/admin/tables').set(auth(adminToken)).send({ code: '07' });
    assert.equal(t.status, 201);
    assert.equal(t.body.name, 'Bàn 07');
    assert.ok(t.body.qrUrl.endsWith(`/t/${t.body.qrToken}`));
    const png = await api.get(`/api/admin/tables/${t.body.tableId}/qr.png`).set(auth(adminToken));
    assert.equal(png.headers['content-type'], 'image/png');
    assert.ok(png.body.length > 200);
    const D = await customer();
    assert.equal((await D.post('/api/sessions/scan', { qrToken: t.body.qrToken })).body.state, 'NEW');
    const re = await api.post(`/api/admin/tables/${t.body.tableId}/regenerate-qr`).set(auth(adminToken));
    assert.notEqual(re.body.qrToken, t.body.qrToken);
    assert.equal((await D.post('/api/sessions/scan', { qrToken: t.body.qrToken })).status, 404);
    assert.equal((await api.post('/api/admin/tables').set(auth(adminToken)).send({ code: '07' })).body.code, 'DUPLICATE_CODE');
  });

  test('BOM: -10 hoặc thiếu nguyên liệu → 400 + BOM cũ giữ nguyên; hợp lệ → lưu (AC-011-01, 02)', async () => {
    const id = ids['Cà phê đen'];
    const before = (await api.get(`/api/admin/menu-items/${id}/bom`).set(auth(adminToken))).body.bom;
    const bad = await api
      .put(`/api/admin/menu-items/${id}/bom`)
      .set(auth(adminToken))
      .send([
        { ingredientId: 1, amount: -10 },
        { ingredientId: '', amount: 5 },
      ]);
    assert.equal(bad.status, 400);
    assert.equal(bad.body.message, 'Định lượng không hợp lệ, phải lớn hơn 0');
    assert.deepEqual(bad.body.details.fields.map((f) => f.path).sort(), ['0.amount', '1.ingredientId']);
    assert.deepEqual((await api.get(`/api/admin/menu-items/${id}/bom`).set(auth(adminToken))).body.bom, before);
    const ok = await api
      .put(`/api/admin/menu-items/${id}/bom`)
      .set(auth(adminToken))
      .send(before.map((b) => ({ ingredientId: b.ingredientId, amount: b.amount })));
    assert.equal(ok.status, 200);
    assert.equal(ok.body.bom.length, 2);
  });

  test('kho: điều chỉnh có lý do ghi ADJUST; dưới phần giữ → 409; cảnh báo sắp hết (AC-011-03, 04)', async () => {
    const list = (await api.get('/api/admin/ingredients').set(auth(adminToken))).body;
    const dao = list.find((i) => i.name === 'Đào ngâm');
    const r = await api.post(`/api/admin/ingredients/${dao.ingredientId}/adjust`).set(auth(adminToken)).send({ newQty: 5, reason: 'Kiểm kê' });
    assert.equal(r.status, 200);
    assert.equal(r.body.isLow, true);
    assert.equal((await api.post(`/api/admin/ingredients/${dao.ingredientId}/adjust`).set(auth(adminToken)).send({ newQty: -1, reason: 'x' })).status, 400);
    assert.equal((await api.post(`/api/admin/ingredients/${dao.ingredientId}/adjust`).set(auth(adminToken)).send({ delta: 5 })).status, 400);
    const tx = await api.get(`/api/admin/ingredients/${dao.ingredientId}/transactions`).set(auth(adminToken));
    assert.equal(tx.body.transactions[0].type, 'ADJUST');
    assert.equal(tx.body.transactions[0].reason, 'Kiểm kê');
    const D = await customer();
    const s = (await D.post('/api/sessions/scan', { qrToken: tables['03'] })).body.session.sessionId;
    assert.equal((await D.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Trà đào'], quantity: 2 }] })).status, 201);
    const below = await api.post(`/api/admin/ingredients/${dao.ingredientId}/adjust`).set(auth(adminToken)).send({ newQty: 3, reason: 'x' });
    assert.equal(below.body.code, 'BELOW_RESERVED');
    const rep = await api.get(`/api/admin/reports/revenue?from=2026-10-01&to=2026-10-10`).set(auth(adminToken));
    assert.ok(rep.body.lowStock.some((l) => l.name === 'Đào ngâm'));
  });

  test('báo cáo: khoảng sai/tương lai 400; seed 01–10/10/2026 = 55 đơn, 3.190.000đ; hôm nay cộng tiền vừa thu, không tính đơn hủy/chưa thu (AC-012-01…03, AC-006-06)', async () => {
    assert.equal((await api.get('/api/admin/reports/revenue?from=2026-10-10&to=2026-10-01').set(auth(adminToken))).body.code, 'INVALID_RANGE');
    assert.equal((await api.get('/api/admin/reports/revenue?from=2099-12-01&to=2099-12-10').set(auth(adminToken))).body.code, 'INVALID_RANGE');
    assert.equal((await api.get('/api/admin/reports/revenue?from=2026-10-01').set(auth(adminToken))).status, 400);
    const r = await api.get('/api/admin/reports/revenue?from=2026-10-01&to=2026-10-10').set(auth(adminToken));
    assert.equal(r.body.orderCount, 55);
    assert.equal(r.body.totalRevenue, 3190000);
    assert.equal(r.body.byDay.length, 10);
    assert.deepEqual(r.body.byDay[4], { date: '2026-10-05', revenue: 5 * 58000, orders: 5 });
    assert.equal(r.body.topItems[0].name, 'Cà phê sữa');
    const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const t = await api.get(`/api/admin/reports/revenue?from=${today}&to=${today}`).set(auth(adminToken));
    // Hôm nay: phiên bàn 01 (118.000) + mang đi (39.000); đơn hủy và đơn chưa thu không tính
    assert.equal(t.body.totalRevenue, 118000 + 39000);
    assert.equal(t.body.byHour.length > 0, true);
    const hist = await api.get(`/api/admin/orders?from=${today}&to=${today}&status=CANCELLED`).set(auth(adminToken));
    assert.ok(hist.body.total >= 2);
    const pays = await api.get(`/api/admin/payments?from=${today}&to=${today}`).set(auth(adminToken));
    assert.equal(pays.body.length, 2);
  });
});

describe('Bất biến cuối cùng', () => {
  test('không vi phạm bất biến kho / thu tiền', async () => {
    assert.deepEqual(await inventoryViolations(pool), []);
  });
});
