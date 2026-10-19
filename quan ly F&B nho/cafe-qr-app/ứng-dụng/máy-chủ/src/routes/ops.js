// API kho cho quầy (STAFF / MANAGER / ADMIN) giai đoạn 5 (ADR-006, ma trận D-24): sơ chế (F-027), hủy hàng (F-032),
// lô sắp hết hạn + hủy lô (F-028), nhận hàng theo PO (F-030). Cấu hình (công thức, đơn vị, nhà cung cấp, PO) chỉ ở /api/admin.
import express from 'express';
import { z } from 'zod';
import { requirePermission } from '../auth/permissions.js';
import { requireStaff } from '../middleware/auth.js';
import { paramId, parse, parseUtcRange, zId, zText } from '../middleware/validate.js';
import * as ingredientsRepo from '../repositories/ingredientsRepo.js';
import * as inventoryService from '../services/inventoryService.js';
import * as adminService from '../services/adminService.js';
import * as purchasingService from '../services/purchasingService.js';
import * as stockService from '../services/stockService.js';
import { adjustBody } from './admin.js';
import { receiveBody } from './advanced.js';
import { stocktakeBody, stocktakeLinesBody } from './operations.js';

export const opsRouter = express.Router();

// Tồn kho xem nhanh ở quầy (khả dụng đã trừ phần giữ + lô hết hạn)
opsRouter.get('/ops/ingredients', requireStaff, async (_req, res) => res.json(await ingredientsRepo.list()));

// ---- F-027 Sơ chế ----
opsRouter.get('/prep/recipes', requireStaff, async (_req, res) => res.json(await inventoryService.semiList()));
opsRouter.get('/prep/preview', requireStaff, async (req, res) => {
  const q = parse(z.object({ semiId: zId(), multiplier: z.coerce.number().positive().max(100).default(1) }), req.query);
  res.json(await inventoryService.prepPreview(q.semiId, q.multiplier));
});
opsRouter.post('/prep/batches', requireStaff, async (req, res) => {
  const body = parse(
    z.object({
      semiIngredientId: zId(),
      multiplier: z.coerce.number().positive('Hệ số phải lớn hơn 0').max(100).default(1),
      note: zText(200).optional().nullable(),
    }),
    req.body,
  );
  res.status(201).json(await inventoryService.postBatch(body, req.user));
});
opsRouter.get('/prep/batches', requireStaff, async (req, res) => {
  const { fromUtc, toUtc } = parseUtcRange(req.query);
  res.json(await inventoryService.listBatches(fromUtc, toUtc));
});

// ---- F-032 Phiếu hủy hàng ----
opsRouter.post('/waste', requireStaff, async (req, res) => {
  const body = parse(
    z.object({
      ingredientId: zId(),
      qty: z.coerce.number().positive('Số lượng hủy phải lớn hơn 0').max(1_000_000_000),
      reason: z.enum(['SPILL', 'EXPIRED', 'QUALITY', 'OTHER']),
      note: zText(200).optional().nullable(),
    }),
    req.body,
  );
  res.status(201).json(await inventoryService.logWaste(body, req.user));
});
opsRouter.get('/waste', requireStaff, async (req, res) => {
  const { fromUtc, toUtc } = parseUtcRange(req.query);
  res.json(await inventoryService.listWaste(fromUtc, toUtc));
});

// ---- F-028 Lô sắp / đã hết hạn ----
opsRouter.get('/lots/expiring', requireStaff, async (req, res) => {
  const { days } = parse(z.object({ days: z.coerce.number().int().min(0).max(30).default(2) }), req.query);
  res.json(await inventoryService.expiringLots(days));
});
opsRouter.post('/lots/:id/write-off', requireStaff, async (req, res) => {
  const { note } = parse(z.object({ note: zText(200).optional().nullable() }), req.body ?? {});
  res.status(201).json(await inventoryService.writeOffLot(paramId(req), note, req.user));
});

// ---- F-030 Nhận hàng theo PO ----
opsRouter.get('/receiving/purchase-orders', requireStaff, async (_req, res) => res.json(await purchasingService.listPos(['SENT', 'PARTIAL'])));
opsRouter.get('/receiving/purchase-orders/:id', requireStaff, async (req, res) => res.json(await purchasingService.getPo(paramId(req))));
opsRouter.post('/receiving/purchase-orders/:id/receive', requireStaff, async (req, res) =>
  res.status(201).json(await purchasingService.receivePo(paramId(req), parse(receiveBody, req.body), req.user)),
);

// ---- F-036 Trưởng ca: điều chỉnh kho tay + kiểm kê (D-24 — nhân viên không được) ----
const canAdjust = requirePermission('inventory.adjust');
const canCount = requirePermission('stocktake.post');
opsRouter.post('/ops/ingredients/:id/adjust', canAdjust, async (req, res) =>
  res.json(await adminService.adjustIngredient(paramId(req), parse(adjustBody, req.body), req.user)),
);
opsRouter.get('/ops/ingredients/:id/transactions', canAdjust, async (req, res) => res.json(await adminService.ingredientTransactions(paramId(req))));
opsRouter.get('/ops/stocktakes', canCount, async (_req, res) => res.json(await stockService.listStocktakes()));
opsRouter.get('/ops/stocktakes/:id', canCount, async (req, res) => res.json(await stockService.getStocktake(paramId(req))));
opsRouter.post('/ops/stocktakes', canCount, async (req, res) =>
  res.status(201).json(await stockService.createStocktake(parse(stocktakeBody, req.body ?? {}), req.user)),
);
opsRouter.put('/ops/stocktakes/:id/lines', canCount, async (req, res) =>
  res.json(await stockService.updateCounts(paramId(req), parse(stocktakeLinesBody, req.body))),
);
opsRouter.post('/ops/stocktakes/:id/post', canCount, async (req, res) => res.json(await stockService.post(paramId(req), req.user)));
opsRouter.delete('/ops/stocktakes/:id', canCount, async (req, res) => res.json(await stockService.removeDraft(paramId(req))));
