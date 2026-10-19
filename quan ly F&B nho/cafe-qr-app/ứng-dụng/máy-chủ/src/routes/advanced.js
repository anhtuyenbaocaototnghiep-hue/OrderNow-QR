// API quản lý giai đoạn 4–8 (ADR-006). Gắn dưới /api/admin (requireAdmin ở adminRouter).
import express from 'express';
import { z } from 'zod';
import { paramId, parse, parseUtcRange, zId, zText, zTime } from '../middleware/validate.js';
import * as etaService from '../services/etaService.js';
import * as forecastService from '../services/forecastService.js';
import * as inventoryService from '../services/inventoryService.js';
import * as purchasingService from '../services/purchasingService.js';
import * as scheduleService from '../services/scheduleService.js';
import { runJob, jobStatus } from '../jobs/scheduler.js';

export const advancedRouter = express.Router();

// ---- F-040 Lịch thực đơn theo mùa / khung giờ ----
const zDateOpt = () =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
    .nullable()
    .optional()
    .transform((v) => v || null);
const scheduleBody = z
  .object({
    name: zText(100).min(1, 'Nhập tên lịch'),
    startDate: zDateOpt(),
    endDate: zDateOpt(),
    daysOfWeekMask: z.coerce.number().int().min(1, 'Chọn ít nhất một ngày trong tuần').max(127).default(127),
    startTime: zTime(),
    endTime: zTime(),
    isActive: z.boolean().default(true),
    targets: z
      .array(
        z
          .object({ menuItemId: zId().nullable().optional(), categoryId: zId().nullable().optional(), mode: z.enum(['SHOW', 'HIDE']) })
          .refine((t) => Boolean(t.menuItemId) !== Boolean(t.categoryId), 'Mỗi mục là một món hoặc một danh mục'),
      )
      .min(1, 'Chọn ít nhất một món hoặc danh mục')
      .max(200),
  })
  .refine((s) => (s.startTime === null) === (s.endTime === null) && (s.startTime === null || s.startTime !== s.endTime), {
    message: 'Nhập đủ giờ bắt đầu và kết thúc (khác nhau), hoặc để trống cả hai (cả ngày)',
    path: ['endTime'],
  })
  .refine((s) => !s.startDate || !s.endDate || s.startDate <= s.endDate, { message: 'Ngày kết thúc phải sau ngày bắt đầu', path: ['endDate'] });

advancedRouter.get('/menu-schedules', async (_req, res) => res.json(await scheduleService.list()));
advancedRouter.post('/menu-schedules', async (req, res) => res.status(201).json(await scheduleService.create(parse(scheduleBody, req.body))));
advancedRouter.get('/menu-schedules/preview', async (req, res) => {
  const { at } = parse(z.object({ at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Thời điểm dạng YYYY-MM-DDTHH:MM') }), req.query);
  res.json(await scheduleService.preview(at));
});
advancedRouter.put('/menu-schedules/:id', async (req, res) => res.json(await scheduleService.update(paramId(req), parse(scheduleBody, req.body))));
advancedRouter.patch('/menu-schedules/:id/active', async (req, res) => {
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  res.json(await scheduleService.setActive(paramId(req), isActive));
});
advancedRouter.delete('/menu-schedules/:id', async (req, res) => res.json(await scheduleService.remove(paramId(req))));

// ---- F-025 Thời gian pha: chuẩn vs thực tế ----
advancedRouter.get('/prep-stats', async (_req, res) => res.json(await etaService.prepStats()));

// ---- Job nền: trạng thái + chạy lại thủ công (nút "Tính lại") ----
advancedRouter.get('/jobs', async (_req, res) => res.json(await jobStatus()));
advancedRouter.post('/jobs/:name/run', async (req, res) => {
  const { name } = parse(z.object({ name: z.string().regex(/^[a-z0-9-]{2,40}$/) }), req.params);
  res.json(await runJob(name, { manual: true }));
});

// =================== Giai đoạn 5 — kho nâng cao ===================
const zQty3 = () => z.coerce.number().positive('Số lượng phải lớn hơn 0').max(1_000_000_000);
const zIsoDate = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD');

// ---- F-031 Đơn vị ----
advancedRouter.get('/units', async (_req, res) => res.json(await inventoryService.units()));
advancedRouter.put('/units/:code', async (req, res) => {
  const code = parse(zText(10).min(1), req.params.code);
  const body = parse(
    z
      .object({
        name: zText(30).min(1, 'Nhập tên đơn vị'),
        baseUnitCode: zText(10).optional().nullable(),
        factor: z.coerce.number().positive('Hệ số phải lớn hơn 0').max(1_000_000).optional().nullable(),
      })
      .refine((u) => !u.baseUnitCode || u.factor > 0, { message: 'Nhập hệ số quy đổi', path: ['factor'] }),
    req.body,
  );
  res.json(await inventoryService.saveUnit({ unitCode: code, ...body }));
});
advancedRouter.delete('/units/:code', async (req, res) => res.json(await inventoryService.deleteUnit(parse(zText(10).min(1), req.params.code))));

// ---- Thuộc tính kho nâng cao của nguyên liệu (F-027 loại, F-028 theo lô, F-032 hao hụt định mức) ----
advancedRouter.put('/ingredients/:id/advanced', async (req, res) => {
  const body = parse(
    z.object({
      kind: z.enum(['RAW', 'SEMI']),
      shelfLifeHours: z.coerce.number().int().min(1).max(8760).nullable().optional(),
      wastePercent: z.coerce.number().min(0).max(100).default(0),
      trackLots: z.boolean().optional(),
    }),
    req.body,
  );
  res.json(await inventoryService.setAdvanced(paramId(req), body));
});

// ---- F-027 Công thức sơ chế ----
advancedRouter.get('/ingredients/:id/recipe', async (req, res) => res.json(await inventoryService.getRecipe(paramId(req))));
advancedRouter.put('/ingredients/:id/recipe', async (req, res) => {
  const body = parse(
    z.object({
      outputQty: zQty3(),
      instructions: zText(500).optional().nullable(),
      lines: z
        .array(z.object({ ingredientId: zId(), qty: zQty3() }))
        .min(1, 'Công thức cần ít nhất một nguyên liệu')
        .max(30),
    }),
    req.body,
  );
  res.json(await inventoryService.saveRecipe(paramId(req), body));
});

// ---- F-028 Lô ----
advancedRouter.get('/ingredients/:id/lots', async (req, res) => {
  const { all } = parse(z.object({ all: z.enum(['0', '1']).default('0') }), req.query);
  res.json(await inventoryService.lotsOf(paramId(req), all === '1'));
});
advancedRouter.post('/lots/:id/write-off', async (req, res) => {
  const { note } = parse(z.object({ note: zText(200).optional().nullable() }), req.body ?? {});
  res.status(201).json(await inventoryService.writeOffLot(paramId(req), note, req.user));
});

// ---- Báo cáo kho: COGS thực tế (F-031), thất thoát (F-032), nhà cung cấp (F-030) ----
advancedRouter.get('/reports/cogs', async (req, res) => {
  const { fromUtc, toUtc } = parseUtcRange(req.query);
  res.json(await inventoryService.cogsReport(fromUtc, toUtc));
});
advancedRouter.get('/reports/loss', async (req, res) => {
  const { fromUtc, toUtc } = parseUtcRange(req.query);
  res.json(await inventoryService.lossReport(fromUtc, toUtc));
});
advancedRouter.get('/reports/suppliers', async (req, res) => {
  const { fromUtc, toUtc } = parseUtcRange(req.query);
  res.json(await purchasingService.supplierReport(fromUtc, toUtc));
});

// ---- F-030 Nhà cung cấp & PO ----
const supplierBody = z.object({
  name: zText(100).min(1, 'Nhập tên nhà cung cấp'),
  phone: zText(20).optional().nullable(),
  email: zText(100).optional().nullable(),
  leadTimeDays: z.coerce.number().int().min(0).max(60).default(1),
  deliveryDaysMask: z.coerce.number().int().min(1, 'Chọn ít nhất một ngày giao').max(127).default(127),
  note: zText(200).optional().nullable(),
  isActive: z.boolean().default(true),
  items: z
    .array(
      z.object({
        ingredientId: zId(),
        packUnitCode: zText(10).min(1),
        packSize: z.coerce.number().positive().max(1_000_000).optional().nullable(),
        lastPrice: z.coerce.number().min(0).max(1_000_000_000).optional().nullable(),
        isPreferred: z.boolean().default(false),
      }),
    )
    .max(200)
    .optional(),
});
advancedRouter.get('/suppliers', async (_req, res) => res.json(await purchasingService.suppliers()));
advancedRouter.post('/suppliers', async (req, res) => res.status(201).json(await purchasingService.saveSupplier(null, parse(supplierBody, req.body))));
advancedRouter.put('/suppliers/:id', async (req, res) => res.json(await purchasingService.saveSupplier(paramId(req), parse(supplierBody, req.body))));

const poBody = z.object({
  supplierId: zId(),
  expectedDate: zIsoDate().optional().nullable(),
  note: zText(200).optional().nullable(),
  lines: z
    .array(
      z.object({
        ingredientId: zId(),
        orderedPacks: zQty3(),
        packUnitCode: zText(10).optional().nullable(),
        packSize: z.coerce.number().positive().max(1_000_000).optional().nullable(),
        unitPrice: z.coerce.number().min(0).max(1_000_000_000).optional().nullable(),
      }),
    )
    .min(1, 'Đơn đặt hàng cần ít nhất một dòng')
    .max(100),
});
export const receiveBody = z.object({
  note: zText(200).optional().nullable(),
  confirmOver: z.boolean().default(false),
  lines: z
    .array(
      z.object({
        poLineId: zId(),
        packs: z.coerce.number().min(0).max(1_000_000).optional(),
        qty: z.coerce.number().min(0).max(1_000_000_000).optional(),
        packPrice: z.coerce.number().min(0).max(1_000_000_000).optional().nullable(),
        expiryDate: zIsoDate().optional().nullable(),
        lotCode: zText(30).optional().nullable(),
      }),
    )
    .min(1)
    .max(100),
});
advancedRouter.get('/purchase-orders', async (req, res) => {
  const { status } = parse(z.object({ status: z.string().max(60).optional() }), req.query);
  res.json(await purchasingService.listPos(status ? status.split(',') : null));
});
advancedRouter.post('/purchase-orders/from-suggestion', async (req, res) => {
  const body = parse(
    z.object({
      supplierId: zId(),
      expectedDate: zIsoDate().optional().nullable(),
      note: zText(200).optional().nullable(),
      lines: z.array(z.object({ ingredientId: zId(), packs: zQty3() })).max(100),
    }),
    req.body,
  );
  res.status(201).json(await forecastService.poFromSuggestion(body, req.user));
});
advancedRouter.get('/purchase-orders/:id', async (req, res) => res.json(await purchasingService.getPo(paramId(req))));
advancedRouter.post('/purchase-orders', async (req, res) => res.status(201).json(await purchasingService.savePo(null, parse(poBody, req.body), req.user)));
advancedRouter.put('/purchase-orders/:id', async (req, res) => res.json(await purchasingService.savePo(paramId(req), parse(poBody, req.body), req.user)));
advancedRouter.post('/purchase-orders/:id/send', async (req, res) => res.json(await purchasingService.sendPo(paramId(req))));
advancedRouter.post('/purchase-orders/:id/cancel', async (req, res) => res.json(await purchasingService.cancelPo(paramId(req))));
advancedRouter.post('/purchase-orders/:id/receive', async (req, res) =>
  res.status(201).json(await purchasingService.receivePo(paramId(req), parse(receiveBody, req.body), req.user)),
);

// ---- F-029 Dự báo nhập hàng ----
advancedRouter.get('/inventory/replenishment', async (req, res) => {
  const q = parse(z.object({ nextDeliveryDate: zIsoDate().optional(), supplierId: zId().optional() }), req.query);
  res.json(await forecastService.replenishmentPlan(q));
});
advancedRouter.get('/inventory/forecast/:id', async (req, res) => res.json(await forecastService.series(paramId(req))));
