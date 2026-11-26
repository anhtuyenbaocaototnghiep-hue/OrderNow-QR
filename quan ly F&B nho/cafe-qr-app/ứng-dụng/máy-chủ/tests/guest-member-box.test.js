// Integration test (SQL Server thật) F-101 — bật / tắt ô "Nhập SĐT để nhận ưu đãi" trên màn khách (ADR-071 D-264, BR-131).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, lead, storeMgr;

const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body;
};
/** Cờ ô hội viên ở ba nơi đọc được: cài đặt (chủ quán), /api/menu (ui), /api/shop. */
const flags = async () => [
  ok(await call(admin, 'get', '/api/admin/settings')).guestMemberBox,
  ok(await api.get('/api/menu')).ui.memberBox,
  ok(await api.get('/api/shop')).memberBox,
];
const memberOfSession = async (sid) =>
  (await pool.request().input('sid', sid).query('SELECT MemberId FROM dbo.Sessions WHERE SessionId = @sid')).recordset[0].MemberId;

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ok(await call(admin, 'post', '/api/admin/users', { username: 'lead_mb', password: 'Pass@123', fullName: 'Trưởng ca MB', role: 'MANAGER' }), 201);
  ok(await call(admin, 'post', '/api/admin/users', { username: 'ql_mb', password: 'Pass@123', fullName: 'Quản lý MB', role: 'STORE_MGR' }), 201);
  lead = await app.login('lead_mb', 'Pass@123');
  storeMgr = await app.login('ql_mb', 'Pass@123');
});

after(() => app.close());

describe('Bật / tắt ô hội viên trên màn khách (F-101)', () => {
  test('AC-101-01: mặc định bật; chủ quán tắt → cài đặt, /api/menu ui.memberBox, /api/shop memberBox đều false; bật lại → true; quản lý cửa hàng, trưởng ca, nhân viên đổi → 403', async () => {
    assert.deepEqual(await flags(), [true, true, true], 'mặc định bật');
    ok(await call(admin, 'put', '/api/admin/settings', { guestMemberBox: false }));
    assert.deepEqual(await flags(), [false, false, false]);
    for (const token of [storeMgr, lead, staff]) {
      assert.equal((await call(token, 'put', '/api/admin/settings', { guestMemberBox: true })).status, 403);
    }
    assert.deepEqual(await flags(), [false, false, false], 'người không phải chủ quán không bật lại được');
    ok(await call(admin, 'put', '/api/admin/settings', { guestMemberBox: true }));
    assert.deepEqual(await flags(), [true, true, true]);
  });

  test('AC-101-02: tắt → khách tự tra SĐT / đăng ký / gắn SĐT / thêm ngày sinh → 403 MEMBER_SELF_OFF, không tạo hội viên, phiên không có hội viên; nhân viên vẫn tra và gắn được; bật lại → khách tự đăng ký được', async () => {
    ok(await call(admin, 'put', '/api/admin/settings', { guestMemberBox: false }));
    const C = await app.customer();
    const sid = await app.seat(C, '02');
    const phone = '0909101101';
    const tries = [
      ['/api/members/lookup', { phone }],
      ['/api/members', { phone, fullName: 'Khách Tự Đăng Ký', consent: true }],
      [`/api/sessions/${sid}/member`, { phone }],
      [`/api/sessions/${sid}/member/birthday`, { birthDate: '--05-12' }],
    ];
    for (const [path, body] of tries) {
      const r = await C.post(path, body);
      assert.equal(r.status, 403, `${path}: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.code, 'MEMBER_SELF_OFF', path);
    }
    assert.equal(ok(await call(staff, 'post', '/api/members/lookup', { phone })).found, false, 'khách không tạo được hội viên');
    assert.equal(await memberOfSession(sid), null);

    // Quầy không đổi: nhân viên đăng ký + gắn hội viên cho phiên của khách
    ok(await call(staff, 'post', '/api/members', { phone, fullName: 'Khách Ở Quầy', consent: true }), 201);
    ok(await call(staff, 'post', `/api/sessions/${sid}/member`, { phone }));
    assert.notEqual(await memberOfSession(sid), null, 'nhân viên gắn được hội viên khi ô trên màn khách đang tắt');

    // Bật lại → khách tự đăng ký như trước
    ok(await call(admin, 'put', '/api/admin/settings', { guestMemberBox: true }));
    const C2 = await app.customer();
    await app.seat(C2, '03');
    ok(await C2.post('/api/members', { phone: '0909101102', fullName: 'Khách Bật Lại', consent: true }), 201);
  });
});
