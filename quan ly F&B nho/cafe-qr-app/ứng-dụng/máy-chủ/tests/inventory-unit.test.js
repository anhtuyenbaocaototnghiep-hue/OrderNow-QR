// Unit test (không DB) giai đoạn 5 — ADR-006: quy đổi đơn vị (F-031), vòng lặp công thức (F-027), thất thoát (F-032), dự báo (F-029).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRecipeGraph, factorToBase, lossAnalysis, nextDeliveryDate, replenishment, wmaForecast } from '../src/domain/inventory.js';

const units = new Map([
  ['ml', {}],
  ['g', {}],
  ['l', { baseUnitCode: 'ml', factor: 1000 }],
  ['kg', { baseUnitCode: 'g', factor: 1000 }],
  ['lon', { baseUnitCode: 'ml', factor: 330 }],
  ['thùng', { baseUnitCode: 'lon', factor: 24 }],
]);

describe('Đơn vị (F-031)', () => {
  test('thùng → lon → ml = 24 × 330; lon khi gốc là lon = 1; không quy được → null', () => {
    assert.equal(factorToBase('thùng', 'ml', units), 7920);
    assert.equal(factorToBase('thùng', 'lon', units), 24);
    assert.equal(factorToBase('kg', 'g', units), 1000);
    assert.equal(factorToBase('ml', 'ml', units), 1);
    assert.equal(factorToBase('lon', 'g', units), null);
  });
});

describe('Công thức sơ chế (F-027)', () => {
  test('A dùng B dùng A → vòng lặp; lồng 4 cấp → quá sâu; 3 cấp → hợp lệ', () => {
    assert.equal(
      checkRecipeGraph(
        1,
        new Map([
          [1, [2]],
          [2, [1]],
        ]),
      ).error,
      'RECIPE_CYCLE',
    );
    const deep = new Map([
      [1, [2]],
      [2, [3]],
      [3, [4]],
      [4, [5]],
    ]);
    assert.equal(checkRecipeGraph(1, deep).error, 'RECIPE_TOO_DEEP');
    const ok = new Map([
      [1, [2, 9]],
      [2, [3]],
      [3, [8]],
    ]);
    assert.deepEqual(checkRecipeGraph(1, ok), { ok: true });
  });
});

describe('Hao hụt định mức (F-032)', () => {
  test('định mức 5 %, tiêu thụ 1.000: thiếu 40 → bình thường; thiếu 120 → thất thoát 70, tô đỏ', () => {
    const a = lossAnalysis({ consumption: 1000, wastePercent: 5, loggedWaste: 0, stocktakeShortage: 40 });
    assert.equal(a.abnormal, 0);
    assert.equal(a.flagged, false);
    const b = lossAnalysis({ consumption: 1000, wastePercent: 5, loggedWaste: 0, stocktakeShortage: 120 });
    assert.equal(b.abnormal, 70);
    assert.equal(b.flagged, true);
    // Hủy đã ghi không bị tính là thất thoát
    const c = lossAnalysis({ consumption: 1000, wastePercent: 5, loggedWaste: 30, stocktakeShortage: 40 });
    assert.equal(c.gap, 70);
    assert.equal(c.abnormal, 0);
  });
});

describe('Dự báo nhập hàng (F-029)', () => {
  test('WMA 4 tuần 0,4/0,3/0,2/0,1; bỏ tuần quán đóng cửa; × (1 + hao hụt); không dữ liệu → samples 0', () => {
    assert.deepEqual(wmaForecast([10, 20, 30, 40]), { qty: 20, samples: 4 });
    assert.deepEqual(wmaForecast([10, 20, 30, 40], 5), { qty: 21, samples: 4 });
    assert.deepEqual(wmaForecast([100, null, null, null]), { qty: 100, samples: 1 });
    assert.deepEqual(wmaForecast([null, null, null, null]), { qty: 0, samples: 0 });
  });

  test('tồn 1.000, nhu cầu 3 ngày 1.500 → đề xuất 500 + an toàn 300; có 800 đang về → giảm tương ứng; quy ra gói; ngày dự kiến hết', () => {
    const daily = [
      { date: '2026-10-18', qty: 500 },
      { date: '2026-10-19', qty: 500 },
      { date: '2026-10-20', qty: 500 },
      { date: '2026-10-21', qty: 500 },
    ];
    const r = replenishment({ daily, horizonDays: 3, available: 1000, incoming: 0, packSize: 1000, deliveryDate: '2026-10-21' });
    assert.equal(r.demand, 1500);
    assert.equal(r.suggestBase, 800);
    assert.equal(r.suggestPacks, 1);
    assert.equal(r.runOutDate, '2026-10-20');
    assert.equal(r.runsOutBeforeDelivery, true);
    assert.equal(replenishment({ daily, horizonDays: 3, available: 1000, incoming: 800, packSize: 1000 }).suggestBase, 0);
  });

  test('ngày giao kế tiếp theo lịch giao trong tuần (bit0 = CN)', () => {
    // 17/10/2026 thứ Bảy; chỉ giao thứ Hai (bit1) → 19/10
    assert.equal(nextDeliveryDate('2026-10-17', 0b0000010, 1), '2026-10-19');
    assert.equal(nextDeliveryDate('2026-10-17', 127, 1), '2026-10-18');
  });
});
