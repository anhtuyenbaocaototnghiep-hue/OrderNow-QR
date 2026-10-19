// FEATURE-040 Thực đơn theo mùa / khung giờ (ADR-006). Khách chỉ thấy món theo lịch; quầy vẫn bán được món bị ẩn (có cảnh báo).
import { badRequest, notFound } from '../errors.js';
import { buildVisibility, nextChangeAt } from '../domain/menuSchedule.js';
import * as menuRepo from '../repositories/menuRepo.js';
import * as scheduleRepo from '../repositories/scheduleRepo.js';
import { menuChanged } from './menuService.js';
import { invalidateCatalog } from './pricingService.js';

const TTL_MS = 10_000;
let cache = null;

export async function schedules() {
  if (cache && cache.expires > Date.now()) return cache.value;
  const value = await scheduleRepo.list();
  cache = { value, expires: Date.now() + TTL_MS };
  return value;
}

export function invalidateSchedules() {
  cache = null;
}

/** (item: { id, categoryId }) => khách có thấy món lúc `now`. */
export const visibility = async (now = new Date()) => buildVisibility(await schedules(), now);

export const nextChange = async (now = new Date()) => nextChangeAt(await schedules(), now);

function changed() {
  invalidateSchedules();
  invalidateCatalog();
  menuChanged(); // trang khách tải lại menu ngay
}

async function assertTargets(targets) {
  const [items, categories] = await Promise.all([menuRepo.listAllSellable(), menuRepo.listCategories()]);
  const itemIds = new Set(items.map((i) => i.menuItemId));
  const catIds = new Set(categories.map((c) => c.categoryId));
  for (const t of targets) {
    if (t.menuItemId && !itemIds.has(t.menuItemId)) throw badRequest('VALIDATION_ERROR', 'Có món không tồn tại trong lịch');
    if (t.categoryId && !catIds.has(t.categoryId)) throw badRequest('VALIDATION_ERROR', 'Có danh mục không tồn tại trong lịch');
  }
}

export const list = () => scheduleRepo.list();

export async function create(d) {
  await assertTargets(d.targets);
  const s = await scheduleRepo.create(d);
  changed();
  return s;
}

export async function update(id, d) {
  await assertTargets(d.targets);
  const s = await scheduleRepo.update(id, d);
  if (!s) throw notFound('Không tìm thấy lịch thực đơn');
  changed();
  return s;
}

export async function setActive(id, isActive) {
  if (!(await scheduleRepo.setActive(id, isActive))) throw notFound('Không tìm thấy lịch thực đơn');
  changed();
  return scheduleRepo.get(id);
}

export async function remove(id) {
  if (!(await scheduleRepo.remove(id))) throw notFound('Không tìm thấy lịch thực đơn');
  changed();
  return { result: 'DELETED' };
}

/** Xem trước "menu lúc 15:00 thứ 7": at = 'YYYY-MM-DDTHH:MM' giờ quán → danh mục + món hiện / ẩn. */
export async function preview(at) {
  const now = new Date(Date.parse(`${at}:00Z`) - 7 * 3600 * 1000);
  if (Number.isNaN(now.getTime())) throw badRequest('VALIDATION_ERROR', 'Thời điểm không hợp lệ');
  const [visible, items, categories] = await Promise.all([visibility(now), menuRepo.listAllSellable(), menuRepo.listCategories()]);
  const row = (i) => ({ menuItemId: i.menuItemId, name: i.name, visible: visible({ id: i.menuItemId, categoryId: i.categoryId }) });
  return {
    at,
    categories: categories.map((c) => ({
      categoryId: c.categoryId,
      name: c.name,
      items: items.filter((i) => i.itemType === 'SINGLE' && i.categoryId === c.categoryId && i.isActive).map(row),
    })),
    combos: items.filter((i) => i.itemType === 'COMBO' && i.isActive).map(row),
  };
}
