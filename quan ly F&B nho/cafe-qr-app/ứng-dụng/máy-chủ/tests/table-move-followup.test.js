// Integration test (SQL Server thật) F-087 — hoàn thiện đổi bàn (ADR-048 D-211…D-213): đơn đang làm khi nhóm đổi bàn mang
// "đổi từ bàn nào" (máy quầy hiện nhãn + in phiếu bàn mới), chủ quán chọn thời gian tự trả bàn trống (Tắt / 15 / 30 / 60 phút),
// yêu cầu "xin chuyển bàn" cho biết bàn đích đang có bao nhiêu nhóm khác.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, tables, staffSock;

const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const scan = (C, code) => C.post('/api/sessions/scan', { qrToken: tables[code].QrToken });
const orderById = async (id) => (await call(staff, 'get', '/api/orders')).body.find((o) => o.orderId === id);
const move = async (s, code) => {
  const r = await call(staff, 'post', `/api/sessions/${s}/move`, { toTableId: tables[code].TableId });
  assert.equal(r.status, 200, JSON.stringify(r.body));
};
/** Lùi giờ đặt đơn / giờ chuyển bàn (giờ lưu tới giây — tránh hai việc rơi cùng một giây trong test). */
const backdate = (s, orderIds, minutes) =>
  pool.request().query(
    `UPDATE dbo.Orders SET CreatedAt = DATEADD(MINUTE, -${minutes + 1}, CreatedAt) WHERE OrderId IN (${orderIds.join(',')});
       UPDATE dbo.SessionTableMoves SET MovedAt = DATEADD(MINUTE, -${minutes}, MovedAt) WHERE SessionId = '${s}';`,
  );
const age = (s, min) =>
  pool
    .request()
    .query(
      `UPDATE dbo.Sessions SET OpenedAt = DATEADD(MINUTE, -${min}, SYSUTCDATETIME()) WHERE SessionId = '${s}'; UPDATE dbo.SessionClients SET JoinedAt = DATEADD(MINUTE, -${min}, SYSUTCDATETIME()) WHERE SessionId = '${s}';`,
    );
const status = async (s) => (await q1(`SELECT Status, CloseReason FROM dbo.Sessions WHERE SessionId = '${s}'`))[0];
const runIdleJob = async () => {
  const r = await call(admin, 'post', '/api/admin/jobs/close-idle-tables/run');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, 'OK', JSON.stringify(r.body));
  return r.body.info;
};

async function table(code) {
  const r = await call(admin, 'post', '/api/admin/tables', { code, name: `Bàn ${code}` });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  tables[code] = { TableId: r.body.tableId, Code: code, Name: `Bàn ${code}`, QrToken: r.body.qrToken };
}

async function sit(code, { order = false } = {}) {
  const C = await app.customer();
  const r = await scan(C, code);
  assert.equal(r.body.state, 'NEW', JSON.stringify(r.body));
  const s = r.body.session.sessionId;
  let o = null;
  if (order) o = await place(C, s);
  return { C, s, order: o };
}

async function place(C, s) {
  const o = await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Cà phê đen'], quantity: 1 }] });
  assert.equal(o.status, 201, JSON.stringify(o.body));
  return o.body.order;
}

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  tables = {};
  for (const c of ['F1', 'F2', 'F3', 'G1', 'G2', 'G3', 'H1', 'H2', 'H3']) await table(c);
  assert.equal((await call(staff, 'post', '/api/shifts/open', { openingCash: 0 })).status, 201);
  staffSock = await app.connect({ auth: { token: staff } });
});

after(() => app.close());

describe('Hoàn thiện đổi bàn (F-087)', () => {
  test('AC-087-01: đơn đặt ở Bàn F1 (đang pha) rồi nhóm chuyển sang Bàn F2 → danh sách đơn + chi tiết đơn + sự kiện đơn có tableMove (đổi từ Bàn F1, lúc chuyển), bàn hiện Bàn F2; đơn đặt sau khi chuyển → không có; chuyển tiếp F2 → F3 → vẫn "đổi từ Bàn F1" (bàn lúc đặt), giờ là lần chuyển cuối; quay về đúng bàn lúc đặt → hết nhãn', async () => {
    const { C, s, order: o1 } = await sit('F1', { order: true });
    assert.equal(o1.tableMove, null, 'đơn mới chưa đổi bàn');
    assert.equal((await call(staff, 'post', `/api/orders/${o1.orderId}/accept`)).status, 200);
    const changed = app.waitFor(staffSock, 'session.table_changed', (p) => p.sessionId === s);
    await move(s, 'F2');
    await changed;
    let a = await orderById(o1.orderId);
    assert.equal(a.status, 'PREPARING');
    assert.equal(a.table.name, 'Bàn F2');
    assert.equal(a.tableMove.fromTable, 'Bàn F1');
    assert.equal(a.tableMove.fromTableId, tables.F1.TableId);
    assert.ok(Math.abs(Date.now() - new Date(a.tableMove.movedAt).getTime()) < 120_000, 'lúc chuyển là vừa xong');
    const detail = await call(staff, 'get', `/api/orders/${o1.orderId}`);
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.tableMove, a.tableMove, 'chi tiết đơn (trang in phiếu) cùng dữ liệu');

    // Đơn gửi SAU khi chuyển (đặt ngay ở Bàn F2) → không gắn nhãn
    await backdate(s, [o1.orderId], 3);
    const o2 = await place(C, s);
    assert.equal(o2.tableMove, null);
    assert.equal((await orderById(o2.orderId)).tableMove, null);
    const before2 = (await orderById(o1.orderId)).tableMove.movedAt;

    // Chuyển tiếp F2 → F3: đơn 1 vẫn "đổi từ Bàn F1" (bàn lúc đặt), giờ chuyển = lần cuối; đơn 2 "đổi từ Bàn F2"; sự kiện đơn có tableMove
    await move(s, 'F3');
    a = await orderById(o1.orderId);
    assert.equal(a.table.name, 'Bàn F3');
    assert.equal(a.tableMove.fromTable, 'Bàn F1');
    assert.ok(new Date(a.tableMove.movedAt) > new Date(before2), 'tính 10 phút từ lần chuyển cuối');
    assert.equal((await orderById(o2.orderId)).tableMove.fromTable, 'Bàn F2');
    const ev = app.waitFor(staffSock, 'order.status_changed', (p) => p.order?.orderId === o1.orderId || p.orderId === o1.orderId);
    assert.equal((await call(staff, 'post', `/api/orders/${o1.orderId}/complete`)).status, 200);
    const evBody = await ev;
    assert.equal((evBody.order ?? evBody).tableMove?.fromTable, 'Bàn F1', 'sự kiện realtime giữ thông tin đổi bàn');

    // Quay về Bàn F2 (bàn lúc đặt đơn 2) → đơn 2 hết nhãn; đơn 1 (đặt ở F1) vẫn còn
    await backdate(s, [o1.orderId, o2.orderId], 2);
    await move(s, 'F2');
    assert.equal((await orderById(o2.orderId)).tableMove, null, 'về đúng bàn lúc đặt → không còn là đổi bàn');
    assert.equal((await orderById(o1.orderId)).tableMove.fromTable, 'Bàn F1');
  });

  test('AC-087-02: chủ quán chọn thời gian tự trả bàn trống — mặc định 30 phút; chỉ nhận Tắt / 15 / 30 / 60; Tắt → job không đóng; 60 → nhóm trống 31 phút còn, 61 phút đóng; 15 → 16 phút đóng, 14 phút còn; quản lý cửa hàng không đổi được', async () => {
    const get = await call(admin, 'get', '/api/admin/settings');
    assert.equal(get.body.idleCloseMinutes, 30, 'mặc định 30 phút');
    for (const bad of [45, -1, 'abc'])
      assert.equal((await call(admin, 'put', '/api/admin/settings', { idleCloseMinutes: bad })).status, 400, `giá trị ${bad} bị từ chối`);
    // Quản lý cửa hàng không đổi được (chủ quán chọn)
    assert.equal(
      (await call(admin, 'post', '/api/admin/users', { username: 'ql_ban', password: 'Pass@123', fullName: 'QL bàn', role: 'STORE_MGR' })).status,
      201,
    );
    const mgr = await app.login('ql_ban', 'Pass@123');
    const denied = await call(mgr, 'put', '/api/admin/settings', { idleCloseMinutes: 60 });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, 'OWNER_ONLY');

    // Tắt → không đóng gì
    const off = await call(admin, 'put', '/api/admin/settings', { idleCloseMinutes: 0 });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal(off.body.idleCloseMinutes, 0);
    const g1 = await sit('G1');
    await age(g1.s, 31);
    const infoOff = await runIdleJob();
    assert.equal(infoOff.off, true);
    assert.equal((await status(g1.s)).Status, 'OPEN');

    // 60 phút → 31 phút còn, 61 phút đóng
    assert.equal((await call(admin, 'put', '/api/admin/settings', { idleCloseMinutes: 60 })).body.idleCloseMinutes, 60);
    assert.equal((await runIdleJob()).minutes, 60);
    assert.equal((await status(g1.s)).Status, 'OPEN');
    await age(g1.s, 61);
    await runIdleJob();
    assert.deepEqual(await status(g1.s), { Status: 'CLOSED', CloseReason: 'IDLE_EMPTY' });

    // 15 phút → 16 phút đóng, 14 phút còn
    assert.equal((await call(admin, 'put', '/api/admin/settings', { idleCloseMinutes: '15' })).body.idleCloseMinutes, 15, 'nhận cả số dạng chữ từ ô chọn');
    const g2 = await sit('G2');
    await age(g2.s, 16);
    const g3 = await sit('G3');
    await age(g3.s, 14);
    const info15 = await runIdleJob();
    assert.equal(info15.minutes, 15);
    assert.equal((await status(g2.s)).Status, 'CLOSED');
    assert.equal((await status(g3.s)).Status, 'OPEN');
    assert.equal((await call(admin, 'put', '/api/admin/settings', { idleCloseMinutes: 30 })).status, 200); // trả lại mặc định
    assert.equal((await call(staff, 'post', `/api/sessions/${g3.s}/close`)).status, 200);
  });

  test('AC-087-03: yêu cầu "xin chuyển bàn" ghi bàn đích đang có bao nhiêu nhóm khác — sang Bàn H2 đang có 1 nhóm → openGroups 1 (danh sách + sự kiện quầy); đổi ý sang Bàn H3 trống → 0; Gọi nhân viên thường không có bàn đích; khách quét QR mở nhóm mới → quầy nhận session.opened (byGuest) để thẻ / lưới bàn cập nhật ngay', async () => {
    const x = await sit('H1', { order: true });
    const opened = app.waitFor(staffSock, 'session.opened', (p) => p.table?.name === 'Bàn H2');
    const y = await sit('H2'); // nhóm khác đang ngồi Bàn H2
    const openedEv = await opened;
    assert.equal(openedEv.sessionId, y.s);
    assert.equal(openedEv.byGuest, true);
    assert.equal((await scan(x.C, 'H2')).body.state, 'ELSEWHERE');
    const ev = app.waitFor(staffSock, 'session.staff_called', (c) => c.sessionId === x.s && c.type === 'MOVE');
    const r = await x.C.post(`/api/sessions/${x.s}/move-request`, { qrToken: tables.H2.QrToken });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await ev).toTable.openGroups, 1, 'sự kiện tới quầy');
    let list = (await call(staff, 'get', '/api/staff-calls')).body.filter((c) => c.sessionId === x.s);
    assert.equal(list.length, 1);
    assert.equal(list[0].toTable.name, 'Bàn H2');
    assert.equal(list[0].toTable.openGroups, 1);
    // Đổi ý sang bàn trống
    assert.equal((await x.C.post(`/api/sessions/${x.s}/move-request`, { qrToken: tables.H3.QrToken })).status, 201);
    list = (await call(staff, 'get', '/api/staff-calls')).body.filter((c) => c.sessionId === x.s);
    assert.equal(list[0].toTable.name, 'Bàn H3');
    assert.equal(list[0].toTable.openGroups, 0);
    // Gọi nhân viên thường (không phải chuyển bàn) → không có bàn đích
    assert.equal((await y.C.post(`/api/sessions/${y.s}/call-staff`, {})).status, 201);
    const plain = (await call(staff, 'get', '/api/staff-calls')).body.find((c) => c.sessionId === y.s);
    assert.equal(plain.type, 'STAFF');
    assert.equal(plain.toTable, null);
  });
});
