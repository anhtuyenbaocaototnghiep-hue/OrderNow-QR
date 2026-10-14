// Phiên (Session) trên bàn: tạo/gộp, tổng tạm tính, gọi thanh toán, thu tiền, đóng bàn trống.
import { inTransaction, query, request, sql, txQuery } from '../db.js';
import { mapPayment } from './ordersRepo.js';

const SESSION_SELECT = `
  SELECT s.SessionId, s.TableId, t.Code AS TableCode, t.Name AS TableName, s.Status, s.OpenedAt, s.PaymentRequestedAt,
         s.ClosedAt, ISNULL(a.AmountDue, 0) AS AmountDue, ISNULL(a.OrderCount, 0) AS OrderCount,
         ISNULL(a.PendingCount, 0) AS PendingCount, ISNULL(a.PreparingCount, 0) AS PreparingCount, ISNULL(q.ItemCount, 0) AS ItemCount
  FROM dbo.Sessions s
  JOIN dbo.Tables t ON t.TableId = s.TableId
  OUTER APPLY (SELECT SUM(o.TotalAmount) AS AmountDue, COUNT(*) AS OrderCount,
                      SUM(CASE WHEN o.Status = 'PENDING' THEN 1 ELSE 0 END) AS PendingCount,
                      SUM(CASE WHEN o.Status = 'PREPARING' THEN 1 ELSE 0 END) AS PreparingCount
               FROM dbo.Orders o WHERE o.SessionId = s.SessionId AND o.Status <> 'CANCELLED') a
  OUTER APPLY (SELECT SUM(oi.Quantity) AS ItemCount
               FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId
               WHERE o.SessionId = s.SessionId AND o.Status <> 'CANCELLED') q`;

export const mapSession = (r) =>
  r && {
    sessionId: r.SessionId.toLowerCase(),
    table: { tableId: r.TableId, code: r.TableCode, name: r.TableName },
    status: r.Status,
    openedAt: r.OpenedAt,
    paymentRequestedAt: r.PaymentRequestedAt,
    closedAt: r.ClosedAt,
    amountDue: r.AmountDue,
    orderCount: r.OrderCount,
    itemCount: r.ItemCount,
    pendingCount: r.PendingCount,
    preparingCount: r.PreparingCount,
  };

export async function findById(sessionId) {
  const r = await query(`${SESSION_SELECT} WHERE s.SessionId = @s`, { s: [sql.UniqueIdentifier, sessionId] });
  return mapSession(r.recordset[0]);
}

export async function listOpenByTable(tableId) {
  const r = await query(`${SESSION_SELECT} WHERE s.TableId = @t AND s.Status <> 'CLOSED' ORDER BY s.OpenedAt`, { t: [sql.Int, tableId] });
  return r.recordset.map(mapSession);
}

/** Phiên mở trên bàn mà trình duyệt này đã tham gia (đóng tab rồi quét lại → vào lại phiên cũ). */
export async function findOpenForClient(tableId, clientToken) {
  const r = await query(
    `${SESSION_SELECT}
     JOIN dbo.SessionClients c ON c.SessionId = s.SessionId AND c.ClientToken = @c
     WHERE s.TableId = @t AND s.Status <> 'CLOSED' ORDER BY s.OpenedAt DESC`,
    { t: [sql.Int, tableId], c: [sql.Char(32), clientToken] },
  );
  return mapSession(r.recordset[0]);
}

export async function createWithClient(tableId, clientToken) {
  const id = await inTransaction(async (tx) => {
    const r = await txQuery(tx, 'INSERT dbo.Sessions (TableId) OUTPUT inserted.SessionId VALUES (@t)', { t: [sql.Int, tableId] });
    const sessionId = r.recordset[0].SessionId;
    await txQuery(tx, 'INSERT dbo.SessionClients (SessionId, ClientToken) VALUES (@s, @c)', {
      s: [sql.UniqueIdentifier, sessionId],
      c: [sql.Char(32), clientToken],
    });
    return sessionId;
  });
  return findById(id);
}

export async function addClient(sessionId, clientToken) {
  await query(
    `IF NOT EXISTS (SELECT 1 FROM dbo.SessionClients WHERE SessionId = @s AND ClientToken = @c)
       INSERT dbo.SessionClients (SessionId, ClientToken) VALUES (@s, @c)`,
    { s: [sql.UniqueIdentifier, sessionId], c: [sql.Char(32), clientToken] },
  );
}

export async function isMember(sessionId, clientToken) {
  if (!clientToken) return false;
  const r = await query('SELECT 1 AS ok FROM dbo.SessionClients WHERE SessionId = @s AND ClientToken = @c', {
    s: [sql.UniqueIdentifier, sessionId],
    c: [sql.Char(32), clientToken],
  });
  return r.recordset.length > 0;
}

export async function listByStatus(statuses) {
  const r = await query(`${SESSION_SELECT} WHERE s.Status IN (SELECT value FROM STRING_SPLIT(@st, ',')) ORDER BY t.Code, s.OpenedAt`, {
    st: [sql.NVarChar(100), statuses.join(',')],
  });
  return r.recordset.map(mapSession);
}

export async function requestPayment(sessionId) {
  const r = await (
    await request()
  )
    .input('SessionId', sql.UniqueIdentifier, sessionId)
    .output('AmountDue', sql.Decimal(12, 0))
    .output('RequestedAt', sql.DateTime2(0))
    .execute('dbo.sp_RequestPayment');
  return { amountDue: r.output.AmountDue, requestedAt: r.output.RequestedAt };
}

export async function settle(sessionId, { amountReceived, expectedAmountDue = null, userId }) {
  const r = await (
    await request()
  )
    .input('SessionId', sql.UniqueIdentifier, sessionId)
    .input('AmountReceived', sql.Decimal(12, 0), amountReceived)
    .input('UserId', sql.Int, userId)
    .input('ExpectedDue', sql.Decimal(12, 0), expectedAmountDue)
    .output('PaymentId', sql.Int)
    .output('AmountDue', sql.Decimal(12, 0))
    .execute('dbo.sp_SettleSession');
  return { paymentId: r.output.PaymentId, amountDue: r.output.AmountDue };
}

export async function closeEmpty(sessionId, userId) {
  await (await request()).input('SessionId', sql.UniqueIdentifier, sessionId).input('UserId', sql.Int, userId).execute('dbo.sp_CloseEmptySession');
}

export async function paymentForSession(sessionId) {
  const r = await query(
    `SELECT p.PaymentId, p.AmountDue, p.AmountReceived, p.ChangeGiven, p.PaidAt, p.ReceivedBy, u.FullName
     FROM dbo.Payments p JOIN dbo.Users u ON u.UserId = p.ReceivedBy WHERE p.SessionId = @s`,
    { s: [sql.UniqueIdentifier, sessionId] },
  );
  return r.recordset[0] ? mapPayment(r.recordset[0]) : null;
}
