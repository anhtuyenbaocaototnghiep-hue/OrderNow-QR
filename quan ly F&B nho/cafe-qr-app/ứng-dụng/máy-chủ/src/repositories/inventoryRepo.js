// Kho nâng cao giai đoạn 5 (ADR-006): đơn vị (F-031), công thức sơ chế + mẻ (F-027), phiếu hủy (F-032), lô (F-028), báo cáo COGS/thất thoát.
// Mọi thay đổi tồn đi qua SP (sp_PostPrepBatch, sp_LogWaste, sp_SetTrackLots, sp_ReceiveStock…) — một transaction, có khóa.
import { inTransaction, query, request, sql, txQuery } from '../db.js';

const n = (v) => (v === null || v === undefined ? null : Number(v));

// ---------- Đơn vị (F-031) ----------
export async function units() {
  const r = await query(`SELECT u.UnitCode, u.Name, u.BaseUnitCode, u.Factor,
      (SELECT COUNT(*) FROM dbo.Ingredients i WHERE i.BaseUnitCode = u.UnitCode AND i.DeletedAt IS NULL) AS UsedBy
    FROM dbo.Units u ORDER BY CASE WHEN u.BaseUnitCode IS NULL THEN 0 ELSE 1 END, u.UnitCode`);
  return r.recordset.map((u) => ({ unitCode: u.UnitCode, name: u.Name, baseUnitCode: u.BaseUnitCode, factor: n(u.Factor), usedBy: u.UsedBy }));
}

export async function saveUnit({ unitCode, name, baseUnitCode, factor }) {
  await query(
    `MERGE dbo.Units AS t USING (SELECT @c AS UnitCode) AS s ON t.UnitCode = s.UnitCode
     WHEN MATCHED THEN UPDATE SET Name = @n, BaseUnitCode = @b, Factor = @f
     WHEN NOT MATCHED THEN INSERT (UnitCode, Name, BaseUnitCode, Factor) VALUES (@c, @n, @b, @f);`,
    {
      c: [sql.NVarChar(10), unitCode],
      n: [sql.NVarChar(30), name],
      b: [sql.NVarChar(10), baseUnitCode || null],
      f: [sql.Decimal(18, 6), baseUnitCode ? factor : null],
    },
  );
}

/** Xóa đơn vị chưa dùng ở đâu (nguyên liệu, đơn vị khác, phiếu nhập, nhà cung cấp). */
export async function deleteUnit(code) {
  const r = await query(
    `IF EXISTS (SELECT 1 FROM dbo.Ingredients WHERE BaseUnitCode = @c) OR EXISTS (SELECT 1 FROM dbo.Units WHERE BaseUnitCode = @c)
        OR EXISTS (SELECT 1 FROM dbo.StockReceiptLines WHERE PackUnitCode = @c) OR EXISTS (SELECT 1 FROM dbo.SupplierIngredients WHERE PackUnitCode = @c)
        OR EXISTS (SELECT 1 FROM dbo.PurchaseOrderLines WHERE PackUnitCode = @c)
       SELECT 'IN_USE' AS R
     ELSE BEGIN DELETE dbo.Units WHERE UnitCode = @c; SELECT CASE WHEN @@ROWCOUNT > 0 THEN 'DELETED' ELSE 'NOT_FOUND' END AS R; END`,
    { c: [sql.NVarChar(10), code] },
  );
  return r.recordset[0].R;
}

// ---------- Thuộc tính kho nâng cao của nguyên liệu ----------
export async function setIngredientAdvanced(id, { kind, shelfLifeHours, wastePercent }) {
  const r = await query(`UPDATE dbo.Ingredients SET Kind = @k, ShelfLifeHours = @s, WastePercent = @w WHERE IngredientId = @id AND DeletedAt IS NULL`, {
    id: [sql.Int, id],
    k: [sql.VarChar(5), kind],
    s: [sql.Int, shelfLifeHours ?? null],
    w: [sql.Decimal(5, 2), wastePercent ?? 0],
  });
  return r.rowsAffected[0] > 0;
}

export async function setTrackLots(id, on) {
  await (await request()).input('IngredientId', sql.Int, id).input('On', sql.Bit, on).execute('dbo.sp_SetTrackLots');
}

// ---------- Công thức sơ chế (F-027) ----------
export async function recipeEdges() {
  const r = await query('SELECT SemiIngredientId, InputIngredientId FROM dbo.SemiRecipeLines');
  const map = new Map();
  for (const x of r.recordset) {
    if (!map.has(x.SemiIngredientId)) map.set(x.SemiIngredientId, []);
    map.get(x.SemiIngredientId).push(x.InputIngredientId);
  }
  return map;
}

export async function getRecipe(semiId) {
  const r = await query(
    `SELECT r.SemiIngredientId, r.OutputQty, r.Instructions FROM dbo.SemiRecipes r WHERE r.SemiIngredientId = @id;
     SELECT l.InputIngredientId, i.Name, i.Unit, l.Qty, i.StockQty, i.ReservedQty, i.AvgCost, i.Kind,
            ISNULL((SELECT ex.ExpiredQty FROM dbo.tvf_ExpiredLotQty() ex WHERE ex.IngredientId = i.IngredientId), 0) AS ExpiredQty
     FROM dbo.SemiRecipeLines l JOIN dbo.Ingredients i ON i.IngredientId = l.InputIngredientId
     WHERE l.SemiIngredientId = @id ORDER BY i.Name;`,
    { id: [sql.Int, semiId] },
  );
  const head = r.recordsets[0][0];
  if (!head) return null;
  return {
    semiIngredientId: semiId,
    outputQty: n(head.OutputQty),
    instructions: head.Instructions,
    lines: r.recordsets[1].map((l) => ({
      ingredientId: l.InputIngredientId,
      name: l.Name,
      unit: l.Unit,
      kind: l.Kind,
      qty: n(l.Qty),
      available: Math.round((n(l.StockQty) - n(l.ReservedQty) - n(l.ExpiredQty)) * 1000) / 1000,
      avgCost: n(l.AvgCost),
    })),
  };
}

export async function saveRecipe(semiId, { outputQty, instructions, lines }) {
  await inTransaction(async (tx) => {
    const id = { id: [sql.Int, semiId] };
    await txQuery(tx, "UPDATE dbo.Ingredients SET Kind = 'SEMI' WHERE IngredientId = @id", id);
    await txQuery(
      tx,
      `MERGE dbo.SemiRecipes AS t USING (SELECT @id AS SemiIngredientId) AS s ON t.SemiIngredientId = s.SemiIngredientId
       WHEN MATCHED THEN UPDATE SET OutputQty = @o, Instructions = @ins
       WHEN NOT MATCHED THEN INSERT (SemiIngredientId, OutputQty, Instructions) VALUES (@id, @o, @ins);`,
      { ...id, o: [sql.Decimal(18, 3), outputQty], ins: [sql.NVarChar(500), instructions || null] },
    );
    await txQuery(tx, 'DELETE dbo.SemiRecipeLines WHERE SemiIngredientId = @id', id);
    for (const l of lines) {
      await txQuery(tx, 'INSERT dbo.SemiRecipeLines (SemiIngredientId, InputIngredientId, Qty) VALUES (@id, @i, @q)', {
        ...id,
        i: [sql.Int, l.ingredientId],
        q: [sql.Decimal(18, 3), l.qty],
      });
    }
  });
}

/** Danh sách bán thành phẩm có công thức (màn Sơ chế ở quầy). */
export async function semiList() {
  const r = await query(`
    SELECT i.IngredientId, i.Name, i.Unit, i.StockQty, i.ReservedQty, i.LowStockThreshold, i.ShelfLifeHours, i.AvgCost, r.OutputQty, r.Instructions,
           ISNULL((SELECT ex.ExpiredQty FROM dbo.tvf_ExpiredLotQty() ex WHERE ex.IngredientId = i.IngredientId), 0) AS ExpiredQty
    FROM dbo.Ingredients i JOIN dbo.SemiRecipes r ON r.SemiIngredientId = i.IngredientId
    WHERE i.DeletedAt IS NULL AND i.Kind = 'SEMI' ORDER BY i.Name`);
  return r.recordset.map((x) => {
    const available = Math.round((n(x.StockQty) - n(x.ReservedQty) - n(x.ExpiredQty)) * 1000) / 1000;
    return {
      ingredientId: x.IngredientId,
      name: x.Name,
      unit: x.Unit,
      available,
      lowStockThreshold: n(x.LowStockThreshold),
      isLow: available <= n(x.LowStockThreshold),
      shelfLifeHours: x.ShelfLifeHours,
      avgCost: n(x.AvgCost),
      outputQty: n(x.OutputQty),
      instructions: x.Instructions,
    };
  });
}

export async function postBatch({ semiIngredientId, multiplier, userId, note }) {
  const r = await (
    await request()
  )
    .input('SemiIngredientId', sql.Int, semiIngredientId)
    .input('Multiplier', sql.Decimal(9, 3), multiplier)
    .input('UserId', sql.Int, userId)
    .input('Note', sql.NVarChar(200), note || null)
    .output('BatchId', sql.Int)
    .execute('dbo.sp_PostPrepBatch');
  return r.output.BatchId;
}

export async function listBatches(fromUtc, toUtc) {
  const r = await query(
    `SELECT b.BatchId, b.SemiIngredientId, i.Name, i.Unit, b.Multiplier, b.OutputQty, b.TotalCost, b.UnitCost, b.PreparedAt, b.ExpiresAt, b.Note, u.FullName
     FROM dbo.PrepBatches b JOIN dbo.Ingredients i ON i.IngredientId = b.SemiIngredientId JOIN dbo.Users u ON u.UserId = b.PreparedBy
     WHERE b.PreparedAt >= @f AND b.PreparedAt < @t ORDER BY b.PreparedAt DESC`,
    { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] },
  );
  return r.recordset.map((b) => ({
    batchId: b.BatchId,
    semiIngredientId: b.SemiIngredientId,
    name: b.Name,
    unit: b.Unit,
    multiplier: n(b.Multiplier),
    outputQty: n(b.OutputQty),
    totalCost: n(b.TotalCost),
    unitCost: n(b.UnitCost),
    preparedAt: b.PreparedAt,
    expiresAt: b.ExpiresAt,
    note: b.Note,
    preparedBy: b.FullName,
  }));
}

/** Nhật ký kho của một mẻ (PREP_OUT + PREP_IN). */
export async function batchTransactions(batchId) {
  const r = await query(
    `SELECT t.IngredientId, i.Name, i.Unit, t.Type, t.Delta, t.CostAmount, t.LotId FROM dbo.InventoryTransactions t
     JOIN dbo.Ingredients i ON i.IngredientId = t.IngredientId WHERE t.PrepBatchId = @b ORDER BY t.Type DESC, i.Name`,
    { b: [sql.Int, batchId] },
  );
  return r.recordset.map((t) => ({
    ingredientId: t.IngredientId,
    name: t.Name,
    unit: t.Unit,
    type: t.Type,
    delta: n(t.Delta),
    cost: n(t.CostAmount),
    lotId: t.LotId,
  }));
}

// ---------- Phiếu hủy (F-032) + hủy lô (F-028) ----------
export async function logWaste({ ingredientId = null, qty = null, reason, note, lotId = null, userId }) {
  const r = await (
    await request()
  )
    .input('IngredientId', sql.Int, ingredientId)
    .input('Qty', sql.Decimal(18, 3), qty)
    .input('Reason', sql.VarChar(20), reason)
    .input('Note', sql.NVarChar(200), note || null)
    .input('LotId', sql.Int, lotId)
    .input('UserId', sql.Int, userId)
    .output('WasteId', sql.Int)
    .execute('dbo.sp_LogWaste');
  return r.output.WasteId;
}

export async function listWaste(fromUtc, toUtc) {
  const r = await query(
    `SELECT w.WasteId, w.IngredientId, i.Name, i.Unit, w.Qty, w.Reason, w.Note, w.CostAmount, w.LotId, w.CreatedAt, u.FullName
     FROM dbo.WasteLogs w JOIN dbo.Ingredients i ON i.IngredientId = w.IngredientId JOIN dbo.Users u ON u.UserId = w.CreatedBy
     WHERE w.CreatedAt >= @f AND w.CreatedAt < @t ORDER BY w.CreatedAt DESC`,
    { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] },
  );
  return r.recordset.map((w) => ({
    wasteId: w.WasteId,
    ingredientId: w.IngredientId,
    name: w.Name,
    unit: w.Unit,
    qty: n(w.Qty),
    reason: w.Reason,
    note: w.Note,
    cost: n(w.CostAmount),
    lotId: w.LotId,
    createdAt: w.CreatedAt,
    createdBy: w.FullName,
  }));
}

// ---------- Lô (F-028) ----------
const mapLot = (l) => ({
  lotId: l.LotId,
  ingredientId: l.IngredientId,
  name: l.Name,
  unit: l.Unit,
  lotCode: l.LotCode,
  qty: n(l.Qty),
  expiryDate: l.ExpiryDateText,
  unitCost: n(l.UnitCost),
  source: l.Source,
  receivedAt: l.ReceivedAt,
  isClosed: Boolean(l.IsClosed),
  daysLeft: l.DaysLeft,
});

const LOT_SELECT = `SELECT l.*, i.Name, i.Unit, CONVERT(CHAR(10), l.ExpiryDate, 23) AS ExpiryDateText,
    DATEDIFF(DAY, CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE), l.ExpiryDate) AS DaysLeft
  FROM dbo.IngredientLots l JOIN dbo.Ingredients i ON i.IngredientId = l.IngredientId`;

export async function lotsOf(ingredientId, includeClosed = false) {
  const r = await query(
    `${LOT_SELECT} WHERE l.IngredientId = @id AND (@all = 1 OR l.IsClosed = 0)
     ORDER BY l.IsClosed, CASE WHEN l.ExpiryDate IS NULL THEN 1 ELSE 0 END, l.ExpiryDate, l.ReceivedAt, l.LotId`,
    { id: [sql.Int, ingredientId], all: [sql.Bit, includeClosed] },
  );
  return r.recordset.map(mapLot);
}

export async function getLot(lotId) {
  const r = await query(`${LOT_SELECT} WHERE l.LotId = @id`, { id: [sql.Int, lotId] });
  return r.recordset[0] ? mapLot(r.recordset[0]) : null;
}

/** Lô mở còn hàng đã / sắp hết hạn trong `days` ngày (nguyên liệu đang theo lô). */
export async function expiringLots(days = 2) {
  const r = await query(
    `${LOT_SELECT} WHERE l.IsClosed = 0 AND l.Qty > 0 AND i.TrackLots = 1 AND i.DeletedAt IS NULL AND l.ExpiryDate IS NOT NULL
       AND l.ExpiryDate <= DATEADD(DAY, @d, CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE))
     ORDER BY l.ExpiryDate, i.Name`,
    { d: [sql.Int, days] },
  );
  return r.recordset.map(mapLot);
}

// ---------- Báo cáo ----------
/**
 * COGS thực tế (F-031): theo món — số lượng, doanh thu dòng, giá vốn chốt lúc hoàn tất (OrderItems.CogsAmount); dòng chưa biết giá
 * được đếm riêng. Theo nguyên liệu — Σ giá vốn các dòng DEDUCT.
 */
export async function cogsReport(fromUtc, toUtc) {
  const p = { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] };
  const r = await query(
    `SELECT oi.MenuItemId, m.Name, SUM(oi.Quantity) AS Qty, SUM(oi.Quantity * oi.UnitPrice) AS Revenue,
            SUM(oi.CogsAmount) AS Cogs, SUM(CASE WHEN oi.CogsAmount IS NULL THEN oi.Quantity ELSE 0 END) AS UnknownQty,
            SUM(CASE WHEN oi.CogsAmount IS NOT NULL THEN oi.Quantity * oi.UnitPrice ELSE 0 END) AS RevenueKnown
     FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId JOIN dbo.MenuItems m ON m.MenuItemId = oi.MenuItemId
     WHERE o.Status = 'COMPLETED' AND o.CompletedAt >= @f AND o.CompletedAt < @t AND oi.ParentOrderItemId IS NULL
     GROUP BY oi.MenuItemId, m.Name ORDER BY SUM(oi.Quantity * oi.UnitPrice) DESC;
     SELECT t.IngredientId, i.Name, i.Unit, SUM(-t.Delta) AS Qty, SUM(t.CostAmount) AS Cost
     FROM dbo.InventoryTransactions t JOIN dbo.Ingredients i ON i.IngredientId = t.IngredientId
     WHERE t.Type = 'DEDUCT' AND t.CreatedAt >= @f AND t.CreatedAt < @t
     GROUP BY t.IngredientId, i.Name, i.Unit ORDER BY SUM(t.CostAmount) DESC;`,
    p,
  );
  const [items, ings] = r.recordsets;
  return {
    items: items.map((x) => {
      const cogs = n(x.Cogs) ?? 0;
      const known = n(x.RevenueKnown);
      return {
        menuItemId: x.MenuItemId,
        name: x.Name,
        qty: x.Qty,
        revenue: n(x.Revenue),
        cogs,
        unknownQty: x.UnknownQty,
        marginPct: known > 0 ? Math.round(((known - cogs) / known) * 1000) / 10 : null,
      };
    }),
    ingredients: ings.map((x) => ({ ingredientId: x.IngredientId, name: x.Name, unit: x.Unit, qty: n(x.Qty), cost: n(x.Cost) })),
  };
}

/** Thất thoát theo nguyên liệu (F-032): tiêu thụ lý thuyết, hủy đã ghi, hụt kiểm kê trong kỳ. */
export async function lossReport(fromUtc, toUtc) {
  const r = await query(
    `SELECT i.IngredientId, i.Name, i.Unit, i.WastePercent, i.AvgCost,
            ISNULL(SUM(CASE WHEN t.Type IN ('DEDUCT', 'PREP_OUT') THEN -t.Delta END), 0) AS Consumption,
            ISNULL(SUM(CASE WHEN t.StocktakeId IS NOT NULL THEN -t.Delta END), 0) AS StocktakeShortage,
            ISNULL(SUM(CASE WHEN t.WasteId IS NOT NULL THEN -t.Delta END), 0) AS Logged
     FROM dbo.Ingredients i
     LEFT JOIN dbo.InventoryTransactions t ON t.IngredientId = i.IngredientId AND t.CreatedAt >= @f AND t.CreatedAt < @t
     WHERE i.DeletedAt IS NULL
     GROUP BY i.IngredientId, i.Name, i.Unit, i.WastePercent, i.AvgCost
     ORDER BY i.Name`,
    { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] },
  );
  return r.recordset.map((x) => ({
    ingredientId: x.IngredientId,
    name: x.Name,
    unit: x.Unit,
    wastePercent: n(x.WastePercent),
    avgCost: n(x.AvgCost),
    consumption: n(x.Consumption),
    stocktakeShortage: n(x.StocktakeShortage),
    loggedWaste: n(x.Logged),
  }));
}
