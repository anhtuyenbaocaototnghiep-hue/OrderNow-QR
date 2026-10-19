// Integration test (SQL Server thật): F-013 Tùy chọn món, F-015 Combo, F-016 Khuyến mãi (gồm tranh lượt đồng thời),
// F-017 Gợi ý, F-020 Công tắc nhận đơn + giờ bán, F-021 Gọi nhân viên.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let app, api, pool, admin, staff, ids;

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  assert.equal((await api.post('/api/shifts/open').set(auth(staff)).send({ openingCash: 0 })).status, 201);
});

after(() => app.close());

const ing = async (name) => (await pool.request().query(`SELECT StockQty, ReservedQty FROM dbo.Ingredients WHERE Name = N'${name}'`)).recordset[0];
const ingId = async (name) => (await pool.request().query(`SELECT IngredientId FROM dbo.Ingredients WHERE Name = N'${name}'`)).recordset[0].IngredientId;
const adminApi = (method, path, body) => api[method](path).set(auth(admin)).send(body);
const menuItems = (menu) => menu.categories.flatMap((c) => c.items);
const takeaway = (items, extra = {}) =>
  api
    .post('/api/orders/takeaway')
    .set(auth(staff))
    .send({ items, amountReceived: 5_000_000, ...extra });
/** Giờ VN dạng HH:MM cách hiện tại `h` giờ (khung giờ chắc chắn không chứa "bây giờ"). */
const vnHourFromNow = (h) => `${String((new Date(Date.now() + 7 * 3600e3).getUTCHours() + h) % 24).padStart(2, '0')}:00`;

describe('Tùy chọn món (F-013)', () => {
  let sizeGroup, sizeL, order;

  test('quản lý tạo nhóm Size (bắt buộc 1) có BOM cộng thêm, gán cho món → menu khách có nhóm + tùy chọn', async () => {
    const cot = await ingId('Cà phê cốt');
    const g = await adminApi('post', '/api/admin/modifier-groups', {
      name: 'Size',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: 'Size M', priceDelta: 0, isDefault: true },
        { name: 'Size L', priceDelta: 5000, bom: [{ ingredientId: cot, amount: 20 }] },
      ],
    });
    assert.equal(g.status, 201, JSON.stringify(g.body));
    sizeGroup = g.body;
    sizeL = g.body.options.find((o) => o.name === 'Size L');
    const bad = await adminApi('post', '/api/admin/modifier-groups', { name: 'X', minSelect: 2, maxSelect: 1, options: [{ name: 'a' }] });
    assert.equal(bad.status, 400);
    const item = (await api.get('/api/admin/menu-items').set(auth(admin))).body.find((i) => i.name === 'Cà phê sữa');
    const put = await adminApi('put', `/api/admin/menu-items/${item.menuItemId}`, {
      categoryId: item.categoryId,
      name: item.name,
      price: item.price,
      imageUrl: '',
      isAvailable: true,
      isActive: true,
      groupIds: [sizeGroup.groupId],
    });
    assert.deepEqual(put.body.groupIds, [sizeGroup.groupId]);
    const menu = (await api.get('/api/menu')).body;
    assert.deepEqual(menuItems(menu).find((i) => i.name === 'Cà phê sữa').groupIds, [sizeGroup.groupId]);
    assert.deepEqual(
      menu.modifierGroups[0].options.map((o) => [o.name, o.priceDelta, o.isDefault]),
      [
        ['Size M', 0, true],
        ['Size L', 5000, false],
      ],
    );
  });

  test('thiếu nhóm bắt buộc / tùy chọn lạ → 400; Size L: +5k và giữ thêm 20 ml BOM; hoàn tất trừ đúng', async () => {
    const C = await app.customer();
    const s = await app.seat(C, '03');
    const noOpt = await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Cà phê sữa'], quantity: 1 }] });
    assert.equal(noOpt.status, 400);
    assert.equal(noOpt.body.code, 'INVALID_OPTIONS');
    assert.equal((await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Cà phê sữa'], quantity: 1, optionIds: [99999] }] })).status, 400);
    const before = await ing('Cà phê cốt');
    const r = await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Cà phê sữa'], quantity: 2, optionIds: [sizeL.optionId] }] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    order = r.body.order;
    assert.equal(order.totalAmount, 2 * 34000);
    assert.deepEqual(
      order.items[0].options.map((o) => [o.name, o.priceDelta]),
      [['Size L', 5000]],
    );
    const after = await ing('Cà phê cốt');
    assert.equal(Number(after.ReservedQty) - Number(before.ReservedQty), 2 * (25 + 20));
    await api.post(`/api/orders/${order.orderId}/accept`).set(auth(staff));
    const done = await api.post(`/api/orders/${order.orderId}/complete`).set(auth(staff));
    assert.equal(done.body.inventoryDeducted.find((d) => d.name === 'Cà phê cốt').qty, 90);
  });

  test('sửa phụ thu tùy chọn sau đó không đổi đơn cũ', async () => {
    const g = (await api.get('/api/admin/modifier-groups').set(auth(admin))).body.find((x) => x.groupId === sizeGroup.groupId);
    const r = await adminApi('put', `/api/admin/modifier-groups/${g.groupId}`, {
      ...g,
      options: g.options.map((o) => ({
        ...o,
        priceDelta: o.name === 'Size L' ? 7000 : o.priceDelta,
        bom: o.bom.map((b) => ({ ingredientId: b.ingredientId, amount: b.amount })),
      })),
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const again = await api.get(`/api/orders/${order.orderId}`).set(auth(staff));
    assert.equal(again.body.items[0].options[0].priceDelta, 5000);
    assert.equal(again.body.totalAmount, 68000);
    // gỡ nhóm khỏi món để các test sau gọi Cà phê sữa như cũ
    const item = (await api.get('/api/admin/menu-items').set(auth(admin))).body.find((i) => i.name === 'Cà phê sữa');
    await adminApi('put', `/api/admin/menu-items/${item.menuItemId}`, { ...item, imageUrl: '', groupIds: [] });
  });
});

describe('Combo (F-015)', () => {
  let combo;

  test('tạo combo 2 thành phần → menu có mục Combo + tiết kiệm; combo lồng combo bị chặn; combo không có BOM riêng', async () => {
    const r = await adminApi('post', '/api/admin/combos', {
      name: 'Combo sáng',
      price: 45000,
      components: [
        { menuItemId: ids['Cà phê đen'], quantity: 1 },
        { menuItemId: ids['Bánh croissant'], quantity: 1 },
      ],
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    combo = r.body;
    assert.equal(combo.listTotal, 50000);
    const menu = (await api.get('/api/menu')).body;
    assert.equal(menu.combos[0].savings, 5000);
    assert.equal(menu.combos[0].isAvailable, true);
    assert.ok(!menuItems(menu).some((i) => i.id === combo.menuItemId), 'combo không lẫn vào danh mục');
    const nested = await adminApi('post', '/api/admin/combos', { name: 'Lồng', price: 1000, components: [{ menuItemId: combo.menuItemId, quantity: 2 }] });
    assert.equal(nested.body.code, 'COMBO_INVALID');
    const bom = await adminApi('put', `/api/admin/menu-items/${combo.menuItemId}/bom`, [{ ingredientId: 1, amount: 5 }]);
    assert.equal(bom.body.code, 'COMBO_HAS_NO_BOM');
  });

  test('bán combo ×2: 1 dòng cha + dòng con giá 0; tổng = giá combo; hoàn tất trừ kho theo BOM thành phần', async () => {
    const before = await ing('Cà phê cốt');
    const r = await takeaway([{ menuItemId: combo.menuItemId, quantity: 2 }]);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const o = r.body.order;
    assert.equal(o.totalAmount, 90000);
    assert.equal(o.items.length, 1);
    assert.deepEqual(o.items[0].children.map((c) => [c.name, c.quantity]).sort(), [
      ['Bánh croissant', 2],
      ['Cà phê đen', 2],
    ]);
    const rows = (await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.OrderItems WHERE OrderId = ${o.orderId}`)).recordset[0].n;
    assert.equal(rows, 3);
    await api.post(`/api/orders/${o.orderId}/complete`).set(auth(staff));
    const after = await ing('Cà phê cốt');
    assert.equal(Number(before.StockQty) - Number(after.StockQty), 2 * 25);
    const bill = await api.get(`/api/orders/${o.orderId}/receipt`).set(auth(staff));
    assert.equal(bill.body.lines[0].children.length, 2);
  });

  test('thành phần tắt "còn bán" → combo báo hết + gửi đơn bị từ chối; đổi giá lẻ → tiết kiệm đổi, đơn cũ giữ nguyên; xóa thành phần bị chặn', async () => {
    await adminApi('patch', `/api/admin/menu-items/${ids['Bánh croissant']}/availability`, { isAvailable: false });
    const menu = (await api.get('/api/menu')).body;
    assert.equal(menu.combos[0].isAvailable, false);
    const no = await takeaway([{ menuItemId: combo.menuItemId, quantity: 1 }]);
    assert.equal(no.status, 409);
    assert.equal(no.body.code, 'ITEM_UNAVAILABLE');
    assert.equal(no.body.details.items[0].name, 'Combo sáng');
    await adminApi('patch', `/api/admin/menu-items/${ids['Bánh croissant']}/availability`, { isAvailable: true });

    const den = (await api.get('/api/admin/menu-items').set(auth(admin))).body.find((i) => i.name === 'Cà phê đen');
    await adminApi('put', `/api/admin/menu-items/${den.menuItemId}`, { ...den, imageUrl: '', price: 27000 });
    assert.equal((await api.get('/api/menu')).body.combos[0].savings, 7000);
    const old = (await pool.request().query(`SELECT TOP 1 TotalAmount FROM dbo.Orders WHERE Type = 'TAKE_AWAY' ORDER BY OrderId DESC`)).recordset[0];
    assert.equal(Number(old.TotalAmount), 90000);
    const del = await adminApi('delete', `/api/admin/menu-items/${den.menuItemId}`);
    assert.equal(del.status, 409);
    assert.equal(del.body.code, 'IN_COMBO');
    assert.match(del.body.message, /Combo sáng/);
    await adminApi('put', `/api/admin/menu-items/${den.menuItemId}`, { ...den, imageUrl: '', price: 25000 });
  });
});

describe('Khuyến mãi (F-016)', () => {
  const base = () => ({ startDate: todayVn(), endDate: todayVn(), stackWithMember: false, isActive: true });
  let p1, p2;

  test('giá đặc biệt theo món: menu hiện giá mới + nhãn; đơn khóa giá KM; giá thấp nhất thắng giữa hai KM', async () => {
    const r1 = await adminApi('post', '/api/admin/promotions', {
      ...base(),
      name: 'Trà đào 25k',
      type: 'ITEM_PRICE',
      value: 25000,
      badgeText: 'Giờ vàng',
      itemIds: [ids['Trà đào']],
    });
    assert.equal(r1.status, 201, JSON.stringify(r1.body));
    p1 = r1.body;
    const td = menuItems((await api.get('/api/menu')).body).find((i) => i.name === 'Trà đào');
    assert.deepEqual([td.price, td.listPrice, td.promotionBadge], [25000, 35000, 'Giờ vàng']);
    const cat = (await api.get('/api/admin/categories').set(auth(admin))).body.find((c) => c.name.startsWith('Trà'));
    p2 = (await adminApi('post', '/api/admin/promotions', { ...base(), name: 'Đồng giá 20k', type: 'ITEM_PRICE', value: 20000, categoryIds: [cat.categoryId] }))
      .body;
    const C = await app.customer();
    const s = await app.seat(C, '04');
    const o = await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Trà đào'], quantity: 2 }] });
    assert.equal(o.status, 201, JSON.stringify(o.body));
    assert.equal(o.body.totalAmount, 40000);
    assert.equal(o.body.order.subtotalAmount, 70000);
    assert.equal(o.body.order.promoDiscount, 30000);
    assert.equal(o.body.order.items[0].promotionName, 'Đồng giá 20k');
    const q = await C.post('/api/orders/quote', { items: [{ menuItemId: ids['Trà đào'], quantity: 1 }] });
    assert.equal(q.body.total, 20000);
    await adminApi('patch', `/api/admin/promotions/${p2.promotionId}/active`, { isActive: false });
    assert.equal((await C.post('/api/orders/quote', { items: [{ menuItemId: ids['Trà đào'], quantity: 1 }] })).body.total, 25000);
  });

  test('ngoài khung giờ / sai ngày → không áp dụng; dữ liệu sai → 400', async () => {
    const off = await adminApi('post', '/api/admin/promotions', {
      ...base(),
      name: 'Ngoài giờ',
      type: 'ITEM_PRICE',
      value: 1000,
      startTime: vnHourFromNow(2),
      endTime: vnHourFromNow(3),
      itemIds: [ids['Bạc xỉu']],
    });
    assert.equal(off.status, 201, JSON.stringify(off.body));
    const C = await app.customer();
    assert.equal((await C.post('/api/orders/quote', { items: [{ menuItemId: ids['Bạc xỉu'], quantity: 1 }] })).body.total, 32000);
    assert.equal((await adminApi('post', '/api/admin/promotions', { ...base(), name: 'Thiếu món', type: 'ITEM_PRICE', value: 1000 })).status, 400);
    assert.equal((await adminApi('post', '/api/admin/promotions', { ...base(), name: 'x', type: 'ORDER_PERCENT', value: 150 })).status, 400);
    assert.equal(
      (await adminApi('post', '/api/admin/promotions', { ...base(), endDate: '2026-01-01', name: 'x', type: 'ORDER_AMOUNT', value: 5 })).status,
      400,
    );
    await adminApi('delete', `/api/admin/promotions/${off.body.promotionId}`);
  });

  test('MaxUsesPerDay = 1: hai đơn gửi đồng thời → đúng một đơn được giảm, đơn kia giá gốc (không lỗi)', async () => {
    await adminApi('patch', `/api/admin/promotions/${p1.promotionId}/active`, { isActive: false });
    const lim = await adminApi('post', '/api/admin/promotions', {
      ...base(),
      name: 'Giảm 5k đơn đầu ngày',
      type: 'ORDER_AMOUNT',
      value: 5000,
      maxUsesPerDay: 1,
    });
    assert.equal(lim.status, 201);
    const [X, Y] = [await app.customer(), await app.customer()];
    const [sx, sy] = [await app.seat(X, '05'), await app.seat(Y, '06')];
    const body = (s) => ({ sessionId: s, items: [{ menuItemId: ids['Nước suối'], quantity: 2 }] });
    const [rx, ry] = await Promise.all([X.post('/api/orders', body(sx)), Y.post('/api/orders', body(sy))]);
    assert.deepEqual([rx.status, ry.status], [201, 201], JSON.stringify([rx.body, ry.body]));
    assert.deepEqual([rx.body.totalAmount, ry.body.totalAmount].sort(), [15000, 20000]);
    const uses = (await pool.request().query(`SELECT COUNT(DISTINCT OrderId) AS n FROM dbo.PromotionUsages WHERE PromotionId = ${lim.body.promotionId}`))
      .recordset[0].n;
    assert.equal(uses, 1);
    const menu = (await api.get('/api/menu')).body;
    assert.ok(!menu.promotions.some((p) => p.promotionId === lim.body.promotionId), 'hết lượt → không quảng bá nữa');
    const st = await api.get(`/api/admin/promotions/${lim.body.promotionId}/stats`).set(auth(admin));
    assert.deepEqual([st.body.uses, st.body.discount], [1, 5000]);
    await adminApi('patch', `/api/admin/promotions/${lim.body.promotionId}/active`, { isActive: false });
  });

  test('StackWithMember = 0: thu tiền không chiết khấu hội viên lên dòng khuyến mãi', async () => {
    await adminApi('patch', `/api/admin/promotions/${p1.promotionId}/active`, { isActive: true });
    const C = await app.customer();
    await C.post('/api/members', { phone: '0987654321', fullName: 'Lê Thị Hoa', consent: true });
    const s = await app.seat(C, '07').catch(() => null);
    const sessionId = s ?? (await app.seat(C, '03'));
    await C.post(`/api/sessions/${sessionId}/member`, { phone: '0987654321' });
    const o = await C.post('/api/orders', {
      sessionId,
      items: [
        { menuItemId: ids['Trà đào'], quantity: 1 },
        { menuItemId: ids['Bánh croissant'], quantity: 2 },
      ],
    });
    assert.equal(o.body.totalAmount, 25000 + 50000);
    await api.post(`/api/orders/${o.body.orderId}/accept`).set(auth(staff));
    const pv = await api.post(`/api/sessions/${sessionId}/settle/preview`).set(auth(staff)).send({});
    assert.equal(pv.body.totals.memberDiscount, 5000, 'đơn đầu 10% chỉ trên 50.000đ bánh, không trên trà đào KM');
    const r = await api.post(`/api/sessions/${sessionId}/settle`).set(auth(staff)).send({ amountReceived: 70000, expectedAmountDue: pv.body.totals.amountDue });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.payment.promoDiscount, 10000);
    await adminApi('patch', `/api/admin/promotions/${p1.promotionId}/active`, { isActive: false });
  });
});

describe('Gợi ý / bán chạy / ghim (F-017)', () => {
  test('ghim đứng trước + nhãn riêng, sau đó là bán chạy; chế độ chỉ ghim; ẩn khỏi gợi ý; món hết không xuất hiện', async () => {
    const s = await adminApi('put', '/api/admin/suggestions', {
      mode: 'BOTH',
      topN: 8,
      windowDays: 7,
      pins: [{ menuItemId: ids['Latte'], label: 'Món mới' }],
      hidden: [ids['Nước suối']],
    });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.ok(s.body.top.length > 0, 'đã có đơn đã thu trong 7 ngày');
    let menu = (await api.get('/api/menu')).body;
    assert.deepEqual(menu.suggested[0], { menuItemId: ids['Latte'], label: 'Món mới', kind: 'PINNED' });
    assert.ok(menu.suggested.slice(1).every((x) => x.kind === 'AUTO' && x.label === 'Bán chạy'));
    assert.ok(!menu.suggested.some((x) => x.menuItemId === ids['Nước suối']));
    await adminApi('patch', `/api/admin/menu-items/${ids['Latte']}/availability`, { isAvailable: false });
    menu = (await api.get('/api/menu')).body;
    assert.ok(!menu.suggested.some((x) => x.menuItemId === ids['Latte']));
    await adminApi('patch', `/api/admin/menu-items/${ids['Latte']}/availability`, { isAvailable: true });
    await adminApi('put', '/api/admin/suggestions', { mode: 'PINNED', pins: [{ menuItemId: ids['Latte'] }], hidden: [] });
    menu = (await api.get('/api/menu')).body;
    assert.deepEqual(menu.suggested, [{ menuItemId: ids['Latte'], label: 'Quán gợi ý', kind: 'PINNED' }]);
  });
});

describe('Công tắc nhận đơn + giờ bán (F-020)', () => {
  test('tắt nhận đơn QR → khách 503 STORE_CLOSED + realtime; quầy vẫn bán mang đi; bật lại', async () => {
    const guest = await app.connect({});
    const evt = app.waitFor(guest, 'store.status_changed', (p) => p.acceptingOrders === false);
    const off = await api.put('/api/store').set(auth(staff)).send({ acceptingOrders: false });
    assert.equal(off.body.acceptingOrders, false);
    await evt;
    const C = await app.customer();
    const s = await app.seat(C, '02');
    const r = await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] });
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'STORE_CLOSED');
    assert.equal((await api.get('/api/menu')).body.store.acceptingOrders, false);
    assert.equal((await takeaway([{ menuItemId: ids['Nước suối'], quantity: 1 }])).status, 201);
    await api.put('/api/store').set(auth(staff)).send({ acceptingOrders: true });
    assert.equal((await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] })).status, 201);
  });

  test('danh mục ngoài giờ bán: khách không thấy + không đặt được; quầy vẫn thấy', async () => {
    const cat = (await api.get('/api/admin/categories').set(auth(admin))).body.find((c) => c.name.startsWith('Trà'));
    const bad = await adminApi('put', `/api/admin/categories/${cat.categoryId}`, { name: cat.name, sortOrder: cat.sortOrder, sellFrom: '08:00' });
    assert.equal(bad.status, 400);
    const r = await adminApi('put', `/api/admin/categories/${cat.categoryId}`, {
      name: cat.name,
      sortOrder: cat.sortOrder,
      sellFrom: vnHourFromNow(2),
      sellTo: vnHourFromNow(3),
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(!(await api.get('/api/menu')).body.categories.some((c) => c.id === cat.categoryId));
    assert.ok((await api.get('/api/menu').set(auth(staff))).body.categories.some((c) => c.id === cat.categoryId));
    const C = await app.customer();
    const s = await app.seat(C, '01');
    const o = await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Trà đào'], quantity: 1 }] });
    assert.equal(o.status, 409);
    assert.match(o.body.message, /ngoài giờ bán/);
    await adminApi('put', `/api/admin/categories/${cat.categoryId}`, { name: cat.name, sortOrder: cat.sortOrder, sellFrom: null, sellTo: null });
    assert.ok((await api.get('/api/menu')).body.categories.some((c) => c.id === cat.categoryId));
  });
});

describe('Gọi nhân viên (F-021)', () => {
  test('khách gọi → quầy nhận realtime; gọi lại < 60 giây → 429; phiên khác 403; quầy xử lý → khách nhận báo', async () => {
    const C = await app.customer();
    const s = await app.seat(C, '06');
    const D = await app.customer();
    const staffSock = await app.connect({ auth: { token: staff } });
    const cSock = await app.connect({ auth: { sessionId: s }, extraHeaders: { cookie: C.cookie } });
    const evt = app.waitFor(staffSock, 'session.staff_called', (p) => p.sessionId === s);
    const r = await C.post(`/api/sessions/${s}/call-staff`, { message: 'Xin nước lọc' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const p = await evt;
    assert.equal(p.message, 'Xin nước lọc');
    assert.equal(p.table.code, '06');
    const again = await C.post(`/api/sessions/${s}/call-staff`, { message: 'Nữa' });
    assert.equal(again.status, 429);
    assert.equal(again.body.code, 'TOO_SOON');
    assert.equal((await D.post(`/api/sessions/${s}/call-staff`, {})).status, 403);
    const open = await api.get('/api/staff-calls').set(auth(staff));
    assert.ok(open.body.some((c) => c.callId === r.body.callId));
    const handled = app.waitFor(cSock, 'session.staff_call_handled', (x) => x.callId === r.body.callId);
    const h = await api.post(`/api/staff-calls/${r.body.callId}/handle`).set(auth(staff));
    assert.equal(h.body.handledBy, 'Nhân viên quầy 1');
    await handled;
    assert.equal((await api.post(`/api/staff-calls/${r.body.callId}/handle`).set(auth(admin))).status, 409);
    assert.equal((await api.post('/api/staff-calls/1/handle')).status, 401);
  });
});
