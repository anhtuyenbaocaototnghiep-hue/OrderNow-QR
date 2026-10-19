// FEATURE-023 Nhập kho & kiểm kê; báo cáo giá vốn (COGS) và hao hụt theo kỳ.
import { withDeadlockRetry } from '../db.js';
import { badRequest, conflict, fromSqlError, notFound } from '../errors.js';
import * as stockRepo from '../repositories/stockRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { refreshAvailability } from './menuService.js';
import { invalidateCatalog } from './pricingService.js';
import { toBaseLines } from './inventoryService.js';

/**
 * Phiếu nhập. Dòng nhập theo đơn vị gốc ({ qty, unitCost }) hoặc đơn vị đóng gói ({ packUnitCode, packQty, packPrice } — F-031),
 * kèm hạn dùng / mã lô (F-028). `raw`: dòng đã quy ra gốc (nhận theo PO — F-030).
 */
export async function receive(body, user) {
  const ids = body.lines.map((l) => l.ingredientId);
  if (new Set(ids).size !== ids.length) throw badRequest('VALIDATION_ERROR', 'Mỗi nguyên liệu chỉ nhập một dòng trên phiếu');
  const lines = body.raw ? body.lines : await toBaseLines(body.lines);
  let receiptId;
  try {
    receiptId = await withDeadlockRetry(() => stockRepo.createReceipt({ ...body, lines, userId: user.userId }));
  } catch (err) {
    const appErr = fromSqlError(err);
    if (appErr?.code === 'INVALID_RECEIPT' && /^\d/.test(appErr.sqlMessage)) appErr.message = 'Có nguyên liệu không tồn tại hoặc đã bị xóa';
    if (appErr?.code === 'OVER_RECEIPT') {
      appErr.message = `Nhận vượt số đã đặt: ${appErr.sqlMessage} — kiểm tra lại hoặc xác nhận nhận vượt`;
      appErr.details = { items: appErr.sqlMessage.split(', ') };
    }
    throw appErr ?? err;
  }
  invalidateCatalog();
  refreshAvailability(); // nhập kho → món "hết" có thể bán lại ngay (D-12)
  const receipt = await stockRepo.getReceipt(receiptId);
  publish([ROOMS.staff], 'inventory.received', { receiptId, lines: receipt.lines.length });
  return receipt;
}

export const listReceipts = (fromUtc, toUtc) => stockRepo.listReceipts(fromUtc, toUtc);

export async function getReceipt(id) {
  const r = await stockRepo.getReceipt(id);
  if (!r) throw notFound('Không tìm thấy phiếu nhập');
  return r;
}

export const listStocktakes = () => stockRepo.listStocktakes();

export async function getStocktake(id) {
  const s = await stockRepo.getStocktake(id);
  if (!s) throw notFound('Không tìm thấy phiếu kiểm kê');
  return s;
}

export async function createStocktake(body, user) {
  const id = await stockRepo.createStocktake({ ...body, userId: user.userId });
  const s = await stockRepo.getStocktake(id);
  if (s.lines.length === 0) {
    await stockRepo.removeDraft(id);
    throw badRequest('VALIDATION_ERROR', 'Chọn ít nhất một nguyên liệu để kiểm kê');
  }
  return s;
}

export async function updateCounts(id, lines) {
  const status = await stockRepo.updateCounts(id, lines);
  if (status === null) throw notFound('Không tìm thấy phiếu kiểm kê');
  if (status !== 'DRAFT') throw conflict('STOCKTAKE_NOT_DRAFT', 'Phiếu kiểm kê đã chốt');
  return stockRepo.getStocktake(id);
}

export async function post(id, user) {
  try {
    await withDeadlockRetry(() => stockRepo.post(id, user.userId));
  } catch (err) {
    const appErr = fromSqlError(err);
    if (appErr?.code === 'BELOW_RESERVED' && appErr.sqlNumber === 50103) {
      appErr.message = `Số đếm của ${appErr.sqlMessage} thấp hơn phần đang giữ cho đơn chưa hoàn tất — hoàn tất/hủy các đơn đó rồi chốt lại`;
    }
    throw appErr ?? err;
  }
  refreshAvailability();
  return stockRepo.getStocktake(id);
}

export async function removeDraft(id) {
  if (!(await stockRepo.removeDraft(id))) throw conflict('STOCKTAKE_NOT_DRAFT', 'Chỉ xóa được phiếu kiểm kê chưa chốt');
  return { ok: true };
}

export async function costReport(fromUtc, toUtc) {
  const [items, shrink] = await Promise.all([stockRepo.cogs(fromUtc, toUtc), stockRepo.shrinkage(fromUtc, toUtc)]);
  const known = items.filter((i) => i.cogs !== null);
  return {
    items,
    totals: {
      revenue: items.reduce((s, i) => s + i.revenue, 0),
      revenueWithCost: known.reduce((s, i) => s + i.revenue, 0),
      cogs: known.reduce((s, i) => s + i.cogs, 0),
      grossProfit: known.reduce((s, i) => s + i.grossProfit, 0),
    },
    shrinkage: shrink,
    shrinkageValue: shrink.reduce((s, x) => s + (x.value < 0 ? -x.value : 0), 0),
  };
}
