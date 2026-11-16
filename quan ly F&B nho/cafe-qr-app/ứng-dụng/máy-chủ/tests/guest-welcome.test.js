// F-092 (TASK-113, ADR-054) — màn chào khi khách quét QR: cài đặt `guestWelcome` (mặc định bật) + /api/menu trả `ui.welcome` và địa chỉ
// quán cho màn chào. SQL Server thật.
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
const menu = async () => ok(await api.get('/api/menu'));

before(async () => {
  app = await startApp();
  ({ api } = app);
  admin = await app.login('admin', 'Admin@123');
});

after(() => app?.close());

describe('Màn chào khi quét QR (F-092)', () => {
  test('AC-092-01: cài đặt màn chào mặc định bật, thực đơn công khai trả ui.welcome + tên và địa chỉ quán; tắt → ui.welcome = false; quản lý cửa hàng đổi được, nhân viên không; giá trị sai → 400', async () => {
    const s = ok(await call(admin, 'get', '/api/admin/settings'));
    assert.equal(s.guestWelcome, true, 'mặc định bật');
    let m = await menu();
    assert.equal(m.ui.welcome, true);

    ok(await call(admin, 'put', '/api/admin/settings', { shopAddress: 'Số 1 Đường Thử, phường Một, Quận 1' }));
    m = await menu();
    assert.deepEqual([m.shop.name, m.shop.address], [s.shopName, 'Số 1 Đường Thử, phường Một, Quận 1']);

    ok(await call(admin, 'put', '/api/admin/settings', { guestWelcome: false }));
    assert.equal((await menu()).ui.welcome, false);
    assert.equal(ok(await call(admin, 'get', '/api/admin/settings')).guestWelcome, false);

    // Quản lý cửa hàng đổi được (trải nghiệm khách như "+" mở bảng chọn — STORE_MGR_SETTINGS); nhân viên không vào được Cài đặt
    ok(await call(admin, 'post', '/api/admin/users', { username: 'ql_chao', password: 'Pass@123', fullName: 'QL màn chào', role: 'STORE_MGR' }), 201);
    ok(await call(await app.login('ql_chao', 'Pass@123'), 'put', '/api/admin/settings', { guestWelcome: true }));
    assert.equal((await menu()).ui.welcome, true);
    assert.equal((await call(await app.login('staff1', 'Staff@123'), 'put', '/api/admin/settings', { guestWelcome: false })).status, 403);
    assert.equal((await menu()).ui.welcome, true);

    const bad = await call(admin, 'put', '/api/admin/settings', { guestWelcome: 'có' });
    assert.deepEqual([bad.status, bad.body.code], [400, 'VALIDATION_ERROR']);
  });
});
