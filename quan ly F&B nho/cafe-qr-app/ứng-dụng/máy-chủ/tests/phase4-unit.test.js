// Unit test (không DB) giai đoạn 4 — ADR-006: lịch thực đơn (F-040), thời gian chờ (F-025), chia khuyến mãi theo dòng (F-026).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVisibility, nextChangeAt, scheduleInEffect } from '../src/domain/menuSchedule.js';
import { etaRange, linesSeconds, parseItemsParam, standardSeconds } from '../src/domain/eta.js';
import { allocateOrderPromo, partOrders, settleTotals } from '../src/pricing/pricing.js';

/** 'YYYY-MM-DD HH:MM' giờ quán → Date. 17/10/2026 là thứ Bảy. */
const vn = (s) => new Date(Date.parse(`${s.replace(' ', 'T')}:00Z`) - 7 * 3600e3);
const bread = { id: 1, categoryId: 10 };
const tea = { id: 2, categoryId: 11 };
const sched = (o) => ({ isActive: true, daysOfWeekMask: 127, startDate: null, endDate: null, startTime: null, endTime: null, targets: [], ...o });

describe('Lịch thực đơn (F-040)', () => {
  test('lịch sáng 05:30–10:00 cho Bánh mì: 06:00 thấy, 11:00 không; món không thuộc lịch nào luôn thấy', () => {
    const s = [sched({ startTime: '05:30', endTime: '10:00', targets: [{ menuItemId: 1, mode: 'SHOW' }] })];
    assert.equal(buildVisibility(s, vn('2026-10-17 06:00'))(bread), true);
    assert.equal(buildVisibility(s, vn('2026-10-17 11:00'))(bread), false);
    assert.equal(buildVisibility(s, vn('2026-10-17 11:00'))(tea), true);
  });

  test('lịch theo mùa 01/12–31/12 (cả danh mục): ngoài khoảng ẩn, trong khoảng thấy', () => {
    const s = [sched({ startDate: '2026-12-01', endDate: '2026-12-31', targets: [{ categoryId: 11, mode: 'SHOW' }] })];
    assert.equal(buildVisibility(s, vn('2026-11-30 12:00'))(tea), false);
    assert.equal(buildVisibility(s, vn('2026-12-24 12:00'))(tea), true);
    assert.equal(buildVisibility(s, vn('2027-01-01 00:00'))(tea), false);
  });

  test('vừa SHOW (lịch A) vừa HIDE (lịch B) đang hiệu lực → ẩn; HIDE hết hiệu lực → thấy lại', () => {
    const s = [
      sched({ targets: [{ menuItemId: 1, mode: 'SHOW' }] }),
      sched({ startTime: '14:00', endTime: '17:00', targets: [{ menuItemId: 1, mode: 'HIDE' }] }),
    ];
    assert.equal(buildVisibility(s, vn('2026-10-17 15:00'))(bread), false);
    assert.equal(buildVisibility(s, vn('2026-10-17 18:00'))(bread), true);
  });

  test('thứ trong tuần (bit0 = CN), khung qua nửa đêm, lịch tắt bị bỏ qua', () => {
    const weekend = sched({ daysOfWeekMask: 0b1000001, targets: [{ menuItemId: 1, mode: 'SHOW' }] });
    assert.equal(scheduleInEffect(weekend, vn('2026-10-17 09:00')), true); // thứ Bảy
    assert.equal(scheduleInEffect(weekend, vn('2026-10-19 09:00')), false); // thứ Hai
    assert.equal(scheduleInEffect(sched({ startTime: '22:00', endTime: '02:00' }), vn('2026-10-17 01:00')), true);
    assert.equal(buildVisibility([{ ...weekend, isActive: false }], vn('2026-10-19 09:00'))(bread), true);
  });

  test('nextChangeAt: mốc đổi trạng thái gần nhất (để menu khách tự tải lại)', () => {
    const s = [sched({ startTime: '05:30', endTime: '10:00', targets: [{ menuItemId: 1, mode: 'SHOW' }] })];
    assert.equal(nextChangeAt(s, vn('2026-10-17 06:00')), vn('2026-10-17 10:00').toISOString());
    assert.equal(nextChangeAt(s, vn('2026-10-17 11:00')), vn('2026-10-18 05:30').toISOString());
    assert.equal(nextChangeAt([], vn('2026-10-17 11:00')), null);
  });
});

describe('Thời gian chờ (F-025)', () => {
  const items = new Map([
    [1, { itemType: 'SINGLE', prepSeconds: 60 }],
    [2, { itemType: 'SINGLE', medianSeconds: 240, sampleCount: 5 }],
    [3, { itemType: 'SINGLE', medianSeconds: 999, sampleCount: 1 }],
    [9, { itemType: 'COMBO', components: [{ menuItemId: 1, quantity: 2 }] }],
  ]);

  test('thời gian chuẩn: quản lý nhập > trung vị đủ mẫu > mặc định 180 s; combo theo thành phần', () => {
    assert.equal(standardSeconds(items.get(1)), 60);
    assert.equal(standardSeconds(items.get(2)), 240);
    assert.equal(standardSeconds(items.get(3)), 180);
    assert.equal(standardSeconds(undefined), 180);
    assert.equal(linesSeconds([{ menuItemId: 9, quantity: 2 }], items), 4 * 60);
  });

  test('hàng chờ 0 → ETA = base + giỏ; parallelism 2 → phần hàng chờ giảm một nửa; khoảng ±25 %', () => {
    const empty = etaRange({ baseSeconds: 120, queueSeconds: 0, cartSeconds: 180 });
    assert.equal(empty.etaSeconds, 300);
    assert.deepEqual([empty.minMinutes, empty.maxMinutes], [3, 7]);
    const one = etaRange({ baseSeconds: 120, queueSeconds: 1200, cartSeconds: 0, parallelism: 1 });
    const two = etaRange({ baseSeconds: 120, queueSeconds: 1200, cartSeconds: 0, parallelism: 2 });
    assert.equal(one.etaSeconds - 120, 2 * (two.etaSeconds - 120));
  });

  test('tham số items "12:2,15:1": bỏ phần sai, tối đa 30 dòng', () => {
    assert.deepEqual(parseItemsParam('12:2,x:1,15:1,7:0,8:99'), [
      { menuItemId: 12, quantity: 2 },
      { menuItemId: 15, quantity: 1 },
    ]);
    assert.equal(parseItemsParam(Array.from({ length: 40 }, (_, i) => `${i + 1}:1`).join(',')).length, 30);
  });
});

describe('Chia khuyến mãi đơn theo dòng (F-026)', () => {
  test('tổng phân bổ đúng bằng khuyến mãi, phần dư cho phần lẻ lớn nhất', () => {
    assert.deepEqual(allocateOrderPromo([29000, 25000, 10000], 6400), [2900, 2500, 1000]);
    const a = allocateOrderPromo([10000, 10000, 10000], 1000);
    assert.equal(
      a.reduce((s, x) => s + x, 0),
      1000,
    );
    assert.deepEqual(a, [334, 333, 333]);
    assert.deepEqual(allocateOrderPromo([5000, 0], 0), [0, 0]);
  });

  test('chia hai phần: Σ hai phần = tổng đơn; mỗi phần đưa vào settleTotals riêng (hội viên chỉ phần có hội viên)', () => {
    const orders = [
      {
        orderPromoDiscount: 6400,
        lines: [
          { id: 'a1', lineTotal: 29000, listTotal: 29000, allowMemberStack: true },
          { id: 'b1', lineTotal: 25000, listTotal: 25000, allowMemberStack: true },
          { id: 'a2', lineTotal: 10000, listTotal: 10000, allowMemberStack: true },
        ],
      },
    ];
    const A = partOrders(orders, (l) => l.id.startsWith('a'));
    const B = partOrders(orders, (l) => l.id.startsWith('b'));
    assert.equal(A.linesTotal - A.promoAlloc + (B.linesTotal - B.promoAlloc), 64000 - 6400);
    const ta = settleTotals({ orders: A.orders, member: null, settings: { roundTo: 1 } });
    const tb = settleTotals({ orders: B.orders, member: { discountPercent: 10, tierName: 'VIP' }, settings: { roundTo: 1 } });
    assert.equal(ta.memberDiscount, 0);
    assert.equal(ta.amountDue, 39000 - 3900);
    assert.equal(tb.memberDiscount, Math.round(22500 * 0.1));
    assert.equal(partOrders(orders, () => false).orders.length, 0);
  });
});
