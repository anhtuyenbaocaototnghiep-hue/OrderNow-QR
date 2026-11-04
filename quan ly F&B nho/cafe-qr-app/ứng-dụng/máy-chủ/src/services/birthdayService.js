// F-067 quà sinh nhật hội viên (ADR-025 D-95…D-100).
// Quà phát lúc hội viên xuất hiện trong tuần sinh nhật (quầy tra cứu / gắn bàn, điện thoại khách, tính tiền) — không cần job.
// Mỗi hội viên một quà mỗi năm (khóa chính BirthdayGifts); thu tiền tự áp quà ở loyaltyService.prepare.
// F-068 (ADR-026 D-101…D-106): kiểm ngày sinh có / không năm, nhân viên ghi hộ / "khách không muốn cho", độ phủ ngày sinh.
import crypto from 'node:crypto';
import { currentWindow, giftLabel, nextBirthday, parseBirthDate, selfDateCounts, staffShouldAsk, validateSettings } from '../domain/birthday.js';
import { badRequest, conflict } from '../errors.js';
import * as birthdayRepo from '../repositories/birthdayRepo.js';
import { addDays, todayVn, vnDayStartUtc } from '../utils/time.js';
import { getSettings, updateSettings } from './settingsService.js';

const UPCOMING_DAYS = 14;
const newCode = () => `SN${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const dayMonth = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const kindOf = (g) => (g.menuItemId ? 'FREE_ITEM' : g.percent ? 'PERCENT' : 'AMOUNT');
/** Trạng thái quà (voucher): USED · EXPIRED · READY — dùng chung F-069. */
export const giftStatus = (g) => (g.usedAt ? 'USED' : new Date(g.expiresAt) <= new Date() ? 'EXPIRED' : 'READY');

/** Quà cho quầy (withCode) / khách (không mã — khách báo nhân viên, như voucher F-038). Dùng chung F-069. */
export const giftView = (g, withCode) => ({
  ...(withCode ? { code: g.code } : {}),
  kind: kindOf(g),
  label: giftLabel({ kind: kindOf(g), value: g.percent ?? g.amount, maxDiscount: g.maxDiscount, menuItemName: g.menuItemName }),
  menuItemId: g.menuItemId,
  expiresAt: g.expiresAt,
  usedAt: g.usedAt,
});

/** Giá trị quà theo cài đặt → trường voucher; null khi không phát được (món tặng đã ẩn / giá 0). Dùng chung F-069. */
export async function voucherFields({ kind, value, maxDiscount, menuItemId }) {
  if (kind === 'FREE_ITEM') {
    const item = menuItemId ? await birthdayRepo.menuItem(menuItemId) : null;
    return item && item.isActive && item.price > 0 ? { amount: item.price, menuItemId: item.menuItemId } : null;
  }
  if (kind === 'AMOUNT') return { amount: value };
  return { percent: value, maxDiscount: maxDiscount || null };
}
const giftFields = (s) => voucherFields({ kind: s.birthdayKind, value: s.birthdayValue, maxDiscount: s.birthdayMaxDiscount, menuItemId: s.birthdayMenuItemId });

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

/** F-068 D-101: form đăng ký hiện ô ngày sinh khi quà sinh nhật đang bật. */
export const askOnSignup = async () => (await getSettings()).birthdayEnabled;

/** F-068 D-104: quầy nhắc hỏi — chưa có ngày sinh, tính năng bật, không có "khách không muốn cho" trong 365 ngày. */
export const staffAsk = async (member) => staffShouldAsk(member) && (await getSettings()).birthdayEnabled;

/** F-068 D-102: ngày sinh gửi lên → 'YYYY-MM-DD' | '--MM-DD'; sai → 400 (một câu báo cho mọi form). */
export function requireBirthDate(input) {
  const date = parseBirthDate(input, todayVn());
  if (!date) throw badRequest('VALIDATION_ERROR', 'Ngày sinh không hợp lệ', { fields: [{ path: 'birthDate', message: 'Ngày sinh không hợp lệ' }] });
  return date;
}

/** D-99 / F-068 D-103: ngày sinh tự khai (khách tự thêm, nhân viên ghi hộ) — một lần, khi còn trống. */
export async function selfSet(member, birthDate) {
  if (!(await birthdayRepo.setSelfBirthDate(member.memberId, requireBirthDate(birthDate)))) {
    throw conflict('BIRTHDATE_SET', 'Ngày sinh đã có — nhờ quán sửa nếu bị sai');
  }
}

/** F-068 D-104: nhân viên ghi "khách không muốn cho" — quầy thôi nhắc khách này 365 ngày. */
export async function decline(member) {
  if (!(await birthdayRepo.declineBirthDate(member.memberId))) throw conflict('BIRTHDATE_SET', 'Hội viên đã có ngày sinh');
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
  const [{ members, withoutBirthDate }, gifts, stats, coverage] = await Promise.all([
    birthdayRepo.membersWithBirthDate(),
    birthdayRepo.giftsForYears([year - 1, year, year + 1]),
    birthdayRepo.stats(year),
    birthdayRepo.coverage(new Date(Date.now() - 30 * 86_400_000)), // F-068 D-106: khách ghé 30 ngày qua
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
  return { ...settingsView(s), upcoming, stats: { ...stats, withoutBirthDate }, coverage };
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
