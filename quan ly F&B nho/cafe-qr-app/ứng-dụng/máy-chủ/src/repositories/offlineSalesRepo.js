// F-074 (ADR-032): chi tiết đơn bán lúc mất mạng / nhập từ phiếu bán tay đã gửi bù (bảng OfflineSales — không xóa được).
import { query, sql } from '../db.js';

const parseIssues = (json) => {
  try {
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
};

const SELECT = `
  SELECT os.*, o.OrderCode, o.TotalAmount, p.Method, p.AmountDue, sb.FullName AS SoldByName, yb.FullName AS SyncedByName
  FROM dbo.OfflineSales os
  JOIN dbo.Orders o ON o.OrderId = os.OrderId
  LEFT JOIN dbo.Payments p ON p.OrderId = os.OrderId
  JOIN dbo.Users sb ON sb.UserId = os.SoldBy
  JOIN dbo.Users yb ON yb.UserId = os.SyncedBy`;

const map = (r) => ({
  orderId: r.OrderId,
  orderCode: r.OrderCode,
  localCode: r.LocalCode ?? null,
  source: r.Source,
  soldAt: r.SoldAt,
  soldBy: { userId: r.SoldBy, fullName: r.SoldByName },
  syncedAt: r.SyncedAt,
  syncedBy: { userId: r.SyncedBy, fullName: r.SyncedByName },
  device: r.Device ?? null,
  method: r.Method ?? null,
  amountDue: r.AmountDue ?? r.TotalAmount,
  clientTotal: r.ClientTotal,
  shiftIdAtSale: r.ShiftIdAtSale ?? null,
  shiftIdRecorded: r.ShiftIdRecorded,
  issues: parseIssues(r.IssuesJson),
});

export async function insert(row) {
  await query(
    `INSERT dbo.OfflineSales (OrderId, ClientRef, Source, LocalCode, SoldAt, SoldBy, SyncedBy, Device, ClientTotal, ShiftIdAtSale, ShiftIdRecorded, IssuesJson)
     VALUES (@o, @c, @s, @lc, @at, @sb, @yb, @d, @t, @sa, @sr, @i)`,
    {
      o: [sql.Int, row.orderId],
      c: [sql.UniqueIdentifier, row.clientRef],
      s: [sql.VarChar(10), row.source],
      lc: [sql.NVarChar(20), row.localCode ?? null],
      at: [sql.DateTime2(0), row.soldAt],
      sb: [sql.Int, row.soldBy],
      yb: [sql.Int, row.syncedBy],
      d: [sql.NVarChar(60), row.device ?? null],
      t: [sql.Decimal(12, 0), row.clientTotal],
      sa: [sql.Int, row.shiftIdAtSale ?? null],
      sr: [sql.Int, row.shiftIdRecorded],
      i: [sql.NVarChar(2000), row.issues?.length ? JSON.stringify(row.issues).slice(0, 2000) : null],
    },
  );
}

export async function byOrder(orderId) {
  const r = await query(`${SELECT} WHERE os.OrderId = @o`, { o: [sql.Int, orderId] });
  return r.recordset[0] ? map(r.recordset[0]) : null;
}

/** Đơn gửi bù được ghi vào ca này (màn Ca & hoàn tiền), mới nhất trước. */
export async function forShift(shiftId) {
  const r = await query(`${SELECT} WHERE os.ShiftIdRecorded = @s ORDER BY os.SoldAt DESC`, { s: [sql.Int, shiftId] });
  return r.recordset.map(map);
}

/** Tên nguyên liệu theo danh sách Id (báo kho thiếu). */
export async function ingredientNames(ids) {
  if (!ids.length) return [];
  const r = await query(`SELECT IngredientId, Name, Unit FROM dbo.Ingredients WHERE IngredientId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))`, {
    ids: [sql.VarChar(2000), ids.join(',')],
  });
  return r.recordset.map((x) => ({ ingredientId: x.IngredientId, name: x.Name, unit: x.Unit }));
}
