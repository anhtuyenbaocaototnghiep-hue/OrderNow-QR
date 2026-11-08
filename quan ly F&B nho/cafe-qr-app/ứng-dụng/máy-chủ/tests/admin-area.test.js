// Integration test (SQL Server thật) F-080 — trang Quản lý riêng (ADR-038 D-173…D-177): đăng nhập ở trang Quản lý không chấm công
// vào (dữ liệu test dùng chế độ chấm công theo đăng nhập), /admin dẫn vào Hôm nay, trang Đăng nhập Quản lý riêng.
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
    ['ql_area', 'STORE_MGR'],
    ['nv_area', 'STAFF'],
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

describe('Trang Quản lý riêng (F-080)', () => {
  test('AC-080-01: đăng nhập trang Quản lý (area = admin) không chấm công vào — kể cả quản lý cửa hàng, nhân viên; đăng nhập máy quầy vẫn chấm công như cũ; area lạ → 400', async () => {
    const r = await login('ql_area', 'Pass@123', 'admin');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.accessToken);
    assert.equal(await openAtt(users.ql_area), 0, 'trang Quản lý không vào ca');
    assert.equal((await login('nv_area', 'Pass@123', 'admin')).status, 200);
    assert.equal(await openAtt(users.nv_area), 0);
    // Token đăng nhập trang Quản lý dùng được như mọi token (quyền theo vai)
    const me = await api.get('/api/auth/me').set(auth(r.body.accessToken));
    assert.equal(me.body.user.role, 'STORE_MGR');
    assert.ok(me.body.user.caps.includes('admin.menu'));
    // Máy quầy (mặc định / area = pos) → chấm công vào như trước
    assert.equal((await login('ql_area', 'Pass@123')).status, 200);
    assert.equal(await openAtt(users.ql_area), 1);
    assert.equal((await login('nv_area', 'Pass@123', 'pos')).status, 200);
    assert.equal(await openAtt(users.nv_area), 1);
    assert.equal((await login('nv_area', 'Pass@123', 'khac')).status, 400);
    // Sai mật khẩu ở trang Quản lý vẫn bị đếm như đăng nhập thường (F-071)
    assert.equal((await login('nv_area', 'sai', 'admin')).status, 401);
  });

  test('AC-080-02: /admin dẫn vào Hôm nay; /admin/login là trang Đăng nhập Quản lý riêng (không phải màn đăng nhập quầy)', async () => {
    const r = await api.get('/admin');
    assert.equal(r.status, 302);
    assert.equal(r.headers.location, '/admin/today');
    const page = await api.get('/admin/login');
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type'], /html/);
    assert.match(page.text, /Đăng nhập Quản lý/);
    assert.match(page.text, /admin-login\.js/);
    assert.doesNotMatch(page.text, /pos-login\.js/);
  });

  test('AC-080-04: đã đăng nhập trang Quản lý → mở máy quầy (POST /api/auth/pos-session) không cần gõ lại mật khẩu: quản lý cửa hàng được, chấm công vào một lần (gọi lại không tạo thêm), không cấp token mới; chủ quán → 403 OWNER_ADMIN_ONLY; không token → 401', async () => {
    const r = await api.post('/api/admin/users').set(auth(admin)).send({ username: 'ql_pos', password: 'Pass@123', fullName: 'TK ql_pos', role: 'STORE_MGR' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const id = (await q1("SELECT UserId FROM dbo.Users WHERE Username = 'ql_pos'"))[0].UserId;
    const tok = (await login('ql_pos', 'Pass@123', 'admin')).body.accessToken;
    assert.equal(await openAtt(id), 0, 'đăng nhập trang Quản lý chưa vào ca');
    const s1 = await api.post('/api/auth/pos-session').set(auth(tok));
    assert.equal(s1.status, 200, JSON.stringify(s1.body));
    assert.equal(s1.body.user.username, 'ql_pos');
    assert.equal(s1.body.user.role, 'STORE_MGR');
    assert.equal(s1.body.accessToken, undefined, 'dùng lại token đang có — không cấp token mới');
    assert.equal(await openAtt(id), 1, 'mở máy quầy = vào ca');
    assert.equal((await api.post('/api/auth/pos-session').set(auth(tok))).status, 200);
    assert.equal(await openAtt(id), 1, 'gọi lại không tạo bản ghi chấm công thứ hai');
    const own = await api.post('/api/auth/pos-session').set(auth(admin));
    assert.equal(own.status, 403);
    assert.equal(own.body.code, 'OWNER_ADMIN_ONLY');
    assert.equal((await api.post('/api/auth/pos-session')).status, 401);
  });
});
