// Integration test (SQL Server thật) F-102 — bắt đổi mật khẩu mặc định / dễ đoán, tự đổi mật khẩu (ADR-073 D-266…D-271, BR-132).
// CSDL test đặt sẵn `security.block_weak_passwords = 'false'` (test cũ đăng nhập bằng mật khẩu mẫu) — bài này đăng nhập những tài khoản
// cần dùng TRƯỚC, rồi mới bật (token cấp lúc tắt không mang dấu "phải đổi").
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, settingsService, weakPasswordReason;
const STRONG = 'Quay-Sang#2026';

const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body;
};
const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const login = (username, password) => api.post('/api/auth/login').send({ username, password });
const userId = async (username) => (await q1(`SELECT UserId FROM dbo.Users WHERE Username = '${username}'`))[0].UserId;
const setBlock = async (on) => ok(await call(admin, 'put', '/api/admin/settings', { blockWeakPasswords: on })).blockWeakPasswords;
const createUser = (username, password, role = 'STAFF') => call(admin, 'post', '/api/admin/users', { username, password, fullName: `TK ${username}`, role });

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  settingsService = await import('../src/services/settingsService.js'); // nạp src SAU harness (DEF-030)
  ({ weakPasswordReason } = await import('../src/domain/password.js'));
  admin = await app.login('admin', 'Admin@123'); // đăng nhập lúc còn tắt → token thường
  staff = await app.login('staff1', 'Staff@123');
  // Tạo lúc tắt: tài khoản mật khẩu mẫu (để thử bắt đổi) và tài khoản mật khẩu tốt
  for (const [u, p, role] of [
    ['nv_yeu', 'Staff@123', 'STAFF'],
    ['nv_pin', 'Staff@123', 'STAFF'],
    ['ql_yeu', 'Pass@123', 'STORE_MGR'],
    ['nv_manh', 'Manh#Quay-2026', 'STAFF'],
    ['ql_manh', 'Ql#Quan-Ly-2026', 'STORE_MGR'],
    ['tc_manh', 'Tc#Truong-Ca-2026', 'MANAGER'],
  ]) {
    ok(await createUser(u, p, role), 201);
  }
  assert.equal(await setBlock(true), true);
});

after(async () => {
  await setBlock(false).catch(() => {});
  await app.close();
});

describe('Bắt đổi mật khẩu mặc định / dễ đoán (F-102)', () => {
  test('D-266: mật khẩu dễ đoán — mẫu trong tài liệu, phổ biến, giống tên đăng nhập, lặp một ký tự, dãy số liền nhau; không phân biệt hoa / thường', () => {
    for (const p of ['Admin@123', 'ADMIN@123', 'staff@123', 'Pass@123']) assert.match(weakPasswordReason(p), /mẫu/, p);
    for (const p of ['123456', 'PASSWORD', 'admin123', 'matkhau', 'qwerty']) assert.match(weakPasswordReason(p), /phổ biến/, p);
    assert.match(weakPasswordReason('NhanVien1', 'nhanvien1'), /tên đăng nhập/);
    assert.match(weakPasswordReason('nhanvien1@123', 'nhanvien1'), /tên đăng nhập/);
    assert.equal(weakPasswordReason('nhanvien1-quay-sang', 'nhanvien1'), null, 'tên đăng nhập + chữ khác thì không tính');
    assert.match(weakPasswordReason('aaaaaaa'), /lặp/);
    assert.match(weakPasswordReason('345678'), /liền nhau/);
    assert.match(weakPasswordReason('9876543'), /liền nhau/);
    for (const p of ['Ca-phe sua da 7', STRONG, '135792468', 'xanh2go-quay']) assert.equal(weakPasswordReason(p, 'staff1'), null, p);
  });

  test('AC-102-01: bật — đăng nhập đúng mật khẩu dễ đoán → mustChangePassword; token chỉ gọi /auth/me, đăng xuất; API quầy / Quản lý / realtime → 403 PASSWORD_CHANGE_REQUIRED; mật khẩu tốt hoặc tắt cài đặt → không có dấu', async () => {
    const r = ok(await login('nv_yeu', 'Staff@123'));
    assert.equal(r.mustChangePassword, true);
    assert.equal(r.user.mustChangePassword, true);
    const t = r.accessToken;
    assert.equal(ok(await call(t, 'get', '/api/auth/me')).user.mustChangePassword, true);
    for (const [method, path, body] of [
      ['get', '/api/tables'],
      ['get', '/api/staff-calls'],
      ['get', '/api/store'],
      ['post', '/api/auth/pin', { password: 'Staff@123', pin: '2580' }],
      ['post', '/api/auth/pos-session', {}],
    ]) {
      const res = await call(t, method, path, body);
      assert.equal(res.status, 403, `${method} ${path}: ${res.status}`);
      assert.equal(res.body.code, 'PASSWORD_CHANGE_REQUIRED', `${method} ${path}`);
    }
    // Quản lý cửa hàng mật khẩu mẫu: trang Quản lý cũng bị chặn
    const mgr = ok(await login('ql_yeu', 'Pass@123'));
    assert.equal(mgr.mustChangePassword, true);
    assert.equal((await call(mgr.accessToken, 'get', '/api/admin/menu-items')).body.code, 'PASSWORD_CHANGE_REQUIRED');
    // Realtime: không vào phòng nhân viên bằng token "phải đổi"
    await assert.rejects(app.connect({ auth: { token: t } }), /PASSWORD_CHANGE_REQUIRED/);
    // Đăng xuất được (chấm công ra)
    ok(await call(t, 'post', '/api/auth/logout', {}));
    // Mật khẩu tốt → không có dấu
    const good = ok(await login('nv_manh', 'Manh#Quay-2026'));
    assert.equal(good.mustChangePassword, false);
    ok(await call(good.accessToken, 'get', '/api/tables'));
    // Tắt cài đặt → mật khẩu mẫu đăng nhập như trước
    await setBlock(false);
    const off = ok(await login('nv_yeu', 'Staff@123'));
    assert.equal(off.mustChangePassword, false);
    ok(await call(off.accessToken, 'get', '/api/tables'));
    await setBlock(true);
  });

  test('AC-102-02: tự đổi mật khẩu — sai mật khẩu đang dùng 403 (đếm lần sai), trùng cũ / dễ đoán (cả khi tắt) / quá ngắn 400; đúng → token mới dùng được, mật khẩu cũ hết dùng, nhật ký không chứa mật khẩu', async () => {
    const t = ok(await login('nv_yeu', 'Staff@123')).accessToken;
    const change = (token, body) => call(token, 'post', '/api/auth/change-password', body);
    const failsBefore = (await q1("SELECT COUNT(*) AS n FROM dbo.AuthFailures WHERE Kind = 'LOGIN' AND Username = 'nv_yeu'"))[0].n;
    const wrong = await change(t, { currentPassword: 'sai-mat-khau', newPassword: STRONG });
    assert.equal(wrong.status, 403);
    assert.equal(wrong.body.code, 'CURRENT_PASSWORD_INVALID');
    assert.equal(wrong.body.details.fields[0].path, 'currentPassword');
    assert.equal((await q1("SELECT COUNT(*) AS n FROM dbo.AuthFailures WHERE Kind = 'LOGIN' AND Username = 'nv_yeu'"))[0].n, failsBefore + 1);
    const same = await change(t, { currentPassword: 'Staff@123', newPassword: 'Staff@123' });
    assert.equal(same.body.code, 'PASSWORD_SAME');
    const weak = await change(t, { currentPassword: 'Staff@123', newPassword: '12345678' });
    assert.equal(weak.status, 400);
    assert.equal(weak.body.code, 'WEAK_PASSWORD');
    assert.equal(weak.body.details.fields[0].path, 'newPassword');
    assert.equal((await change(t, { currentPassword: 'Staff@123', newPassword: 'abc' })).body.code, 'VALIDATION_ERROR');
    // Tắt cài đặt: tự đổi vẫn không nhận mật khẩu dễ đoán
    await setBlock(false);
    const strongTok = ok(await login('nv_manh', 'Manh#Quay-2026')).accessToken;
    assert.equal((await change(strongTok, { currentPassword: 'Manh#Quay-2026', newPassword: 'nv_manh123' })).body.code, 'WEAK_PASSWORD');
    await setBlock(true);
    // Đổi đúng
    const done = ok(await change(t, { currentPassword: 'Staff@123', newPassword: STRONG }));
    assert.equal(done.user.mustChangePassword, false);
    assert.equal(done.user.passwordHash, undefined);
    ok(await call(done.accessToken, 'get', '/api/tables'));
    assert.equal((await call(t, 'get', '/api/tables')).body.code, 'PASSWORD_CHANGE_REQUIRED', 'token cũ vẫn bị giới hạn');
    assert.equal((await login('nv_yeu', 'Staff@123')).status, 401);
    assert.equal(ok(await login('nv_yeu', STRONG)).mustChangePassword, false);
    // Nhật ký thao tác: có dòng, không có mật khẩu / token
    const { flushAudit } = await import('../src/middleware/audit.js');
    await flushAudit();
    const [log] = await q1("SELECT TOP 1 UserId, AfterJson FROM dbo.AuditLogs WHERE Action = 'auth.change-password' ORDER BY AuditId DESC");
    assert.ok(log, 'thiếu nhật ký auth.change-password');
    assert.equal(log.UserId, await userId('nv_yeu'));
    for (const secret of ['Staff@123', STRONG, done.accessToken]) assert.ok(!log.AfterJson.includes(secret), 'nhật ký lộ mật khẩu / token');
  });

  test('AC-102-03: bật — chủ quán tạo tài khoản / đặt lại mật khẩu bằng mật khẩu dễ đoán → 400 WEAK_PASSWORD (ô password), không tạo / không đổi; tắt → như trước', async () => {
    for (const [u, p] of [
      ['thungan1', 'Staff@123'],
      ['thungan2', '123456'],
      ['thungan3', 'thungan3123'],
    ]) {
      const r = await createUser(u, p);
      assert.equal(r.status, 400, `${u}/${p}: ${r.status}`);
      assert.equal(r.body.code, 'WEAK_PASSWORD');
      assert.equal(r.body.details.fields[0].path, 'password');
      assert.equal((await q1(`SELECT COUNT(*) AS n FROM dbo.Users WHERE Username = '${u}'`))[0].n, 0);
    }
    ok(await createUser('thungan4', 'Thu-Ngan#Sang-4'), 201);
    const id = await userId('thungan4');
    const reset = await call(admin, 'post', `/api/admin/users/${id}/reset-password`, { password: 'Admin@123' });
    assert.equal(reset.body.code, 'WEAK_PASSWORD');
    assert.equal(ok(await login('thungan4', 'Thu-Ngan#Sang-4')).mustChangePassword, false, 'mật khẩu cũ còn nguyên');
    ok(await call(admin, 'post', `/api/admin/users/${id}/reset-password`, { password: 'Thu-Ngan#Chieu-4' }));
    await setBlock(false);
    ok(await createUser('thungan5', 'Staff@123'), 201);
    await setBlock(true);
  });

  test('AC-102-04: bật — mật khẩu đúng mà dễ đoán dùng ở ô duyệt / đặt PIN / xác nhận tạo chủ quán → 403 WEAK_PASSWORD_IN_USE, không có gì đổi; sai mật khẩu → lỗi cũ, vẫn đếm', async () => {
    ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 1_000_000 }), 201);
    const [{ MenuItemId: water }] = await q1("SELECT MenuItemId FROM dbo.MenuItems WHERE Name = N'Nước suối'");
    const sale = (creds) =>
      call(staff, 'post', '/api/orders/takeaway', {
        items: [{ menuItemId: water, quantity: 2 }],
        amountReceived: 100_000,
        manualDiscount: { kind: 'PERCENT', value: 15 },
        manualReason: 'khách quen',
        ...creds,
      });
    const paymentsBefore = (await q1('SELECT COUNT(*) AS n FROM dbo.Payments'))[0].n;
    for (const creds of [
      { adminUsername: 'admin', adminPassword: 'Admin@123' },
      { adminUsername: 'ql_yeu', adminPassword: 'Pass@123' },
    ]) {
      const r = await sale(creds);
      assert.equal(r.status, 403, JSON.stringify(r.body));
      assert.equal(r.body.code, 'WEAK_PASSWORD_IN_USE');
      assert.match(r.body.message, new RegExp(creds.adminUsername));
    }
    assert.equal((await q1('SELECT COUNT(*) AS n FROM dbo.Payments'))[0].n, paymentsBefore, 'không thu tiền khi bị từ chối');
    const approvals = "SELECT COUNT(*) AS n FROM dbo.AuthFailures WHERE Kind = 'APPROVAL' AND Username = 'ql_yeu'";
    const failsBefore = (await q1(approvals))[0].n;
    assert.equal((await sale({ adminUsername: 'ql_yeu', adminPassword: 'sai-mat-khau' })).body.code, 'ADMIN_APPROVAL_INVALID');
    assert.equal((await q1(approvals))[0].n, failsBefore + 1, 'sai mật khẩu vẫn đếm');
    ok(await sale({ adminUsername: 'ql_manh', adminPassword: 'Ql#Quan-Ly-2026' }), 201);
    // Đặt PIN của mình bằng mật khẩu mẫu (token cấp lúc còn tắt) / ở màn chấm công chung
    const own = await call(staff, 'post', '/api/auth/pin', { password: 'Staff@123', pin: '2580' });
    assert.equal(own.body.code, 'WEAK_PASSWORD_IN_USE');
    const kiosk = await call(staff, 'post', '/api/auth/pin/kiosk', { userId: await userId('nv_pin'), password: 'Staff@123', pin: '2581' });
    assert.equal(kiosk.body.code, 'WEAK_PASSWORD_IN_USE');
    assert.equal(
      (await call(staff, 'post', '/api/auth/pin/kiosk', { userId: await userId('nv_pin'), password: 'sai', pin: '2581' })).body.code,
      'PASSWORD_INVALID',
    );
    const pins = await q1("SELECT Username, PinHash FROM dbo.Users WHERE Username IN ('staff1', 'nv_pin')");
    assert.ok(
      pins.every((u) => u.PinHash === null),
      'chưa đặt PIN nào',
    );
    // Xác nhận tạo tài khoản Chủ quán bằng mật khẩu mẫu
    const owner = await call(admin, 'post', '/api/admin/users', {
      username: 'chu_hai',
      password: 'Chu#Quan-Hai-2026',
      fullName: 'Chủ quán hai',
      role: 'ADMIN',
      confirmPassword: 'Admin@123',
    });
    assert.equal(owner.status, 403);
    assert.equal(owner.body.code, 'WEAK_PASSWORD_IN_USE');
    assert.equal((await q1("SELECT COUNT(*) AS n FROM dbo.Users WHERE Username = 'chu_hai'"))[0].n, 0);
  });

  test('AC-102-05: blockWeakPasswords mặc định true (chưa có khóa); chủ quán tắt / bật; quản lý cửa hàng, trưởng ca, nhân viên đổi → 403', async () => {
    await pool.request().query("DELETE dbo.Settings WHERE SettingKey = 'security.block_weak_passwords'");
    settingsService.invalidateSettings();
    assert.equal(ok(await call(admin, 'get', '/api/admin/settings')).blockWeakPasswords, true);
    assert.equal(await setBlock(false), false);
    assert.equal(await setBlock(true), true);
    const mgr = ok(await login('ql_manh', 'Ql#Quan-Ly-2026')).accessToken;
    const r = await call(mgr, 'put', '/api/admin/settings', { blockWeakPasswords: false });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'OWNER_ONLY');
    const lead = ok(await login('tc_manh', 'Tc#Truong-Ca-2026')).accessToken;
    assert.equal((await call(lead, 'put', '/api/admin/settings', { blockWeakPasswords: false })).status, 403);
    assert.equal((await call(staff, 'put', '/api/admin/settings', { blockWeakPasswords: false })).status, 403);
    assert.equal(ok(await call(admin, 'get', '/api/admin/settings')).blockWeakPasswords, true);
  });
});
