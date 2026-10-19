// Logic kho thuần (không DB) giai đoạn 5 — ADR-006: quy đổi đơn vị (F-031), vòng lặp công thức sơ chế (F-027),
// thất thoát bất thường (F-032), dự báo WMA + đề xuất nhập (F-029). Test: tests/inventory-unit.test.js.

/**
 * Hệ số quy đổi 1 `unitCode` → đơn vị gốc `baseCode` theo chuỗi Units (thùng → lon → ml). null nếu không quy về được.
 * units: Map(code → { baseUnitCode, factor })
 */
export function factorToBase(unitCode, baseCode, units) {
  let code = unitCode;
  let factor = 1;
  for (let hop = 0; hop < 10; hop++) {
    if (code === baseCode) return factor;
    const u = units.get(code);
    if (!u?.baseUnitCode) return null;
    factor *= Number(u.factor);
    code = u.baseUnitCode;
  }
  return null;
}

/**
 * Công thức sơ chế (F-027, D-19): lồng tối đa 3 cấp, cấm vòng.
 * recipes: Map(semiId → [inputId…]) — gồm cả công thức đang sửa. Trả { ok } | { error: 'RECIPE_CYCLE' | 'RECIPE_TOO_DEEP', path }.
 */
export function checkRecipeGraph(rootId, recipes, maxDepth = 3) {
  const walk = (id, depth, path) => {
    const inputs = recipes.get(id) ?? [];
    if (!inputs.length) return null;
    if (depth > maxDepth) return { error: 'RECIPE_TOO_DEEP', path };
    for (const input of inputs) {
      if (path.includes(input)) return { error: 'RECIPE_CYCLE', path: [...path, input] };
      const r = walk(input, depth + 1, [...path, input]);
      if (r) return r;
    }
    return null;
  };
  return walk(rootId, 1, [rootId]) ?? { ok: true };
}

/**
 * Thất thoát bất thường (F-032): chênh lệch so với lý thuyết = hụt kiểm kê + hủy đã ghi;
 * bất thường = chênh lệch − định mức − hủy đã ghi (= hụt kiểm kê − định mức); tô đỏ khi > 0 và > 2 % tiêu thụ.
 */
export function lossAnalysis({ consumption, wastePercent, loggedWaste, stocktakeShortage }) {
  const standard = (consumption * Number(wastePercent || 0)) / 100;
  const gap = stocktakeShortage + loggedWaste;
  const abnormal = Math.max(0, gap - standard - loggedWaste);
  return {
    standard: round3(standard),
    gap: round3(gap),
    abnormal: round3(abnormal),
    flagged: abnormal > 0 && abnormal > consumption * 0.02,
  };
}

const round3 = (n) => Math.round(n * 1000) / 1000;
export const WEIGHTS = [0.4, 0.3, 0.2, 0.1];

/**
 * Dự báo một ngày (D-22): trung bình trượt có trọng số 4 tuần cùng thứ (gần nhất 0,4 … xa nhất 0,1), bỏ tuần quán đóng cửa
 * (chuẩn hóa lại trọng số), × (1 + hao hụt định mức). sameWeekday: [tuần gần nhất, …] — null = quán đóng / không có dữ liệu.
 * → { qty, samples } (samples = 0 → không đủ dữ liệu).
 */
export function wmaForecast(sameWeekday, wastePercent = 0, weights = WEIGHTS) {
  let sum = 0;
  let wsum = 0;
  let samples = 0;
  sameWeekday.slice(0, weights.length).forEach((v, i) => {
    if (v === null || v === undefined) return;
    sum += v * weights[i];
    wsum += weights[i];
    samples++;
  });
  if (!wsum) return { qty: 0, samples: 0 };
  return { qty: round3((sum / wsum) * (1 + Number(wastePercent || 0) / 100)), samples };
}

/**
 * Đề xuất nhập (F-029): nhu cầu đến ngày giao kế tiếp + lead time, tồn an toàn % nhu cầu.
 * suggest = max(0, nhu cầu + an toàn − khả dụng − đang về), quy ra số gói (làm tròn lên).
 * daily: [{ date, qty }] dự báo từ hôm nay. → { demand, safety, suggestBase, suggestPacks, runOutDate, runsOutBeforeDelivery }
 */
export function replenishment({ daily, horizonDays, available, incoming, safetyPercent = 20, packSize = 1, deliveryDate }) {
  const window = daily.slice(0, Math.max(0, horizonDays));
  const demand = round3(window.reduce((s, d) => s + d.qty, 0));
  const safety = round3((demand * safetyPercent) / 100);
  const suggestBase = round3(Math.max(0, demand + safety - available - incoming));
  let left = available;
  let runOutDate = null;
  for (const d of daily) {
    left -= d.qty;
    if (left < 0) {
      runOutDate = d.date;
      break;
    }
  }
  return {
    demand,
    safety,
    suggestBase,
    suggestPacks: suggestBase > 0 ? Math.ceil(suggestBase / packSize - 1e-9) : 0,
    runOutDate,
    runsOutBeforeDelivery: Boolean(runOutDate && deliveryDate && runOutDate < deliveryDate),
  };
}

/** Ngày giao kế tiếp (> hôm nay) theo DeliveryDaysMask (bit0 = CN) — 'YYYY-MM-DD'. */
export function nextDeliveryDate(today, mask = 127, leadDays = 0) {
  const start = new Date(Date.parse(`${today}T00:00:00Z`) + Math.max(1, leadDays) * 86400000);
  for (let i = 0; i < 14; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    if (mask & (1 << d.getUTCDay())) return d.toISOString().slice(0, 10);
  }
  return start.toISOString().slice(0, 10);
}
