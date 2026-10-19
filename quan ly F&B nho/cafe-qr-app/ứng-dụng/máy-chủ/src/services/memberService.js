// FEATURE-014 Hội viên (ADR-005 D-5, D-6, D-16): SĐT + họ tên, không OTP. Khách chỉ thấy tên che; quầy thấy tên đầy đủ.
// Không ghi SĐT/tên ra log.
// ADR-006 F-038 (D-28): đăng ký kèm SĐT người giới thiệu (tùy chọn) — tồn tại, khác chính mình, ≤ 5 lượt / tháng / người giới thiệu.
import crypto from 'node:crypto';
import { sqlErrorNumber } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import * as membersRepo from '../repositories/membersRepo.js';
import * as sessionsRepo from '../repositories/sessionsRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { getSettings } from './settingsService.js';
import { todayVn, vnDayStartUtc } from '../utils/time.js';

/** "0912 345 678" | "+84912345678" | "84912345678" → "+84912345678"; sai định dạng → null. */
export function normalizePhone(input) {
  const s = String(input ?? '').replace(/[\s.\-()]/g, '');
  let m = s.match(/^0(\d{9})$/);
  if (m) return `+84${m[1]}`;
  m = s.match(/^\+?84(\d{9})$/);
  if (m) return `+84${m[1]}`;
  return null;
}

/** "Nguyễn Văn An" → "Nguyễn V. A." (giữ họ, chữ cái đầu các tên còn lại). */
export function maskName(fullName) {
  const parts = String(fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return `${parts[0].charAt(0).toUpperCase()}.`;
  return [parts[0], ...parts.slice(1).map((p) => `${p.charAt(0).toUpperCase()}.`)].join(' ');
}

/** "+84912345678" → "09xx***678" (danh sách quản lý — D-16). */
export function maskPhone(phone) {
  if (!phone || !phone.startsWith('+84')) return '(ẩn danh)';
  const local = `0${phone.slice(3)}`;
  return `${local.slice(0, 2)}xx***${local.slice(-3)}`;
}

const localPhone = (phone) => (phone?.startsWith('+84') ? `0${phone.slice(3)}` : null);

function requirePhone(input) {
  const phone = normalizePhone(input);
  if (!phone) throw badRequest('INVALID_PHONE', 'Số điện thoại không hợp lệ (ví dụ 0912345678)');
  return phone;
}

/** Thông tin trả cho khách (tên che) hoặc quầy (tên đầy đủ). */
export async function publicMember(m, { staff }) {
  const { firstOrderPercent } = await getSettings();
  return {
    memberId: m.memberId,
    ...(staff ? { fullName: m.fullName, phone: localPhone(m.phone) } : { maskedName: maskName(m.fullName) }),
    tierCode: m.tierCode,
    tierName: m.tierName,
    discountPercent: m.discountPercent,
    firstOrderDiscount: m.firstOrderDiscount,
    firstOrderPercent: m.firstOrderDiscount ? firstOrderPercent : null,
  };
}

export async function lookup(phoneInput, { staff = false } = {}) {
  const m = await membersRepo.findByPhone(requirePhone(phoneInput));
  if (!m || !m.isActive) return { found: false, member: null };
  return { found: true, member: await publicMember(m, { staff }) };
}

export async function register({ phone: phoneInput, fullName, consent, referrerPhone = null }, { staff = false } = {}) {
  const phone = requirePhone(phoneInput);
  if (consent !== true) throw badRequest('CONSENT_REQUIRED', 'Vui lòng đồng ý cho quán lưu số điện thoại và tên để tích lũy ưu đãi');
  let referrerId = null;
  if (referrerPhone && String(referrerPhone).trim()) {
    const refPhone = normalizePhone(referrerPhone);
    if (!refPhone)
      throw badRequest('VALIDATION_ERROR', 'Số điện thoại người giới thiệu không hợp lệ', { fields: [{ path: 'referrerPhone', message: 'SĐT không hợp lệ' }] });
    if (refPhone === phone) throw badRequest('SELF_REFERRAL', 'Không thể tự giới thiệu chính mình');
    const referrer = await membersRepo.findByPhone(refPhone);
    if (!referrer || !referrer.isActive || referrer.anonymizedAt)
      throw notFound('Không tìm thấy hội viên giới thiệu với số điện thoại này', 'REFERRER_NOT_FOUND');
    referrerId = referrer.memberId;
  }
  const settings = await getSettings();
  let m;
  try {
    m = await membersRepo.create({
      phone,
      fullName,
      referrerId,
      referralSinceUtc: vnDayStartUtc(`${todayVn().slice(0, 8)}01`), // đầu tháng (giờ VN)
      referralLimit: settings.referralMonthlyLimit,
    });
  } catch (err) {
    if ([2627, 2601].includes(sqlErrorNumber(err))) throw conflict('PHONE_EXISTS', 'Số điện thoại này đã là hội viên — hãy dùng chức năng tra cứu');
    throw err;
  }
  return { ...(await publicMember(m, { staff })), referred: Boolean(referrerId) };
}

async function activeMember(id) {
  const m = await membersRepo.findById(id);
  if (!m || !m.isActive) throw notFound('Không tìm thấy hội viên', 'MEMBER_NOT_FOUND');
  return m;
}

/**
 * Gắn hội viên vào phiên chưa thu tiền. Khách: phải thuộc phiên và gắn bằng SĐT (không đoán id);
 * quầy: SĐT hoặc memberId.
 */
export async function attachToSession(sessionId, { phone, memberId }, viewer) {
  let member;
  if (viewer.user) {
    member = memberId ? await activeMember(memberId) : await membersRepo.findByPhone(requirePhone(phone));
  } else {
    if (!(await sessionsRepo.isMember(sessionId, viewer.clientToken)))
      throw forbidden('Phiên này không thuộc thiết bị của bạn. Vui lòng quét lại mã QR tại bàn.');
    member = await membersRepo.findByPhone(requirePhone(phone));
  }
  if (!member || !member.isActive) throw notFound('Không tìm thấy hội viên với số điện thoại này', 'MEMBER_NOT_FOUND');
  if (!(await sessionsRepo.setMember(sessionId, member.memberId))) throw conflict('SESSION_CLOSED', 'Phiên đã đóng (đã thanh toán)');
  const out = await publicMember(member, { staff: Boolean(viewer.user) });
  publish([ROOMS.staff, ROOMS.session(sessionId)], 'session.member_changed', { sessionId, member: await publicMember(member, { staff: false }) });
  return out;
}

export async function detachFromSession(sessionId, viewer) {
  if (!viewer.user && !(await sessionsRepo.isMember(sessionId, viewer.clientToken))) {
    throw forbidden('Phiên này không thuộc thiết bị của bạn. Vui lòng quét lại mã QR tại bàn.');
  }
  if (!(await sessionsRepo.setMember(sessionId, null))) throw conflict('SESSION_CLOSED', 'Phiên đã đóng (đã thanh toán)');
  publish([ROOMS.staff, ROOMS.session(sessionId)], 'session.member_changed', { sessionId, member: null });
  return { ok: true };
}

/** Hội viên dùng khi tính tiền (tên đầy đủ, chỉ dùng phía server). */
export const memberForPricing = async (id) => (id ? activeMember(id) : null);

// ---------- Quản lý ----------
const adminView = (m) => ({ ...m, phone: maskPhone(m.phone) });

export async function adminList({ q = '', page = 1 }) {
  const query = String(q).trim();
  const phone = normalizePhone(query);
  const res = await membersRepo.list({ phone, name: phone || !query ? null : query, page });
  return { ...res, items: res.items.map(adminView) };
}

export async function adminGet(id) {
  const m = await membersRepo.findById(id);
  if (!m) throw notFound('Không tìm thấy hội viên', 'MEMBER_NOT_FOUND');
  return { member: adminView(m), history: await membersRepo.history(id) };
}

export async function adminUpdate(id, body) {
  const tiers = await membersRepo.tiers();
  if (!tiers.some((t) => t.tierCode === body.tierCode)) throw badRequest('VALIDATION_ERROR', 'Hạng không tồn tại');
  const m = await membersRepo.update(id, body);
  if (!m) throw notFound('Không tìm thấy hội viên (hoặc đã ẩn danh)', 'MEMBER_NOT_FOUND');
  return adminView(m);
}

export async function anonymize(id) {
  const m = await membersRepo.findById(id);
  if (!m || m.anonymizedAt) throw notFound('Không tìm thấy hội viên (hoặc đã ẩn danh)', 'MEMBER_NOT_FOUND');
  const hash = `anon:${crypto.createHash('sha256').update(`${m.phone}|${m.memberId}`).digest('hex')}`;
  await membersRepo.anonymize(id, hash);
  return adminView(await membersRepo.findById(id));
}

export const tiers = () => membersRepo.tiers();

export async function updateTiers(list) {
  const current = await membersRepo.tiers();
  const codes = new Set(current.map((t) => t.tierCode));
  if (list.some((t) => !codes.has(t.tierCode))) throw badRequest('VALIDATION_ERROR', 'Hạng không tồn tại');
  const sorted = [...list].sort((a, b) => a.minSpent - b.minSpent);
  if (sorted[0]?.minSpent !== 0 && list.length === current.length) throw badRequest('VALIDATION_ERROR', 'Hạng thấp nhất phải có mức chi tiêu 0đ');
  return membersRepo.updateTiers(list);
}
