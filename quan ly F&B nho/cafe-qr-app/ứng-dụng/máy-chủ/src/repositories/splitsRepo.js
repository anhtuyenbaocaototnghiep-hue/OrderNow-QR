// FEATURE-026 Chia bill: phần (SessionSplits) + gán dòng món. Mọi thao tác khóa dòng phiên trước (cùng thứ tự với gửi đơn / thu tiền).
import { inTransaction, query, request, sql, txQuery } from '../db.js';

const map = (r) => ({
  splitId: r.SplitId,
  sessionId: r.SessionId.toLowerCase(),
  label: r.Label,
  clientToken: r.ClientToken,
  memberId: r.MemberId,
  memberName: r.MemberName ?? null,
  isCommon: Boolean(r.IsCommon),
  status: r.Status,
  paymentId: r.PaymentId,
  paidAmount: r.PaidAmount ?? null,
  createdAt: r.CreatedAt,
});

const SELECT = `
  SELECT sp.*, mem.FullName AS MemberName, p.AmountDue AS PaidAmount
  FROM dbo.SessionSplits sp
  LEFT JOIN dbo.Members mem ON mem.MemberId = sp.MemberId
  LEFT JOIN dbo.Payments p ON p.PaymentId = sp.PaymentId`;

export async function listBySession(sessionId) {
  const r = await query(`${SELECT} WHERE sp.SessionId = @s ORDER BY sp.IsCommon DESC, sp.SplitId`, { s: [sql.UniqueIdentifier, sessionId] });
  return r.recordset.map(map);
}

export async function get(splitId) {
  const r = await query(`${SELECT} WHERE sp.SplitId = @id`, { id: [sql.Int, splitId] });
  return r.recordset[0] ? map(r.recordset[0]) : null;
}

export async function hasSplits(sessionId) {
  const r = await query('SELECT TOP 1 1 AS ok FROM dbo.SessionSplits WHERE SessionId = @s', { s: [sql.UniqueIdentifier, sessionId] });
  return r.recordset.length > 0;
}

/** Khóa phiên; phiên đã đóng → 'CLOSED', không có → null. */
async function lockSession(tx, sessionId) {
  const r = await txQuery(tx, 'SELECT Status FROM dbo.Sessions WITH (UPDLOCK, ROWLOCK) WHERE SessionId = @s', { s: [sql.UniqueIdentifier, sessionId] });
  return r.recordset[0]?.Status ?? null;
}

/**
 * Tạo phần (kèm phần "Chung" nếu phiên chưa chia). Khách: mỗi điện thoại một phần (trả lại phần đang mở nếu đã có).
 * → { splitId } | { error: 'NOT_FOUND' | 'CLOSED' }
 */
export async function create(sessionId, { label, clientToken = null, memberId = null }) {
  return inTransaction(async (tx) => {
    const status = await lockSession(tx, sessionId);
    if (!status) return { error: 'NOT_FOUND' };
    if (status === 'CLOSED') return { error: 'CLOSED' };
    const s = { s: [sql.UniqueIdentifier, sessionId] };
    await txQuery(
      tx,
      `IF NOT EXISTS (SELECT 1 FROM dbo.SessionSplits WHERE SessionId = @s AND IsCommon = 1)
                         INSERT dbo.SessionSplits (SessionId, Label, IsCommon) VALUES (@s, N'Chung', 1)`,
      s,
    );
    if (clientToken) {
      const mine = await txQuery(tx, "SELECT SplitId FROM dbo.SessionSplits WHERE SessionId = @s AND ClientToken = @c AND Status = 'OPEN'", {
        ...s,
        c: [sql.Char(32), clientToken],
      });
      if (mine.recordset[0]) {
        await txQuery(tx, 'UPDATE dbo.SessionSplits SET Label = @l WHERE SplitId = @id', {
          id: [sql.Int, mine.recordset[0].SplitId],
          l: [sql.NVarChar(50), label],
        });
        return { splitId: mine.recordset[0].SplitId };
      }
    }
    const r = await txQuery(tx, 'INSERT dbo.SessionSplits (SessionId, Label, ClientToken, MemberId) OUTPUT inserted.SplitId VALUES (@s, @l, @c, @m)', {
      ...s,
      l: [sql.NVarChar(50), label],
      c: [sql.Char(32), clientToken],
      m: [sql.Int, memberId],
    });
    return { splitId: r.recordset[0].SplitId };
  });
}

/**
 * Gán dòng món (dòng khách chọn, chưa thu, đơn còn hiệu lực) cho phần `splitId` (null / phần Chung = bỏ về Chung).
 * `allowedFrom`: chỉ được đổi dòng đang ở các phần này (khách: phần của mình + Chung). → 'OK' | 'CLOSED' | 'LINE' | 'SPLIT'
 */
export async function assignLine(sessionId, orderItemId, splitId, { allowedFrom = null } = {}) {
  return inTransaction(async (tx) => {
    const status = await lockSession(tx, sessionId);
    if (!status || status === 'CLOSED') return 'CLOSED';
    let target = null;
    if (splitId) {
      const sr = await txQuery(tx, 'SELECT SplitId, IsCommon, Status FROM dbo.SessionSplits WITH (UPDLOCK) WHERE SplitId = @id AND SessionId = @s', {
        id: [sql.Int, splitId],
        s: [sql.UniqueIdentifier, sessionId],
      });
      const sp = sr.recordset[0];
      if (!sp || sp.Status !== 'OPEN') return 'SPLIT';
      target = sp.IsCommon ? null : sp.SplitId;
    }
    const from = allowedFrom ? allowedFrom.join(',') : null;
    const r = await txQuery(
      tx,
      `UPDATE oi SET SplitId = @t
       FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId
       WHERE oi.OrderItemId = @li AND o.SessionId = @s AND o.Status NOT IN ('CANCELLED', 'VOIDED')
         AND oi.ParentOrderItemId IS NULL AND oi.PaidAt IS NULL
         AND (@from IS NULL OR oi.SplitId IS NULL OR oi.SplitId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@from, ',')))`,
      { t: [sql.Int, target], li: [sql.Int, orderItemId], s: [sql.UniqueIdentifier, sessionId], from: [sql.VarChar(200), from] },
    );
    return r.rowsAffected[0] ? 'OK' : 'LINE';
  });
}

/** Đặt hội viên cho một phần (quầy). */
export async function setMember(splitId, memberId) {
  const r = await query("UPDATE dbo.SessionSplits SET MemberId = @m WHERE SplitId = @id AND Status = 'OPEN' AND IsCommon = 0", {
    id: [sql.Int, splitId],
    m: [sql.Int, memberId],
  });
  return r.rowsAffected[0] > 0;
}

/**
 * "Thu chung": chưa có lượt thu nào của phiên → bỏ chia hẳn (mọi dòng về Chung, xóa các phần) — phiên thu như bình thường.
 * Đã thu ít nhất một phần → dồn các phần còn mở về Chung để thu nốt. → { removed, unsplit } | { error }
 */
export async function merge(sessionId) {
  return inTransaction(async (tx) => {
    const status = await lockSession(tx, sessionId);
    if (!status) return { error: 'NOT_FOUND' };
    if (status === 'CLOSED') return { error: 'CLOSED' };
    const s = { s: [sql.UniqueIdentifier, sessionId] };
    const anyPaid = (await txQuery(tx, 'SELECT TOP 1 1 AS x FROM dbo.Payments WHERE SessionId = @s', s)).recordset.length > 0;
    if (anyPaid) {
      await txQuery(
        tx,
        `UPDATE oi SET SplitId = NULL FROM dbo.OrderItems oi JOIN dbo.SessionSplits sp ON sp.SplitId = oi.SplitId
         WHERE sp.SessionId = @s AND sp.Status = 'OPEN' AND sp.IsCommon = 0 AND oi.PaidAt IS NULL`,
        s,
      );
      const removed = (await txQuery(tx, "DELETE dbo.SessionSplits WHERE SessionId = @s AND IsCommon = 0 AND Status = 'OPEN'", s)).rowsAffected[0];
      return { removed, unsplit: false };
    }
    await txQuery(tx, 'UPDATE dbo.OrderItems SET SplitId = NULL WHERE SplitId IN (SELECT SplitId FROM dbo.SessionSplits WHERE SessionId = @s)', s);
    const removed = (await txQuery(tx, 'DELETE dbo.SessionSplits WHERE SessionId = @s', s)).rowsAffected[0];
    return { removed, unsplit: true };
  });
}

/** sp_SettleSplit. */
export async function settle(splitId, p) {
  const r = await (
    await request()
  )
    .input('SplitId', sql.Int, splitId)
    .input('IncludeCommon', sql.Bit, p.includeCommon)
    .input('AmountReceived', sql.Decimal(12, 0), p.amountReceived)
    .input('UserId', sql.Int, p.userId)
    .input('LinesTotal', sql.Decimal(12, 0), p.linesTotal)
    .input('OrderPromoAlloc', sql.Decimal(12, 0), p.promoAlloc)
    .input('ExpectedDue', sql.Decimal(12, 0), p.expectedDue ?? null)
    .input('MemberId', sql.Int, p.memberId ?? null)
    .input('MemberPercent', sql.Decimal(5, 2), p.memberId ? p.totals.memberPercent : null)
    .input('MemberDiscount', sql.Decimal(12, 0), p.totals.memberDiscount)
    .input('ManualDiscount', sql.Decimal(12, 0), p.totals.manualDiscount)
    .input('ManualReason', sql.NVarChar(200), p.manualReason ?? null)
    .input('ApprovedBy', sql.Int, p.approvedBy ?? null)
    .input('RoundingAdj', sql.Decimal(12, 0), p.totals.roundingAdj)
    .input('ShiftId', sql.Int, p.shiftId)
    .input('VoucherDiscount', sql.Decimal(12, 0), p.totals.voucherDiscount ?? 0)
    .input('RewardDiscount', sql.Decimal(12, 0), p.totals.rewardDiscount ?? 0)
    .input('LoyaltyJson', sql.NVarChar(sql.MAX), p.loyaltyJson ?? null)
    .output('PaymentId', sql.Int)
    .output('AmountDue', sql.Decimal(12, 0))
    .output('SessionClosed', sql.Bit)
    .execute('dbo.sp_SettleSplit');
  return { paymentId: r.output.PaymentId, amountDue: r.output.AmountDue, sessionClosed: Boolean(r.output.SessionClosed) };
}
