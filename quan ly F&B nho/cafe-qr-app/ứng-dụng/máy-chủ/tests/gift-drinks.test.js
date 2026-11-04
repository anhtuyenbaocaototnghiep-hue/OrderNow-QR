// F-070 — ly treo, mua tặng bạn một ly (ADR-028 D-112…D-118, BR-107). SQL Server thật.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, domain;

const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const q1 = async (text) => (await pool.request().query(text)).recordset;
const count = async (table, where = '1 = 1') => (await q1(`SELECT COUNT(*) AS n FROM dbo.${table} WHERE ${where}`))[0].n;
const today = todayVn();
const settings = (patch = {}) => call(admin, 'put', '/api/admin/gift-drinks', { enabled: true, validDays: 30, ...patch });
const sell = (body = {}) =>
  call(staff, 'post', '/api/gift-drinks', { menuItemId: ids['Cà phê sữa'], giverName: 'Lan', message: 'Chúc mừng sinh nhật!', method: 'CASH', ...body });
const quote = (items, extra = {}) => call(staff, 'post', '/api/orders/takeaway/quote', { items, ...extra });
const milk = (quantity = 1) => [{ menuItemId: ids['Cà phê sữa'], quantity }];
const price = async (name) => Number((await q1(`SELECT Price FROM dbo.MenuItems WHERE MenuItemId = ${ids[name]}`))[0].Price);
const openShift = () => call(staff, 'post', '/api/shifts/open', { openingCash: 0 });

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  domain = await import('../src/domain/giftDrink.js');
});

after(() => app?.close());

describe('Hàm thuần (F-070)', () => {
  test('AC-070-01 (unit): mã ly tặng 8 ký tự không có ký tự dễ nhầm; số trừ = min(đơn giá, max(đã trả, giá hiện tại))', () => {
    assert.equal(domain.giftCode([0, 1, 2, 3, 4, 5]), 'TBABCDEF');
    assert.equal(domain.giftCode([30, 31, 255, 100, 7, 62]), 'TB9AHHHA');
    for (let i = 0; i < 200; i += 1) {
      const code = domain.giftCode(Array.from({ length: 6 }, () => Math.floor(Math.random() * 256)));
      assert.match(code, /^TB[A-HJKMNP-Z2-9]{6}$/, code);
    }
    assert.equal(domain.giftDiscount({ unit: 29000, paid: 29000, currentPrice: 29000 }), 29000);
    assert.equal(domain.giftDiscount({ unit: 32000, paid: 29000, currentPrice: 32000 }), 32000, 'giá tăng → quán chịu, trừ đủ ly');
    assert.equal(domain.giftDiscount({ unit: 34000, paid: 29000, currentPrice: 29000 }), 29000, 'lên size L (+5.000đ) → người nhận trả phần chênh');
    assert.equal(domain.giftDiscount({ unit: 25000, paid: 29000, currentPrice: 25000 }), 25000, 'giá giảm → trừ đúng giá trên bill');
    const future = new Date(Date.now() + 86_400_000);
    assert.equal(domain.giftState({ expiresAt: future }), 'READY');
    assert.equal(domain.giftState({ expiresAt: future, usedAt: new Date() }), 'USED');
    assert.equal(domain.giftState({ expiresAt: new Date(Date.now() - 1000) }), 'EXPIRED');
    assert.equal(domain.giftState({ expiresAt: future, cancelledAt: new Date() }), 'CANCELLED');
    assert.equal(domain.validateSettings({ validDays: 30 }), null);
    assert.match(domain.validateSettings({ validDays: 0 }), /1 đến 365/);
  });
});

describe('Ly treo (F-070)', () => {
  test('AC-070-02: bán — tắt 409, chưa mở ca 409, combo / ngừng bán 400; voucher GIFT + token; tiền mặt vào sổ quỹ và chốt ca, chuyển khoản không; không lượt thu, không trừ kho', async () => {
    const off = await sell();
    assert.deepEqual([off.status, off.body.code], [409, 'GIFT_DISABLED'], 'mặc định tắt');
    assert.equal(ok(await call(staff, 'get', '/api/gift-drinks/config')).enabled, false);
    ok(await settings());
    const noShift = await sell();
    assert.deepEqual([noShift.status, noShift.body.code], [409, 'NO_OPEN_SHIFT']);
    ok(await openShift(), 201);

    const [{ MenuItemId: combo }] = await q1(
      "INSERT dbo.MenuItems (CategoryId, Name, Price, ItemType) OUTPUT inserted.MenuItemId VALUES (NULL, N'Combo thử', 45000, 'COMBO')",
    );
    assert.equal((await sell({ menuItemId: combo })).status, 400, 'combo');
    assert.equal((await sell({ menuItemId: 999999 })).status, 400, 'không có món');
    const cfg = ok(await call(staff, 'get', '/api/gift-drinks/config'));
    assert.ok(cfg.enabled && cfg.items.some((i) => i.name === 'Cà phê sữa') && !cfg.items.some((i) => i.menuItemId === combo));

    const before = { payments: await count('Payments'), inv: await count('InventoryTransactions') };
    const g = ok(await sell(), 201);
    const milkPrice = await price('Cà phê sữa');
    assert.match(g.code, /^TB[A-HJKMNP-Z2-9]{6}$/);
    assert.match(g.token, /^[0-9a-f]{32}$/);
    assert.ok(g.url.endsWith(`/qua/${g.token}`));
    assert.ok(g.qr.startsWith('data:image/png;base64,'));
    assert.deepEqual([g.amount, g.menuItemName, g.giverName, g.status, g.method], [milkPrice, 'Cà phê sữa', 'Lan', 'READY', 'CASH']);
    const [v] = await q1(`SELECT * FROM dbo.Vouchers WHERE Code = '${g.code}'`);
    assert.deepEqual([v.Source, v.MemberId, v.MenuItemId, Number(v.DiscountAmount)], ['GIFT', null, ids['Cà phê sữa'], milkPrice]);
    const end = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000 - 7 * 3_600_000);
    assert.equal(new Date(v.ExpiresAt).getTime(), end.getTime(), 'hết ngày thứ 30 (giờ quán)');
    const [cash] =
      await q1(`SELECT c.Direction, c.Amount, c.Status, cc.SystemCode FROM dbo.GiftDrinks g JOIN dbo.CashTransactions c ON c.CashTxnId = g.CashTxnId
      JOIN dbo.CashCategories cc ON cc.CategoryId = c.CategoryId WHERE g.GiftId = ${g.giftId}`);
    assert.deepEqual([cash.Direction.trim(), Number(cash.Amount), cash.Status, cash.SystemCode], ['IN', milkPrice, 'APPROVED', 'GIFT_SALE']);
    assert.deepEqual([await count('Payments'), await count('InventoryTransactions')], [before.payments, before.inv], 'không lượt thu, không trừ kho');

    const t = ok(await sell({ method: 'TRANSFER', giverName: null, message: null }), 201);
    assert.equal((await q1(`SELECT CashTxnId FROM dbo.GiftDrinks WHERE GiftId = ${t.giftId}`))[0].CashTxnId, null, 'chuyển khoản không vào két');

    // Chốt ca: tiền dự kiến = đầu ca (0) + tiền mặt bán ly tặng
    const shift = ok(await call(staff, 'get', '/api/shifts/current')).shift;
    const closed = ok(await call(staff, 'post', `/api/shifts/${shift.shiftId}/close`, { countedCash: milkPrice }));
    assert.deepEqual([Number(closed.expectedCash ?? closed.shift?.expectedCash), Number(closed.difference ?? closed.shift?.difference)], [milkPrice, 0]);
    ok(await openShift(), 201);
  });

  test('AC-070-03: nhận — kiểm mã trả gift; trừ đúng 1 ly; thiếu món 409; dùng rồi 409; hóa đơn "Ly tặng"; Lãi/lỗ cộng vào doanh thu, không vào giảm giá', async () => {
    const g = ok(await sell(), 201);
    const check = ok(await call(staff, 'post', '/api/vouchers/validate', { code: g.code.toLowerCase() }));
    assert.deepEqual([check.valid, check.voucher.source, check.gift.giverName, check.gift.menuItemName], [true, 'GIFT', 'Lan', 'Cà phê sữa']);
    const missing = await quote([{ menuItemId: ids['Cà phê đen'], quantity: 1 }], { voucherCode: g.code });
    assert.deepEqual([missing.status, missing.body.code], [409, 'VOUCHER_ITEM_NOT_IN_BILL']);
    const q = ok(await quote([...milk(2), { menuItemId: ids['Cà phê đen'], quantity: 1 }], { voucherCode: g.code })).totals;
    assert.equal(q.voucherDiscount, g.amount, 'trừ đúng 1 ly');
    assert.equal(q.breakdownLines.find((l) => l.key === 'voucher').label, 'Ly tặng — 1 Cà phê sữa');

    // Lãi/lỗ hôm nay trước / sau khi người nhận dùng ly
    const pnl = async () => ok(await call(admin, 'get', `/api/admin/reports/pnl?from=${today}&to=${today}`));
    const p0 = await pnl();
    const paid = ok(await call(staff, 'post', '/api/orders/takeaway', { items: milk(), voucherCode: g.code, amountReceived: 0 }), 201);
    assert.deepEqual([paid.totals.voucherDiscount, paid.totals.amountDue], [g.amount, 0], 'ly tặng không phải trả');
    const receipt = ok(await call(staff, 'get', `/api/orders/${paid.order.orderId}/receipt`));
    assert.match(receipt.breakdown.find((l) => l.key === 'voucher').label, /^Ly tặng TB/);
    const p1 = await pnl();
    assert.equal(p1.revenueNet - p0.revenueNet, g.amount, 'doanh thu thuần cộng ly tặng đã dùng');
    assert.equal(p1.discounts - p0.discounts, 0, 'không tính là giảm giá');
    assert.ok(p1.giftsOutstanding.count >= 1);

    const again = ok(await call(staff, 'post', '/api/vouchers/validate', { code: g.code }));
    assert.deepEqual([again.valid, again.code], [false, 'VOUCHER_USED']);
    assert.equal((await quote(milk(), { voucherCode: g.code })).status, 409);
  });

  test('AC-070-04: trang quà công khai — READY có mã; đã dùng / hết hạn / đã hủy không có mã; token sai 404', async () => {
    const g = ok(await sell({ giverName: 'Minh', message: 'Uống cho tỉnh nha' }), 201);
    const pub = ok(await api.get(`/api/gifts/${g.token}`));
    assert.deepEqual(
      [pub.status, pub.code, pub.giverName, pub.message, pub.menuItemName, Boolean(pub.shopName)],
      ['READY', g.code, 'Minh', 'Uống cho tỉnh nha', 'Cà phê sữa', true],
    );
    ok(await call(staff, 'post', '/api/orders/takeaway', { items: milk(), voucherCode: g.code, amountReceived: 0 }), 201);
    const used = ok(await api.get(`/api/gifts/${g.token}`));
    assert.deepEqual([used.status, used.code, Boolean(used.usedAt)], ['USED', null, true]);

    const e = ok(await sell(), 201);
    await pool.request().query(`UPDATE dbo.Vouchers SET ExpiresAt = DATEADD(MINUTE, -1, SYSUTCDATETIME()) WHERE Code = '${e.code}'`);
    assert.deepEqual([ok(await api.get(`/api/gifts/${e.token}`)).status, ok(await api.get(`/api/gifts/${e.token}`)).code], ['EXPIRED', null]);
    const expired = ok(await call(staff, 'post', '/api/vouchers/validate', { code: e.code }));
    assert.match(expired.message, /Ly tặng đã hết hạn/);

    assert.equal((await api.get(`/api/gifts/${'0'.repeat(32)}`)).status, 404);
    assert.equal((await api.get('/api/gifts/abc')).status, 404);
  });

  test('AC-070-05: quản lý — cài đặt sai 400, nhân viên 403; số liệu; gia hạn; hủy & hoàn tiền (sổ quỹ chi), đã dùng không hủy được', async () => {
    assert.equal((await call(staff, 'get', '/api/admin/gift-drinks')).status, 403);
    assert.equal((await settings({ validDays: 0 })).status, 400);
    const view = ok(await call(admin, 'get', '/api/admin/gift-drinks'));
    assert.ok(view.stats.sold >= 4 && view.stats.used >= 2, JSON.stringify(view.stats));
    assert.ok(view.stats.newCustomers >= 2, 'người nhận không gắn hội viên = khách mới');
    assert.ok(view.outstanding.count >= 1 && view.outstanding.amount > 0);
    assert.ok(view.items[0].code && view.items[0].menuItemName);

    // Gia hạn: còn hạn → cộng thêm số ngày; hết hạn → tính từ hôm nay
    const g = ok(await sell(), 201);
    const ext = ok(await call(admin, 'post', `/api/admin/gift-drinks/${g.giftId}/extend`, {}));
    assert.equal(new Date(ext.expiresAt).getTime() - new Date(g.expiresAt).getTime(), 30 * 86_400_000);

    // Hủy & hoàn tiền mặt → sổ quỹ chi "Hoàn ly tặng"; mã hết hiệu lực; hủy lần 2 / gia hạn → 409
    const c = ok(await call(admin, 'post', `/api/admin/gift-drinks/${g.giftId}/cancel`, {}));
    assert.equal(c.status, 'CANCELLED');
    const [refund] = await q1(`SELECT c.Direction, c.Amount, cc.SystemCode FROM dbo.GiftDrinks g JOIN dbo.CashTransactions c ON c.CashTxnId = g.RefundCashTxnId
      JOIN dbo.CashCategories cc ON cc.CategoryId = c.CategoryId WHERE g.GiftId = ${g.giftId}`);
    assert.deepEqual([refund.Direction.trim(), Number(refund.Amount), refund.SystemCode], ['OUT', g.amount, 'GIFT_REFUND']);
    assert.equal(ok(await call(staff, 'post', '/api/vouchers/validate', { code: g.code })).valid, false);
    assert.equal(ok(await api.get(`/api/gifts/${g.token}`)).status, 'CANCELLED');
    assert.equal((await call(admin, 'post', `/api/admin/gift-drinks/${g.giftId}/cancel`, {})).status, 409);
    assert.equal((await call(admin, 'post', `/api/admin/gift-drinks/${g.giftId}/extend`, {})).status, 409);

    const usedOne = view.items.find((x) => x.status === 'USED');
    const usedCancel = await call(admin, 'post', `/api/admin/gift-drinks/${usedOne.giftId}/cancel`, {});
    assert.deepEqual([usedCancel.status, usedCancel.body.code], [409, 'GIFT_USED']);
    // Danh mục hệ thống không hiện trong ô chọn tay của Sổ quỹ
    const cats = ok(await call(staff, 'get', '/api/cash-categories'));
    assert.ok(!cats.some((x) => /ly tặng/i.test(x.name)), JSON.stringify(cats));
  });
});
