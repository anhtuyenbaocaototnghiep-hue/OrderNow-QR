// F-090 (ADR-051 D-223) — quyền mặc định của vai trò + vị trí cho hộp Thêm / Sửa tài khoản: GET /api/admin/role-permissions
// (máy chủ tính bằng đúng luật kiểm quyền — giao diện không chép luật). Chỉ chủ quán. SQL Server thật.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, admin;
const call = (token, method, path, body) => {
  const req = token ? api[method](path).set(auth(token)) : api[method](path);
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const fail = (r, status, code) => assert.deepEqual([r.status, r.body.code], [status, code], JSON.stringify(r.body));
const defaults = (qs, token = admin) => call(token, 'get', `/api/admin/role-permissions${qs}`);
const allowed = (body) =>
  body.items
    .filter((i) => i.byRole)
    .map((i) => i.key)
    .sort();
const POS = ['pos.barista', 'pos.cashier', 'pos.server'];
const LEAD = [...POS, 'attendance.edit', 'dashboard.view', 'stock.count'].sort();

before(async () => {
  app = await startApp();
  ({ api } = app);
  admin = await app.login('admin', 'Admin@123');
});

after(() => app?.close());

describe('Quyền mặc định của vai trò (F-090)', () => {
  test('AC-090-01: quyền mặc định theo vai trò + vị trí — nhân viên chưa chọn vị trí làm cả 3 việc máy quầy, chọn vị trí thì chỉ việc của vị trí đó; trưởng ca thêm kiểm kê / sửa chấm công / Hôm nay; quản lý cửa hàng có trang Quản lý trừ thu chi, lương, nhật ký; chủ quán đủ cả; khớp hộp quyền của tài khoản thật; vai / vị trí lạ → 400; chỉ chủ quán gọi được', async () => {
    const staffAll = ok(await defaults('?role=STAFF'));
    assert.deepEqual(allowed(staffAll), POS);
    assert.equal(staffAll.items.length, 17); // đủ danh mục quyền cấp được (CAPABILITIES)
    assert.deepEqual(allowed(ok(await defaults('?role=STAFF&positions=SERVER'))), ['pos.server']);
    const two = ok(await defaults('?role=STAFF&positions=CASHIER,SERVER,SERVER'));
    assert.deepEqual(
      [allowed(two), two.positions],
      [
        ['pos.cashier', 'pos.server'],
        ['CASHIER', 'SERVER'],
      ],
    );
    assert.deepEqual(allowed(ok(await defaults('?role=MANAGER&positions=SERVER'))), LEAD, 'vị trí chỉ áp cho nhân viên');
    const store = ok(await defaults('?role=STORE_MGR'));
    assert.deepEqual(
      store.items
        .filter((i) => !i.byRole)
        .map((i) => i.key)
        .sort(),
      ['admin.audit', 'admin.payroll', 'admin.pnl'],
    );
    assert.ok(ok(await defaults('?role=ADMIN')).items.every((i) => i.byRole));
    const cash = staffAll.items.find((i) => i.key === 'pos.cashier');
    assert.deepEqual([cash.group, cash.label, cash.money], ['Máy quầy', 'Thu tiền, bán mang đi, mở / đóng ca, hoàn tiền, ghi thu chi', true]);

    // Khớp hộp quyền (grantsView.byRole) của một tài khoản thật cùng vai / vị trí
    const u = ok(
      await call(admin, 'post', '/api/admin/users', {
        username: 'rp_pv',
        password: 'Pass@123',
        fullName: 'Phục vụ pha',
        role: 'STAFF',
        positions: ['SERVER', 'BARISTA'],
      }),
      201,
    );
    const view = ok(await call(admin, 'get', `/api/admin/users/${u.userId}/grants`));
    const pre = ok(await defaults('?role=STAFF&positions=BARISTA,SERVER'));
    assert.deepEqual(
      pre.items.map((i) => [i.key, i.byRole]),
      view.items.map((i) => [i.key, i.byRole]),
    );

    fail(await defaults('?role=KING'), 400, 'VALIDATION_ERROR');
    fail(await defaults('?role=STAFF&positions=CHEF'), 400, 'VALIDATION_ERROR');
    fail(await defaults(''), 400, 'VALIDATION_ERROR');

    // Chỉ chủ quán (tài khoản & phân quyền — không cấp được)
    ok(await call(admin, 'post', '/api/admin/users', { username: 'rp_ql', password: 'Pass@123', fullName: 'Quản lý RP', role: 'STORE_MGR' }), 201);
    fail(await defaults('?role=STAFF', await app.login('rp_ql', 'Pass@123')), 403, 'OWNER_ONLY');
    fail(await defaults('?role=STAFF', await app.login('staff1', 'Staff@123')), 403, 'FORBIDDEN');
    assert.equal((await defaults('?role=STAFF', null)).status, 401);
  });
});
