// Integration test (SQL Server thật) giai đoạn 6 — ADR-006: vai Trưởng ca + ma trận quyền (F-036), sổ quỹ (F-033),
// chấm công / lịch làm / năng suất / nhật ký thao tác (F-035), lãi/lỗ ước tính (F-034).
// Bất biến thêm (helpers/testDb.js): tiền dự kiến chốt ca đúng công thức có sổ quỹ; ca đã đóng không còn khoản chờ duyệt; ≤ 1 chấm công mở / người.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

// Module app import SAU startApp() (config đọc biến môi trường DB test lúc import)
let PERMISSIONS, flushAudit, ttlHours;
let app, api, pool, admin, staff, lead, ids, users, cats;
const ROLES = ['STAFF', 'MANAGER', 'ADMIN'];
const tokenOf = (role) => ({ STAFF: staff, MANAGER: lead, ADMIN: admin })[role];
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const today = todayVn();
const yesterdayUtc = () => new Date(Date.now() - 30 * 3600e3);

async function createUser(username, role, password = 'Pass@123') {
  const r = await call(admin, 'post', '/api/admin/users', { username, password, fullName: `TK ${username}`, role });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.userId;
}
const login = (u, p = 'Pass@123') => app.login(u, p);
const currentShift = async () => (await call(staff, 'get', '/api/shifts/current')).body.shift;
const cashCreate = async (token, catName, amount, reason = 'test') => {
  const r = await call(token, 'post', '/api/cash-transactions', { categoryId: cats[catName], amount, reason });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
};
async function sellTakeaway(token = staff, extra = {}) {
  const r = await call(token, 'post', '/api/orders/takeaway', { items: [{ menuItemId: ids['Nước suối'], quantity: 2 }], amountReceived: 1_000_000, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
const openAttendance = async (userId) => q1(`SELECT * FROM dbo.Attendance WHERE UserId = ${userId} AND ClockOut IS NULL`);

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  ({ PERMISSIONS } = await import('../src/auth/permissions.js'));
  ({ flushAudit } = await import('../src/middleware/audit.js'));
  ({ ttlHours } = await import('../src/services/attendanceService.js'));
  admin = await app.login('admin', 'Admin@123');
  ids = await app.ids();
  await createUser('lead1', 'MANAGER');
  await createUser('lead2', 'MANAGER');
  await createUser('staff9', 'STAFF');
  users = Object.fromEntries((await q1('SELECT UserId, Username FROM dbo.Users')).map((u) => [u.Username, u.UserId]));
  staff = await app.login('staff1', 'Staff@123');
  lead = await login('lead1');
  cats = Object.fromEntries((await call(staff, 'get', '/api/cash-categories')).body.map((c) => [c.name, c.categoryId]));
  assert.equal((await call(staff, 'post', '/api/shifts/open', { openingCash: 5_000_000 })).status, 201);
});

after(() => app.close());

// ===================== F-036 Ma trận quyền =====================
describe('Vai Trưởng ca & ma trận quyền (F-036)', () => {
  test('ma trận actor × endpoint sinh từ PERMISSIONS: vai được phép không bị 401/403, vai khác 403', async () => {
    const ingId = (await q1('SELECT TOP 1 IngredientId FROM dbo.Ingredients WHERE DeletedAt IS NULL'))[0].IngredientId;
    const pending = await cashCreate(staff, 'Mua vật tư nhỏ', 600_000, 'mua ly giấy');
    assert.equal(pending.status, 'PENDING');
    const range = `from=${today}&to=${today}`;
    // Mỗi quyền một request đại diện (chỉ đọc, trừ duyệt chi: STAFF 403 → MANAGER duyệt → ADMIN 409 đã duyệt)
    const PROBES = {
      'pos.use': ['get', '/api/orders'],
      'shift.manage': ['get', '/api/shifts/current'],
      'cash.create': ['get', '/api/cash-transactions'],
      'cash.approve': ['post', `/api/cash-transactions/${pending.cashTxnId}/approve`, {}],
      'attendance.edit': ['get', `/api/attendance?${range}`],
      'prep.post': ['get', '/api/prep/recipes'],
      'waste.create': ['get', `/api/waste?${range}`],
      'po.receive': ['get', '/api/receiving/purchase-orders'],
      'inventory.adjust': ['get', `/api/ops/ingredients/${ingId}/transactions`],
      'stocktake.post': ['get', '/api/ops/stocktakes'],
      'admin.all': ['get', `/api/admin/reports/pnl?${range}`],
      'dashboard.view': ['get', '/api/dashboard/today'], // F-043
    };
    assert.deepEqual(
      Object.keys(PERMISSIONS).filter((p) => !(p in PROBES)),
      [],
    );
    const results = [];
    for (const [perm, [method, path, body]] of Object.entries(PROBES)) {
      for (const role of ROLES) {
        const r = await call(tokenOf(role), method, path, body);
        const allowed = PERMISSIONS[perm].includes(role);
        const ok = allowed ? ![401, 403].includes(r.status) : r.status === 403;
        results.push(ok ? null : `${perm} × ${role}: ${r.status} ${r.body?.code ?? ''}`);
      }
    }
    assert.deepEqual(results.filter(Boolean), []);
  });

  test('khách (không token) không gọi được endpoint quầy / trưởng ca / quản lý → 401', async () => {
    for (const path of [
      '/api/attendance',
      '/api/cash-transactions',
      '/api/ops/stocktakes',
      `/api/admin/reports/pnl?from=${today}&to=${today}`,
      '/api/admin/audit-logs',
    ]) {
      assert.equal((await api.get(path)).status, 401, path);
    }
    assert.equal((await api.post('/api/cash-transactions').send({ categoryId: cats['Mua đá'], amount: 1000, reason: 'x' })).status, 401);
  });

  test('giảm giá tay theo vai: nhân viên ≤ 10 %/20k, trưởng ca ≤ 20 %/50k, quản lý không giới hạn', async () => {
    const quote = (token, value) =>
      call(token, 'post', '/api/orders/takeaway/quote', {
        items: [{ menuItemId: ids['Nước suối'], quantity: 10 }],
        manualDiscount: { kind: 'PERCENT', value },
        manualReason: 'khách quen',
      });
    const need = async (token, value) => {
      const r = await quote(token, value);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      return r.body.needsApproval;
    };
    assert.equal(await need(staff, 10), false);
    assert.equal(await need(staff, 15), true);
    assert.equal(await need(lead, 15), false);
    assert.equal(await need(lead, 25), true);
    assert.equal(await need(admin, 90), false);
  });

  test('nhân viên giảm 15 % → trưởng ca nhập tài khoản duyệt được; giảm 25 % → trưởng ca không đủ quyền, quản lý duyệt được', async () => {
    const sale = (value, creds) =>
      call(staff, 'post', '/api/orders/takeaway', {
        items: [{ menuItemId: ids['Nước suối'], quantity: 10 }],
        amountReceived: 1_000_000,
        manualDiscount: { kind: 'PERCENT', value },
        manualReason: 'khách quen',
        ...creds,
      });
    const ok = await sale(15, { adminUsername: 'lead1', adminPassword: 'Pass@123' });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal((await q1(`SELECT ApprovedBy FROM dbo.Payments WHERE PaymentId = ${ok.body.payment.paymentId}`))[0].ApprovedBy, users.lead1);
    const denied = await sale(25, { adminUsername: 'lead1', adminPassword: 'Pass@123' });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, 'ADMIN_APPROVAL_INVALID');
    const byAdmin = await sale(25, { adminUsername: 'admin', adminPassword: 'Admin@123' });
    assert.equal(byAdmin.status, 201, JSON.stringify(byAdmin.body));
    // trưởng ca tự giảm 15 % không cần ai duyệt; người duyệt ghi là chính trưởng ca
    const own = await call(lead, 'post', '/api/orders/takeaway', {
      items: [{ menuItemId: ids['Nước suối'], quantity: 10 }],
      amountReceived: 1_000_000,
      manualDiscount: { kind: 'PERCENT', value: 15 },
      manualReason: 'khách quen',
    });
    assert.equal(own.status, 201, JSON.stringify(own.body));
    assert.equal((await q1(`SELECT ApprovedBy FROM dbo.Payments WHERE PaymentId = ${own.body.payment.paymentId}`))[0].ApprovedBy, users.lead1);
  });

  test('luôn còn một Quản lý: hai quản lý hạ quyền nhau cùng lúc → đúng một người thành công; token cũ hạ quản lý cuối → 409 LAST_ADMIN', async () => {
    // Tự hạ / tự khóa vẫn theo FEATURE-009 (400)
    assert.equal((await call(admin, 'put', `/api/admin/users/${users.admin}`, { fullName: 'Quản lý', role: 'MANAGER' })).body.code, 'CANNOT_CHANGE_OWN_ROLE');
    const admin2 = await createUser('admin2', 'ADMIN');
    const t2 = await login('admin2');
    const [a, b] = await Promise.all([
      call(admin, 'put', `/api/admin/users/${admin2}`, { fullName: 'TK admin2', role: 'MANAGER' }),
      call(t2, 'put', `/api/admin/users/${users.admin}`, { fullName: 'Quản lý', role: 'MANAGER' }),
    ]);
    assert.equal([a, b].filter((r) => r.status === 200).length, 1, JSON.stringify([a.body, b.body]));
    assert.ok([a, b].every((r) => [200, 403, 409].includes(r.status)));
    const [{ N }] = await q1("SELECT COUNT(*) AS N FROM dbo.Users WHERE Role = 'ADMIN' AND IsActive = 1 AND DeletedAt IS NULL");
    assert.equal(N, 1);
    // Đưa về: admin là quản lý duy nhất, admin2 là trưởng ca
    if (a.status !== 200) {
      await pool
        .request()
        .query(`UPDATE dbo.Users SET Role = 'ADMIN' WHERE UserId = ${users.admin}; UPDATE dbo.Users SET Role = 'MANAGER' WHERE UserId = ${admin2}`);
    }
    // Token cũ (admin2 vừa bị hạ nhưng request đã qua kiểm quyền) hạ / khóa quản lý cuối cùng → SQL chặn
    const { update, setActive } = await import('../src/services/userService.js');
    const { sqlErrorNumber } = await import('../src/db.js');
    const lastAdmin = (e) => sqlErrorNumber(e) === 50150; // errorHandler đổi thành 409 LAST_ADMIN
    const stale = { userId: admin2, role: 'ADMIN' };
    await assert.rejects(update(users.admin, { fullName: 'Quản lý', role: 'MANAGER' }, stale), lastAdmin);
    await assert.rejects(setActive(users.admin, false, stale), lastAdmin);
    assert.equal((await q1(`SELECT Role, IsActive FROM dbo.Users WHERE UserId = ${users.admin}`))[0].Role, 'ADMIN');
  });

  test('trưởng ca điều chỉnh kho + kiểm kê ở quầy; nhân viên → 403', async () => {
    const ingId = (await q1("SELECT IngredientId FROM dbo.Ingredients WHERE Name = N'Đường'"))[0].IngredientId;
    assert.equal((await call(staff, 'post', `/api/ops/ingredients/${ingId}/adjust`, { delta: 5, reason: 'đếm lại' })).status, 403);
    const adj = await call(lead, 'post', `/api/ops/ingredients/${ingId}/adjust`, { delta: 5, reason: 'đếm lại' });
    assert.equal(adj.status, 200, JSON.stringify(adj.body));
    assert.equal((await call(staff, 'post', '/api/ops/stocktakes', { ingredientIds: [ingId] })).status, 403);
    const st = await call(lead, 'post', '/api/ops/stocktakes', { ingredientIds: [ingId], note: 'kiểm cuối ca' });
    assert.equal(st.status, 201, JSON.stringify(st.body));
    const stock = Number((await q1(`SELECT StockQty FROM dbo.Ingredients WHERE IngredientId = ${ingId}`))[0].StockQty);
    assert.equal((await call(lead, 'put', `/api/ops/stocktakes/${st.body.stocktakeId}/lines`, [{ ingredientId: ingId, countedQty: stock - 3 }])).status, 200);
    const posted = await call(lead, 'post', `/api/ops/stocktakes/${st.body.stocktakeId}/post`);
    assert.equal(posted.status, 200, JSON.stringify(posted.body));
    assert.equal(Number((await q1(`SELECT StockQty FROM dbo.Ingredients WHERE IngredientId = ${ingId}`))[0].StockQty), stock - 3);
  });
});

// ===================== F-033 Sổ quỹ =====================
describe('Sổ quỹ (F-033)', () => {
  test('chi 50k mua đá → duyệt ngay, tiền dự kiến trong két giảm đúng 50k', async () => {
    const before = await currentShift();
    const t = await cashCreate(staff, 'Mua đá', 50_000, 'mua 2 bao đá');
    assert.equal(t.status, 'APPROVED');
    const after = await currentShift();
    assert.equal(after.expectedCash - before.expectedCash, -50_000);
    assert.equal(after.cashBookOut - before.cashBookOut, 50_000);
  });

  test('chi 800k → chờ duyệt (két chưa trừ); đóng ca → 409 CASH_PENDING; nhân viên duyệt → 403; trưởng ca duyệt → trừ két', async () => {
    const before = await currentShift();
    const t = await cashCreate(staff, 'Lương tạm ứng', 800_000, 'tạm ứng lương');
    assert.equal(t.status, 'PENDING');
    assert.equal((await currentShift()).expectedCash, before.expectedCash);
    const close = await call(staff, 'post', `/api/shifts/${before.shiftId}/close`, { countedCash: before.expectedCash });
    assert.equal(close.status, 409);
    assert.equal(close.body.code, 'CASH_PENDING');
    const byStaff = await call(staff, 'post', `/api/cash-transactions/${t.cashTxnId}/approve`, {});
    assert.equal(byStaff.status, 403);
    const ok = await call(lead, 'post', `/api/cash-transactions/${t.cashTxnId}/approve`, {});
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.status, 'APPROVED');
    assert.equal(ok.body.approvedBy.userId, users.lead1);
    assert.equal((await currentShift()).expectedCash, before.expectedCash - 800_000);
    const again = await call(admin, 'post', `/api/cash-transactions/${t.cashTxnId}/approve`, {});
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'CASH_NOT_PENDING');
  });

  test('danh mục "Khác" luôn chờ duyệt; từ chối cần lý do; khoản bị từ chối không trừ két', async () => {
    const before = await currentShift();
    const t = await cashCreate(staff, 'Khác (chi)', 10_000, 'chi lặt vặt');
    assert.equal(t.status, 'PENDING');
    assert.equal((await call(lead, 'post', `/api/cash-transactions/${t.cashTxnId}/reject`, {})).status, 400);
    const r = await call(lead, 'post', `/api/cash-transactions/${t.cashTxnId}/reject`, { rejectReason: 'không có hóa đơn' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, 'REJECTED');
    assert.equal((await currentShift()).expectedCash, before.expectedCash);
  });

  test('trưởng ca chỉ duyệt ≤ 2.000.000đ; khoản lớn hơn cần quản lý; không tự duyệt khoản của chính mình', async () => {
    const big = await cashCreate(staff, 'Nộp tiền về két tổng', 2_500_000, 'nộp két tổng giữa ca');
    const byLead = await call(lead, 'post', `/api/cash-transactions/${big.cashTxnId}/approve`, {});
    assert.equal(byLead.status, 403);
    const leadCreds = await call(staff, 'post', `/api/cash-transactions/${big.cashTxnId}/approve`, { adminUsername: 'lead1', adminPassword: 'Pass@123' });
    assert.equal(leadCreds.status, 403);
    const byAdmin = await call(staff, 'post', `/api/cash-transactions/${big.cashTxnId}/approve`, { adminUsername: 'admin', adminPassword: 'Admin@123' });
    assert.equal(byAdmin.status, 200, JSON.stringify(byAdmin.body));

    const mine = await cashCreate(lead, 'Mua vật tư nhỏ', 600_000, 'mua ống hút');
    const self = await call(lead, 'post', `/api/cash-transactions/${mine.cashTxnId}/approve`, {});
    assert.equal(self.status, 403);
    assert.equal(self.body.code, 'SELF_APPROVAL');
    const other = await call(lead, 'post', `/api/cash-transactions/${mine.cashTxnId}/approve`, { adminUsername: 'lead2', adminPassword: 'Pass@123' });
    assert.equal(other.status, 200, JSON.stringify(other.body));
    assert.equal(other.body.approvedBy.userId, users.lead2);
  });

  test('thu khác (bổ sung tiền lẻ) → cộng vào két; số tiền ≤ 0 / thiếu lý do / danh mục sai → 400', async () => {
    const before = await currentShift();
    const t = await cashCreate(staff, 'Bổ sung tiền lẻ', 200_000, 'chủ quán đưa tiền lẻ');
    assert.equal(t.status, 'APPROVED');
    assert.equal((await currentShift()).expectedCash, before.expectedCash + 200_000);
    assert.equal((await call(staff, 'post', '/api/cash-transactions', { categoryId: cats['Mua đá'], amount: 0, reason: 'x' })).status, 400);
    assert.equal((await call(staff, 'post', '/api/cash-transactions', { categoryId: cats['Mua đá'], amount: 1000, reason: '  ' })).status, 400);
    const bad = await call(staff, 'post', '/api/cash-transactions', { categoryId: 999999, amount: 1000, reason: 'x' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'CASH_CATEGORY_INVALID');
  });

  test('ảnh hóa đơn: > 2 MB → 400; không phải ảnh → 400; png → lưu và tải lại đúng byte', async () => {
    const t = await cashCreate(staff, 'Trả shipper', 30_000, 'ship nguyên liệu');
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake-png-body')]);
    const upload = (buf, type) => api.put(`/api/cash-transactions/${t.cashTxnId}/receipt`).set(auth(staff)).set('Content-Type', type).send(buf);
    const tooBig = await upload(Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]), 'image/png');
    assert.equal(tooBig.status, 400);
    assert.equal(tooBig.body.code, 'RECEIPT_TOO_LARGE');
    const notImage = await upload(Buffer.from('<script>alert(1)</script>'), 'image/png');
    assert.equal(notImage.status, 400);
    assert.equal(notImage.body.code, 'RECEIPT_INVALID');
    const ok = await upload(png, 'image/png');
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.hasReceipt, true);
    const got = await api
      .get(`/api/cash-transactions/${t.cashTxnId}/receipt`)
      .set(auth(lead))
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(got.status, 200);
    assert.match(got.headers['content-type'], /image\/png/);
    assert.ok(Buffer.compare(got.body, png) === 0);
    assert.equal((await api.get(`/api/cash-transactions/${t.cashTxnId}/receipt`)).status, 401);
  });

  test('sổ quỹ quản lý: tổng theo danh mục (chỉ khoản đã duyệt), CSV có BOM; phiếu chốt ca có bảng thu/chi quỹ', async () => {
    const book = await call(admin, 'get', `/api/admin/cash-transactions?from=${today}&to=${today}`);
    assert.equal(book.status, 200, JSON.stringify(book.body));
    const approvedOut = book.body.rows.filter((t) => t.status === 'APPROVED' && t.direction === 'OUT').reduce((s, t) => s + t.amount, 0);
    assert.equal(book.body.summary.totalOut, approvedOut);
    assert.equal(book.body.summary.byCategory.find((c) => c.name === 'Mua đá').amount, 50_000);
    const onlyRejected = await call(admin, 'get', `/api/admin/cash-transactions?from=${today}&to=${today}&status=REJECTED`);
    assert.equal(onlyRejected.body.rows.length, 1);
    const csv = await call(admin, 'get', `/api/admin/cash-transactions/export.csv?from=${today}&to=${today}`);
    assert.equal(csv.status, 200);
    assert.match(csv.headers['content-type'], /text\/csv/);
    assert.equal(csv.text.charCodeAt(0), 0xfeff);
    assert.ok(csv.text.includes('Mua đá') && csv.text.includes('-50000'));
    assert.equal((await call(lead, 'get', `/api/admin/cash-transactions?from=${today}&to=${today}`)).status, 403);
    const shift = await currentShift();
    const rep = await call(staff, 'get', `/api/shifts/${shift.shiftId}/report`);
    assert.ok(rep.body.report.cashBook.length >= 7);
  });

  test('đóng ca: tiền dự kiến = đầu ca + thu − hoàn + thu khác − chi đã duyệt; két khớp → chênh 0; ca đóng không ghi quỹ được', async () => {
    const shift = await currentShift();
    // Chỉ tiền mặt vào / ra két (ADR-019 D-72): lượt thu CASH, hoàn của lượt thu CASH
    const [{ Pay, Ref }] = await q1(
      `SELECT ISNULL((SELECT SUM(AmountDue) FROM dbo.Payments WHERE ShiftId = ${shift.shiftId} AND Method = 'CASH'), 0) AS Pay,
              ISNULL((SELECT SUM(r.Amount) FROM dbo.Refunds r JOIN dbo.Payments p ON p.PaymentId = r.PaymentId
                      WHERE r.ShiftId = ${shift.shiftId} AND p.Method = 'CASH'), 0) AS Ref`,
    );
    const expected = 5_000_000 + Number(Pay) - Number(Ref) + 200_000 - (600_000 + 50_000 + 800_000 + 2_500_000 + 600_000 + 30_000);
    assert.equal(shift.expectedCash, expected);
    const r = await call(staff, 'post', `/api/shifts/${shift.shiftId}/close`, { countedCash: expected });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.shift.expectedCash, expected);
    assert.equal(r.body.shift.difference, 0);
    assert.ok(r.body.report.cashBook.length > 0);
    const late = await call(staff, 'post', '/api/cash-transactions', { categoryId: cats['Mua đá'], amount: 1000, reason: 'x' });
    assert.equal(late.status, 409);
    assert.equal(late.body.code, 'NO_OPEN_SHIFT');
  });

  test('đóng ca → chấm công của người đóng ca kết thúc', async () => {
    assert.equal((await openAttendance(users.staff1)).length, 0);
  });

  test('hoàn tiền: trưởng ca tự hoàn lượt thu trong ca đang mở; lượt thu ca trước cần quản lý; nhân viên luôn cần duyệt', async () => {
    const oldPayment = (await q1(`SELECT TOP 1 PaymentId FROM dbo.Payments WHERE ShiftId IS NOT NULL ORDER BY PaymentId`))[0].PaymentId;
    assert.equal((await call(lead, 'post', '/api/shifts/open', { openingCash: 500_000 })).status, 201);
    const body = { amount: 1000, reason: 'khách trả lại', restockInventory: false, orderIds: [] };
    const otherShift = await call(lead, 'post', `/api/payments/${oldPayment}/refunds`, body);
    assert.equal(otherShift.status, 403);
    const withAdmin = await call(lead, 'post', `/api/payments/${oldPayment}/refunds`, { ...body, adminUsername: 'admin', adminPassword: 'Admin@123' });
    assert.equal(withAdmin.status, 201, JSON.stringify(withAdmin.body));
    const sale = await sellTakeaway(staff);
    const pid = sale.payment.paymentId;
    assert.equal((await call(staff, 'post', `/api/payments/${pid}/refunds`, body)).status, 403);
    const own = await call(lead, 'post', `/api/payments/${pid}/refunds`, body);
    assert.equal(own.status, 201, JSON.stringify(own.body));
    assert.equal((await q1(`SELECT ApprovedBy FROM dbo.Refunds WHERE RefundId = ${own.body.refund.refundId}`))[0].ApprovedBy, users.lead1);
  });
});

// ===================== F-035 Chấm công, lịch làm, năng suất =====================
describe('Chấm công, lịch làm, năng suất (F-035)', () => {
  test('đăng nhập → vào ca (nhân viên / trưởng ca); đăng nhập lại không tạo thêm; quản lý không tự chấm; đăng xuất → ra ca', async () => {
    staff = await app.login('staff1', 'Staff@123');
    const open = await openAttendance(users.staff1);
    assert.equal(open.length, 1);
    assert.equal(open[0].Source, 'LOGIN');
    staff = await app.login('staff1', 'Staff@123');
    assert.equal((await openAttendance(users.staff1)).length, 1);
    await app.login('admin', 'Admin@123');
    assert.equal((await q1(`SELECT COUNT(*) AS N FROM dbo.Attendance WHERE UserId = ${users.admin}`))[0].N, 0);
    const t9 = await login('staff9');
    assert.equal((await openAttendance(users.staff9)).length, 1);
    const out = await call(t9, 'post', '/api/auth/logout');
    assert.equal(out.status, 200);
    assert.equal(out.body.clockedOut, 1);
    assert.equal((await openAttendance(users.staff9)).length, 0);
  });

  test('đăng nhập đồng thời 5 lần → đúng một lần chấm công đang mở', async () => {
    await Promise.all(Array.from({ length: 5 }, () => api.post('/api/auth/login').send({ username: 'lead2', password: 'Pass@123' })));
    assert.equal((await openAttendance(users.lead2)).length, 1);
  });

  test('quên đăng xuất: bản ghi mở quá 12 giờ được đóng tại +12 giờ khi đăng nhập lại; job đóng bản ghi quá thời hạn token (8 giờ)', async () => {
    await pool.request().query(`UPDATE dbo.Attendance SET ClockIn = DATEADD(HOUR, -13, SYSUTCDATETIME()) WHERE UserId = ${users.lead2} AND ClockOut IS NULL`);
    await login('lead2');
    const rows = await q1(`SELECT ClockIn, ClockOut FROM dbo.Attendance WHERE UserId = ${users.lead2} ORDER BY AttId`);
    const stale = rows.at(-2);
    assert.equal((new Date(stale.ClockOut) - new Date(stale.ClockIn)) / 3600e3, 12);
    assert.equal(rows.at(-1).ClockOut, null);

    const ttl = ttlHours(); // thời hạn token (JWT_EXPIRES_IN, mặc định 8 giờ)
    await pool
      .request()
      .query(
        `UPDATE dbo.Attendance SET ClockIn = DATEADD(MINUTE, -${Math.round((ttl + 1) * 60)}, SYSUTCDATETIME()) WHERE UserId = ${users.lead2} AND ClockOut IS NULL`,
      );
    const job = await call(admin, 'post', '/api/admin/jobs/attendance-autoclose/run');
    assert.equal(job.status, 200, JSON.stringify(job.body));
    const last = (await q1(`SELECT TOP 1 ClockIn, ClockOut FROM dbo.Attendance WHERE UserId = ${users.lead2} ORDER BY AttId DESC`))[0];
    assert.equal(Math.round((new Date(last.ClockOut) - new Date(last.ClockIn)) / 60e3), Math.round(ttl * 60));
  });

  test('sửa chấm công: thiếu lý do → 400; trưởng ca sửa trong ngày được, ngày trước → 403; quản lý sửa mọi ngày; chồng giờ → 409', async () => {
    const [cur] = await openAttendance(users.staff1);
    const clockIn = new Date(cur.ClockIn).toISOString(); // giữ giờ vào (lùi giờ sẽ chồng lên lần chấm công đã đóng lúc đóng ca)
    assert.equal((await call(lead, 'put', `/api/attendance/${cur.AttId}`, { clockIn })).status, 400);
    const ok = await call(lead, 'put', `/api/attendance/${cur.AttId}`, { clockIn, reason: 'quên bấm vào ca' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.editedBy.userId, users.lead1);

    const y = yesterdayUtc();
    const created = await call(admin, 'post', '/api/attendance', {
      userId: users.staff9,
      clockIn: y.toISOString(),
      clockOut: new Date(y.getTime() + 4 * 3600e3).toISOString(),
      reason: 'máy chấm công hỏng',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.source, 'MANUAL');
    const leadEdit = await call(lead, 'put', `/api/attendance/${created.body.attId}`, { clockIn: y.toISOString(), clockOut: null, reason: 'sửa' });
    assert.equal(leadEdit.status, 403);
    assert.equal(leadEdit.body.code, 'ATTENDANCE_NOT_TODAY');
    const adminEdit = await call(admin, 'put', `/api/attendance/${created.body.attId}`, {
      clockIn: y.toISOString(),
      clockOut: new Date(y.getTime() + 5 * 3600e3).toISOString(),
      reason: 'về muộn 1 giờ',
    });
    assert.equal(adminEdit.status, 200, JSON.stringify(adminEdit.body));
    assert.equal(adminEdit.body.minutes, 300);
    const overlap = await call(admin, 'post', '/api/attendance', {
      userId: users.staff9,
      clockIn: new Date(y.getTime() + 3600e3).toISOString(),
      clockOut: new Date(y.getTime() + 2 * 3600e3).toISOString(),
      reason: 'trùng',
    });
    assert.equal(overlap.status, 409);
    assert.equal((await call(staff, 'get', `/api/attendance?from=${today}&to=${today}`)).status, 403);
  });

  test('lịch làm: thêm / kéo sang ngày khác (PUT) / chép tuần; cảnh báo vắng & đi muộn > 15 phút', async () => {
    const vnMinutes = Math.floor(((Date.now() + 7 * 3600e3) % 86400e3) / 60e3);
    const absentId = await createUser('staff8', 'STAFF'); // chưa từng đăng nhập
    const r9 = await call(admin, 'post', '/api/admin/rosters', { userId: absentId, workDate: today, startTime: '00:00', endTime: '23:59' });
    assert.equal(r9.status, 201, JSON.stringify(r9.body));
    const rs = await call(admin, 'post', '/api/admin/rosters', { userId: users.staff1, workDate: today, startTime: '00:00', endTime: '23:59' });
    assert.equal(rs.status, 201);
    const tomorrow = new Date(Date.now() + 7 * 3600e3 + 86400e3).toISOString().slice(0, 10);
    const rt = await call(admin, 'post', '/api/admin/rosters', {
      userId: users.lead1,
      workDate: tomorrow,
      startTime: '07:00',
      endTime: '15:00',
      note: 'ca sáng',
    });
    assert.equal(rt.status, 201);
    assert.equal(
      (await call(admin, 'post', '/api/admin/rosters', { userId: users.lead1, workDate: tomorrow, startTime: '07:00', endTime: '07:00' })).status,
      400,
    );
    const list = (await call(admin, 'get', `/api/admin/rosters?from=${today}&to=${tomorrow}`)).body;
    const byId = Object.fromEntries(list.map((r) => [r.rosterId, r]));
    assert.equal(byId[rt.body.rosterId].status, 'UPCOMING');
    if (vnMinutes > 20) {
      // staff8 chưa chấm công → vắng; staff1 đăng nhập từ đầu test → muộn so với 00:00
      assert.equal(byId[r9.body.rosterId].status, 'ABSENT');
      assert.equal(byId[rs.body.rosterId].status, 'LATE');
      assert.ok(byId[rs.body.rosterId].lateMinutes > 15);
    }
    const moved = await call(admin, 'put', `/api/admin/rosters/${rt.body.rosterId}`, {
      userId: users.lead2,
      workDate: tomorrow,
      startTime: '07:00',
      endTime: '15:00',
      note: 'ca sáng',
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.user.userId, users.lead2);
    const monday = (d) => new Date(Date.parse(`${d}T00:00:00Z`) - ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) * 86400e3).toISOString().slice(0, 10);
    const week = monday(today);
    const nextWeek = new Date(Date.parse(`${week}T00:00:00Z`) + 7 * 86400e3).toISOString().slice(0, 10);
    const copy = await call(admin, 'post', '/api/admin/rosters/copy-week', { fromWeek: week, toWeek: nextWeek });
    assert.equal(copy.status, 200, JSON.stringify(copy.body));
    const again = await call(admin, 'post', '/api/admin/rosters/copy-week', { fromWeek: week, toWeek: nextWeek });
    assert.equal(again.body.created, 0);
    assert.equal((await call(lead, 'get', `/api/admin/rosters?from=${today}&to=${today}`)).status, 403);
  });

  test('năng suất: tiền thu theo người thu, đơn hoàn tất theo người bấm, giờ làm theo chấm công', async () => {
    const r = await call(admin, 'get', `/api/admin/reports/productivity?from=${today}&to=${today}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const s1 = r.body.rows.find((x) => x.user.userId === users.staff1);
    const [{ Amount, N }] = await q1(
      `SELECT ISNULL(SUM(AmountDue), 0) AS Amount, COUNT(*) AS N FROM dbo.Payments WHERE ReceivedBy = ${users.staff1} AND PaidAt >= DATEADD(HOUR, -7, CAST('${today}' AS DATETIME2))`,
    );
    assert.equal(s1.amount, Number(Amount));
    assert.equal(s1.payments, N);
    assert.ok(s1.minutes >= 0);
  });
});

// ===================== F-035 Nhật ký thao tác =====================
describe('Nhật ký thao tác (F-035, D-26)', () => {
  test('hoàn tiền → một dòng nhật ký có trước/sau; duyệt chi, sửa chấm công, đổi vai trò đều có nhật ký', async () => {
    await flushAudit();
    const refunds = await q1("SELECT * FROM dbo.AuditLogs WHERE Action = 'payment.refund' ORDER BY AuditId");
    assert.equal(refunds.length, 2); // hai lượt hoàn thành công ở phần sổ quỹ (lượt 403 không ghi)
    const before = JSON.parse(refunds[0].BeforeJson);
    const after = JSON.parse(refunds[0].AfterJson);
    assert.equal(String(before.PaymentId), refunds[0].EntityId);
    assert.equal(after.result.refund.amount, 1000);
    assert.equal(refunds[0].Entity, 'Payment');
    const actions = new Set((await q1('SELECT DISTINCT Action FROM dbo.AuditLogs')).map((x) => x.Action));
    for (const a of [
      'cash.create',
      'cash.approve',
      'cash.reject',
      'cash.receipt',
      'attendance.update',
      'attendance.create',
      'users.update',
      'users.create',
      'shift.close',
      'inventory.adjust',
      'stocktake.post',
      'rosters.create',
      'rosters.copy-week',
    ]) {
      assert.ok(actions.has(a), `thiếu nhật ký ${a}`);
    }
    const role = (await q1(`SELECT TOP 1 BeforeJson, AfterJson FROM dbo.AuditLogs WHERE Action = 'users.update' ORDER BY AuditId DESC`))[0];
    assert.equal(JSON.parse(role.BeforeJson).Role, 'ADMIN');
    assert.equal(JSON.parse(role.AfterJson).result.role, 'MANAGER');
  });

  test('nhật ký không chứa mật khẩu / hash / token; ảnh chỉ ghi kích thước', async () => {
    await flushAudit();
    const leaks = await q1(
      `SELECT AuditId, Action FROM dbo.AuditLogs
       WHERE BeforeJson LIKE '%PasswordHash%' OR AfterJson LIKE '%PasswordHash%' OR AfterJson LIKE '%assword%'
          OR AfterJson LIKE '%Pass@123%' OR AfterJson LIKE '%Admin@123%' OR AfterJson LIKE '%accessToken%' OR AfterJson LIKE '%$2a$%' OR AfterJson LIKE '%$2b$%'`,
    );
    assert.deepEqual(leaks, []);
    const img = (await q1("SELECT AfterJson FROM dbo.AuditLogs WHERE Action = 'cash.receipt'"))[0];
    assert.match(JSON.parse(img.AfterJson).input.image, /bytes/);
  });

  test('nhật ký chỉ đọc: UPDATE bị chặn; quản lý lọc theo đối tượng; trưởng ca không xem được', async () => {
    await assert.rejects(pool.request().query("UPDATE dbo.AuditLogs SET Action = 'x'"), /AUDIT_READONLY/);
    const r = await call(admin, 'get', `/api/admin/audit-logs?from=${today}&to=${today}&entity=Payment`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.rows.length >= 2 && r.body.rows.every((x) => x.entity === 'Payment'));
    const facets = await call(admin, 'get', '/api/admin/audit-logs/facets');
    assert.ok(facets.body.entities.includes('CashTransaction'));
    assert.equal((await call(lead, 'get', `/api/admin/audit-logs?from=${today}&to=${today}`)).status, 403);
  });
});

// ===================== F-034 Lãi/lỗ =====================
describe('Lãi / lỗ ước tính (F-034)', () => {
  // Một ngày quá khứ (giờ VN 15/09/2026): thu 2.000.000, hoàn 100.000, giá vốn 600.000, chi quỹ 150.000, cố định 30.000.000/tháng (tháng 9 có 30 ngày)
  before(async () => {
    const at = "'2026-09-15T03:00:00'";
    await pool.request().query(`
      DECLARE @Shift INT, @Order INT, @Pay INT;
      INSERT dbo.Shifts (OpenedBy, OpenedAt, OpeningCash, ClosedBy, ClosedAt, ExpectedCash, CountedCash, Difference)
      VALUES (${users.staff1}, '2026-09-15T01:00:00', 0, ${users.staff1}, '2026-09-15T12:00:00', 1750000, 1750000, 0);
      SET @Shift = SCOPE_IDENTITY();
      INSERT dbo.Orders (OrderCode, Type, Status, PaymentStatus, PaymentMethod, TotalAmount, SubtotalAmount, CreatedBy, CreatedAt, PaidAt, CompletedAt, CompletedBy)
      VALUES ('PNLTEST1', 'TAKE_AWAY', 'COMPLETED', 'PAID', 'CASH', 2000000, 2000000, ${users.staff1}, ${at}, ${at}, ${at}, ${users.staff1});
      SET @Order = SCOPE_IDENTITY();
      INSERT dbo.OrderItems (OrderId, MenuItemId, Quantity, UnitPrice, CogsAmount) VALUES (@Order, ${ids['Nước suối']}, 1, 2000000, 600000);
      INSERT dbo.Payments (OrderId, AmountDue, AmountReceived, ReceivedBy, PaidAt, SubtotalAmount, ShiftId)
      VALUES (@Order, 2000000, 2000000, ${users.staff1}, ${at}, 2000000, @Shift);
      SET @Pay = SCOPE_IDENTITY();
      INSERT dbo.Refunds (PaymentId, Amount, Reason, ApprovedBy, CreatedBy, ShiftId, CreatedAt)
      VALUES (@Pay, 100000, N'pha sai', ${users.admin}, ${users.admin}, @Shift, '2026-09-15T05:00:00');
      INSERT dbo.CashTransactions (ShiftId, CategoryId, Direction, Amount, Reason, Status, CreatedBy, CreatedAt, ApprovedBy, ApprovedAt)
      VALUES (@Shift, ${cats['Mua đá']}, 'OUT', 150000, N'đá', 'APPROVED', ${users.staff1}, '2026-09-15T04:00:00', ${users.staff1}, '2026-09-15T04:00:00');
      -- khoản nộp két (không phải chi phí) không vào lãi/lỗ
      INSERT dbo.CashTransactions (ShiftId, CategoryId, Direction, Amount, Reason, Status, CreatedBy, CreatedAt)
      VALUES (@Shift, ${cats['Nộp tiền về két tổng']}, 'OUT', 1, N'nộp két', 'REJECTED', ${users.staff1}, '2026-09-15T04:00:00');`);
    const fc = await call(admin, 'post', '/api/admin/fixed-costs', { name: 'Mặt bằng', monthlyAmount: 30_000_000, effectiveFrom: '2026-09-01' });
    assert.equal(fc.status, 201, JSON.stringify(fc.body));
  });

  test('một ngày: doanh thu thuần, giá vốn, lãi gộp, chi quỹ, cố định phân bổ, lợi nhuận, hòa vốn đúng công thức', async () => {
    const r = await call(admin, 'get', '/api/admin/reports/pnl?from=2026-09-15&to=2026-09-15');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const p = r.body;
    assert.equal(p.note, 'ước tính');
    assert.deepEqual(
      [p.revenueGross, p.discounts, p.refunds, p.revenueNet, p.cogs, p.grossMargin, p.cashExpenses, p.fixedCostsAllocated, p.operatingProfit],
      [2_000_000, 0, 100_000, 1_900_000, 600_000, 1_300_000, 150_000, 1_000_000, 150_000],
    );
    assert.equal(p.grossMarginPct, 68.42);
    assert.equal(p.breakEvenPerDay, Math.round((1_000_000 * 1_900_000) / 1_300_000));
    assert.equal(p.estimatedCogsRows, 0);
    assert.deepEqual(p.expensesByCategory, [{ categoryId: cats['Mua đá'], name: 'Mua đá', amount: 150_000 }]);
  });

  test('theo tháng: cố định phân bổ đủ 30.000.000 cho cả tháng 9; khoảng sai → 400; trưởng ca → 403', async () => {
    const r = await call(admin, 'get', '/api/admin/reports/pnl?from=2026-09-01&to=2026-09-30&groupBy=month');
    assert.equal(r.status, 200);
    assert.equal(r.body.series.length, 1);
    assert.equal(r.body.series[0].period, '2026-09');
    assert.equal(r.body.fixedCostsAllocated, 30_000_000);
    assert.equal((await call(admin, 'get', '/api/admin/reports/pnl?from=2026-09-30&to=2026-09-01')).status, 400);
    assert.equal((await call(lead, 'get', '/api/admin/reports/pnl?from=2026-09-15&to=2026-09-15')).status, 403);
  });

  test('đơn chưa có giá vốn chốt → ước tính theo định lượng đã giữ × giá vốn hiện tại, gắn cờ estimatedCogsRows', async () => {
    await pool.request().query("UPDATE dbo.Ingredients SET AvgCost = 50 WHERE Name = N'Đường'");
    const ing = (await q1("SELECT IngredientId, AvgCost FROM dbo.Ingredients WHERE Name = N'Đường'"))[0];
    await pool.request().query(`
      DECLARE @Order INT;
      INSERT dbo.Orders (OrderCode, Type, Status, PaymentStatus, PaymentMethod, TotalAmount, CreatedAt, PaidAt, CompletedAt)
      VALUES ('PNLTEST2', 'TAKE_AWAY', 'COMPLETED', 'PAID', 'CASH', 50000, '2026-09-16T03:00:00', '2026-09-16T03:00:00', '2026-09-16T03:00:00');
      SET @Order = SCOPE_IDENTITY();
      INSERT dbo.OrderItems (OrderId, MenuItemId, Quantity, UnitPrice) VALUES (@Order, ${ids['Cà phê đen']}, 2, 25000);
      INSERT dbo.OrderIngredients (OrderId, IngredientId, Qty) VALUES (@Order, ${ing.IngredientId}, 40);`);
    const r = await call(admin, 'get', '/api/admin/reports/pnl?from=2026-09-16&to=2026-09-16');
    assert.equal(r.status, 200);
    assert.equal(r.body.cogs, Math.round(40 * Number(ing.AvgCost)));
    assert.equal(r.body.cogs, 2000);
    assert.equal(r.body.estimatedCogsRows, 1);
  });

  test('chi phí cố định: hết hiệu lực giữa tháng chỉ tính tới ngày kết thúc; ngày kết thúc trước ngày bắt đầu → 400', async () => {
    const r = await call(admin, 'post', '/api/admin/fixed-costs', {
      name: 'Internet',
      monthlyAmount: 300_000,
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-09-10',
    });
    assert.equal(r.status, 201);
    const p = (await call(admin, 'get', '/api/admin/reports/pnl?from=2026-09-01&to=2026-09-30&groupBy=month')).body;
    assert.equal(p.fixedCostsAllocated, 30_000_000 + 100_000);
    const bad = await call(admin, 'post', '/api/admin/fixed-costs', { name: 'X', monthlyAmount: 1, effectiveFrom: '2026-09-10', effectiveTo: '2026-09-01' });
    assert.equal(bad.status, 400);
    assert.equal((await call(admin, 'delete', `/api/admin/fixed-costs/${r.body.costId}`)).status, 200);
  });
});
