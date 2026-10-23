// Integration test (SQL Server thật) F-053 — đổi tên quán / địa chỉ trong Cài đặt (BR-085).
// Thứ tự trong describe là cố ý: AC-053-02 (mặc định từ .env) chạy trước lần lưu đầu tiên.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, lead, ids, config, flushAudit, sessionId;

const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
/** Tên / địa chỉ quán ở mọi nơi đọc được: cài đặt, /auth/me, /menu (khách), hóa đơn phiên (tạm tính). */
async function shopEverywhere() {
  const settings = (await call(admin, 'get', '/api/admin/settings')).body;
  const me = (await call(staff, 'get', '/api/auth/me')).body.shop;
  const menu = (await api.get('/api/menu')).body.shop;
  const receipt = (await call(staff, 'get', `/api/sessions/${sessionId}/receipt?mode=provisional`)).body.shop;
  return { settings: { name: settings.shopName, address: settings.shopAddress }, me, menu, receipt };
}

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  ({ config } = await import('../src/config.js'));
  ({ flushAudit } = await import('../src/middleware/audit.js'));
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  const u = await call(admin, 'post', '/api/admin/users', { username: 'lead1', password: 'Pass@123', fullName: 'Trưởng ca 1', role: 'MANAGER' });
  assert.equal(u.status, 201, JSON.stringify(u.body));
  lead = await app.login('lead1', 'Pass@123');
  ids = await app.ids();
  // Một phiên có đơn để in phiếu tạm tính — khách gửi đơn cần ca đang mở (F-055, ADR-017 D-64)
  assert.equal((await call(staff, 'post', '/api/shifts/open', { openingCash: 0 })).status, 201);
  const C = await app.customer();
  sessionId = await app.seat(C, '01');
  const o = await C.post('/api/orders', { sessionId, items: [{ menuItemId: ids['Cà phê đen'], quantity: 1 }] });
  assert.equal(o.status, 201, JSON.stringify(o.body));
});

after(() => app.close());

describe('Đổi tên quán và địa chỉ trong Cài đặt (F-053)', () => {
  test('AC-053-02: chưa từng lưu tên quán → cài đặt, /auth/me, /menu và hóa đơn dùng SHOP_NAME / SHOP_ADDRESS của .env', async () => {
    assert.equal((await q1("SELECT COUNT(*) AS n FROM dbo.Settings WHERE SettingKey LIKE 'shop.%'"))[0].n, 0);
    const s = await shopEverywhere();
    assert.deepEqual(s.settings, { name: config.shop.name, address: config.shop.address });
    assert.deepEqual(s.me, { name: config.shop.name, address: config.shop.address });
    assert.deepEqual(s.menu, { name: config.shop.name });
    assert.deepEqual(s.receipt, { name: config.shop.name, address: config.shop.address });
  });

  test('AC-053-01: quản lý lưu tên "Cà phê Mộc Test" + địa chỉ → cài đặt, /auth/me, /menu, hóa đơn phiên đều đổi; Nhật ký thao tác ghi tên cũ → mới', async () => {
    const r = await call(admin, 'put', '/api/admin/settings', { shopName: '  Cà phê Mộc Test  ', shopAddress: '12 Lê Lợi, phường Bến Nghé' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.shopName, 'Cà phê Mộc Test'); // bỏ khoảng trắng hai đầu
    // Lần đổi đầu tiên (chưa có dòng shop.* — tên đang dùng lấy từ .env): nhật ký vẫn có tên cũ → mới (review G3)
    await flushAudit();
    const first = (await q1("SELECT TOP 1 BeforeJson, AfterJson FROM dbo.AuditLogs WHERE Action = 'settings.update' ORDER BY AuditId DESC"))[0];
    assert.equal(JSON.parse(first.BeforeJson)['shop.name'], config.shop.name);
    assert.equal(JSON.parse(first.BeforeJson)['shop.address'], config.shop.address);
    assert.equal(JSON.parse(first.AfterJson).result.shopName, 'Cà phê Mộc Test');
    const s = await shopEverywhere();
    const want = { name: 'Cà phê Mộc Test', address: '12 Lê Lợi, phường Bến Nghé' };
    assert.deepEqual(s.settings, want);
    assert.deepEqual(s.me, want);
    assert.deepEqual(s.menu, { name: want.name });
    assert.deepEqual(s.receipt, want);
    // Lần đổi thứ hai: nhật ký có tên cũ (BeforeJson) → tên mới (AfterJson)
    assert.equal((await call(admin, 'put', '/api/admin/settings', { shopName: 'Cà phê Mộc 2' })).status, 200);
    await flushAudit();
    const log = (await q1("SELECT TOP 1 BeforeJson, AfterJson FROM dbo.AuditLogs WHERE Action = 'settings.update' ORDER BY AuditId DESC"))[0];
    assert.ok(log, 'thiếu dòng nhật ký settings.update');
    // BeforeJson = ảnh bảng Settings trước khi sửa; AfterJson = { input, result } của request
    assert.equal(JSON.parse(log.BeforeJson)['shop.name'], 'Cà phê Mộc Test');
    assert.equal(JSON.parse(log.AfterJson).input.shopName, 'Cà phê Mộc 2');
    assert.equal(JSON.parse(log.AfterJson).result.shopName, 'Cà phê Mộc 2');
    assert.equal((await call(staff, 'get', '/api/auth/me')).body.shop.name, 'Cà phê Mộc 2');
  });

  test('AC-053-03: tên rỗng / chỉ khoảng trắng / > 100 ký tự, địa chỉ > 200 ký tự → 400 VALIDATION_ERROR, tên đang dùng không đổi', async () => {
    for (const body of [{ shopName: '' }, { shopName: '    ' }, { shopName: 'x'.repeat(101) }, { shopAddress: 'y'.repeat(201) }]) {
      const r = await call(admin, 'put', '/api/admin/settings', body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.body.code, 'VALIDATION_ERROR');
      assert.ok(
        r.body.details.fields.some((f) => f.path === Object.keys(body)[0]),
        JSON.stringify(r.body),
      );
    }
    // Ngay sau các lần bị từ chối: tên / địa chỉ đang dùng không đổi (review G3)
    assert.deepEqual((await call(staff, 'get', '/api/auth/me')).body.shop, { name: 'Cà phê Mộc 2', address: '12 Lê Lợi, phường Bến Nghé' });
    // Biên hợp lệ: đúng 100 / 200 ký tự
    assert.equal((await call(admin, 'put', '/api/admin/settings', { shopName: 'x'.repeat(100), shopAddress: 'y'.repeat(200) })).status, 200);
    assert.equal((await call(admin, 'put', '/api/admin/settings', { shopName: 'Cà phê Mộc 2', shopAddress: '12 Lê Lợi' })).status, 200);
    assert.equal((await call(staff, 'get', '/api/auth/me')).body.shop.name, 'Cà phê Mộc 2');
  });

  test('AC-053-04: nhân viên, trưởng ca sửa cài đặt → 403; chưa đăng nhập → 401', async () => {
    assert.equal((await call(staff, 'put', '/api/admin/settings', { shopName: 'Quán khác' })).status, 403);
    assert.equal((await call(lead, 'put', '/api/admin/settings', { shopName: 'Quán khác' })).status, 403);
    assert.equal((await api.put('/api/admin/settings').send({ shopName: 'Quán khác' })).status, 401);
    assert.equal((await call(staff, 'get', '/api/auth/me')).body.shop.name, 'Cà phê Mộc 2');
  });

  test('AC-053-02 (địa chỉ rỗng): lưu địa chỉ rỗng → hóa đơn không còn địa chỉ', async () => {
    assert.equal((await call(admin, 'put', '/api/admin/settings', { shopAddress: '' })).status, 200);
    const s = await shopEverywhere();
    assert.equal(s.receipt.address, '');
    assert.equal(s.me.address, '');
    assert.equal(s.receipt.name, 'Cà phê Mộc 2');
  });
});
