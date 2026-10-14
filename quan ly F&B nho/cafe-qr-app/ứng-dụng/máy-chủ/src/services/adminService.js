// Quản trị: danh mục, món, BOM (FEATURE-010/011), bàn + QR (FEATURE-010), nguyên liệu/kho (FEATURE-011), báo cáo (FEATURE-012).
import QRCode from 'qrcode';
import { config } from '../config.js';
import { sqlErrorNumber, withDeadlockRetry } from '../db.js';
import { badRequest, conflict, fromSqlError, notFound } from '../errors.js';
import * as ingredientsRepo from '../repositories/ingredientsRepo.js';
import * as menuRepo from '../repositories/menuRepo.js';
import * as ordersRepo from '../repositories/ordersRepo.js';
import * as reportsRepo from '../repositories/reportsRepo.js';
import * as tablesRepo from '../repositories/tablesRepo.js';
import { newQrToken } from '../utils/tokens.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { refreshAvailability } from './menuService.js';
import { addDays, eachDay, todayVn, vnDayStartUtc } from '../utils/time.js';

const isDuplicate = (err) => [2627, 2601].includes(sqlErrorNumber(err));

// ---------- Danh mục ----------
export const listCategories = () => menuRepo.listCategories();
export const createCategory = (d) => menuRepo.createCategory(d);

export async function updateCategory(id, d) {
  const c = await menuRepo.updateCategory(id, d);
  if (!c) throw notFound('Không tìm thấy danh mục');
  return c;
}

/** ADR-004: trả 'DELETED' | 'ARCHIVED'. */
export async function deleteCategory(id) {
  return withDeadlockRetry(() => menuRepo.deleteCategory(id));
}

export async function deleteItem(id) {
  const result = await withDeadlockRetry(() => menuRepo.removeItem(id));
  await refreshAvailability();
  return result;
}

export async function deleteTable(id) {
  return withDeadlockRetry(() => tablesRepo.remove(id));
}

export async function deleteIngredient(id) {
  try {
    return await withDeadlockRetry(() => ingredientsRepo.remove(id));
  } catch (err) {
    const appErr = fromSqlError(err);
    if (appErr?.code === 'IN_USE') {
      appErr.message = `Nguyên liệu đang dùng trong định lượng của: ${appErr.sqlMessage}. Hãy bỏ nguyên liệu khỏi định lượng các món này trước.`;
      appErr.details = { menuItems: appErr.sqlMessage.split(', ') };
    }
    throw appErr ?? err;
  }
}

// ---------- Món ----------
export const listItems = () => menuRepo.listItems();

async function assertCategory(categoryId) {
  if (!(await menuRepo.categoryExists(categoryId)))
    throw badRequest('VALIDATION_ERROR', 'Danh mục không tồn tại', { fields: [{ path: 'categoryId', message: 'Danh mục không tồn tại' }] });
}

export async function createItem(d) {
  await assertCategory(d.categoryId);
  const item = await menuRepo.createItem(d);
  refreshAvailability();
  return item;
}

export async function updateItem(id, d) {
  await assertCategory(d.categoryId);
  const item = await menuRepo.updateItem(id, d);
  if (!item) throw notFound('Không tìm thấy món');
  refreshAvailability();
  return item;
}

/** AC-010-02: tắt/bật "hết món" → khách đang mở menu thấy ngay (menu.availability_changed). */
export async function setAvailability(id, isAvailable) {
  const item = await menuRepo.setAvailability(id, isAvailable);
  if (!item) throw notFound('Không tìm thấy món');
  await refreshAvailability();
  return item;
}

export async function getBom(menuItemId) {
  const item = await menuRepo.getItem(menuItemId);
  if (!item) throw notFound('Không tìm thấy món');
  return { item, bom: await menuRepo.getBom(menuItemId) };
}

/** BR-003: định lượng > 0, nguyên liệu bắt buộc và không trùng; lưu thay toàn bộ trong một transaction. */
export async function replaceBom(menuItemId, rows) {
  const item = await menuRepo.getItem(menuItemId);
  if (!item) throw notFound('Không tìm thấy món');
  const fields = [];
  const seen = new Set();
  const existing = await ingredientsRepo.existingIds(rows.map((r) => r.ingredientId).filter(Boolean));
  rows.forEach((r, i) => {
    if (!r.ingredientId || !existing.has(r.ingredientId)) fields.push({ path: `${i}.ingredientId`, message: 'Vui lòng chọn nguyên liệu' });
    else if (seen.has(r.ingredientId)) fields.push({ path: `${i}.ingredientId`, message: 'Nguyên liệu bị trùng' });
    if (!(r.amount > 0)) fields.push({ path: `${i}.amount`, message: 'Định lượng không hợp lệ, phải lớn hơn 0' });
    seen.add(r.ingredientId);
  });
  if (fields.length) throw badRequest('VALIDATION_ERROR', 'Định lượng không hợp lệ, phải lớn hơn 0', { fields });
  const bom = await menuRepo.replaceBom(menuItemId, rows);
  refreshAvailability();
  return { item: await menuRepo.getItem(menuItemId), bom };
}

// ---------- Bàn + QR ----------
export const qrUrl = (qrToken) => `${config.publicBaseUrl}/t/${qrToken}`;
const withUrl = (t) => ({ ...t, qrUrl: qrUrl(t.qrToken) });

export async function listTables() {
  return (await tablesRepo.list()).map(withUrl);
}

export async function createTable({ code, name }) {
  try {
    return withUrl(await tablesRepo.create({ code, name: name || `Bàn ${code}`, qrToken: newQrToken() }));
  } catch (err) {
    if (isDuplicate(err)) throw conflict('DUPLICATE_CODE', 'Mã bàn đã tồn tại');
    throw err;
  }
}

export async function updateTable(id, d) {
  try {
    const t = await tablesRepo.update(id, d);
    if (!t) throw notFound('Không tìm thấy bàn');
    return withUrl(t);
  } catch (err) {
    if (isDuplicate(err)) throw conflict('DUPLICATE_CODE', 'Mã bàn đã tồn tại');
    throw err;
  }
}

/** AC-010-04: tạo lại QR → QR cũ hết hiệu lực (404). */
export async function regenerateQr(id) {
  const t = await tablesRepo.setQrToken(id, newQrToken());
  if (!t) throw notFound('Không tìm thấy bàn');
  return withUrl(t);
}

export async function qrPng(id) {
  const t = await tablesRepo.findById(id);
  if (!t) throw notFound('Không tìm thấy bàn');
  return { table: t, png: await QRCode.toBuffer(qrUrl(t.qrToken), { type: 'png', width: 480, margin: 2, errorCorrectionLevel: 'M' }) };
}

// ---------- Nguyên liệu / kho ----------
export const listIngredients = () => ingredientsRepo.list();

export async function createIngredient(d, user) {
  try {
    const ing = await ingredientsRepo.create({ ...d, userId: user.userId });
    refreshAvailability();
    return ing;
  } catch (err) {
    if (isDuplicate(err)) throw conflict('DUPLICATE_NAME', 'Tên nguyên liệu đã tồn tại');
    throw err;
  }
}

export async function updateIngredient(id, d) {
  try {
    const ing = await ingredientsRepo.update(id, d);
    if (!ing) throw notFound('Không tìm thấy nguyên liệu');
    return ing;
  } catch (err) {
    if (isDuplicate(err)) throw conflict('DUPLICATE_NAME', 'Tên nguyên liệu đã tồn tại');
    throw err;
  }
}

export async function adjustIngredient(id, { newQty, delta, reason }, user) {
  await withDeadlockRetry(() => ingredientsRepo.adjust(id, { newQty, delta, reason, userId: user.userId }));
  const ing = await ingredientsRepo.getById(id);
  if (ing.isLow)
    publish([ROOMS.staff], 'inventory.low', { ingredientId: id, name: ing.name, unit: ing.unit, available: ing.available, threshold: ing.lowStockThreshold });
  refreshAvailability();
  return ing;
}

export async function ingredientTransactions(id) {
  const ing = await ingredientsRepo.getById(id);
  if (!ing) throw notFound('Không tìm thấy nguyên liệu');
  return { ingredient: ing, transactions: await ingredientsRepo.transactions(id) };
}

// ---------- Báo cáo ----------
/** BR-005: from ≤ to, to ≤ hôm nay (giờ VN). */
function rangeOrThrow(from, to) {
  if (from > to || to > todayVn()) throw badRequest('INVALID_RANGE', 'Khoảng thời gian không hợp lệ');
  return { fromUtc: vnDayStartUtc(from), toUtc: vnDayStartUtc(addDays(to, 1)) };
}

export async function revenueReport(from, to) {
  const { fromUtc, toUtc } = rangeOrThrow(from, to);
  const [data, lowStock] = await Promise.all([reportsRepo.revenue(fromUtc, toUtc, { byHour: from === to }), ingredientsRepo.lowStock()]);
  const byDayMap = new Map(data.byDay.map((d) => [d.date, d]));
  return {
    from,
    to,
    ...data,
    byDay: eachDay(from, to).map((date) => byDayMap.get(date) ?? { date, revenue: 0, orders: 0 }),
    lowStock: lowStock.map((i) => ({ ingredientId: i.ingredientId, name: i.name, unit: i.unit, available: i.available, threshold: i.lowStockThreshold })),
  };
}

export async function paymentsReport(from, to) {
  const { fromUtc, toUtc } = rangeOrThrow(from, to);
  return reportsRepo.payments(fromUtc, toUtc);
}

/** Q-014/ADR-003: lịch sử đơn theo ngày tạo (giờ VN). */
export async function orderHistory({ from, to, status, type, page, pageSize }) {
  const { fromUtc, toUtc } = rangeOrThrow(from, to);
  return ordersRepo.history({ fromUtc, toUtc, status, type, page, pageSize });
}
