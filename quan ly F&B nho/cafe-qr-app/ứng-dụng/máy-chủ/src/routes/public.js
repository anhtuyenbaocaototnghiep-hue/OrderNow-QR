// API khách (không đăng nhập — cookie cf_client) + đăng nhập nhân viên + health.
// Khách chỉ chạm phiên/đơn của mình (SessionClients); không có endpoint nào cho khách đổi PaymentStatus (BR-007).
import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { request } from '../db.js';
import { optionalStaff, requireStaff } from '../middleware/auth.js';
import { loginLimiter, memberLimiters, orderLimiter } from '../middleware/rateLimit.js';
import { paramGuid, paramId, parse, zGuid, zId, zOrderItems, zQrToken, zText } from '../middleware/validate.js';
import * as memberService from '../services/memberService.js';
import * as menuService from '../services/menuService.js';
import * as orderService from '../services/orderService.js';
import * as sessionService from '../services/sessionService.js';
import * as staffCallService from '../services/staffCallService.js';
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
// Quầy gọi kèm Bearer → thấy cả danh mục ngoài giờ bán (bán mang đi); khách chỉ thấy danh mục đang trong giờ (F-020)
publicRouter.get('/menu', optionalStaff, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ shop: { name: config.shop.name }, ...(await menuService.getPublicMenu({ staff: Boolean(req.user) })) });
});

// ---- Hội viên (FEATURE-014): khách thấy tên che; quầy (Bearer) thấy tên đầy đủ. Giới hạn tra cứu D-6 ----
const zPhone = () => z.string().trim().min(1, 'Nhập số điện thoại').max(20);
publicRouter.post('/members/lookup', optionalStaff, ...memberLimiters, async (req, res) => {
  const { phone } = parse(z.object({ phone: zPhone() }), req.body);
  res.json(await memberService.lookup(phone, { staff: Boolean(req.user) }));
});

publicRouter.post('/members', optionalStaff, ...memberLimiters, async (req, res) => {
  const body = parse(
    z.object({
      phone: zPhone(),
      fullName: zText(100).min(2, 'Nhập họ tên'),
      consent: z.boolean().optional(),
      referrerPhone: z.string().trim().max(20).optional().nullable(),
    }),
    req.body,
  );
  res.status(201).json(await memberService.register(body, { staff: Boolean(req.user) }));
});

publicRouter.post('/sessions/:id/member', optionalStaff, ...memberLimiters, async (req, res) => {
  const body = parse(
    z.object({ phone: zPhone().optional(), memberId: zId().optional() }).refine((b) => b.phone || b.memberId, 'Nhập số điện thoại'),
    req.body,
  );
  res.json({ member: await memberService.attachToSession(paramGuid(req), body, { user: req.user, clientToken: req.clientToken }) });
});

publicRouter.delete('/sessions/:id/member', optionalStaff, async (req, res) => {
  res.json(await memberService.detachFromSession(paramGuid(req), { user: req.user, clientToken: req.clientToken }));
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

// ---- Gọi nhân viên (FEATURE-021): 60 giây/phiên ----
publicRouter.post('/sessions/:id/call-staff', async (req, res) => {
  const body = parse(z.object({ type: z.enum(['STAFF']).default('STAFF'), message: zText(100).optional().nullable() }), req.body ?? {});
  res.status(201).json(await staffCallService.call(paramGuid(req), body.message || null, req.clientToken));
});

// ---- Đơn khách (FEATURE-003) ----
// Báo giá giỏ (khuyến mãi, combo, tùy chọn) — cùng bộ tính với lúc gửi; FE không tự tính tiền (ADR-005)
publicRouter.post('/orders/quote', async (req, res) => {
  const { items } = parse(z.object({ items: zOrderItems() }), req.body);
  res.json(await orderService.quoteItems(items));
});

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
