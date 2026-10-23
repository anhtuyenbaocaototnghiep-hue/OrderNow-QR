// API quầy giai đoạn 6 (ADR-006, ma trận quyền D-24 — src/auth/permissions.js): đăng xuất + chấm công ra (F-035),
// sổ quỹ ca (F-033: ghi thu/chi, ảnh hóa đơn, duyệt / từ chối), chấm công (trưởng ca / quản lý sửa, có lý do).
import express from 'express';
import { z } from 'zod';
import { requirePermission } from '../auth/permissions.js';
import { badRequest } from '../errors.js';
import { requireStaff } from '../middleware/auth.js';
import { paramId, parse, parseUtcRange, zId, zMoney, zText } from '../middleware/validate.js';
import * as usersRepo from '../repositories/usersRepo.js';
import * as attendanceService from '../services/attendanceService.js';
import * as cashService from '../services/cashService.js';
import * as shiftService from '../services/shiftService.js';

export const financeRouter = express.Router();

// ---- Đăng xuất: kết thúc chấm công (D-25) ----
financeRouter.post('/auth/logout', requireStaff, async (req, res) => {
  await shiftService.assertCanLogout(req.user); // F-054: người mở ca phải đóng ca trước (409 SHIFT_OPEN, chưa ghi giờ ra)
  res.json({ clockedOut: await attendanceService.onLogout(req.user) });
});

// ---- F-033 Sổ quỹ ----
const approvalCreds = { adminUsername: zText(50).optional(), adminPassword: z.string().max(100).optional() };

financeRouter.get('/cash-categories', requireStaff, async (_req, res) => res.json(await cashService.categories()));
financeRouter.get('/cash-transactions', requirePermission('cash.create'), async (req, res) => {
  const q = parse(z.object({ shiftId: zId().optional() }), req.query);
  const shiftId = q.shiftId ?? (await shiftService.current())?.shiftId;
  res.json(shiftId ? await cashService.listByShift(shiftId) : []);
});
financeRouter.post('/cash-transactions', requirePermission('cash.create'), async (req, res) => {
  const body = parse(
    z.object({
      categoryId: zId(),
      amount: zMoney().min(1, 'Số tiền phải lớn hơn 0'),
      reason: zText(200).min(1, 'Nhập lý do / nội dung thu chi'),
    }),
    req.body,
  );
  res.status(201).json(await cashService.create(body, req.user));
});
// Ảnh hóa đơn: thân request là ảnh (image/jpeg|png|webp), tối đa 2 MB — ADR-006 (không dùng multipart)
const rawImage = [
  express.raw({ type: ['image/*', 'application/octet-stream'], limit: cashService.MAX_RECEIPT_BYTES }),
  (err, _req, _res, next) => next(err?.type === 'entity.too.large' ? badRequest('RECEIPT_TOO_LARGE', 'Ảnh hóa đơn tối đa 2 MB') : err),
];
financeRouter.put('/cash-transactions/:id/receipt', requirePermission('cash.create'), ...rawImage, async (req, res) =>
  res.json(await cashService.attachReceipt(paramId(req), req.body, req.user)),
);
financeRouter.get('/cash-transactions/:id/receipt', requireStaff, async (req, res) => {
  const { file, contentType } = await cashService.receiptFile(paramId(req));
  res.sendFile(file, { headers: { 'Content-Type': contentType, 'Cache-Control': 'private, no-store' } });
});
financeRouter.post('/cash-transactions/:id/approve', requireStaff, async (req, res) => {
  const body = parse(z.object(approvalCreds), req.body ?? {});
  res.json(await cashService.review(paramId(req), true, body, req.user));
});
// F-050: hủy / sửa khoản đã duyệt (ca còn mở) — sửa = hủy + khoản thay thế
financeRouter.post('/cash-transactions/:id/void', requireStaff, async (req, res) => {
  const body = parse(
    z.object({
      reason: zText(200).min(1, 'Nhập lý do hủy / sửa khoản'),
      replacement: z
        .object({
          categoryId: zId(),
          amount: zMoney().min(1, 'Số tiền phải lớn hơn 0'),
          reason: zText(180).min(1, 'Nhập nội dung khoản mới'),
        })
        .optional(),
      ...approvalCreds,
    }),
    req.body ?? {},
  );
  res.json(await cashService.voidTxn(paramId(req), body, req.user));
});
financeRouter.post('/cash-transactions/:id/reject', requireStaff, async (req, res) => {
  const body = parse(z.object({ rejectReason: zText(200).min(1, 'Nhập lý do từ chối'), ...approvalCreds }), req.body ?? {});
  res.json(await cashService.review(paramId(req), false, body, req.user));
});

// ---- F-035 Chấm công ----
const zInstant = () => z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const attendanceBody = {
  clockIn: zInstant(),
  clockOut: zInstant().nullable().optional(),
  reason: zText(200).min(1, 'Nhập lý do sửa chấm công'),
};

financeRouter.get('/attendance/me', requireStaff, async (req, res) => res.json({ open: await attendanceService.mine(req.user) }));
financeRouter.get('/attendance/users', requirePermission('attendance.edit'), async (_req, res) =>
  res.json((await usersRepo.list()).filter((u) => u.isActive).map(({ userId, fullName, role }) => ({ userId, fullName, role }))),
);
financeRouter.get('/attendance', requirePermission('attendance.edit'), async (req, res) => {
  const { fromUtc, toUtc } = parseUtcRange(req.query);
  const { userId } = parse(z.object({ userId: zId().optional() }).passthrough(), req.query);
  res.json(await attendanceService.list({ fromUtc, toUtc, userId: userId ?? null }));
});
financeRouter.post('/attendance', requirePermission('attendance.edit'), async (req, res) => {
  const body = parse(z.object({ userId: zId(), ...attendanceBody }), req.body);
  res.status(201).json(await attendanceService.createManual({ ...body, clockOut: body.clockOut ?? null }, req.user));
});
financeRouter.put('/attendance/:id', requirePermission('attendance.edit'), async (req, res) => {
  const body = parse(z.object(attendanceBody), req.body);
  res.json(await attendanceService.update(paramId(req), { ...body, clockOut: body.clockOut ?? null }, req.user));
});
