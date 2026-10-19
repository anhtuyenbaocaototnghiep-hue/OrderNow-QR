// API quản lý giai đoạn 6 (chỉ ADMIN — gắn dưới /api/admin): sổ quỹ + danh mục + CSV (F-033), lịch làm + năng suất (F-035),
// nhật ký thao tác chỉ đọc (F-035, D-26), chi phí cố định + lãi/lỗ ước tính (F-034, D-31).
import express from 'express';
import { z } from 'zod';
import { badRequest } from '../errors.js';
import { paramId, parse, parseRange, parseUtcRange, zId, zMoney, zText } from '../middleware/validate.js';
import * as auditRepo from '../repositories/auditRepo.js';
import * as attendanceService from '../services/attendanceService.js';
import * as cashService from '../services/cashService.js';
import * as pnlService from '../services/pnlService.js';
import { sendCsv } from '../utils/csv.js';
import { isValidDate } from '../utils/time.js';

export const financeAdminRouter = express.Router();

const zIsoDate = () =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
    .refine(isValidDate, 'Ngày không hợp lệ');
const zHhmm = () => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải có dạng HH:MM');

// ---- F-033 Sổ quỹ ----
const bookFilter = (query) => {
  const { fromUtc, toUtc, from, to } = parseUtcRange(query);
  const q = parse(
    z
      .object({
        categoryId: zId().optional(),
        status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
        direction: z.enum(['IN', 'OUT']).optional(),
      })
      .passthrough(),
    { ...query, categoryId: query.categoryId || undefined, status: query.status || undefined, direction: query.direction || undefined },
  );
  return { from, to, filter: { fromUtc, toUtc, categoryId: q.categoryId ?? null, status: q.status ?? null, direction: q.direction ?? null } };
};
financeAdminRouter.get('/cash-transactions', async (req, res) => {
  const { from, to, filter } = bookFilter(req.query);
  res.json({ from, to, ...(await cashService.book(filter)) });
});
const STATUS_VI = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối' };
const vnTime = (d) => new Date(new Date(d).getTime() + 7 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
financeAdminRouter.get('/cash-transactions/export.csv', async (req, res) => {
  const { from, to, filter } = bookFilter(req.query);
  const { rows } = await cashService.book(filter);
  sendCsv(
    res,
    `so-quy_${from}_${to}.csv`,
    ['Thời gian', 'Ca', 'Loại', 'Danh mục', 'Số tiền', 'Nội dung', 'Trạng thái', 'Người ghi', 'Người duyệt', 'Lý do từ chối', 'Có ảnh HĐ'],
    rows.map((t) => [
      vnTime(t.createdAt),
      t.shiftId,
      t.direction === 'IN' ? 'Thu' : 'Chi',
      t.category.name,
      t.direction === 'IN' ? t.amount : -t.amount,
      t.reason,
      STATUS_VI[t.status],
      t.createdBy.fullName,
      t.approvedBy?.fullName ?? '',
      t.rejectReason ?? '',
      t.hasReceipt ? 'có' : '',
    ]),
  );
});

const categoryBody = z.object({
  name: zText(50).min(1, 'Nhập tên danh mục'),
  direction: z.enum(['IN', 'OUT']),
  isExpense: z.boolean().default(false),
  requiresApproval: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});
financeAdminRouter.get('/cash-categories', async (_req, res) => res.json(await cashService.categories({ all: true })));
financeAdminRouter.post('/cash-categories', async (req, res) => res.status(201).json(await cashService.saveCategory(null, parse(categoryBody, req.body))));
financeAdminRouter.put('/cash-categories/:id', async (req, res) => res.json(await cashService.saveCategory(paramId(req), parse(categoryBody, req.body))));
financeAdminRouter.delete('/cash-categories/:id', async (req, res) => res.json({ result: await cashService.removeCategory(paramId(req)) }));

// ---- F-035 Lịch làm + năng suất ----
const rosterBody = z
  .object({
    userId: zId(),
    workDate: zIsoDate(),
    startTime: zHhmm(),
    endTime: zHhmm(),
    note: zText(100).optional().nullable(),
  })
  .refine((r) => r.startTime !== r.endTime, 'Giờ bắt đầu và kết thúc phải khác nhau');
financeAdminRouter.get('/rosters', async (req, res) => {
  const { from, to } = parseRange(req.query);
  res.json(await attendanceService.rosters(from, to));
});
financeAdminRouter.post('/rosters', async (req, res) => res.status(201).json(await attendanceService.saveRoster(null, parse(rosterBody, req.body), req.user)));
financeAdminRouter.put('/rosters/:id', async (req, res) => res.json(await attendanceService.saveRoster(paramId(req), parse(rosterBody, req.body), req.user)));
financeAdminRouter.delete('/rosters/:id', async (req, res) => res.json({ result: await attendanceService.removeRoster(paramId(req)) }));
financeAdminRouter.post('/rosters/copy-week', async (req, res) => {
  const body = parse(z.object({ fromWeek: zIsoDate(), toWeek: zIsoDate() }), req.body);
  if (body.fromWeek === body.toWeek) throw badRequest('VALIDATION_ERROR', 'Chọn tuần đích khác tuần nguồn');
  res.json(await attendanceService.copyWeek(body.fromWeek, body.toWeek, req.user));
});
financeAdminRouter.get('/reports/productivity', async (req, res) => {
  const { from, to, fromUtc, toUtc } = parseUtcRange(req.query);
  res.json({ from, to, rows: await attendanceService.productivity(fromUtc, toUtc) });
});

// ---- F-035 Nhật ký thao tác (chỉ đọc) ----
financeAdminRouter.get('/audit-logs/facets', async (_req, res) => res.json(await auditRepo.facets()));
financeAdminRouter.get('/audit-logs', async (req, res) => {
  const { fromUtc, toUtc } = parseUtcRange(req.query);
  const q = parse(
    z
      .object({
        userId: zId().optional(),
        entity: zText(40).optional(),
        entityId: zText(60).optional(),
        action: zText(60).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
      })
      .passthrough(),
    Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== '')),
  );
  res.json(
    await auditRepo.list({
      fromUtc,
      toUtc,
      userId: q.userId ?? null,
      entity: q.entity || null,
      entityId: q.entityId || null,
      action: q.action || null,
      page: q.page,
      pageSize: q.pageSize,
    }),
  );
});

// ---- F-034 Chi phí cố định + lãi/lỗ ----
const fixedCostBody = z.object({
  name: zText(100).min(1, 'Nhập tên khoản chi phí'),
  monthlyAmount: zMoney(),
  effectiveFrom: zIsoDate(),
  effectiveTo: zIsoDate().nullable().optional(),
});
financeAdminRouter.get('/fixed-costs', async (_req, res) => res.json(await pnlService.fixedCosts()));
financeAdminRouter.post('/fixed-costs', async (req, res) => res.status(201).json(await pnlService.saveFixedCost(null, parse(fixedCostBody, req.body))));
financeAdminRouter.put('/fixed-costs/:id', async (req, res) => res.json(await pnlService.saveFixedCost(paramId(req), parse(fixedCostBody, req.body))));
financeAdminRouter.delete('/fixed-costs/:id', async (req, res) => res.json({ result: await pnlService.removeFixedCost(paramId(req)) }));
financeAdminRouter.get('/reports/pnl', async (req, res) => {
  const { from, to } = parseRange(req.query);
  const { groupBy } = parse(z.object({ groupBy: z.enum(['day', 'month']).default('day') }).passthrough(), req.query);
  res.json(await pnlService.report(from, to, groupBy));
});
