// FEATURE-029 Dự báo nhập hàng (ADR-006 D-22): job 02:00 tính 14 ngày tới từ tiêu thụ 4 tuần (WMA theo thứ × (1 + hao hụt định mức)),
// bỏ ngày quán đóng cửa. Đề xuất nhập = max(0, nhu cầu đến ngày giao kế tiếp + lead time + an toàn 20 % − khả dụng − đang về), quy ra gói.
import { badRequest } from '../errors.js';
import { nextDeliveryDate, replenishment, wmaForecast } from '../domain/inventory.js';
import * as forecastRepo from '../repositories/forecastRepo.js';
import * as purchasingRepo from '../repositories/purchasingRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { addDays, todayVn, vnDayStartUtc } from '../utils/time.js';
import { getSettings } from './settingsService.js';
import { savePo } from './purchasingService.js';

const HORIZON = 14;
const dow = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Tính + lưu dự báo 14 ngày (idempotent). today: 'YYYY-MM-DD' (test truyền ngày cố định). */
export async function computeForecasts(today = todayVn()) {
  const weeks = 4;
  const from = addDays(today, -7 * weeks);
  const [usage, open, ings] = await Promise.all([
    forecastRepo.dailyConsumption(vnDayStartUtc(from), vnDayStartUtc(today)),
    forecastRepo.openDays(vnDayStartUtc(from), vnDayStartUtc(today)),
    forecastRepo.ingredientsForForecast(),
  ]);
  const byIng = new Map();
  for (const u of usage) {
    if (!byIng.has(u.ingredientId)) byIng.set(u.ingredientId, new Map());
    byIng.get(u.ingredientId).set(u.date, u.qty);
  }
  const rows = [];
  for (const ing of ings) {
    const days = byIng.get(ing.ingredientId);
    if (!days) continue; // chưa có lịch sử → "Không đủ dữ liệu"
    for (let k = 0; k < HORIZON; k++) {
      const date = addDays(today, k);
      // Cùng thứ trong 4 tuần gần nhất đã qua (gần nhất trước); ngày quán đóng cửa → null
      let last = addDays(date, -7);
      while (last >= today) last = addDays(last, -7);
      const same = [];
      for (let w = 0; w < weeks; w++) {
        const d = addDays(last, -7 * w);
        same.push(open.has(d) ? (days.get(d) ?? 0) : null);
      }
      const f = wmaForecast(same, ing.wastePercent);
      rows.push({ ingredientId: ing.ingredientId, date, qty: f.qty, samples: f.samples });
    }
  }
  await forecastRepo.saveForecasts(rows);
  return { ingredients: new Set(rows.map((r) => r.ingredientId)).size, rows: rows.length };
}

/**
 * Bảng đề xuất nhập hàng. nextDeliveryDate (tùy chọn) ép ngày giao; supplierId lọc theo nhà cung cấp ưu tiên.
 * Mỗi nguyên liệu: khả dụng, đang về, nhu cầu, an toàn, đề xuất (gốc + gói), ngày dự kiến hết, cờ "hết trước ngày giao".
 */
export async function replenishmentPlan({ nextDeliveryDate: forced = null, supplierId = null } = {}) {
  const today = todayVn();
  const [ings, fc, incoming, sups, settings] = await Promise.all([
    forecastRepo.ingredientsForForecast(),
    forecastRepo.forecasts(today),
    purchasingRepo.incomingByIngredient(),
    purchasingRepo.suppliers({ activeOnly: true }),
    getSettings(),
  ]);
  const prefer = new Map();
  for (const s of sups) for (const i of s.items) if (i.isPreferred || !prefer.has(i.ingredientId)) prefer.set(i.ingredientId, { supplier: s, item: i });
  const out = [];
  for (const ing of ings) {
    const p = prefer.get(ing.ingredientId);
    if (supplierId && p?.supplier.supplierId !== supplierId) continue;
    const daily = fc.get(ing.ingredientId) ?? [];
    const hasData = daily.some((d) => d.samples > 0);
    const delivery = forced ?? nextDeliveryDate(today, p?.supplier.deliveryDaysMask ?? 127, 1);
    const lead = p?.supplier.leadTimeDays ?? 1;
    const horizonDays = Math.max(1, Math.round((Date.parse(delivery) - Date.parse(today)) / 86400000) + lead);
    const inc = incoming.get(ing.ingredientId) ?? 0;
    const r = hasData
      ? replenishment({
          daily,
          horizonDays,
          available: ing.available,
          incoming: inc,
          safetyPercent: settings.forecastSafetyPercent,
          packSize: p?.item.packSize ?? 1,
          deliveryDate: delivery,
        })
      : null;
    out.push({
      ingredientId: ing.ingredientId,
      name: ing.name,
      unit: ing.unit,
      available: ing.available,
      incoming: inc,
      supplier: p ? { supplierId: p.supplier.supplierId, name: p.supplier.name } : null,
      packUnitCode: p?.item.packUnitCode ?? null,
      packSize: p?.item.packSize ?? null,
      nextDeliveryDate: delivery,
      horizonDays,
      enoughData: hasData,
      ...(r ?? { demand: null, safety: null, suggestBase: 0, suggestPacks: 0, runOutDate: null, runsOutBeforeDelivery: false }),
    });
  }
  return out.sort(
    (a, b) => Number(b.runsOutBeforeDelivery) - Number(a.runsOutBeforeDelivery) || b.suggestBase - a.suggestBase || a.name.localeCompare(b.name, 'vi'),
  );
}

/** Tạo PO nháp từ các dòng đề xuất đã tick (theo một nhà cung cấp). */
export async function poFromSuggestion({ supplierId, lines, expectedDate, note }, user) {
  if (!lines.length) throw badRequest('VALIDATION_ERROR', 'Chọn ít nhất một nguyên liệu');
  return savePo(
    null,
    { supplierId, expectedDate, note: note ?? 'Tạo từ đề xuất nhập hàng', lines: lines.map((l) => ({ ingredientId: l.ingredientId, orderedPacks: l.packs })) },
    user,
  );
}

/** Biểu đồ một nguyên liệu: tiêu thụ 4 tuần qua + dự báo 14 ngày tới. */
export async function series(ingredientId) {
  const today = todayVn();
  const from = addDays(today, -28);
  const [usage, fc] = await Promise.all([forecastRepo.dailyConsumption(vnDayStartUtc(from), vnDayStartUtc(addDays(today, 1))), forecastRepo.forecasts(today)]);
  const hist = new Map(usage.filter((u) => u.ingredientId === ingredientId).map((u) => [u.date, u.qty]));
  const history = [];
  for (let d = from; d <= today; d = addDays(d, 1)) history.push({ date: d, qty: hist.get(d) ?? 0, dow: dow(d) });
  return { ingredientId, history, forecast: (fc.get(ingredientId) ?? []).map((f) => ({ date: f.date, qty: f.qty, dow: dow(f.date) })) };
}

/** Job 06:00: nguyên liệu sẽ hết trước ngày giao kế tiếp → báo quầy. */
export async function runOutAlert() {
  const plan = await replenishmentPlan();
  const risky = plan.filter((p) => p.runsOutBeforeDelivery);
  if (risky.length) {
    publish([ROOMS.staff], 'inventory.runout', {
      items: risky.map((r) => ({ ingredientId: r.ingredientId, name: r.name, runOutDate: r.runOutDate, nextDeliveryDate: r.nextDeliveryDate })),
    });
  }
  return { risky: risky.length };
}
