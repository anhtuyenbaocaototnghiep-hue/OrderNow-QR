// API quản lý vận hành (chỉ ADMIN — gắn dưới /api/admin): tùy chọn món (F-013), cài đặt quán (F-020, F-022, D-5…D-14),
// lịch sử ca (F-018), hoàn tiền (F-019), nhập kho & kiểm kê + giá vốn/hao hụt (F-023).
import express from 'express';
import { z } from 'zod';
import { badRequest } from '../errors.js';
import { paramId, parse, parseRange, zId, zMoney, zText } from '../middleware/validate.js';
import * as modifierService from '../services/modifierService.js';
import * as refundService from '../services/refundService.js';
import * as settingsService from '../services/settingsService.js';
import * as shiftService from '../services/shiftService.js';
import * as stockService from '../services/stockService.js';
import { addDays, todayVn, vnDayStartUtc } from '../utils/time.js';

export const operationsRouter = express.Router();

const utcRange = (query) => {
  const { from, to } = parseRange(query);
  return { from, to, fromUtc: vnDayStartUtc(from), toUtc: vnDayStartUtc(addDays(to, 1)) };
};

// ---- Tùy chọn món ----
const groupBody = z.object({
  name: zText(50).min(1, 'Nhập tên nhóm'),
  minSelect: z.coerce.number().int().min(0).max(20).default(0),
  maxSelect: z.coerce.number().int().min(1).max(20).default(1),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
  options: z
    .array(
      z.object({
        optionId: zId().optional().nullable(),
        name: zText(50).min(1, 'Nhập tên tùy chọn'),
        priceDelta: z.coerce.number().int().min(0, 'Phụ thu không âm').max(10_000_000).default(0),
        isDefault: z.boolean().default(false),
        isActive: z.boolean().default(true),
        bom: z
          .array(z.object({ ingredientId: zId(), amount: z.coerce.number().positive('Định lượng phải lớn hơn 0').max(1_000_000) }))
          .max(20)
          .default([]),
      }),
    )
    .min(1, 'Nhóm cần ít nhất một tùy chọn')
    .max(30),
});
operationsRouter.get('/modifier-groups', async (_req, res) => res.json(await modifierService.listGroups()));
operationsRouter.post('/modifier-groups', async (req, res) => res.status(201).json(await modifierService.saveGroup(null, parse(groupBody, req.body))));
operationsRouter.put('/modifier-groups/:id', async (req, res) => res.json(await modifierService.saveGroup(paramId(req), parse(groupBody, req.body))));
operationsRouter.delete('/modifier-groups/:id', async (req, res) => res.json({ result: await modifierService.removeGroup(paramId(req)) }));

// ---- Cài đặt ----
operationsRouter.get('/settings', async (_req, res) => res.json(await settingsService.getSettings()));
operationsRouter.put('/settings', async (req, res) => {
  const body = parse(
    z.object({
      acceptingOrders: z.boolean().optional(),
      closedMessage: zText(200).min(1).optional(),
      firstOrderPercent: z.coerce.number().min(0).max(50).optional(),
      roundTo: z.coerce
        .number()
        .int()
        .refine((v) => [1, 100, 500, 1000].includes(v), 'Làm tròn 1, 100, 500 hoặc 1.000đ')
        .optional(),
      staffMaxPercent: z.coerce.number().min(0).max(100).optional(),
      staffMaxAmount: zMoney().optional(),
      // F-025 thời gian chờ (D-18)
      etaBaseSeconds: z.coerce.number().int().min(0).max(3600).optional(),
      kitchenParallelism: z.coerce.number().int().min(1).max(10).optional(),
      etaSpreadPercent: z.coerce.number().int().min(0).max(100).optional(),
      etaDefaultItemSeconds: z.coerce.number().int().min(10).max(3600).optional(),
      // F-031 giá vốn (D-21) · F-029 tồn an toàn (D-22)
      costMethod: z.enum(['AVG', 'FIFO']).optional(),
      forecastSafetyPercent: z.coerce.number().int().min(0).max(200).optional(),
      // F-036 trưởng ca (D-24) · F-033 ngưỡng duyệt chi quỹ (D-23)
      managerMaxPercent: z.coerce.number().min(0).max(100).optional(),
      managerMaxAmount: zMoney().optional(),
      managerRefundSameShiftOnly: z.boolean().optional(),
      managerCashApproveMax: zMoney().optional(),
      cashApproveThreshold: zMoney().optional(),
    }),
    req.body,
  );
  res.json(await settingsService.updateSettings(body));
});

// ---- Ca + hoàn tiền ----
operationsRouter.get('/shifts', async (req, res) => {
  const { fromUtc, toUtc } = utcRange(req.query);
  res.json(await shiftService.list(fromUtc, toUtc));
});
operationsRouter.get('/refunds', async (req, res) => {
  const { fromUtc, toUtc } = utcRange(req.query);
  res.json(await refundService.list(fromUtc, toUtc));
});

// ---- Nhập kho ----
operationsRouter.get('/stock-receipts', async (req, res) => {
  const { fromUtc, toUtc } = utcRange(req.query);
  res.json(await stockService.listReceipts(fromUtc, toUtc));
});
operationsRouter.get('/stock-receipts/:id', async (req, res) => res.json(await stockService.getReceipt(paramId(req))));
operationsRouter.post('/stock-receipts', async (req, res) => {
  const body = parse(
    z.object({
      supplier: zText(100).optional().nullable(),
      note: zText(200).optional().nullable(),
      lines: z
        .array(
          z.object({
            ingredientId: zId(),
            qty: z.coerce.number().positive('Số lượng nhập phải lớn hơn 0').max(1_000_000_000).optional().nullable(),
            unitCost: z.coerce.number().min(0, 'Giá nhập không âm').max(1_000_000_000).nullable().optional(),
            // F-031 đơn vị đóng gói · F-028 hạn dùng / mã lô
            packUnitCode: zText(10).optional().nullable(),
            packQty: z.coerce.number().positive().max(1_000_000_000).optional().nullable(),
            packPrice: z.coerce.number().min(0).max(1_000_000_000).optional().nullable(),
            expiryDate: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .optional()
              .nullable(),
            lotCode: zText(30).optional().nullable(),
          }),
        )
        .min(1, 'Phiếu nhập cần ít nhất một dòng')
        .max(100)
        .refine((ls) => ls.every((l) => (l.packUnitCode ? l.packQty > 0 : l.qty > 0)), 'Nhập số lượng cho từng dòng'),
    }),
    req.body,
  );
  res.status(201).json(await stockService.receive(body, req.user));
});

// ---- Kiểm kê ----
operationsRouter.get('/stocktakes', async (_req, res) => res.json(await stockService.listStocktakes()));
operationsRouter.get('/stocktakes/:id', async (req, res) => res.json(await stockService.getStocktake(paramId(req))));
// Dùng chung cho trưởng ca (/api/ops/stocktakes — F-036)
export const stocktakeBody = z.object({ ingredientIds: z.array(zId()).max(500).optional(), note: zText(200).optional().nullable() });
export const stocktakeLinesBody = z
  .array(
    z.object({
      ingredientId: zId(),
      countedQty: z.coerce.number().min(0, 'Số đếm không âm').max(1_000_000_000).nullable(),
      note: zText(200).optional().nullable(),
    }),
  )
  .max(500);
operationsRouter.post('/stocktakes', async (req, res) => {
  res.status(201).json(await stockService.createStocktake(parse(stocktakeBody, req.body ?? {}), req.user));
});
operationsRouter.put('/stocktakes/:id/lines', async (req, res) => res.json(await stockService.updateCounts(paramId(req), parse(stocktakeLinesBody, req.body))));
operationsRouter.post('/stocktakes/:id/post', async (req, res) => res.json(await stockService.post(paramId(req), req.user)));
operationsRouter.delete('/stocktakes/:id', async (req, res) => res.json(await stockService.removeDraft(paramId(req))));

// ---- Giá vốn & hao hụt ----
operationsRouter.get('/reports/costs', async (req, res) => {
  const { from, to, fromUtc, toUtc } = utcRange(req.query);
  if (to > todayVn()) throw badRequest('INVALID_RANGE', 'Khoảng thời gian không hợp lệ');
  res.json({ from, to, ...(await stockService.costReport(fromUtc, toUtc)) });
});
