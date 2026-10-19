// Integration test (SQL Server thật): F-024 Nhân viên mở bàn / gọi món giúp khách tại bàn + ghi chú bàn.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, sleep } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, staffSock;

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  assert.equal((await api.post('/api/shifts/open').set(auth(staff)).send({ openingCash: 0 })).status, 201);
  staffSock = await app.connect({ auth: { token: staff } });
});

after(() => app.close());

const tableId = async (code) => (await pool.request().query(`SELECT TableId FROM dbo.Tables WHERE Code = '${code}'`)).recordset[0].TableId;
const qrOf = async (code) => (await pool.request().query(`SELECT QrToken FROM dbo.Tables WHERE Code = '${code}'`)).recordset[0].QrToken;
const reserved = async (name) => (await pool.request().query(`SELECT ReservedQty FROM dbo.Ingredients WHERE Name = N'${name}'`)).recordset[0].ReservedQty;
const openTable = (code, body = {}, token = staff) => tableId(code).then((id) => api.post(`/api/tables/${id}/sessions`).set(auth(token)).send(body));
const staffOrder = (sessionId, items, headers = {}) => api.post(`/api/sessions/${sessionId}/orders`).set(auth(staff)).set(headers).send({ items });
const NOTE_KEYS = ['note', 'noteUpdatedAt', 'noteUpdatedBy', 'openedBy'];

describe('Mở bàn + gọi món tại bàn (F-024)', () => {
  let s1;

  test('AC-024-01: nhân viên mở bàn trống kèm ghi chú → phiên do nhân viên mở; quầy thấy ghi chú, sơ đồ bàn có phiên', async () => {
    const opened = app.waitFor(staffSock, 'session.opened');
    const r = await openTable('01', { note: 'Chờ thêm 2 người' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    s1 = r.body.session;
    assert.equal(s1.status, 'OPEN');
    assert.equal(s1.note, 'Chờ thêm 2 người');
    assert.equal(s1.openedBy.fullName, 'Nhân viên quầy 1');
    assert.equal(s1.noteUpdatedBy, 'Nhân viên quầy 1');
    assert.equal((await opened).sessionId, s1.sessionId);

    const tables = (await api.get('/api/tables').set(auth(staff))).body;
    assert.equal(tables.length, 6);
    assert.ok(
      tables.every((t) => t.qrToken === undefined),
      'không trả mã QR',
    );
    const t01 = tables.find((t) => t.code === '01');
    assert.deepEqual(
      t01.sessions.map((s) => [s.sessionId, s.note]),
      [[s1.sessionId, 'Chờ thêm 2 người']],
    );
    const list = (await api.get('/api/sessions').set(auth(staff))).body;
    assert.equal(list.find((s) => s.sessionId === s1.sessionId).note, 'Chờ thêm 2 người');
  });

  test('AC-024-02: nhân viên gửi đơn vào phiên → vào thẳng Đang pha, ghi người nhập, giữ kho; quầy nhận order.created', async () => {
    const before = await reserved('Cà phê cốt');
    const created = app.waitFor(staffSock, 'order.created', (p) => p.order.sessionId === s1.sessionId);
    const r = await staffOrder(s1.sessionId, [
      { menuItemId: ids['Cà phê sữa'], quantity: 2, note: 'ít đá' },
      { menuItemId: ids['Nước suối'], quantity: 1 },
    ]);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const o = r.body.order;
    assert.equal(o.type, 'DINE_IN');
    assert.equal(o.status, 'PREPARING');
    assert.ok(o.acceptedAt);
    assert.equal(o.paymentStatus, 'UNPAID');
    assert.equal(o.createdBy.fullName, 'Nhân viên quầy 1');
    assert.equal(o.table.code, '01');
    assert.equal(o.totalAmount, 2 * 29000 + 10000);
    assert.equal(o.items[0].note, 'ít đá');
    assert.ok((await reserved('Cà phê cốt')) > before, 'giữ nguyên liệu như đơn QR (ADR-001)');
    assert.equal((await created).order.status, 'PREPARING');
    const s = (await api.get(`/api/sessions/${s1.sessionId}`).set(auth(staff))).body;
    assert.equal(s.orderCount, 1);
    assert.equal(s.amountDue, 68000);
  });

  test('AC-024-03: khách quét QR bàn nhân viên đã mở → thấy nhóm đang mở, gộp được; khách KHÔNG thấy ghi chú bàn', async () => {
    const C = await app.customer();
    const qr = await qrOf('01');
    const scan = await C.post('/api/sessions/scan', { qrToken: qr });
    assert.equal(scan.body.state, 'OCCUPIED');
    assert.equal(scan.body.openSessions[0].itemCount, 3);
    const join = await C.post(`/api/sessions/${s1.sessionId}/join`, { qrToken: qr });
    assert.equal(join.status, 200);
    for (const k of NOTE_KEYS) assert.equal(join.body.session[k], undefined, `join lộ ${k}`);
    const detail = await C.get(`/api/sessions/${s1.sessionId}`);
    for (const k of NOTE_KEYS) assert.equal(detail.body[k], undefined, `chi tiết phiên lộ ${k}`);
    assert.equal(detail.body.orders.length, 1, 'khách thấy đơn nhân viên đã nhập');
    const again = await C.post('/api/sessions/scan', { qrToken: qr });
    assert.equal(again.body.state, 'MEMBER');
    for (const k of NOTE_KEYS) assert.equal(again.body.session[k], undefined, `quét lại lộ ${k}`);
    // Khách gọi thêm qua QR vẫn như cũ (chờ tiếp nhận)
    const own = await C.post('/api/orders', { sessionId: s1.sessionId, items: [{ menuItemId: ids['Cà phê đen'], quantity: 1 }] });
    assert.equal(own.status, 201);
    assert.equal(own.body.status, 'PENDING');
  });

  test('AC-024-04: bàn đang có nhóm → TABLE_OCCUPIED kèm danh sách; chọn "Nhóm mới" → mở nhóm thứ 2', async () => {
    const busy = await openTable('01');
    assert.equal(busy.status, 409);
    assert.equal(busy.body.code, 'TABLE_OCCUPIED');
    assert.deepEqual(
      busy.body.details.sessions.map((s) => s.sessionId),
      [s1.sessionId],
    );
    const g2 = await openTable('01', { newGroup: true });
    assert.equal(g2.status, 201);
    assert.equal(g2.body.session.note, null);
    const t01 = (await api.get('/api/tables').set(auth(staff))).body.find((t) => t.code === '01');
    assert.equal(t01.sessions.length, 2);
    // Nhóm trống → đóng bàn trống như phiên khách
    assert.equal((await api.post(`/api/sessions/${g2.body.session.sessionId}/close`).set(auth(staff))).status, 200);
  });

  test('AC-024-05: hai máy quầy cùng mở một bàn trống → chỉ 1 phiên được tạo', async () => {
    const [a, b] = await Promise.all([openTable('02'), openTable('02', {}, admin)]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    const n = (await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.Sessions WHERE TableId = ${await tableId('02')} AND Status <> 'CLOSED'`)).recordset[0]
      .n;
    assert.equal(n, 1);
  });

  test('AC-024-06: tạm ngưng nhận đơn QR → khách bị chặn nhưng nhân viên vẫn nhập đơn tại bàn', async () => {
    const C = await app.customer();
    const sc = await app.seat(C, '03');
    await api.put('/api/store').set(auth(staff)).send({ acceptingOrders: false });
    try {
      const own = await C.post('/api/orders', { sessionId: sc, items: [{ menuItemId: ids['Cà phê đen'], quantity: 1 }] });
      assert.equal(own.status, 503);
      assert.equal(own.body.code, 'STORE_CLOSED');
      const r = await staffOrder(sc, [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
      assert.equal(r.status, 201, JSON.stringify(r.body));
    } finally {
      await api.put('/api/store').set(auth(staff)).send({ acceptingOrders: true });
    }
  });

  test('chống bấm 2 lần: cùng Idempotency-Key → 1 đơn', async () => {
    const s = (await openTable('04')).body.session;
    const key = { 'Idempotency-Key': 'tap-1' };
    const [a, b] = await Promise.all([
      staffOrder(s.sessionId, [{ menuItemId: ids['Nước suối'], quantity: 1 }], key),
      staffOrder(s.sessionId, [{ menuItemId: ids['Nước suối'], quantity: 1 }], key),
    ]);
    assert.equal(a.status, 201);
    assert.equal(a.body.order.orderId, b.body.order.orderId);
    assert.equal((await api.get(`/api/sessions/${s.sessionId}`).set(auth(staff))).body.orderCount, 1);
  });

  test('gọi thêm sau khi bàn đã gọi thanh toán → phiên về Đang phục vụ; đã thu tiền → SESSION_CLOSED', async () => {
    const C = await app.customer();
    const s = await app.seat(C, '05');
    const first = await staffOrder(s, [{ menuItemId: ids['Nước suối'], quantity: 1 }]);
    assert.equal(first.status, 201);
    assert.equal((await C.post(`/api/sessions/${s}/request-payment`)).status, 200);
    const cancelled = app.waitFor(staffSock, 'session.payment_cancelled', (p) => p.sessionId === s);
    assert.equal((await staffOrder(s, [{ menuItemId: ids['Bánh croissant'], quantity: 1 }])).status, 201);
    await cancelled;
    const detail = (await api.get(`/api/sessions/${s}`).set(auth(staff))).body;
    assert.equal(detail.status, 'OPEN');
    const settle = await api.post(`/api/sessions/${s}/settle`).set(auth(staff)).send({ amountReceived: detail.bill.amountDue });
    assert.equal(settle.status, 200, JSON.stringify(settle.body));
    const late = await staffOrder(s, [{ menuItemId: ids['Nước suối'], quantity: 1 }]);
    assert.equal(late.status, 409);
    assert.equal(late.body.code, 'SESSION_CLOSED');
    const note = await api.put(`/api/sessions/${s}/note`).set(auth(staff)).send({ note: 'x' });
    assert.equal(note.status, 409);
  });

  test('kiểm tra đầu vào: bàn không tồn tại / đã tắt → 404; khách (không đăng nhập) → 401; giỏ trống → 400', async () => {
    assert.equal((await api.post('/api/tables/99999/sessions').set(auth(staff)).send({})).status, 404);
    const t06 = await tableId('06');
    await pool.request().query(`UPDATE dbo.Tables SET IsActive = 0 WHERE TableId = ${t06}`);
    const off = await api.post(`/api/tables/${t06}/sessions`).set(auth(staff)).send({});
    assert.equal(off.status, 404);
    assert.equal(off.body.code, 'TABLE_NOT_FOUND');
    assert.ok(!(await api.get('/api/tables').set(auth(staff))).body.some((t) => t.code === '06'), 'bàn tắt không hiện');
    await pool.request().query(`UPDATE dbo.Tables SET IsActive = 1 WHERE TableId = ${t06}`);
    const C = await app.customer();
    assert.equal((await C.post(`/api/tables/${t06}/sessions`, {})).status, 401);
    assert.equal((await C.post(`/api/sessions/${s1.sessionId}/orders`, { items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] })).status, 401);
    assert.equal((await staffOrder(s1.sessionId, [])).status, 400);
    assert.equal(
      (
        await api
          .put(`/api/sessions/${s1.sessionId}/note`)
          .set(auth(staff))
          .send({ note: 'x'.repeat(201) })
      ).status,
      400,
    );
  });
});

describe('Ghi chú bàn (F-024)', () => {
  test('AC-024-07: sửa ghi chú → các máy quầy nhận session.note_changed; khách trong phiên KHÔNG nhận; xóa ghi chú → null', async () => {
    const C = await app.customer();
    const s = await app.seat(C, '03');
    const custSock = await app.connect({ auth: { sessionId: s }, extraHeaders: { cookie: C.cookie } });
    let leaked = false;
    custSock.on('session.note_changed', () => (leaked = true));
    const evt = app.waitFor(staffSock, 'session.note_changed', (p) => p.sessionId === s);
    const r = await api.put(`/api/sessions/${s}/note`).set(auth(staff)).send({ note: '  Khách quen — ít ngọt  ' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.session.note, 'Khách quen — ít ngọt');
    assert.equal(r.body.session.noteUpdatedBy, 'Nhân viên quầy 1');
    assert.equal(r.body.session.openedBy, null, 'phiên do khách quét QR mở');
    const p = await evt;
    assert.equal(p.note, 'Khách quen — ít ngọt');
    assert.equal(p.table.code, '03');
    const cleared = await api.put(`/api/sessions/${s}/note`).set(auth(admin)).send({ note: '' });
    assert.equal(cleared.body.session.note, null);
    assert.equal(cleared.body.session.noteUpdatedBy, 'Quản lý');
    await sleep(200);
    assert.equal(leaked, false, 'ghi chú bàn không được gửi tới điện thoại khách');
    const mine = await C.get(`/api/sessions/${s}`);
    for (const k of NOTE_KEYS) assert.equal(mine.body[k], undefined);
  });

  test('phiên không tồn tại → 404', async () => {
    const r = await api.put('/api/sessions/00000000-0000-0000-0000-000000000000/note').set(auth(staff)).send({ note: 'x' });
    assert.equal(r.status, 404);
  });
});
