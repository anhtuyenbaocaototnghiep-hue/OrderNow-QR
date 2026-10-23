// FEATURE-023 Nhập kho & kiểm kê; báo cáo giá vốn (COGS) và hao hụt theo kỳ.
// FEATURE-048 (ADR-009): sửa / hủy phiếu nhập, sửa phiếu kiểm kê nháp, hủy phiếu kiểm kê đã chốt.
import { withDeadlockRetry } from '../db.js';
import { badRequest, conflict, fromSqlError, notFound } from '../errors.js';
import * as purchasingRepo from '../repositories/purchasingRepo.js';
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

// Lỗi SP mang tên nguyên liệu trong message → thông báo có tên + hướng làm (FEATURE-048)
const NAMED = {
  RECEIPT_AFTER_STOCKTAKE: (n) => `Đã kiểm kê ${n} sau lần nhập này — tồn đã chốt theo số đếm. Muốn chỉnh, hãy làm phiếu kiểm kê mới`,
  RECEIPT_STOCK_USED: (n) => `Hàng của phiếu đã được dùng: ${n} — tồn còn lại (trừ phần đang giữ cho đơn) không đủ để trừ lại`,
  RECEIPT_LOT_USED: (n) => `Lô hàng của ${n} đã được dùng / hủy (hoặc nguyên liệu bật theo lô sau khi nhập) — không sửa / hủy được dòng này`,
  STOCKTAKE_LOCKED: (n) => `${n} đang nằm trong phiếu kiểm kê nháp — chốt hoặc xóa phiếu nháp trước`,
  STOCKTAKE_NOT_LATEST: (n) => `${n} đã có phiếu kiểm kê chốt sau phiếu này — chỉ hủy được phiếu chốt gần nhất`,
  STOCKTAKE_SURPLUS_USED: (n) => `Phần thừa của ${n} đã được dùng — tồn không đủ để trừ lại`,
  OVER_RECEIPT: (n) => `Nhận vượt số đã đặt: ${n} — kiểm tra lại hoặc xác nhận nhận vượt`,
};
function reviseError(err) {
  const appErr = fromSqlError(err);
  if (!appErr) return err;
  if (NAMED[appErr.code]) {
    appErr.message = NAMED[appErr.code](appErr.sqlMessage);
    appErr.details = { items: appErr.sqlMessage.split(', ') };
  }
  if (appErr.code === 'INVALID_RECEIPT' && /^\d/.test(appErr.sqlMessage)) appErr.message = 'Có nguyên liệu không tồn tại hoặc đã bị xóa';
  return appErr;
}

async function afterRevise(receiptId) {
  invalidateCatalog();
  refreshAvailability(); // tồn đổi → món "hết" / bán lại (D-12)
  publish([ROOMS.staff], 'inventory.received', { receiptId, revised: true });
  return stockRepo.getReceipt(receiptId);
}

const eq = (a, b) => (a ?? null) === (b ?? null) || (a !== null && a !== undefined && b !== null && b !== undefined && Number(a) === Number(b));

/**
 * Dòng phiếu sửa → đơn vị gốc (review G3):
 * - dòng người dùng không đổi (cùng đơn vị nhập, SL, giá, hạn, mã lô) → giữ đúng SL / giá gốc đã lưu — không quy đổi lại;
 * - phiếu theo PO, dòng nhập theo gói của dòng PO → quy theo PackSize của dòng PO (như receivePo), không theo bảng đơn vị chung;
 * - còn lại → bảng đơn vị (F-031).
 */
async function editLines(receipt, lines) {
  const old = new Map(receipt.lines.map((l) => [l.ingredientId, l]));
  const po = receipt.poId ? await purchasingRepo.getPo(receipt.poId) : null;
  const poLine = new Map((po?.lines ?? []).map((l) => [l.ingredientId, l]));
  const out = [];
  const rest = [];
  for (const l of lines) {
    const o = old.get(l.ingredientId);
    const sameMeta = o && eq(o.expiryDate, l.expiryDate || null) && eq(o.lotCode, l.lotCode || null);
    const samePack = o && l.packUnitCode && o.packUnitCode === l.packUnitCode && eq(o.packQty, l.packQty) && eq(o.packPrice, l.packPrice);
    const sameBase = o && !l.packUnitCode && !o.packUnitCode && eq(o.qty, l.qty) && eq(o.unitCost, l.unitCost);
    const pl = poLine.get(l.ingredientId);
    if (sameMeta && (samePack || sameBase)) {
      out.push({ ...l, qty: o.qty, unitCost: o.unitCost, packUnitCode: o.packUnitCode, packQty: o.packQty, packPrice: o.packPrice });
    } else if (pl && l.packUnitCode && l.packUnitCode === pl.packUnitCode && pl.packSize > 0) {
      out.push({
        ...l,
        qty: Math.round(l.packQty * pl.packSize * 1000) / 1000,
        unitCost: l.packPrice === null || l.packPrice === undefined ? null : Math.round((l.packPrice / pl.packSize) * 10000) / 10000,
      });
    } else rest.push(l);
  }
  return [...out, ...(rest.length ? await toBaseLines(rest) : [])];
}

/** Sửa phiếu nhập (FEATURE-048, D-40): dòng như phiếu mới (đơn vị gốc / đóng gói, hạn dùng, mã lô); giữ số phiếu; bắt buộc lý do. */
export async function updateReceipt(id, body, user) {
  const ids = body.lines.map((l) => l.ingredientId);
  if (new Set(ids).size !== ids.length) throw badRequest('VALIDATION_ERROR', 'Mỗi nguyên liệu chỉ nhập một dòng trên phiếu');
  const receipt = await stockRepo.getReceipt(id);
  if (!receipt) throw notFound('Không tìm thấy phiếu nhập');
  const lines = await editLines(receipt, body.lines);
  try {
    await withDeadlockRetry(() =>
      stockRepo.reviseReceipt({
        receiptId: id,
        userId: user.userId,
        mode: 'EDIT',
        reason: body.reason,
        supplier: body.supplier === undefined ? receipt.supplier : body.supplier, // không gửi = giữ nguyên
        note: body.note === undefined ? receipt.note : body.note,
        lines,
        confirmOver: body.confirmOver,
      }),
    );
  } catch (err) {
    throw reviseError(err);
  }
  return afterRevise(id);
}

/** Hủy phiếu nhập (FEATURE-048, D-39): trừ lại kho, giữ phiếu + lý do. */
export async function voidReceipt(id, { reason }, user) {
  try {
    await withDeadlockRetry(() => stockRepo.reviseReceipt({ receiptId: id, userId: user.userId, mode: 'VOID', reason }));
  } catch (err) {
    throw reviseError(err);
  }
  return afterRevise(id);
}

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

/** Sửa phiếu kiểm kê nháp: ghi chú + danh sách nguyên liệu (FEATURE-048, D-41). */
export async function updateStocktake(id, body) {
  const status = await stockRepo.updateDraft(id, body);
  if (status === null) throw notFound('Không tìm thấy phiếu kiểm kê');
  if (status === 'EMPTY') throw badRequest('VALIDATION_ERROR', 'Chọn ít nhất một nguyên liệu để kiểm kê');
  if (status !== 'DRAFT') throw conflict('STOCKTAKE_NOT_DRAFT', 'Chỉ sửa được phiếu kiểm kê chưa chốt');
  return stockRepo.getStocktake(id);
}

/** Hủy phiếu kiểm kê đã chốt: hoàn lại điều chỉnh tồn, không tính hao hụt (FEATURE-048, D-41). */
export async function voidStocktake(id, { reason }, user) {
  try {
    await withDeadlockRetry(() => stockRepo.voidStocktake(id, user.userId, reason));
  } catch (err) {
    throw reviseError(err);
  }
  refreshAvailability();
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
