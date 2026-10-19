// Quản lý "Marketing & Khách hàng" (ADR-005): combo (F-015), khuyến mãi (F-016), gợi ý & ghim (F-017), báo cáo marketing.
import { badRequest, notFound } from '../errors.js';
import * as menuRepo from '../repositories/menuRepo.js';
import * as promotionsRepo from '../repositories/promotionsRepo.js';
import * as reportsRepo from '../repositories/reportsRepo.js';
import { addDays, todayVn, vnDayStartUtc } from '../utils/time.js';
import { invalidateSuggestions, menuChanged, refreshAvailability, topSelling } from './menuService.js';
import { invalidateCatalog } from './pricingService.js';
import { getSettings, updateSettings } from './settingsService.js';

function changed() {
  invalidateCatalog();
  menuChanged();
}

// ---------- Combo ----------
export const listCombos = () => menuRepo.listCombos();

async function assertComponents(components) {
  const ids = components.map((c) => c.menuItemId);
  if (new Set(ids).size !== ids.length) throw badRequest('COMBO_INVALID', 'Mỗi món chỉ thêm một lần vào combo (tăng số lượng thay vì thêm dòng)');
  const found = await menuRepo.singleItemsByIds(ids);
  const byId = new Map(found.map((x) => [x.menuItemId, x]));
  if (ids.some((id) => !byId.has(id))) throw badRequest('COMBO_INVALID', 'Có món thành phần không tồn tại hoặc đã bị xóa');
  if (found.some((x) => x.itemType !== 'SINGLE')) throw badRequest('COMBO_INVALID', 'Không thể đưa combo vào trong combo khác');
}

export async function createCombo(d) {
  await assertComponents(d.components);
  const combo = await menuRepo.createCombo(d);
  changed();
  refreshAvailability();
  return combo;
}

export async function updateCombo(id, d) {
  await assertComponents(d.components);
  const combo = await menuRepo.updateCombo(id, d);
  if (!combo) throw notFound('Không tìm thấy combo');
  changed();
  refreshAvailability();
  return combo;
}

export async function setComboAvailability(id, isAvailable) {
  const item = await menuRepo.getItem(id);
  if (!item || item.itemType !== 'COMBO') throw notFound('Không tìm thấy combo');
  await menuRepo.setAvailability(id, isAvailable);
  await refreshAvailability();
  return menuRepo.getCombo(id);
}

// ---------- Khuyến mãi ----------
const dayStart = () => vnDayStartUtc(todayVn());
export const listPromotions = () => promotionsRepo.list(dayStart());

export async function getPromotion(id) {
  const p = await promotionsRepo.getById(id, dayStart());
  if (!p) throw notFound('Không tìm thấy khuyến mãi');
  return p;
}

function validatePromotion(d) {
  if (d.type === 'ITEM_PRICE' && d.itemIds.length + d.categoryIds.length === 0) {
    throw badRequest('VALIDATION_ERROR', 'Chọn ít nhất một món hoặc danh mục được giảm giá', { fields: [{ path: 'itemIds', message: 'Chọn món/danh mục' }] });
  }
  if (d.type !== 'ITEM_PRICE' && d.itemIds.length + d.categoryIds.length > 0) {
    throw badRequest('VALIDATION_ERROR', 'Khuyến mãi theo đơn không chọn món/danh mục');
  }
  if (d.startDate > d.endDate)
    throw badRequest('VALIDATION_ERROR', 'Ngày bắt đầu phải trước ngày kết thúc', { fields: [{ path: 'endDate', message: 'Sau ngày bắt đầu' }] });
  if ((d.startTime === null) !== (d.endTime === null) || (d.startTime && d.startTime === d.endTime)) {
    throw badRequest('VALIDATION_ERROR', 'Nhập đủ giờ bắt đầu và kết thúc (khác nhau), hoặc để trống cả hai = cả ngày');
  }
  if (d.daysOfWeekMask === 0) throw badRequest('VALIDATION_ERROR', 'Chọn ít nhất một ngày trong tuần');
}

export async function createPromotion(d) {
  validatePromotion(d);
  const id = await promotionsRepo.create(d);
  changed();
  return getPromotion(id);
}

export async function updatePromotion(id, d) {
  validatePromotion(d);
  if (!(await promotionsRepo.update(id, d))) throw notFound('Không tìm thấy khuyến mãi');
  changed();
  return getPromotion(id);
}

export async function setPromotionActive(id, isActive) {
  if (!(await promotionsRepo.setActive(id, isActive))) throw notFound('Không tìm thấy khuyến mãi');
  changed();
  return getPromotion(id);
}

export async function deletePromotion(id) {
  const result = await promotionsRepo.remove(id);
  if (!result) throw notFound('Không tìm thấy khuyến mãi');
  changed();
  return result;
}

export async function promotionStats(id, from, to) {
  const promotion = await getPromotion(id);
  return { promotion, from, to, ...(await promotionsRepo.stats(id, vnDayStartUtc(from), vnDayStartUtc(addDays(to, 1)))) };
}

// ---------- Gợi ý & ghim ----------
export async function suggestionsAdmin() {
  const [items, top, settings] = await Promise.all([menuRepo.listAllSellable(), topSelling(), getSettings()]);
  return {
    mode: settings.suggestionMode,
    topN: settings.suggestionTopN,
    windowDays: settings.suggestionWindowDays,
    items: items.map((i) => ({
      menuItemId: i.menuItemId,
      name: i.name,
      itemType: i.itemType,
      categoryName: i.categoryName,
      isPinned: i.isPinned,
      pinLabel: i.pinLabel,
      pinOrder: i.pinOrder,
      hideFromSuggestions: i.hideFromSuggestions,
      isActive: i.isActive,
    })),
    top: top.slice(0, 20),
  };
}

export async function saveSuggestions({ mode, topN, windowDays, pins, hidden }) {
  const ids = [...pins.map((p) => p.menuItemId), ...hidden];
  const found = new Set((await menuRepo.singleItemsByIds([...new Set(ids)])).map((x) => x.menuItemId));
  if (ids.some((id) => !found.has(id))) throw badRequest('VALIDATION_ERROR', 'Có món không tồn tại hoặc đã bị xóa');
  await menuRepo.savePins({ pins, hidden });
  await updateSettings({ suggestionMode: mode, suggestionTopN: topN, suggestionWindowDays: windowDays });
  invalidateSuggestions();
  menuChanged();
  return suggestionsAdmin();
}

// ---------- Báo cáo marketing ----------
export async function marketingReport(from, to) {
  return {
    from,
    to,
    ...(await reportsRepo.marketing(vnDayStartUtc(from), vnDayStartUtc(addDays(to, 1)), vnDayStartUtc(addDays(to, -29)))),
  };
}
