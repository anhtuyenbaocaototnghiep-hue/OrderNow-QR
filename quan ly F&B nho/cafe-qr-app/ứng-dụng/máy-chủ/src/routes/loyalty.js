// API quầy giai đoạn 7 (ADR-006): điểm / tem / quà / voucher của hội viên (F-039, F-038) — xem khi thu tiền, kiểm mã voucher.
// Trừ điểm / tem / voucher chỉ xảy ra trong lượt thu (body thu tiền: voucherCode, reward) — không có API trừ riêng.
import express from 'express';
import { z } from 'zod';
import { requireStaff } from '../middleware/auth.js';
import { paramId, parse, zBirthDate, zId, zText } from '../middleware/validate.js';
import * as membersRepo from '../repositories/membersRepo.js';
import * as birthdayService from '../services/birthdayService.js';
import * as loyaltyService from '../services/loyaltyService.js';
import { notFound } from '../errors.js';

export const loyaltyRouter = express.Router();

async function member(id) {
  const m = await membersRepo.findById(id);
  if (!m || !m.isActive) throw notFound('Không tìm thấy hội viên', 'MEMBER_NOT_FOUND');
  return m;
}

loyaltyRouter.get('/members/:id/loyalty', requireStaff, async (req, res) =>
  res.json(await loyaltyService.summary(await member(paramId(req)), { staff: true })),
);
// F-068 (ADR-026 D-104): quầy ghi hộ ngày sinh (chỉ khi còn trống, là tự khai) / "khách không muốn cho" → trả lại thông tin như /loyalty
loyaltyRouter.post('/members/:id/birth-date', requireStaff, async (req, res) => {
  const { birthDate } = parse(z.object({ birthDate: zBirthDate() }), req.body);
  await birthdayService.selfSet(await member(paramId(req)), birthDate);
  res.json(await loyaltyService.summary(await member(paramId(req)), { staff: true }));
});
loyaltyRouter.post('/members/:id/birth-date/decline', requireStaff, async (req, res) => {
  await birthdayService.decline(await member(paramId(req)));
  res.json(await loyaltyService.summary(await member(paramId(req)), { staff: true }));
});
loyaltyRouter.get('/members/:id/vouchers', requireStaff, async (req, res) => res.json(await loyaltyService.vouchersOf((await member(paramId(req))).memberId)));
loyaltyRouter.post('/vouchers/validate', requireStaff, async (req, res) => {
  const body = parse(z.object({ code: zText(20).min(1, 'Nhập mã voucher'), memberId: zId().optional().nullable() }), req.body);
  res.json(await loyaltyService.validate(body.code, body.memberId ? await member(body.memberId) : null));
});
