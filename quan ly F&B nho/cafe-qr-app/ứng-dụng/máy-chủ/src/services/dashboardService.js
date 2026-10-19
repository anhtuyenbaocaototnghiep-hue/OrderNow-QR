// FEATURE-043 Dashboard chủ quán (ADR-006 D-32): /admin/today đọc bảng DailySummaries (job 00:30 tính hôm qua; "Tính lại hôm nay").
// Quản lý thấy đủ; trưởng ca thấy bản rút gọn — KHÔNG có giá vốn / lãi gộp (quyền dashboard.view, D-24).
import * as dashboardRepo from '../repositories/dashboardRepo.js';
import * as ingredientsRepo from '../repositories/ingredientsRepo.js';
import * as pnlRepo from '../repositories/pnlRepo.js';
import { pctChange } from '../domain/analytics.js';
import * as inventoryService from './inventoryService.js';
import { addDays, todayVn, vnDayStartUtc } from '../utils/time.js';

/** Tính + lưu tổng hợp của một ngày (giờ VN). Chạy lại bao nhiêu lần cũng ra cùng một dòng (MERGE). */
export async function computeDay(date) {
  const fromUtc = vnDayStartUtc(date);
  const toUtc = vnDayStartUtc(addDays(date, 1));
  const [money, facts, ingredients, lots, todo] = await Promise.all([
    pnlRepo.daily(fromUtc, toUtc),
    dashboardRepo.dayFacts(fromUtc, toUtc),
    ingredientsRepo.list(),
    inventoryService.expiringLots(2),
    dashboardRepo.todos(todayVn()),
  ]);
  const due = money.payments.reduce((s, p) => s + p.due, 0);
  const paymentCount = money.payments.reduce((s, p) => s + p.count, 0);
  const refunds = money.refunds.reduce((s, r) => s + r.amount, 0);
  const cogs = money.cogs.reduce((s, c) => s + c.amount, 0);
  const revenueNet = due - refunds;
  const summary = {
    revenueNet,
    paymentCount,
    orderCount: facts.orders,
    avgBill: paymentCount ? Math.round(due / paymentCount) : 0,
    cogs,
    grossProfit: revenueNet - cogs,
    cashVariance: facts.cashVariance,
    shiftCount: facts.shiftCount,
    newMembers: facts.newMembers,
    vouchersUsed: facts.vouchersUsed,
    topItems: facts.topItems,
    lowStock: ingredients
      .filter((i) => i.isActive && i.isLow)
      .slice(0, 20)
      .map((i) => ({ ingredientId: i.ingredientId, name: i.name, available: i.available, unit: i.unit })),
    expiring: lots.slice(0, 20).map((l) => ({ lotId: l.lotId, name: l.ingredientName ?? l.name, qty: l.qty, unit: l.unit, daysLeft: l.daysLeft })),
    pendingApprovals: todo.pendingCash,
  };
  await dashboardRepo.upsert(date, summary);
  return dashboardRepo.get(date);
}

async function summaryOf(date) {
  return (await dashboardRepo.get(date)) ?? computeDay(date);
}

/** Bỏ số tài chính nhạy cảm cho trưởng ca. */
const forRole = (s, full) => (s && !full ? { ...s, cogs: undefined, grossProfit: undefined } : s);

/** Dữ liệu trang /admin/today. user.role ADMIN → đủ; MANAGER → rút gọn. */
export async function today(user) {
  const full = user.role === 'ADMIN';
  const day = addDays(todayVn(), -1);
  const [yesterday, lastWeek, shift, todo] = await Promise.all([
    summaryOf(day),
    summaryOf(addDays(day, -7)),
    dashboardRepo.lastClosedShift(),
    dashboardRepo.todos(todayVn()),
  ]);
  const todaySoFar = await dashboardRepo.get(todayVn());
  const stocktakeAgeDays = todo.lastStocktakeAt ? Math.floor((Date.now() - new Date(todo.lastStocktakeAt).getTime()) / 86400e3) : null;
  return {
    date: day,
    full,
    yesterday: forRole(yesterday, full),
    sameDayLastWeek: forRole(lastWeek, full),
    revenueChange: pctChange(yesterday.revenueNet, lastWeek.revenueNet),
    today: forRole(todaySoFar, full),
    lastShift: shift,
    todos: {
      ...todo,
      pendingCashAmount: full ? todo.pendingCashAmount : undefined,
      stocktakeAgeDays,
      stocktakeOverdue: stocktakeAgeDays === null || stocktakeAgeDays > 7,
    },
  };
}

/** Nút "Tính lại hôm nay" (+ hôm qua nếu chưa có). */
export async function recompute(user) {
  await computeDay(todayVn());
  if (!(await dashboardRepo.get(addDays(todayVn(), -1)))) await computeDay(addDays(todayVn(), -1));
  return today(user);
}

/** Job 00:30: tổng hợp hôm qua. */
export const computeYesterday = async () => ({ date: addDays(todayVn(), -1), summary: await computeDay(addDays(todayVn(), -1)) });
