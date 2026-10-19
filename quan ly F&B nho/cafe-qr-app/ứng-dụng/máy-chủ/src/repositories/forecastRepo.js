// FEATURE-029 Dự báo nhập hàng: tiêu thụ theo ngày quán (DEDUCT + PREP_OUT), ngày quán mở (có lượt thu), lưu dự báo 14 ngày.
import { query, sql } from '../db.js';

const n = (v) => (v === null || v === undefined ? null : Number(v));

/** Tiêu thụ từng nguyên liệu theo ngày quán (giờ VN) từ `fromDate` (YYYY-MM-DD) đến trước `toDate`. */
export async function dailyConsumption(fromUtc, toUtc) {
  const r = await query(
    `SELECT t.IngredientId, CONVERT(CHAR(10), CAST(DATEADD(HOUR, 7, t.CreatedAt) AS DATE), 23) AS D, SUM(-t.Delta) AS Qty
     FROM dbo.InventoryTransactions t
     WHERE t.Type IN ('DEDUCT', 'PREP_OUT') AND t.CreatedAt >= @f AND t.CreatedAt < @t
     GROUP BY t.IngredientId, CAST(DATEADD(HOUR, 7, t.CreatedAt) AS DATE)`,
    { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] },
  );
  return r.recordset.map((x) => ({ ingredientId: x.IngredientId, date: x.D, qty: n(x.Qty) }));
}

/** Ngày quán có mở cửa (có ít nhất một lượt thu) — ngày khác coi là đóng cửa, bỏ khỏi dự báo. */
export async function openDays(fromUtc, toUtc) {
  const r = await query(
    `SELECT DISTINCT CONVERT(CHAR(10), CAST(DATEADD(HOUR, 7, PaidAt) AS DATE), 23) AS D FROM dbo.Payments WHERE PaidAt >= @f AND PaidAt < @t`,
    { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] },
  );
  return new Set(r.recordset.map((x) => x.D));
}

export async function ingredientsForForecast() {
  const r = await query(`
    SELECT i.IngredientId, i.Name, i.Unit, i.StockQty, i.ReservedQty, i.WastePercent, i.LowStockThreshold, i.AvgCost,
           ISNULL((SELECT ex.ExpiredQty FROM dbo.tvf_ExpiredLotQty() ex WHERE ex.IngredientId = i.IngredientId), 0) AS ExpiredQty
    FROM dbo.Ingredients i WHERE i.DeletedAt IS NULL AND i.IsActive = 1 ORDER BY i.Name`);
  return r.recordset.map((x) => ({
    ingredientId: x.IngredientId,
    name: x.Name,
    unit: x.Unit,
    available: Math.round((n(x.StockQty) - n(x.ReservedQty) - n(x.ExpiredQty)) * 1000) / 1000,
    wastePercent: n(x.WastePercent),
    lowStockThreshold: n(x.LowStockThreshold),
    avgCost: n(x.AvgCost),
  }));
}

/** Ghi đè dự báo các ngày từ `fromDate` (một lệnh MERGE qua JSON — idempotent). */
export async function saveForecasts(rows) {
  if (!rows.length) return 0;
  await query(
    `MERGE dbo.DemandForecasts AS t
     USING (SELECT * FROM OPENJSON(@j) WITH (i INT, d DATE, q DECIMAL(18,3), s INT)) AS x ON t.IngredientId = x.i AND t.ForecastDate = x.d
     WHEN MATCHED THEN UPDATE SET ForecastQty = x.q, Samples = x.s, ComputedAt = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (IngredientId, ForecastDate, ForecastQty, Samples, ComputedAt) VALUES (x.i, x.d, x.q, x.s, SYSUTCDATETIME());`,
    { j: [sql.NVarChar(sql.MAX), JSON.stringify(rows.map((r) => ({ i: r.ingredientId, d: r.date, q: r.qty, s: r.samples })))] },
  );
  return rows.length;
}

/** Dự báo đã lưu từ hôm nay: Map(ingredientId → [{ date, qty, samples }]). */
export async function forecasts(fromDate) {
  const r = await query(
    `SELECT IngredientId, CONVERT(CHAR(10), ForecastDate, 23) AS D, ForecastQty, Samples, ComputedAt
     FROM dbo.DemandForecasts WHERE ForecastDate >= CAST(@d AS DATE) ORDER BY IngredientId, ForecastDate`,
    { d: [sql.VarChar(10), fromDate] },
  );
  const map = new Map();
  for (const x of r.recordset) {
    if (!map.has(x.IngredientId)) map.set(x.IngredientId, []);
    map.get(x.IngredientId).push({ date: x.D, qty: n(x.ForecastQty), samples: x.Samples, computedAt: x.ComputedAt });
  }
  return map;
}
