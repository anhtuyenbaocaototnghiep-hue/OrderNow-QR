// Hoàn tiền (FEATURE-019): ghi qua sp_RefundPayment; danh sách theo lượt thu / theo khoảng ngày.
import { query, request, sql } from '../db.js';

const SELECT = `
  SELECT r.RefundId, r.PaymentId, r.Amount, r.Reason, r.RestockInventory, r.VoidedOrderIds, r.CreatedAt, cu.FullName AS CreatedBy,
         au.FullName AS ApprovedBy, COALESCE(t.Name, N'Mang đi') + ISNULL(N' · #' + o.OrderCode, N'') AS Target
  FROM dbo.Refunds r
  JOIN dbo.Users cu ON cu.UserId = r.CreatedBy
  JOIN dbo.Users au ON au.UserId = r.ApprovedBy
  JOIN dbo.Payments p ON p.PaymentId = r.PaymentId
  LEFT JOIN dbo.Sessions s ON s.SessionId = p.SessionId
  LEFT JOIN dbo.Tables t ON t.TableId = s.TableId
  LEFT JOIN dbo.Orders o ON o.OrderId = p.OrderId`;

const map = (x) => ({
  refundId: x.RefundId,
  paymentId: x.PaymentId,
  amount: Number(x.Amount),
  reason: x.Reason,
  restockInventory: Boolean(x.RestockInventory),
  voidedOrderIds: x.VoidedOrderIds ? x.VoidedOrderIds.split(',').map(Number) : [],
  createdAt: x.CreatedAt,
  createdBy: x.CreatedBy,
  approvedBy: x.ApprovedBy,
  target: x.Target,
});

export async function create({ paymentId, amount, reason, restock, orderIds, userId, approvedBy, shiftId }) {
  const r = await (
    await request()
  )
    .input('PaymentId', sql.Int, paymentId)
    .input('Amount', sql.Decimal(12, 0), amount)
    .input('Reason', sql.NVarChar(200), reason)
    .input('Restock', sql.Bit, Boolean(restock))
    .input('OrderIds', sql.NVarChar(400), orderIds?.length ? orderIds.join(',') : null)
    .input('UserId', sql.Int, userId)
    .input('ApprovedBy', sql.Int, approvedBy)
    .input('ShiftId', sql.Int, shiftId)
    .output('RefundId', sql.Int)
    .execute('dbo.sp_RefundPayment');
  return r.output.RefundId;
}

export async function listForPayment(paymentId) {
  const r = await query(`${SELECT} WHERE r.PaymentId = @id ORDER BY r.RefundId`, { id: [sql.Int, paymentId] });
  return r.recordset.map(map);
}

export async function list(fromUtc, toUtc) {
  const r = await query(`${SELECT} WHERE r.CreatedAt >= @f AND r.CreatedAt < @t ORDER BY r.CreatedAt DESC`, {
    f: [sql.DateTime2(0), fromUtc],
    t: [sql.DateTime2(0), toUtc],
  });
  return r.recordset.map(map);
}
