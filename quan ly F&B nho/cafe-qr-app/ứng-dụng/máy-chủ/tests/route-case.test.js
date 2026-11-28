// Integration test (SQL Server thật) DEF-036 — Express 5 định tuyến không phân biệt hoa / thường ("/members/5/Anonymize" chạy
// đúng handler của "/members/5/anonymize") → luật phân quyền trang Quản lý và luật nhật ký thao tác phải khớp y như vậy.
// Trước bản vá: quản lý cửa hàng ẩn danh được hội viên bằng "/Anonymize"; đổi cài đặt qua "/admin/SETTINGS" không ghi nhật ký.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, storeMgr, perms, audit;
let seq = 0;

const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body;
};
const newMember = async () =>
  ok(await call(staff, 'post', '/api/members', { phone: `090936${String(++seq).padStart(4, '0')}`, fullName: `Khách Hoa Thường ${seq}`, consent: true }), 201)
    .memberId;
const memberRow = async (id) => (await pool.request().input('id', id).query('SELECT FullName, IsActive FROM dbo.Members WHERE MemberId = @id')).recordset[0];

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  // Nạp module của src SAU harness (DEF-030: nạp trước thì cấu hình đọc DB thật)
  perms = await import('../src/auth/permissions.js');
  audit = await import('../src/middleware/audit.js');
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ok(await call(admin, 'post', '/api/admin/users', { username: 'ql_case', password: 'Pass@123', fullName: 'Quản lý thử hoa thường', role: 'STORE_MGR' }), 201);
  storeMgr = await app.login('ql_case', 'Pass@123');
});

after(() => app.close());

describe('Đường dẫn viết hoa / thường không lách được phân quyền và nhật ký (DEF-036)', () => {
  test('DEF-036: quản lý cửa hàng gọi ẩn danh hội viên bằng đường dẫn viết hoa / có "/" cuối → 403 OWNER_ONLY, hội viên còn nguyên; chủ quán gọi đường dẫn viết hoa vẫn chạy (route có thật)', async () => {
    const id = await newMember();
    for (const path of [
      `/api/admin/members/${id}/anonymize`,
      `/api/admin/members/${id}/Anonymize`,
      `/api/admin/Members/${id}/ANONYMIZE`,
      `/api/Admin/members/${id}/anonymize`,
      `/api/admin/members/${id}/Anonymize/`,
    ]) {
      const r = await call(storeMgr, 'post', path, {});
      assert.equal(r.status, 403, `${path}: ${r.status}`);
      assert.equal(r.body.code, 'OWNER_ONLY', path);
    }
    const row = await memberRow(id);
    assert.equal(row.IsActive, true, 'hội viên vẫn hoạt động');
    assert.match(row.FullName, /^Khách Hoa Thường/);
    // Đối chứng: Express thật sự đưa "/Anonymize" vào handler ẩn danh (nên 403 ở trên là do luật chặn, không phải 404)
    const other = await newMember();
    assert.equal(ok(await call(admin, 'post', `/api/admin/members/${other}/Anonymize`, {})).fullName, '(đã ẩn danh)');
    assert.equal((await memberRow(other)).IsActive, false);
  });

  test('DEF-036: chủ quán sửa cài đặt qua PUT /api/admin/SETTINGS hoặc /api/Admin/Settings → vẫn ghi Nhật ký thao tác settings.update (mỗi lần một dòng)', async () => {
    for (const path of ['/api/admin/SETTINGS', '/api/Admin/Settings']) {
      const msg = `Thử DEF-036 ${path}`;
      ok(await call(admin, 'put', path, { closedMessage: msg }));
      await audit.flushAudit();
      const logs = (await pool.request().query("SELECT TOP 5 AfterJson FROM dbo.AuditLogs WHERE Action = 'settings.update' ORDER BY AuditId DESC")).recordset;
      assert.equal(logs.filter((l) => JSON.parse(l.AfterJson).input?.closedMessage === msg).length, 1, `thiếu nhật ký cho ${path}`);
    }
  });

  test('DEF-036: luật khớp không phân biệt hoa / thường — chặn chủ-quán-riêng, phạm vi quản lý cửa hàng, nhật ký quầy và trang Quản lý; mã trong đường dẫn giữ nguyên chữ', () => {
    const { adminMay, capabilityForAdmin, storeManagerMay } = perms;
    const mgr = { role: 'STORE_MGR', grants: [] };
    for (const path of ['/members/5/Anonymize', '/MEMBERS/5/ANONYMIZE', '/members/5/anonymize/']) {
      assert.equal(adminMay(mgr, 'POST', path), false, path);
      assert.equal(capabilityForAdmin('POST', path), null, path);
    }
    assert.equal(adminMay(mgr, 'GET', '/alerts/Mail-Status'), false, 'email cảnh báo chỉ chủ quán');
    assert.equal(storeManagerMay('GET', '/Reports/PNL'), false, 'lãi / lỗ không mở cho quản lý cửa hàng');
    assert.equal(storeManagerMay('GET', '/Menu-Items'), true, 'phần được mở vẫn mở khi viết hoa');
    assert.equal(storeManagerMay('GET', '/REPORTS/revenue'), true);
    assert.equal(storeManagerMay('PUT', '/Settings'), true);

    const { matchRule } = audit;
    assert.deepEqual(matchRule('POST', '/Shifts/3/CLOSE'), { action: 'shift.close', entity: 'Shift', entityId: '3' });
    assert.deepEqual(matchRule('POST', '/Payments/7/Refunds'), { action: 'payment.refund', entity: 'Payment', entityId: '7' });
    assert.deepEqual(matchRule('POST', '/Cash-Transactions/4/VOID'), { action: 'cash.void', entity: 'CashTransaction', entityId: '4' });
    assert.deepEqual(matchRule('PUT', '/admin/SETTINGS'), { action: 'settings.update', entity: 'Settings', entityId: null });
    assert.deepEqual(matchRule('PUT', '/Admin/Menu-Items/9/BOM'), { action: 'menu-items.bom', entity: 'MenuItem', entityId: '9' });
    assert.deepEqual(matchRule('POST', '/admin/Purchase-Orders/From-Suggestion'), {
      action: 'purchase-orders.from-suggestion',
      entity: 'PurchaseOrder',
      entityId: null,
    });
    assert.deepEqual(matchRule('PUT', '/ADMIN/units/KG'), { action: 'units.update', entity: 'Unit', entityId: 'KG' });
    assert.equal(matchRule('POST', '/admin/segments/Preview'), null, 'xem trước không ghi');
  });
});
