// F-096 (TASK-117, ADR-058) — thêm tài khoản Chủ quán: tạo / nâng thành ADMIN cần mật khẩu của chính người thao tác (thiếu 400,
// sai 403, sai 5 lần 429), chủ quán mới dùng trang Quản lý (không vào máy quầy), cảnh báo ACCESS_GRANT cho chủ quán, quản lý cửa
// hàng không tạo được. Chốt "luôn còn một chủ quán" (LAST_ADMIN) đã có test riêng ở finance.test.js. SQL Server thật.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, admin;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const ownerAlerts = async (token) =>
  ok(await call(token, 'get', '/api/admin/alerts?status=ALL')).alerts.filter((a) => a.kind === 'ACCESS_GRANT' && /Chủ quán/.test(a.title));

before(async () => {
  app = await startApp();
  ({ api } = app);
  admin = await app.login('admin', 'Admin@123');
});

after(() => app?.close());

describe('Thêm tài khoản chủ quán (F-096)', () => {
  test('AC-096-01: tạo / nâng tài khoản Chủ quán cần mật khẩu của người thao tác (thiếu 400, sai 403, sai 5 lần 429); chủ quán mới vào được trang Quản lý, không vào máy quầy; có cảnh báo cho chủ quán; quản lý cửa hàng không tạo được', async () => {
    const owner = { username: 'chuquan2', password: 'Pass@123', fullName: 'Chủ quán Hai', role: 'ADMIN' };
    // Thiếu xác nhận → 400 ở ô confirmPassword; sai → 403 OWNER_CONFIRM_INVALID (cũng chỉ vào ô) — chưa tạo gì
    let r = await call(admin, 'post', '/api/admin/users', owner);
    assert.deepEqual([r.status, r.body.code, r.body.details?.fields?.[0]?.path], [400, 'VALIDATION_ERROR', 'confirmPassword']);
    r = await call(admin, 'post', '/api/admin/users', { ...owner, confirmPassword: 'sai-mat-khau' });
    assert.deepEqual([r.status, r.body.code, r.body.details?.fields?.[0]?.path], [403, 'OWNER_CONFIRM_INVALID', 'confirmPassword']);
    assert.equal((await app.login('chuquan2', 'Pass@123').catch(() => null)) ?? null, null, 'chưa có tài khoản');

    // Đúng mật khẩu → tạo được; chủ quán mới đăng nhập trang Quản lý, gọi được Tài khoản; máy quầy → 403 OWNER_ADMIN_ONLY
    const created = ok(await call(admin, 'post', '/api/admin/users', { ...owner, confirmPassword: 'Admin@123' }), 201);
    assert.equal(created.role, 'ADMIN');
    const owner2 = await app.login('chuquan2', 'Pass@123');
    assert.ok(Array.isArray(ok(await call(owner2, 'get', '/api/admin/users'))));
    const pos = await api.post('/api/auth/login').send({ username: 'chuquan2', password: 'Pass@123', area: 'pos' });
    assert.deepEqual([pos.status, pos.body.code], [403, 'OWNER_ADMIN_ONLY']);

    // Nhân viên: tạo không cần xác nhận; nâng thành chủ quán cần xác nhận; sửa tên chủ quán (đã là ADMIN) không cần
    const staff = ok(
      await call(admin, 'post', '/api/admin/users', { username: 'nv_len_chu', password: 'Pass@123', fullName: 'NV lên chủ', role: 'STAFF' }),
      201,
    );
    r = await call(admin, 'put', `/api/admin/users/${staff.userId}`, { fullName: 'NV lên chủ', role: 'ADMIN' });
    assert.deepEqual([r.status, r.body.details?.fields?.[0]?.path], [400, 'confirmPassword']);
    assert.equal(
      ok(await call(admin, 'put', `/api/admin/users/${staff.userId}`, { fullName: 'NV lên chủ', role: 'ADMIN', confirmPassword: 'Admin@123' })).role,
      'ADMIN',
    );
    assert.equal(ok(await call(admin, 'put', `/api/admin/users/${created.userId}`, { fullName: 'Chủ quán 2', role: 'ADMIN' })).fullName, 'Chủ quán 2');

    // Cảnh báo cho mọi chủ quán (tạo + nâng), quản lý cửa hàng không thấy và không tạo được tài khoản
    const titles = (await ownerAlerts(owner2)).map((a) => a.title);
    assert.ok(
      titles.some((t) => t.includes('tạo tài khoản Chủ quán') && t.includes('Chủ quán Hai')),
      titles.join(' | '),
    );
    assert.ok(
      titles.some((t) => t.includes('NV lên chủ') && t.includes('thành Chủ quán')),
      titles.join(' | '),
    );
    ok(await call(admin, 'post', '/api/admin/users', { username: 'ql_chu', password: 'Pass@123', fullName: 'QL cửa hàng', role: 'STORE_MGR' }), 201);
    const store = await app.login('ql_chu', 'Pass@123');
    assert.equal((await call(store, 'get', '/api/admin/alerts?status=ALL')).body.alerts?.filter((a) => /Chủ quán/.test(a.title)).length ?? 0, 0);
    r = await call(store, 'post', '/api/admin/users', {
      username: 'ql_tao_chu',
      password: 'Pass@123',
      fullName: 'X',
      role: 'ADMIN',
      confirmPassword: 'Pass@123',
    });
    assert.equal(r.status, 403);

    // Sai 5 lần / 15 phút → khóa tạm (429), kể cả lần sau gõ đúng; đã sai 1 lần ở trên
    for (let i = 0; i < 4; i++) {
      r = await call(admin, 'post', '/api/admin/users', { ...owner, username: `chuquan_x${i}`, confirmPassword: 'van-sai' });
      assert.equal(r.status, 403, `lần sai thứ ${i + 2}`);
    }
    r = await call(admin, 'post', '/api/admin/users', { ...owner, username: 'chuquan_khoa', confirmPassword: 'Admin@123' });
    assert.equal(r.status, 429);
  });
});
