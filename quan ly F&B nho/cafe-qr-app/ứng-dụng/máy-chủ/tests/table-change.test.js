// Integration test (SQL Server thật) F-086 — khách đổi bàn khi quét QR (ADR-047 D-206…D-210):
// quét QR bàn khác khi điện thoại đang có nhóm mở → hỏi; nhóm chưa có món, một mình → tự chuyển; đã có món / có người khác → nhờ quầy
// (yêu cầu MOVE ở dải "Gọi nhân viên", quầy bấm "Chuyển"); phiên trống quá 30 phút → hệ thống tự đóng.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, tables, staffSock;

const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const openAt = async (code) => (await call(staff, 'get', '/api/tables')).body.find((t) => t.code === code)?.sessions ?? [];
const scan = (C, code) => C.post('/api/sessions/scan', { qrToken: tables[code].QrToken });

/** Tạo thêm bàn cho test (mã ngắn). */
async function table(code) {
  const r = await call(admin, 'post', '/api/admin/tables', { code, name: `Bàn ${code}` });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  tables[code] = { TableId: r.body.tableId, Code: code, Name: `Bàn ${code}`, QrToken: r.body.qrToken };
}

/** Một điện thoại ngồi bàn `code` (nhóm mới), có thể gửi đơn. */
async function sit(code, { order = false } = {}) {
  const C = await app.customer();
  const r = await scan(C, code);
  assert.equal(r.body.state, 'NEW', JSON.stringify(r.body));
  const s = r.body.session.sessionId;
  let o = null;
  if (order) {
    o = await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Cà phê đen'], quantity: 1 }] });
    assert.equal(o.status, 201, JSON.stringify(o.body));
  }
  return { C, s, order: o?.body ?? null };
}

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  tables = Object.fromEntries((await q1('SELECT TableId, Code, Name, QrToken FROM dbo.Tables')).map((t) => [t.Code, t]));
  for (const c of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8']) await table(c);
  assert.equal((await call(staff, 'post', '/api/shifts/open', { openingCash: 0 })).status, 201);
  staffSock = await app.connect({ auth: { token: staff } });
});

after(() => app.close());

describe('Khách đổi bàn khi quét QR (F-086)', () => {
  test('AC-086-01: điện thoại có nhóm mở ở Bàn 01 quét QR Bàn 02 → state ELSEWHERE (tên + mã QR Bàn 01, chưa có món, tự chuyển được), KHÔNG tạo nhóm ở Bàn 02; quét lại Bàn 01 → vào lại nhóm cũ; nhóm mở quá 6 giờ không hỏi nữa', async () => {
    const { C, s } = await sit('01');
    const r = await scan(C, '02');
    assert.equal(r.status, 200);
    assert.equal(r.body.state, 'ELSEWHERE');
    assert.equal(r.body.table.name, 'Bàn 02');
    assert.equal(r.body.elsewhere.sessionId, s);
    assert.deepEqual(r.body.elsewhere.table, { name: 'Bàn 01', qrToken: tables['01'].QrToken });
    assert.equal(r.body.elsewhere.orderCount, 0);
    assert.equal(r.body.elsewhere.canMoveNow, true);
    assert.deepEqual(r.body.openSessions, []);
    assert.equal((await openAt('02')).length, 0, 'không tự mở nhóm ở bàn mới');
    const back = await scan(C, '01');
    assert.equal(back.body.state, 'MEMBER');
    assert.equal(back.body.session.sessionId, s);
    // Nhóm cũ hơn 6 giờ (khách đã rời quán hôm trước) → quét bàn khác vào thẳng như thường
    await pool.request().query(`UPDATE dbo.Sessions SET OpenedAt = DATEADD(HOUR, -7, OpenedAt) WHERE SessionId = '${s}'`);
    const fresh = await scan(C, '02');
    assert.equal(fresh.body.state, 'NEW');
    // Dọn: hai nhóm trống
    for (const id of [s, fresh.body.session.sessionId]) assert.equal((await call(staff, 'post', `/api/sessions/${id}/close`)).status, 200);
  });

  test('AC-086-02: nhóm chưa có món, một điện thoại → "Chuyển sang bàn này": nhóm (cùng mã nhóm → giỏ giữ nguyên) sang Bàn D2, Bàn D1 trống, lịch sử ghi khách tự chuyển, quầy nhận sự kiện; có món / có người khác / không thuộc nhóm / cùng bàn / mã sai → từ chối, không đổi gì', async () => {
    const { C, s } = await sit('D1');
    const changed = app.waitFor(staffSock, 'session.table_changed', (p) => p.sessionId === s);
    const r = await C.post(`/api/sessions/${s}/move-here`, { qrToken: tables.D2.QrToken });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.session.sessionId, s);
    assert.equal(r.body.session.table.name, 'Bàn D2');
    assert.equal(r.body.table.qrToken, tables.D2.QrToken);
    const ev = await changed;
    assert.equal(ev.byGuest, true);
    assert.equal(ev.fromTable.name, 'Bàn D1');
    assert.equal(ev.toTable.name, 'Bàn D2');
    assert.equal((await openAt('D1')).length, 0);
    assert.equal((await openAt('D2'))[0].sessionId, s);
    const [mv] = await q1(`SELECT MovedBy, ByGuest FROM dbo.SessionTableMoves WHERE SessionId = '${s}'`);
    assert.deepEqual(mv, { MovedBy: null, ByGuest: true });
    assert.equal((await scan(C, 'D2')).body.state, 'MEMBER', 'quét QR bàn mới → vào thẳng nhóm của mình');

    // Đã gửi món → phải nhờ quầy (món mang ra đúng bàn)
    const withOrder = await sit('D3', { order: true });
    const o = await withOrder.C.post(`/api/sessions/${withOrder.s}/move-here`, { qrToken: tables.D4.QrToken });
    assert.equal(o.status, 409);
    assert.equal(o.body.code, 'GUEST_MOVE_BLOCKED');
    assert.match(o.body.message, /đã gửi món/);
    // Nhóm có hai điện thoại → nhờ quầy chuyển cả nhóm
    const shared = await sit('D4');
    const friend = await app.customer();
    assert.equal((await friend.post(`/api/sessions/${shared.s}/join`, { qrToken: tables.D4.QrToken })).status, 200);
    const sh = await shared.C.post(`/api/sessions/${shared.s}/move-here`, { qrToken: tables.D5.QrToken });
    assert.equal(sh.status, 409);
    assert.match(sh.body.message, /người khác/);
    // Điện thoại không thuộc nhóm
    const stranger = await app.customer();
    const st = await stranger.post(`/api/sessions/${shared.s}/move-here`, { qrToken: tables.D5.QrToken });
    assert.equal(st.status, 403);
    assert.equal(st.body.code, 'NOT_SESSION_MEMBER');
    // Cùng bàn / mã QR sai
    assert.equal((await shared.C.post(`/api/sessions/${shared.s}/move-here`, { qrToken: tables.D4.QrToken })).status, 409); // vẫn chặn vì có 2 người (kiểm trước bàn)
    const solo = await sit('D5');
    const same = await solo.C.post(`/api/sessions/${solo.s}/move-here`, { qrToken: tables.D5.QrToken });
    assert.equal(same.status, 400);
    assert.equal(same.body.code, 'SAME_TABLE');
    assert.equal((await solo.C.post(`/api/sessions/${solo.s}/move-here`, { qrToken: '0'.repeat(32) })).status, 404);
    // Không đổi gì ở các nhóm bị từ chối
    assert.equal((await openAt('D3'))[0].sessionId, withOrder.s);
    assert.equal((await openAt('D4'))[0].sessionId, shared.s);
    assert.equal((await openAt('D5'))[0].sessionId, solo.s);
  });

  test('AC-086-03: nhóm đã có món → "Nhờ quầy chuyển": yêu cầu MOVE hiện ở dải Gọi nhân viên (bàn đi → bàn đến), điện thoại thấy đang chờ, không tính là "đã gọi nhân viên"; đổi ý → cập nhật bàn đích (một yêu cầu); quầy bấm "Chuyển" → nhóm + đơn sang bàn mới, yêu cầu xong; bấm lại → 409; "Bỏ qua" dùng nút Đã xử lý; nhân viên không phải Phục vụ → 403', async () => {
    const { C, s } = await sit('D6', { order: true });
    const called = app.waitFor(staffSock, 'session.staff_called', (c) => c.sessionId === s);
    const r = await C.post(`/api/sessions/${s}/move-request`, { qrToken: tables.D7.QrToken });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.type, 'MOVE');
    assert.equal(r.body.table.name, 'Bàn D6');
    assert.equal(r.body.toTable.name, 'Bàn D7');
    assert.equal((await called).type, 'MOVE');
    const list = (await call(staff, 'get', '/api/staff-calls')).body.filter((c) => c.sessionId === s);
    assert.equal(list.length, 1);
    assert.equal(list[0].toTable.name, 'Bàn D7');
    let view = (await C.get(`/api/sessions/${s}`)).body;
    assert.equal(view.session?.moveRequest?.toTable ?? view.moveRequest?.toTable, 'Bàn D7');
    assert.equal(view.session?.openCalls ?? view.openCalls, 0, 'xin chuyển bàn không tính là gọi nhân viên');
    // Gọi nhân viên thường vẫn gọi được ngay (không dính chờ 60 giây của yêu cầu chuyển bàn)
    assert.equal((await C.post(`/api/sessions/${s}/call-staff`, {})).status, 201);
    // Đổi ý: xin sang Bàn D8 → vẫn một yêu cầu, bàn đích mới
    const again = await C.post(`/api/sessions/${s}/move-request`, { qrToken: tables.D8.QrToken });
    assert.equal(again.status, 201);
    assert.equal(again.body.callId, r.body.callId);
    assert.equal(again.body.toTable.name, 'Bàn D8');
    // Nhân viên chỉ là Pha chế → không chuyển được
    assert.equal(
      (
        await call(admin, 'post', '/api/admin/users', {
          username: 'phache86',
          password: 'Pass@123',
          fullName: 'Pha chế 86',
          role: 'STAFF',
          positions: ['BARISTA'],
        })
      ).status,
      201,
    );
    const barista = await app.login('phache86', 'Pass@123');
    assert.equal((await call(barista, 'post', `/api/staff-calls/${r.body.callId}/move`)).status, 403);
    // Quầy bấm "Chuyển"
    const handled = app.waitFor(staffSock, 'session.staff_call_handled', (c) => c.callId === r.body.callId);
    const ok = await call(staff, 'post', `/api/staff-calls/${r.body.callId}/move`);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.toTable.name, 'Bàn D8');
    assert.ok((await handled).handledAt);
    assert.equal((await openAt('D6')).length, 0);
    assert.equal((await openAt('D8'))[0].sessionId, s);
    const [{ n }] = await q1(`SELECT COUNT(*) AS n FROM dbo.Orders o JOIN dbo.Tables t ON t.TableId = o.TableId WHERE o.SessionId = '${s}' AND t.Code = 'D8'`);
    assert.equal(n, 1, 'đơn đi theo nhóm');
    view = (await C.get(`/api/sessions/${s}`)).body;
    assert.equal(view.session?.moveRequest ?? view.moveRequest ?? null, null);
    const twice = await call(staff, 'post', `/api/staff-calls/${r.body.callId}/move`);
    assert.equal(twice.status, 409);
    assert.equal(twice.body.code, 'ALREADY_PROCESSED');
    // "Bỏ qua" một yêu cầu khác: nút Đã xử lý; chuyển bàn bằng ngăn kéo cũng tự đóng yêu cầu đang chờ
    const other = await sit('05', { order: true });
    const req2 = await other.C.post(`/api/sessions/${other.s}/move-request`, { qrToken: tables['06'].QrToken });
    assert.equal((await call(staff, 'post', `/api/staff-calls/${req2.body.callId}/handle`)).status, 200);
    const req3 = await other.C.post(`/api/sessions/${other.s}/move-request`, { qrToken: tables['06'].QrToken });
    assert.notEqual(req3.body.callId, req2.body.callId, 'yêu cầu đã xử lý → yêu cầu mới');
    assert.equal((await call(staff, 'post', `/api/sessions/${other.s}/move`, { toTableId: tables['06'].TableId })).status, 200);
    const [left] = await q1(`SELECT HandledAt FROM dbo.StaffCalls WHERE CallId = ${req3.body.callId}`);
    assert.ok(left.HandledAt, 'chuyển bàn ở ngăn kéo → yêu cầu xin chuyển tự xong');
    // Không thuộc nhóm / cùng bàn
    assert.equal((await (await app.customer()).post(`/api/sessions/${other.s}/move-request`, { qrToken: tables['02'].QrToken })).status, 403);
    assert.equal((await other.C.post(`/api/sessions/${other.s}/move-request`, { qrToken: tables['06'].QrToken })).status, 400);
  });

  test('AC-086-04: chọn "Gọi món riêng ở bàn này" → nhóm mới ở bàn mới, nhóm cũ giữ nguyên; quét lại bàn nào vào đúng nhóm bàn đó; điện thoại có hai nhóm quét bàn thứ ba → hỏi nhóm ĐÃ GỬI MÓN trước (dù mở trước), nhóm còn lại trong otherGroups', async () => {
    const { C, s } = await sit('03', { order: true });
    assert.equal((await scan(C, '04')).body.state, 'ELSEWHERE');
    const own = await C.post('/api/sessions', { qrToken: tables['04'].QrToken });
    assert.equal(own.status, 201);
    const s2 = own.body.session.sessionId;
    assert.notEqual(s2, s);
    assert.equal((await scan(C, '04')).body.session.sessionId, s2);
    assert.equal((await scan(C, '03')).body.session.sessionId, s);
    // Nhóm Bàn 04 (trống) mở SAU nhóm Bàn 03 (có món) — vẫn hỏi về nhóm có món trước (lỗi tìm ra khi đi thử 10/11)
    const third = await scan(C, 'D1');
    assert.equal(third.body.state, 'ELSEWHERE');
    assert.equal(third.body.elsewhere.sessionId, s);
    assert.equal(third.body.elsewhere.canMoveNow, false);
    assert.deepEqual(
      third.body.otherGroups.map((g) => [g.sessionId, g.table.name, g.canMoveNow]),
      [[s2, 'Bàn 04', true]],
    );
  });

  test('AC-086-05: bàn trống (không món) không ai vào thêm quá 30 phút → job "close-idle-tables" tự đóng (lý do IDLE_EMPTY, quầy + điện thoại nhận session.closed); nhóm có món, mới có người vào, đang gọi nhân viên, mới 29 phút → giữ nguyên; đóng bàn trống tay báo lý do EMPTY', async () => {
    const age = (s, min) =>
      pool
        .request()
        .query(
          `UPDATE dbo.Sessions SET OpenedAt = DATEADD(MINUTE, -${min}, SYSUTCDATETIME()) WHERE SessionId = '${s}'; UPDATE dbo.SessionClients SET JoinedAt = DATEADD(MINUTE, -${min}, SYSUTCDATETIME()) WHERE SessionId = '${s}';`,
        );
    for (const c of ['E1', 'E2', 'E3', 'E4', 'E5', 'E6']) await table(c);
    const idle = await sit('E1');
    await age(idle.s, 31);
    const withOrder = await sit('E2', { order: true });
    await age(withOrder.s, 45);
    const rejoined = await sit('E3');
    await age(rejoined.s, 40);
    assert.equal((await (await app.customer()).post(`/api/sessions/${rejoined.s}/join`, { qrToken: tables.E3.QrToken })).status, 200); // vừa có người vào
    const calling = await sit('E4');
    assert.equal((await calling.C.post(`/api/sessions/${calling.s}/call-staff`, {})).status, 201);
    await age(calling.s, 40);
    const young = await sit('E5');
    await age(young.s, 29);
    const closedEv = app.waitFor(staffSock, 'session.closed', (p) => p.sessionId === idle.s);
    const run = await call(admin, 'post', '/api/admin/jobs/close-idle-tables/run');
    assert.equal(run.status, 200, JSON.stringify(run.body));
    assert.equal(run.body.status, 'OK');
    assert.ok(run.body.info.closed >= 1);
    assert.equal((await closedEv).reason, 'IDLE_EMPTY');
    const [row] = await q1(`SELECT Status, CloseReason, ClosedBy FROM dbo.Sessions WHERE SessionId = '${idle.s}'`);
    assert.deepEqual(row, { Status: 'CLOSED', CloseReason: 'IDLE_EMPTY', ClosedBy: null });
    for (const kept of [withOrder, rejoined, calling, young]) {
      const [k] = await q1(`SELECT Status FROM dbo.Sessions WHERE SessionId = '${kept.s}'`);
      assert.equal(k.Status, 'OPEN');
    }
    // Đóng bàn trống tay → session.closed có lý do EMPTY (điện thoại giữ giỏ, mở nhóm mới)
    const manual = await sit('E6');
    const manualEv = app.waitFor(staffSock, 'session.closed', (p) => p.sessionId === manual.s);
    assert.equal((await call(staff, 'post', `/api/sessions/${manual.s}/close`)).status, 200);
    assert.equal((await manualEv).reason, 'EMPTY');
  });
});
