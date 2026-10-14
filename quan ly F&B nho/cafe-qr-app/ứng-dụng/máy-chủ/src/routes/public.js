// API khách (không đăng nhập — cookie cf_client) + đăng nhập nhân viên + health.
// Khách chỉ chạm phiên/đơn của mình (SessionClients); không có endpoint nào cho khách đổi PaymentStatus (BR-007).
import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { request } from '../db.js';
import { optionalStaff, requireStaff } from '../middleware/auth.js';
import { loginLimiter, orderLimiter } from '../middleware/rateLimit.js';
import { paramGuid, paramId, parse, zGuid, zOrderItems, zQrToken, zText } from '../middleware/validate.js';
import * as menuService from '../services/menuService.js';
import * as orderService from '../services/orderService.js';
import * as sessionService from '../services/sessionService.js';
import * as userService from '../services/userService.js';

export const publicRouter = express.Router();

publicRouter.get('/health', async (_req, res) => {
  try {
    await (await request()).query('SELECT 1 AS ok');
    res.json({ status: 'ok', db: 'up' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

// ---- Auth (FEATURE-009) ----
publicRouter.post('/auth/login', loginLimiter, async (req, res) => {
  const body = parse(z.object({ username: zText(50).min(1, 'Nhập tên đăng nhập'), password: z.string().min(1, 'Nhập mật khẩu').max(100) }), req.body);
  res.json(await userService.login(body.username, body.password));
});

publicRouter.get('/auth/me', requireStaff, (req, res) => res.json({ user: req.user, shop: config.shop }));

// ---- Menu (FEATURE-002) ----
publicRouter.get('/menu', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ shop: { name: config.shop.name }, categories: await menuService.getPublicMenu() });
});

// ---- Phiên khách (FEATURE-001, 004, 005) ----
const qrBody = z.object({ qrToken: zQrToken() });

publicRouter.post('/sessions/scan', async (req, res) => {
  const { qrToken } = parse(qrBody, req.body);
  res.json(await sessionService.scan(qrToken, req.clientToken));
});

publicRouter.post('/sessions', async (req, res) => {
  const { qrToken } = parse(qrBody, req.body);
  res.status(201).json(await sessionService.createSession(qrToken, req.clientToken));
});

publicRouter.post('/sessions/:id/join', async (req, res) => {
  const { qrToken } = parse(qrBody, req.body);
  res.json(await sessionService.join(paramGuid(req), qrToken, req.clientToken));
});

publicRouter.get('/sessions/:id', optionalStaff, async (req, res) => {
  res.json(await sessionService.getDetail(paramGuid(req), { user: req.user, clientToken: req.clientToken }));
});

publicRouter.post('/sessions/:id/request-payment', async (req, res) => {
  res.json(await sessionService.requestPayment(paramGuid(req), req.clientToken));
});

// ---- Đơn khách (FEATURE-003) ----
publicRouter.post('/orders', orderLimiter, async (req, res) => {
  const body = parse(z.object({ sessionId: zGuid(), items: zOrderItems(), note: zText(200).optional().nullable() }), req.body);
  const key = parse(z.string().max(100).optional(), req.get('idempotency-key') || undefined);
  const order = await orderService.submitDineIn(body, req.clientToken, key);
  res.status(201).json({
    orderId: order.orderId,
    orderCode: order.orderCode,
    totalAmount: order.totalAmount,
    status: order.status,
    paymentStatus: order.paymentStatus,
    order,
  });
});

publicRouter.get('/orders/:id', optionalStaff, async (req, res) => {
  res.json(await orderService.getForViewer(paramId(req), { user: req.user, clientToken: req.clientToken }));
});
