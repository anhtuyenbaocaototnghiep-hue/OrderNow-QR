// Integration test (SQL Server thật) F-079 — quyền riêng từng tài khoản + xin quyền / duyệt (ADR-037 D-167…D-172).
// Chủ quán đặt từng quyền (theo vai trò / cho phép / không cho, kèm hạn) cho một người; người bị chặn ở việc có quyền cấp được
// thì xin quyền, chủ quán duyệt (hôm nay / 7 ngày / luôn) hoặc từ chối. Quyền đổi có hiệu lực ngay request kế tiếp.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, users, tok;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const ok = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body;
};
const water = (quantity = 1) => [{ menuItemId: ids['Nước suối'], quantity }];
const inHours = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const setGrants = (userId, grants, token = admin) => call(token, 'put', `/api/admin/users/${userId}/grants`, { grants });
const caps = async (token) => ok(await call(token, 'get', '/api/auth/me')).user.caps;

async function createUser(username, role, extra = {}) {
  return ok(await call(admin, 'post', '/api/admin/users', { username, password: 'Pass@123', fullName: `TK ${username}`, role, ...extra }), 201);
}

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  ids = await app.ids();
  await createUser('pv2', 'STAFF', { positions: ['SERVER'] });
  await createUser('pv3', 'STAFF', { positions: ['SERVER'] });
  await createUser('lead_g', 'MANAGER');
  await createUser('qlch_g', 'STORE_MGR');
  users = Object.fromEntries((await q1('SELECT UserId, Username FROM dbo.Users')).map((u) => [u.Username, u.UserId]));
  staff = await app.login('staff1', 'Staff@123');
  tok = {};
  for (const u of ['pv2', 'pv3', 'lead_g', 'qlch_g']) tok[u] = await app.login(u, 'Pass@123');
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 1_000_000 }), 201);
});

after(() => app.close());

describe('Quyền riêng từng tài khoản + xin quyền (F-079)', () => {
  test('AC-079-01: chủ quán xem hộp Quyền (mặc định theo vai, đặt riêng, đang có); cho phép "Thu tiền" có hạn → người Phục vụ bán mang đi được ngay, /auth/me có quyền mới; chủ quán / quyền lạ / hạn đã qua → 400; người khác đặt → 403; xóa tài khoản có quyền riêng vẫn được', async () => {
    const view = ok(await call(admin, 'get', `/api/admin/users/${users.pv2}/grants`));
    const item = (v, key) => v.items.find((i) => i.key === key);
    assert.deepEqual([item(view, 'pos.cashier').byRole, item(view, 'pos.cashier').effective], [false, false]);
    assert.deepEqual([item(view, 'pos.server').byRole, item(view, 'pos.server').effective], [true, true]);
    assert.ok(view.items.length >= 15);
    assert.equal((await call(tok.pv2, 'post', '/api/orders/takeaway', { items: water(), amountReceived: 50000 })).body.code, 'POSITION_REQUIRED');

    const saved = ok(await setGrants(users.pv2, [{ capability: 'pos.cashier', effect: 'ALLOW', expiresAt: inHours(2) }]));
    assert.equal(item(saved, 'pos.cashier').effective, true);
    assert.equal(item(saved, 'pos.cashier').override.effect, 'ALLOW');
    ok(await call(tok.pv2, 'post', '/api/orders/takeaway', { items: water(), amountReceived: 50000 }), 201); // cùng token — có hiệu lực ngay
    assert.ok((await caps(tok.pv2)).includes('pos.cashier'));

    assert.equal((await call(admin, 'get', `/api/admin/users/${users.admin}/grants`)).body.code, 'OWNER_ALWAYS');
    assert.equal((await setGrants(users.pv2, [{ capability: 'admin.users', effect: 'ALLOW' }])).status, 400);
    assert.equal((await setGrants(users.pv2, [{ capability: 'admin.menu', effect: 'ALLOW', expiresAt: inHours(-1) }])).status, 400);
    const dup = await setGrants(users.pv2, [
      { capability: 'admin.menu', effect: 'ALLOW' },
      { capability: 'admin.menu', effect: 'DENY' },
    ]);
    assert.equal(dup.status, 400);
    for (const token of [tok.qlch_g, tok.lead_g, staff])
      assert.equal((await setGrants(users.pv3, [{ capability: 'pos.cashier', effect: 'ALLOW' }], token)).status, 403);

    const temp = await createUser('tam_xoa', 'STAFF');
    ok(await setGrants(temp.userId, [{ capability: 'pos.cashier', effect: 'DENY' }]));
    assert.equal(ok(await call(admin, 'delete', `/api/admin/users/${temp.userId}`)).result, 'DELETED');
    const listed = ok(await call(admin, 'get', '/api/admin/users')).find((u) => u.userId === users.pv2);
    assert.equal(listed.grantCount, 1);
  });

  test('AC-079-02: "Không cho" thắng mặc định — quản lý cửa hàng bị thu "Thực đơn & giá" → 403 OWNER_ONLY kèm quyền cần, phần khác vẫn dùng được; quyền hết hạn tự về theo vai trò', async () => {
    ok(await setGrants(users.qlch_g, [{ capability: 'admin.menu', effect: 'DENY' }]));
    const r = await call(tok.qlch_g, 'get', '/api/admin/menu-items');
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'OWNER_ONLY');
    assert.deepEqual([r.body.details.capability, r.body.details.capabilityLabel], ['admin.menu', 'Thực đơn & giá (món, tùy chọn, combo, lịch thực đơn)']);
    ok(await call(tok.qlch_g, 'get', '/api/admin/ingredients'));
    assert.ok(!(await caps(tok.qlch_g)).includes('admin.menu'));
    // Hết hạn → không còn tác dụng
    await q1(`UPDATE dbo.UserGrants SET ExpiresAt = DATEADD(SECOND, -5, SYSUTCDATETIME()) WHERE UserId = ${users.qlch_g}`);
    ok(await call(tok.qlch_g, 'get', '/api/admin/menu-items'));
    assert.ok((await caps(tok.qlch_g)).includes('admin.menu'));
    ok(await setGrants(users.qlch_g, []));
  });

  test('AC-079-03: cấp riêng một phần trang Quản lý cho trưởng ca — vào được Lương, máy quầy có "Quản lý"; phần khác 403 kèm quyền cần; tài khoản, cài đặt chung, duyệt xin quyền không cấp được', async () => {
    const before = await call(tok.lead_g, 'get', '/api/admin/payroll-week?from=' + todayVn());
    assert.equal(before.status, 403);
    assert.equal(before.body.code, 'FORBIDDEN');
    assert.equal(before.body.details.capability, 'admin.staff');
    ok(await setGrants(users.lead_g, [{ capability: 'admin.payroll', effect: 'ALLOW' }]));
    ok(await call(tok.lead_g, 'get', `/api/admin/payroll?month=${todayVn().slice(0, 7)}`));
    ok(await call(tok.lead_g, 'get', `/api/admin/holidays?year=${todayVn().slice(0, 4)}`));
    ok(await call(tok.lead_g, 'get', '/api/admin/settings'));
    const pnl = await call(tok.lead_g, 'get', `/api/admin/reports/pnl?from=${todayVn()}&to=${todayVn()}`);
    assert.deepEqual([pnl.status, pnl.body.code, pnl.body.details.capability], [403, 'OWNER_ONLY', 'admin.pnl']);
    for (const [method, path, body] of [
      ['put', `/api/admin/users/${users.pv3}`, { fullName: 'X', role: 'STAFF' }],
      ['put', '/api/admin/settings', { staffMaxPercent: 50 }],
      ['get', '/api/admin/access-requests'],
      ['get', '/api/admin/api-docs'],
    ]) {
      const r = await call(tok.lead_g, method, path, body);
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(r.body.details?.capability, undefined, `${method} ${path} không được mời xin quyền`);
    }
    assert.ok((await caps(tok.lead_g)).includes('admin.payroll'));
    ok(await setGrants(users.lead_g, []));
  });

  test('AC-079-04: xin quyền → chủ quán duyệt "hết hôm nay" — bị chặn kèm quyền cần, gửi yêu cầu (gửi lại = cùng yêu cầu), chủ quán thấy ở danh sách + trang Hôm nay, duyệt xong làm được ngay, hạn = hết ngày (giờ VN); đã có quyền thì không xin nữa', async () => {
    const sale = ok(await call(staff, 'post', '/api/orders/takeaway', { items: water(), amountReceived: 50000 }), 201);
    const blocked = await call(tok.pv3, 'post', `/api/orders/${sale.order.orderId}/complete`);
    assert.deepEqual([blocked.status, blocked.body.code, blocked.body.details.capability], [403, 'POSITION_REQUIRED', 'pos.barista']);
    const first = ok(await call(tok.pv3, 'post', '/api/access-requests', { capability: 'pos.barista', reason: 'pha chế nghỉ, làm giúp' }), 201);
    assert.equal(first.created, true);
    const again = ok(await call(tok.pv3, 'post', '/api/access-requests', { capability: 'pos.barista' }));
    assert.deepEqual([again.created, again.request.requestId], [false, first.request.requestId]);
    const list = ok(await call(admin, 'get', '/api/admin/access-requests'));
    const req = list.requests.find((x) => x.requestId === first.request.requestId);
    assert.deepEqual([req.user.userId, req.capabilityLabel, req.reason], [users.pv3, 'Nhận / làm đơn, sơ chế, hủy hàng, nhận hàng', 'pha chế nghỉ, làm giúp']);
    assert.ok(ok(await call(admin, 'get', '/api/dashboard/today')).todos.pendingAccess >= 1);
    assert.equal(ok(await call(tok.lead_g, 'get', '/api/dashboard/today')).todos.pendingAccess, undefined, 'trưởng ca không thấy');

    const approved = ok(await call(admin, 'post', `/api/admin/access-requests/${first.request.requestId}/approve`, { duration: 'TODAY' }));
    const endOfDay = Date.parse(`${todayVn()}T00:00:00+07:00`) + 86400e3;
    assert.equal(new Date(approved.expiresAt).getTime(), endOfDay);
    ok(await call(tok.pv3, 'post', `/api/orders/${sale.order.orderId}/complete`));
    const mine = ok(await call(tok.pv3, 'get', '/api/access-requests/mine'));
    assert.equal(mine.find((x) => x.requestId === first.request.requestId).status, 'APPROVED');
    assert.equal(
      (await call(admin, 'post', `/api/admin/access-requests/${first.request.requestId}/approve`, { duration: 'WEEK' })).body.code,
      'REQUEST_DECIDED',
    );
    assert.equal((await call(tok.pv3, 'post', '/api/access-requests', { capability: 'pos.barista' })).body.code, 'ALREADY_ALLOWED');
  });

  test('AC-079-05: từ chối có ghi chú; nhân viên / quản lý cửa hàng không duyệt được; tối đa 5 yêu cầu chờ mỗi người', async () => {
    const r = ok(await call(tok.pv3, 'post', '/api/access-requests', { capability: 'admin.audit' }), 201);
    for (const token of [staff, tok.qlch_g])
      assert.equal((await call(token, 'post', `/api/admin/access-requests/${r.request.requestId}/approve`, { duration: 'ALWAYS' })).status, 403);
    ok(await call(admin, 'post', `/api/admin/access-requests/${r.request.requestId}/reject`, { note: 'chưa cần' }));
    const mine = ok(await call(tok.pv3, 'get', '/api/access-requests/mine')).find((x) => x.requestId === r.request.requestId);
    assert.deepEqual([mine.status, mine.decisionNote, mine.decidedBy.userId], ['REJECTED', 'chưa cần', users.admin]);
    assert.ok(!(await caps(tok.pv3)).includes('admin.audit'));
    for (const cap of ['admin.menu', 'admin.stock', 'admin.customers', 'admin.tables', 'admin.staff']) {
      ok(await call(tok.pv3, 'post', '/api/access-requests', { capability: cap }), 201);
    }
    assert.equal((await call(tok.pv3, 'post', '/api/access-requests', { capability: 'admin.cash' })).body.code, 'TOO_MANY_REQUESTS');
    assert.equal((await call(tok.pv3, 'post', '/api/access-requests', { capability: 'khong-co' })).status, 400);
  });

  test('AC-079-06: cho phép quyền dính tiền (đặt riêng hoặc duyệt) → cảnh báo ACCESS_GRANT cho chủ quán (quản lý cửa hàng không thấy); quyền không dính tiền → không cảnh báo; Tra cứu API ghi quyền cấp được của từng dòng Quản lý', async () => {
    const grants = await q1("SELECT UserId, Title, Detail FROM dbo.Alerts WHERE Kind = 'ACCESS_GRANT' ORDER BY AlertId");
    assert.equal(grants.length, 2, 'AC-079-01 cho phép Thu tiền + AC-079-03 cho phép Lương'); // pos.barista (AC-079-04) không dính tiền
    assert.deepEqual(
      grants.map((g) => g.UserId),
      [users.pv2, users.lead_g],
    );
    assert.match(grants[0].Title, /Thu tiền/);
    assert.equal(JSON.parse(grants[1].Detail).capabilities[0], 'admin.payroll');
    const owner = ok(await call(admin, 'get', '/api/admin/alerts?status=ALL')).alerts.filter((a) => a.kind === 'ACCESS_GRANT');
    assert.equal(owner.length, 2);
    const store = ok(await call(tok.qlch_g, 'get', '/api/admin/alerts?status=ALL')).alerts.filter((a) => a.kind === 'ACCESS_GRANT');
    assert.equal(store.length, 0);
    const docs = ok(await call(admin, 'get', '/api/admin/api-docs'));
    const find = (m, p) => docs.endpoints.find((e) => e.method === m && e.path === p);
    assert.equal(find('GET', '/api/admin/payroll').capability, 'admin.payroll');
    assert.equal(find('PUT', '/api/admin/menu-items/:id').capability, 'admin.menu');
    assert.equal(find('POST', '/api/admin/users').capability, null);
    assert.equal(find('PUT', '/api/admin/users/:id/grants').capability, null);
  });
});
