// Integration test (SQL Server thật) — kiểm chứng bổ sung cho các AC mà ma trận truy vết phát hiện chưa có test / mới kiểm một phần
// (quy trình 15 bước, bước 14 — TASK-057). Mỗi test ghi đúng AC nó chứng minh; ma trận: tài-liệu/chất-lượng/tc-map.md.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, sleep, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, ing, staffSock;
const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const menuItem = async (name) => (await api.get('/api/menu')).body.categories.flatMap((c) => c.items).find((i) => i.name === name);
const lineIds = async (orderId) =>
  Object.fromEntries(
    (
      await q1(`SELECT oi.OrderItemId, m.Name FROM dbo.OrderItems oi JOIN dbo.MenuItems m ON m.MenuItemId = oi.MenuItemId
                WHERE oi.OrderId = ${orderId} AND oi.ParentOrderItemId IS NULL`)
    ).map((x) => [x.Name, x.OrderItemId]),
  );
async function guestOrder(table, items) {
  const C = await app.customer();
  const s = await app.seat(C, table);
  const o = await C.post('/api/orders', { sessionId: s, items });
  assert.equal(o.status, 201, JSON.stringify(o.body));
  return { C, s, order: o.body };
}
async function takeaway(items) {
  const r = await call(staff, 'post', '/api/orders/takeaway', { items, amountReceived: 5_000_000 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.order;
}

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  ing = Object.fromEntries((await q1('SELECT IngredientId, Name FROM dbo.Ingredients WHERE DeletedAt IS NULL')).map((x) => [x.Name, x.IngredientId]));
  assert.equal((await call(staff, 'post', '/api/shifts/open', { openingCash: 0 })).status, 201);
  staffSock = await app.connect({ auth: { token: staff } });
});

after(() => app.close());

describe('Kiểm chứng bổ sung các AC còn thiếu (TASK-057)', () => {
  test('AC-005-03: phiên đã thu tiền (CLOSED) → khách bấm Gọi thanh toán bị 409 SESSION_CLOSED, quầy không nhận sự kiện, phiên vẫn CLOSED', async () => {
    const { C, s, order } = await guestOrder('01', [{ menuItemId: ids['Nước suối'], quantity: 1 }]);
    assert.equal((await call(staff, 'post', `/api/orders/${order.orderId}/accept`)).status, 200);
    assert.equal((await call(staff, 'post', `/api/sessions/${s}/settle`, { amountReceived: 10000 })).status, 200);
    let announced = false;
    const onRequest = (p) => {
      if (p.sessionId === s) announced = true;
    };
    staffSock.on('session.payment_requested', onRequest);
    const r = await C.post(`/api/sessions/${s}/request-payment`, {});
    assert.deepEqual([r.status, r.body.code], [409, 'SESSION_CLOSED'], JSON.stringify(r.body));
    await sleep(400);
    staffSock.off('session.payment_requested', onRequest);
    assert.equal(announced, false, 'không phát session.payment_requested');
    assert.equal((await q1(`SELECT Status FROM dbo.Sessions WHERE SessionId = '${s}'`))[0].Status, 'CLOSED');
  });

  test('AC-008-03: bán mang đi khi kho không đủ → 409 OUT_OF_STOCK, không tạo đơn, không có Payments, kho giữ không đổi', async () => {
    const [{ n: orders0 }] = await q1("SELECT COUNT(*) AS n FROM dbo.Orders WHERE Type = 'TAKE_AWAY'");
    const [{ n: pays0 }] = await q1('SELECT COUNT(*) AS n FROM dbo.Payments');
    const [peach0] = await q1(`SELECT StockQty, ReservedQty FROM dbo.Ingredients WHERE IngredientId = ${ing['Đào ngâm']}`);
    // Trà đào cần 2 miếng đào / ly; tồn 80 → 41 ly cần 82
    const r = await call(staff, 'post', '/api/orders/takeaway', { items: [{ menuItemId: ids['Trà đào'], quantity: 41 }], amountReceived: 5_000_000 });
    assert.deepEqual([r.status, r.body.code], [409, 'OUT_OF_STOCK'], JSON.stringify(r.body));
    assert.equal((await q1("SELECT COUNT(*) AS n FROM dbo.Orders WHERE Type = 'TAKE_AWAY'"))[0].n, orders0);
    assert.equal((await q1('SELECT COUNT(*) AS n FROM dbo.Payments'))[0].n, pays0);
    const [peach1] = await q1(`SELECT StockQty, ReservedQty FROM dbo.Ingredients WHERE IngredientId = ${ing['Đào ngâm']}`);
    assert.deepEqual([Number(peach1.StockQty), Number(peach1.ReservedQty)], [Number(peach0.StockQty), Number(peach0.ReservedQty)]);
  });

  test('AC-020-03: món hết nguyên liệu tự hiện "Hết món"; nhập kho xong tự bán lại, không cần bật tay', async () => {
    const peach = ing['Đào ngâm'];
    const adj = await call(admin, 'post', `/api/admin/ingredients/${peach}/adjust`, { newQty: 1, reason: 'Kiểm thử hết hàng (AC-020-03)' });
    assert.equal(adj.status, 200, JSON.stringify(adj.body));
    let td = await menuItem('Trà đào');
    assert.deepEqual([td.isAvailable, td.soldOut], [false, true]);
    const rc = await call(admin, 'post', '/api/admin/stock-receipts', { lines: [{ ingredientId: peach, qty: 79, unitCost: 1000 }] });
    assert.equal(rc.status, 201, JSON.stringify(rc.body));
    td = await menuItem('Trà đào');
    assert.deepEqual([td.isAvailable, td.soldOut], [true, false]);
  });

  test('AC-017-01: "Bán chạy" xếp theo tổng số lượng đã thu; đơn hoàn tiền (VOIDED) và đơn chưa thu không được tính', async () => {
    await takeaway([{ menuItemId: ids['Cà phê đen'], quantity: 5 }]);
    await takeaway([{ menuItemId: ids['Cà phê sữa'], quantity: 3 }]);
    // Đơn bị hoàn toàn bộ → VOIDED, không tính
    const voided = await takeaway([{ menuItemId: ids['Bạc xỉu'], quantity: 9 }]);
    const [{ PaymentId }] = await q1(`SELECT PaymentId FROM dbo.Payments WHERE OrderId = ${voided.orderId}`);
    const rf = await call(admin, 'post', `/api/payments/${PaymentId}/refunds`, { amount: 9 * 32000, reason: 'Khách trả lại cả đơn' });
    assert.equal(rf.status, 201, JSON.stringify(rf.body));
    assert.equal((await q1(`SELECT Status FROM dbo.Orders WHERE OrderId = ${voided.orderId}`))[0].Status, 'VOIDED');
    // Đơn tại bàn chưa thu → không tính
    await guestOrder('02', [{ menuItemId: ids['Latte'], quantity: 10 }]);
    const s = await call(admin, 'put', '/api/admin/suggestions', { mode: 'BOTH', topN: 8, windowDays: 7, pins: [], hidden: [] });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    // Nước suối 1 ly đã thu ở test AC-005-03
    assert.deepEqual(
      s.body.top.map((t) => [t.name, t.qty]),
      [
        ['Cà phê đen', 5],
        ['Cà phê sữa', 3],
        ['Nước suối', 1],
      ],
    );
  });

  test('AC-026-05: bàn đã chia bill → thu cả bàn bị 409 SESSION_HAS_SPLITS; "Thu chung" khi chưa thu phần nào → thu cả bàn như cũ', async () => {
    const { s, order } = await guestOrder('03', [
      { menuItemId: ids['Cà phê đen'], quantity: 1 },
      { menuItemId: ids['Nước suối'], quantity: 1 },
    ]);
    assert.equal((await call(staff, 'post', `/api/orders/${order.orderId}/accept`)).status, 200);
    const sp = await call(staff, 'post', `/api/sessions/${s}/splits`, { label: 'Anh A' });
    assert.equal(sp.status, 201, JSON.stringify(sp.body));
    const lines = await lineIds(order.orderId);
    assert.equal((await call(staff, 'put', `/api/sessions/${s}/items/${lines['Cà phê đen']}/split`, { splitId: sp.body.splitId })).status, 200);
    const whole = await call(staff, 'post', `/api/sessions/${s}/settle`, { amountReceived: 100000 });
    assert.deepEqual([whole.status, whole.body.code], [409, 'SESSION_HAS_SPLITS'], JSON.stringify(whole.body));
    const merged = await call(staff, 'post', `/api/sessions/${s}/splits/merge`);
    assert.equal(merged.body.unsplit, true, JSON.stringify(merged.body));
    const ok = await call(staff, 'post', `/api/sessions/${s}/settle`, { amountReceived: 100000 });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.payment.amountDue, 25000 + 10000);
  });

  test('AC-030-03: hủy đơn đặt hàng (PO) đã nhận một phần → 409 PO_HAS_RECEIPTS, PO vẫn PARTIAL', async () => {
    assert.equal((await call(admin, 'put', '/api/admin/units/hộp1l', { name: 'hộp 1 lít', baseUnitCode: 'ml', factor: 1000 })).status, 200);
    const sup = await call(admin, 'post', '/api/admin/suppliers', {
      name: 'NCC kiểm thử AC-030-03',
      phone: '0909000222',
      leadTimeDays: 1,
      deliveryDaysMask: 127,
      items: [{ ingredientId: ing['Sữa tươi'], packUnitCode: 'hộp1l', isPreferred: true, lastPrice: 32000 }],
    });
    assert.equal(sup.status, 201, JSON.stringify(sup.body));
    const po = await call(admin, 'post', '/api/admin/purchase-orders', {
      supplierId: sup.body.supplierId,
      lines: [{ ingredientId: ing['Sữa tươi'], orderedPacks: 10 }],
    });
    assert.equal(po.status, 201, JSON.stringify(po.body));
    assert.equal((await call(admin, 'post', `/api/admin/purchase-orders/${po.body.poId}/send`)).body.status, 'SENT');
    const rc = await call(staff, 'post', `/api/receiving/purchase-orders/${po.body.poId}/receive`, {
      lines: [{ poLineId: po.body.lines[0].poLineId, packs: 4 }],
    });
    assert.equal(rc.status, 201, JSON.stringify(rc.body));
    assert.equal(rc.body.po.status, 'PARTIAL');
    const cancel = await call(admin, 'post', `/api/admin/purchase-orders/${po.body.poId}/cancel`);
    assert.deepEqual([cancel.status, cancel.body.code], [409, 'PO_HAS_RECEIPTS'], JSON.stringify(cancel.body));
    assert.equal((await call(admin, 'get', `/api/admin/purchase-orders/${po.body.poId}`)).body.status, 'PARTIAL');
  });

  test('AC-047-01: nhân viên mở bàn trống rồi gắn SĐT hội viên có sẵn → phiên có hội viên; quầy và khách cùng bàn đều nhận session.member_changed (khách chỉ thấy tên che)', async () => {
    const reg = await call(staff, 'post', '/api/members', { phone: '0912000047', fullName: 'Lê Văn Cường', consent: true });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    const [{ TableId }] = await q1("SELECT TableId FROM dbo.Tables WHERE Code = '04'");
    const opened = await call(staff, 'post', `/api/tables/${TableId}/sessions`, {});
    assert.equal(opened.status, 201, JSON.stringify(opened.body));
    const s = opened.body.session.sessionId;
    // Khách quét QR bàn đang có nhóm do nhân viên mở → gộp vào nhóm, mở socket của phiên
    const C = await app.customer();
    const [{ QrToken }] = await q1("SELECT QrToken FROM dbo.Tables WHERE Code = '04'");
    assert.equal((await C.post(`/api/sessions/${s}/join`, { qrToken: QrToken })).status, 200);
    const cSock = await app.connect({ auth: { sessionId: s }, extraHeaders: { cookie: C.cookie } });
    const toStaff = app.waitFor(staffSock, 'session.member_changed', (p) => p.sessionId === s);
    const toGuest = app.waitFor(cSock, 'session.member_changed', (p) => p.sessionId === s);
    const att = await call(staff, 'post', `/api/sessions/${s}/member`, { memberId: reg.body.memberId });
    assert.equal(att.status, 200, JSON.stringify(att.body));
    const [a, b] = await Promise.all([toStaff, toGuest]);
    assert.equal(a.member.maskedName, 'Lê V. C.');
    assert.equal(b.member.maskedName, 'Lê V. C.');
    assert.equal(b.member.fullName, undefined, 'khách không nhận tên đầy đủ');
    assert.equal((await C.get(`/api/sessions/${s}`)).body.member.maskedName, 'Lê V. C.');
  });
});

// ---- AC bổ sung ở bước 05 (trường hợp lỗi / biên / quyền — TASK-057) chưa có test ----
const vnHourFromNow = (h) => `${String((new Date(Date.now() + 7 * 3600e3).getUTCHours() + h + 24) % 24).padStart(2, '0')}:00`;

describe('AC lỗi / biên bổ sung ở bước 05 (TASK-057)', () => {
  test('AC-003-09: dòng số lượng 0 hoặc 51, hoặc giỏ trống → 400 VALIDATION_ERROR, không tạo đơn', async () => {
    const C = await app.customer();
    const s = await app.seat(C, '05');
    const [{ n: before }] = await q1('SELECT COUNT(*) AS n FROM dbo.Orders');
    for (const items of [[{ menuItemId: ids['Nước suối'], quantity: 0 }], [{ menuItemId: ids['Nước suối'], quantity: 51 }], []]) {
      const r = await C.post('/api/orders', { sessionId: s, items });
      assert.deepEqual([r.status, r.body.code], [400, 'VALIDATION_ERROR'], JSON.stringify(items));
    }
    assert.equal((await q1('SELECT COUNT(*) AS n FROM dbo.Orders'))[0].n, before);
  });

  test('AC-009-05: quản lý tự khóa tài khoản đang đăng nhập của mình → 400 CANNOT_LOCK_SELF, tài khoản vẫn hoạt động', async () => {
    const me = (await call(admin, 'get', '/api/auth/me')).body.user;
    const r = await call(admin, 'patch', `/api/admin/users/${me.userId}/active`, { isActive: false });
    assert.deepEqual([r.status, r.body.code], [400, 'CANNOT_LOCK_SELF']);
    assert.equal((await q1(`SELECT IsActive FROM dbo.Users WHERE UserId = ${me.userId}`))[0].IsActive, true);
    assert.equal((await api.post('/api/auth/login').send({ username: 'admin', password: 'Admin@123' })).status, 200);
  });

  test('AC-021-04: khách gọi nhân viên khi phiên đã thu tiền (CLOSED) → 409 SESSION_CLOSED, quầy không nhận yêu cầu', async () => {
    const { C, s, order } = await guestOrder('01', [{ menuItemId: ids['Nước suối'], quantity: 1 }]);
    await call(staff, 'post', `/api/orders/${order.orderId}/accept`);
    assert.equal((await call(staff, 'post', `/api/sessions/${s}/settle`, { amountReceived: 10000 })).status, 200);
    let called = false;
    const onCall = (p) => {
      if (p.sessionId === s) called = true;
    };
    staffSock.on('session.staff_called', onCall);
    const r = await C.post(`/api/sessions/${s}/call-staff`, { message: 'Cho xin nước' });
    assert.deepEqual([r.status, r.body.code], [409, 'SESSION_CLOSED'], JSON.stringify(r.body));
    await sleep(400);
    staffSock.off('session.staff_called', onCall);
    assert.equal(called, false);
    assert.equal((await q1(`SELECT COUNT(*) AS n FROM dbo.StaffCalls WHERE SessionId = '${s}'`))[0].n, 0);
  });

  test('AC-026-09: bàn đã chia bill còn đơn chưa tiếp nhận → thu một phần bị 409 HAS_PENDING_ORDERS, không tạo lượt thu', async () => {
    const { C, s, order } = await guestOrder('05', [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    await call(staff, 'post', `/api/orders/${order.orderId}/accept`);
    const sp = await call(staff, 'post', `/api/sessions/${s}/splits`, { label: 'Anh A' });
    const lines = await lineIds(order.orderId);
    await call(staff, 'put', `/api/sessions/${s}/items/${lines['Cà phê đen']}/split`, { splitId: sp.body.splitId });
    const pending = await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] });
    assert.equal(pending.status, 201);
    const r = await call(staff, 'post', `/api/splits/${sp.body.splitId}/settle`, { amountReceived: 100000 });
    assert.deepEqual([r.status, r.body.code], [409, 'HAS_PENDING_ORDERS'], JSON.stringify(r.body));
    assert.deepEqual(r.body.details.orderIds, [pending.body.orderId]);
    assert.equal((await q1(`SELECT COUNT(*) AS n FROM dbo.Payments WHERE SessionId = '${s}'`))[0].n, 0);
  });

  test('AC-027-07 + AC-032-05: nguyên liệu đang trong phiếu kiểm kê nháp → ghi mẻ sơ chế / phiếu hủy bị 409 STOCKTAKE_LOCKED, kho không đổi', async () => {
    const mk = async (name, unit) => (await call(admin, 'post', '/api/admin/ingredients', { name, unit, stockQty: 0, lowStockThreshold: 0 })).body.ingredientId;
    const bean = await mk('Hạt rang kiểm kê', 'g');
    const water = await mk('Nước kiểm kê', 'ml');
    const brew = await mk('Cốt kiểm kê', 'ml');
    const rc = await call(admin, 'post', '/api/admin/stock-receipts', {
      lines: [
        { ingredientId: bean, qty: 1000, unitCost: 200 },
        { ingredientId: water, qty: 10000, unitCost: 1 },
      ],
    });
    assert.equal(rc.status, 201, JSON.stringify(rc.body));
    await call(admin, 'put', `/api/admin/ingredients/${brew}/advanced`, { kind: 'SEMI', shelfLifeHours: 24, wastePercent: 0 });
    const rec = await call(admin, 'put', `/api/admin/ingredients/${brew}/recipe`, {
      outputQty: 900,
      lines: [
        { ingredientId: bean, qty: 100 },
        { ingredientId: water, qty: 1000 },
      ],
    });
    assert.equal(rec.status, 200, JSON.stringify(rec.body));
    const st = await call(admin, 'post', '/api/admin/stocktakes', { ingredientIds: [bean], note: 'Kiểm hạt' });
    assert.equal(st.body.status, 'DRAFT', JSON.stringify(st.body));
    const stock = async () =>
      (await q1(`SELECT StockQty FROM dbo.Ingredients WHERE IngredientId IN (${bean}, ${water}, ${brew}) ORDER BY IngredientId`)).map((x) =>
        Number(x.StockQty),
      );
    const before = await stock();
    const prep = await call(staff, 'post', '/api/prep/batches', { semiIngredientId: brew, multiplier: 1 });
    assert.deepEqual([prep.status, prep.body.code], [409, 'STOCKTAKE_LOCKED'], JSON.stringify(prep.body));
    const waste = await call(staff, 'post', '/api/waste', { ingredientId: bean, qty: 10, reason: 'SPILL' });
    assert.deepEqual([waste.status, waste.body.code], [409, 'STOCKTAKE_LOCKED'], JSON.stringify(waste.body));
    assert.deepEqual(await stock(), before);
    assert.equal((await call(admin, 'delete', `/api/admin/stocktakes/${st.body.stocktakeId}`)).status, 200);
    assert.equal((await call(staff, 'post', '/api/prep/batches', { semiIngredientId: brew, multiplier: 1 })).status, 201, 'xóa phiếu nháp → mở khóa');
  });

  test('AC-035-08: chấm công có giờ ở tương lai, giờ ra trước giờ vào, hoặc dài hơn 24 giờ → 400 VALIDATION_ERROR, không tạo dòng', async () => {
    const [{ UserId }] = await q1("SELECT UserId FROM dbo.Users WHERE Username = 'staff1'");
    const [{ n: before }] = await q1(`SELECT COUNT(*) AS n FROM dbo.Attendance WHERE UserId = ${UserId}`);
    const h = 3600e3;
    const ago = (x) => new Date(Date.now() - x).toISOString();
    for (const [clockIn, clockOut] of [
      [new Date(Date.now() + 2 * h).toISOString(), null],
      [ago(30 * h), ago(31 * h)],
      [ago(40 * h), ago(10 * h)],
    ]) {
      const r = await call(admin, 'post', '/api/attendance', { userId: UserId, clockIn, clockOut, reason: 'kiểm biên' });
      assert.deepEqual([r.status, r.body.code], [400, 'VALIDATION_ERROR'], `${clockIn} → ${clockOut}: ${JSON.stringify(r.body)}`);
    }
    assert.equal((await q1(`SELECT COUNT(*) AS n FROM dbo.Attendance WHERE UserId = ${UserId}`))[0].n, before);
  });

  test('AC-037-08: sửa / xóa chiến dịch đã chạy → 409 CAMPAIGN_LOCKED; xóa phân khúc đang được chiến dịch dùng → 409 IN_USE', async () => {
    const seg = await call(admin, 'post', '/api/admin/segments', { name: 'Phân khúc khóa', rule: {} });
    assert.equal(seg.status, 201, JSON.stringify(seg.body));
    const body = { name: 'Chiến dịch khóa', segmentId: seg.body.segmentId, channel: 'EXPORT', messageTemplate: 'Chào {name}' };
    const c = await call(admin, 'post', '/api/admin/campaigns', body);
    assert.equal(c.status, 201, JSON.stringify(c.body));
    assert.equal((await call(admin, 'post', `/api/admin/campaigns/${c.body.campaignId}/run`)).status, 200);
    const edit = await call(admin, 'put', `/api/admin/campaigns/${c.body.campaignId}`, { ...body, name: 'Đổi tên' });
    assert.deepEqual([edit.status, edit.body.code], [409, 'CAMPAIGN_LOCKED']);
    const del = await call(admin, 'delete', `/api/admin/campaigns/${c.body.campaignId}`);
    assert.deepEqual([del.status, del.body.code], [409, 'CAMPAIGN_LOCKED']);
    const segDel = await call(admin, 'delete', `/api/admin/segments/${seg.body.segmentId}`);
    assert.deepEqual([segDel.status, segDel.body.code], [409, 'IN_USE'], JSON.stringify(segDel.body));
  });

  test('AC-039-09: đổi thưởng điểm khi lượt thu chưa gắn hội viên → 400 MEMBER_REQUIRED', async () => {
    const rw = await call(admin, 'post', '/api/admin/rewards', { name: 'Giảm 20.000đ', pointsCost: 100, rewardType: 'DISCOUNT', discountAmount: 20000 });
    assert.equal(rw.status, 201, JSON.stringify(rw.body));
    const r = await call(staff, 'post', '/api/orders/takeaway/quote', {
      items: [{ menuItemId: ids['Cà phê đen'], quantity: 2 }],
      reward: { type: 'POINTS', rewardId: rw.body.rewardId },
    });
    assert.deepEqual([r.status, r.body.code], [400, 'MEMBER_REQUIRED'], JSON.stringify(r.body));
  });

  test('AC-045-05: gọi lại đơn — món ngoài lịch thực đơn và món có tùy chọn không còn hợp lệ bị bỏ kèm lý do; dòng hợp lệ vẫn vào giỏ', async () => {
    const g = await call(admin, 'post', '/api/admin/modifier-groups', {
      name: 'Size gọi lại',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: 'Size M', priceDelta: 0, isDefault: true },
        { name: 'Size L', priceDelta: 5000 },
      ],
    });
    assert.equal(g.status, 201, JSON.stringify(g.body));
    const latte = (await call(admin, 'get', '/api/admin/menu-items')).body.find((i) => i.name === 'Latte');
    const setGroups = (groupIds) => call(admin, 'put', `/api/admin/menu-items/${latte.menuItemId}`, { ...latte, imageUrl: '', groupIds });
    assert.equal((await setGroups([g.body.groupId])).status, 200);
    const sizeL = g.body.options.find((o) => o.name === 'Size L').optionId;
    // Lần 1: hội viên gọi Latte Size L + bánh + nước suối, thu tiền
    const A = await app.customer();
    const s1 = await app.seat(A, '06');
    assert.equal((await A.post('/api/members', { phone: '0912000045', fullName: 'Phạm Thị Dung', consent: true })).status, 201);
    assert.equal((await A.post(`/api/sessions/${s1}/member`, { phone: '0912000045' })).status, 200);
    const o = await A.post('/api/orders', {
      sessionId: s1,
      items: [
        { menuItemId: latte.menuItemId, quantity: 1, optionIds: [sizeL] },
        { menuItemId: ids['Bánh croissant'], quantity: 1 },
        { menuItemId: ids['Nước suối'], quantity: 1 },
      ],
    });
    assert.equal(o.status, 201, JSON.stringify(o.body));
    await call(staff, 'post', `/api/orders/${o.body.orderId}/accept`);
    assert.equal((await call(staff, 'post', `/api/sessions/${s1}/settle`, { amountReceived: 200000 })).status, 200);
    // Sau đó: bánh chỉ bán theo lịch ở khung giờ khác; Latte bỏ nhóm Size → Size L không còn hợp lệ
    const sch = await call(admin, 'post', '/api/admin/menu-schedules', {
      name: 'Bánh khung khác',
      startTime: vnHourFromNow(2),
      endTime: vnHourFromNow(4),
      targets: [{ menuItemId: ids['Bánh croissant'], mode: 'SHOW' }],
    });
    assert.equal(sch.status, 201, JSON.stringify(sch.body));
    assert.equal((await setGroups([])).status, 200);
    const [{ QrToken }] = await q1("SELECT QrToken FROM dbo.Tables WHERE Code = '06'");
    const s2 = (await A.post('/api/sessions', { qrToken: QrToken })).body.session.sessionId;
    assert.equal((await A.post(`/api/sessions/${s2}/member`, { phone: '0912000045' })).status, 200);
    const r = await A.post('/api/cart/replay', { orderId: o.body.orderId });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(
      r.body.items.map((i) => i.name),
      ['Nước suối'],
    );
    assert.deepEqual(
      [...r.body.skipped].sort((a, b) => a.name.localeCompare(b.name)),
      [
        { name: 'Bánh croissant', reason: 'không còn trên thực đơn lúc này' },
        { name: 'Latte', reason: 'tùy chọn đã thay đổi — vui lòng chọn lại' },
      ],
    );
    await call(admin, 'delete', `/api/admin/menu-schedules/${sch.body.scheduleId}`);
  });

  test('AC-047-06: gỡ hội viên khỏi phiên → member = null, quầy và điện thoại trong phiên nhận session.member_changed; thiết bị khác 403; phiên đã đóng 409', async () => {
    const C = await app.customer();
    const s = await app.seat(C, '03');
    assert.equal((await C.post('/api/members', { phone: '0912000046', fullName: 'Võ Văn Em', consent: true })).status, 201);
    assert.equal((await C.post(`/api/sessions/${s}/member`, { phone: '0912000046' })).status, 200);
    const D = await app.customer();
    assert.equal((await D.del(`/api/sessions/${s}/member`)).status, 403);
    const cSock = await app.connect({ auth: { sessionId: s }, extraHeaders: { cookie: C.cookie } });
    const toStaff = app.waitFor(staffSock, 'session.member_changed', (p) => p.sessionId === s);
    const toGuest = app.waitFor(cSock, 'session.member_changed', (p) => p.sessionId === s);
    assert.equal((await C.del(`/api/sessions/${s}/member`)).status, 200);
    const [a, b] = await Promise.all([toStaff, toGuest]);
    assert.deepEqual([a.member, b.member], [null, null]);
    assert.equal((await C.get(`/api/sessions/${s}`)).body.member, null);
    // Phiên đã đóng (đóng bàn trống) → gỡ bị 409
    assert.equal((await call(staff, 'post', `/api/sessions/${s}/close`)).status, 200);
    const closed = await call(staff, 'delete', `/api/sessions/${s}/member`);
    assert.deepEqual([closed.status, closed.body.code], [409, 'SESSION_CLOSED']);
  });

  test('AC-016-07: đơn mang đi gửi đúng lúc khuyến mãi theo đơn vừa hết lượt trong ngày → 409 AMOUNT_CHANGED, không tạo đơn, không thu tiền', async () => {
    const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const p = await call(admin, 'post', '/api/admin/promotions', {
      name: 'Giảm 10% còn 1 lượt',
      type: 'ORDER_PERCENT',
      value: 10,
      minOrderAmount: 0,
      maxUsesPerDay: 1,
      startDate: today,
      endDate: today,
      stackWithMember: true,
      isActive: true,
    });
    assert.equal(p.status, 201, JSON.stringify(p.body));
    const items = [{ menuItemId: ids['Nước suối'], quantity: 1 }];
    assert.equal((await call(staff, 'post', '/api/orders/takeaway/quote', { items })).status, 200); // nạp bộ đệm khuyến mãi (còn lượt)
    const [{ n: orders0 }] = await q1("SELECT COUNT(*) AS n FROM dbo.Orders WHERE Type = 'TAKE_AWAY'");
    const [{ n: pays0 }] = await q1('SELECT COUNT(*) AS n FROM dbo.Payments');
    // 4 quầy gửi cùng lúc, cùng báo giá có khuyến mãi; SP chỉ cho 1 lượt cuối
    const res = await Promise.all([0, 1, 2, 3].map(() => call(staff, 'post', '/api/orders/takeaway', { items, amountReceived: 100000 })));
    const ok = res.filter((r) => r.status === 201);
    const changed = res.filter((r) => r.status === 409);
    assert.equal(ok.length + changed.length, 4, JSON.stringify(res.map((r) => r.body)));
    assert.equal(ok.filter((r) => r.body.payment.promoDiscount > 0).length, 1, 'đúng một đơn được khuyến mãi');
    assert.ok(changed.length >= 1, 'có lượt bị báo tổng đã đổi');
    assert.ok(changed.every((r) => r.body.code === 'AMOUNT_CHANGED'));
    assert.equal((await q1("SELECT COUNT(*) AS n FROM dbo.Orders WHERE Type = 'TAKE_AWAY'"))[0].n, orders0 + ok.length, 'lượt 409 không tạo đơn');
    assert.equal((await q1('SELECT COUNT(*) AS n FROM dbo.Payments'))[0].n, pays0 + ok.length, 'lượt 409 không thu tiền');
    await call(admin, 'patch', `/api/admin/promotions/${p.body.promotionId}/active`, { isActive: false });
  });
});

describe('Trang chủ và trang 404 (SCR-43, SCR-44 — US-001-3, TASK-057)', () => {
  test('AC-001-07: mở địa chỉ gốc / → 200, hướng dẫn quét mã QR trên bàn + nút vào quầy và quản lý; không tạo phiên', async () => {
    const [{ n: before }] = await q1('SELECT COUNT(*) AS n FROM dbo.Sessions');
    const r = await api.get('/');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /text\/html/);
    assert.match(r.text, /quét <strong>mã QR dán trên bàn<\/strong>/);
    assert.match(r.text, /href="\/pos"[^>]*>Màn hình quầy \(nhân viên\)</);
    assert.match(r.text, /href="\/admin"[^>]*>Quản lý</);
    assert.equal((await q1('SELECT COUNT(*) AS n FROM dbo.Sessions'))[0].n, before);
  });

  test('AC-001-08: đường dẫn trang không tồn tại → 404 trang "Không tìm thấy trang" có nút Về trang chủ; API không tồn tại → JSON (401 khi chưa đăng nhập, 404 NOT_FOUND khi đã đăng nhập)', async () => {
    const page = await api.get('/khong-co-trang-nay');
    assert.equal(page.status, 404);
    assert.match(page.headers['content-type'], /text\/html/);
    assert.match(page.text, /Không tìm thấy trang/);
    assert.match(page.text, /quét lại mã QR/);
    assert.match(page.text, /href="\/"[^>]*>Về trang chủ</);
    // API lạ: luôn trả JSON (không trả trang HTML); chưa đăng nhập → 401 (không lộ API nào tồn tại), nhân viên → 404 NOT_FOUND
    const anon = await api.get('/api/khong-co-api-nay');
    assert.equal(anon.status, 401);
    assert.match(anon.headers['content-type'], /application\/json/);
    const apiMiss = await call(staff, 'get', '/api/khong-co-api-nay');
    assert.equal(apiMiss.status, 404);
    assert.match(apiMiss.headers['content-type'], /application\/json/);
    assert.equal(apiMiss.body.code, 'NOT_FOUND');
  });
});

describe('NFR-SEC: header bảo mật (security-check.md — G-08, TASK-057)', () => {
  test('mọi phản hồi có CSP, nosniff, chặn nhúng khung; không lộ x-powered-by; cookie khách HttpOnly + SameSite', async () => {
    const r = await api.get('/api/menu');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-security-policy'], /default-src 'self'/);
    assert.match(r.headers['content-security-policy'], /frame-ancestors 'self'/);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['x-powered-by'], undefined);
    const cookie = r.headers['set-cookie'].find((c) => c.startsWith('cf_client='));
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
  });
});
