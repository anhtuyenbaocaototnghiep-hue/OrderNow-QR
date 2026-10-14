// Đơn hàng: mọi thao tác đổi trạng thái kèm kho đi qua SP (rules); tiếp nhận là UPDATE có điều kiện (không chạm kho).
import { query, request, sql } from '../db.js';

const ORDER_SELECT = `
  SELECT o.OrderId, o.OrderCode, o.SessionId, o.TableId, t.Code AS TableCode, t.Name AS TableName, o.Type, o.Status,
         o.PaymentStatus, o.PaymentMethod, o.TotalAmount, o.Note, o.CreatedBy, cu.FullName AS CreatedByName,
         o.CreatedAt, o.AcceptedAt, o.PaidAt, o.CompletedAt, o.CancelledAt, o.CancelReason
  FROM dbo.Orders o
  LEFT JOIN dbo.Tables t ON t.TableId = o.TableId
  LEFT JOIN dbo.Users cu ON cu.UserId = o.CreatedBy`;

const mapOrder = (r) => ({
  orderId: r.OrderId,
  orderCode: r.OrderCode,
  sessionId: r.SessionId ? r.SessionId.toLowerCase() : null,
  table: r.TableId ? { tableId: r.TableId, code: r.TableCode, name: r.TableName } : null,
  type: r.Type,
  status: r.Status,
  paymentStatus: r.PaymentStatus,
  paymentMethod: r.PaymentMethod,
  totalAmount: r.TotalAmount,
  note: r.Note,
  createdBy: r.CreatedBy ? { userId: r.CreatedBy, fullName: r.CreatedByName } : null,
  createdAt: r.CreatedAt,
  acceptedAt: r.AcceptedAt,
  paidAt: r.PaidAt,
  completedAt: r.CompletedAt,
  cancelledAt: r.CancelledAt,
  cancelReason: r.CancelReason,
  items: [],
});

async function attachItems(orders) {
  if (orders.length === 0) return orders;
  const r = await query(
    `SELECT oi.OrderItemId, oi.OrderId, oi.MenuItemId, m.Name, oi.Quantity, oi.UnitPrice, oi.Note
     FROM dbo.OrderItems oi JOIN dbo.MenuItems m ON m.MenuItemId = oi.MenuItemId
     WHERE oi.OrderId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
     ORDER BY oi.OrderItemId`,
    { ids: [sql.NVarChar(sql.MAX), orders.map((o) => o.orderId).join(',')] },
  );
  const byId = new Map(orders.map((o) => [o.orderId, o]));
  for (const row of r.recordset) {
    byId.get(row.OrderId)?.items.push({
      orderItemId: row.OrderItemId,
      menuItemId: row.MenuItemId,
      name: row.Name,
      quantity: row.Quantity,
      unitPrice: row.UnitPrice,
      lineTotal: row.Quantity * row.UnitPrice,
      note: row.Note,
    });
  }
  return orders;
}

export async function getById(orderId) {
  const r = await query(`${ORDER_SELECT} WHERE o.OrderId = @id`, { id: [sql.Int, orderId] });
  if (!r.recordset[0]) return null;
  return (await attachItems([mapOrder(r.recordset[0])]))[0];
}

export async function listBySession(sessionId) {
  const r = await query(`${ORDER_SELECT} WHERE o.SessionId = @s ORDER BY o.CreatedAt, o.OrderId`, { s: [sql.UniqueIdentifier, sessionId] });
  return attachItems(r.recordset.map(mapOrder));
}

/** Dashboard quầy: đơn theo trạng thái; `since` lọc đơn có thay đổi từ mốc đó (tạo/tiếp nhận/hoàn tất/hủy/thu tiền). */
export async function listActive({ statuses, since = null, completedSince = null, type = null }) {
  const r = await query(
    `${ORDER_SELECT}
     WHERE o.Status IN (SELECT value FROM STRING_SPLIT(@statuses, ','))
       AND (@type IS NULL OR o.Type = @type)
       AND (@since IS NULL OR o.CreatedAt >= @since OR o.AcceptedAt >= @since OR o.CompletedAt >= @since
            OR o.CancelledAt >= @since OR o.PaidAt >= @since)
       AND (@completedSince IS NULL OR o.Status <> 'COMPLETED' OR o.CompletedAt >= @completedSince)
     ORDER BY o.CreatedAt, o.OrderId`,
    {
      statuses: [sql.NVarChar(200), statuses.join(',')],
      since: [sql.DateTime2(0), since],
      completedSince: [sql.DateTime2(0), completedSince],
      type: [sql.VarChar(10), type],
    },
  );
  return attachItems(r.recordset.map(mapOrder));
}

export async function history({ fromUtc, toUtc, status = null, type = null, page = 1, pageSize = 50 }) {
  const r = await query(
    `${ORDER_SELECT.replace('SELECT o.OrderId', 'SELECT COUNT(*) OVER () AS Total, o.OrderId')}
     WHERE o.CreatedAt >= @f AND o.CreatedAt < @t
       AND (@status IS NULL OR o.Status = @status)
       AND (@type IS NULL OR o.Type = @type)
     ORDER BY o.CreatedAt DESC, o.OrderId DESC
     OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`,
    {
      f: [sql.DateTime2(0), fromUtc],
      t: [sql.DateTime2(0), toUtc],
      status: [sql.VarChar(10), status],
      type: [sql.VarChar(10), type],
      skip: [sql.Int, (page - 1) * pageSize],
      take: [sql.Int, pageSize],
    },
  );
  const total = r.recordset[0]?.Total ?? 0;
  return { items: await attachItems(r.recordset.map(mapOrder)), total, page, pageSize };
}

export async function menuItemNames(ids) {
  if (ids.length === 0) return [];
  const r = await query("SELECT MenuItemId, Name FROM dbo.MenuItems WHERE MenuItemId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))", {
    ids: [sql.NVarChar(sql.MAX), ids.join(',')],
  });
  const names = new Map(r.recordset.map((x) => [x.MenuItemId, x.Name]));
  return ids.map((id) => ({ menuItemId: id, name: names.get(id) ?? `Món #${id}` }));
}

/** sp_SubmitOrder (dine-in hoặc mang đi). */
export async function submit({ type, sessionId = null, createdBy = null, paymentMethod = null, amountReceived = null, note = null, items }) {
  const tvp = new sql.Table('dbo.OrderItemInput');
  tvp.columns.add('MenuItemId', sql.Int, { nullable: false });
  tvp.columns.add('Quantity', sql.Int, { nullable: false });
  tvp.columns.add('Note', sql.NVarChar(200), { nullable: true });
  for (const it of items) tvp.rows.add(it.menuItemId, it.quantity, it.note || null);

  const r = await (
    await request()
  )
    .input('Type', sql.VarChar(10), type)
    .input('SessionId', sql.UniqueIdentifier, sessionId)
    .input('CreatedBy', sql.Int, createdBy)
    .input('PaymentMethod', sql.VarChar(10), paymentMethod)
    .input('AmountReceived', sql.Decimal(12, 0), amountReceived)
    .input('Note', sql.NVarChar(200), note || null)
    .input('Items', tvp)
    .output('OrderId', sql.Int)
    .output('OrderCode', sql.Char(8))
    .output('SessionReopened', sql.Bit)
    .execute('dbo.sp_SubmitOrder');
  return { orderId: r.output.OrderId, orderCode: r.output.OrderCode, sessionReopened: Boolean(r.output.SessionReopened) };
}

/** PENDING → PREPARING (Q-004b). Trả trạng thái hiện tại nếu không đổi được. */
export async function accept(orderId) {
  const r = await query(
    `UPDATE dbo.Orders SET Status = 'PREPARING', AcceptedAt = SYSUTCDATETIME() WHERE OrderId = @id AND Status = 'PENDING';
     SELECT @@ROWCOUNT AS Changed, (SELECT Status FROM dbo.Orders WHERE OrderId = @id) AS Status;`,
    { id: [sql.Int, orderId] },
  );
  return { changed: r.recordset[0].Changed === 1, status: r.recordset[0].Status };
}

/** sp_CompleteOrder → danh sách nguyên liệu đã trừ (kèm khả dụng sau trừ). */
export async function complete(orderId, userId) {
  const r = await (await request()).input('OrderId', sql.Int, orderId).input('UserId', sql.Int, userId).execute('dbo.sp_CompleteOrder');
  return r.recordset ?? [];
}

export async function cancel(orderId, userId, reason) {
  await (
    await request()
  )
    .input('OrderId', sql.Int, orderId)
    .input('UserId', sql.Int, userId)
    .input('Reason', sql.NVarChar(200), reason || null)
    .execute('dbo.sp_CancelOrder');
}

export async function paymentForOrder(orderId) {
  const r = await query(
    `SELECT p.PaymentId, p.AmountDue, p.AmountReceived, p.ChangeGiven, p.PaidAt, p.ReceivedBy, u.FullName
     FROM dbo.Payments p JOIN dbo.Users u ON u.UserId = p.ReceivedBy WHERE p.OrderId = @id`,
    { id: [sql.Int, orderId] },
  );
  const p = r.recordset[0];
  return p ? mapPayment(p) : null;
}

export const mapPayment = (p) => ({
  paymentId: p.PaymentId,
  method: 'CASH',
  amountDue: p.AmountDue,
  amountReceived: p.AmountReceived,
  changeGiven: p.ChangeGiven,
  paidAt: p.PaidAt,
  receivedBy: { userId: p.ReceivedBy, fullName: p.FullName },
});
