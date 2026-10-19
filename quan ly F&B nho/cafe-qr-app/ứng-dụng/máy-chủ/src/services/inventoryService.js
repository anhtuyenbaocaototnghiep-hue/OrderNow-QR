// Kho nâng cao giai đoạn 5 (ADR-006): đơn vị & giá vốn (F-031), bán thành phẩm + phiếu sơ chế (F-027), hao hụt định mức + phiếu hủy (F-032),
// lô & hạn dùng FEFO (F-028). Mọi thay đổi tồn đi qua SP; sau đó báo menu (món hết/còn) + quầy (sắp hết, sắp hết hạn).
import { withDeadlockRetry } from '../db.js';
import { badRequest, conflict, fromSqlError, notFound } from '../errors.js';
import { checkRecipeGraph, factorToBase, lossAnalysis } from '../domain/inventory.js';
import * as ingredientsRepo from '../repositories/ingredientsRepo.js';
import * as inventoryRepo from '../repositories/inventoryRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { refreshAvailability } from './menuService.js';
import { invalidateCatalog } from './pricingService.js';

async function ingredientOr404(id) {
  const ing = await ingredientsRepo.getById(id);
  if (!ing) throw notFound('Không tìm thấy nguyên liệu');
  return ing;
}

function notifyLow(ings) {
  for (const ing of ings) {
    if (ing?.isLow)
      publish([ROOMS.staff], 'inventory.low', {
        ingredientId: ing.ingredientId,
        name: ing.name,
        unit: ing.unit,
        available: ing.available,
        threshold: ing.lowStockThreshold,
      });
  }
}

// ---------- Đơn vị (F-031) ----------
export const units = () => inventoryRepo.units();

export async function unitMap() {
  return new Map((await inventoryRepo.units()).map((u) => [u.unitCode, u]));
}

export async function saveUnit(d) {
  if (d.baseUnitCode) {
    const map = await unitMap();
    if (!map.has(d.baseUnitCode)) throw badRequest('VALIDATION_ERROR', 'Đơn vị gốc không tồn tại');
    // Không tạo vòng: đi theo chuỗi đơn vị gốc mới không được quay lại chính nó
    for (let c = d.baseUnitCode, hop = 0; c && hop < 20; c = map.get(c)?.baseUnitCode, hop++) {
      if (c === d.unitCode) throw badRequest('VALIDATION_ERROR', 'Quy đổi đơn vị bị vòng lặp');
    }
  }
  await inventoryRepo.saveUnit(d);
  return units();
}

export async function deleteUnit(code) {
  const r = await inventoryRepo.deleteUnit(code);
  if (r === 'NOT_FOUND') throw notFound('Không tìm thấy đơn vị');
  if (r === 'IN_USE') throw conflict('IN_USE', 'Đơn vị đang được dùng (nguyên liệu, quy đổi, phiếu nhập hoặc nhà cung cấp)');
  return { result: 'DELETED' };
}

/** Dòng nhập theo đơn vị đóng gói → đơn vị gốc của nguyên liệu: qty = packQty × hệ số; giá gốc = giá gói ÷ hệ số. */
export async function toBaseLines(lines) {
  const map = await unitMap();
  const ings = new Map((await ingredientsRepo.list()).map((i) => [i.ingredientId, i]));
  return lines.map((l) => {
    const ing = ings.get(l.ingredientId);
    if (!ing) throw badRequest('INVALID_RECEIPT', 'Có nguyên liệu không tồn tại hoặc đã bị xóa');
    if (!l.packUnitCode || l.packUnitCode === ing.unit) {
      return { ...l, qty: l.qty ?? l.packQty, unitCost: l.unitCost ?? l.packPrice ?? null, packUnitCode: null, packQty: null, packPrice: null };
    }
    const factor = factorToBase(l.packUnitCode, ing.unit, map);
    if (!factor) throw badRequest('UNIT_MISMATCH', `Không quy đổi được "${l.packUnitCode}" sang ${ing.unit} cho ${ing.name}`);
    return {
      ...l,
      qty: Math.round(l.packQty * factor * 1000) / 1000,
      unitCost: l.packPrice === null || l.packPrice === undefined ? null : Math.round((l.packPrice / factor) * 10000) / 10000,
    };
  });
}

// ---------- Thuộc tính kho nâng cao ----------
export async function setAdvanced(id, { kind, shelfLifeHours, wastePercent, trackLots }) {
  const ing = await ingredientOr404(id);
  if (kind === 'RAW' && ing.hasRecipe) throw conflict('HAS_RECIPE', 'Nguyên liệu đang có công thức sơ chế — xóa công thức trước khi chuyển về nguyên liệu thô');
  await inventoryRepo.setIngredientAdvanced(id, { kind, shelfLifeHours, wastePercent });
  if (trackLots !== undefined && trackLots !== ing.trackLots) await withDeadlockRetry(() => inventoryRepo.setTrackLots(id, trackLots));
  refreshAvailability();
  return ingredientsRepo.getById(id);
}

// ---------- Công thức sơ chế (F-027) ----------
export async function getRecipe(id) {
  const ing = await ingredientOr404(id);
  return { ingredient: ing, recipe: await inventoryRepo.getRecipe(id) };
}

export async function saveRecipe(id, body) {
  await ingredientOr404(id);
  const ids = body.lines.map((l) => l.ingredientId);
  if (ids.includes(id)) throw badRequest('RECIPE_CYCLE', 'Bán thành phẩm không thể là nguyên liệu của chính nó');
  if (new Set(ids).size !== ids.length) throw badRequest('VALIDATION_ERROR', 'Mỗi nguyên liệu chỉ một dòng trong công thức');
  const found = await ingredientsRepo.existingIds(ids);
  if (ids.some((x) => !found.has(x))) throw badRequest('VALIDATION_ERROR', 'Có nguyên liệu không tồn tại');
  const graph = await inventoryRepo.recipeEdges();
  graph.set(id, ids);
  const check = checkRecipeGraph(id, graph);
  if (check.error === 'RECIPE_CYCLE') throw badRequest('RECIPE_CYCLE', 'Công thức bị vòng lặp (bán thành phẩm dùng lại chính nó qua công thức khác)');
  if (check.error === 'RECIPE_TOO_DEEP') throw badRequest('RECIPE_TOO_DEEP', 'Bán thành phẩm lồng quá 3 cấp');
  await inventoryRepo.saveRecipe(id, body);
  invalidateCatalog();
  return getRecipe(id);
}

export const semiList = () => inventoryRepo.semiList();

/** Xem trước một mẻ: nguyên liệu sẽ trừ × hệ số, đủ/thiếu, giá vốn ước tính. */
export async function prepPreview(semiId, multiplier) {
  const recipe = await inventoryRepo.getRecipe(semiId);
  if (!recipe) throw notFound('Chưa có công thức sơ chế', 'NO_RECIPE');
  const lines = recipe.lines.map((l) => {
    const need = Math.round(l.qty * multiplier * 1000) / 1000;
    return { ...l, need, enough: l.available >= need, cost: Math.round(need * l.avgCost) };
  });
  return {
    semiIngredientId: semiId,
    multiplier,
    outputQty: Math.round(recipe.outputQty * multiplier * 1000) / 1000,
    lines,
    estimatedCost: lines.reduce((s, l) => s + l.cost, 0),
    canPrepare: lines.every((l) => l.enough),
  };
}

export async function postBatch({ semiIngredientId, multiplier, note }, user) {
  let batchId;
  try {
    batchId = await withDeadlockRetry(() => inventoryRepo.postBatch({ semiIngredientId, multiplier, note, userId: user.userId }));
  } catch (err) {
    const appErr = fromSqlError(err);
    if (appErr?.code === 'PREP_SHORT') appErr.message = `Không đủ nguyên liệu để sơ chế: ${appErr.sqlMessage}`;
    throw appErr ?? err;
  }
  refreshAvailability();
  const ings = await ingredientsRepo.list();
  notifyLow(ings.filter((i) => i.isLow));
  const [batch] = (await inventoryRepo.listBatches(new Date(Date.now() - 60_000), new Date(Date.now() + 60_000))).filter((b) => b.batchId === batchId);
  publish([ROOMS.staff], 'inventory.prepared', { batchId, semiIngredientId, outputQty: batch?.outputQty });
  return { ...batch, transactions: await inventoryRepo.batchTransactions(batchId) };
}

export const listBatches = (fromUtc, toUtc) => inventoryRepo.listBatches(fromUtc, toUtc);

// ---------- Phiếu hủy (F-032) + hủy lô (F-028) ----------
export async function logWaste(body, user) {
  let wasteId;
  try {
    wasteId = await withDeadlockRetry(() => inventoryRepo.logWaste({ ...body, userId: user.userId }));
  } catch (err) {
    const appErr = fromSqlError(err);
    if (appErr?.code === 'BELOW_RESERVED') appErr.message = 'Không thể hủy phần đang giữ cho đơn chưa hoàn tất';
    throw appErr ?? err;
  }
  refreshAvailability();
  const all = await inventoryRepo.listWaste(new Date(Date.now() - 60_000), new Date(Date.now() + 60_000));
  const w = all.find((x) => x.wasteId === wasteId);
  notifyLow([await ingredientsRepo.getById(w.ingredientId)]);
  return w;
}

export const listWaste = (fromUtc, toUtc) => inventoryRepo.listWaste(fromUtc, toUtc);

export async function lotsOf(ingredientId, includeClosed) {
  const ingredient = await ingredientOr404(ingredientId);
  return { ingredient, lots: await inventoryRepo.lotsOf(ingredientId, includeClosed) };
}

export const expiringLots = (days) => inventoryRepo.expiringLots(days);

/** Hủy toàn bộ phần còn lại của một lô (thường là lô hết hạn) → WasteLogs(EXPIRED) + đóng lô. */
export async function writeOffLot(lotId, note, user) {
  const lot = await inventoryRepo.getLot(lotId);
  if (!lot || lot.isClosed) throw notFound('Không tìm thấy lô đang mở');
  return logWaste(
    { lotId, reason: 'EXPIRED', note: note || `Hủy lô ${lot.lotCode ?? `#${lotId}`}${lot.expiryDate ? ` hết hạn ${lot.expiryDate}` : ''}` },
    user,
  );
}

// ---------- Báo cáo ----------
export const cogsReport = (fromUtc, toUtc) => inventoryRepo.cogsReport(fromUtc, toUtc);

export async function lossReport(fromUtc, toUtc) {
  const rows = await inventoryRepo.lossReport(fromUtc, toUtc);
  return rows
    .filter((r) => r.consumption || r.loggedWaste || r.stocktakeShortage)
    .map((r) => {
      const a = lossAnalysis({
        consumption: r.consumption,
        wastePercent: r.wastePercent,
        loggedWaste: r.loggedWaste,
        stocktakeShortage: Math.max(0, r.stocktakeShortage),
      });
      return { ...r, ...a, abnormalValue: Math.round(a.abnormal * r.avgCost) };
    });
}
