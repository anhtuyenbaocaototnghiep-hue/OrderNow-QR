// F-070 ly treo — mua tặng bạn một ly (ADR-028 D-112…D-118).
// Bán ở quầy: thu giá món hiện tại, tạo voucher GIFT (không gắn hội viên) + trang quà /qua/{token}; tiền mặt vào sổ quỹ (chốt ca khớp két).
// Nhận: ô Mã voucher ở quầy (loyaltyService.prepare — trần số trừ giftDiscount). Doanh thu tính lúc dùng (pnlRepo).
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { sqlErrorNumber } from '../db.js';
import { giftCode, giftState, validateSettings } from '../domain/giftDrink.js';
import { badRequest, conflict, notFound } from '../errors.js';
import * as giftDrinkRepo from '../repositories/giftDrinkRepo.js';
import { addDays, todayVn, vnDayStartUtc } from '../utils/time.js';
import { getSettings, shopInfo, updateSettings } from './settingsService.js';
import { requireOpenShift } from './shiftService.js';

const DAY_MS = 86_400_000;
const STATS_DAYS = 30;
const giftUrl = (token) => `${config.publicBaseUrl}/qua/${token}`;
const endOfDayIn = (days) => vnDayStartUtc(addDays(todayVn(), days)); // hết ngày thứ `days` kể từ hôm nay (giờ quán)

/** Hộp "Bán ly tặng" ở quầy: bật / tắt + món bán được. */
export async function posConfig() {
  const s = await getSettings();
  return { enabled: s.giftEnabled, validDays: s.giftValidDays, items: s.giftEnabled ? await giftDrinkRepo.sellableItems() : [] };
}

/** D-112…D-114: bán một ly tặng → mã + link + QR trang quà. */
export async function sell({ menuItemId, giverName = null, message = null, method = 'CASH' }, user) {
  const s = await getSettings();
  if (!s.giftEnabled) throw conflict('GIFT_DISABLED', 'Ly tặng đang tắt — quản lý bật ở Tích điểm & voucher → Ly tặng');
  const shift = await requireOpenShift('bán ly tặng');
  const item = await giftDrinkRepo.sellableItem(menuItemId);
  if (!item) throw badRequest('VALIDATION_ERROR', 'Chọn một món đơn đang bán (không phải combo)');
  for (let attempt = 0; ; attempt += 1) {
    const code = giftCode(crypto.randomBytes(6));
    try {
      const gift = await giftDrinkRepo.sell({
        shiftId: shift.shiftId,
        menuItemId: item.menuItemId,
        amount: item.price,
        method,
        giverName: giverName?.trim() || null,
        message: message?.trim() || null,
        userId: user.userId,
        code,
        token: crypto.randomBytes(16).toString('hex'),
        expiresAt: endOfDayIn(s.giftValidDays),
        reason: `Bán ly tặng ${code} — 1 ${item.name}`,
      });
      const url = giftUrl(gift.token);
      return { ...staffView(gift), url, qr: await QRCode.toDataURL(url, { width: 240, margin: 1, errorCorrectionLevel: 'M' }) };
    } catch (err) {
      const num = sqlErrorNumber(err);
      if (num === 50070) throw conflict('NO_OPEN_SHIFT', 'Chưa mở ca — hãy mở ca trước khi bán ly tặng');
      if ([2601, 2627].includes(num) && attempt < 3) continue; // trùng mã (rất hiếm) → sinh mã khác
      throw err;
    }
  }
}

const staffView = (g) => ({
  giftId: g.giftId,
  code: g.code,
  token: g.token,
  menuItemId: g.menuItemId,
  menuItemName: g.menuItemName,
  amount: g.amount,
  method: g.method,
  giverName: g.giverName,
  message: g.message,
  createdAt: g.createdAt,
  expiresAt: g.expiresAt,
  usedAt: g.usedAt,
  status: giftState(g),
});

/** SCR-50 trang quà công khai: mã chỉ hiện khi còn dùng được. */
export async function publicView(token) {
  const g = /^[0-9a-f]{32}$/.test(token) ? await giftDrinkRepo.byToken(token) : null;
  if (!g) throw notFound('Không tìm thấy ly tặng', 'GIFT_NOT_FOUND');
  const status = giftState(g);
  return {
    shopName: (await shopInfo()).name,
    giverName: g.giverName,
    message: g.message,
    menuItemName: g.menuItemName,
    amount: g.amount,
    expiresAt: g.expiresAt,
    status,
    usedAt: g.usedAt,
    code: status === 'READY' ? g.code : null,
  };
}

/** Quầy kiểm mã (F-038 validate): người tặng + món. null khi không phải ly tặng. */
export async function infoForVoucher(voucherId) {
  const g = await giftDrinkRepo.byVoucher(voucherId);
  return g ? { giverName: g.giverName, menuItemName: g.menuItemName } : null;
}

// ---------- Quản lý ----------
export async function adminGet() {
  const s = await getSettings();
  const [stats, outstanding, items] = await Promise.all([
    giftDrinkRepo.stats(new Date(Date.now() - STATS_DAYS * DAY_MS)),
    giftDrinkRepo.outstanding(),
    giftDrinkRepo.list(30),
  ]);
  return { enabled: s.giftEnabled, validDays: s.giftValidDays, stats, outstanding, items: items.map(staffView) };
}

export async function adminSave({ enabled, validDays }) {
  const problem = validateSettings({ validDays });
  if (problem) throw badRequest('VALIDATION_ERROR', problem);
  await updateSettings({ giftEnabled: enabled, giftValidDays: validDays });
  return adminGet();
}

/** Gia hạn thêm `validDays` ngày: từ hạn cũ (còn hạn) hoặc từ hôm nay (đã hết hạn). */
export async function extend(id) {
  const g = await giftDrinkRepo.byId(id);
  if (!g) throw notFound('Không tìm thấy ly tặng', 'GIFT_NOT_FOUND');
  const state = giftState(g);
  if (state === 'USED' || state === 'CANCELLED') throw conflict(`GIFT_${state}`, state === 'USED' ? 'Ly tặng đã dùng' : 'Ly tặng đã hủy');
  const { giftValidDays } = await getSettings();
  const expiresAt = state === 'READY' ? new Date(new Date(g.expiresAt).getTime() + giftValidDays * DAY_MS) : endOfDayIn(giftValidDays);
  if (!(await giftDrinkRepo.extend(id, expiresAt))) throw conflict('GIFT_USED', 'Ly tặng vừa được dùng');
  return staffView(await giftDrinkRepo.byId(id));
}

/** D-117: hủy & hoàn tiền (chưa dùng). Tiền mặt → sổ quỹ chi ở ca đang mở. */
export async function cancel(id, user) {
  const g = await giftDrinkRepo.byId(id);
  if (!g) throw notFound('Không tìm thấy ly tặng', 'GIFT_NOT_FOUND');
  const shift = g.method === 'CASH' ? await requireOpenShift('hoàn tiền ly tặng') : null;
  const r = await giftDrinkRepo.cancel({ id, userId: user.userId, shiftId: shift?.shiftId ?? null, reason: `Hoàn ly tặng ${g.code} — 1 ${g.menuItemName}` });
  if (r === 'USED') throw conflict('GIFT_USED', 'Ly tặng đã dùng — không hủy được');
  if (r === 'CANCELLED') throw conflict('GIFT_CANCELLED', 'Ly tặng đã hủy trước đó');
  if (r === 'NO_SHIFT') throw conflict('NO_OPEN_SHIFT', 'Chưa mở ca — hãy mở ca trước khi hoàn tiền ly tặng');
  return staffView(await giftDrinkRepo.byId(id));
}
