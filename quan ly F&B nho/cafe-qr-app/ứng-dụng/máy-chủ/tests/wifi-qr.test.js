// F-059 — QR Wi-Fi cho khách in kèm QR bàn (BR-092): unit chuỗi QR Wi-Fi + integration (SQL Server thật) cài đặt / ảnh / quyền.
// Thứ tự trong describe là cố ý: AC-059-02 (chưa nhập Wi-Fi) chạy trước lần lưu đầu tiên.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, lead, wifiQrText, flushAudit, QRCode;

const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const wifiPng = (token = admin) => call(token, 'get', '/api/admin/wifi-qr.png').buffer(true);
/** Ảnh QR mong đợi — cùng tham số với adminService.wifiQrPng() → so từng byte (ảnh dựng từ đúng tên / mật khẩu đã lưu). */
const expectedPng = (ssid, password) => QRCode.toBuffer(wifiQrText({ ssid, password }), { type: 'png', width: 480, margin: 2, errorCorrectionLevel: 'M' });

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  ({ wifiQrText } = await import('../src/utils/wifiQr.js'));
  ({ flushAudit } = await import('../src/middleware/audit.js'));
  ({ default: QRCode } = await import('qrcode'));
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  const u = await call(admin, 'post', '/api/admin/users', { username: 'lead1', password: 'Pass@123', fullName: 'Trưởng ca 1', role: 'MANAGER' });
  assert.equal(u.status, 201, JSON.stringify(u.body));
  lead = await app.login('lead1', 'Pass@123');
});

after(() => app.close());

describe('QR Wi-Fi cho khách (F-059)', () => {
  test('AC-059-02: chưa nhập tên Wi-Fi → cài đặt trả tên / mật khẩu rỗng, GET /api/admin/wifi-qr.png → 404', async () => {
    const s = (await call(admin, 'get', '/api/admin/settings')).body;
    assert.deepEqual([s.wifiSsid, s.wifiPassword], ['', '']);
    const r = await wifiPng();
    assert.equal(r.status, 404, String(r.status));
  });

  test('AC-059-01: chuỗi QR Wi-Fi đúng định dạng, thoát ký tự \\ ; , : " — mạng không mật khẩu ra T:nopass', () => {
    assert.equal(wifiQrText({ ssid: 'QuanMoc-Khach', password: 'matkhau123' }), 'WIFI:T:WPA;S:QuanMoc-Khach;P:matkhau123;;');
    assert.equal(wifiQrText({ ssid: 'Quán "Mộc"; tầng 2', password: 'a:b,c\\d;e' }), 'WIFI:T:WPA;S:Quán \\"Mộc\\"\\; tầng 2;P:a\\:b\\,c\\\\d\\;e;;');
    assert.equal(wifiQrText({ ssid: 'Mien-phi', password: '' }), 'WIFI:T:nopass;S:Mien-phi;;');
  });

  test('AC-059-01: quản lý lưu tên Wi-Fi + mật khẩu → cài đặt trả đúng (mật khẩu giữ khoảng trắng); ảnh QR Wi-Fi 200 image/png', async () => {
    const r = await call(admin, 'put', '/api/admin/settings', { wifiSsid: '  QuanMoc-Khach  ', wifiPassword: ' mat khau 1 ' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.wifiSsid, r.body.wifiPassword], ['QuanMoc-Khach', ' mat khau 1 ']);
    const s = (await call(admin, 'get', '/api/admin/settings')).body;
    assert.deepEqual([s.wifiSsid, s.wifiPassword], ['QuanMoc-Khach', ' mat khau 1 ']);
    const png = await wifiPng();
    assert.equal(png.status, 200);
    assert.match(png.headers['content-type'], /^image\/png/);
    assert.ok(Buffer.from(png.body).subarray(0, 4).equals(PNG), 'là ảnh PNG');
    // Nội dung ảnh = QR của đúng tên + mật khẩu đã lưu (giữ khoảng trắng) — review G3
    assert.ok(Buffer.from(png.body).equals(await expectedPng('QuanMoc-Khach', ' mat khau 1 ')), 'ảnh QR khớp tên / mật khẩu đã lưu');
    // Mạng không mật khẩu → ảnh QR kiểu nopass
    assert.equal((await call(admin, 'put', '/api/admin/settings', { wifiPassword: '' })).status, 200);
    const open = await wifiPng();
    assert.equal(open.status, 200);
    assert.ok(Buffer.from(open.body).equals(await expectedPng('QuanMoc-Khach', '')), 'ảnh QR mạng không mật khẩu');
  });

  test('AC-059-03: tên > 32 byte, mật khẩu 1–7 / > 63 ký tự / có dấu, kết thúc bằng dấu gạch chéo ngược → 400, cài đặt không đổi; nhân viên / trưởng ca → 403, chưa đăng nhập → 401; nhật ký không chứa mật khẩu Wi-Fi', async () => {
    assert.equal((await call(admin, 'put', '/api/admin/settings', { wifiPassword: 'Bi-mat-9988' })).status, 200);
    const bad = [
      { wifiSsid: 'a'.repeat(33) },
      { wifiSsid: 'đ'.repeat(17) },
      { wifiSsid: 'Mang-quan\\' },
      { wifiPassword: '1234567' },
      { wifiPassword: 'x'.repeat(64) },
      { wifiPassword: 'matkhaú2025' }, // bộ gõ tiếng Việt bật khi nhập
      { wifiPassword: 'matkhau2025\\' },
    ];
    for (const body of bad) {
      const r = await call(admin, 'put', '/api/admin/settings', body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.body.code, 'VALIDATION_ERROR');
      assert.ok(
        r.body.details.fields.some((f) => f.path === Object.keys(body)[0]),
        JSON.stringify(r.body),
      );
    }
    const s = (await call(admin, 'get', '/api/admin/settings')).body;
    assert.deepEqual([s.wifiSsid, s.wifiPassword], ['QuanMoc-Khach', 'Bi-mat-9988']);
    // Biên hợp lệ: 32 byte, 8 / 63 ký tự
    for (const body of [{ wifiSsid: 'b'.repeat(32) }, { wifiPassword: '12345678' }, { wifiPassword: 'y'.repeat(63) }]) {
      assert.equal((await call(admin, 'put', '/api/admin/settings', body)).status, 200, JSON.stringify(body));
    }

    for (const token of [staff, lead]) {
      assert.equal((await call(token, 'put', '/api/admin/settings', { wifiSsid: 'Khac' })).status, 403);
      assert.equal((await wifiPng(token)).status, 403);
    }
    assert.equal((await api.put('/api/admin/settings').send({ wifiSsid: 'Khac' })).status, 401);
    assert.equal((await api.get('/api/admin/wifi-qr.png')).status, 401);

    assert.equal((await call(admin, 'put', '/api/admin/settings', { wifiSsid: 'QuanMoc-Khach', wifiPassword: 'Bi-mat-7766' })).status, 200);
    await flushAudit();
    const log = (await q1("SELECT TOP 1 BeforeJson, AfterJson FROM dbo.AuditLogs WHERE Action = 'settings.update' ORDER BY AuditId DESC"))[0];
    assert.ok(log, 'thiếu dòng nhật ký settings.update');
    assert.equal(JSON.parse(log.AfterJson).input.wifiSsid, 'QuanMoc-Khach', 'nhật ký vẫn ghi tên Wi-Fi');
    for (const secret of ['Bi-mat-7766', 'y'.repeat(63)]) {
      assert.ok(!`${log.BeforeJson}${log.AfterJson}`.includes(secret), 'nhật ký không chứa mật khẩu Wi-Fi');
    }
  });

  test('AC-059-02: xóa trống tên Wi-Fi → ảnh QR Wi-Fi lại 404', async () => {
    assert.equal((await wifiPng()).status, 200, 'đang có tên Wi-Fi → có ảnh'); // 404 phía dưới phải do xóa tên, không phải do thiếu endpoint
    assert.equal((await call(admin, 'put', '/api/admin/settings', { wifiSsid: '' })).status, 200);
    assert.equal((await wifiPng()).status, 404);
  });
});
