// FEATURE-041 Menu engineering (ADR-006 D-30) + FEATURE-042 giờ cao điểm, dự báo doanh thu, so sánh kỳ, doanh thu theo bàn. Chỉ quản lý.
import { badRequest, notFound } from '../errors.js';
import { classifyMenu, flagTables, heatmapMatrix, pctChange, revenueForecast } from '../domain/analytics.js';
import * as analyticsRepo from '../repositories/analyticsRepo.js';
import * as pnlRepo from '../repositories/pnlRepo.js';
import * as marketingService from './marketingService.js';
import { addDays, eachDay, todayVn, vnDayStartUtc } from '../utils/time.js';

const utc = (from, to) => [vnDayStartUtc(from), vnDayStartUtc(addDays(to, 1))];

// ---- F-041 ----
export async function menuEngineering(from, to, { categoryId = null } = {}) {
  const items = (await analyticsRepo.menuItems(...utc(from, to))).filter((i) => !categoryId || i.categoryId === categoryId);
  const result = classifyMenu(items);
  return { from, to, ...result, estimatedCogs: items.some((i) => i.estimatedQty > 0) };
}

/** Nút "Ghim món này" (nối F-017): thêm vào danh sách ghim của mục gợi ý, giữ các món đã ghim / ẩn và cấu hình khác. */
export async function pinItem(menuItemId) {
  const cur = await marketingService.suggestionsAdmin();
  const pinned = cur.items.filter((i) => i.isPinned).sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0));
  if (pinned.some((i) => i.menuItemId === menuItemId)) return { pinned: true, count: pinned.length };
  if (pinned.length >= 20) throw badRequest('VALIDATION_ERROR', 'Đã ghim tối đa 20 món');
  const pins = [...pinned.map((i) => ({ menuItemId: i.menuItemId, label: i.pinLabel ?? null })), { menuItemId, label: 'Gợi ý' }];
  await marketingService.saveSuggestions({
    mode: cur.mode === 'AUTO' ? 'BOTH' : cur.mode,
    topN: cur.topN,
    windowDays: cur.windowDays,
    pins,
    hidden: cur.items.filter((i) => i.hideFromSuggestions).map((i) => i.menuItemId),
  });
  return { pinned: true, count: pins.length };
}

// ---- F-042 ----
export async function heatmap(from, to, metric = 'orders') {
  const rows = await analyticsRepo.hourly(...utc(from, to), metric);
  return { from, to, metric, ...heatmapMatrix(rows) };
}

/** Dự báo doanh thu N ngày tới (từ hôm nay) + 28 ngày gần nhất để vẽ cùng biểu đồ. */
export async function revenueForecastReport(days = 7) {
  const today = todayVn();
  const histFrom = addDays(today, -28);
  const { byDay, firstDay } = await analyticsRepo.dailyNet(...utc(histFrom, addDays(today, -1)));
  const daily = new Map();
  for (const d of eachDay(histFrom, addDays(today, -1))) {
    if (firstDay && d >= firstDay) daily.set(d, byDay.get(d) ?? 0);
  }
  return {
    today,
    history: [...daily].map(([date, revenue]) => ({ date, revenue })),
    forecast: revenueForecast(daily, today, days, addDays),
  };
}

/** Kỳ [from, to] của tuần (Thứ Hai) / tháng chứa ngày `anchor`. */
function periodOf(period, anchor) {
  if (period === 'month') {
    const from = `${anchor.slice(0, 8)}01`;
    const next = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 1)).toISOString().slice(0, 10);
    return { from, to: addDays(next, -1) };
  }
  const dow = (new Date(`${anchor}T00:00:00Z`).getUTCDay() + 6) % 7;
  const from = addDays(anchor, -dow);
  return { from, to: addDays(from, 6) };
}

async function metrics(from, to) {
  const [fromUtc, toUtc] = utc(from, to);
  const [daily, c] = await Promise.all([pnlRepo.daily(fromUtc, toUtc), analyticsRepo.counts(fromUtc, toUtc)]);
  const due = daily.payments.reduce((s, p) => s + p.due, 0);
  const payments = daily.payments.reduce((s, p) => s + p.count, 0);
  const refunds = daily.refunds.reduce((s, r) => s + r.amount, 0);
  const cogs = daily.cogs.reduce((s, x) => s + x.amount, 0);
  const revenueNet = due - refunds;
  return {
    from,
    to,
    revenueNet,
    orders: c.orders,
    avgBill: payments ? Math.round(due / payments) : 0,
    newMembers: c.newMembers,
    cogsPct: revenueNet > 0 ? Math.round((cogs / revenueNet) * 1000) / 10 : null,
  };
}

/**
 * So sánh kỳ (F-042): kỳ được chọn vs kỳ liền trước. Kỳ đang diễn ra tính tới hôm nay và so với CÙNG SỐ NGÀY đầu của kỳ trước.
 * offset = 0 kỳ này, 1 kỳ trước…
 */
export async function compare(period = 'week', offset = 0) {
  const today = todayVn();
  let anchor = today;
  for (let i = 0; i < offset; i += 1) anchor = addDays(periodOf(period, anchor).from, -1);
  const cur = periodOf(period, anchor);
  const prev = periodOf(period, addDays(cur.from, -1));
  const curTo = cur.to > today ? today : cur.to;
  const len = eachDay(cur.from, curTo).length;
  const prevTo = addDays(prev.from, len - 1) < prev.to ? addDays(prev.from, len - 1) : prev.to;
  const [now, before] = await Promise.all([metrics(cur.from, curTo), metrics(prev.from, prevTo)]);
  const change = {};
  for (const k of ['revenueNet', 'orders', 'avgBill', 'newMembers']) change[k] = pctChange(now[k], before[k]);
  change.cogsPct = now.cogsPct !== null && before.cogsPct !== null ? Math.round((now.cogsPct - before.cogsPct) * 10) / 10 : null;
  return { period, offset, current: now, previous: before, change, partial: curTo < cur.to };
}

export async function tables(from, to) {
  const rows = await analyticsRepo.tables(...utc(from, to));
  return { from, to, ...flagTables(rows) };
}

export function assertRange(from, to, maxDays = 366) {
  if (to < from || eachDay(from, to).length > maxDays) throw badRequest('INVALID_RANGE', 'Khoảng thời gian không hợp lệ');
}

export const assertMenuItem = (item) => {
  if (!item) throw notFound('Không tìm thấy món');
};
