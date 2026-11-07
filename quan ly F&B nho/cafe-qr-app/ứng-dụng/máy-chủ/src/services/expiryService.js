// F-075 (ADR-033 D-147…D-152): hạn dùng nguyên liệu.
//  - "Hộp đang mở" tự cập nhật khi bán / sơ chế (sp_TrackOpenPacks); quá hạn sau khi mở → phần còn lại không tính là còn hàng
//    (tvf_ExpiredLotQty) và hiện ở quầy để bỏ (phiếu hủy EXPIRED).
//  - Rủi ro trong 2 ngày tới quy ra tiền: lô sắp / đã hết hạn + hộp mở sắp / đã quá hạn (giá lô, không có thì giá vốn bình quân).
//    Chủ quán thấy ở trang Hôm nay; 06:00 có cảnh báo EXPIRY_RISK (một lần mỗi ngày). Nhân viên / trưởng ca không thấy số tiền.
//  - Món nên mời: món đang bán dùng nguyên liệu SẮP hết hạn (chưa hết) — trực tiếp hoặc qua bán thành phẩm sơ chế từ nó.
//  - Tiền hủy vì hết hạn theo tháng: theo nguyên liệu và nhà cung cấp (lô từ phiếu nhập).
import { badRequest, notFound } from '../errors.js';
import * as expiryRepo from '../repositories/expiryRepo.js';
import * as ingredientsRepo from '../repositories/ingredientsRepo.js';
import { addDays, todayVn, vnDayStartUtc } from '../utils/time.js';
import { onExpiryRisk } from './alertService.js';
import { refreshAvailability } from './menuService.js';

export const RISK_DAYS = 2;
const PUSH_MAX = 6;
const HOUR = 3600e3;

const lotWhen = (daysLeft) => (daysLeft < 0 ? 'đã hết hạn' : daysLeft === 0 ? 'hết hạn hôm nay' : daysLeft === 1 ? 'hết hạn ngày mai' : `còn ${daysLeft} ngày`);
const packWhen = (hoursLeft) => (hoursLeft < 0 ? 'hộp đang mở đã quá hạn' : `hộp đang mở còn ${hoursLeft < 1 ? 'dưới 1' : hoursLeft} giờ`);

/** Rủi ro hết hạn trong `days` ngày tới: { days, totalValue, items, pushItems }. Số tiền = giá vốn của phần sẽ phải bỏ. */
export async function risk({ days = RISK_DAYS, now = Date.now() } = {}) {
  const [lots, packs] = await Promise.all([expiryRepo.lotsAtRisk(days), expiryRepo.openPacks()]);
  const horizon = now + days * 24 * HOUR;
  const packRows = packs
    .filter((p) => new Date(p.expiresAt).getTime() <= horizon)
    .map((p) => {
      const left = new Date(p.expiresAt).getTime() - now;
      const hoursLeft = left < 0 ? -1 : Math.floor(left / HOUR);
      return {
        kind: 'OPEN',
        ingredientId: p.ingredientId,
        name: p.name,
        unit: p.unit,
        qty: p.openLeft,
        openedAt: p.openedAt,
        expiresAt: p.expiresAt,
        hoursLeft,
        expired: left < 0,
        when: packWhen(hoursLeft),
        value: Math.round(p.openLeft * p.avgCost),
        sortAt: new Date(p.expiresAt).getTime(),
      };
    });
  const lotRows = lots.map((l) => ({
    kind: 'LOT',
    lotId: l.lotId,
    ingredientId: l.ingredientId,
    name: l.name,
    unit: l.unit,
    lotCode: l.lotCode,
    qty: l.qty,
    expiryDate: l.expiryDate,
    daysLeft: l.daysLeft,
    expired: l.daysLeft < 0,
    when: lotWhen(l.daysLeft),
    value: Math.round(l.qty * l.unitCost),
    sortAt: vnDayStartUtc(l.expiryDate).getTime() + 24 * HOUR, // hết ngày ghi trên lô
  }));
  const items = [...packRows, ...lotRows].sort((a, b) => Number(b.expired) - Number(a.expired) || a.sortAt - b.sortAt || a.name.localeCompare(b.name, 'vi'));
  const soon = items.filter((i) => !i.expired);
  const uses = await expiryRepo.menuItemsUsing([...new Set(soon.map((i) => i.ingredientId))]);
  const firstOf = new Map();
  for (const i of soon) if (!firstOf.has(i.ingredientId)) firstOf.set(i.ingredientId, i);
  const push = new Map();
  for (const u of uses) {
    const cause = firstOf.get(u.ingredientId);
    const cur = push.get(u.menuItemId) ?? { menuItemId: u.menuItemId, name: u.name, because: [], sortAt: Infinity };
    if (!cur.because.some((b) => b.ingredientId === cause.ingredientId))
      cur.because.push({ ingredientId: cause.ingredientId, name: cause.name, when: cause.when });
    cur.sortAt = Math.min(cur.sortAt, cause.sortAt);
    push.set(u.menuItemId, cur);
  }
  const pushItems = [...push.values()]
    .sort((a, b) => a.sortAt - b.sortAt || a.name.localeCompare(b.name, 'vi'))
    .slice(0, PUSH_MAX)
    .map(({ sortAt: _s, ...p }) => p);
  return {
    days,
    totalValue: items.reduce((s, i) => s + i.value, 0),
    items: items.map(({ sortAt: _s, ...i }) => i),
    pushItems,
  };
}

/** Bản cho nhân viên / trưởng ca: không có số tiền (giá vốn). */
export const withoutMoney = (r) => ({ ...r, totalValue: undefined, items: r.items.map(({ value: _v, ...i }) => i) });

/** Bỏ phần còn của hộp đang mở → phiếu hủy EXPIRED (không đụng phần đang giữ cho đơn chờ). */
export async function discardOpenPack(ingredientId, user, note) {
  const ing = await ingredientsRepo.getById(ingredientId);
  if (!ing) throw notFound('Không tìm thấy nguyên liệu');
  const r = await expiryRepo.discardOpenPack(ingredientId, user.userId, note?.trim() || 'Bỏ phần còn của hộp đã mở (quá hạn sau khi mở)');
  refreshAvailability();
  return { ...r, ingredient: await ingredientsRepo.getById(ingredientId) };
}

/** Tiền hủy vì hết hạn trong tháng (giờ VN). */
export async function expiredWaste(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')) throw badRequest('VALIDATION_ERROR', 'Tháng phải có dạng YYYY-MM');
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const r = await expiryRepo.expiredWaste(vnDayStartUtc(`${month}-01`), vnDayStartUtc(next));
  return { month, total: r.byIngredient.reduce((s, x) => s + x.cost, 0), ...r };
}

/** Job 06:00: còn hàng sắp / đã hết hạn có giá trị → một cảnh báo EXPIRY_RISK trong ngày (email nếu chủ quán bật). */
export async function dailyAlert() {
  const r = await risk();
  if (r.totalValue <= 0) return { value: 0, alert: null };
  const { alert } = await onExpiryRisk({ date: todayVn(), totalValue: r.totalValue, items: r.items, pushItems: r.pushItems });
  return { value: r.totalValue, alert: alert?.alertId ?? null };
}

export const thisMonth = () => todayVn().slice(0, 7);
export const lastMonth = () => addDays(`${thisMonth()}-01`, -1).slice(0, 7);
