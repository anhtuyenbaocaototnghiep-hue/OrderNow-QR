// Phiên (Session) trên bàn: tạo/gộp, tổng tạm tính, gọi thanh toán, thu tiền, đóng bàn trống, hội viên gắn với phiên (F-014).
// F-024: nhân viên mở bàn (OpenedBy) + ghi chú bàn (Note — chỉ nhân viên thấy; service bỏ đi trước khi trả cho khách).
import { inTransaction, query, request, sql, txQuery } from '../db.js';
import { mapPayment, PAYMENT_SELECT } from './ordersRepo.js';

const SESSION_SELECT = `
  SELECT s.SessionId, s.TableId, t.Code AS TableCode, t.Name AS TableName, s.Status, s.OpenedAt, s.PaymentRequestedAt,
         s.ClosedAt, ISNULL(a.AmountDue, 0) AS AmountDue, ISNULL(a.OrderCount, 0) AS OrderCount,
         ISNULL(a.PendingCount, 0) AS PendingCount, ISNULL(a.PreparingCount, 0) AS PreparingCount, ISNULL(q.ItemCount, 0) AS ItemCount,
         s.MemberId, mem.FullName AS MemberName, mem.TierCode AS MemberTier, mt.Name AS MemberTierName,
         mt.DiscountPercent AS MemberDiscountPercent, mem.FirstOrderDiscountUsed AS MemberFirstUsed,
         (SELECT COUNT(*) FROM dbo.StaffCalls sc WHERE sc.SessionId = s.SessionId AND sc.HandledAt IS NULL) AS OpenCalls,
         s.OpenedBy, ob.FullName AS OpenedByName, s.Note, s.NoteUpdatedAt, nu.FullName AS NoteUpdatedByName,
         (SELECT COUNT(*) FROM dbo.SessionSplits sp WHERE sp.SessionId = s.SessionId AND sp.IsCommon = 0) AS SplitCount,
         ISNULL((SELECT SUM(pp.AmountDue) FROM dbo.Payments pp WHERE pp.SessionId = s.SessionId), 0) AS PaidAmount
  FROM dbo.Sessions s
  JOIN dbo.Tables t ON t.TableId = s.TableId
  LEFT JOIN dbo.Users ob ON ob.UserId = s.OpenedBy
  LEFT JOIN dbo.Users nu ON nu.UserId = s.NoteUpdatedBy
  LEFT JOIN dbo.Members mem ON mem.MemberId = s.MemberId
  LEFT JOIN dbo.MemberTiers mt ON mt.TierCode = mem.TierCode
  OUTER APPLY (SELECT SUM(o.TotalAmount) AS AmountDue, COUNT(*) AS OrderCount,
                      SUM(CASE WHEN o.Status = 'PENDING' THEN 1 ELSE 0 END) AS PendingCount,
                      SUM(CASE WHEN o.Status = 'PREPARING' THEN 1 ELSE 0 END) AS PreparingCount
               FROM dbo.Orders o WHERE o.SessionId = s.SessionId AND o.Status NOT IN ('CANCELLED', 'VOIDED')) a
  OUTER APPLY (SELECT SUM(oi.Quantity) AS ItemCount
               FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId
               WHERE o.SessionId = s.SessionId AND o.Status NOT IN ('CANCELLED', 'VOIDED') AND oi.ParentOrderItemId IS NULL) q`;

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
    openCalls: r.OpenCalls ?? 0,
    // F-024 — chỉ dành cho nhân viên
    openedBy: r.OpenedBy ? { userId: r.OpenedBy, fullName: r.OpenedByName } : null,
    note: r.Note ?? null,
    noteUpdatedAt: r.NoteUpdatedAt ?? null,
    noteUpdatedBy: r.NoteUpdatedByName ?? null,
    splitCount: r.SplitCount ?? 0, // F-026
    paidAmount: r.PaidAmount ?? 0,
    // Hội viên đang gắn (tên đầy đủ — service che tên trước khi trả cho khách)
    member: r.MemberId
      ? {
          memberId: r.MemberId,
          fullName: r.MemberName,
          tierCode: r.MemberTier,
          tierName: r.MemberTierName,
          discountPercent: Number(r.MemberDiscountPercent),
          firstOrderDiscount: !r.MemberFirstUsed,
        }
      : null,
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

/**
 * F-024: nhân viên mở bàn (khách không quét QR). Khóa dòng bàn để hai máy quầy không cùng mở một bàn trống.
 * Bàn đang có phiên mở và không xin `newGroup` → trả { occupied } (không tạo). Bàn không tồn tại / đã tắt → { missing }.
 */
export async function openByStaff(tableId, userId, { note = null, newGroup = false } = {}) {
  const result = await inTransaction(async (tx) => {
    const t = await txQuery(tx, 'SELECT TableId FROM dbo.Tables WITH (UPDLOCK, HOLDLOCK) WHERE TableId = @t AND IsActive = 1 AND DeletedAt IS NULL', {
      t: [sql.Int, tableId],
    });
    if (!t.recordset[0]) return { missing: true };
    if (!newGroup) {
      const open = await txQuery(tx, "SELECT COUNT(*) AS N FROM dbo.Sessions WHERE TableId = @t AND Status <> 'CLOSED'", { t: [sql.Int, tableId] });
      if (open.recordset[0].N > 0) return { occupied: true };
    }
    const r = await txQuery(
      tx,
      `INSERT dbo.Sessions (TableId, OpenedBy, Note, NoteUpdatedAt, NoteUpdatedBy)
       OUTPUT inserted.SessionId
       VALUES (@t, @u, @n, CASE WHEN @n IS NULL THEN NULL ELSE SYSUTCDATETIME() END, CASE WHEN @n IS NULL THEN NULL ELSE @u END)`,
      { t: [sql.Int, tableId], u: [sql.Int, userId], n: [sql.NVarChar(200), note || null] },
    );
    return { sessionId: r.recordset[0].SessionId };
  });
  if (!result.sessionId) return { ...result, sessions: result.occupied ? await listOpenByTable(tableId) : [] };
  return { session: await findById(result.sessionId) };
}

/** F-024: ghi chú bàn (null = xóa). Trả false nếu phiên đã đóng / không tồn tại. */
export async function setNote(sessionId, note, userId) {
  const r = await query(
    `UPDATE dbo.Sessions SET Note = @n, NoteUpdatedAt = SYSUTCDATETIME(), NoteUpdatedBy = @u
     WHERE SessionId = @s AND Status <> 'CLOSED'`,
    { s: [sql.UniqueIdentifier, sessionId], n: [sql.NVarChar(200), note || null], u: [sql.Int, userId] },
  );
  return r.rowsAffected[0] > 0;
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

/** Gắn/gỡ hội viên của phiên chưa thu tiền (F-014). Trả false nếu phiên đã đóng / không tồn tại. */
export async function setMember(sessionId, memberId) {
  const r = await query("UPDATE dbo.Sessions SET MemberId = @m WHERE SessionId = @s AND Status <> 'CLOSED'", {
    s: [sql.UniqueIdentifier, sessionId],
    m: [sql.Int, memberId],
  });
  return r.rowsAffected[0] > 0;
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

/**
 * sp_SettleSession. `totals` (từ pricing.settleTotals) có thể vắng → chế độ cũ (không chiết khấu).
 * { amountReceived, expectedAmountDue, userId, shiftId, memberId, totals, manualReason, approvedBy }
 */
export async function settle(
  sessionId,
  {
    amountReceived,
    expectedAmountDue = null,
    userId,
    shiftId = null,
    memberId = null,
    totals = null,
    manualReason = null,
    approvedBy = null,
    loyaltyJson = null,
  },
) {
  const r = await (
    await request()
  )
    .input('SessionId', sql.UniqueIdentifier, sessionId)
    .input('AmountReceived', sql.Decimal(12, 0), amountReceived)
    .input('UserId', sql.Int, userId)
    .input('ExpectedDue', sql.Decimal(12, 0), expectedAmountDue)
    .input('OrdersTotal', sql.Decimal(12, 0), totals?.ordersTotal ?? null)
    .input('MemberId', sql.Int, memberId)
    .input('MemberPercent', sql.Decimal(5, 2), memberId ? totals?.memberPercent : null)
    .input('MemberDiscount', sql.Decimal(12, 0), totals?.memberDiscount ?? 0)
    .input('ManualDiscount', sql.Decimal(12, 0), totals?.manualDiscount ?? 0)
    .input('ManualReason', sql.NVarChar(200), manualReason)
    .input('ApprovedBy', sql.Int, approvedBy)
    .input('RoundingAdj', sql.Decimal(12, 0), totals?.roundingAdj ?? 0)
    .input('ShiftId', sql.Int, shiftId)
    .input('VoucherDiscount', sql.Decimal(12, 0), totals?.voucherDiscount ?? 0)
    .input('RewardDiscount', sql.Decimal(12, 0), totals?.rewardDiscount ?? 0)
    .input('LoyaltyJson', sql.NVarChar(sql.MAX), loyaltyJson)
    .output('PaymentId', sql.Int)
    .output('AmountDue', sql.Decimal(12, 0))
    .execute('dbo.sp_SettleSession');
  return { paymentId: r.output.PaymentId, amountDue: r.output.AmountDue };
}

export async function closeEmpty(sessionId, userId) {
  await (await request()).input('SessionId', sql.UniqueIdentifier, sessionId).input('UserId', sql.Int, userId).execute('dbo.sp_CloseEmptySession');
}

/** Lượt thu cả phiên (phiên không chia bill). */
export async function paymentForSession(sessionId) {
  const r = await query(`${PAYMENT_SELECT} WHERE p.SessionId = @s AND p.SplitId IS NULL`, { s: [sql.UniqueIdentifier, sessionId] });
  return r.recordset[0] ? mapPayment(r.recordset[0]) : null;
}

/** Mọi lượt thu của phiên (chia bill: mỗi phần một lượt — F-026). */
export async function paymentsForSession(sessionId) {
  const r = await query(`${PAYMENT_SELECT} WHERE p.SessionId = @s ORDER BY p.PaidAt, p.PaymentId`, { s: [sql.UniqueIdentifier, sessionId] });
  return r.recordset.map((p) => ({ ...mapPayment(p), splitId: p.SplitId ?? null }));
}
