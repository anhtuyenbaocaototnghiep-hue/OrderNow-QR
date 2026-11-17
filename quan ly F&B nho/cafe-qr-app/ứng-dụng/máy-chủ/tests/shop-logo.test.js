// F-095 (TASK-116, ADR-057) — logo quán: chủ quán tải ảnh (thân request là ảnh như ảnh hóa đơn F-033), /api/shop · /api/menu ·
// /api/auth/me trả logoUrl, GET /api/shop/logo trả tệp; ảnh mới thay ảnh cũ (tệp cũ bị xóa); sai định dạng / quá cỡ → 400; quyền.
// SQL Server thật; ảnh lưu ở thư mục tạm của môi trường test (config.uploadsDir).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { auth, startApp } from './helpers/harness.js';

// Ảnh png 1×1 thật (trình duyệt vẽ được) + chữ ký jpg (máy chủ chỉ kiểm chữ ký tệp, không giải mã ảnh)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);

let app, api, admin;
const call = (token, method, p, body) => {
  const req = api[method](p).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const putLogo = (token, buf, type = 'image/png') => {
  const req = api.put('/api/admin/settings/logo').set('Content-Type', type);
  return (token ? req.set(auth(token)) : req).send(buf);
};
// Thư mục ảnh của môi trường test (useTestDatabase đặt UPLOADS_DIR) — KHÔNG import config của src trước harness (sẽ trỏ dữ liệu thật)
const fileOf = (logoUrl) => path.join(process.env.UPLOADS_DIR, 'brand', decodeURIComponent(logoUrl.split('?v=')[1]));

before(async () => {
  app = await startApp();
  ({ api } = app);
  admin = await app.login('admin', 'Admin@123');
});

after(async () => {
  if (api && admin) await call(admin, 'delete', '/api/admin/settings/logo'); // không để logo thử lại cho file test sau
  await app?.close();
});

describe('Logo quán (F-095)', () => {
  test('AC-095-01: chủ quán tải logo png → logoUrl ở /shop, /menu, /auth/me, ảnh trả đúng; ảnh mới thay ảnh cũ (tệp cũ bị xóa); sai định dạng / quá 1 MB → 400; quản lý cửa hàng, nhân viên 403, chưa đăng nhập 401; bỏ logo → null, ảnh 404', async () => {
    ok(await call(admin, 'delete', '/api/admin/settings/logo'));
    assert.equal(ok(await api.get('/api/shop')).logoUrl, null, 'chưa có logo');
    assert.equal((await api.get('/api/shop/logo')).status, 404);

    // Tải png → một địa chỉ có ?v=<tên tệp>, cả ba nơi đọc thông tin quán đều trả cùng địa chỉ
    const first = ok(await putLogo(admin, PNG));
    assert.match(first.logoUrl, /^\/api\/shop\/logo\?v=logo-[0-9a-f]{16}\.png$/);
    assert.equal(ok(await api.get('/api/shop')).logoUrl, first.logoUrl);
    assert.equal(ok(await api.get('/api/menu')).shop.logoUrl, first.logoUrl);
    assert.equal(ok(await call(admin, 'get', '/api/auth/me')).shop.logoUrl, first.logoUrl);
    const img = await api.get(first.logoUrl).buffer(true);
    assert.equal(img.status, 200);
    assert.equal(img.headers['content-type'], 'image/png');
    assert.match(img.headers['cache-control'], /immutable/);
    assert.ok(Buffer.from(img.body).equals(PNG), 'trả đúng nội dung ảnh');
    assert.ok(fs.existsSync(fileOf(first.logoUrl)));

    // Ảnh mới (jpg) thay ảnh cũ: địa chỉ đổi, tệp cũ bị xóa
    const second = ok(await putLogo(admin, JPG, 'image/jpeg'));
    assert.match(second.logoUrl, /\.jpg$/);
    assert.notEqual(second.logoUrl, first.logoUrl);
    assert.ok(!fs.existsSync(fileOf(first.logoUrl)), 'tệp logo cũ bị xóa');
    assert.equal((await api.get('/api/shop/logo')).headers['content-type'], 'image/jpeg');

    // Sai định dạng (gif, svg có mã chạy, chữ) → 400 LOGO_INVALID; quá 1 MB → 400 LOGO_TOO_LARGE; logo đang dùng không đổi
    for (const [buf, type] of [
      [Buffer.from('GIF89a' + 'x'.repeat(40), 'latin1'), 'image/gif'],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml'],
      [Buffer.from('không phải ảnh'), 'application/octet-stream'],
    ]) {
      const r = await putLogo(admin, buf, type);
      assert.deepEqual([r.status, r.body.code], [400, 'LOGO_INVALID'], type);
    }
    const big = await putLogo(admin, Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(1024 * 1024 + 1)]));
    assert.deepEqual([big.status, big.body.code], [400, 'LOGO_TOO_LARGE']);
    assert.equal(ok(await api.get('/api/shop')).logoUrl, second.logoUrl);

    // Quyền: chỉ chủ quán (như tên / địa chỉ quán)
    ok(await call(admin, 'post', '/api/admin/users', { username: 'ql_logo', password: 'Pass@123', fullName: 'QL logo', role: 'STORE_MGR' }), 201);
    const storeMgr = await app.login('ql_logo', 'Pass@123');
    assert.equal((await putLogo(storeMgr, PNG)).status, 403);
    assert.equal((await call(storeMgr, 'delete', '/api/admin/settings/logo')).status, 403);
    assert.equal((await putLogo(await app.login('staff1', 'Staff@123'), PNG)).status, 403);
    assert.equal((await putLogo(null, PNG)).status, 401);
    assert.equal(ok(await api.get('/api/shop')).logoUrl, second.logoUrl);

    // Bỏ logo → null ở mọi nơi, ảnh 404, tệp bị xóa
    assert.deepEqual(ok(await call(admin, 'delete', '/api/admin/settings/logo')), { logoUrl: null });
    assert.equal(ok(await api.get('/api/shop')).logoUrl, null);
    assert.equal(ok(await api.get('/api/menu')).shop.logoUrl, null);
    assert.equal((await api.get('/api/shop/logo')).status, 404);
    assert.ok(!fs.existsSync(fileOf(second.logoUrl)));
  });
});
