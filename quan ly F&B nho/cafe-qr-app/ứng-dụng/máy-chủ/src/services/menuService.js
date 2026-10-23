// Menu khách + theo dõi trạng thái "đặt được" để phát menu.availability_changed (AC-002-05, AC-010-02, ADR-003).
// ADR-005: thêm Combo (F-015), Ưu đãi + giá khuyến mãi (F-016), Gợi ý/Bán chạy (F-017), tùy chọn món (F-013),
// giờ bán theo danh mục + trạng thái nhận đơn (F-020). ADR-006: lịch thực đơn theo mùa/khung giờ (F-040) thay giờ bán danh mục.
import * as menuRepo from '../repositories/menuRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { bestItemPromotion, isPromotionActive } from '../pricing/pricing.js';
import { addDays, todayVn, vnDayStartUtc } from '../utils/time.js';
import { activePromotions, getCatalog } from './pricingService.js';
import { nextChange, visibility } from './scheduleService.js';
import { getSettings, storeStatus } from './settingsService.js';
import { menuRatings } from './reviewService.js';

let lastStates = null;
let chain = Promise.resolve();

// ---------- Gợi ý / bán chạy (D-11): top N theo số lượng bán trong N ngày, cache 15 phút ----------
const TOP_TTL_MS = 15 * 60 * 1000;
let topCache = null;

export async function topSelling() {
  const s = await getSettings();
  const key = `${s.suggestionWindowDays}|${Math.max(20, s.suggestionTopN)}`;
  if (topCache && topCache.key === key && topCache.expires > Date.now()) return topCache.value;
  const since = vnDayStartUtc(addDays(todayVn(), -(s.suggestionWindowDays - 1)));
  const value = await menuRepo.topSelling(since, Math.max(20, s.suggestionTopN));
  topCache = { key, value, expires: Date.now() + TOP_TTL_MS };
  return value;
}

export function invalidateSuggestions() {
  topCache = null;
}

/** Danh sách gợi ý: món ghim (theo thứ tự ghim) + top tự động chưa ghim; bỏ món ẩn khỏi gợi ý / đang hết. */
function buildSuggested(all, top, settings) {
  const byId = new Map(all.map((i) => [i.id, i]));
  const out = [];
  const usable = (i) => i && i.isAvailable && !i.hideFromSuggestions;
  if (settings.suggestionMode !== 'AUTO') {
    for (const i of all.filter((x) => x.isPinned).sort((a, b) => (a.pinOrder ?? 999) - (b.pinOrder ?? 999))) {
      if (usable(i)) out.push({ menuItemId: i.id, label: i.pinLabel || 'Quán gợi ý', kind: 'PINNED' });
    }
  }
  if (settings.suggestionMode !== 'PINNED') {
    let n = 0;
    for (const t of top) {
      if (n >= settings.suggestionTopN) break;
      const i = byId.get(t.menuItemId);
      if (!usable(i) || i.isPinned) continue;
      out.push({ menuItemId: i.id, label: 'Bán chạy', kind: 'AUTO' });
      n++;
    }
  }
  return out;
}

const promoText = (p) => {
  if (p.type === 'ITEM_PRICE') return `Giá đặc biệt ${Number(p.value).toLocaleString('vi-VN')}đ`;
  const min = p.minOrderAmount > 0 ? ` cho đơn từ ${p.minOrderAmount.toLocaleString('vi-VN')}đ` : '';
  return p.type === 'ORDER_PERCENT' ? `Giảm ${p.value}%${min}` : `Giảm ${p.value.toLocaleString('vi-VN')}đ${min}`;
};

/**
 * Menu: { store, categories[{ id, name, items[] }], combos[], promotions[], suggested[], modifierGroups[] }.
 * Khách: chỉ món theo lịch thực đơn đang hiệu lực (F-040); `nextChangeAt` = lúc lịch đổi để trang tự tải lại.
 * Quầy (`staff`): thấy đủ, món ngoài lịch có cờ `hiddenBySchedule` (bán vẫn được — có cảnh báo).
 */
export async function getPublicMenu({ staff = false } = {}) {
  const now = new Date();
  const [{ itemRows, comboRows, compRows }, catalog, promotions, settings, top, visible, nextChangeAt, ratings, store] = await Promise.all([
    menuRepo.publicMenuRows(),
    getCatalog(),
    activePromotions(),
    getSettings(),
    topSelling(),
    visibility(now),
    nextChange(now),
    menuRatings(), // F-051: sao trung bình (chỉ món đủ số lượt — D-48)
    storeStatus(), // F-020 công tắc nhận đơn QR + F-055 có ca mở không
  ]);
  const live = promotions.filter((p) => !p.exhausted && isPromotionActive(p, now));
  const all = [];

  const toItem = (row, itemType) => {
    const cat = catalog.items.get(row.MenuItemId) ?? {
      id: row.MenuItemId,
      price: Number(row.Price),
      itemType,
      categoryId: row.CategoryId ?? null,
      groupIds: [],
    };
    const promo = bestItemPromotion(cat, live, now);
    const item = {
      id: row.MenuItemId,
      name: row.Name,
      itemType,
      price: promo ? promo.price : Number(row.Price),
      listPrice: Number(row.Price),
      promotionBadge: promo ? promo.promotion.badgeText || 'Khuyến mãi' : null,
      imageUrl: row.ImageUrl,
      isAvailable: Boolean(row.IsAvailable) && !row.SoldOut,
      soldOut: Boolean(row.SoldOut),
      groupIds: cat.groupIds ?? [],
      isPinned: Boolean(row.IsPinned),
      pinLabel: row.PinLabel,
      pinOrder: row.PinOrder,
      hideFromSuggestions: Boolean(row.HideFromSuggestions),
      hiddenBySchedule: !visible({ id: row.MenuItemId, categoryId: row.CategoryId ?? null }),
      rating: ratings.get(row.MenuItemId) ?? null,
    };
    all.push(item);
    return item;
  };

  const categories = [];
  const byCat = new Map();
  for (const row of itemRows) {
    if (!staff && !visible({ id: row.MenuItemId, categoryId: row.CategoryId })) continue;
    if (!byCat.has(row.CategoryId)) {
      const c = { id: row.CategoryId, name: row.CategoryName, sellFrom: row.SellFrom, sellTo: row.SellTo, items: [] };
      byCat.set(row.CategoryId, c);
      categories.push(c);
    }
    byCat.get(row.CategoryId).items.push(toItem(row, 'SINGLE'));
  }

  const comps = new Map();
  for (const c of compRows) {
    if (!comps.has(c.ComboMenuItemId)) comps.set(c.ComboMenuItemId, []);
    comps.get(c.ComboMenuItemId).push({ menuItemId: c.ComponentMenuItemId, name: c.Name, quantity: c.Quantity, price: Number(c.Price) });
  }
  const combos = comboRows
    .filter((row) => staff || visible({ id: row.MenuItemId, categoryId: null }))
    .map((row) => {
      const item = toItem(row, 'COMBO');
      const components = comps.get(row.MenuItemId) ?? [];
      const listTotal = components.reduce((s, k) => s + k.price * k.quantity, 0);
      return { ...item, components: components.map(({ price: _p, ...k }) => k), listTotal, savings: Math.max(0, listTotal - item.price) };
    });

  const groupIds = new Set(all.flatMap((i) => i.groupIds));
  const modifierGroups = [...groupIds]
    .map((gid) => catalog.groups.get(gid))
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((g) => ({
      groupId: g.id,
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      options: [...catalog.options.values()]
        .filter((o) => o.groupId === g.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        .map((o) => ({ optionId: o.id, name: o.name, priceDelta: o.priceDelta, isDefault: o.isDefault })),
    }));

  return {
    store,
    nextChangeAt,
    categories,
    combos,
    promotions: live
      .filter((p) => p.type !== 'ITEM_PRICE' || all.some((i) => i.promotionBadge && bestItemPromotion(catalog.items.get(i.id) ?? i, [p], now)))
      .map((p) => ({
        promotionId: p.promotionId,
        name: p.name,
        type: p.type,
        badgeText: p.badgeText,
        description: promoText(p),
        stackWithMember: p.stackWithMember,
      })),
    suggested: buildSuggested(all, top, settings),
    modifierGroups,
  };
}

export async function initAvailability() {
  lastStates = await menuRepo.orderableStates();
}

/**
 * Gọi sau mỗi thay đổi có thể ảnh hưởng món còn/hết (gửi đơn, hoàn tất, hủy, điều chỉnh kho, sửa món/BOM/combo).
 * Chạy tuần tự, so với trạng thái trước và chỉ phát phần thay đổi. Lỗi ở đây không làm hỏng request chính.
 */
export function refreshAvailability() {
  chain = chain.then(async () => {
    try {
      const states = await menuRepo.orderableStates();
      for (const [menuItemId, isAvailable] of states) {
        if (!lastStates || lastStates.get(menuItemId) !== isAvailable) {
          publish([ROOMS.public, ROOMS.staff], 'menu.availability_changed', { menuItemId, isAvailable });
        }
      }
      // Món đã bị xóa hẳn (ADR-004) không còn trong DB → báo khách là không đặt được nữa
      for (const [menuItemId, wasAvailable] of lastStates ?? []) {
        if (!states.has(menuItemId) && wasAvailable) publish([ROOMS.public, ROOMS.staff], 'menu.availability_changed', { menuItemId, isAvailable: false });
      }
      lastStates = states;
    } catch (err) {
      console.error('refreshAvailability:', err.message);
    }
  });
  return chain;
}

/** Thực đơn đổi (giá/combo/khuyến mãi/gợi ý/tùy chọn) → trang khách đang mở tải lại menu. */
export function menuChanged() {
  publish([ROOMS.public, ROOMS.staff], 'menu.updated', {});
}
