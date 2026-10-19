// Nạp dữ liệu cho bộ tính giá (catalog + khuyến mãi + cài đặt) và đổi lỗi pricing → lỗi API. Không tính tiền ở route/FE (ADR-005).
import { badRequest, conflict } from '../errors.js';
import * as catalogRepo from '../repositories/catalogRepo.js';
import * as ordersRepo from '../repositories/ordersRepo.js';
import * as promotionsRepo from '../repositories/promotionsRepo.js';
import { priceOrder, PricingError } from '../pricing/pricing.js';
import { todayVn, vnDayStartUtc } from '../utils/time.js';
import { getSettings } from './settingsService.js';

const CATALOG_TTL_MS = 5_000;
// Khuyến mãi đổi theo giờ/lượt dùng: cache rất ngắn; SP vẫn kiểm lượt/ngày dưới khóa nên cache cũ không làm vượt giới hạn
const PROMO_TTL_MS = 2_000;
let catalogCache = null;
let promoCache = null;

export async function getCatalog() {
  if (catalogCache && catalogCache.expires > Date.now()) return catalogCache.value;
  const value = await catalogRepo.loadCatalog();
  catalogCache = { value, expires: Date.now() + CATALOG_TTL_MS };
  return value;
}

/** Gọi sau mọi thay đổi món/combo/tùy chọn/khuyến mãi ở trang quản lý. */
export function invalidateCatalog() {
  catalogCache = null;
  promoCache = null;
}

/** Sau đơn có dùng khuyến mãi: lượt dùng hôm nay đổi → đọc lại (menu thôi quảng bá khuyến mãi vừa hết lượt). */
export function invalidatePromotions() {
  promoCache = null;
}

/** Ứng viên khuyến mãi hôm nay (bản sao — người gọi được phép sửa `exhausted`). */
export async function activePromotions() {
  const today = todayVn();
  if (!promoCache || promoCache.expires <= Date.now() || promoCache.today !== today) {
    promoCache = { today, value: await promotionsRepo.candidates(today, vnDayStartUtc(today)), expires: Date.now() + PROMO_TTL_MS };
  }
  return promoCache.value.map((p) => ({ ...p }));
}

async function toAppError(err) {
  if (!(err instanceof PricingError)) return err;
  if (err.code === 'ITEM_UNAVAILABLE') {
    const items = await ordersRepo.menuItemNames(err.details.menuItemIds);
    const e = conflict('ITEM_UNAVAILABLE', `${items.map((i) => i.name).join(', ')} hiện không còn bán. Vui lòng chọn món khác`, { items });
    return e;
  }
  return badRequest(err.code, err.message, err.details);
}

/**
 * Báo giá đơn (khóa giá lúc gửi — D-8). `exclude`: id khuyến mãi coi như đã hết lượt (SP báo PROMO_EXHAUSTED khi tranh lượt cuối).
 * Trả { priced, settings }.
 */
export async function quote(items, { exclude = [], now = new Date() } = {}) {
  const [catalog, promotions, settings] = await Promise.all([getCatalog(), activePromotions(), getSettings()]);
  if (exclude.length) promoCache = null; // vừa có khuyến mãi hết lượt → lần sau đọc lại
  for (const p of promotions) if (exclude.includes(p.promotionId)) p.exhausted = true;
  try {
    return { priced: priceOrder(items, catalog, promotions, now), settings, catalog };
  } catch (err) {
    throw await toAppError(err);
  }
}

/** Kết quả báo giá gọn cho API (giỏ khách, màn mang đi). */
export function publicQuote(priced) {
  return {
    lines: priced.lines.map((l) => ({
      menuItemId: l.menuItemId,
      name: l.name,
      itemType: l.itemType,
      quantity: l.quantity,
      options: l.options,
      listPrice: l.listPrice,
      unitPrice: l.unitPrice,
      lineDiscount: l.lineDiscount,
      lineTotal: l.lineTotal,
      promotionName: l.promotionName,
      children: l.children,
    })),
    subtotal: priced.subtotal,
    lineDiscount: priced.lineDiscount,
    orderPromotion: priced.orderPromotion && { name: priced.orderPromotion.name, discount: priced.orderPromotion.discount },
    promoDiscount: priced.promoDiscount,
    total: priced.total,
  };
}
