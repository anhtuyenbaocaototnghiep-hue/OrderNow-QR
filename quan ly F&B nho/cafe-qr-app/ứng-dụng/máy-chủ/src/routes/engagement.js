// API dùng chung khách + quầy giai đoạn 4 (ADR-006): gọi lại đơn & món yêu thích (F-045), thời gian chờ (F-025), chia bill (F-026).
// Khách nhận diện bằng cookie cf_client (chỉ phiên / hội viên của mình); quầy gọi kèm Bearer.
import express from 'express';
import { z } from 'zod';
import { optionalStaff } from '../middleware/auth.js';
import { paramGuid, paramId, parse, zId, zText } from '../middleware/validate.js';
import { parseItemsParam } from '../domain/eta.js';
import * as etaService from '../services/etaService.js';
import * as recallService from '../services/recallService.js';
import * as reviewService from '../services/reviewService.js';
import { assertViewer, memberCard } from '../services/sessionService.js';
import * as splitService from '../services/splitService.js';

export const engagementRouter = express.Router();
const viewer = (req) => ({ user: req.user, clientToken: req.clientToken });

// ---- F-045 Gọi lại đơn lần trước & món yêu thích ----
engagementRouter.get('/members/:id/recent-orders', optionalStaff, async (req, res) => {
  const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(10).default(3) }), req.query);
  res.json(await recallService.recentOrders(paramId(req), limit, viewer(req)));
});
engagementRouter.get('/members/:id/favorites', optionalStaff, async (req, res) => res.json(await recallService.favorites(paramId(req), viewer(req))));
engagementRouter.put('/members/:id/favorites/:menuItemId', optionalStaff, async (req, res) =>
  res.json(await recallService.setFavorite(paramId(req), paramId(req, 'menuItemId'), true, viewer(req))),
);
engagementRouter.delete('/members/:id/favorites/:menuItemId', optionalStaff, async (req, res) =>
  res.json(await recallService.setFavorite(paramId(req), paramId(req, 'menuItemId'), false, viewer(req))),
);
engagementRouter.post('/cart/replay', optionalStaff, async (req, res) => {
  const { orderId } = parse(z.object({ orderId: zId() }), req.body);
  res.json(await recallService.replay(orderId, viewer(req)));
});

// ---- F-051 Đánh giá sau khi dùng món: điện thoại trong nhóm, sau khi thanh toán (24 giờ), 1 lần ----
const reviewBody = z.object({
  items: z
    .array(z.object({ menuItemId: zId(), stars: z.coerce.number().int().min(1, 'Sao từ 1 đến 5').max(5, 'Sao từ 1 đến 5') }))
    .max(50)
    .default([])
    .refine((xs) => new Set(xs.map((x) => x.menuItemId)).size === xs.length, 'Mỗi món chỉ chấm một lần'),
  comment: zText(300).optional().nullable(),
});
engagementRouter.get('/sessions/:id/review', optionalStaff, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await reviewService.info(paramGuid(req), viewer(req)));
});
engagementRouter.post('/sessions/:id/review', optionalStaff, async (req, res) =>
  res.status(201).json(await reviewService.submit(paramGuid(req), parse(reviewBody, req.body ?? {}), viewer(req))),
);

// ---- F-025 Thời gian chờ ước tính ----
engagementRouter.get('/queue/eta', optionalStaff, async (req, res) => {
  const { items } = parse(z.object({ items: z.string().max(400).optional() }), req.query);
  res.set('Cache-Control', 'no-store');
  res.json(await etaService.queueEta(parseItemsParam(items)));
});
engagementRouter.get('/sessions/:id/eta', optionalStaff, async (req, res) => {
  const id = paramGuid(req);
  await assertViewer(id, viewer(req));
  res.json({ eta: await etaService.sessionEta(id) });
});

// ---- F-047 Thẻ thành viên (ADR-008 D-37): khách trong phiên / quầy, phiên còn mở và đang gắn hội viên ----
engagementRouter.get('/sessions/:id/member-card', optionalStaff, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await memberCard(paramGuid(req), viewer(req)));
});

// ---- F-026 Chia bill ----
engagementRouter.get('/sessions/:id/splits', optionalStaff, async (req, res) => res.json(await splitService.view(paramGuid(req), viewer(req))));
engagementRouter.post('/sessions/:id/splits', optionalStaff, async (req, res) => {
  const body = parse(z.object({ label: zText(50).min(1, 'Nhập tên phần (ví dụ: Anh A)') }), req.body);
  res.status(201).json(await splitService.create(paramGuid(req), body, viewer(req)));
});
engagementRouter.put('/sessions/:id/items/:orderItemId/split', optionalStaff, async (req, res) => {
  const { splitId } = parse(z.object({ splitId: zId().nullable() }), req.body);
  res.json(await splitService.assign(paramGuid(req), paramId(req, 'orderItemId'), splitId, viewer(req)));
});
