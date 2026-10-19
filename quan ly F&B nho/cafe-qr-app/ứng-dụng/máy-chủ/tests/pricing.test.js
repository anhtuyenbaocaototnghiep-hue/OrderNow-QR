// Unit test bộ tính giá dùng chung (ADR-005 D-7, D-8, D-10, D-13, D-14) — module thuần, không cần DB.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bestItemPromotion,
  inTimeWindow,
  isPromotionActive,
  manualNeedsApproval,
  priceOrder,
  PricingError,
  settleTotals,
  toMinutes,
  toSpLines,
  vnClock,
} from '../src/pricing/pricing.js';

// 15:00 giờ VN thứ Năm 15/10/2026 = 08:00 UTC
const at = (vnIso) => new Date(Date.parse(`${vnIso}+07:00`));
const THU_15H = at('2026-10-15T15:00:00');

function catalog() {
  const items = new Map(
    [
      { id: 1, name: 'Cà phê sữa', price: 29000, itemType: 'SINGLE', categoryId: 10, groupIds: [100, 200], components: [] },
      { id: 2, name: 'Trà đào', price: 35000, itemType: 'SINGLE', categoryId: 20, groupIds: [], components: [] },
      { id: 3, name: 'Bánh', price: 25000, itemType: 'SINGLE', categoryId: 30, groupIds: [], components: [] },
      {
        id: 9,
        name: 'Combo sáng',
        price: 49000,
        itemType: 'COMBO',
        categoryId: null,
        groupIds: [],
        components: [
          { menuItemId: 1, name: 'Cà phê sữa', quantity: 1 },
          { menuItemId: 3, name: 'Bánh', quantity: 1 },
        ],
      },
    ].map((i) => [i.id, i]),
  );
  const groups = new Map([
    [100, { id: 100, name: 'Size', minSelect: 1, maxSelect: 1, sortOrder: 1 }],
    [200, { id: 200, name: 'Topping', minSelect: 0, maxSelect: 2, sortOrder: 2 }],
  ]);
  const options = new Map(
    [
      { id: 101, groupId: 100, name: 'Size M', priceDelta: 0, sortOrder: 1 },
      { id: 102, groupId: 100, name: 'Size L', priceDelta: 5000, sortOrder: 2 },
      { id: 201, groupId: 200, name: 'Thạch', priceDelta: 3000, sortOrder: 1 },
      { id: 202, groupId: 200, name: 'Trân châu', priceDelta: 4000, sortOrder: 2 },
      { id: 203, groupId: 200, name: 'Kem', priceDelta: 6000, sortOrder: 3 },
    ].map((o) => [o.id, o]),
  );
  return { items, groups, options, sellHours: new Map() };
}

const promo = (p) => ({
  promotionId: p.promotionId ?? 1,
  name: p.name ?? 'KM',
  type: p.type ?? 'ITEM_PRICE',
  value: p.value ?? 25000,
  minOrderAmount: p.minOrderAmount ?? 0,
  startDate: p.startDate ?? '2026-10-01',
  endDate: p.endDate ?? '2026-10-31',
  daysOfWeekMask: p.daysOfWeekMask ?? 127,
  startTime: p.startTime ?? null,
  endTime: p.endTime ?? null,
  stackWithMember: p.stackWithMember ?? false,
  isActive: p.isActive ?? true,
  exhausted: p.exhausted ?? false,
  itemIds: p.itemIds ?? [],
  categoryIds: p.categoryIds ?? [],
});

describe('Giờ quán & lịch khuyến mãi', () => {
  test('vnClock quy đổi UTC+7; khung giờ thường và qua nửa đêm', () => {
    assert.deepEqual(vnClock(THU_15H), { date: '2026-10-15', dow: 4, minutes: 900 });
    assert.equal(toMinutes('14:30'), 870);
    assert.equal(inTimeWindow(840, 1020, 900), true);
    assert.equal(inTimeWindow(840, 1020, 1020), false, '17:00 không còn trong [14:00, 17:00)');
    assert.equal(inTimeWindow(1320, 120, 60), true, '01:00 trong khung 22:00–02:00');
    assert.equal(inTimeWindow(1320, 120, 600), false);
    assert.equal(inTimeWindow(null, null, 600), true);
  });

  test('happy hour 14–17h: 15:00 có hiệu lực, 17:01 hết; ngoài ngày / sai thứ / tắt → không', () => {
    const hh = promo({ startTime: '14:00', endTime: '17:00' });
    assert.equal(isPromotionActive(hh, THU_15H), true);
    assert.equal(isPromotionActive(hh, at('2026-10-15T17:01:00')), false);
    assert.equal(isPromotionActive(hh, at('2026-11-01T15:00:00')), false);
    assert.equal(isPromotionActive({ ...hh, daysOfWeekMask: 1 }, THU_15H), false, 'chỉ Chủ nhật');
    assert.equal(isPromotionActive({ ...hh, daysOfWeekMask: 1 << 4 }, THU_15H), true, 'thứ Năm = bit4');
    assert.equal(isPromotionActive({ ...hh, isActive: false }, THU_15H), false);
  });
});

describe('priceOrder — khuyến mãi dòng, combo, tùy chọn, khuyến mãi đơn', () => {
  test('giá đặc biệt: nhiều khuyến mãi cùng món → giá thấp nhất thắng; theo danh mục; hết lượt bị bỏ qua', () => {
    const c = catalog();
    const p1 = promo({ promotionId: 1, value: 30000, categoryIds: [20] });
    const p2 = promo({ promotionId: 2, value: 25000, itemIds: [2] });
    const p3 = promo({ promotionId: 3, value: 20000, itemIds: [2], exhausted: true });
    const r = priceOrder([{ menuItemId: 2, quantity: 2 }], c, [p1, p2, p3], THU_15H);
    assert.equal(r.lines[0].unitPrice, 25000);
    assert.equal(r.lines[0].promotionId, 2);
    assert.equal(r.lines[0].lineDiscount, 20000);
    assert.equal(r.subtotal, 70000);
    assert.equal(r.total, 50000);
    assert.equal(r.lines[0].allowMemberStack, false, 'StackWithMember = 0');
    assert.equal(bestItemPromotion(c.items.get(2), [promo({ value: 40000, itemIds: [2] })], THU_15H), null, 'giá KM ≥ giá gốc → bỏ');
  });

  test('combo: không nhận ITEM_PRICE, sinh dòng con theo số lượng; tùy chọn trên combo → lỗi', () => {
    const c = catalog();
    const r = priceOrder([{ menuItemId: 9, quantity: 2 }], c, [promo({ value: 1000, itemIds: [9] })], THU_15H);
    assert.equal(r.lines[0].unitPrice, 49000);
    assert.equal(r.lines[0].promotionId, null);
    assert.deepEqual(
      r.lines[0].children.map((x) => [x.menuItemId, x.quantity]),
      [
        [1, 2],
        [3, 2],
      ],
    );
    const { rows } = toSpLines(r);
    assert.deepEqual(
      rows.map((x) => [x.lineNum, x.parentLineNum, x.menuItemId, x.unitPrice]),
      [
        [1, null, 9, 49000],
        [2, 1, 1, 0],
        [3, 1, 3, 0],
      ],
    );
    assert.throws(() => priceOrder([{ menuItemId: 9, quantity: 1, optionIds: [101] }], c, [], THU_15H), PricingError);
  });

  test('tùy chọn: Size L +5k, topping cộng dồn; thiếu nhóm bắt buộc / quá tối đa / tùy chọn lạ → INVALID_OPTIONS', () => {
    const c = catalog();
    const r = priceOrder([{ menuItemId: 1, quantity: 2, optionIds: [102, 201, 202] }], c, [], THU_15H);
    assert.equal(r.lines[0].listPrice, 29000 + 5000 + 3000 + 4000);
    assert.equal(r.total, 2 * 41000);
    assert.deepEqual(
      r.lines[0].options.map((o) => o.name),
      ['Size L', 'Thạch', 'Trân châu'],
    );
    const err = (opts) =>
      assert.throws(
        () => priceOrder([{ menuItemId: 1, quantity: 1, optionIds: opts }], c, [], THU_15H),
        (e) => e.code === 'INVALID_OPTIONS',
      );
    err([]);
    err([101, 102]);
    err([101, 201, 202, 203]);
    err([101, 999]);
    assert.throws(
      () => priceOrder([{ menuItemId: 2, quantity: 1, optionIds: [101] }], c, [], THU_15H),
      (e) => e.code === 'INVALID_OPTIONS',
    );
  });

  test('khuyến mãi dòng + phụ thu: giá KM áp lên giá món, phụ thu cộng sau', () => {
    const r = priceOrder([{ menuItemId: 1, quantity: 1, optionIds: [102] }], catalog(), [promo({ value: 25000, itemIds: [1] })], THU_15H);
    assert.equal(r.lines[0].listPrice, 34000);
    assert.equal(r.lines[0].unitPrice, 30000);
  });

  test('khuyến mãi đơn: phải đạt tối thiểu; lớn nhất thắng; không cộng dồn hội viên → mọi dòng không cộng dồn', () => {
    const c = catalog();
    const pct = promo({ promotionId: 5, type: 'ORDER_PERCENT', value: 10, minOrderAmount: 100000, stackWithMember: true });
    const amt = promo({ promotionId: 6, type: 'ORDER_AMOUNT', value: 15000, minOrderAmount: 100000 });
    const small = priceOrder([{ menuItemId: 2, quantity: 2 }], c, [pct, amt], THU_15H);
    assert.equal(small.orderPromotion, null, '70.000 < 100.000');
    const big = priceOrder([{ menuItemId: 2, quantity: 4 }], c, [pct, amt], THU_15H);
    assert.equal(big.orderPromotion.promotionId, 6, '15.000 > 10% × 140.000 = 14.000');
    assert.equal(big.total, 125000);
    assert.equal(big.promoDiscount, 15000);
    assert.ok(big.lines.every((l) => l.allowMemberStack === false));
    const bigger = priceOrder([{ menuItemId: 2, quantity: 6 }], c, [pct, amt], THU_15H);
    assert.equal(bigger.orderPromotion.promotionId, 5, '10% × 210.000 = 21.000 > 15.000');
    assert.ok(bigger.lines.every((l) => l.allowMemberStack === true));
  });

  test('món không có trong catalog → ITEM_UNAVAILABLE kèm id', () => {
    assert.throws(
      () => priceOrder([{ menuItemId: 77, quantity: 1 }], catalog(), [], THU_15H),
      (e) => e.code === 'ITEM_UNAVAILABLE' && e.details.menuItemIds[0] === 77,
    );
  });
});

describe('settleTotals — hội viên, giảm tay, làm tròn (D-7)', () => {
  const order = (lines, extra = {}) => {
    const total = lines.reduce((s, l) => s + l.lineTotal, 0) - (extra.orderPromoDiscount ?? 0);
    return {
      totalAmount: total,
      subtotalAmount: extra.subtotalAmount ?? total,
      promoDiscount: extra.promoDiscount ?? 0,
      orderPromoDiscount: 0,
      lines,
      ...extra,
    };
  };

  test('không giảm gì: bằng Σ đơn; đơn cũ (không SubtotalAmount) tính như cũ', () => {
    const t = settleTotals({
      orders: [order([{ lineTotal: 58000 }]), { totalAmount: 60000, subtotalAmount: null, promoDiscount: 0, lines: [{ lineTotal: 60000 }] }],
    });
    assert.equal(t.amountDue, 118000);
    assert.equal(t.subtotal, 118000);
    assert.equal(t.roundingAdj, 0);
    assert.deepEqual(
      t.breakdownLines.map((b) => b.key),
      ['subtotal', 'total'],
    );
  });

  test('hội viên 3% chỉ trên dòng cộng dồn; làm tròn xuống 500đ', () => {
    const t = settleTotals({
      orders: [order([{ lineTotal: 58000 }, { lineTotal: 25000, allowMemberStack: false }])],
      member: { tierName: 'Thành viên', discountPercent: 3, firstOrderDiscount: false },
    });
    assert.equal(t.memberDiscount, 1740);
    assert.equal(t.roundingAdj, (83000 - 1740) % 500);
    assert.equal(t.amountDue, 81000);
    assert.equal(t.amountDue % 500, 0);
    assert.equal(t.subtotal - t.promoDiscount - t.memberDiscount - t.manualDiscount - t.roundingAdj, t.amountDue);
  });

  test('đơn đầu −10% thay % hạng khi lớn hơn; VIP 12% > 10% thì giữ hạng', () => {
    const o = [order([{ lineTotal: 100000 }])];
    const first = settleTotals({
      orders: o,
      member: { tierName: 'Thành viên', discountPercent: 3, firstOrderDiscount: true },
      settings: { firstOrderPercent: 10 },
    });
    assert.equal(first.memberPercent, 10);
    assert.equal(first.firstOrderApplied, true);
    assert.equal(first.amountDue, 90000);
    const vip = settleTotals({ orders: o, member: { tierName: 'VIP', discountPercent: 12, firstOrderDiscount: true } });
    assert.equal(vip.memberPercent, 12);
    assert.equal(vip.firstOrderApplied, false);
  });

  test('khuyến mãi đơn chia tỉ lệ khỏi phần tính hội viên', () => {
    const o = {
      totalAmount: 90000,
      subtotalAmount: 100000,
      promoDiscount: 10000,
      orderPromoDiscount: 10000,
      lines: [{ lineTotal: 100000, allowMemberStack: true }],
    };
    const t = settleTotals({ orders: [o], member: { tierName: 'Thân thiết', discountPercent: 5, firstOrderDiscount: false } });
    assert.equal(t.memberDiscount, 4500, '5% × (100.000 − 10.000)');
    assert.equal(t.promoDiscount, 10000);
  });

  test('giảm tay theo số tiền / % (sau hội viên), không vượt số còn lại, không âm', () => {
    const o = [order([{ lineTotal: 50000 }])];
    assert.equal(settleTotals({ orders: o, manual: { kind: 'AMOUNT', value: 7000, reason: 'Khách quen' } }).amountDue, 43000);
    assert.equal(settleTotals({ orders: o, manual: { kind: 'PERCENT', value: 10, reason: 'x' } }).manualDiscount, 5000);
    const all = settleTotals({ orders: o, manual: { kind: 'AMOUNT', value: 999999, reason: 'x' } });
    assert.equal(all.manualDiscount, 50000);
    assert.equal(all.amountDue, 0);
  });

  test('ngưỡng giảm tay của nhân viên: vượt 10% hoặc vượt 20.000đ → cần quản lý duyệt', () => {
    const s = { staffMaxPercent: 10, staffMaxAmount: 20000 };
    assert.equal(manualNeedsApproval(0, 100000, s), false);
    assert.equal(manualNeedsApproval(10000, 100000, s), false);
    assert.equal(manualNeedsApproval(10001, 100000, s), true);
    assert.equal(manualNeedsApproval(20000, 500000, s), false);
    assert.equal(manualNeedsApproval(20001, 500000, s), true);
  });
});
