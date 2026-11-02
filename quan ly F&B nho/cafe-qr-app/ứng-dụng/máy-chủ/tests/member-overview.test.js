// TASK-082 — trang Hội viên dễ theo dõi (F-014, AC-014-09, AC-014-10): tổng quan + tích điểm gần đây, lọc nhanh, tiến độ lên hạng.
// Hội viên mẫu chèn thẳng (ngày đăng ký / lần cuối ghé / sinh nhật cố định); một lượt mua thật để điểm được tích tự động.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, M, earned, memberDue;

const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const vnToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 0 }), 201);
  const birth = `1990-${vnToday().slice(5, 7)}-05`;
  const r = await pool.request().query(`
    DECLARE @old DATETIME2(0) = DATEADD(DAY, -60, SYSUTCDATETIME());
    INSERT dbo.Members (Phone, FullName, TierCode, TotalSpent, VisitCount, Points, ConsentAt, CreatedAt, LastVisitAt, BirthDate) VALUES
      ('+84901000001', N'Khách Gần Hạng', 'MEMBER', 850000, 9, 0, @old, @old, SYSUTCDATETIME(), NULL),
      ('+84901000002', N'Khách Vắng', 'MEMBER', 200000, 3, 0, @old, @old, DATEADD(DAY, -40, SYSUTCDATETIME()), NULL),
      ('+84901000003', N'Khách VIP', 'VIP', 3500000, 40, 500, @old, @old, DATEADD(DAY, -1, SYSUTCDATETIME()), '${birth}'),
      ('+84901000004', N'Khách Mới', 'MEMBER', 0, 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME(), NULL, NULL);
    -- sổ điểm phải khớp số dư (bất biến POINTS_LEDGER_MISMATCH)
    INSERT dbo.PointTransactions (MemberId, Delta, Type, Note) SELECT MemberId, 500, 'ADJUST', N'Số dư mẫu' FROM dbo.Members WHERE Phone = '+84901000003';
    SELECT MemberId, FullName FROM dbo.Members WHERE Phone LIKE '+8490100000%';`);
  M = Object.fromEntries(r.recordset.map((x) => [x.FullName, x.MemberId]));
  // Lượt mua thật của "Khách Mới" (tích điểm tự động lúc thu tiền) + một lượt không có hội viên
  const sale = ok(
    await call(staff, 'post', '/api/orders/takeaway', {
      items: [{ menuItemId: ids['Nước suối'], quantity: 10 }],
      amountReceived: 5_000_000,
      memberId: M['Khách Mới'],
    }),
    201,
  );
  ok(await call(staff, 'post', '/api/orders/takeaway', { items: [{ menuItemId: ids['Nước suối'], quantity: 1 }], amountReceived: 5_000_000 }), 201);
  const [pay] = (await pool.request().query(`SELECT AmountDue FROM dbo.Payments WHERE OrderId = ${sale.order.orderId}`)).recordset;
  memberDue = Number(pay.AmountDue);
  earned = (await pool.request().query(`SELECT ISNULL(SUM(Delta), 0) AS E FROM dbo.PointTransactions WHERE MemberId = ${M['Khách Mới']} AND Type = 'EARN'`))
    .recordset[0].E;
});

after(() => app?.close());

describe('Hội viên dễ theo dõi (TASK-082)', () => {
  test('AC-014-09: tổng quan — số hội viên, mới tháng này, quay lại 30 ngày, điểm tích hôm nay, lượt thu có hội viên, doanh thu từ hội viên, tích điểm gần đây', async () => {
    assert.ok(earned > 0, 'lượt mua của hội viên đã được tích điểm tự động');
    const o = ok(await call(admin, 'get', '/api/admin/members/overview'));
    assert.deepEqual(
      [o.total, o.newThisMonth, o.active30, o.lapsed, o.birthdays, o.nearTier],
      [4, 1, 3, 1, 1, 1],
      'mới: Khách Mới · quay lại: Gần Hạng, VIP, Mới · vắng: Khách Vắng · sinh nhật: VIP · sắp lên hạng: Gần Hạng',
    );
    assert.deepEqual([o.earnToday, o.earnMembersToday, o.earn7, o.pointsHeld], [earned, 1, earned, 500 + earned]);
    assert.deepEqual([o.memberPaymentsToday, o.paymentsToday], [1, 2]);
    assert.equal(o.memberRevenue30, memberDue);
    assert.ok(o.revenue30 > memberDue);
    assert.deepEqual([o.recent[0].fullName, o.recent[0].delta, o.recent[0].type, o.recent[0].paymentId !== null], ['Khách Mới', earned, 'EARN', true]);
    assert.equal((await call(staff, 'get', '/api/admin/members/overview')).status, 403);
  });

  test('AC-014-10: lọc nhanh (sắp lên hạng, lâu chưa quay lại, sinh nhật, chi nhiều, nhiều điểm, mới) và hạng kế tiếp trên mỗi dòng', async () => {
    const view = async (v) => ok(await call(admin, 'get', `/api/admin/members?view=${v}`)).items;
    const names = async (v) => (await view(v)).map((m) => m.fullName);
    const near = await view('near');
    assert.deepEqual(
      near.map((m) => [m.fullName, m.nextTier]),
      [['Khách Gần Hạng', { name: 'Thân thiết', minSpent: 1_000_000, remaining: 150_000 }]],
    );
    assert.deepEqual(await names('lapsed'), ['Khách Vắng']);
    assert.deepEqual(await names('birthday'), ['Khách VIP']);
    assert.deepEqual(await names('new'), ['Khách Mới']);
    assert.equal((await names('top'))[0], 'Khách VIP');
    assert.deepEqual(await names('points'), earned ? ['Khách VIP', 'Khách Mới'] : ['Khách VIP']);
    const all = await view('all');
    assert.equal(all.length, 4);
    assert.equal(all.find((m) => m.fullName === 'Khách VIP').nextTier, null, 'hạng cao nhất');
    assert.match(all[0].phone, /\*/, 'SĐT vẫn che');
    assert.equal((await call(admin, 'get', '/api/admin/members?view=abc')).status, 400);
  });
});
