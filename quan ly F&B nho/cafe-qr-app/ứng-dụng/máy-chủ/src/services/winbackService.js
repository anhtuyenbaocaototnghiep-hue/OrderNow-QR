// F-069 mừng khách quay lại (ADR-027 D-107…D-111).
// Quà phát lúc hội viên đang vắng xuất hiện (quầy tra cứu / gắn bàn, điện thoại khách, tính tiền) — không cần job.
// Một quà mỗi đợt vắng (khóa WinbackGifts), tối đa một quà trong cooldown; thu tiền tự áp ở loyaltyService.prepare (sau quà sinh nhật).
import crypto from 'node:crypto';
import { absentDays, validateSettings } from '../domain/winback.js';
import { badRequest } from '../errors.js';
import * as birthdayRepo from '../repositories/birthdayRepo.js';
import * as winbackRepo from '../repositories/winbackRepo.js';
import { addDays, todayVn, vnDayStartUtc } from '../utils/time.js';
import { giftStatus, giftView, voucherFields } from './birthdayService.js';
import { getSettings, updateSettings } from './settingsService.js';

const DAY_MS = 86_400_000;
const STATS_DAYS = 90;
const newCode = () => `QL${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const sameInstant = (a, b) => Boolean(a && b) && new Date(a).getTime() === new Date(b).getTime();
/** Mốc UTC: lần thanh toán cuối trước mốc này = đang vắng ≥ afterDays ngày (giờ quán). Dùng chung bộ lọc "Lâu chưa quay lại". */
export const awayBefore = (afterDays, today = todayVn()) => vnDayStartUtc(addDays(today, 1 - afterDays));

/**
 * Trạng thái quà quay lại của hội viên; phát quà nếu đủ điều kiện (D-107, D-108). null khi không vắng và không còn quà đang giữ.
 * away = true: đang vắng (status READY · USED · EXPIRED · COOLDOWN · OFF); away = false + READY: quà đang giữ từ lần trước (D-109).
 */
export async function statusFor(member, { withCode = false, today = todayVn(), now = new Date() } = {}) {
  if (!member || !member.isActive || member.anonymizedAt) return null;
  const s = await getSettings();
  const latest = await winbackRepo.latestGift(member.memberId);
  const days = absentDays(member.lastVisitAt, today);
  const visit = { lastVisitAt: member.lastVisitAt, visitCount: member.visitCount };
  if (days !== null && days >= s.winbackAfterDays) {
    const base = { away: true, days, ...visit };
    // Quà của đợt vắng này, hoặc quà còn giữ từ lần trước (chưa dùng, còn hạn) — không phát thêm, không báo "chưa tới lượt"
    let gift = latest && (sameInstant(latest.lastVisitBefore, member.lastVisitAt) || giftStatus(latest) === 'READY') ? latest : null;
    if (!gift) {
      if (latest && new Date(latest.createdAt).getTime() > now.getTime() - s.winbackCooldownDays * DAY_MS) {
        return { ...base, status: 'COOLDOWN', gift: null, lastGiftAt: latest.createdAt };
      }
      if (!s.winbackEnabled) return { ...base, status: 'OFF', gift: null };
      const fields = await voucherFields({ kind: s.winbackKind, value: s.winbackValue, maxDiscount: s.winbackMaxDiscount, menuItemId: s.winbackMenuItemId });
      if (!fields) return { ...base, status: 'OFF', gift: null };
      gift =
        (await winbackRepo.issue({
          memberId: member.memberId,
          lastVisitBefore: member.lastVisitAt,
          absentDays: days,
          code: newCode(),
          ...fields,
          expiresAt: vnDayStartUtc(addDays(today, s.winbackHoldDays)), // hết ngày thứ holdDays kể từ hôm phát (giờ quán)
        })) ?? (await winbackRepo.latestGift(member.memberId)); // yêu cầu khác vừa phát trước
      if (!gift) return { ...base, status: 'OFF', gift: null };
    }
    return { ...base, status: giftStatus(gift), gift: giftView(gift, withCode) };
  }
  if (latest && giftStatus(latest) === 'READY') return { away: false, days: latest.absentDays, ...visit, status: 'READY', gift: giftView(latest, withCode) };
  return null;
}

/** Quà còn dùng được (cho tự áp lúc thu tiền, D-109): { code, menuItemId } | null. */
export async function usableGift(member) {
  const st = await statusFor(member, { withCode: true });
  return st?.status === 'READY' ? st.gift : null;
}

// ---------- Quản lý ----------
const settingsView = (s) => ({
  enabled: s.winbackEnabled,
  kind: s.winbackKind,
  value: s.winbackValue,
  maxDiscount: s.winbackMaxDiscount,
  menuItemId: s.winbackMenuItemId,
  afterDays: s.winbackAfterDays,
  holdDays: s.winbackHoldDays,
  cooldownDays: s.winbackCooldownDays,
});

/** Cài đặt + số hội viên đang vắng + thống kê 90 ngày + quà gần đây. */
export async function adminGet() {
  const s = await getSettings();
  const [awayNow, stats, recent] = await Promise.all([
    winbackRepo.awayCount(awayBefore(s.winbackAfterDays)),
    winbackRepo.stats(new Date(Date.now() - STATS_DAYS * DAY_MS)),
    winbackRepo.recent(20),
  ]);
  return {
    ...settingsView(s),
    awayNow,
    stats,
    recent: recent.map((g) => ({
      memberId: g.memberId,
      fullName: g.fullName,
      absentDays: g.absentDays,
      createdAt: g.createdAt,
      status: giftStatus(g),
      usedAt: g.usedAt,
      gift: giftView(g, false),
    })),
  };
}

export async function adminSave(body) {
  const problem = validateSettings(body);
  if (problem) throw badRequest('VALIDATION_ERROR', problem);
  if (body.kind === 'FREE_ITEM') {
    const item = await birthdayRepo.menuItem(body.menuItemId);
    if (!item || !item.isActive || !(item.price > 0)) throw badRequest('VALIDATION_ERROR', 'Món được tặng phải đang bán và có giá');
  }
  await updateSettings({
    winbackEnabled: body.enabled,
    winbackKind: body.kind,
    winbackValue: body.kind === 'FREE_ITEM' ? 0 : body.value,
    winbackMaxDiscount: body.kind === 'PERCENT' && body.maxDiscount ? body.maxDiscount : '',
    winbackMenuItemId: body.kind === 'FREE_ITEM' ? body.menuItemId : '',
    winbackAfterDays: body.afterDays,
    winbackHoldDays: body.holdDays,
    winbackCooldownDays: body.cooldownDays,
  });
  return adminGet();
}
