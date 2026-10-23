// Integration test (SQL Server thật) F-049 — chuyển bàn: cả nhóm (phiên) sang bàn trống hoặc bàn có nhóm khác, bill riêng (ADR-010 D-43).
// Bất biến thêm (helpers/testDb.js): ORDER_TABLE_MISMATCH — đơn của phiên luôn ở đúng bàn hiện tại của phiên.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let flushAudit;
let app, api, pool, admin, staff, ids, tables, staffSock;

const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const move = (sessionId, toCode, token = staff) => call(token, 'post', `/api/sessions/${sessionId}/move`, { toTableId: tables[toCode].TableId });
const orderTables = async (sessionId) =>
  (await q1(`SELECT t.Code FROM dbo.Orders o JOIN dbo.Tables t ON t.TableId = o.TableId WHERE o.SessionId = '${sessionId}' ORDER BY o.OrderId`)).map(
    (x) => x.Code,
  );
const overview = async (code) => (await call(staff, 'get', '/api/tables')).body.find((t) => t.code === code);

/** Khách quét QR bàn, gửi đơn. */
async function guest(code, items = [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]) {
  const C = await app.customer();
  const s = await app.seat(C, code);
  const o = await C.post('/api/orders', { sessionId: s, items });
  assert.equal(o.status, 201, JSON.stringify(o.body));
  return { C, s, order: o.body };
}

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  ({ flushAudit } = await import('../src/middleware/audit.js'));
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  tables = Object.fromEntries((await q1('SELECT TableId, Code, Name, QrToken FROM dbo.Tables')).map((t) => [t.Code, t]));
  assert.equal((await call(staff, 'post', '/api/shifts/open', { openingCash: 0 })).status, 201);
  staffSock = await app.connect({ auth: { token: staff } });
});

after(() => app.close());

describe('Chuyển bàn (F-049)', () => {
  test('AC-049-01: nhóm Bàn 01 (1 đơn chờ, 1 đơn đang pha) chuyển sang Bàn 05 trống → phiên + mọi đơn ở Bàn 05, Bàn 01 trống, quầy + điện thoại nhận sự kiện, có lịch sử + nhật ký', async () => {
    const { C, s, order } = await guest('01');
    assert.equal((await call(staff, 'post', `/api/orders/${order.orderId}/accept`)).status, 200);
    assert.equal((await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Cà phê đen'], quantity: 2 }] })).status, 201);
    const cSock = await app.connect({ auth: { sessionId: s }, extraHeaders: { cookie: C.cookie } });
    const toStaff = app.waitFor(staffSock, 'session.table_changed', (p) => p.sessionId === s);
    const toGuest = app.waitFor(cSock, 'session.table_changed', (p) => p.sessionId === s);

    const r = await move(s, '05');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.session.table.code, '05');
    assert.deepEqual([r.body.fromTable.code, r.body.toTable.code], ['01', '05']);
    assert.deepEqual(await orderTables(s), ['05', '05']);
    const evStaff = await toStaff;
    const evGuest = await toGuest;
    assert.deepEqual([evStaff.fromTable.name, evStaff.toTable.name], ['Bàn 01', 'Bàn 05']);
    assert.equal(evStaff.toTable.qrToken, undefined, 'quầy không nhận mã QR');
    assert.equal(evGuest.toTable.qrToken, tables['05'].QrToken, 'điện thoại trong nhóm nhận mã QR bàn mới');

    assert.equal((await overview('01')).sessions.length, 0);
    assert.deepEqual(
      (await overview('05')).sessions.map((x) => x.sessionId),
      [s],
    );
    assert.equal((await overview('05')).sessions[0].lastMove.fromTable, 'Bàn 01');
    const scan01 = await (await app.customer()).post('/api/sessions/scan', { qrToken: tables['01'].QrToken });
    assert.equal(scan01.body.state, 'NEW', 'Bàn 01 trống lại');
    assert.equal((await call(staff, 'post', `/api/sessions/${scan01.body.session.sessionId}/close`)).status, 200); // dọn nhóm trống vừa quét
    const view = await C.get(`/api/sessions/${s}`);
    assert.deepEqual([view.body.table.code, view.body.table.qrToken], ['05', tables['05'].QrToken]);
    const more = await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Cà phê đen'], quantity: 1 }] });
    assert.equal(more.status, 201);
    assert.deepEqual(await orderTables(s), ['05', '05', '05']);

    const [mv] = await q1(`SELECT COUNT(*) AS n FROM dbo.SessionTableMoves WHERE SessionId = '${s}' AND FromTableId = ${tables['01'].TableId}`);
    assert.equal(mv.n, 1);
    await flushAudit();
    const [log] = await q1(`SELECT COUNT(*) AS n FROM dbo.AuditLogs WHERE Action = 'session.move' AND EntityId = '${s}'`);
    assert.equal(log.n, 1);
    // dọn: hủy bàn (có đơn đang pha → quản lý làm, F-046) để Bàn 05 trống cho test sau
    assert.equal((await call(admin, 'post', `/api/sessions/${s}/cancel`, { reason: 'dọn test', stockMode: 'WASTE' })).status, 200);
    // Phiên đã đóng → người từng vào nhóm không còn nhận mã QR bàn (review G3)
    assert.equal((await C.get(`/api/sessions/${s}`)).body.table.qrToken, undefined);
  });

  test('AC-049-02: chuyển sang bàn đang có nhóm khác → 2 phiên song song, bill riêng: thu nhóm chuyển sang chỉ tính đơn của nhóm đó, nhóm kia không đổi', async () => {
    const A = await guest('02', [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    const B = await guest('03', [{ menuItemId: ids['Cà phê đen'], quantity: 2 }]);
    assert.equal((await move(B.s, '02')).status, 200);
    assert.deepEqual((await overview('02')).sessions.map((x) => x.sessionId).sort(), [A.s, B.s].sort());
    assert.equal((await overview('03')).sessions.length, 0);
    assert.equal((await call(staff, 'post', `/api/orders/${B.order.orderId}/accept`)).status, 200);
    const dueB = (await call(staff, 'get', `/api/sessions/${B.s}`)).body.amountDue;
    const pay = await call(staff, 'post', `/api/sessions/${B.s}/settle`, { amountReceived: 500000 });
    assert.equal(pay.status, 200, JSON.stringify(pay.body));
    assert.equal(pay.body.amountDue, dueB);
    assert.equal(pay.body.amountDue, 2 * 25000, 'chỉ 2 ly của nhóm chuyển sang (Cà phê đen 25.000đ)');
    const a = (await call(staff, 'get', `/api/sessions/${A.s}`)).body;
    assert.deepEqual([a.status, a.table.code, a.orders.length, a.orders[0].paymentStatus], ['OPEN', '02', 1, 'UNPAID']);
    assert.equal((await call(staff, 'post', `/api/sessions/${A.s}/cancel`, { reason: 'dọn test', stockMode: 'WASTE' })).status, 200);
  });

  test('AC-049-03: phiên đã chia bill, gắn hội viên, đang gọi thanh toán → chuyển bàn giữ nguyên phần chia, hội viên, trạng thái; thu từng phần bình thường', async () => {
    const { C, s, order } = await guest('04', [{ menuItemId: ids['Cà phê đen'], quantity: 2 }]);
    assert.equal((await call(staff, 'post', `/api/orders/${order.orderId}/accept`)).status, 200);
    const reg = await call(staff, 'post', '/api/members', { phone: '0900000049', fullName: 'Khách Chuyển Bàn', consent: true });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    assert.equal((await call(staff, 'post', `/api/sessions/${s}/member`, { memberId: reg.body.memberId })).status, 200);
    const sp = await C.post(`/api/sessions/${s}/splits`, { label: 'Tôi' });
    assert.ok([200, 201].includes(sp.status), JSON.stringify(sp.body));
    assert.equal((await C.post(`/api/sessions/${s}/request-payment`)).status, 200);

    assert.equal((await move(s, '06')).status, 200);
    const after = (await call(staff, 'get', `/api/sessions/${s}`)).body;
    assert.deepEqual([after.table.code, after.status, after.member?.memberId, after.splitCount], ['06', 'PAYMENT_REQUESTED', reg.body.memberId, 1]);
    const whole = await call(staff, 'post', `/api/sessions/${s}/settle`, { amountReceived: 500000 });
    assert.deepEqual([whole.status, whole.body.code], [409, 'SESSION_HAS_SPLITS']); // đã chia bill (giữ nguyên sau khi chuyển): thu theo phần hoặc "Thu chung"
    // Thu từng phần sau khi chuyển: món của nhóm vào phần "Tôi" → thu phần đó → phiên đóng
    const [line] = await q1(`SELECT OrderItemId FROM dbo.OrderItems WHERE OrderId = ${order.orderId} AND ParentOrderItemId IS NULL`);
    assert.equal((await call(staff, 'put', `/api/sessions/${s}/items/${line.OrderItemId}/split`, { splitId: sp.body.splitId })).status, 200);
    const part = await call(staff, 'post', `/api/splits/${sp.body.splitId}/settle`, { amountReceived: 500000 });
    assert.equal(part.status, 200, JSON.stringify(part.body));
    const done = (await call(staff, 'get', `/api/sessions/${s}`)).body;
    assert.deepEqual([done.status, done.table.code], ['CLOSED', '06']);
  });

  test('AC-049-04: cùng bàn → 400 SAME_TABLE; bàn đã tắt → 409 TABLE_INACTIVE; bàn không có → 404; phiên đã đóng → 409 SESSION_CLOSED; khách / không token → 401 — không đổi gì', async () => {
    const { C, s } = await guest('01');
    const same = await move(s, '01');
    assert.deepEqual([same.status, same.body.code], [400, 'SAME_TABLE']);
    const t = await call(admin, 'post', '/api/admin/tables', { code: '49', name: 'Bàn 49' });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    assert.equal((await call(admin, 'put', `/api/admin/tables/${t.body.tableId}`, { code: '49', name: 'Bàn 49', isActive: false })).status, 200);
    const off = await call(staff, 'post', `/api/sessions/${s}/move`, { toTableId: t.body.tableId });
    assert.deepEqual([off.status, off.body.code], [409, 'TABLE_INACTIVE']);
    const none = await call(staff, 'post', `/api/sessions/${s}/move`, { toTableId: 999999 });
    assert.deepEqual([none.status, none.body.code], [404, 'TABLE_NOT_FOUND']);
    const ghost = await call(staff, 'post', '/api/sessions/00000000-0000-0000-0000-000000000049/move', { toTableId: tables['02'].TableId });
    assert.equal(ghost.status, 404);
    // Máy quầy đang thấy nhóm ở bàn khác (đã bị máy khác chuyển) → 409, không chuyển nhầm (review G3)
    const stale = await call(staff, 'post', `/api/sessions/${s}/move`, { toTableId: tables['02'].TableId, fromTableId: tables['03'].TableId });
    assert.deepEqual([stale.status, stale.body.code], [409, 'SESSION_MOVED']);
    assert.equal((await api.post(`/api/sessions/${s}/move`).send({ toTableId: tables['02'].TableId })).status, 401);
    assert.equal((await C.post(`/api/sessions/${s}/move`, { toTableId: tables['02'].TableId })).status, 401);
    assert.equal((await call(staff, 'get', `/api/sessions/${s}`)).body.table.code, '01');

    const [ord] = (await C.get(`/api/sessions/${s}`)).body.orders;
    assert.equal((await call(staff, 'post', `/api/orders/${ord.orderId}/accept`)).status, 200);
    assert.equal((await call(staff, 'post', `/api/sessions/${s}/settle`, { amountReceived: 500000 })).status, 200);
    const closed = await move(s, '02');
    assert.deepEqual([closed.status, closed.body.code], [409, 'SESSION_CLOSED']);
    const [mv] = await q1(`SELECT COUNT(*) AS n FROM dbo.SessionTableMoves WHERE SessionId = '${s}'`);
    assert.equal(mv.n, 0);
  });

  test('AC-049-04 (review G3): bàn từng là bàn cũ / mới và tài khoản chỉ từng chuyển bàn (quản lý — không chấm công) → xóa mềm, không lỗi; nhóm chưa từng chuyển / đã đóng không nhận mã QR, kể cả sau "Tạo lại QR"', async () => {
    const t = await call(admin, 'post', '/api/admin/tables', { code: 'CB10', name: 'Bàn CB10' });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    const C = await app.customer();
    const sc = await C.post('/api/sessions/scan', { qrToken: t.body.qrToken });
    const s = sc.body.session.sessionId;
    assert.equal((await C.get(`/api/sessions/${s}`)).body.table.qrToken, undefined, 'nhóm chưa từng chuyển bàn: không gửi mã QR');
    const u = await call(admin, 'post', '/api/admin/users', { username: 'mover1', password: 'Pass@123', fullName: 'QL chuyển bàn', role: 'ADMIN' });
    assert.equal(u.status, 201, JSON.stringify(u.body));
    const mover = await app.login('mover1', 'Pass@123');
    assert.equal((await move(s, '03', mover)).status, 200);
    assert.equal((await call(staff, 'post', `/api/sessions/${s}/close`)).status, 200);
    // Quán "Tạo lại QR" bàn 03: người từng vào nhóm (phiên đã đóng) không lấy được mã mới
    assert.equal((await call(admin, 'post', `/api/admin/tables/${tables['03'].TableId}/regenerate-qr`)).status, 200);
    assert.equal((await C.get(`/api/sessions/${s}`)).body.table.qrToken, undefined);

    const delTable = await call(admin, 'delete', `/api/admin/tables/${t.body.tableId}`);
    assert.deepEqual([delTable.status, delTable.body.result], [200, 'ARCHIVED']);
    const delUser = await call(admin, 'delete', `/api/admin/users/${u.body.userId}`);
    assert.deepEqual([delUser.status, delUser.body.result], [200, 'ARCHIVED'], JSON.stringify(delUser.body)); // quản lý không tự chấm công → dấu vết duy nhất là lần chuyển bàn
    assert.equal((await q1(`SELECT COUNT(*) AS n FROM dbo.SessionTableMoves WHERE SessionId = '${s}'`))[0].n, 1, 'lịch sử chuyển bàn còn nguyên');
  });
});
