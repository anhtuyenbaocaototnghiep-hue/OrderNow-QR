// Giai đoạn 8 (ADR-006): phân tích cho quản lý — menu engineering (F-041), giờ cao điểm / dự báo doanh thu / so sánh kỳ / theo bàn (F-042)
// (gắn dưới /api/admin — chỉ ADMIN); dashboard chủ quán /api/dashboard/* (F-043 — quyền dashboard.view: quản lý + trưởng ca bản rút gọn).
import express from 'express';
import { z } from 'zod';
import { requirePermission } from '../auth/permissions.js';
import { parse, parseRange, zId } from '../middleware/validate.js';
import * as analyticsService from '../services/analyticsService.js';
import * as dashboardService from '../services/dashboardService.js';
import { addDays, todayVn } from '../utils/time.js';

export const analyticsAdminRouter = express.Router();
export const dashboardRouter = express.Router();

/** ?from&to — mặc định 30 ngày gần nhất (D-30). */
function rangeOr30(query) {
  if (!query.from && !query.to) return { from: addDays(todayVn(), -29), to: todayVn() };
  const r = parseRange(query);
  analyticsService.assertRange(r.from, r.to);
  return r;
}

// ---- F-041 Menu engineering ----
analyticsAdminRouter.get('/reports/menu-engineering', async (req, res) => {
  const { from, to } = rangeOr30(req.query);
  const { categoryId } = parse(z.object({ categoryId: zId().optional() }).passthrough(), { ...req.query, categoryId: req.query.categoryId || undefined });
  res.json(await analyticsService.menuEngineering(from, to, { categoryId: categoryId ?? null }));
});
analyticsAdminRouter.post('/reports/menu-engineering/pin', async (req, res) => {
  const { menuItemId } = parse(z.object({ menuItemId: zId() }), req.body);
  res.json(await analyticsService.pinItem(menuItemId));
});

// ---- F-042 ----
analyticsAdminRouter.get('/reports/heatmap', async (req, res) => {
  const { from, to } = rangeOr30(req.query);
  const { metric } = parse(z.object({ metric: z.enum(['orders', 'revenue']).default('orders') }).passthrough(), req.query);
  res.json(await analyticsService.heatmap(from, to, metric));
});
analyticsAdminRouter.get('/reports/revenue-forecast', async (req, res) => {
  const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(14).default(7) }).passthrough(), req.query);
  res.json(await analyticsService.revenueForecastReport(days));
});
analyticsAdminRouter.get('/reports/compare', async (req, res) => {
  const q = parse(
    z.object({ period: z.enum(['week', 'month']).default('week'), offset: z.coerce.number().int().min(0).max(24).default(0) }).passthrough(),
    req.query,
  );
  res.json(await analyticsService.compare(q.period, q.offset));
});
analyticsAdminRouter.get('/reports/tables', async (req, res) => {
  const { from, to } = rangeOr30(req.query);
  res.json(await analyticsService.tables(from, to));
});

// ---- F-043 Dashboard chủ quán ----
const canView = requirePermission('dashboard.view');
dashboardRouter.get('/dashboard/today', canView, async (req, res) => res.json(await dashboardService.today(req.user)));
dashboardRouter.post('/dashboard/recompute', canView, async (req, res) => res.json(await dashboardService.recompute(req.user)));
