// F-091 (TASK-112, ADR-053 D-227) — số điện thoại liên lạc của tài khoản nhân viên: không bắt buộc, chuẩn hóa như SĐT hội viên
// (lưu '+84…', trả số nội địa), sai định dạng → 400, sửa không gửi = giữ, '' = xóa; chỉ chủ quán thấy; nhật ký thao tác che số.
// SQL Server thật; số điện thoại giả.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, flushAudit;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const q1 = async (text) => (await pool.request().query(text)).recordset;
const account = (username, extra = {}) => ({ username, password: 'Pass@123', fullName: `TK ${username}`, role: 'STAFF', ...extra });
const phoneOf = async (userId) => ok(await call(admin, 'get', '/api/admin/users')).find((u) => u.userId === userId).phone;

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  ({ flushAudit } = await import('../src/middleware/audit.js'));
});

after(() => app?.close());

describe('Số điện thoại tài khoản (F-091)', () => {
  test('AC-091-01: số điện thoại tài khoản — tạo kèm số (có dấu cách / +84 / 84) lưu chuẩn +84, danh sách trả số nội địa; sai định dạng → 400 ô phone; sửa không gửi số thì giữ, gửi số mới thì đổi, gửi rỗng thì xóa; quản lý cửa hàng xem danh sách không thấy số; nhật ký thao tác che số', async () => {
    const a = ok(await call(admin, 'post', '/api/admin/users', account('sdt_a', { phone: '0912 345 678' })), 201);
    assert.equal(a.phone, '0912345678');
    assert.equal((await q1(`SELECT Phone FROM dbo.Users WHERE UserId = ${a.userId}`))[0].Phone, '+84912345678');
    assert.equal(await phoneOf(a.userId), '0912345678');
    assert.equal(ok(await call(admin, 'post', '/api/admin/users', account('sdt_b', { role: 'MANAGER', phone: '+84987654321' })), 201).phone, '0987654321');
    assert.equal(ok(await call(admin, 'post', '/api/admin/users', account('sdt_c', { phone: '84911222333' })), 201).phone, '0911222333');
    const c = ok(await call(admin, 'post', '/api/admin/users', account('sdt_d')), 201);
    assert.equal(c.phone, null, 'không bắt buộc');

    for (const bad of ['12345', '0912 345', '091234567890', 'abc', '1912345678']) {
      const r = await call(admin, 'post', '/api/admin/users', account('sdt_x', { phone: bad }));
      assert.deepEqual([r.status, r.body.code], [400, 'VALIDATION_ERROR'], `${bad}: ${JSON.stringify(r.body)}`);
      assert.ok(
        r.body.details.fields.some((f) => f.path === 'phone'),
        bad,
      );
    }
    assert.equal((await q1("SELECT COUNT(*) AS N FROM dbo.Users WHERE Username = 'sdt_x'"))[0].N, 0, 'lỗi thì không tạo');

    ok(await call(admin, 'put', `/api/admin/users/${a.userId}`, { fullName: 'TK sdt_a (sửa tên)', role: 'STAFF' }));
    assert.equal(await phoneOf(a.userId), '0912345678', 'không gửi số → giữ');
    assert.equal(
      ok(await call(admin, 'put', `/api/admin/users/${a.userId}`, { fullName: 'TK sdt_a', role: 'STAFF', phone: '0933 444 555' })).phone,
      '0933444555',
    );
    assert.equal(ok(await call(admin, 'put', `/api/admin/users/${a.userId}`, { fullName: 'TK sdt_a', role: 'STAFF', phone: '' })).phone, null);
    assert.equal(await phoneOf(a.userId), null, 'rỗng → xóa');
    ok(await call(admin, 'put', `/api/admin/users/${a.userId}`, { fullName: 'TK sdt_a', role: 'STAFF', phone: '0912345678' }));

    // Quản lý cửa hàng đọc danh sách tài khoản (quyền Nhân sự — xếp lịch) nhưng không nhận số điện thoại
    ok(await call(admin, 'post', '/api/admin/users', account('sdt_ql', { role: 'STORE_MGR', phone: '0977000111' })), 201);
    const seen = ok(await call(await app.login('sdt_ql', 'Pass@123'), 'get', '/api/admin/users'));
    assert.ok(seen.length > 0 && seen.every((u) => !('phone' in u)), JSON.stringify(seen[0]));

    // Nhật ký thao tác: không lưu nguyên số
    await flushAudit();
    const logs = await q1("SELECT ISNULL(BeforeJson, '') + ISNULL(AfterJson, '') AS J FROM dbo.AuditLogs WHERE Entity = 'User'");
    assert.ok(logs.length > 0, 'có nhật ký tạo / sửa tài khoản');
    for (const { J } of logs) assert.ok(!/912345678|933444555|977000111/.test(J), J.slice(0, 200));
    assert.ok(
      logs.some(({ J }) => J.includes('***678')),
      'số được che còn 3 số cuối',
    );
  });
});
