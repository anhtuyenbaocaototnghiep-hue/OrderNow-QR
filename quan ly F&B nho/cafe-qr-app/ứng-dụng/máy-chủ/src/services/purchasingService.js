// FEATURE-030 Nhà cung cấp & đơn đặt hàng (PO). "Gửi" = in / PDF / chép gửi Zalo (không EDI). Nhận hàng chọn PO → điền sẵn số còn thiếu,
// sửa thực nhận → sp_ReceiveStock cộng tồn + ReceivedBaseQty (PARTIAL / RECEIVED) + lịch sử giá. Nhận vượt cần xác nhận.
import { badRequest, conflict, notFound } from '../errors.js';
import { factorToBase } from '../domain/inventory.js';
import * as ingredientsRepo from '../repositories/ingredientsRepo.js';
import * as purchasingRepo from '../repositories/purchasingRepo.js';
import { unitMap } from './inventoryService.js';
import { receive } from './stockService.js';

export const suppliers = (opts) => purchasingRepo.suppliers(opts);

async function assertPackUnits(items) {
  const [map, ings] = await Promise.all([unitMap(), ingredientsRepo.list()]);
  const byId = new Map(ings.map((i) => [i.ingredientId, i]));
  for (const it of items) {
    const ing = byId.get(it.ingredientId);
    if (!ing) throw badRequest('VALIDATION_ERROR', 'Có nguyên liệu không tồn tại');
    if (!map.has(it.packUnitCode)) throw badRequest('VALIDATION_ERROR', `Đơn vị "${it.packUnitCode}" không tồn tại`);
    // Gói theo đơn vị quy đổi được → tự điền PackSize nếu thiếu
    if (!it.packSize) {
      const f = factorToBase(it.packUnitCode, ing.unit, map);
      if (!f) throw badRequest('UNIT_MISMATCH', `Nhập số ${ing.unit} trong một ${it.packUnitCode} cho ${ing.name}`);
      it.packSize = f;
    }
  }
}

export async function saveSupplier(id, d) {
  if (d.items) await assertPackUnits(d.items);
  const supplierId = await purchasingRepo.saveSupplier(id, d);
  if (!supplierId) throw notFound('Không tìm thấy nhà cung cấp');
  return purchasingRepo.getSupplier(supplierId);
}

export const listPos = (statuses) => purchasingRepo.listPos({ statuses });

export async function getPo(id) {
  const po = await purchasingRepo.getPo(id);
  if (!po) throw notFound('Không tìm thấy đơn đặt hàng');
  return po;
}

/** Dòng PO: gói theo nhà cung cấp (SupplierIngredients) nếu không ghi rõ. */
async function poLines(supplierId, lines) {
  const sup = await purchasingRepo.getSupplier(supplierId);
  if (!sup) throw badRequest('VALIDATION_ERROR', 'Nhà cung cấp không tồn tại');
  const out = lines.map((l) => {
    const si = sup.items.find((i) => i.ingredientId === l.ingredientId);
    const packUnitCode = l.packUnitCode ?? si?.packUnitCode;
    const packSize = l.packSize ?? (packUnitCode === si?.packUnitCode ? si?.packSize : null);
    if (!packUnitCode) throw badRequest('VALIDATION_ERROR', 'Chọn đơn vị đặt hàng cho từng nguyên liệu');
    return { ...l, packUnitCode, packSize, unitPrice: l.unitPrice ?? si?.lastPrice ?? null };
  });
  await assertPackUnits(out);
  for (const l of out) l.orderedBaseQty = Math.round(l.orderedPacks * l.packSize * 1000) / 1000;
  if (new Set(out.map((l) => l.ingredientId)).size !== out.length) throw badRequest('VALIDATION_ERROR', 'Mỗi nguyên liệu chỉ một dòng trong đơn đặt hàng');
  return out;
}

export async function savePo(id, d, user) {
  const lines = await poLines(d.supplierId, d.lines);
  const poId = await purchasingRepo.savePo(id, { ...d, lines }, user.userId);
  if (!poId) throw conflict('PO_NOT_DRAFT', 'Chỉ sửa được đơn đặt hàng nháp');
  return getPo(poId);
}

export async function sendPo(id) {
  if (!(await purchasingRepo.markSent(id))) throw conflict('PO_NOT_DRAFT', 'Chỉ gửi được đơn đặt hàng nháp');
  return getPo(id);
}

export async function cancelPo(id) {
  const r = await purchasingRepo.cancelPo(id);
  if (r === 'NOT_FOUND') throw notFound('Không tìm thấy đơn đặt hàng');
  if (r === 'HAS_RECEIPTS') throw conflict('PO_HAS_RECEIPTS', 'Đơn đã nhận một phần — không hủy được');
  if (r === 'STATE') throw conflict('PO_CANCELLED', 'Đơn đã hủy');
  return getPo(id);
}

/**
 * Nhận hàng theo PO. lines: [{ poLineId, packs? | qty?, packPrice?, expiryDate?, lotCode? }] — số gói thực nhận (quy ra gốc theo PackSize).
 * confirmOver: đồng ý nhận vượt số đặt.
 */
export async function receivePo(id, { lines, note, confirmOver }, user) {
  const po = await getPo(id);
  if (!['SENT', 'PARTIAL'].includes(po.status)) throw conflict('PO_NOT_RECEIVABLE', 'Đơn đặt hàng chưa gửi hoặc đã nhận đủ / đã hủy');
  const byLine = new Map(po.lines.map((l) => [l.poLineId, l]));
  const rows = lines
    .filter((l) => (l.packs ?? l.qty ?? 0) > 0)
    .map((l) => {
      const pl = byLine.get(l.poLineId);
      if (!pl) throw badRequest('VALIDATION_ERROR', 'Dòng không thuộc đơn đặt hàng này');
      const qty = l.qty ?? Math.round(l.packs * pl.packSize * 1000) / 1000;
      const packPrice = l.packPrice ?? pl.unitPrice;
      return {
        ingredientId: pl.ingredientId,
        qty,
        unitCost: packPrice === null || packPrice === undefined ? null : Math.round((packPrice / pl.packSize) * 10000) / 10000,
        packUnitCode: pl.packUnitCode,
        packQty: Math.round((qty / pl.packSize) * 1000) / 1000,
        packPrice: packPrice ?? null,
        expiryDate: l.expiryDate ?? null,
        lotCode: l.lotCode ?? null,
        poLineId: pl.poLineId,
      };
    });
  if (!rows.length) throw badRequest('VALIDATION_ERROR', 'Nhập số lượng thực nhận');
  const receipt = await receive(
    { supplier: po.supplierName, note: note ?? `Nhận theo PO #${id}`, lines: rows, poId: id, supplierId: po.supplierId, confirmOver, raw: true },
    user,
  );
  return { receipt, po: await getPo(id) };
}

export const supplierReport = (fromUtc, toUtc) => purchasingRepo.supplierReport(fromUtc, toUtc);
