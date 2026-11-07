// Integration test (SQL Server thật) F-077 — phân quyền rõ ràng, đợt 1 (ADR-035 D-156…D-161): vai Quản lý cửa hàng (STORE_MGR)
// giữa Trưởng ca và Chủ quán. Phạm vi trang Quản lý theo STORE_MGR_AREAS, cài đặt được đổi, báo chủ quán khi đổi giá, duyệt chi quỹ
// tới 3 × ngưỡng trưởng ca, cảnh báo, chấm công mọi ngày, Tra cứu API.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let app, api, pool, admin, staff, lead, store, users, ids, cats, perms, listRoutes;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const ok = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body;
};
const today = todayVn();
const range = `from=${today}&to=${today}`;

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  perms = await import('../src/auth/permissions.js');
  ({ listRoutes } = await import('../src/routes/apiDocs.js'));
  admin = await app.login('admin', 'Admin@123');
  ids = await app.ids();
  for (const [username, role] of [
    ['qlch1', 'STORE_MGR'],
    ['qlch2', 'STORE_MGR'],
    ['lead_q', 'MANAGER'],
  ]) {
    ok(await call(admin, 'post', '/api/admin/users', { username, password: 'Pass@123', fullName: `TK ${username}`, role }), 201);
  }
  users = Object.fromEntries((await q1('SELECT UserId, Username FROM dbo.Users')).map((u) => [u.Username, u.UserId]));
  staff = await app.login('staff1', 'Staff@123');
  lead = await app.login('lead_q', 'Pass@123');
  store = await app.login('qlch1', 'Pass@123');
  cats = Object.fromEntries((await call(staff, 'get', '/api/cash-categories')).body.map((c) => [c.name, c.categoryId]));
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 50_000_000 }), 201);
});

after(() => app.close());

describe('Quản lý cửa hàng (F-077)', () => {
  test('AC-077-01: chủ quán tạo tài khoản Quản lý cửa hàng; trưởng ca / nhân viên / quản lý cửa hàng không tạo được tài khoản; /auth/me trả STORE_MGR; vai cũ giữ nguyên; ma trận quyền quầy đúng PERMISSIONS', async () => {
    const me = ok(await call(store, 'get', '/api/auth/me'));
    assert.equal(me.user.role, 'STORE_MGR');
    const roles = await q1("SELECT Username, Role FROM dbo.Users WHERE Username IN ('admin', 'staff1', 'lead_q', 'qlch1')");
    assert.deepEqual(Object.fromEntries(roles.map((r) => [r.Username, r.Role])), { admin: 'ADMIN', staff1: 'STAFF', lead_q: 'MANAGER', qlch1: 'STORE_MGR' });
    for (const token of [staff, lead, store]) {
      const r = await call(token, 'post', '/api/admin/users', { username: 'x_khong_duoc', password: 'Pass@123', fullName: 'X', role: 'STAFF' });
      assert.equal(r.status, 403, JSON.stringify(r.body));
    }
    assert.equal(
      (await call(store, 'post', '/api/admin/users', { username: 'x2', password: 'Pass@123', fullName: 'X', role: 'STAFF' })).body.code,
      'OWNER_ONLY',
    );
    // Ma trận quầy: STORE_MGR có mọi quyền MGR, không có admin.all
    assert.deepEqual(perms.ROLES, ['STAFF', 'MANAGER', 'STORE_MGR', 'ADMIN']);
    for (const [p, allowed] of Object.entries(perms.PERMISSIONS)) {
      assert.equal(allowed.includes('STORE_MGR'), p !== 'admin.all', p);
    }
    assert.equal((await call(store, 'get', '/api/ops/stocktakes')).status, 200);
    assert.equal((await call(store, 'get', `/api/attendance?${range}`)).status, 200);
    assert.equal(perms.discountLimits('STORE_MGR', {}), null, 'giảm giá tay không giới hạn');
  });

  test('AC-077-02: phạm vi trang Quản lý — được thực đơn / kho / khuyến mãi / hội viên / bàn / lịch làm; chỉ xem báo cáo bán hàng, sổ quỹ, ca, tài khoản; chặn lãi / lỗ, chi phí cố định, lương, nhật ký, phân tích, tài khoản (sửa), ẩn danh hội viên, email cảnh báo, Tra cứu API; mọi khóa trong bảng đều khớp route thật', async () => {
    const allowed = [
      ['get', '/api/admin/menu-items'],
      ['get', '/api/admin/ingredients'],
      ['get', '/api/admin/stocktakes'],
      ['get', '/api/admin/purchase-orders'],
      ['get', '/api/admin/promotions'],
      ['get', '/api/admin/members'],
      ['get', '/api/admin/tables'],
      ['get', `/api/admin/rosters?${range}`],
      ['get', `/api/admin/reports/revenue?${range}`],
      ['get', `/api/admin/reports/cogs?${range}`],
      ['get', `/api/admin/cash-transactions?${range}`],
      ['get', `/api/admin/shifts?${range}`],
      ['get', '/api/admin/users'],
      ['get', '/api/admin/alerts'],
      ['get', '/api/admin/jobs'],
      ['post', '/api/admin/categories', { name: 'Món QLCH', sortOrder: 50 }],
    ];
    for (const [method, path, body] of allowed) {
      const r = await call(store, method, path, body);
      assert.ok(![401, 403].includes(r.status), `${method} ${path}: ${r.status} ${JSON.stringify(r.body)}`);
    }
    const member = (await q1('SELECT TOP 1 MemberId FROM dbo.Members'))[0]?.MemberId ?? 1;
    const blocked = [
      ['get', `/api/admin/reports/pnl?${range}`],
      ['get', '/api/admin/fixed-costs'],
      ['get', `/api/admin/payroll?month=${today.slice(0, 7)}`],
      ['get', '/api/admin/pay-profiles'],
      ['get', '/api/admin/audit-logs'],
      ['get', `/api/admin/reports/menu-engineering?${range}`],
      ['get', '/api/admin/attendance-settings'],
      ['get', '/api/admin/alerts/mail-status'],
      ['get', '/api/admin/api-docs'],
      ['post', '/api/admin/cash-categories', { name: 'X', direction: 'OUT' }],
      ['put', `/api/admin/users/${users.staff1}`, { fullName: 'Đổi tên', role: 'MANAGER' }],
      ['post', `/api/admin/members/${member}/anonymize`, {}],
      ['post', '/api/admin/jobs/daily-summary/run', {}],
    ];
    for (const [method, path, body] of blocked) {
      const r = await call(store, method, path, body);
      assert.equal(r.status, 403, `${method} ${path}: ${r.status}`);
      assert.equal(r.body.code, 'OWNER_ONLY', `${method} ${path}`);
    }
    // Trưởng ca vẫn bị chặn cả trang Quản lý như trước
    assert.equal((await call(lead, 'get', '/api/admin/menu-items')).status, 403);
    // Bảng quyền không có khóa gõ sai: mỗi khóa / luật khớp ít nhất một route /api/admin thật
    const adminRoutes = listRoutes((await import('../src/app.js')).createApp().locals.apiRouters)
      .filter((r) => r.path.startsWith('/api/admin/'))
      .map((r) => ({ method: r.method, path: r.path.slice('/api/admin'.length) }));
    const keyOf = (p) => {
      const seg = p.split('/').filter(Boolean);
      return ['reports', 'jobs'].includes(seg[0]) && seg.length > 1 ? `${seg[0]}/${seg[1]}` : seg[0];
    };
    const keys = new Set(adminRoutes.map((r) => keyOf(r.path)));
    for (const k of [...perms.STORE_MGR_AREAS.full, ...perms.STORE_MGR_AREAS.read]) assert.ok(keys.has(k), `khóa "${k}" không khớp route nào`);
    for (const rule of [...perms.STORE_MGR_AREAS.only, ...perms.STORE_MGR_AREAS.deny].filter((x) => !x.includes('/jobs/'))) {
      const [method, p] = rule.split(' ');
      assert.ok(
        adminRoutes.some((r) => r.method === method && r.path === p),
        `luật "${rule}" không khớp route nào`,
      );
    }
  });

  test('AC-077-03: cài đặt — quản lý cửa hàng xem được (không thấy email nhận cảnh báo), đổi được cài đặt bếp / 1 chạm / nhận đơn QR; đổi giảm giá, ngưỡng duyệt, Wi-Fi, tên quán → 403 OWNER_ONLY kèm tên ô', async () => {
    ok(await call(admin, 'put', '/api/admin/settings', { alertEmails: ['chu.quan@example.com'] }));
    const s = ok(await call(store, 'get', '/api/admin/settings'));
    assert.deepEqual(s.alertEmails, []);
    assert.ok(s.etaBaseSeconds >= 0);
    const changed = ok(await call(store, 'put', '/api/admin/settings', { etaBaseSeconds: 45, kitchenParallelism: 2, oneTap: false, acceptingOrders: true }));
    assert.equal(changed.etaBaseSeconds, 45);
    for (const body of [{ staffMaxPercent: 50 }, { managerCashApproveMax: 99_000_000 }, { shopName: 'Quán khác' }, { etaBaseSeconds: 30, wifiSsid: 'Mang' }]) {
      const r = await call(store, 'put', '/api/admin/settings', body);
      assert.equal(r.status, 403, JSON.stringify(body));
      assert.equal(r.body.code, 'OWNER_ONLY');
      assert.deepEqual(
        r.body.details.fields,
        Object.keys(body).filter((k) => k !== 'etaBaseSeconds'),
      );
    }
    assert.equal(ok(await call(admin, 'get', '/api/admin/settings')).etaBaseSeconds, 45, 'lần bị chặn không lưu gì');
    assert.deepEqual(ok(await call(admin, 'get', '/api/admin/settings')).alertEmails, ['chu.quan@example.com']);
  });

  test('AC-077-04: quản lý cửa hàng đổi giá / thêm món → chủ quán thấy cảnh báo PRICE_CHANGE (quản lý cửa hàng không thấy); chỉ đổi tên hoặc chủ quán tự đổi giá → không báo', async () => {
    const item = ok(await call(store, 'get', '/api/admin/menu-items')).find((m) => m.menuItemId === ids['Cà phê sữa']);
    const body = {
      categoryId: item.categoryId,
      name: item.name,
      price: item.price,
      imageUrl: item.imageUrl ?? '',
      isAvailable: item.isAvailable,
      isActive: item.isActive,
    };
    ok(await call(store, 'put', `/api/admin/menu-items/${item.menuItemId}`, { ...body, name: `${item.name}` })); // giá giữ nguyên
    ok(await call(admin, 'put', `/api/admin/menu-items/${item.menuItemId}`, { ...body, price: item.price + 1000 })); // chủ quán tự đổi
    assert.equal((await q1("SELECT COUNT(*) AS n FROM dbo.Alerts WHERE Kind = 'PRICE_CHANGE'"))[0].n, 0);
    ok(await call(store, 'put', `/api/admin/menu-items/${item.menuItemId}`, { ...body, price: item.price + 3000 }));
    const created = ok(await call(store, 'post', '/api/admin/menu-items', { ...body, name: 'Trà QLCH mới', price: 35000 }), 201);
    const own = ok(await call(admin, 'get', '/api/admin/alerts?status=ALL')).alerts.filter((a) => a.kind === 'PRICE_CHANGE');
    assert.equal(own.length, 2);
    const change = own.find((a) => a.detail.menuItemId === item.menuItemId);
    assert.deepEqual([change.detail.oldPrice, change.detail.newPrice], [item.price + 1000, item.price + 3000]);
    assert.equal(change.user.userId, users.qlch1);
    assert.match(change.title, /đổi giá/);
    assert.equal(own.find((a) => a.detail.menuItemId === created.menuItemId).detail.oldPrice, null);
    const theirs = ok(await call(store, 'get', '/api/admin/alerts?status=ALL'));
    assert.equal(theirs.alerts.filter((a) => a.kind === 'PRICE_CHANGE').length, 0, 'quản lý cửa hàng không thấy cảnh báo về giá');
    const patch = await call(store, 'patch', `/api/admin/alerts/${change.alertId}`, { status: 'RESOLVED' });
    assert.equal(patch.status, 404, 'không tự đóng cảnh báo về giá của mình');
    ok(await call(admin, 'put', `/api/admin/menu-items/${item.menuItemId}`, { ...body, price: item.price })); // trả giá cũ cho test sau
  });

  test('AC-077-05: duyệt chi quỹ — quản lý cửa hàng tự duyệt khoản tới 3 × ngưỡng trưởng ca (trưởng ca thì không); quá mức → cần chủ quán; không tự duyệt khoản của mình; duyệt bằng tài khoản quản lý cửa hàng ở quầy theo cùng ngưỡng', async () => {
    const { managerCashApproveMax: max } = ok(await call(admin, 'get', '/api/admin/settings'));
    const create = async (token, amount) =>
      ok(await call(token, 'post', '/api/cash-transactions', { categoryId: cats['Mua vật tư nhỏ'], amount, reason: `chi ${amount}` }), 201);
    const mid = await create(staff, max * 2);
    const leadTry = await call(lead, 'post', `/api/cash-transactions/${mid.cashTxnId}/approve`, {});
    assert.equal(leadTry.status, 403, 'trưởng ca không duyệt quá ngưỡng của mình');
    const approved = ok(await call(store, 'post', `/api/cash-transactions/${mid.cashTxnId}/approve`, {}));
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.approvedBy.userId, users.qlch1);

    const big = await create(staff, max * 3 + 1000);
    const bigTry = await call(store, 'post', `/api/cash-transactions/${big.cashTxnId}/approve`, {});
    assert.equal(bigTry.status, 403);
    assert.equal(bigTry.body.code, 'ADMIN_APPROVAL_REQUIRED');
    assert.match(bigTry.body.message, /chủ quán/);
    // nhân viên nhập tài khoản quản lý cửa hàng ở quầy: cùng ngưỡng
    const viaCreds = await call(staff, 'post', `/api/cash-transactions/${big.cashTxnId}/approve`, { adminUsername: 'qlch2', adminPassword: 'Pass@123' });
    assert.equal(viaCreds.status, 403);
    assert.equal(viaCreds.body.code, 'ADMIN_APPROVAL_INVALID');
    ok(await call(admin, 'post', `/api/cash-transactions/${big.cashTxnId}/reject`, { rejectReason: 'chủ quán từ chối' }));

    const mine = await create(store, max);
    const self = await call(store, 'post', `/api/cash-transactions/${mine.cashTxnId}/approve`, {});
    assert.equal(self.status, 403);
    assert.equal(self.body.code, 'SELF_APPROVAL');
    const other = ok(await call(staff, 'post', `/api/cash-transactions/${mine.cashTxnId}/approve`, { adminUsername: 'qlch2', adminPassword: 'Pass@123' }));
    assert.equal(other.approvedBy.userId, users.qlch2);
  });

  test('AC-077-06: cảnh báo — quản lý cửa hàng không thấy khóa đăng nhập (AUTH_LOCK), không xử lý cảnh báo về chính mình (SELF_ALERT), xử lý được cảnh báo khác; số "Mới" tính theo phần được thấy', async () => {
    await q1(`INSERT dbo.Alerts (Kind, Severity, UserId, Title, Detail, DedupeKey) VALUES
      ('AUTH_LOCK', 'HIGH', ${users.staff1}, N'Đăng nhập "staff1" bị khóa tạm', N'{}', 'T077:LOCK'),
      ('CASH_DIFF', 'HIGH', ${users.qlch1}, N'Lệch két ca của QLCH', N'{"difference":-50000,"fixed":20000}', 'T077:SELF'),
      ('CASH_DIFF', 'HIGH', ${users.staff1}, N'Lệch két ca của nhân viên', N'{"difference":-30000,"fixed":20000}', 'T077:OTHER')`);
    const mine = ok(await call(store, 'get', '/api/admin/alerts'));
    const owner = ok(await call(admin, 'get', '/api/admin/alerts'));
    assert.ok(!mine.alerts.some((a) => a.kind === 'AUTH_LOCK'));
    assert.ok(owner.alerts.some((a) => a.kind === 'AUTH_LOCK'));
    assert.equal(mine.newCount, mine.alerts.length);
    assert.equal(owner.newCount - mine.newCount, owner.alerts.filter((a) => perms.OWNER_ONLY_ALERTS.includes(a.kind)).length);
    const selfAlert = mine.alerts.find((a) => a.title === 'Lệch két ca của QLCH');
    const otherAlert = mine.alerts.find((a) => a.title === 'Lệch két ca của nhân viên');
    const r = await call(store, 'patch', `/api/admin/alerts/${selfAlert.alertId}`, { status: 'RESOLVED', note: 'tự đóng' });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'SELF_ALERT');
    const done = ok(await call(store, 'patch', `/api/admin/alerts/${otherAlert.alertId}`, { status: 'RESOLVED', note: 'đã đếm lại két' }));
    assert.equal(done.alert.handledBy.userId, users.qlch1);
    const lock = owner.alerts.find((a) => a.kind === 'AUTH_LOCK');
    assert.equal((await call(store, 'patch', `/api/admin/alerts/${lock.alertId}`, { status: 'SEEN' })).status, 404);
  });

  test('AC-077-07: chấm công — quản lý cửa hàng sửa chấm công ngày cũ của người khác (trưởng ca bị ATTENDANCE_NOT_TODAY), không sửa của mình; trang Hôm nay bản đủ; Tra cứu API ghi đúng vai được gọi', async () => {
    const y = new Date(Date.now() - 30 * 3600e3);
    const created = ok(
      await call(admin, 'post', '/api/attendance', {
        userId: users.staff1,
        clockIn: y.toISOString(),
        clockOut: new Date(y.getTime() + 4 * 3600e3).toISOString(),
        reason: 'nhập tay',
      }),
      201,
    );
    const edit = { clockIn: y.toISOString(), clockOut: new Date(y.getTime() + 5 * 3600e3).toISOString(), reason: 'về muộn' };
    assert.equal((await call(lead, 'put', `/api/attendance/${created.attId}`, edit)).body.code, 'ATTENDANCE_NOT_TODAY');
    assert.equal(ok(await call(store, 'put', `/api/attendance/${created.attId}`, edit)).minutes, 300);
    const own = await call(store, 'post', '/api/attendance', { userId: users.qlch1, clockIn: y.toISOString(), clockOut: edit.clockOut, reason: 'tự thêm' });
    assert.equal(own.status, 403);
    assert.equal(own.body.code, 'ATTENDANCE_SELF_EDIT');

    const dash = ok(await call(store, 'get', '/api/dashboard/today'));
    assert.equal(dash.full, true);
    assert.equal(ok(await call(lead, 'get', '/api/dashboard/today')).full, false);

    const docs = ok(await call(admin, 'get', '/api/admin/api-docs'));
    const find = (m, p) => docs.endpoints.find((e) => e.method === m && e.path === p);
    assert.deepEqual([find('PUT', '/api/admin/menu-items/:id').access, find('PUT', '/api/admin/menu-items/:id').roles], ['STORE_MGR', ['STORE_MGR', 'ADMIN']]);
    assert.equal(find('GET', '/api/admin/shifts').access, 'STORE_MGR');
    assert.equal(find('GET', '/api/admin/reports/pnl').access, 'ADMIN');
    assert.equal(find('POST', '/api/admin/members/:id/anonymize').access, 'ADMIN');
    assert.equal(find('POST', '/api/admin/users').access, 'ADMIN');
    assert.deepEqual(find('POST', '/api/ops/stocktakes').roles, ['MANAGER', 'STORE_MGR', 'ADMIN']);
    // Mỗi dòng trên trang khớp server: gọi thử vài dòng bằng tài khoản quản lý cửa hàng
    for (const [m, p, real] of [
      ['GET', '/api/admin/reviews', '/api/admin/reviews'],
      ['GET', '/api/admin/holidays', '/api/admin/holidays'],
    ]) {
      const status = (await call(store, m.toLowerCase(), real)).status;
      assert.equal(status === 403, find(m, p).access === 'ADMIN', `${m} ${p}: trang ghi ${find(m, p).access}, server trả ${status}`);
    }
  });
});
