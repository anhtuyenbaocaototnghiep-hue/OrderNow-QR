// FEATURE-013 Tùy chọn món: nhóm (Size, Đường, Đá, Topping…) dùng chung cho nhiều món; đơn cũ giữ tên + phụ thu đã chụp.
import { badRequest, notFound } from '../errors.js';
import * as ingredientsRepo from '../repositories/ingredientsRepo.js';
import * as modifiersRepo from '../repositories/modifiersRepo.js';
import { menuChanged, refreshAvailability } from './menuService.js';
import { invalidateCatalog } from './pricingService.js';

export const listGroups = () => modifiersRepo.listGroups();

async function validate(d) {
  if (d.minSelect > d.maxSelect)
    throw badRequest('VALIDATION_ERROR', 'Số chọn tối thiểu phải ≤ tối đa', { fields: [{ path: 'minSelect', message: '≤ tối đa' }] });
  const active = d.options.filter((o) => o.isActive);
  if (active.length < d.minSelect) throw badRequest('VALIDATION_ERROR', 'Số tùy chọn đang bật ít hơn số bắt buộc chọn');
  const names = d.options.map((o) => o.name.toLowerCase());
  if (new Set(names).size !== names.length) throw badRequest('VALIDATION_ERROR', 'Tên tùy chọn trong một nhóm không được trùng');
  if (d.maxSelect === 1 && d.options.filter((o) => o.isDefault).length > 1) throw badRequest('VALIDATION_ERROR', 'Nhóm chọn 1 chỉ có một tùy chọn mặc định');
  const ingIds = [...new Set(d.options.flatMap((o) => o.bom.map((b) => b.ingredientId)))];
  const existing = await ingredientsRepo.existingIds(ingIds);
  if (ingIds.some((i) => !existing.has(i))) throw badRequest('VALIDATION_ERROR', 'Có nguyên liệu không tồn tại trong định lượng tùy chọn');
  for (const o of d.options) {
    const ids = o.bom.map((b) => b.ingredientId);
    if (new Set(ids).size !== ids.length) throw badRequest('VALIDATION_ERROR', `Tùy chọn "${o.name}" có nguyên liệu bị trùng`);
  }
}

function changed() {
  invalidateCatalog();
  menuChanged();
  refreshAvailability();
}

export async function saveGroup(id, d) {
  await validate(d);
  const groupId = await modifiersRepo.saveGroup(id, d);
  if (!groupId) throw notFound('Không tìm thấy nhóm tùy chọn');
  changed();
  return modifiersRepo.getGroup(groupId);
}

export async function removeGroup(id) {
  const result = await modifiersRepo.removeGroup(id);
  if (!result) throw notFound('Không tìm thấy nhóm tùy chọn');
  changed();
  return result;
}
