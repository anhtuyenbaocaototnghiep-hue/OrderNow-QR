// F-067 quà sinh nhật hội viên (ADR-025 D-95…D-100).
// Quà phát lúc hội viên xuất hiện trong tuần sinh nhật (quầy tra cứu / gắn bàn, điện thoại khách, tính tiền) — không cần job.
// Mỗi hội viên một quà mỗi năm (khóa chính BirthdayGifts); thu tiền tự áp quà ở loyaltyService.prepare.
import crypto from 'node:crypto';
import { currentWindow, giftLabel, nextBirthday, selfDateCounts, validateSettings } from '../domain/birthday.js';
import { badRequest, conflict } from '../errors.js';
import * as birthdayRepo from '../repositories/birthdayRepo.js';
import { addDays, isValidDate, todayVn, vnDayStartUtc } from '../utils/time.js';
import { getSettings, updateSettings } from './settingsService.js';

const UPCOMING_DAYS = 14;
const newCode = () => `SN${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const dayMonth = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const kindOf = (g) => (g.menuItemId ? 'FREE_ITEM' : g.percent ? 'PERCENT' : 'AMOUNT');
const giftStatus = (g) => (g.usedAt ? 'USED' : new Date(g.expiresAt) <= new Date() ? 'EXPIRED' : 'READY');

/** Quà cho quầy (withCode) / khách (không mã — khách báo nhân viên, như voucher F-038). */
const giftView = (g, withCode) => ({
  ...(withCode ? { code: g.code } : {}),
  kind: kindOf(g),
  label: giftLabel({ kind: kindOf(g), value: g.percent ?? g.amount, maxDiscount: g.maxDiscount, menuItemName: g.menuItemName }),
  menuItemId: g.menuItemId,
  expiresAt: g.expiresAt,
  usedAt: g.usedAt,
});

/** Giá trị quà theo cài đặt hiện tại → trường voucher; null khi không phát được (món tặng đã ẩn / giá 0). */
async function giftFields(s) {
  if (s.birthdayKind === 'FREE_ITEM') {
    const item = s.birthdayMenuItemId ? await birthdayRepo.menuItem(s.birthdayMenuItemId) : null;
    return item && item.isActive && item.price > 0 ? { amount: item.price, menuItemId: item.menuItemId } : null;
  }
  if (s.birthdayKind === 'AMOUNT') return { amount: s.birthdayValue };
  return { percent: s.birthdayValue, maxDiscount: s.birthdayMaxDiscount || null };
}

/**
 * Trạng thái sinh nhật hôm nay của hội viên; phát quà nếu đủ điều kiện (D-96, D-99). null khi không có ngày sinh / ngoài tuần sinh nhật.
 * status: READY (quà còn dùng) · USED · EXPIRED · WAITING (ngày sinh tự thêm chưa đủ 30 ngày) · OFF (tính năng tắt / chưa phát được).
 */
export async function statusFor(member, { withCode = false, today = todayVn() } = {}) {
  if (!member?.birthDate || !member.isActive || member.anonymizedAt) return null;
  const s = await getSettings();
  const w = currentWindow(member.birthDate, today, s.birthdayWindowDays);
  if (!w) return null;
  const base = { inWindow: true, date: w.date, dateLabel: dayMonth(w.date), offset: w.offset };
  let gift = await birthdayRepo.giftOf(member.memberId, w.year);
  if (!gift) {
    if (!s.birthdayEnabled) return { ...base, status: 'OFF', gift: null };
    if (!selfDateCounts(member.birthDateSelfAt, w.date)) return { ...base, status: 'WAITING', gift: null };
    const fields = await giftFields(s);
    if (!fields) return { ...base, status: 'OFF', gift: null };
    gift =
      (await birthdayRepo.issue({
        memberId: member.memberId,
        year: w.year,
        birthdayDate: w.date,
        code: newCode(),
        ...fields,
        expiresAt: vnDayStartUtc(addDays(w.to, 1)), // hết ngày cuối của tuần sinh nhật (giờ quán)
      })) ?? (await birthdayRepo.giftOf(member.memberId, w.year)); // yêu cầu khác vừa phát trước
    if (!gift) return { ...base, status: 'OFF', gift: null };
  }
  return { ...base, status: giftStatus(gift), gift: giftView(gift, withCode) };
}

/** Quà còn dùng được (cho tự áp lúc thu tiền, D-97): { code, menuItemId } | null. */
export async function usableGift(member) {
  const st = await statusFor(member, { withCode: true });
  return st?.status === 'READY' ? st.gift : null;
}

/** Thẻ thành viên: mời khách thêm ngày sinh khi tính năng bật và hội viên chưa có ngày sinh. */
export const askBirthDate = async (member) => !member.birthDate && (await getSettings()).birthdayEnabled;

/** D-99: khách tự thêm ngày sinh — một lần, khi còn trống. */
export async function selfSet(member, birthDate) {
  if (!isValidDate(birthDate) || birthDate > todayVn() || birthDate < '1900-01-01') throw badRequest('VALIDATION_ERROR', 'Ngày sinh không hợp lệ');
  if (!(await birthdayRepo.setSelfBirthDate(member.memberId, birthDate))) {
    throw conflict('BIRTHDATE_SET', 'Ngày sinh đã có — nhờ quán sửa nếu bị sai');
  }
}

// ---------- Quản lý ----------
const settingsView = (s) => ({
  enabled: s.birthdayEnabled,
  kind: s.birthdayKind,
  value: s.birthdayValue,
  maxDiscount: s.birthdayMaxDiscount,
  menuItemId: s.birthdayMenuItemId,
  windowDays: s.birthdayWindowDays,
});

/** Cài đặt + sinh nhật 14 ngày tới (kể cả đang trong tuần sinh nhật) kèm trạng thái quà + thống kê năm nay. */
export async function adminGet({ today = todayVn() } = {}) {
  const s = await getSettings();
  const year = Number(today.slice(0, 4));
  const [{ members, withoutBirthDate }, gifts, stats] = await Promise.all([
    birthdayRepo.membersWithBirthDate(),
    birthdayRepo.giftsForYears([year - 1, year, year + 1]),
    birthdayRepo.stats(year),
  ]);
  const upcoming = members
    .map((m) => {
      const w = currentWindow(m.birthDate, today, s.birthdayWindowDays);
      const next = w ? { date: w.date, daysUntil: -w.offset } : nextBirthday(m.birthDate, today);
      if (next.daysUntil > UPCOMING_DAYS) return null;
      const gift = gifts.get(`${m.memberId}:${Number(next.date.slice(0, 4))}`);
      const status = gift ? giftStatus(gift) : !selfDateCounts(m.birthDateSelfAt, next.date) ? 'WAITING' : w ? 'NOT_VISITED' : 'UPCOMING';
      return {
        memberId: m.memberId,
        fullName: m.fullName,
        tierName: m.tierName,
        date: next.date,
        daysUntil: next.daysUntil,
        selfAdded: Boolean(m.birthDateSelfAt),
        status,
        gift: gift ? giftView(gift, false) : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.daysUntil - b.daysUntil || a.fullName.localeCompare(b.fullName, 'vi'));
  return { ...settingsView(s), upcoming, stats: { ...stats, withoutBirthDate } };
}

export async function adminSave(body) {
  const problem = validateSettings(body);
  if (problem) throw badRequest('VALIDATION_ERROR', problem);
  if (body.kind === 'FREE_ITEM') {
    const item = await birthdayRepo.menuItem(body.menuItemId);
    if (!item || !item.isActive || !(item.price > 0)) throw badRequest('VALIDATION_ERROR', 'Món được tặng phải đang bán và có giá');
  }
  await updateSettings({
    birthdayEnabled: body.enabled,
    birthdayKind: body.kind,
    birthdayValue: body.kind === 'FREE_ITEM' ? 0 : body.value,
    birthdayMaxDiscount: body.kind === 'PERCENT' && body.maxDiscount ? body.maxDiscount : '',
    birthdayMenuItemId: body.kind === 'FREE_ITEM' ? body.menuItemId : '',
    birthdayWindowDays: body.windowDays,
  });
  return adminGet();
}
