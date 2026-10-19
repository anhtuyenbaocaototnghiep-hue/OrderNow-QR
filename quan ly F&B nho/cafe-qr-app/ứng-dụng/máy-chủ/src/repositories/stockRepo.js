// Nhập kho & kiểm kê (FEATURE-023); báo cáo giá vốn / hao hụt theo giá nhập gần nhất.
import { inTransaction, query, request, sql, txQuery } from '../db.js';

// ---------- Phiếu nhập ----------
/**
 * sp_ReceiveStock qua @LinesJson. Dòng (đơn vị gốc): { ingredientId, qty, unitCost?, packUnitCode?, packQty?, packPrice?, expiryDate?, lotCode?, poLineId? }.
 * F-030: poId / supplierId / confirmOver (nhận vượt số đặt).
 */
export async function createReceipt({ supplier, note, lines, userId, poId = null, supplierId = null, confirmOver = false }) {
  const tvp = new sql.Table('dbo.StockLineInput'); // tham số cũ — để trống, dữ liệu đi qua JSON
  tvp.columns.add('IngredientId', sql.Int, { nullable: false });
  tvp.columns.add('Qty', sql.Decimal(18, 3), { nullable: false });
  tvp.columns.add('UnitCost', sql.Decimal(12, 2), { nullable: true });
  const r = await (
    await request()
  )
    .input('Supplier', sql.NVarChar(100), supplier || null)
    .input('Note', sql.NVarChar(200), note || null)
    .input('UserId', sql.Int, userId)
    .input('Lines', tvp)
    .input('LinesJson', sql.NVarChar(sql.MAX), JSON.stringify(lines))
    .input('PoId', sql.Int, poId)
    .input('SupplierId', sql.Int, supplierId)
    .input('ConfirmOver', sql.Bit, confirmOver)
    .output('ReceiptId', sql.Int)
    .execute('dbo.sp_ReceiveStock');
  return r.output.ReceiptId;
}

export async function listReceipts(fromUtc, toUtc) {
  const r = await query(
    `SELECT sr.ReceiptId, sr.Supplier, sr.ReceivedAt, sr.Note, u.FullName,
            (SELECT COUNT(*) FROM dbo.StockReceiptLines l WHERE l.ReceiptId = sr.ReceiptId) AS LineCount,
            (SELECT SUM(l.Qty * ISNULL(l.UnitCost, 0)) FROM dbo.StockReceiptLines l WHERE l.ReceiptId = sr.ReceiptId) AS TotalCost
     FROM dbo.StockReceipts sr JOIN dbo.Users u ON u.UserId = sr.ReceivedBy
     WHERE sr.ReceivedAt >= @f AND sr.ReceivedAt < @t ORDER BY sr.ReceivedAt DESC`,
    { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] },
  );
  return r.recordset.map((x) => ({
    receiptId: x.ReceiptId,
    supplier: x.Supplier,
    receivedAt: x.ReceivedAt,
    note: x.Note,
    receivedBy: x.FullName,
    lineCount: x.LineCount,
    totalCost: Number(x.TotalCost ?? 0),
  }));
}

export async function getReceipt(id) {
  const r = await query(
    `SELECT sr.ReceiptId, sr.Supplier, sr.ReceivedAt, sr.Note, u.FullName FROM dbo.StockReceipts sr JOIN dbo.Users u ON u.UserId = sr.ReceivedBy
     WHERE sr.ReceiptId = @id;
     SELECT l.IngredientId, i.Name, i.Unit, l.Qty, l.UnitCost, l.PackUnitCode, l.PackQty, l.PackPrice, CONVERT(CHAR(10), l.ExpiryDate, 23) AS Expiry, l.LotId
     FROM dbo.StockReceiptLines l JOIN dbo.Ingredients i ON i.IngredientId = l.IngredientId
     WHERE l.ReceiptId = @id ORDER BY i.Name;`,
    { id: [sql.Int, id] },
  );
  const h = r.recordsets[0][0];
  if (!h) return null;
  return {
    receiptId: h.ReceiptId,
    supplier: h.Supplier,
    receivedAt: h.ReceivedAt,
    note: h.Note,
    receivedBy: h.FullName,
    lines: r.recordsets[1].map((l) => ({
      ingredientId: l.IngredientId,
      name: l.Name,
      unit: l.Unit,
      qty: Number(l.Qty),
      unitCost: l.UnitCost === null ? null : Number(l.UnitCost),
      packUnitCode: l.PackUnitCode ?? null,
      packQty: l.PackQty === null ? null : Number(l.PackQty),
      packPrice: l.PackPrice === null ? null : Number(l.PackPrice),
      expiryDate: l.Expiry ?? null,
      lotId: l.LotId ?? null,
    })),
  };
}

// ---------- Kiểm kê ----------
const mapStocktake = (h, lines) => ({
  stocktakeId: h.StocktakeId,
  status: h.Status,
  note: h.Note,
  countedBy: h.CountedByName,
  countedAt: h.CountedAt,
  postedBy: h.PostedByName,
  postedAt: h.PostedAt,
  lineCount: h.LineCount,
  shrinkageValue: h.ShrinkValue === null || h.ShrinkValue === undefined ? null : Number(h.ShrinkValue),
  lines,
});

const HEAD = `
  SELECT s.StocktakeId, s.Status, s.Note, s.CountedAt, s.PostedAt, cu.FullName AS CountedByName, pu.FullName AS PostedByName,
         (SELECT COUNT(*) FROM dbo.StocktakeLines l WHERE l.StocktakeId = s.StocktakeId) AS LineCount,
         (SELECT SUM(CASE WHEN l.Diff < 0 THEN -l.Diff * ISNULL(l.UnitCost, 0) ELSE 0 END) FROM dbo.StocktakeLines l WHERE l.StocktakeId = s.StocktakeId) AS ShrinkValue
  FROM dbo.Stocktakes s JOIN dbo.Users cu ON cu.UserId = s.CountedBy LEFT JOIN dbo.Users pu ON pu.UserId = s.PostedBy`;

export async function listStocktakes() {
  const r = await query(`${HEAD} ORDER BY s.StocktakeId DESC`);
  return r.recordset.map((h) => mapStocktake(h, undefined));
}

export async function getStocktake(id) {
  const r = await query(
    `${HEAD} WHERE s.StocktakeId = @id;
     SELECT l.IngredientId, i.Name, i.Unit, l.SystemQty, i.StockQty, i.ReservedQty, l.CountedQty, l.Diff, l.UnitCost, l.Note
     FROM dbo.StocktakeLines l JOIN dbo.Ingredients i ON i.IngredientId = l.IngredientId WHERE l.StocktakeId = @id ORDER BY i.Name;`,
    { id: [sql.Int, id] },
  );
  const h = r.recordsets[0][0];
  if (!h) return null;
  return mapStocktake(
    h,
    r.recordsets[1].map((l) => ({
      ingredientId: l.IngredientId,
      name: l.Name,
      unit: l.Unit,
      systemQty: Number(l.SystemQty),
      currentQty: Number(l.StockQty),
      reservedQty: Number(l.ReservedQty),
      countedQty: l.CountedQty === null ? null : Number(l.CountedQty),
      diff: l.Diff === null ? null : Number(l.Diff),
      unitCost: l.UnitCost === null ? null : Number(l.UnitCost),
      note: l.Note,
    })),
  );
}

/** Tạo phiếu DRAFT cho các nguyên liệu (rỗng = mọi nguyên liệu đang dùng); chụp tồn hiện tại làm SystemQty. */
export async function createStocktake({ ingredientIds, note, userId }) {
  return inTransaction(async (tx) => {
    const r = await txQuery(tx, 'INSERT dbo.Stocktakes (Note, CountedBy) OUTPUT inserted.StocktakeId VALUES (@n, @u)', {
      n: [sql.NVarChar(200), note || null],
      u: [sql.Int, userId],
    });
    const id = r.recordset[0].StocktakeId;
    await txQuery(
      tx,
      `INSERT dbo.StocktakeLines (StocktakeId, IngredientId, SystemQty)
       SELECT @id, i.IngredientId, i.StockQty FROM dbo.Ingredients i
       WHERE i.DeletedAt IS NULL AND (@ids IS NULL OR i.IngredientId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ',')))`,
      { id: [sql.Int, id], ids: [sql.NVarChar(sql.MAX), ingredientIds?.length ? ingredientIds.join(',') : null] },
    );
    return id;
  });
}

/** Nhập số đếm thực tế (chỉ phiếu DRAFT). */
export async function updateCounts(id, lines) {
  return inTransaction(async (tx) => {
    const s = await txQuery(tx, 'SELECT Status FROM dbo.Stocktakes WITH (UPDLOCK, HOLDLOCK) WHERE StocktakeId = @id', { id: [sql.Int, id] });
    const status = s.recordset[0]?.Status;
    if (status !== 'DRAFT') return status ?? null;
    for (const l of lines) {
      await txQuery(tx, 'UPDATE dbo.StocktakeLines SET CountedQty = @q, Note = @n WHERE StocktakeId = @id AND IngredientId = @i', {
        id: [sql.Int, id],
        i: [sql.Int, l.ingredientId],
        q: [sql.Decimal(18, 3), l.countedQty],
        n: [sql.NVarChar(200), l.note || null],
      });
    }
    return 'DRAFT';
  });
}

export async function post(id, userId) {
  await (await request()).input('StocktakeId', sql.Int, id).input('UserId', sql.Int, userId).execute('dbo.sp_PostStocktake');
}

export async function removeDraft(id) {
  const r = await query(
    `DELETE l FROM dbo.StocktakeLines l JOIN dbo.Stocktakes s ON s.StocktakeId = l.StocktakeId WHERE s.StocktakeId = @id AND s.Status = 'DRAFT';
     DELETE dbo.Stocktakes WHERE StocktakeId = @id AND Status = 'DRAFT';`,
    { id: [sql.Int, id] },
  );
  return r.rowsAffected[1] > 0;
}

// ---------- Báo cáo giá vốn / hao hụt ----------
/**
 * Giá vốn theo dòng đã bán (đơn đã thu, không hủy/hoàn), chỉ dòng khách chọn:
 * món = SL × Σ BOM × giá nhập gần nhất; combo = Σ dòng con đã lưu trên đơn × giá vốn món thành phần;
 * cộng định lượng tùy chọn đã chọn (F-013). Thiếu giá nhập / thiếu định lượng → giá vốn món đó = null.
 */
export async function cogs(fromUtc, toUtc) {
  const r = await query(
    `WITH ItemCost AS (
       SELECT b.MenuItemId, SUM(b.Amount * i.LastUnitCost) AS Cost, SUM(CASE WHEN i.LastUnitCost IS NULL THEN 1 ELSE 0 END) AS Missing
       FROM dbo.BomItems b JOIN dbo.Ingredients i ON i.IngredientId = b.IngredientId GROUP BY b.MenuItemId),
     OptCost AS (
       SELECT im.OrderItemId, SUM(ob.Amount * i.LastUnitCost) AS Cost, SUM(CASE WHEN i.LastUnitCost IS NULL THEN 1 ELSE 0 END) AS Missing
       FROM dbo.OrderItemModifiers im JOIN dbo.ModifierOptionBom ob ON ob.OptionId = im.OptionId
       JOIN dbo.Ingredients i ON i.IngredientId = ob.IngredientId GROUP BY im.OrderItemId),
     ChildCost AS (
       SELECT c.ParentOrderItemId AS OrderItemId, SUM(c.Quantity * ic.Cost) AS Cost,
              SUM(CASE WHEN ic.MenuItemId IS NULL OR ic.Missing > 0 THEN 1 ELSE 0 END) AS Missing
       FROM dbo.OrderItems c LEFT JOIN ItemCost ic ON ic.MenuItemId = c.MenuItemId
       WHERE c.ParentOrderItemId IS NOT NULL GROUP BY c.ParentOrderItemId),
     Lines AS (
       SELECT oi.MenuItemId, oi.Quantity, oi.Quantity * oi.UnitPrice AS Revenue,
              CASE WHEN m.ItemType = 'COMBO' THEN cc.Cost ELSE oi.Quantity * (ic.Cost + ISNULL(oc.Cost, 0)) END AS Cogs,
              CASE WHEN m.ItemType = 'COMBO' THEN ISNULL(cc.Missing, 1)
                   WHEN ic.MenuItemId IS NULL THEN 1 ELSE ic.Missing + ISNULL(oc.Missing, 0) END AS Missing
       FROM dbo.OrderItems oi
       JOIN dbo.Orders o ON o.OrderId = oi.OrderId
       JOIN dbo.MenuItems m ON m.MenuItemId = oi.MenuItemId
       LEFT JOIN ItemCost ic ON ic.MenuItemId = oi.MenuItemId
       LEFT JOIN OptCost oc ON oc.OrderItemId = oi.OrderItemId
       LEFT JOIN ChildCost cc ON cc.OrderItemId = oi.OrderItemId
       WHERE o.PaymentStatus = 'PAID' AND o.Status NOT IN ('CANCELLED', 'VOIDED') AND o.PaidAt >= @f AND o.PaidAt < @t
         AND oi.ParentOrderItemId IS NULL)
     SELECT m.MenuItemId, m.Name, m.ItemType, SUM(l.Quantity) AS Qty, SUM(l.Revenue) AS Revenue, SUM(l.Cogs) AS Cogs, SUM(l.Missing) AS Missing,
            (SELECT COUNT(*) FROM dbo.BomItems b WHERE b.MenuItemId = m.MenuItemId) AS BomCount
     FROM Lines l JOIN dbo.MenuItems m ON m.MenuItemId = l.MenuItemId
     GROUP BY m.MenuItemId, m.Name, m.ItemType
     ORDER BY Revenue DESC`,
    { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] },
  );
  return r.recordset.map((x) => {
    const known = x.Missing === 0 && x.Cogs !== null;
    const cogs = known ? Math.round(Number(x.Cogs)) : null;
    return {
      menuItemId: x.MenuItemId,
      name: x.Name,
      itemType: x.ItemType,
      qty: x.Qty,
      revenue: Number(x.Revenue),
      unitCost: known ? Math.round(cogs / x.Qty) : null,
      cogs,
      grossProfit: known ? Number(x.Revenue) - cogs : null,
      hasBom: x.ItemType === 'COMBO' || x.BomCount > 0,
    };
  });
}

export async function shrinkage(fromUtc, toUtc) {
  const r = await query(
    `SELECT i.IngredientId, i.Name, i.Unit, SUM(l.Diff) AS Diff, SUM(l.Diff * ISNULL(l.UnitCost, 0)) AS Value
     FROM dbo.StocktakeLines l JOIN dbo.Stocktakes s ON s.StocktakeId = l.StocktakeId JOIN dbo.Ingredients i ON i.IngredientId = l.IngredientId
     WHERE s.Status = 'POSTED' AND s.PostedAt >= @f AND s.PostedAt < @t AND l.Diff <> 0
     GROUP BY i.IngredientId, i.Name, i.Unit ORDER BY Value`,
    { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] },
  );
  return r.recordset.map((x) => ({ ingredientId: x.IngredientId, name: x.Name, unit: x.Unit, diff: Number(x.Diff), value: Math.round(Number(x.Value)) }));
}
