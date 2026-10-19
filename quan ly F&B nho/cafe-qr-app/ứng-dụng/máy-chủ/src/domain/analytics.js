// Hàm thuần cho giai đoạn 8 (ADR-006): menu engineering (F-041, D-30), giờ cao điểm / dự báo doanh thu / so sánh kỳ / theo bàn (F-042).
import { median } from './eta.js';
import { WEIGHTS } from './inventory.js';

export const MIN_QTY = 5;

export const CLASS_ADVICE = {
  STAR: 'Giữ giá, ưu tiên gợi ý / ghim món',
  PLOWHORSE: 'Bán chạy nhưng lãi thấp — xem lại định lượng (BOM) hoặc tăng giá nhẹ',
  PUZZLE: 'Lãi cao nhưng bán ít — đẩy khuyến mãi, ghim món, gợi ý bán kèm',
  DOG: 'Bán ít, lãi thấp — cân nhắc bỏ món hoặc gộp vào combo',
  INSUFFICIENT: 'Chưa đủ dữ liệu (bán dưới 5 lần trong kỳ)',
};

/**
 * Phân loại D-30 theo trung vị số lượng và trung vị lãi gộp / món của các món đủ dữ liệu (≥ minQty).
 * items: [{ menuItemId, qty, revenue, cogs }] → thêm margin, marginPerUnit, share, class, advice; trả { items, medianQty, medianMarginPerUnit }.
 */
export function classifyMenu(items, { minQty = MIN_QTY } = {}) {
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const rows = items.map((i) => {
    const margin = i.revenue - i.cogs;
    return { ...i, margin, marginPerUnit: i.qty > 0 ? Math.round(margin / i.qty) : 0, share: totalQty > 0 ? Math.round((i.qty / totalQty) * 10000) / 100 : 0 };
  });
  const enough = rows.filter((r) => r.qty >= minQty);
  const medianQty = enough.length ? median(enough.map((r) => r.qty)) : null;
  const medianMarginPerUnit = enough.length ? median(enough.map((r) => r.marginPerUnit)) : null;
  for (const r of rows) {
    if (r.qty < minQty || medianQty === null) r.class = 'INSUFFICIENT';
    else {
      const popular = r.qty >= medianQty;
      const profitable = r.marginPerUnit >= medianMarginPerUnit;
      r.class = popular && profitable ? 'STAR' : popular ? 'PLOWHORSE' : profitable ? 'PUZZLE' : 'DOG';
    }
    r.advice = CLASS_ADVICE[r.class];
  }
  return { items: rows.sort((a, b) => b.qty - a.qty || b.margin - a.margin), medianQty, medianMarginPerUnit };
}

/** 'YYYY-MM-DD' → thứ (0 = Thứ Hai … 6 = Chủ nhật). */
export const weekdayIndex = (date) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/** Ma trận 7 × 24 (Thứ Hai → Chủ nhật × 0–23 giờ quán). rows: [{ date, hour, value }]. Trả { matrix, max }. */
export function heatmapMatrix(rows) {
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of rows) matrix[weekdayIndex(r.date)][r.hour] += r.value;
  return { matrix, max: Math.max(0, ...matrix.flat()) };
}

const stdDev = (values) => {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1));
};

/**
 * Dự báo doanh thu (F-042, cùng cách D-22): mỗi ngày tới = trung bình có trọng số 4 cùng thứ gần nhất (0,4 · 0,3 · 0,2 · 0,1),
 * khoảng ± 1 độ lệch chuẩn của các mẫu. daily: Map 'YYYY-MM-DD' → doanh thu (ngày không bán = 0, ngày chưa mở bán = không có).
 * → [{ date, forecast, low, high, samples }]
 */
export function revenueForecast(daily, today, days = 7, addDays) {
  const out = [];
  for (let k = 0; k < days; k += 1) {
    const date = addDays(today, k);
    const samples = [];
    for (let w = 1; w <= WEIGHTS.length; w += 1) {
      const d = addDays(date, -7 * w);
      if (d < today && daily.has(d)) samples.push(daily.get(d));
      else if (d < today) samples.push(null);
    }
    let sum = 0;
    let wsum = 0;
    samples.forEach((v, i) => {
      if (v === null) return;
      sum += v * WEIGHTS[i];
      wsum += WEIGHTS[i];
    });
    const known = samples.filter((v) => v !== null);
    const forecast = wsum ? Math.round(sum / wsum) : 0;
    const sd = Math.round(stdDev(known));
    out.push({ date, forecast, low: Math.max(0, forecast - sd), high: forecast + sd, samples: known.length });
  }
  return out;
}

/** % thay đổi (null khi kỳ trước = 0). */
export const pctChange = (now, before) => (before ? Math.round(((now - before) / before) * 1000) / 10 : null);

/**
 * Cờ "ngồi lâu – doanh thu thấp" (F-042): doanh thu / giờ ngồi dưới trung vị VÀ thời gian ngồi trung bình từ trung vị trở lên.
 * tables: [{ tableId, sessions, revenue, minutes }] → thêm avgMinutes, revenuePerHour, flag.
 */
export function flagTables(tables) {
  const rows = tables.map((t) => ({
    ...t,
    avgMinutes: t.sessions ? Math.round(t.minutes / t.sessions) : 0,
    revenuePerHour: t.minutes > 0 ? Math.round((t.revenue * 60) / t.minutes) : 0,
  }));
  const used = rows.filter((r) => r.sessions > 0);
  const medRph = used.length ? median(used.map((r) => r.revenuePerHour)) : 0;
  const medMin = used.length ? median(used.map((r) => r.avgMinutes)) : 0;
  for (const r of rows) r.flag = r.sessions > 0 && used.length > 1 && r.revenuePerHour < medRph && r.avgMinutes >= medMin;
  return { tables: rows, medianRevenuePerHour: medRph, medianMinutes: medMin };
}
