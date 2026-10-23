// API quầy (STAFF/ADMIN): dashboard, tiếp nhận/hoàn tất/hủy (FEATURE-007), bán mang đi (FEATURE-008),
// bàn đang phục vụ, thu tiền mặt, đóng bàn, hóa đơn (FEATURE-006).
// ADR-005: ca (F-018), gọi nhân viên (F-021), công tắc nhận đơn QR (F-020), hội viên + giảm tay khi thu (F-014, F-022), hoàn tiền (F-019).
// F-024: sơ đồ bàn, mở bàn, nhân viên gọi món giúp khách tại bàn, ghi chú bàn.
import express from 'express';
import { z } from 'zod';
import { requireStaff } from '../middleware/auth.js';
import { paramGuid, paramId, parse, zId, zManualDiscount, zMoney, zOrderItems, zText } from '../middleware/validate.js';
import * as orderService from '../services/orderService.js';
import * as refundService from '../services/refundService.js';
import * as reviewService from '../services/reviewService.js';
import * as sessionService from '../services/sessionService.js';
import * as settingsService from '../services/settingsService.js';
import * as shiftService from '../services/shiftService.js';
import * as staffCallService from '../services/staffCallService.js';
import * as splitService from '../services/splitService.js';
import * as voidService from '../services/voidService.js';

export const staffRouter = express.Router();
staffRouter.use(requireStaff);

const ORDER_STATUSES = ['PENDING', 'PREPARING', 'COMPLETED', 'CANCELLED', 'VOIDED'];
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

// Giảm giá tay (F-022) + xác thực quản lý khi vượt ngưỡng (D-14) + hội viên (F-014); dùng chung cho thu tiền bàn và mang đi
const billingFields = {
  memberId: zId().nullable().optional(),
  manualDiscount: zManualDiscount(),
  manualReason: zText(200).optional().nullable(),
  adminUsername: zText(50).optional(),
  adminPassword: z.string().max(100).optional(),
  // F-038 voucher · F-039 đổi thưởng (điểm hoặc lượt món miễn phí của thẻ tem)
  voucherCode: zText(20).optional().nullable(),
  reward: z
    .discriminatedUnion('type', [z.object({ type: z.literal('POINTS'), rewardId: zId() }), z.object({ type: z.literal('STAMP'), programId: zId() })])
    .optional()
    .nullable(),
};

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

staffRouter.post('/orders/takeaway/quote', async (req, res) => {
  const body = parse(z.object({ items: zOrderItems(), ...billingFields }), req.body);
  res.json(await orderService.takeawayQuote(body, req.user));
});

staffRouter.post('/orders/takeaway', async (req, res) => {
  const body = parse(
    z.object({
      items: zOrderItems(),
      amountReceived: zMoney(),
      expectedAmountDue: zMoney().optional(),
      note: zText(200).optional().nullable(),
      ...billingFields,
    }),
    req.body,
  );
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

staffRouter.post('/sessions/:id/settle/preview', async (req, res) => {
  const body = parse(z.object(billingFields), req.body ?? {});
  res.json(await sessionService.settlePreview(paramGuid(req), body, req.user));
});

staffRouter.post('/sessions/:id/settle', async (req, res) => {
  const body = parse(z.object({ amountReceived: zMoney(), expectedAmountDue: zMoney().optional(), ...billingFields }), req.body);
  res.json(await sessionService.settle(paramGuid(req), body, req.user));
});

// ---- FEATURE-046 Sửa / xóa món đã gọi, xóa đơn, hủy lượt phục vụ bàn (ADR-007) ----
const voidFields = {
  reason: zText(200).min(1, 'Nhập lý do'),
  stockMode: z.enum(['WASTE', 'RESTOCK']).optional().nullable(),
  adminUsername: zText(50).optional(),
  adminPassword: z.string().max(100).optional(),
};
staffRouter.post('/order-items/:id/void', async (req, res) => {
  const body = parse(z.object({ quantity: z.coerce.number().int().min(0).max(500), ...voidFields }), req.body);
  res.json(await voidService.voidItem(paramId(req), body, req.user));
});
staffRouter.post('/orders/:id/void', async (req, res) => res.json(await voidService.voidOrder(paramId(req), parse(z.object(voidFields), req.body), req.user)));
staffRouter.post('/sessions/:id/cancel', async (req, res) =>
  res.json(await voidService.cancelSession(paramGuid(req), parse(z.object(voidFields), req.body), req.user)),
);
staffRouter.get('/sessions/:id/voids', async (req, res) => res.json(await voidService.voidsOfSession(paramGuid(req))));

// F-049: chuyển cả nhóm sang bàn khác (bàn trống hoặc có nhóm khác — bill vẫn riêng)
staffRouter.post('/sessions/:id/move', async (req, res) =>
  res.json(await sessionService.moveSession(paramGuid(req), parse(z.object({ toTableId: zId(), fromTableId: zId().optional() }), req.body ?? {}), req.user)),
);

staffRouter.post('/sessions/:id/close', async (req, res) => {
  res.json({ session: await sessionService.closeEmpty(paramGuid(req), req.user) });
});

// ---- Chia bill: thu từng phần (FEATURE-026) ----
staffRouter.post('/splits/:id/settle/preview', async (req, res) => {
  const body = parse(z.object(billingFields), req.body ?? {});
  res.json(await splitService.preview(paramId(req), body, req.user));
});
staffRouter.post('/splits/:id/settle', async (req, res) => {
  const body = parse(z.object({ amountReceived: zMoney(), expectedAmountDue: zMoney().optional(), ...billingFields }), req.body);
  res.json(await splitService.settle(paramId(req), body, req.user));
});
staffRouter.post('/sessions/:id/splits/merge', async (req, res) => res.json(await splitService.merge(paramGuid(req), req.user)));
staffRouter.get('/payments/:id/receipt', async (req, res) => res.json(await sessionService.paymentReceipt(paramId(req))));

// ---- Gọi món tại bàn + ghi chú bàn (FEATURE-024) ----
staffRouter.get('/tables', async (_req, res) => res.json(await sessionService.tablesOverview()));

staffRouter.post('/tables/:id/sessions', async (req, res) => {
  const body = parse(z.object({ note: zText(200).optional().nullable(), newGroup: z.boolean().default(false) }), req.body ?? {});
  res.status(201).json({ session: await sessionService.openTable(paramId(req), body, req.user) });
});

staffRouter.post('/sessions/:id/orders', async (req, res) => {
  const body = parse(z.object({ items: zOrderItems(), note: zText(200).optional().nullable() }), req.body);
  const key = parse(z.string().max(100).optional(), req.get('idempotency-key') || undefined);
  res.status(201).json({ order: await orderService.submitByStaff(paramGuid(req), body, req.user, key) });
});

staffRouter.put('/sessions/:id/note', async (req, res) => {
  const { note } = parse(z.object({ note: zText(200).nullable() }), req.body);
  res.json({ session: await sessionService.setNote(paramGuid(req), note, req.user) });
});

staffRouter.get('/sessions/:id/receipt', async (req, res) => {
  const { mode } = parse(z.object({ mode: z.enum(['final', 'provisional']).default('final') }), req.query);
  res.json(await sessionService.receipt(paramGuid(req), mode));
});

// ---- Ca tiền mặt (FEATURE-018) ----
staffRouter.get('/shifts/current', async (_req, res) => res.json({ shift: (await shiftService.current()) ?? null }));

staffRouter.post('/shifts/open', async (req, res) => {
  const { openingCash } = parse(z.object({ openingCash: zMoney() }), req.body);
  res.status(201).json({ shift: await shiftService.open(openingCash, req.user) });
});

staffRouter.post('/shifts/:id/close', async (req, res) => {
  const body = parse(z.object({ countedCash: zMoney(), note: zText(200).optional().nullable() }), req.body);
  res.json(await shiftService.close(paramId(req), body, req.user));
});

staffRouter.get('/shifts/:id/report', async (req, res) => res.json(await shiftService.report(paramId(req))));

// ---- Hoàn tiền sau thu (FEATURE-019): STAFF phải kèm tài khoản quản lý ----
staffRouter.get('/payments/:id', async (req, res) => res.json(await refundService.paymentDetail(paramId(req))));

staffRouter.post('/payments/:id/refunds', async (req, res) => {
  const body = parse(
    z.object({
      amount: zMoney().refine((v) => v > 0, 'Số tiền hoàn phải lớn hơn 0'),
      reason: zText(200).min(3, 'Nhập lý do hoàn tiền'),
      restockInventory: z.boolean().default(false),
      orderIds: z.array(zId()).max(50).optional(),
      adminUsername: zText(50).optional(),
      adminPassword: z.string().max(100).optional(),
    }),
    req.body,
  );
  res.status(201).json(await refundService.refund(paramId(req), body, req.user));
});

// ---- Gọi nhân viên (FEATURE-021) ----
staffRouter.get('/staff-calls', async (_req, res) => res.json(await staffCallService.listOpen()));
// F-051: dải "Đánh giá thấp" (món ≤ 2 sao, chưa xử lý, trong ngày)
staffRouter.get('/reviews/alerts', async (_req, res) => res.json(await reviewService.alerts()));
staffRouter.post('/reviews/:id/handle', async (req, res) => res.json(await reviewService.handle(paramId(req), req.user)));
staffRouter.post('/staff-calls/:id/handle', async (req, res) => res.json(await staffCallService.handle(paramId(req), req.user)));

// ---- Công tắc nhận đơn QR (FEATURE-020) — nhân viên quầy bật/tắt được ----
staffRouter.get('/store', async (_req, res) => res.json(await settingsService.storeStatus()));
staffRouter.put('/store', async (req, res) => {
  const body = parse(z.object({ acceptingOrders: z.boolean(), closedMessage: zText(200).min(1).optional() }), req.body);
  const s = await settingsService.updateSettings(body);
  res.json({ acceptingOrders: s.acceptingOrders, closedMessage: s.closedMessage });
});
