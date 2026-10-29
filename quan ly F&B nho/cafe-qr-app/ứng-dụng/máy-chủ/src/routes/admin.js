// API quản trị (chỉ ADMIN): danh mục, món, BOM, bàn + QR, nguyên liệu/kho, tài khoản, báo cáo, lịch sử đơn/thu tiền.
import express from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { paramId, parse, zDate, zId, zText, zTime } from '../middleware/validate.js';
import * as adminService from '../services/adminService.js';
import * as qrCheckService from '../services/qrCheckService.js';
import * as userService from '../services/userService.js';
import { badRequest } from '../errors.js';
import { isValidDate } from '../utils/time.js';
import { marketingRouter } from './marketing.js';
import { operationsRouter } from './operations.js';
import { advancedRouter } from './advanced.js';
import { financeAdminRouter } from './financeAdmin.js';
import { analyticsAdminRouter } from './analytics.js';
import { apiDocsRouter } from './apiDocs.js';

export const adminRouter = express.Router();
adminRouter.use(requireAdmin);

const zQty = () => z.coerce.number().min(0).max(1_000_000_000);
const zBool = () => z.boolean();

// ---- Danh mục ----
// Giờ bán (F-020): để trống cả hai = bán cả ngày; giờ bắt đầu > giờ kết thúc = qua nửa đêm
const categoryBody = z
  .object({
    name: zText(50).min(1, 'Nhập tên danh mục'),
    sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
    sellFrom: zTime(),
    sellTo: zTime(),
  })
  .refine((c) => (c.sellFrom === null) === (c.sellTo === null) && (c.sellFrom === null || c.sellFrom !== c.sellTo), {
    message: 'Nhập đủ giờ bắt đầu và kết thúc (khác nhau), hoặc để trống cả hai',
    path: ['sellTo'],
  });
adminRouter.get('/categories', async (_req, res) => res.json(await adminService.listCategories()));
adminRouter.post('/categories', async (req, res) => res.status(201).json(await adminService.createCategory(parse(categoryBody, req.body))));
adminRouter.put('/categories/:id', async (req, res) => res.json(await adminService.updateCategory(paramId(req), parse(categoryBody, req.body))));
// Xóa (ADR-004): 200 { result: 'DELETED' | 'ARCHIVED' }
adminRouter.delete('/categories/:id', async (req, res) => res.json({ result: await adminService.deleteCategory(paramId(req)) }));

// ---- Món ----
const itemBody = z.object({
  categoryId: zId(),
  name: zText(100).min(1, 'Nhập tên món'),
  price: z.coerce.number().int('Giá phải là số nguyên (VND)').min(0, 'Giá không được âm').max(100_000_000),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .refine((s) => s === '' || /^(https?:\/\/|\/)[^\s]*$/i.test(s), 'Ảnh phải là URL http(s) hoặc đường dẫn bắt đầu bằng /')
    .optional()
    .nullable()
    .transform((s) => s || null),
  isAvailable: zBool().default(true),
  isActive: zBool().default(true),
  groupIds: z.array(zId()).max(20).optional(), // nhóm tùy chọn món (F-013); vắng = giữ nguyên
  prepSeconds: z.coerce.number().int().min(10, 'Thời gian pha tối thiểu 10 giây').max(3600).nullable().optional(), // F-025; vắng = giữ nguyên
});
adminRouter.get('/menu-items', async (_req, res) => res.json(await adminService.listItems()));
adminRouter.post('/menu-items', async (req, res) => res.status(201).json(await adminService.createItem(parse(itemBody, req.body))));
adminRouter.put('/menu-items/:id', async (req, res) => res.json(await adminService.updateItem(paramId(req), parse(itemBody, req.body))));
adminRouter.delete('/menu-items/:id', async (req, res) => res.json({ result: await adminService.deleteItem(paramId(req)) }));
adminRouter.patch('/menu-items/:id/availability', async (req, res) => {
  const { isAvailable } = parse(z.object({ isAvailable: zBool() }), req.body);
  res.json(await adminService.setAvailability(paramId(req), isAvailable));
});

// ---- BOM (BR-003) ----
adminRouter.get('/menu-items/:id/bom', async (req, res) => res.json(await adminService.getBom(paramId(req))));
adminRouter.put('/menu-items/:id/bom', async (req, res) => {
  const rows = parse(z.array(z.object({ ingredientId: z.any(), amount: z.any() })).max(50, 'Tối đa 50 nguyên liệu'), req.body);
  const toNumber = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  res.json(
    await adminService.replaceBom(
      paramId(req),
      rows.map((r) => ({ ingredientId: Number.isInteger(toNumber(r.ingredientId)) ? toNumber(r.ingredientId) : null, amount: toNumber(r.amount) })),
    ),
  );
});

// ---- Bàn + QR ----
const tableCode = () =>
  z
    .string()
    .trim()
    .min(1, 'Nhập mã bàn')
    .max(10)
    .regex(/^[A-Za-z0-9-]+$/, 'Mã bàn chỉ gồm chữ, số, dấu -');
adminRouter.get('/tables', async (_req, res) => res.json(await adminService.listTables()));
adminRouter.post('/tables', async (req, res) => {
  res.status(201).json(await adminService.createTable(parse(z.object({ code: tableCode(), name: zText(50).optional() }), req.body)));
});
adminRouter.put('/tables/:id', async (req, res) => {
  const body = parse(z.object({ code: tableCode(), name: zText(50).min(1, 'Nhập tên bàn'), isActive: zBool() }), req.body);
  res.json(await adminService.updateTable(paramId(req), body));
});
adminRouter.post('/tables/:id/regenerate-qr', async (req, res) => res.json(await adminService.regenerateQr(paramId(req))));
// F-063 (ADR-021 D-82): trang In mã QR báo vừa in → lưu địa chỉ máy chủ đang chạy
adminRouter.post('/qr-printed', async (_req, res) => res.json(await qrCheckService.markPrinted()));
adminRouter.delete('/tables/:id', async (req, res) => res.json({ result: await adminService.deleteTable(paramId(req)) }));
adminRouter.get('/tables/:id/qr.png', async (req, res) => {
  const { table, png } = await adminService.qrPng(paramId(req));
  res.set('Content-Type', 'image/png');
  res.set('Content-Disposition', `inline; filename="qr-ban-${table.code}.png"`);
  res.set('Cache-Control', 'no-store');
  res.send(png);
});
// F-059: QR Wi-Fi cho khách (in cạnh QR bàn)
adminRouter.get('/wifi-qr.png', async (_req, res) => {
  const png = await adminService.wifiQrPng();
  res.set('Content-Type', 'image/png');
  res.set('Content-Disposition', 'inline; filename="qr-wifi.png"');
  res.set('Cache-Control', 'no-store');
  res.send(png);
});

// ---- Nguyên liệu / kho (FEATURE-011) ----
const ingredientBase = {
  name: zText(100).min(1, 'Nhập tên nguyên liệu'),
  unit: zText(10).min(1, 'Nhập đơn vị'),
  lowStockThreshold: zQty(),
};
adminRouter.get('/ingredients', async (_req, res) => res.json(await adminService.listIngredients()));
adminRouter.post('/ingredients', async (req, res) => {
  const body = parse(z.object({ ...ingredientBase, stockQty: zQty() }), req.body);
  res.status(201).json(await adminService.createIngredient(body, req.user));
});
adminRouter.put('/ingredients/:id', async (req, res) => {
  const body = parse(z.object({ ...ingredientBase, isActive: zBool() }), req.body);
  res.json(await adminService.updateIngredient(paramId(req), body));
});
// Dùng chung cho trưởng ca (/api/ops/ingredients/:id/adjust — F-036)
export const adjustBody = z
  .object({
    newQty: z.coerce.number().min(0, 'Tồn kho không được âm').max(1_000_000_000).optional(),
    delta: z.coerce.number().min(-1_000_000_000).max(1_000_000_000).optional(),
    reason: zText(200).min(1, 'Nhập lý do điều chỉnh'),
  })
  .refine((b) => (b.newQty === undefined) !== (b.delta === undefined), 'Nhập số mới HOẶC số cộng/trừ');
adminRouter.post('/ingredients/:id/adjust', async (req, res) => {
  res.json(await adminService.adjustIngredient(paramId(req), parse(adjustBody, req.body), req.user));
});
adminRouter.get('/ingredients/:id/transactions', async (req, res) => res.json(await adminService.ingredientTransactions(paramId(req))));
adminRouter.delete('/ingredients/:id', async (req, res) => res.json({ result: await adminService.deleteIngredient(paramId(req)) }));

// ---- Tài khoản (FEATURE-009) ----
const role = () => z.enum(['STAFF', 'MANAGER', 'ADMIN']); // F-036 trưởng ca
const password = () => z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').max(100);
adminRouter.get('/users', async (_req, res) => res.json(await userService.list()));
adminRouter.post('/users', async (req, res) => {
  const body = parse(
    z.object({
      username: z
        .string()
        .trim()
        .min(3, 'Tên đăng nhập tối thiểu 3 ký tự')
        .max(50)
        .regex(/^[A-Za-z0-9._-]+$/, 'Chỉ gồm chữ không dấu, số, dấu . _ -'),
      password: password(),
      fullName: zText(100).min(1, 'Nhập họ tên'),
      role: role(),
    }),
    req.body,
  );
  res.status(201).json(await userService.create(body));
});
adminRouter.put('/users/:id', async (req, res) => {
  const body = parse(z.object({ fullName: zText(100).min(1, 'Nhập họ tên'), role: role() }), req.body);
  res.json(await userService.update(paramId(req), body, req.user));
});
adminRouter.post('/users/:id/reset-password', async (req, res) => {
  const body = parse(z.object({ password: password() }), req.body);
  await userService.resetPassword(paramId(req), body.password);
  res.json({ ok: true });
});
adminRouter.delete('/users/:id', async (req, res) => res.json({ result: await userService.remove(paramId(req), req.user) }));
adminRouter.patch('/users/:id/active', async (req, res) => {
  const { isActive } = parse(z.object({ isActive: zBool() }), req.body);
  res.json(await userService.setActive(paramId(req), isActive, req.user));
});

// ---- Marketing & Khách hàng, vận hành (ADR-005) ----
adminRouter.use(marketingRouter);
adminRouter.use(operationsRouter);
adminRouter.use(advancedRouter); // ADR-006 giai đoạn 4–8
adminRouter.use(financeAdminRouter); // ADR-006 giai đoạn 6: sổ quỹ, nhân sự, nhật ký, lãi/lỗ
adminRouter.use(analyticsAdminRouter); // ADR-006 giai đoạn 8: menu engineering, phân tích
adminRouter.use(apiDocsRouter); // F-052 (ADR-011): tra cứu API

// ---- Báo cáo (FEATURE-012), lịch sử đơn (Q-014), thu tiền ----
function range(query) {
  const q = parse(z.object({ from: zDate(), to: zDate() }).passthrough(), query);
  if (!isValidDate(q.from) || !isValidDate(q.to)) throw badRequest('INVALID_RANGE', 'Khoảng thời gian không hợp lệ');
  return q;
}
adminRouter.get('/reports/revenue', async (req, res) => {
  const { from, to } = range(req.query);
  res.json(await adminService.revenueReport(from, to));
});
adminRouter.get('/payments', async (req, res) => {
  const { from, to } = range(req.query);
  res.json(await adminService.paymentsReport(from, to));
});
adminRouter.get('/orders', async (req, res) => {
  const { from, to } = range(req.query);
  const q = parse(
    z.object({
      status: z.enum(['PENDING', 'PREPARING', 'COMPLETED', 'CANCELLED', 'VOIDED']).optional(),
      type: z.enum(['DINE_IN', 'TAKE_AWAY']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    }),
    { status: req.query.status || undefined, type: req.query.type || undefined, page: req.query.page, pageSize: req.query.pageSize },
  );
  res.json(await adminService.orderHistory({ from, to, ...q }));
});
