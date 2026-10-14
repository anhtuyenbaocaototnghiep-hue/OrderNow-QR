// Nguyên liệu & kho (FEATURE-011). Thay đổi tồn kho luôn ghi InventoryTransactions; điều chỉnh tay qua sp_AdjustInventory.
import { inTransaction, query, request, sql, txQuery } from '../db.js';

const round3 = (n) => Math.round(n * 1000) / 1000;

const mapIngredient = (r) =>
  r && {
    ingredientId: r.IngredientId,
    name: r.Name,
    unit: r.Unit,
    stockQty: r.StockQty,
    reservedQty: r.ReservedQty,
    available: round3(r.StockQty - r.ReservedQty),
    lowStockThreshold: r.LowStockThreshold,
    isLow: r.StockQty - r.ReservedQty <= r.LowStockThreshold,
    isActive: Boolean(r.IsActive),
    usedIn: r.UsedIn ?? 0,
  };

const SELECT = `SELECT i.*, (SELECT COUNT(*) FROM dbo.BomItems b JOIN dbo.MenuItems m ON m.MenuItemId = b.MenuItemId
                              WHERE b.IngredientId = i.IngredientId AND m.DeletedAt IS NULL) AS UsedIn FROM dbo.Ingredients i`;

export async function list() {
  const r = await query(`${SELECT} WHERE i.DeletedAt IS NULL ORDER BY i.Name`);
  return r.recordset.map(mapIngredient);
}

export async function getById(id) {
  const r = await query(`${SELECT} WHERE i.IngredientId = @id AND i.DeletedAt IS NULL`, { id: [sql.Int, id] });
  return mapIngredient(r.recordset[0]);
}

export async function existingIds(ids) {
  if (ids.length === 0) return new Set();
  const r = await query(
    "SELECT IngredientId FROM dbo.Ingredients WHERE IngredientId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ',')) AND DeletedAt IS NULL",
    {
      ids: [sql.NVarChar(sql.MAX), ids.join(',')],
    },
  );
  return new Set(r.recordset.map((x) => x.IngredientId));
}

export async function create({ name, unit, stockQty, lowStockThreshold, userId }) {
  const id = await inTransaction(async (tx) => {
    const r = await txQuery(tx, 'INSERT dbo.Ingredients (Name, Unit, StockQty, LowStockThreshold) OUTPUT inserted.IngredientId VALUES (@n, @u, @q, @l)', {
      n: [sql.NVarChar(100), name],
      u: [sql.NVarChar(10), unit],
      q: [sql.Decimal(18, 3), stockQty],
      l: [sql.Decimal(18, 3), lowStockThreshold],
    });
    const newId = r.recordset[0].IngredientId;
    if (stockQty > 0) {
      await txQuery(
        tx,
        `INSERT dbo.InventoryTransactions (IngredientId, Type, Delta, BalanceAfter, Reason, CreatedBy)
         VALUES (@id, 'ADJUST', @q, @q, N'Tồn kho ban đầu', @by)`,
        { id: [sql.Int, newId], q: [sql.Decimal(18, 3), stockQty], by: [sql.Int, userId] },
      );
    }
    return newId;
  });
  return getById(id);
}

export async function update(id, { name, unit, lowStockThreshold, isActive }) {
  const r = await query(
    'UPDATE dbo.Ingredients SET Name = @n, Unit = @u, LowStockThreshold = @l, IsActive = @a WHERE IngredientId = @id AND DeletedAt IS NULL',
    {
      id: [sql.Int, id],
      n: [sql.NVarChar(100), name],
      u: [sql.NVarChar(10), unit],
      l: [sql.Decimal(18, 3), lowStockThreshold],
      a: [sql.Bit, isActive],
    },
  );
  return r.rowsAffected[0] ? getById(id) : null;
}

export async function adjust(id, { newQty = null, delta = null, reason, userId }) {
  const r = await (
    await request()
  )
    .input('IngredientId', sql.Int, id)
    .input('NewQty', sql.Decimal(18, 3), newQty)
    .input('Delta', sql.Decimal(18, 3), delta)
    .input('Reason', sql.NVarChar(200), reason)
    .input('UserId', sql.Int, userId)
    .output('BalanceAfter', sql.Decimal(18, 3))
    .execute('dbo.sp_AdjustInventory');
  return r.output.BalanceAfter;
}

export async function transactions(id, limit = 100) {
  const r = await query(
    `SELECT TOP (@lim) x.TxnId, x.Type, x.Delta, x.BalanceAfter, x.Reason, x.CreatedAt, x.OrderId, o.OrderCode, u.FullName
     FROM dbo.InventoryTransactions x
     LEFT JOIN dbo.Orders o ON o.OrderId = x.OrderId
     LEFT JOIN dbo.Users u ON u.UserId = x.CreatedBy
     WHERE x.IngredientId = @id ORDER BY x.TxnId DESC`,
    { id: [sql.Int, id], lim: [sql.Int, limit] },
  );
  return r.recordset.map((x) => ({
    txnId: Number(x.TxnId),
    type: x.Type,
    delta: x.Delta,
    balanceAfter: x.BalanceAfter,
    reason: x.Reason,
    createdAt: x.CreatedAt,
    order: x.OrderId ? { orderId: x.OrderId, orderCode: x.OrderCode } : null,
    createdBy: x.FullName,
  }));
}

/** BR-016: khả dụng ≤ ngưỡng (chỉ nguyên liệu đang dùng). */
export async function lowStock() {
  const r = await query(`${SELECT} WHERE i.IsActive = 1 AND i.DeletedAt IS NULL AND i.StockQty - i.ReservedQty <= i.LowStockThreshold ORDER BY i.Name`);
  return r.recordset.map(mapIngredient);
}

/** Xóa (ADR-004): 'DELETED' (xóa hẳn) | 'ARCHIVED' (xóa mềm vì đã có lịch sử). */
export async function remove(id) {
  const r = await (await request()).input('IngredientId', sql.Int, id).output('Result', sql.VarChar(10)).execute('dbo.sp_DeleteIngredient');
  return r.output.Result;
}
