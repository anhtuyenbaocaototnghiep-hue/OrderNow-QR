// API quầy (STAFF/ADMIN): dashboard, tiếp nhận/hoàn tất/hủy (FEATURE-007), bán mang đi (FEATURE-008),
// bàn đang phục vụ, thu tiền mặt, đóng bàn, hóa đơn (FEATURE-006).
import express from 'express';
import { z } from 'zod';
import { requireStaff } from '../middleware/auth.js';
import { paramGuid, paramId, parse, zMoney, zOrderItems, zText } from '../middleware/validate.js';
import * as orderService from '../services/orderService.js';
import * as sessionService from '../services/sessionService.js';

export const staffRouter = express.Router();
staffRouter.use(requireStaff);

const ORDER_STATUSES = ['PENDING', 'PREPARING', 'COMPLETED', 'CANCELLED'];
const SESSION_STATUSES = ['OPEN', 'PAYMENT_REQUESTED', 'CLOSED'];
const csvOf = (allowed) =>
  z
    .string()
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim().toUpperCase())
        .filter(Boolean),
    )
    .refine((arr) => arr.length > 0 && arr.every((x) => allowed.includes(x)), 'Trạng thái không hợp lệ');

staffRouter.get('/orders', async (req, res) => {
  const q = parse(
    z.object({
      status: csvOf(ORDER_STATUSES).optional(),
      since: z.iso.datetime({ offset: true }).optional(),
      type: z.enum(['DINE_IN', 'TAKE_AWAY']).optional(),
    }),
    req.query,
  );
  res.json(await orderService.listForDashboard({ statuses: q.status, since: q.since ? new Date(q.since) : null, type: q.type }));
});

staffRouter.post('/orders/takeaway', async (req, res) => {
  const body = parse(z.object({ items: zOrderItems(), amountReceived: zMoney(), note: zText(200).optional().nullable() }), req.body);
  res.status(201).json(await orderService.takeaway(body, req.user));
});

staffRouter.post('/orders/:id/accept', async (req, res) => {
  res.json({ order: await orderService.accept(paramId(req)) });
});

staffRouter.post('/orders/:id/complete', async (req, res) => {
  res.json(await orderService.complete(paramId(req), req.user));
});

staffRouter.post('/orders/:id/cancel', async (req, res) => {
  const body = parse(z.object({ reason: zText(200).optional().nullable() }), req.body ?? {});
  res.json({ order: await orderService.cancel(paramId(req), req.user, body.reason) });
});

staffRouter.get('/orders/:id/receipt', async (req, res) => {
  res.json(await orderService.receipt(paramId(req)));
});

staffRouter.get('/sessions', async (req, res) => {
  const q = parse(z.object({ status: csvOf(SESSION_STATUSES).optional() }), req.query);
  res.json(await sessionService.listByStatus(q.status ?? ['OPEN', 'PAYMENT_REQUESTED']));
});

staffRouter.post('/sessions/:id/settle', async (req, res) => {
  const body = parse(z.object({ amountReceived: zMoney(), expectedAmountDue: zMoney().optional() }), req.body);
  res.json(await sessionService.settle(paramGuid(req), body, req.user));
});

staffRouter.post('/sessions/:id/close', async (req, res) => {
  res.json({ session: await sessionService.closeEmpty(paramGuid(req), req.user) });
});

staffRouter.get('/sessions/:id/receipt', async (req, res) => {
  const { mode } = parse(z.object({ mode: z.enum(['final', 'provisional']).default('final') }), req.query);
  res.json(await sessionService.receipt(paramGuid(req), mode));
});
