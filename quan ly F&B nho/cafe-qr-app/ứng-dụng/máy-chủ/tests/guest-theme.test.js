// F-094 (TASK-115, ADR-056) — giao diện màn khách theo giờ (sáng / tối) và trang trí theo mùa: hai cài đặt (mặc định bật)
// + GET /api/shop trả guestTheme cho trang khách tô màu. SQL Server thật.
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
const shop = async () => ok(await api.get('/api/shop'));

before(async () => {
  app = await startApp();
  ({ api } = app);
  admin = await app.login('admin', 'Admin@123');
});

after(() => app?.close());

describe('Giao diện màn khách theo giờ và theo mùa (F-094)', () => {
  test('AC-094-01: cài đặt giao diện theo giờ và theo mùa mặc định bật, /api/shop trả guestTheme; tắt từng cái → /api/shop đổi theo; quản lý cửa hàng đổi được, nhân viên không; giá trị sai → 400', async () => {
    const s = ok(await call(admin, 'get', '/api/admin/settings'));
    assert.deepEqual([s.guestDaypartTheme, s.guestSeasonDecor], [true, true], 'mặc định bật');
    assert.deepEqual((await shop()).guestTheme, { daypart: true, season: true });

    ok(await call(admin, 'put', '/api/admin/settings', { guestDaypartTheme: false }));
    assert.deepEqual((await shop()).guestTheme, { daypart: false, season: true });
    ok(await call(admin, 'put', '/api/admin/settings', { guestSeasonDecor: false }));
    assert.deepEqual((await shop()).guestTheme, { daypart: false, season: false });
    const off = ok(await call(admin, 'get', '/api/admin/settings'));
    assert.deepEqual([off.guestDaypartTheme, off.guestSeasonDecor], [false, false]);
    // /api/shop công khai chỉ có tên, địa chỉ, logo (F-095), hai cờ giao diện và cờ bật chuyển khoản (F-099 — không có số tài khoản)
    assert.deepEqual(Object.keys(await shop()).sort(), ['address', 'guestTheme', 'logoUrl', 'name', 'phone', 'transfer']); // ADR-070: + phone

    // Quản lý cửa hàng đổi được (trải nghiệm khách như màn chào — STORE_MGR_SETTINGS); nhân viên không vào được Cài đặt
    ok(await call(admin, 'post', '/api/admin/users', { username: 'ql_giaodien', password: 'Pass@123', fullName: 'QL giao diện', role: 'STORE_MGR' }), 201);
    ok(await call(await app.login('ql_giaodien', 'Pass@123'), 'put', '/api/admin/settings', { guestDaypartTheme: true, guestSeasonDecor: true }));
    assert.deepEqual((await shop()).guestTheme, { daypart: true, season: true });
    const staff = await app.login('staff1', 'Staff@123');
    assert.equal((await call(staff, 'put', '/api/admin/settings', { guestDaypartTheme: false })).status, 403);
    assert.deepEqual((await shop()).guestTheme, { daypart: true, season: true });

    for (const bad of [{ guestDaypartTheme: 'có' }, { guestSeasonDecor: 1 }]) {
      const r = await call(admin, 'put', '/api/admin/settings', bad);
      assert.deepEqual([r.status, r.body.code], [400, 'VALIDATION_ERROR'], JSON.stringify(bad));
    }
  });
});
