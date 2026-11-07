// F-075 (ADR-033): hạn dùng nguyên liệu — hộp đang mở, lô sắp hết hạn kèm giá vốn, món dùng nguyên liệu, tiền hủy vì hết hạn.
import { query, request, sql } from '../db.js';

const n = (v) => (v === null || v === undefined ? 0 : Number(v));
const ids = (list) => [sql.VarChar(4000), list.map(Number).filter(Number.isInteger).join(',')];

/** Hộp / gói đang mở còn hàng (nguyên liệu có dung tích hộp + hạn sau khi mở), hết hạn sớm trước. */
export async function openPacks() {
  const r = await query(
    `SELECT i.IngredientId, i.Name, i.Unit, i.AvgCost, i.PackSize, i.OpenShelfHours, i.OpenedAt,
            CASE WHEN i.OpenLeft < i.StockQty THEN i.OpenLeft ELSE i.StockQty END AS OpenLeft,
            DATEADD(HOUR, i.OpenShelfHours, i.OpenedAt) AS ExpiresAt
     FROM dbo.Ingredients i
     WHERE i.DeletedAt IS NULL AND i.OpenLeft > 0 AND i.StockQty > 0 AND i.OpenShelfHours IS NOT NULL AND i.OpenedAt IS NOT NULL
     ORDER BY DATEADD(HOUR, i.OpenShelfHours, i.OpenedAt), i.Name`,
  );
  return r.recordset.map((x) => ({
    ingredientId: x.IngredientId,
    name: x.Name,
    unit: x.Unit,
    avgCost: n(x.AvgCost),
    packSize: n(x.PackSize),
    openShelfHours: x.OpenShelfHours,
    openedAt: x.OpenedAt,
    openLeft: n(x.OpenLeft),
    expiresAt: x.ExpiresAt,
  }));
}

/** Lô mở còn hàng đã / sắp hết hạn trong `days` ngày (giờ quán), kèm giá để quy ra tiền. */
export async function lotsAtRisk(days) {
  const r = await query(
    `SELECT l.LotId, l.IngredientId, i.Name, i.Unit, l.LotCode, l.Qty, l.UnitCost, i.AvgCost, CONVERT(CHAR(10), l.ExpiryDate, 23) AS ExpiryDateText,
            DATEDIFF(DAY, CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE), l.ExpiryDate) AS DaysLeft
     FROM dbo.IngredientLots l JOIN dbo.Ingredients i ON i.IngredientId = l.IngredientId
     WHERE l.IsClosed = 0 AND l.Qty > 0 AND i.TrackLots = 1 AND i.DeletedAt IS NULL AND l.ExpiryDate IS NOT NULL
       AND l.ExpiryDate <= DATEADD(DAY, @d, CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE))
     ORDER BY l.ExpiryDate, i.Name`,
    { d: [sql.Int, days] },
  );
  return r.recordset.map((x) => ({
    lotId: x.LotId,
    ingredientId: x.IngredientId,
    name: x.Name,
    unit: x.Unit,
    lotCode: x.LotCode,
    qty: n(x.Qty),
    unitCost: n(x.UnitCost) > 0 ? n(x.UnitCost) : n(x.AvgCost),
    expiryDate: x.ExpiryDateText,
    daysLeft: x.DaysLeft,
  }));
}

/** Món đơn đang bán (còn bán, chưa xóa) dùng các nguyên liệu này — trực tiếp trong công thức, hoặc qua bán thành phẩm sơ chế từ nó. */
export async function menuItemsUsing(ingredientIds) {
  if (!ingredientIds.length) return [];
  const r = await query(
    `SELECT DISTINCT m.MenuItemId, m.Name, x.IngredientId
     FROM (SELECT b.MenuItemId, b.IngredientId FROM dbo.BomItems b
           UNION
           SELECT b.MenuItemId, rl.InputIngredientId FROM dbo.BomItems b JOIN dbo.SemiRecipeLines rl ON rl.SemiIngredientId = b.IngredientId) x
     JOIN dbo.MenuItems m ON m.MenuItemId = x.MenuItemId
     WHERE m.DeletedAt IS NULL AND m.IsActive = 1 AND m.IsAvailable = 1 AND m.ItemType = 'SINGLE'
       AND x.IngredientId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))`,
    { ids: ids(ingredientIds) },
  );
  return r.recordset.map((x) => ({ menuItemId: x.MenuItemId, name: x.Name, ingredientId: x.IngredientId }));
}

/** Tiền hủy vì hết hạn trong [from, to): theo nguyên liệu và theo nhà cung cấp (lô từ phiếu nhập; không theo lô → không rõ). */
export async function expiredWaste(fromUtc, toUtc) {
  const p = { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] };
  const r = await query(
    `SELECT i.IngredientId, i.Name, i.Unit, SUM(-t.Delta) AS Qty, SUM(ISNULL(t.CostAmount, 0)) AS Cost, COUNT(DISTINCT w.WasteId) AS Times
     FROM dbo.WasteLogs w JOIN dbo.InventoryTransactions t ON t.WasteId = w.WasteId JOIN dbo.Ingredients i ON i.IngredientId = w.IngredientId
     WHERE w.Reason = 'EXPIRED' AND w.CreatedAt >= @f AND w.CreatedAt < @t
     GROUP BY i.IngredientId, i.Name, i.Unit
     ORDER BY SUM(ISNULL(t.CostAmount, 0)) DESC, i.Name;
     SELECT s.SupplierId, COALESCE(s.Name, NULLIF(LTRIM(RTRIM(r.Supplier)), '')) AS Supplier, SUM(ISNULL(t.CostAmount, 0)) AS Cost
     FROM dbo.WasteLogs w JOIN dbo.InventoryTransactions t ON t.WasteId = w.WasteId
     LEFT JOIN dbo.IngredientLots l ON l.LotId = t.LotId AND l.Source = 'RECEIPT'
     LEFT JOIN dbo.StockReceipts r ON r.ReceiptId = l.SourceId
     LEFT JOIN dbo.Suppliers s ON s.SupplierId = r.SupplierId
     WHERE w.Reason = 'EXPIRED' AND w.CreatedAt >= @f AND w.CreatedAt < @t
     GROUP BY s.SupplierId, COALESCE(s.Name, NULLIF(LTRIM(RTRIM(r.Supplier)), ''))
     ORDER BY SUM(ISNULL(t.CostAmount, 0)) DESC;`,
    p,
  );
  const [ings, sups] = r.recordsets;
  return {
    byIngredient: ings.map((x) => ({ ingredientId: x.IngredientId, name: x.Name, unit: x.Unit, qty: n(x.Qty), cost: Math.round(n(x.Cost)), times: x.Times })),
    bySupplier: sups.map((x) => ({ supplierId: x.SupplierId ?? null, name: x.Supplier ?? null, cost: Math.round(n(x.Cost)) })),
  };
}

/** Bỏ phần còn của hộp đang mở → phiếu hủy EXPIRED. → { wasteId, qty } */
export async function discardOpenPack(ingredientId, userId, note) {
  const r = await (
    await request()
  )
    .input('IngredientId', sql.Int, ingredientId)
    .input('UserId', sql.Int, userId)
    .input('Note', sql.NVarChar(200), note ?? null)
    .output('WasteId', sql.Int)
    .output('Qty', sql.Decimal(18, 3))
    .execute('dbo.sp_DiscardOpenPack');
  return { wasteId: r.output.WasteId ?? null, qty: n(r.output.Qty) };
}
