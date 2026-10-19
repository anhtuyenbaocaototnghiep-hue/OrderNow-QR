// Sửa / xóa món đã gọi, xóa đơn, hủy lượt phục vụ bàn (FEATURE-046, ADR-007). Ghi qua sp_VoidOrderItem / sp_CancelOrders.
import { query, request, sql } from '../db.js';

/** Thông tin dòng khách chọn để service quyết định có cần người duyệt (D-33). */
export async function lineInfo(orderItemId) {
  const r = await query(
    `SELECT oi.OrderItemId, oi.OrderId, oi.Quantity, oi.PaidAt, o.Status, o.PaymentStatus, o.SessionId
     FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId
     WHERE oi.OrderItemId = @id AND oi.ParentOrderItemId IS NULL`,
    { id: [sql.Int, orderItemId] },
  );
  const x = r.recordset[0];
  return x
    ? {
        orderItemId: x.OrderItemId,
        orderId: x.OrderId,
        quantity: x.Quantity,
        paid: Boolean(x.PaidAt),
        status: x.Status,
        paymentStatus: x.PaymentStatus,
        sessionId: x.SessionId ? x.SessionId.toLowerCase() : null,
      }
    : null;
}

export async function voidItem({ orderItemId, newQty, userId, approvedBy, reason, stockMode }) {
  const r = await (
    await request()
  )
    .input('OrderItemId', sql.Int, orderItemId)
    .input('NewQty', sql.Int, newQty)
    .input('UserId', sql.Int, userId)
    .input('ApprovedBy', sql.Int, approvedBy)
    .input('Reason', sql.NVarChar(200), reason)
    .input('StockMode', sql.VarChar(10), stockMode ?? null)
    .output('OrderId', sql.Int)
    .output('OrderStatus', sql.VarChar(10))
    .output('SessionClosed', sql.Bit)
    .execute('dbo.sp_VoidOrderItem');
  return { orderId: r.output.OrderId, status: r.output.OrderStatus, sessionClosed: Boolean(r.output.SessionClosed) };
}

/** orderId = null → hủy lượt phục vụ (mọi đơn chưa thu + đóng phiên). sessionClosed: đóng phiên (hủy bàn / xóa đơn chưa thu cuối của phiên đã thu một phần). */
export async function cancelOrders({ sessionId, orderId = null, userId, approvedBy, reason, stockMode }) {
  const r = await (
    await request()
  )
    .input('SessionId', sql.UniqueIdentifier, sessionId)
    .input('OrderId', sql.Int, orderId)
    .input('UserId', sql.Int, userId)
    .input('ApprovedBy', sql.Int, approvedBy)
    .input('Reason', sql.NVarChar(200), reason)
    .input('StockMode', sql.VarChar(10), stockMode ?? null)
    .output('Cancelled', sql.Int)
    .output('SessionClosed', sql.Bit)
    .execute('dbo.sp_CancelOrders');
  return { cancelled: r.output.Cancelled, sessionClosed: Boolean(r.output.SessionClosed) };
}

/** Lịch sử bỏ món của một phiên (drawer / bill tạm tính). */
export async function voidsOfSession(sessionId) {
  const r = await query(
    `SELECT v.VoidId, v.OrderId, o.OrderCode, v.ItemName, v.Qty, v.Amount, v.OrderStatus, v.StockMode, v.Reason, v.CreatedAt,
            cu.FullName AS CreatedByName, au.FullName AS ApprovedByName
     FROM dbo.OrderItemVoids v JOIN dbo.Orders o ON o.OrderId = v.OrderId
     JOIN dbo.Users cu ON cu.UserId = v.CreatedBy LEFT JOIN dbo.Users au ON au.UserId = v.ApprovedBy
     WHERE v.SessionId = @s ORDER BY v.CreatedAt DESC, v.VoidId DESC`,
    { s: [sql.UniqueIdentifier, sessionId] },
  );
  return r.recordset.map((x) => ({
    voidId: x.VoidId,
    orderId: x.OrderId,
    orderCode: x.OrderCode,
    itemName: x.ItemName,
    qty: x.Qty,
    amount: Number(x.Amount),
    orderStatus: x.OrderStatus,
    stockMode: x.StockMode,
    reason: x.Reason,
    createdAt: x.CreatedAt,
    createdBy: x.CreatedByName,
    approvedBy: x.ApprovedByName,
  }));
}
