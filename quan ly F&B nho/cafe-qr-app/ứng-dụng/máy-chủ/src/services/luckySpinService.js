// F-065 vòng quay may mắn sau khi thanh toán (ADR-024 D-89…D-92).
// Mỗi lượt thu đủ mức → một mã quay (tạo khi in hóa đơn / khi khách mở màn cảm ơn). Máy chủ chọn ô (crypto) rồi sp_SpinLucky ghi kết quả
// trong một transaction có khóa ngân sách; trang quay chỉ diễn hoạt tới ô đã chọn.
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { pickSlice, validatePrizes, visibleSlices } from '../domain/luckySpin.js';
import { badRequest, fromSqlError, notFound } from '../errors.js';
import * as luckySpinRepo from '../repositories/luckySpinRepo.js';
import { addDays, todayVn, vnDayStartUtc } from '../utils/time.js';
import { newQrToken } from '../utils/tokens.js';
import { getSettings, shopInfo, updateSettings } from './settingsService.js';

const spinUrl = (token) => `${config.publicBaseUrl}/quay/${token}`;
const randUnit = () => crypto.randomInt(0, 1_000_000) / 1_000_000;
const sliceView = (p) => ({ prizeId: p.prizeId, label: p.label, kind: p.kind });

/** Lượt quay của một lượt thu — tạo nếu đủ điều kiện (D-89). → spin | null */
async function ensureForPayment(paymentId, s) {
  if (!s.spinEnabled) return null;
  const existing = await luckySpinRepo.byPayment(paymentId);
  if (existing) return existing;
  const p = await luckySpinRepo.payment(paymentId);
  if (!p || p.refunded || p.amountDue < s.spinMinAmount) return null;
  const expiresAt = new Date(new Date(p.paidAt).getTime() + s.spinExpireHours * 3_600_000);
  if (expiresAt <= new Date()) return null;
  return luckySpinRepo.ensure({ paymentId, token: newQrToken(), expiresAt });
}

const statusOf = (spin) => (spin.spunAt ? 'SPUN' : spin.refunded ? 'REFUNDED' : new Date(spin.expiresAt) <= new Date() ? 'EXPIRED' : 'NEW');

/** Khối "Quét để quay may mắn" trên hóa đơn: { url, qr (data URL), expiresAt } | null. */
export async function forReceipt(payment) {
  if (!payment?.paymentId) return null;
  const s = await getSettings();
  const spin = await ensureForPayment(payment.paymentId, s);
  if (!spin || statusOf(spin) !== 'NEW') return null;
  const url = spinUrl(spin.token);
  return { url, qr: await QRCode.toDataURL(url, { width: 240, margin: 1, errorCorrectionLevel: 'M' }), expiresAt: spin.expiresAt };
}

/** Lượt quay của các lượt thu trong phiên (màn cảm ơn của khách). */
export async function forSession(sessionId) {
  const s = await getSettings();
  const out = [];
  for (const id of await luckySpinRepo.paymentIdsForSession(sessionId)) {
    const spin = await ensureForPayment(id, s);
    if (spin) out.push({ token: spin.token, status: statusOf(spin), expiresAt: spin.expiresAt, label: spin.label });
  }
  return out;
}

const resultOf = (spin) =>
  spin.spunAt ? { prizeId: spin.prizeId, label: spin.label, kind: spin.kind, voucher: spin.voucher, points: spin.points, spunAt: spin.spunAt } : null;

/** Trang quay: trạng thái + các ô hiện trên vòng của lượt thu này. */
export async function view(token) {
  const spin = await luckySpinRepo.byToken(token);
  if (!spin) throw notFound('Mã quay không đúng hoặc đã bị xóa', 'SPIN_NOT_FOUND');
  const slices = visibleSlices(await luckySpinRepo.prizes(), { hasMember: Boolean(spin.memberId) });
  return {
    status: statusOf(spin),
    shopName: (await shopInfo()).name,
    expiresAt: spin.expiresAt,
    member: Boolean(spin.memberId),
    slices: slices.map(sliceView),
    result: resultOf(spin),
  };
}

/** Quay: máy chủ chọn ô theo trọng số (D-90); đã quay → trả lại kết quả cũ. */
export async function spin(token, rand = randUnit) {
  const current = await luckySpinRepo.byToken(token);
  if (!current) throw notFound('Mã quay không đúng hoặc đã bị xóa', 'SPIN_NOT_FOUND');
  if (current.spunAt) return { result: resultOf(current) };
  const s = await getSettings();
  const slices = visibleSlices(await luckySpinRepo.prizes(), { hasMember: Boolean(current.memberId) });
  const none = slices.find((p) => p.kind === 'NONE');
  const picked = pickSlice(slices, rand()) ?? none;
  if (!picked || !none) throw badRequest('SPIN_NOT_READY', 'Vòng quay chưa được cài đặt — vui lòng báo nhân viên');
  try {
    const done = await luckySpinRepo.spin({
      token,
      prizeId: picked.prizeId,
      noneId: none.prizeId,
      dailyWinCap: s.spinDailyWinCap,
      voucherDays: s.spinVoucherDays,
      dayStart: vnDayStartUtc(todayVn()),
    });
    return { result: resultOf(done) };
  } catch (err) {
    const appErr = fromSqlError(err);
    if (appErr?.code === 'SPIN_EXPIRED') appErr.message = 'Lượt quay đã hết hạn';
    throw appErr ?? err;
  }
}

// ---------- Quản lý ----------
const settingsView = (s) => ({
  enabled: s.spinEnabled,
  minAmount: s.spinMinAmount,
  dailyWinCap: s.spinDailyWinCap,
  voucherDays: s.spinVoucherDays,
  expireHours: s.spinExpireHours,
});

export async function adminGet() {
  const s = await getSettings();
  return {
    ...settingsView(s),
    prizes: await luckySpinRepo.prizes(),
    stats: await luckySpinRepo.stats(vnDayStartUtc(addDays(todayVn(), -6))), // 7 ngày gần nhất (giờ quán)
  };
}

export async function adminSave(body) {
  const problem = validatePrizes(body.prizes);
  if (problem) throw badRequest('VALIDATION_ERROR', problem);
  await updateSettings({
    spinEnabled: body.enabled,
    spinMinAmount: body.minAmount,
    spinDailyWinCap: body.dailyWinCap,
    spinVoucherDays: body.voucherDays,
    spinExpireHours: body.expireHours,
  });
  await luckySpinRepo.savePrizes(body.prizes);
  return adminGet();
}
