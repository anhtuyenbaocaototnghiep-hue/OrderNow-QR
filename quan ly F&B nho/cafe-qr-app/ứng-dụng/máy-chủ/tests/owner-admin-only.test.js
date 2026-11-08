// Integration test (SQL Server thật) F-084 — tài khoản Chủ quán chỉ dùng trang Quản lý (ADR-043 D-196…D-198): màn đăng nhập quầy
// (area = 'pos') từ chối chủ quán sau khi đúng mật khẩu; trang Quản lý và công cụ gọi API (không gửi area) vẫn đăng nhập được;
// quản lý cửa hàng / nhân viên vẫn đứng quầy như cũ.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, users;
const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const openAtt = async (userId) => (await q1(`SELECT COUNT(*) AS n FROM dbo.Attendance WHERE UserId = ${userId} AND ClockOut IS NULL`))[0].n;
const login = (username, password, area) => api.post('/api/auth/login').send(area ? { username, password, area } : { username, password });

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  for (const [username, role] of [
    ['ql_owner', 'STORE_MGR'],
    ['nv_owner', 'STAFF'],
  ]) {
    const r = await api
      .post('/api/admin/users')
      .set(auth(admin))
      .send({ username, password: 'Pass@123', fullName: `TK ${username}`, role });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  users = Object.fromEntries((await q1('SELECT UserId, Username FROM dbo.Users')).map((u) => [u.Username, u.UserId]));
});

after(() => app.close());

describe('Chủ quán chỉ dùng trang Quản lý (F-084)', () => {
  test('AC-084-01: chủ quán đăng nhập màn quầy (area = pos) → 403 OWNER_ADMIN_ONLY, không có token, không chấm công; sai mật khẩu vẫn chỉ 401 (không lộ vai trò); trang Quản lý (area = admin) và công cụ gọi API (không gửi area) vẫn vào được; quản lý cửa hàng, nhân viên vẫn đăng nhập quầy và chấm công như cũ', async () => {
    const r = await login('admin', 'Admin@123', 'pos');
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.equal(r.body.code, 'OWNER_ADMIN_ONLY');
    assert.match(r.body.message, /chỉ dùng trang Quản lý/);
    assert.equal(r.body.accessToken, undefined);
    assert.equal(await openAtt(users.admin), 0, 'bị từ chối thì không vào ca');
    // Sai mật khẩu: như mọi tài khoản — không cho biết đây là chủ quán
    const wrong = await login('admin', 'sai-mat-khau', 'pos');
    assert.equal(wrong.status, 401);
    assert.notEqual(wrong.body.code, 'OWNER_ADMIN_ONLY');
    // Trang Quản lý, công cụ gọi API: vẫn được
    const adm = await login('admin', 'Admin@123', 'admin');
    assert.equal(adm.status, 200, JSON.stringify(adm.body));
    assert.equal((await api.get('/api/auth/me').set(auth(adm.body.accessToken))).body.user.role, 'ADMIN');
    assert.equal((await login('admin', 'Admin@123')).status, 200);
    // Người khác vẫn đứng quầy
    assert.equal((await login('ql_owner', 'Pass@123', 'pos')).status, 200);
    assert.equal(await openAtt(users.ql_owner), 1);
    assert.equal((await login('nv_owner', 'Pass@123', 'pos')).status, 200);
    assert.equal(await openAtt(users.nv_owner), 1);
  });

  test('AC-084-01: "Đổi người" ở máy quầy (nhập PIN) không đổi sang chủ quán được — như trước (chỉ nhân viên / trưởng ca)', async () => {
    const staff = (await login('nv_owner', 'Pass@123', 'pos')).body.accessToken;
    const r = await api.post('/api/auth/switch').set(auth(staff)).send({ userId: users.admin, pin: '1234' });
    assert.ok([400, 404].includes(r.status), JSON.stringify(r.body));
  });
});
