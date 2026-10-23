// Integration test (SQL Server thật) F-054 — người mở ca phải đóng ca trước khi đăng xuất (ADR-014 D-59, BR-086).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, users;

const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const openAttendance = async (userId) => (await q1(`SELECT COUNT(*) AS n FROM dbo.Attendance WHERE UserId = ${userId} AND ClockOut IS NULL`))[0].n;
const currentShift = async (token) => (await call(token, 'get', '/api/shifts/current')).body.shift;
async function openShift(token) {
  const r = await call(token, 'post', '/api/shifts/open', { openingCash: 100000 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.shift; // POST /shifts/open trả { shift }
}
async function closeShift(token) {
  const s = await currentShift(token);
  const r = await call(token, 'post', `/api/shifts/${s.shiftId}/close`, { countedCash: s.expectedCash });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  for (const [username, role] of [
    ['nvca1', 'STAFF'],
    ['nvca2', 'STAFF'],
    ['tcca1', 'MANAGER'],
  ]) {
    const u = await call(admin, 'post', '/api/admin/users', { username, password: 'Pass@123', fullName: username, role });
    assert.equal(u.status, 201, JSON.stringify(u.body));
  }
  users = Object.fromEntries(
    (await q1("SELECT Username, UserId FROM dbo.Users WHERE Username IN ('nvca1', 'nvca2', 'tcca1')")).map((u) => [u.Username, u.UserId]),
  );
  assert.equal(await currentShift(admin), null, 'DB test bắt đầu không có ca mở');
});

after(() => app.close());

describe('Đăng xuất phải đóng ca (F-054)', () => {
  test('AC-054-01: nhân viên mở ca rồi đăng xuất → 409 SHIFT_OPEN (shiftId), chấm công vẫn mở; đóng ca (ghi giờ ra) xong đăng xuất → 200', async () => {
    const t = await app.login('nvca1', 'Pass@123');
    assert.equal(await openAttendance(users.nvca1), 1);
    const shift = await openShift(t);
    const r = await call(t, 'post', '/api/auth/logout');
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.code, 'SHIFT_OPEN');
    assert.equal(r.body.details.shiftId, shift.shiftId);
    assert.equal(r.body.details.cashPending, 0); // không có khoản chi chờ duyệt → giao diện không nhắc
    assert.match(r.body.message, new RegExp(`ca #${shift.shiftId}`));
    assert.equal(await openAttendance(users.nvca1), 1, 'bị chặn thì chưa ghi giờ ra');
    assert.equal((await currentShift(t)).shiftId, shift.shiftId, 'ca vẫn mở');
    await closeShift(t);
    // Đóng ca đã ghi giờ ra chấm công cho người đóng (sp_CloseShift, F-035) → đăng xuất không còn gì để ghi
    assert.equal(await openAttendance(users.nvca1), 0);
    const ok = await call(t, 'post', '/api/auth/logout');
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.clockedOut, 0);
  });

  test('AC-054-02: ca do người khác mở đang chạy → nhân viên / trưởng ca khác đăng xuất 200, ca vẫn mở', async () => {
    const opener = await app.login('nvca1', 'Pass@123');
    const shift = await openShift(opener);
    const other = await app.login('nvca2', 'Pass@123');
    const lead = await app.login('tcca1', 'Pass@123');
    for (const [token, userId] of [
      [other, users.nvca2],
      [lead, users.tcca1],
    ]) {
      const r = await call(token, 'post', '/api/auth/logout');
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.clockedOut, 1);
      assert.equal(await openAttendance(userId), 0);
    }
    assert.equal((await currentShift(opener)).shiftId, shift.shiftId, 'ca vẫn mở sau khi người khác đăng xuất');
    assert.equal((await call(opener, 'post', '/api/auth/logout')).status, 409);
    await closeShift(opener);
  });

  test('AC-054-03: quản lý mở ca → đăng xuất 409 SHIFT_OPEN; không có ca mở → mọi vai đăng xuất 200', async () => {
    // Trưởng ca mở ca cũng bị chặn; ca bị người khác đóng thì người mở được đăng xuất (review G3)
    const lead = await app.login('tcca1', 'Pass@123');
    await openShift(lead);
    assert.equal((await call(lead, 'post', '/api/auth/logout')).body.code, 'SHIFT_OPEN');
    await closeShift(admin);
    assert.equal((await call(lead, 'post', '/api/auth/logout')).status, 200);
    const shift = await openShift(admin);
    const r = await call(admin, 'post', '/api/auth/logout');
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.code, 'SHIFT_OPEN');
    assert.equal(r.body.details.shiftId, shift.shiftId);
    await closeShift(admin);
    assert.equal(await currentShift(admin), null);
    for (const [username, password] of [
      ['admin', 'Admin@123'],
      ['nvca2', 'Pass@123'],
      ['tcca1', 'Pass@123'],
    ]) {
      const t = await app.login(username, password);
      const out = await call(t, 'post', '/api/auth/logout');
      assert.equal(out.status, 200, `${username}: ${JSON.stringify(out.body)}`);
    }
  });
});
