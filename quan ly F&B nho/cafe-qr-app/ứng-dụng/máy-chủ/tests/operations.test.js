// Integration test (SQL Server thật): F-019 Hoàn tiền sau thu (gồm hoàn đồng thời), F-023 Nhập kho & kiểm kê, báo cáo giá vốn,
// báo cáo marketing, cài đặt quán.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, shiftId;
const adminCreds = { adminUsername: 'admin', adminPassword: 'Admin@123' };

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  shiftId = (await api.post('/api/shifts/open').set(auth(staff)).send({ openingCash: 200000 })).body.shift.shiftId;
});

after(() => app.close());

const ing = async (name) =>
  (await pool.request().query(`SELECT IngredientId, StockQty, ReservedQty, LastUnitCost FROM dbo.Ingredients WHERE Name = N'${name}'`)).recordset[0];
const takeaway = (items, extra = {}) =>
  api
    .post('/api/orders/takeaway')
    .set(auth(staff))
    .send({ items, amountReceived: 5_000_000, ...extra });
const refund = (paymentId, body, token = staff) => api.post(`/api/payments/${paymentId}/refunds`).set(auth(token)).send(body);
const revenueToday = async () => (await api.get(`/api/admin/reports/revenue?from=${todayVn()}&to=${todayVn()}`).set(auth(admin))).body.totalRevenue;

describe('Hoàn tiền sau khi đã thu (F-019)', () => {
  let payment, orderId;

  test('chuẩn bị: bàn 01 gọi 2 cà phê sữa, hoàn tất, thu 58.000đ', async () => {
    const C = await app.customer();
    const s = await app.seat(C, '01');
    const o = await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Cà phê sữa'], quantity: 2 }] });
    orderId = o.body.orderId;
    await api.post(`/api/orders/${orderId}/accept`).set(auth(staff));
    await api.post(`/api/orders/${orderId}/complete`).set(auth(staff));
    const r = await api.post(`/api/sessions/${s}/settle`).set(auth(staff)).send({ amountReceived: 58000 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    payment = r.body.payment;
    assert.equal(await revenueToday(), 58000);
  });

  test('nhân viên không có quản lý duyệt → 403; vượt số đã thu → 400; thiếu lý do → 400', async () => {
    const no = await refund(payment.paymentId, { amount: 10000, reason: 'Khách phàn nàn' });
    assert.equal(no.status, 403);
    assert.equal(no.body.code, 'ADMIN_APPROVAL_REQUIRED');
    const over = await refund(payment.paymentId, { amount: 60000, reason: 'Quá tay', ...adminCreds });
    assert.equal(over.status, 400);
    assert.equal(over.body.code, 'REFUND_EXCEEDS');
    assert.equal((await refund(payment.paymentId, { amount: 1000, reason: '', ...adminCreds })).status, 400);
    assert.equal((await refund(payment.paymentId, { amount: 1000, reason: 'x' }, null)).status, 401);
  });

  test('hoàn một phần: đơn giữ nguyên, doanh thu ngày giảm đúng; hoàn nốt + hoàn kho → đơn VOIDED, kho cộng lại đúng BOM (RESTOCK)', async () => {
    const part = await refund(payment.paymentId, { amount: 20000, reason: 'Ly bị đổ một nửa', ...adminCreds });
    assert.equal(part.status, 201, JSON.stringify(part.body));
    assert.equal(part.body.refund.approvedBy, 'Quản lý');
    assert.deepEqual(part.body.refund.voidedOrderIds, []);
    assert.equal(await revenueToday(), 38000);
    const before = await ing('Cà phê cốt');
    const full = await refund(payment.paymentId, { amount: 38000, reason: 'Pha sai, chưa giao khách', restockInventory: true }, admin);
    assert.equal(full.status, 201, JSON.stringify(full.body));
    assert.deepEqual(full.body.refund.voidedOrderIds, [orderId]);
    assert.equal(full.body.orders.find((o) => o.orderId === orderId).status, 'VOIDED');
    const after = await ing('Cà phê cốt');
    assert.equal(Number(after.StockQty) - Number(before.StockQty), 50);
    const restock = (await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.InventoryTransactions WHERE OrderId = ${orderId} AND Type = 'RESTOCK'`))
      .recordset[0].n;
    assert.equal(restock, 2, 'cà phê cốt + sữa đặc');
    assert.equal(await revenueToday(), 0);
    assert.equal((await refund(payment.paymentId, { amount: 1, reason: 'Thêm nữa', ...adminCreds })).body.code, 'REFUND_EXCEEDS');
  });

  test('hai lần hoàn đồng thời 30.000đ trên bill 50.000đ → một thành công, một REFUND_EXCEEDS', async () => {
    const t = await takeaway([{ menuItemId: ids['Nước suối'], quantity: 5 }]);
    const pid = t.body.payment.paymentId;
    const [a, b] = await Promise.all([
      refund(pid, { amount: 30000, reason: 'Đồng thời A' }, admin),
      refund(pid, { amount: 30000, reason: 'Đồng thời B' }, admin),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [201, 400]);
    const sum = (await pool.request().query(`SELECT SUM(Amount) AS s FROM dbo.Refunds WHERE PaymentId = ${pid}`)).recordset[0].s;
    assert.equal(Number(sum), 30000);
  });

  test('hoàn đơn mang đi chưa làm (PREPARING): đơn VOIDED, trả phần kho đang giữ; hội viên bị trừ chi tiêu', async () => {
    const C = await app.customer();
    const m = await C.post('/api/members', { phone: '0901112223', fullName: 'Phạm Minh', consent: true });
    const before = await ing('Sữa tươi');
    const t = await takeaway([{ menuItemId: ids['Latte'], quantity: 2 }], { memberId: m.body.memberId });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    assert.equal(Number((await ing('Sữa tươi')).ReservedQty) - Number(before.ReservedQty), 300);
    const due = t.body.payment.amountDue;
    const r = await refund(t.body.payment.paymentId, { amount: due, reason: 'Khách đổi ý trước khi pha' }, admin);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.orders[0].status, 'VOIDED');
    assert.equal(Number((await ing('Sữa tươi')).ReservedQty), Number(before.ReservedQty));
    const mem = (await pool.request().query(`SELECT TotalSpent FROM dbo.Members WHERE MemberId = ${m.body.memberId}`)).recordset[0];
    assert.equal(Number(mem.TotalSpent), 0);
    assert.equal((await api.post(`/api/orders/${t.body.order.orderId}/complete`).set(auth(staff))).status, 409, 'đơn đã hoàn không hoàn tất được');
  });

  test('quá ngày thu tiền → 409 REFUND_WINDOW_EXPIRED; ca ghi tiền hoàn; danh sách hoàn tiền cho quản lý', async () => {
    const t = await takeaway([{ menuItemId: ids['Nước suối'], quantity: 1 }]);
    await pool.request().query(`UPDATE dbo.Payments SET PaidAt = DATEADD(DAY, -1, PaidAt) WHERE PaymentId = ${t.body.payment.paymentId}`);
    const r = await refund(t.body.payment.paymentId, { amount: 5000, reason: 'Hôm qua' }, admin);
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'REFUND_WINDOW_EXPIRED');
    const rep = (await api.get(`/api/shifts/${shiftId}/report`).set(auth(staff))).body;
    const refunded = (await pool.request().query(`SELECT SUM(Amount) AS s FROM dbo.Refunds WHERE ShiftId = ${shiftId}`)).recordset[0].s;
    assert.equal(rep.shift.cashOut, Number(refunded));
    assert.equal(rep.shift.expectedCash, 200000 + rep.shift.cashIn - rep.shift.cashOut);
    assert.ok(rep.report.refunds.length >= 4);
    const list = await api.get(`/api/admin/refunds?from=${todayVn()}&to=${todayVn()}`).set(auth(admin));
    assert.ok(list.body.length >= 4);
    assert.equal((await api.get(`/api/admin/refunds?from=${todayVn()}&to=${todayVn()}`).set(auth(staff))).status, 403);
  });
});

describe('Nhập kho & kiểm kê (F-023)', () => {
  test('phiếu nhập: cộng tồn + IMPORT + giá nhập gần nhất; dòng trùng / SL 0 → 400', async () => {
    const sua = await ing('Sữa tươi');
    const duong = await ing('Đường');
    const dup = await api
      .post('/api/admin/stock-receipts')
      .set(auth(admin))
      .send({
        lines: [
          { ingredientId: sua.IngredientId, qty: 1 },
          { ingredientId: sua.IngredientId, qty: 2 },
        ],
      });
    assert.equal(dup.status, 400);
    assert.equal(
      (
        await api
          .post('/api/admin/stock-receipts')
          .set(auth(admin))
          .send({ lines: [{ ingredientId: sua.IngredientId, qty: 0 }] })
      ).status,
      400,
    );
    const r = await api
      .post('/api/admin/stock-receipts')
      .set(auth(admin))
      .send({
        supplier: 'Vinamilk',
        lines: [
          { ingredientId: sua.IngredientId, qty: 1000, unitCost: 30 },
          { ingredientId: duong.IngredientId, qty: 500, unitCost: 20 },
        ],
      });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.lines.length, 2);
    const after = await ing('Sữa tươi');
    assert.equal(Number(after.StockQty) - Number(sua.StockQty), 1000);
    assert.equal(Number(after.LastUnitCost), 30);
    const tx = (await pool.request().query(`SELECT TOP 1 * FROM dbo.InventoryTransactions WHERE IngredientId = ${sua.IngredientId} ORDER BY TxnId DESC`))
      .recordset[0];
    assert.equal(tx.Type, 'IMPORT');
    assert.equal(tx.StockReceiptId, r.body.receiptId);
    assert.match(tx.Reason, /Vinamilk/);
    const list = await api.get(`/api/admin/stock-receipts?from=${todayVn()}&to=${todayVn()}`).set(auth(admin));
    assert.equal(list.body[0].totalCost, 1000 * 30 + 500 * 20);
  });

  test('kiểm kê: phiếu DRAFT khóa điều chỉnh tay; chốt → ADJUST theo chênh lệch thực tế; chốt lại → 409', async () => {
    const sua = await ing('Sữa tươi');
    const duong = await ing('Đường');
    const st = await api
      .post('/api/admin/stocktakes')
      .set(auth(admin))
      .send({ ingredientIds: [sua.IngredientId, duong.IngredientId], note: 'Kiểm cuối ngày' });
    assert.equal(st.status, 201, JSON.stringify(st.body));
    assert.equal(st.body.status, 'DRAFT');
    const locked = await api.post(`/api/admin/ingredients/${sua.IngredientId}/adjust`).set(auth(admin)).send({ delta: 1, reason: 'x' });
    assert.equal(locked.status, 409);
    assert.equal(locked.body.code, 'STOCKTAKE_LOCKED');
    const incomplete = await api.post(`/api/admin/stocktakes/${st.body.stocktakeId}/post`).set(auth(admin));
    assert.equal(incomplete.body.code, 'STOCKTAKE_INCOMPLETE');
    await api
      .put(`/api/admin/stocktakes/${st.body.stocktakeId}/lines`)
      .set(auth(admin))
      .send([
        { ingredientId: sua.IngredientId, countedQty: Number(sua.StockQty) - 100, note: 'Đổ vỡ' },
        { ingredientId: duong.IngredientId, countedQty: Number(duong.StockQty) },
      ]);
    const posted = await api.post(`/api/admin/stocktakes/${st.body.stocktakeId}/post`).set(auth(admin));
    assert.equal(posted.status, 200, JSON.stringify(posted.body));
    assert.equal(posted.body.status, 'POSTED');
    assert.equal(posted.body.shrinkageValue, 3000);
    assert.equal(Number((await ing('Sữa tươi')).StockQty), Number(sua.StockQty) - 100);
    const adj = (await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.InventoryTransactions WHERE StocktakeId = ${st.body.stocktakeId}`)).recordset[0].n;
    assert.equal(adj, 1, 'chỉ dòng có chênh lệch');
    assert.equal((await api.post(`/api/admin/stocktakes/${st.body.stocktakeId}/post`).set(auth(admin))).body.code, 'STOCKTAKE_NOT_DRAFT');
    assert.equal((await api.post(`/api/admin/ingredients/${sua.IngredientId}/adjust`).set(auth(admin)).send({ delta: 1, reason: 'Hết khóa' })).status, 200);
  });

  test('số đếm thấp hơn phần đang giữ cho đơn → 409 kèm tên nguyên liệu; xóa phiếu nháp', async () => {
    const C = await app.customer();
    const s = await app.seat(C, '05');
    const o = await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Latte'], quantity: 1 }] });
    const sua = await ing('Sữa tươi');
    const st = (
      await api
        .post('/api/admin/stocktakes')
        .set(auth(admin))
        .send({ ingredientIds: [sua.IngredientId] })
    ).body;
    await api
      .put(`/api/admin/stocktakes/${st.stocktakeId}/lines`)
      .set(auth(admin))
      .send([{ ingredientId: sua.IngredientId, countedQty: 0 }]);
    const r = await api.post(`/api/admin/stocktakes/${st.stocktakeId}/post`).set(auth(admin));
    assert.equal(r.status, 409);
    assert.match(r.body.message, /Sữa tươi/);
    assert.equal((await api.delete(`/api/admin/stocktakes/${st.stocktakeId}`).set(auth(admin))).status, 200);
    await api.post(`/api/orders/${o.body.orderId}/cancel`).set(auth(staff)).send({});
  });

  test('báo cáo giá vốn: món đủ giá nhập có COGS + lãi gộp; món thiếu giá → null; hao hụt theo kỳ', async () => {
    const t = await takeaway([{ menuItemId: ids['Sữa tươi đường'], quantity: 2 }]);
    await api.post(`/api/orders/${t.body.order.orderId}/complete`).set(auth(staff));
    const r = await api.get(`/api/admin/reports/costs?from=${todayVn()}&to=${todayVn()}`).set(auth(admin));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const std = r.body.items.find((i) => i.name === 'Sữa tươi đường');
    assert.deepEqual([std.qty, std.unitCost, std.cogs, std.grossProfit], [2, 200 * 30 + 10 * 20, 12400, 50000 - 12400]);
    assert.equal(r.body.items.find((i) => i.name === 'Cà phê sữa')?.unitCost ?? null, null, 'cà phê cốt chưa có giá nhập');
    // Combo: giá vốn = Σ món thành phần đã lưu trên đơn; dòng con không thành dòng riêng (doanh thu 0)
    const combo = await api
      .post('/api/admin/combos')
      .set(auth(admin))
      .send({ name: 'Combo 2 sữa tươi', price: 45000, components: [{ menuItemId: ids['Sữa tươi đường'], quantity: 2 }] });
    const tc = await takeaway([{ menuItemId: combo.body.menuItemId, quantity: 1 }]);
    await api.post(`/api/orders/${tc.body.order.orderId}/complete`).set(auth(staff));
    const r2 = await api.get(`/api/admin/reports/costs?from=${todayVn()}&to=${todayVn()}`).set(auth(admin));
    const c = r2.body.items.find((i) => i.name === 'Combo 2 sữa tươi');
    assert.deepEqual([c.qty, c.revenue, c.cogs, c.grossProfit], [1, 45000, 12400, 45000 - 12400]);
    assert.equal(r2.body.items.find((i) => i.name === 'Sữa tươi đường').qty, 2, 'dòng con combo không cộng vào món lẻ');
    const noBom = r2.body.items.find((i) => i.name === 'Nước suối');
    assert.deepEqual([noBom.unitCost, noBom.hasBom], [null, false], 'món không định lượng: chưa biết giá vốn');
    assert.deepEqual(
      r.body.shrinkage.map((x) => [x.name, x.diff, x.value]),
      [['Sữa tươi', -100, -3000]],
    );
    assert.equal(r.body.shrinkageValue, 3000);
  });
});

describe('Báo cáo marketing + cài đặt', () => {
  test('báo cáo marketing: hội viên mới, hội viên vs khách lẻ, chiết khấu theo loại, hoàn tiền', async () => {
    const r = await api.get(`/api/admin/reports/marketing?from=${todayVn()}&to=${todayVn()}`).set(auth(admin));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.newMemberTotal, 1);
    assert.equal(r.body.memberVsWalkin.member.payments, 1);
    assert.equal(r.body.memberVsWalkin.walkin.payments, 4, 'bàn 01, nước suối, sữa tươi đường, combo (lượt bị lùi sang hôm qua không tính)');
    assert.ok(r.body.discounts.refunds >= 58000 + 30000);
    assert.ok(r.body.discounts.member > 0);
    assert.equal((await api.get('/api/admin/reports/marketing?from=2099-01-01&to=2099-01-02').set(auth(admin))).body.code, 'INVALID_RANGE');
  });

  test('cài đặt: đọc/sửa ngưỡng giảm tay, làm tròn; giá trị sai → 400; STAFF không sửa được', async () => {
    const s = (await api.get('/api/admin/settings').set(auth(admin))).body;
    assert.deepEqual([s.staffMaxPercent, s.staffMaxAmount, s.roundTo, s.firstOrderPercent], [10, 20000, 500, 10]);
    const r = await api.put('/api/admin/settings').set(auth(admin)).send({ staffMaxAmount: 30000, roundTo: 1000 });
    assert.deepEqual([r.body.staffMaxAmount, r.body.roundTo], [30000, 1000]);
    assert.equal((await api.put('/api/admin/settings').set(auth(admin)).send({ roundTo: 300 })).status, 400);
    assert.equal((await api.put('/api/admin/settings').set(auth(staff)).send({ roundTo: 500 })).status, 403);
    const q = await api
      .post('/api/orders/takeaway/quote')
      .set(auth(staff))
      .send({ items: [{ menuItemId: ids['Cà phê sữa'], quantity: 1 }] });
    assert.equal(q.body.totals.amountDue, 29000, 'làm tròn xuống 1.000đ');
    await api.put('/api/admin/settings').set(auth(admin)).send({ staffMaxAmount: 20000, roundTo: 500 });
  });
});
