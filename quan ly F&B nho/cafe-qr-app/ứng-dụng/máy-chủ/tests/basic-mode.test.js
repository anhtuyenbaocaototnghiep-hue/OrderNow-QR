// F-061 chế độ cơ bản + hướng dẫn quầy, F-062 trang chính sách dữ liệu, F-063 cảnh báo QR sai địa chỉ (ADR-021, BR-096…BR-099).
// Integration (SQL Server thật). Phần giao diện (menu ẩn / hiện, lớp hướng dẫn, dải cảnh báo) kiểm ở E2E.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auth, startApp } from './helpers/harness.js';

const MIGRATION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../cơ-sở-dữ-liệu/chuyển-đổi/0041_che_do_co_ban_huong_dan.sql');
const ALL = ['inventory', 'customers', 'finance', 'analytics', 'advanced'];

let app, api, pool, admin, staff, lead, ids, config, qrCheckService;
const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const call = (token, method, p, body) => {
  const req = api[method](p).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  ({ config } = await import('../src/config.js'));
  qrCheckService = await import('../src/services/qrCheckService.js');
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ok(await call(admin, 'post', '/api/admin/users', { username: 'lead1', password: 'Pass@123', fullName: 'Trưởng ca 1', role: 'MANAGER' }), 201);
  lead = await app.login('lead1', 'Pass@123');
  ids = await app.ids();
});

after(() => app?.close());

describe('Chế độ cơ bản (F-061, BR-096)', () => {
  test('AC-061-01: quán mới (chưa lưu ui.modules) → auth/me trả modules rỗng, cài đặt uiModules rỗng; tài khoản do lệnh cài đặt tạo đã "xem" hướng dẫn', async () => {
    const me = ok(await call(admin, 'get', '/api/auth/me'));
    assert.deepEqual(me.modules, []);
    assert.ok(me.user.tourSeenAt, 'admin do seed tạo coi như đã xem');
    assert.deepEqual(ok(await call(admin, 'get', '/api/admin/settings')).uiModules, []);
    assert.deepEqual(ok(await call(staff, 'get', '/api/auth/me')).modules, []);
  });

  test('AC-061-02: lưu uiModules → đọc lại đúng, auth/me đổi theo; nhóm lạ / trùng → 400, không đổi; nhân viên / trưởng ca → 403', async () => {
    assert.deepEqual(ok(await call(admin, 'put', '/api/admin/settings', { uiModules: ['inventory', 'analytics'] })).uiModules, ['inventory', 'analytics']);
    assert.deepEqual(ok(await call(staff, 'get', '/api/auth/me')).modules, ['inventory', 'analytics']);
    for (const bad of [['kho'], ['inventory', 'inventory'], 'inventory']) {
      const r = await call(admin, 'put', '/api/admin/settings', { uiModules: bad });
      assert.equal(r.status, 400, JSON.stringify(bad));
    }
    assert.deepEqual(ok(await call(admin, 'get', '/api/admin/settings')).uiModules, ['inventory', 'analytics']);
    for (const token of [staff, lead]) assert.equal((await call(token, 'put', '/api/admin/settings', { uiModules: [] })).status, 403);
    // Tắt hết = chế độ cơ bản
    assert.deepEqual(ok(await call(admin, 'put', '/api/admin/settings', { uiModules: [] })).uiModules, []);
  });

  test('AC-061-03: nhóm đang ẩn chỉ ẩn menu — API vẫn 200; migration 0041 trên CSDL đã có đơn bật đủ 5 nhóm, tài khoản có sẵn = đã xem hướng dẫn', async () => {
    assert.deepEqual(ok(await call(admin, 'get', '/api/auth/me')).modules, []);
    for (const p of ['/api/admin/ingredients', '/api/admin/members', '/api/admin/reports/pnl?from=2026-10-01&to=2026-10-31', '/api/admin/audit-logs/facets'])
      assert.equal((await call(admin, 'get', p)).status, 200, p);

    // Giả lập CSDL trước nâng cấp: có đơn, chưa có cột TourSeenAt, chưa có ui.modules → chạy đúng file migration
    ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 0 }), 201); // F-055: khách gửi đơn cần ca đang mở
    const C = await app.customer();
    const sessionId = await app.seat(C, '01');
    ok(await C.post('/api/orders', { sessionId, items: [{ menuItemId: ids['Cà phê đen'], quantity: 1 }] }), 201);
    ok(await call(admin, 'post', '/api/admin/users', { username: 'cu1', password: 'Pass@123', fullName: 'Nhân viên cũ', role: 'STAFF' }), 201);
    await pool.request().batch("DELETE FROM dbo.Settings WHERE SettingKey = 'ui.modules'; ALTER TABLE dbo.Users DROP COLUMN TourSeenAt;");
    for (const batch of fs
      .readFileSync(MIGRATION, 'utf8')
      .split(/^\s*GO\s*$/m)
      .filter((b) => b.trim()))
      await pool.request().batch(batch);
    const [setting] = await q1("SELECT SettingValue FROM dbo.Settings WHERE SettingKey = 'ui.modules'");
    assert.equal(setting.SettingValue, ALL.join(','));
    assert.equal((await q1('SELECT COUNT(*) AS n FROM dbo.Users WHERE TourSeenAt IS NULL'))[0].n, 0, 'mọi tài khoản có sẵn = đã xem');
    // Chạy lại migration không đổi gì (đã có cột): tài khoản tạo sau nâng cấp vẫn "chưa xem"
    await pool.request().query("UPDATE dbo.Users SET TourSeenAt = NULL WHERE Username = 'cu1'");
    for (const batch of fs
      .readFileSync(MIGRATION, 'utf8')
      .split(/^\s*GO\s*$/m)
      .filter((b) => b.trim()))
      await pool.request().batch(batch);
    assert.equal((await q1("SELECT TourSeenAt FROM dbo.Users WHERE Username = 'cu1'"))[0].TourSeenAt, null, 'chạy lại không đánh dấu lại');
    ok(await call(admin, 'put', '/api/admin/settings', { uiModules: [] }));
  });

  test('AC-061-04: tài khoản mới chưa xem hướng dẫn → tour-seen ghi giờ, gọi lại không đổi; chưa đăng nhập → 401', async () => {
    ok(await call(admin, 'post', '/api/admin/users', { username: 'moi1', password: 'Pass@123', fullName: 'Nhân viên mới', role: 'STAFF' }), 201);
    const moi = await app.login('moi1', 'Pass@123');
    assert.equal(ok(await call(moi, 'get', '/api/auth/me')).user.tourSeenAt, null);
    const first = ok(await call(moi, 'post', '/api/auth/tour-seen')).tourSeenAt;
    assert.ok(first);
    assert.equal(ok(await call(moi, 'post', '/api/auth/tour-seen')).tourSeenAt, first, 'giữ lần đầu');
    assert.equal(ok(await call(moi, 'get', '/api/auth/me')).user.tourSeenAt, first);
    assert.equal((await api.post('/api/auth/tour-seen')).status, 401);
  });
});

describe('Chính sách dữ liệu (F-062, BR-098)', () => {
  test('AC-062-01: /chinh-sach-du-lieu mở không cần đăng nhập; /api/shop chỉ trả tên + địa chỉ quán theo Cài đặt', async () => {
    const page = await api.get('/chinh-sach-du-lieu');
    assert.equal(page.status, 200);
    for (const text of ['Quyền của bạn', 'Cách yêu cầu', 'Ẩn danh theo yêu cầu', 'Nghị định 13/2023/NĐ-CP']) assert.ok(page.text.includes(text), text);
    ok(await call(admin, 'put', '/api/admin/settings', { shopName: 'Quán Thử Chính Sách', shopAddress: '12 Đường Thử' }));
    assert.deepEqual(ok(await api.get('/api/shop')), { name: 'Quán Thử Chính Sách', address: '12 Đường Thử' });
  });

  test('AC-062-02: câu đồng ý phía khách và 2 hộp đăng ký ở quầy có link /chinh-sach-du-lieu; đăng ký thiếu đồng ý vẫn 400 CONSENT_REQUIRED', async () => {
    for (const file of ['/js/member-box.js', '/js/billing-controls.js', '/js/pages/pos-table-order.js']) {
      const r = await api.get(file);
      assert.equal(r.status, 200, file);
      assert.ok(r.text.includes("href: '/chinh-sach-du-lieu'"), file);
    }
    const C = await app.customer();
    const r = await C.post('/api/members', { phone: '0987654321', fullName: 'Khách Thử' });
    assert.deepEqual([r.status, r.body.code], [400, 'CONSENT_REQUIRED']);
  });
});

describe('Cảnh báo QR sai địa chỉ (F-063, BR-099)', () => {
  test('AC-063-01: chưa in → không lệch; quản lý báo đã in → lưu đúng địa chỉ đang chạy + giờ', async () => {
    const before = ok(await call(staff, 'get', '/api/qr-check'));
    assert.deepEqual([before.printedBaseUrl, before.mismatch, before.baseUrl], [null, false, config.publicBaseUrl]);
    const printed = ok(await call(admin, 'post', '/api/admin/qr-printed', {}));
    assert.equal(printed.printedBaseUrl, config.publicBaseUrl);
    assert.ok(Date.now() - Date.parse(printed.printedAt) < 60_000, 'giờ in vừa ghi');
    assert.equal(printed.mismatch, false);
  });

  test('AC-063-02: địa chỉ đang chạy khác lúc in → mismatch kèm cả hai địa chỉ; in lại → hết; IP trong PUBLIC_BASE_URL không còn trên máy → unreachable; localhost / 127.0.0.1 → localhost', async () => {
    const original = config.publicBaseUrl;
    try {
      config.publicBaseUrl = 'http://10.50.2.11:3000';
      ok(await call(admin, 'post', '/api/admin/qr-printed', {}));
      config.publicBaseUrl = 'http://172.168.238.72:3000'; // laptop đổi Wi-Fi
      const moved = ok(await call(staff, 'get', '/api/qr-check'));
      assert.deepEqual(
        [moved.mismatch, moved.printedBaseUrl, moved.baseUrl, moved.localhost],
        [true, 'http://10.50.2.11:3000', 'http://172.168.238.72:3000', false],
      );
      assert.equal(ok(await call(admin, 'post', '/api/admin/qr-printed', {})).mismatch, false);
      for (const [url, local] of [
        ['http://localhost:3000', true],
        ['http://127.0.0.1:3000', true],
        ['http://[::1]:3000', true],
        ['http://192.168.1.5:3000', false],
      ]) {
        config.publicBaseUrl = url;
        assert.equal(ok(await call(staff, 'get', '/api/qr-check')).localhost, local, url);
      }
      // .env ghi cứng IP cũ, laptop đổi mạng: địa chỉ lúc in = địa chỉ đang chạy (không lệch) nhưng máy không còn IP đó (review G3)
      config.publicBaseUrl = 'http://192.0.2.10:3000'; // dải TEST-NET-1 — không máy nào được cấp
      ok(await call(admin, 'post', '/api/admin/qr-printed', {}));
      const gone = ok(await call(staff, 'get', '/api/qr-check'));
      assert.deepEqual([gone.mismatch, gone.unreachable, Array.isArray(gone.machineIps)], [false, true, true]);
      for (const url of ['http://localhost:3000', 'http://may-chu-quan:3000']) {
        config.publicBaseUrl = url; // localhost có cảnh báo riêng; tên máy / tên miền thì không phán được
        assert.equal(ok(await call(staff, 'get', '/api/qr-check')).unreachable, false, url);
      }
      const [ip] = qrCheckService.machineIps();
      if (ip) {
        config.publicBaseUrl = `http://${ip}:3000`; // IP thật của máy đang chạy test
        assert.equal(ok(await call(staff, 'get', '/api/qr-check')).unreachable, false, ip);
      }
    } finally {
      config.publicBaseUrl = original;
    }
  });

  test('AC-063-03: quyền — qr-check: khách 401, nhân viên 200; qr-printed: nhân viên / trưởng ca 403', async () => {
    assert.equal((await api.get('/api/qr-check')).status, 401);
    assert.equal((await call(lead, 'get', '/api/qr-check')).status, 200);
    for (const token of [staff, lead]) assert.equal((await call(token, 'post', '/api/admin/qr-printed', {})).status, 403);
  });
});
