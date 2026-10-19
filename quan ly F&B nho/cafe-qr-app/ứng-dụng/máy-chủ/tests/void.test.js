// Integration test (SQL Server thật) F-046 — sửa / xóa món đã gọi, xóa đơn, hủy lượt phục vụ bàn (ADR-007 D-33…D-35).
// Bất biến thêm (helpers/testDb.js): không hoàn kho quá lượng đơn đã trừ (tính cả phần ghi hủy khi xóa món), tổng đơn khớp dòng
// + khuyến mãi đơn, giá vốn đơn = giá vốn kho đã trừ − phần giảm khi xóa món.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let flushAudit;
let app, api, pool, admin, staff, lead, ids, ing, users, staffSock;
const LEAD = { adminUsername: 'lead1', adminPassword: 'Pass@123' };

const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const stockOf = async (name) => {
  const [x] = await q1(`SELECT StockQty, ReservedQty FROM dbo.Ingredients WHERE Name = N'${name}' AND DeletedAt IS NULL`);
  return { stock: Number(x.StockQty), reserved: Number(x.ReservedQty) };
};
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const voidLine = (orderItemId, body, token = staff) => call(token, 'post', `/api/order-items/${orderItemId}/void`, body);
const voidOrder = (orderId, body, token = staff) => call(token, 'post', `/api/orders/${orderId}/void`, body);
const cancelTable = (sessionId, body, token = staff) => call(token, 'post', `/api/sessions/${sessionId}/cancel`, body);
const accept = (orderId) => call(staff, 'post', `/api/orders/${orderId}/accept`);
const complete = (orderId) => call(staff, 'post', `/api/orders/${orderId}/complete`);
const lineOf = async (orderId, name) =>
  (
    await q1(
      `SELECT OrderItemId, Quantity, CogsAmount FROM dbo.OrderItems WHERE OrderId = ${orderId} AND ParentOrderItemId IS NULL AND MenuItemId = ${ids[name]}`,
    )
  )[0];
const orderRow = async (orderId) =>
  (await q1(`SELECT Status, PaymentStatus, TotalAmount, SubtotalAmount, OrderPromotionId, CancelReason FROM dbo.Orders WHERE OrderId = ${orderId}`))[0];
const voidsOf = (orderId) => q1(`SELECT * FROM dbo.OrderItemVoids WHERE OrderId = ${orderId} ORDER BY VoidId`);
const txns = (orderId, type) =>
  q1(`SELECT IngredientId, SUM(Delta) AS Delta, SUM(CostAmount) AS Cost, MAX(VoidId) AS VoidId FROM dbo.InventoryTransactions
      WHERE OrderId = ${orderId} AND Type = '${type}' GROUP BY IngredientId`);
const byIngredient = (rows, key = 'Delta') => Object.fromEntries(rows.map((r) => [Object.keys(ing).find((n) => ing[n] === r.IngredientId), Number(r[key])]));

/** Khách quét QR bàn và gửi đơn (PENDING). */
async function guestOrder(table, items) {
  const C = await app.customer();
  const s = await app.seat(C, table);
  const o = await C.post('/api/orders', { sessionId: s, items });
  assert.equal(o.status, 201, JSON.stringify(o.body));
  return { C, s, order: o.body };
}

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  ({ flushAudit } = await import('../src/middleware/audit.js'));
  admin = await app.login('admin', 'Admin@123');
  ids = await app.ids();
  ing = Object.fromEntries((await q1('SELECT IngredientId, Name FROM dbo.Ingredients WHERE DeletedAt IS NULL')).map((x) => [x.Name, x.IngredientId]));
  const u = await call(admin, 'post', '/api/admin/users', { username: 'lead1', password: 'Pass@123', fullName: 'Trưởng ca 1', role: 'MANAGER' });
  assert.equal(u.status, 201, JSON.stringify(u.body));
  users = Object.fromEntries((await q1('SELECT UserId, Username FROM dbo.Users')).map((x) => [x.Username, x.UserId]));
  staff = await app.login('staff1', 'Staff@123');
  lead = await app.login('lead1', 'Pass@123');
  assert.equal((await call(staff, 'post', '/api/shifts/open', { openingCash: 0 })).status, 201);
  // Giá vốn biết trước: cốt 100đ/ml, đường 50đ/g, sữa đặc 80đ/ml, sữa tươi 40đ/ml (tồn cũ coi như cùng giá lần nhập đầu)
  const rc = await call(admin, 'post', '/api/admin/stock-receipts', {
    lines: [
      { ingredientId: ing['Cà phê cốt'], qty: 1000, unitCost: 100 },
      { ingredientId: ing['Đường'], qty: 1000, unitCost: 50 },
      { ingredientId: ing['Sữa đặc'], qty: 1000, unitCost: 80 },
      { ingredientId: ing['Sữa tươi'], qty: 1000, unitCost: 40 },
    ],
  });
  assert.equal(rc.status, 201, JSON.stringify(rc.body));
  staffSock = await app.connect({ auth: { token: staff } });
});

after(() => app.close());

describe('Sửa / xóa món đã gọi (F-046)', () => {
  test('AC-046-01: nhân viên giảm "Cà phê đen" 2 → 1 ở đơn chờ tiếp nhận → tổng giảm 25.000đ, kho giữ giảm 1 ly, có lịch sử; SL 0 = xóa dòng', async () => {
    const { C, s, order } = await guestOrder('01', [
      { menuItemId: ids['Cà phê đen'], quantity: 2 },
      { menuItemId: ids['Nước suối'], quantity: 1 },
    ]);
    assert.deepEqual([order.status, order.totalAmount], ['PENDING', 60000]);
    const before = { cot: await stockOf('Cà phê cốt'), duong: await stockOf('Đường') };
    const den = await lineOf(order.orderId, 'Cà phê đen');

    const changed = app.waitFor(staffSock, 'order.status_changed', (p) => p.orderId === order.orderId);
    const r = await voidLine(den.OrderItemId, { quantity: 1, reason: 'Khách đổi ý' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.order.totalAmount, r.body.cancelled, r.body.sessionClosed], [35000, false, false]);
    assert.equal((await changed).order.totalAmount, 35000, 'quầy / khách nhận tổng mới realtime');
    const after = { cot: await stockOf('Cà phê cốt'), duong: await stockOf('Đường') };
    assert.equal(before.cot.reserved - after.cot.reserved, 25);
    assert.equal(before.duong.reserved - after.duong.reserved, 10);
    assert.equal(after.cot.stock, before.cot.stock, 'đơn chưa pha: không đụng tồn');
    const [v] = await voidsOf(order.orderId);
    assert.deepEqual(
      [v.Qty, Number(v.Amount), v.OrderStatus, v.StockMode, v.ApprovedBy, v.CreatedBy, v.Reason],
      [1, 25000, 'PENDING', 'RELEASE', null, users.staff1, 'Khách đổi ý'],
    );

    // Số mới không nhỏ hơn số đang có → 400 (thêm món dùng "Gọi thêm món")
    const same = await voidLine(den.OrderItemId, { quantity: 1, reason: 'x' });
    assert.deepEqual([same.status, same.body.code], [400, 'INVALID_QTY']);
    // SL 0 → xóa hẳn dòng; lịch sử vẫn còn tên món
    const ns = await lineOf(order.orderId, 'Nước suối');
    const del = await voidLine(ns.OrderItemId, { quantity: 0, reason: 'Gọi nhầm' });
    assert.equal(del.status, 200, JSON.stringify(del.body));
    assert.equal(del.body.order.totalAmount, 25000);
    assert.deepEqual(
      del.body.order.items.map((i) => [i.name, i.quantity]),
      [['Cà phê đen', 1]],
    );
    assert.equal(await lineOf(order.orderId, 'Nước suối'), undefined);
    const hist = (await call(staff, 'get', `/api/sessions/${s}/voids`)).body;
    assert.deepEqual(
      hist.map((h) => [h.itemName, h.qty, h.amount, h.createdBy, h.approvedBy]),
      [
        ['Nước suối', 1, 10000, 'Nhân viên quầy 1', null],
        ['Cà phê đen', 1, 25000, 'Nhân viên quầy 1', null],
      ],
    );
    // Dòng không tồn tại → 404; khách (không đăng nhập quầy) → 401
    assert.equal((await voidLine(999999, { quantity: 0, reason: 'x' })).status, 404);
    assert.equal((await C.post(`/api/order-items/${den.OrderItemId}/void`, { quantity: 0, reason: 'x' })).status, 401);
  });

  test('AC-046-02: món đơn "Đang chuẩn bị": nhân viên không có người duyệt → 403; sai / không đủ quyền → 403; thiếu lý do → 400; kèm tài khoản trưởng ca → OK', async () => {
    const { order } = await guestOrder('02', [
      { menuItemId: ids['Cà phê sữa'], quantity: 2 },
      { menuItemId: ids['Cà phê đen'], quantity: 1 },
    ]);
    assert.equal((await accept(order.orderId)).status, 200);
    const sua = await lineOf(order.orderId, 'Cà phê sữa');
    const body = { quantity: 1, reason: 'Khách đổi ý' };

    const no = await voidLine(sua.OrderItemId, body);
    assert.deepEqual([no.status, no.body.code], [403, 'ADMIN_APPROVAL_REQUIRED']);
    const wrong = await voidLine(sua.OrderItemId, { ...body, adminUsername: 'lead1', adminPassword: 'sai-mat-khau' });
    assert.deepEqual([wrong.status, wrong.body.code], [403, 'ADMIN_APPROVAL_INVALID']);
    const peer = await voidLine(sua.OrderItemId, { ...body, adminUsername: 'staff1', adminPassword: 'Staff@123' });
    assert.deepEqual([peer.status, peer.body.code], [403, 'ADMIN_APPROVAL_INVALID'], 'nhân viên không duyệt được cho nhau');
    assert.equal((await voidLine(sua.OrderItemId, { quantity: 1, reason: '   ', ...LEAD })).status, 400);
    assert.equal((await voidLine(sua.OrderItemId, { quantity: 1, ...LEAD })).status, 400);
    assert.equal((await voidsOf(order.orderId)).length, 0, 'lượt bị từ chối không ghi gì');

    const before = await stockOf('Sữa đặc');
    const ok = await voidLine(sua.OrderItemId, { ...body, ...LEAD });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.order.totalAmount, 29000 + 25000);
    assert.equal(before.reserved - (await stockOf('Sữa đặc')).reserved, 20);
    const [v] = await voidsOf(order.orderId);
    assert.deepEqual([v.OrderStatus, v.StockMode, v.ApprovedBy, v.CreatedBy], ['PREPARING', 'RELEASE', users.lead1, users.staff1]);

    // Trưởng ca tự làm không cần nhập tài khoản
    const den = await lineOf(order.orderId, 'Cà phê đen');
    const own = await voidLine(den.OrderItemId, { quantity: 0, reason: 'Hết đá' }, lead);
    assert.equal(own.status, 200, JSON.stringify(own.body));
    const v2 = (await voidsOf(order.orderId))[1];
    assert.deepEqual([v2.ApprovedBy, v2.CreatedBy], [users.lead1, users.lead1]);
  });

  test('AC-046-03: món đã pha — "Hoàn kho" cộng lại đúng lượng đã trừ, giá vốn dòng giảm; "Ghi hủy hàng" (mặc định) tồn không đổi, có dòng hủy hàng; hoàn tiền sau đó không hoàn lại phần đã xử lý', async () => {
    const { s, order } = await guestOrder('03', [
      { menuItemId: ids['Cà phê đen'], quantity: 3 },
      { menuItemId: ids['Cà phê sữa'], quantity: 2 },
    ]);
    assert.equal((await accept(order.orderId)).status, 200);
    assert.equal((await complete(order.orderId)).status, 200);
    // Giá vốn chốt lúc hoàn tất: đen 25 × 100 + 10 × 50 = 3.000/ly; sữa 25 × 100 + 20 × 80 = 4.100/ly
    assert.equal(Number((await lineOf(order.orderId, 'Cà phê đen')).CogsAmount), 9000);
    assert.equal(Number((await lineOf(order.orderId, 'Cà phê sữa')).CogsAmount), 8200);
    const den = await lineOf(order.orderId, 'Cà phê đen');
    const sua = await lineOf(order.orderId, 'Cà phê sữa');
    assert.equal((await voidLine(den.OrderItemId, { quantity: 2, reason: 'Pha nhầm', stockMode: 'RESTOCK' })).status, 403);

    // Hoàn kho 1 ly đen
    const b1 = { cot: await stockOf('Cà phê cốt'), duong: await stockOf('Đường') };
    const restock = await voidLine(den.OrderItemId, { quantity: 2, reason: 'Pha nhầm, chưa đưa khách', stockMode: 'RESTOCK' }, lead);
    assert.equal(restock.status, 200, JSON.stringify(restock.body));
    assert.equal(restock.body.order.status, 'COMPLETED');
    assert.equal(restock.body.order.totalAmount, 2 * 25000 + 2 * 29000);
    assert.equal((await stockOf('Cà phê cốt')).stock - b1.cot.stock, 25);
    assert.equal((await stockOf('Đường')).stock - b1.duong.stock, 10);
    const [vr] = await voidsOf(order.orderId);
    assert.deepEqual([vr.StockMode, vr.OrderStatus, Number(vr.CogsReduction)], ['RESTOCK', 'COMPLETED', 3000]);
    const back = await txns(order.orderId, 'VOID_BACK');
    assert.deepEqual(byIngredient(back), { 'Cà phê cốt': 25, Đường: 10 });
    assert.deepEqual(byIngredient(back, 'Cost'), { 'Cà phê cốt': 2500, Đường: 500 });
    assert.ok(back.every((t) => t.VoidId === vr.VoidId));
    assert.equal(Number((await lineOf(order.orderId, 'Cà phê đen')).CogsAmount), 6000);

    // Ghi hủy 1 ly sữa (mặc định WASTE): tồn không đổi, có dòng hủy hàng gắn lần xóa
    const b2 = { cot: await stockOf('Cà phê cốt'), suaDac: await stockOf('Sữa đặc') };
    const waste = await voidLine(sua.OrderItemId, { quantity: 1, reason: 'Khách chê ngọt', ...LEAD });
    assert.equal(waste.status, 200, JSON.stringify(waste.body));
    assert.equal(waste.body.order.totalAmount, 2 * 25000 + 29000);
    assert.deepEqual([(await stockOf('Cà phê cốt')).stock, (await stockOf('Sữa đặc')).stock], [b2.cot.stock, b2.suaDac.stock]);
    const vw = (await voidsOf(order.orderId))[1];
    assert.deepEqual([vw.StockMode, Number(vw.CogsReduction), vw.ApprovedBy], ['WASTE', 4100, users.lead1]);
    const wl = await q1(`SELECT IngredientId, Qty, Reason, CostAmount, Note FROM dbo.WasteLogs WHERE VoidId = ${vw.VoidId}`);
    assert.deepEqual(byIngredient(wl, 'Qty'), { 'Cà phê cốt': 25, 'Sữa đặc': 20 });
    assert.ok(wl.every((w) => w.Reason === 'OTHER' && w.Note.includes('Khách chê ngọt')));
    assert.equal(Number((await lineOf(order.orderId, 'Cà phê sữa')).CogsAmount), 4100);

    // Thu tiền phần còn lại rồi hoàn tiền + hoàn kho: chỉ hoàn phần 2 đen + 1 sữa còn trong đơn
    const pay = await call(staff, 'post', `/api/sessions/${s}/settle`, { amountReceived: 79000 });
    assert.equal(pay.status, 200, JSON.stringify(pay.body));
    assert.equal(pay.body.payment.amountDue, 79000);
    const rf = await call(admin, 'post', `/api/payments/${pay.body.payment.paymentId}/refunds`, {
      amount: 79000,
      reason: 'Khách không hài lòng',
      restockInventory: true,
    });
    assert.equal(rf.status, 201, JSON.stringify(rf.body));
    assert.deepEqual(byIngredient(await txns(order.orderId, 'RESTOCK')), { 'Cà phê cốt': 75, Đường: 20, 'Sữa đặc': 20 });
  });

  test('Xóa đơn đã pha + hoàn kho, nguyên liệu theo lô → đơn CANCELLED giữ dòng làm lịch sử, giá vốn về 0, lô RESTOCK mới (Σ lô = tồn)', async () => {
    const adv = await call(admin, 'put', `/api/admin/ingredients/${ing['Sữa tươi']}/advanced`, { kind: 'RAW', wastePercent: 0, trackLots: true });
    assert.equal(adv.body.trackLots, true, JSON.stringify(adv.body));
    const { s, order } = await guestOrder('04', [{ menuItemId: ids['Latte'], quantity: 2 }]);
    await accept(order.orderId);
    await complete(order.orderId);
    const b = { cot: await stockOf('Cà phê cốt'), tuoi: await stockOf('Sữa tươi') };

    const cancelled = app.waitFor(staffSock, 'order.cancelled', (p) => p.orderId === order.orderId);
    assert.deepEqual((await voidOrder(order.orderId, { reason: 'Khách bỏ về', stockMode: 'RESTOCK' })).body.code, 'ADMIN_APPROVAL_REQUIRED');
    const r = await voidOrder(order.orderId, { reason: 'Khách bỏ về', stockMode: 'RESTOCK', ...LEAD });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.order.status, 'CANCELLED');
    assert.equal((await cancelled).reason, 'Khách bỏ về');
    const row = await orderRow(order.orderId);
    assert.deepEqual([row.Status, row.CancelReason], ['CANCELLED', 'Khách bỏ về']);
    const line = await lineOf(order.orderId, 'Latte');
    assert.deepEqual([line.Quantity, Number(line.CogsAmount)], [2, 0], 'giữ dòng, giá vốn đã chuyển sang CogsReduction');
    assert.equal((await stockOf('Cà phê cốt')).stock - b.cot.stock, 60);
    assert.equal((await stockOf('Sữa tươi')).stock - b.tuoi.stock, 300);
    const lot = await q1(`SELECT Qty, Source, SourceId FROM dbo.IngredientLots WHERE IngredientId = ${ing['Sữa tươi']} AND Source = 'RESTOCK'`);
    assert.deepEqual(
      lot.map((l) => [Number(l.Qty), l.SourceId]),
      [[300, order.orderId]],
    );
    // Phiên chỉ còn đơn hủy → đóng bàn trống được (Q-018)
    assert.equal((await call(staff, 'post', `/api/sessions/${s}/close`)).status, 200);
  });

  test('AC-046-04: khuyến mãi đơn tính lại theo số mới, bỏ khi dưới tối thiểu; xóa hết món → đơn CANCELLED', async () => {
    const promo = await call(admin, 'post', '/api/admin/promotions', {
      name: 'Giảm 10% đơn từ 50k',
      type: 'ORDER_PERCENT',
      value: 10,
      minOrderAmount: 50000,
      startDate: todayVn(),
      endDate: '2026-12-31',
      stackWithMember: true,
      isActive: true,
    });
    assert.equal(promo.status, 201, JSON.stringify(promo.body));
    try {
      const { s, order } = await guestOrder('05', [
        { menuItemId: ids['Latte'], quantity: 2 },
        { menuItemId: ids['Cà phê đen'], quantity: 1 },
      ]);
      assert.equal(order.totalAmount, 103000 - 10300);
      const usage = async () =>
        (await q1(`SELECT DiscountAmount FROM dbo.PromotionUsages WHERE OrderId = ${order.orderId} AND OrderItemId IS NULL`)).map((x) =>
          Number(x.DiscountAmount),
        );

      const r1 = await voidLine((await lineOf(order.orderId, 'Cà phê đen')).OrderItemId, { quantity: 0, reason: 'Khách đổi ý' });
      assert.equal(r1.body.order.totalAmount, 78000 - 7800, 'vẫn ≥ 50k → 10% của số mới');
      assert.deepEqual(await usage(), [7800]);
      const latte = await lineOf(order.orderId, 'Latte');
      const r2 = await voidLine(latte.OrderItemId, { quantity: 1, reason: 'Khách đổi ý' });
      assert.equal(r2.body.order.totalAmount, 39000, 'dưới 50k → bỏ khuyến mãi đơn');
      assert.deepEqual(await usage(), []);
      assert.equal((await orderRow(order.orderId)).OrderPromotionId, null);

      const cancelled = app.waitFor(staffSock, 'order.cancelled', (p) => p.orderId === order.orderId);
      const r3 = await voidLine(latte.OrderItemId, { quantity: 0, reason: 'Khách bỏ về' });
      assert.equal(r3.status, 200, JSON.stringify(r3.body));
      assert.deepEqual([r3.body.cancelled, r3.body.order.status, r3.body.order.totalAmount], [true, 'CANCELLED', 0]);
      await cancelled;
      assert.equal((await q1(`SELECT COUNT(*) AS n FROM dbo.OrderIngredients WHERE OrderId = ${order.orderId}`))[0].n, 0, 'trả hết phần giữ');
      assert.equal((await call(staff, 'post', `/api/sessions/${s}/close`)).status, 200);
    } finally {
      assert.equal((await call(admin, 'delete', `/api/admin/promotions/${promo.body.promotionId}`)).status, 200);
    }
  });
});

describe('Combo & tùy chọn (F-046)', () => {
  test('giảm combo 2 → 1: dòng con giảm theo, trả kho thành phần; xóa món có tùy chọn: trả cả BOM tùy chọn; combo đã pha + hoàn kho → đơn CANCELLED', async () => {
    const combo = await call(admin, 'post', '/api/admin/combos', {
      name: 'Combo sáng',
      price: 45000,
      components: [
        { menuItemId: ids['Cà phê đen'], quantity: 1 },
        { menuItemId: ids['Bánh croissant'], quantity: 1 },
      ],
    });
    assert.equal(combo.status, 201, JSON.stringify(combo.body));
    const g = await call(admin, 'post', '/api/admin/modifier-groups', {
      name: 'Thêm shot',
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: 'Thêm shot', priceDelta: 5000, bom: [{ ingredientId: ing['Cà phê cốt'], amount: 20 }] }],
    });
    assert.equal(g.status, 201, JSON.stringify(g.body));
    const shot = g.body.options[0].optionId;
    const item = (await call(admin, 'get', '/api/admin/menu-items')).body.find((i) => i.name === 'Sữa tươi đường');
    const put = await call(admin, 'put', `/api/admin/menu-items/${item.menuItemId}`, {
      categoryId: item.categoryId,
      name: item.name,
      price: item.price,
      imageUrl: '',
      isAvailable: true,
      isActive: true,
      groupIds: [g.body.groupId],
    });
    assert.equal(put.status, 200, JSON.stringify(put.body));

    const { order } = await guestOrder('04', [
      { menuItemId: combo.body.menuItemId, quantity: 2 },
      { menuItemId: ids['Sữa tươi đường'], quantity: 2, optionIds: [shot] },
    ]);
    assert.equal(order.totalAmount, 2 * 45000 + 2 * 30000);
    await accept(order.orderId);
    const comboLine = (await q1(`SELECT OrderItemId FROM dbo.OrderItems WHERE OrderId = ${order.orderId} AND MenuItemId = ${combo.body.menuItemId}`))[0];
    const children = async () =>
      (await q1(`SELECT MenuItemId, Quantity FROM dbo.OrderItems WHERE ParentOrderItemId = ${comboLine.OrderItemId} ORDER BY MenuItemId`)).map(
        (c) => c.Quantity,
      );

    const b1 = { cot: await stockOf('Cà phê cốt'), duong: await stockOf('Đường') };
    const r1 = await voidLine(comboLine.OrderItemId, { quantity: 1, reason: 'Khách đổi ý' }, lead);
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.equal(r1.body.order.totalAmount, 45000 + 2 * 30000);
    assert.deepEqual(await children(), [1, 1]);
    assert.equal(b1.cot.reserved - (await stockOf('Cà phê cốt')).reserved, 25);
    assert.equal(b1.duong.reserved - (await stockOf('Đường')).reserved, 10);

    const b2 = { cot: await stockOf('Cà phê cốt'), tuoi: await stockOf('Sữa tươi') };
    const st = await lineOf(order.orderId, 'Sữa tươi đường');
    const r2 = await voidLine(st.OrderItemId, { quantity: 0, reason: 'Hết sữa' }, lead);
    assert.equal(r2.status, 200, JSON.stringify(r2.body));
    assert.equal(r2.body.order.totalAmount, 45000);
    assert.equal(b2.cot.reserved - (await stockOf('Cà phê cốt')).reserved, 2 * 20, 'trả cả định lượng tùy chọn');
    assert.equal(b2.tuoi.reserved - (await stockOf('Sữa tươi')).reserved, 400);
    assert.equal((await q1(`SELECT COUNT(*) AS n FROM dbo.OrderItemModifiers WHERE OrderItemId = ${st.OrderItemId}`))[0].n, 0);

    const done = await complete(order.orderId);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.deepEqual(byIngredient(await txns(order.orderId, 'DEDUCT')), { 'Cà phê cốt': -25, Đường: -10 }, 'chỉ trừ phần còn lại');
    const r3 = await voidLine(comboLine.OrderItemId, { quantity: 0, reason: 'Khách bỏ về', stockMode: 'RESTOCK' }, lead);
    assert.equal(r3.status, 200, JSON.stringify(r3.body));
    assert.deepEqual([r3.body.cancelled, r3.body.order.status], [true, 'CANCELLED']);
    assert.deepEqual(byIngredient(await txns(order.orderId, 'VOID_BACK')), { 'Cà phê cốt': 25, Đường: 10 });
    assert.equal((await q1(`SELECT COUNT(*) AS n FROM dbo.OrderItems WHERE OrderId = ${order.orderId}`))[0].n, 0);
  });
});

describe('Hủy lượt phục vụ bàn (F-046, D-35)', () => {
  test('AC-046-05: hủy bàn → mọi đơn chưa thu CANCELLED, trả hết kho giữ, phiên đóng, bàn trống; cần duyệt khi có đơn đã tiếp nhận', async () => {
    const b = { cot: await stockOf('Cà phê cốt'), suaDac: await stockOf('Sữa đặc'), duong: await stockOf('Đường') };
    const { C, s, order: a } = await guestOrder('06', [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    const staffOrder = await call(staff, 'post', `/api/sessions/${s}/orders`, { items: [{ menuItemId: ids['Cà phê sữa'], quantity: 2 }] });
    assert.equal(staffOrder.status, 201, JSON.stringify(staffOrder.body));
    const bOrder = staffOrder.body.order;
    assert.equal(bOrder.status, 'PREPARING');

    const no = await cancelTable(s, { reason: 'Khách bỏ về' });
    assert.deepEqual([no.status, no.body.code], [403, 'ADMIN_APPROVAL_REQUIRED']);
    assert.equal((await cancelTable(s, { ...LEAD })).status, 400);

    const closed = app.waitFor(staffSock, 'session.closed', (p) => p.sessionId === s);
    const r = await cancelTable(s, { reason: 'Khách bỏ về', ...LEAD });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.session.status, r.body.cancelledOrders], ['CLOSED', 2]);
    const ev = await closed;
    assert.deepEqual([ev.cancelled, ev.reason], [true, 'Khách bỏ về']);
    for (const id of [a.orderId, bOrder.orderId]) assert.deepEqual(Object.values(await orderRow(id)).slice(0, 2), ['CANCELLED', 'UNPAID']);
    const [sess] = await q1(`SELECT Status, CancelledBy, CancelReason FROM dbo.Sessions WHERE SessionId = '${s}'`);
    assert.deepEqual([sess.Status, sess.CancelledBy, sess.CancelReason], ['CLOSED', users.staff1, 'Khách bỏ về']);
    const a2 = { cot: await stockOf('Cà phê cốt'), suaDac: await stockOf('Sữa đặc'), duong: await stockOf('Đường') };
    assert.deepEqual([a2.cot.reserved, a2.suaDac.reserved, a2.duong.reserved], [b.cot.reserved, b.suaDac.reserved, b.duong.reserved], 'trả hết phần đang giữ');
    const voids = await q1(`SELECT ItemName, Qty, StockMode, OrderStatus FROM dbo.OrderItemVoids WHERE SessionId = '${s}' ORDER BY VoidId`);
    assert.deepEqual(
      voids.map((v) => [v.ItemName, v.Qty, v.StockMode, v.OrderStatus]),
      [
        ['Cà phê đen', 1, 'RELEASE', 'PENDING'],
        ['Cà phê sữa', 2, 'RELEASE', 'PREPARING'],
      ],
    );
    const t06 = (await call(staff, 'get', '/api/tables')).body.find((t) => t.code === '06');
    assert.equal(t06.sessions.length, 0, 'bàn trống lại');
    const late = await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] });
    assert.equal(late.status, 409);
    assert.equal((await cancelTable(s, { reason: 'lần 2', ...LEAD })).body.code, 'SESSION_CLOSED');
  });

  test('AC-046-06: món đã thu (chia bill) / đơn mang đi → 409; phiên đã thu một phần → không hủy bàn được; bỏ nốt món chưa thu → phiên đóng như lượt thu cuối', async () => {
    // Mang đi: đã thu ngay → dùng hoàn tiền
    const tk = await call(staff, 'post', '/api/orders/takeaway', { items: [{ menuItemId: ids['Nước suối'], quantity: 2 }], amountReceived: 20000 });
    assert.equal(tk.status, 201, JSON.stringify(tk.body));
    const tkLine = await lineOf(tk.body.order.orderId, 'Nước suối');
    assert.equal((await voidLine(tkLine.OrderItemId, { quantity: 1, reason: 'x', ...LEAD })).body.code, 'ITEM_NOT_EDITABLE');
    assert.equal((await voidOrder(tk.body.order.orderId, { reason: 'x', ...LEAD })).body.code, 'ITEM_NOT_EDITABLE');

    // Chia bill: phần A (Cà phê đen) đã thu, phần B (croissant) + Chung (nước suối) chưa thu
    const { s, order } = await guestOrder('01', [
      { menuItemId: ids['Cà phê đen'], quantity: 1 },
      { menuItemId: ids['Bánh croissant'], quantity: 1 },
      { menuItemId: ids['Nước suối'], quantity: 1 },
    ]);
    await accept(order.orderId);
    const splitA = (await call(staff, 'post', `/api/sessions/${s}/splits`, { label: 'Anh A' })).body.splitId;
    const splitB = (await call(staff, 'post', `/api/sessions/${s}/splits`, { label: 'Chị B' })).body.splitId;
    const den = await lineOf(order.orderId, 'Cà phê đen');
    const banh = await lineOf(order.orderId, 'Bánh croissant');
    const nuoc = await lineOf(order.orderId, 'Nước suối');
    assert.equal((await call(staff, 'put', `/api/sessions/${s}/items/${den.OrderItemId}/split`, { splitId: splitA })).status, 200);
    assert.equal((await call(staff, 'put', `/api/sessions/${s}/items/${banh.OrderItemId}/split`, { splitId: splitB })).status, 200);
    const paidA = await call(staff, 'post', `/api/splits/${splitA}/settle`, { amountReceived: 25000 });
    assert.equal(paidA.status, 200, JSON.stringify(paidA.body));
    assert.equal(paidA.body.sessionClosed, false);

    assert.equal((await voidLine(den.OrderItemId, { quantity: 0, reason: 'x', ...LEAD })).body.code, 'ITEM_NOT_EDITABLE');
    assert.equal((await voidOrder(order.orderId, { reason: 'x', ...LEAD })).body.code, 'ITEM_NOT_EDITABLE');
    const has = await cancelTable(s, { reason: 'x', ...LEAD });
    assert.deepEqual([has.status, has.body.code], [409, 'SESSION_HAS_PAYMENTS']);

    const r1 = await voidLine(banh.OrderItemId, { quantity: 0, reason: 'Hết bánh', ...LEAD });
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.equal(r1.body.sessionClosed, false);
    const closed = app.waitFor(staffSock, 'session.closed', (p) => p.sessionId === s);
    const r2 = await voidLine(nuoc.OrderItemId, { quantity: 0, reason: 'Khách không lấy', ...LEAD });
    assert.equal(r2.status, 200, JSON.stringify(r2.body));
    assert.equal(r2.body.sessionClosed, true, 'chỉ còn dòng đã thu → đơn PAID, phiên đóng');
    await closed;
    const row = await orderRow(order.orderId);
    assert.deepEqual([row.Status, row.PaymentStatus, Number(row.TotalAmount)], ['PREPARING', 'PAID', 25000]);
    assert.equal((await q1(`SELECT Status FROM dbo.Sessions WHERE SessionId = '${s}'`))[0].Status, 'CLOSED');
  });
});

describe('Đồng thời & nhật ký (F-046)', () => {
  test('nhân viên xóa món đua với tiếp nhận đơn (lặp 6 lần) → hoặc xóa trước khi tiếp nhận (không cần duyệt), hoặc 403 cần duyệt — không lệch kho', async () => {
    const outcomes = new Set();
    for (let i = 0; i < 6; i++) {
      const { order } = await guestOrder('02', [
        { menuItemId: ids['Cà phê đen'], quantity: 1 },
        { menuItemId: ids['Cà phê sữa'], quantity: 1 },
      ]);
      const sua = await lineOf(order.orderId, 'Cà phê sữa');
      const [v, a] = await Promise.all([voidLine(sua.OrderItemId, { quantity: 0, reason: 'Đua' }), accept(order.orderId)]);
      assert.equal(a.status, 200, JSON.stringify(a.body));
      const rows = await voidsOf(order.orderId);
      if (v.status === 200) {
        assert.deepEqual([rows.length, rows[0].OrderStatus, rows[0].ApprovedBy], [1, 'PENDING', null]);
        outcomes.add('void');
      } else {
        assert.deepEqual([v.status, v.body.code, rows.length], [403, 'ADMIN_APPROVAL_REQUIRED', 0]);
        outcomes.add('accept');
      }
    }
    assert.ok(outcomes.size >= 1);
  });

  test('hai máy cùng xóa một dòng → 1 thành công, 1 lỗi (không ghi 2 lần)', async () => {
    const { order } = await guestOrder('03', [
      { menuItemId: ids['Cà phê đen'], quantity: 1 },
      { menuItemId: ids['Nước suối'], quantity: 1 },
    ]);
    const den = await lineOf(order.orderId, 'Cà phê đen');
    const res = await Promise.all([0, 1].map(() => voidLine(den.OrderItemId, { quantity: 0, reason: 'Trùng' })));
    const codes = res.map((r) => r.status).sort();
    assert.equal(codes[0], 200, JSON.stringify(res.map((r) => r.body)));
    assert.ok([400, 404].includes(codes[1]), `lượt sau: ${codes[1]}`);
    assert.equal((await voidsOf(order.orderId)).length, 1);
  });

  test('nhật ký thao tác: xóa món / xóa đơn / hủy bàn đều có dòng, không lưu mật khẩu người duyệt', async () => {
    await flushAudit();
    const rows = await q1(
      "SELECT Action, Entity, EntityId, UserId, AfterJson FROM dbo.AuditLogs WHERE Action IN ('order.item-void', 'order.void', 'session.cancel')",
    );
    const by = (a) => rows.filter((r) => r.Action === a);
    assert.ok(by('order.item-void').length >= 10);
    assert.equal(by('order.void').length, 1);
    assert.equal(by('session.cancel').length, 1);
    assert.equal(by('session.cancel')[0].Entity, 'Session');
    assert.ok(by('order.item-void').every((r) => r.Entity === 'OrderItem' && r.EntityId));
    assert.ok(
      rows.every((r) => !r.AfterJson.includes('Pass@123')),
      'không lưu mật khẩu',
    );
    assert.ok(by('order.void')[0].AfterJson.includes('Khách bỏ về'));
  });

  test('xóa tài khoản chỉ có lịch sử sửa / xóa món (người làm / người duyệt) → xóa mềm, không lỗi khóa ngoại', async () => {
    for (const [username, role] of [
      ['lead9', 'MANAGER'],
      ['staff9', 'STAFF'],
    ]) {
      const r = await call(admin, 'post', '/api/admin/users', { username, password: 'Pass@123', fullName: `TK ${username}`, role });
      assert.equal(r.status, 201, JSON.stringify(r.body));
    }
    const staff9 = await app.login('staff9', 'Pass@123');
    const { order } = await guestOrder('05', [
      { menuItemId: ids['Cà phê đen'], quantity: 2 },
      { menuItemId: ids['Nước suối'], quantity: 1 },
    ]);
    // staff9 bỏ món đơn chờ (chỉ ghi OrderItemVoids.CreatedBy); staff1 nhờ lead9 duyệt món đơn đã tiếp nhận (chỉ ghi ApprovedBy)
    assert.equal((await voidLine((await lineOf(order.orderId, 'Nước suối')).OrderItemId, { quantity: 0, reason: 'Gọi nhầm' }, staff9)).status, 200);
    await accept(order.orderId);
    const den = await lineOf(order.orderId, 'Cà phê đen');
    const ok = await voidLine(den.OrderItemId, { quantity: 1, reason: 'Khách đổi ý', adminUsername: 'lead9', adminPassword: 'Pass@123' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const ids9 = Object.fromEntries(
      (await q1("SELECT UserId, Username FROM dbo.Users WHERE Username IN ('lead9', 'staff9')")).map((x) => [x.Username, x.UserId]),
    );
    for (const name of ['lead9', 'staff9']) {
      const del = await call(admin, 'delete', `/api/admin/users/${ids9[name]}`);
      assert.equal(del.status, 200, JSON.stringify(del.body));
      assert.equal(del.body.result, 'ARCHIVED', name);
    }
  });
});
