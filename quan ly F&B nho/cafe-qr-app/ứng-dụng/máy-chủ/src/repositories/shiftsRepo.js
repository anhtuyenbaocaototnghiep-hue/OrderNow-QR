// Ca tiền mặt (FEATURE-018). Một ca mở tại một thời điểm (UX_Shifts_OneOpen); đóng ca qua sp_CloseShift.
// F-033: tiền dự kiến trong két gồm cả thu khác / chi quỹ ĐÃ DUYỆT; khoản chờ duyệt chặn đóng ca.
import { query, request, sql } from '../db.js';

const SELECT = `
  SELECT s.ShiftId, s.OpenedBy, ou.FullName AS OpenedByName, s.OpenedAt, s.OpeningCash, s.ClosedBy, cu.FullName AS ClosedByName,
         s.ClosedAt, s.ExpectedCash, s.CountedCash, s.Difference, s.Note,
         ISNULL((SELECT SUM(p.AmountDue) FROM dbo.Payments p WHERE p.ShiftId = s.ShiftId), 0) AS CashIn,
         ISNULL((SELECT COUNT(*) FROM dbo.Payments p WHERE p.ShiftId = s.ShiftId), 0) AS PaymentCount,
         ISNULL((SELECT SUM(r.Amount) FROM dbo.Refunds r WHERE r.ShiftId = s.ShiftId), 0) AS CashOut,
         ISNULL((SELECT SUM(c.Amount) FROM dbo.CashTransactions c WHERE c.ShiftId = s.ShiftId AND c.Status = 'APPROVED' AND c.Direction = 'IN'), 0) AS BookIn,
         ISNULL((SELECT SUM(c.Amount) FROM dbo.CashTransactions c WHERE c.ShiftId = s.ShiftId AND c.Status = 'APPROVED' AND c.Direction = 'OUT'), 0) AS BookOut,
         (SELECT COUNT(*) FROM dbo.CashTransactions c WHERE c.ShiftId = s.ShiftId AND c.Status = 'PENDING') AS BookPending
  FROM dbo.Shifts s
  JOIN dbo.Users ou ON ou.UserId = s.OpenedBy
  LEFT JOIN dbo.Users cu ON cu.UserId = s.ClosedBy`;

const map = (r) =>
  r && {
    shiftId: r.ShiftId,
    status: r.ClosedAt ? 'CLOSED' : 'OPEN',
    openedBy: { userId: r.OpenedBy, fullName: r.OpenedByName },
    openedAt: r.OpenedAt,
    openingCash: Number(r.OpeningCash),
    closedBy: r.ClosedBy ? { userId: r.ClosedBy, fullName: r.ClosedByName } : null,
    closedAt: r.ClosedAt,
    cashIn: Number(r.CashIn),
    cashOut: Number(r.CashOut),
    paymentCount: r.PaymentCount,
    cashBookIn: Number(r.BookIn),
    cashBookOut: Number(r.BookOut),
    cashPending: r.BookPending,
    // Ca đang mở: tiền mặt dự kiến trong két tới lúc này (công thức như sp_CloseShift)
    expectedCash:
      r.ExpectedCash !== null ? Number(r.ExpectedCash) : Number(r.OpeningCash) + Number(r.CashIn) - Number(r.CashOut) + Number(r.BookIn) - Number(r.BookOut),
    countedCash: r.CountedCash !== null ? Number(r.CountedCash) : null,
    difference: r.Difference !== null ? Number(r.Difference) : null,
    note: r.Note,
  };

export async function current() {
  const r = await query(`${SELECT} WHERE s.ClosedAt IS NULL`);
  return map(r.recordset[0]);
}

export async function findById(id) {
  const r = await query(`${SELECT} WHERE s.ShiftId = @id`, { id: [sql.Int, id] });
  return map(r.recordset[0]);
}

export async function open(openingCash, userId) {
  const r = await query('INSERT dbo.Shifts (OpenedBy, OpeningCash) OUTPUT inserted.ShiftId VALUES (@u, @c)', {
    u: [sql.Int, userId],
    c: [sql.Decimal(12, 0), openingCash],
  });
  return findById(r.recordset[0].ShiftId);
}

export async function close(id, { countedCash, note, userId }) {
  await (
    await request()
  )
    .input('ShiftId', sql.Int, id)
    .input('CountedCash', sql.Decimal(12, 0), countedCash)
    .input('Note', sql.NVarChar(200), note || null)
    .input('UserId', sql.Int, userId)
    .output('ExpectedCash', sql.Decimal(12, 0))
    .output('Difference', sql.Decimal(12, 0))
    .execute('dbo.sp_CloseShift');
  return findById(id);
}

export async function list(fromUtc, toUtc) {
  const r = await query(`${SELECT} WHERE s.OpenedAt >= @f AND s.OpenedAt < @t ORDER BY s.OpenedAt DESC`, {
    f: [sql.DateTime2(0), fromUtc],
    t: [sql.DateTime2(0), toUtc],
  });
  return r.recordset.map(map);
}

/** Phiếu chốt ca: tổng theo nhân viên thu, giảm giá, hoàn tiền, danh sách lượt thu. */
export async function report(id) {
  const p = { id: [sql.Int, id] };
  const [byStaff, discounts, payments, refunds, orders] = await Promise.all([
    query(
      `SELECT u.FullName, COUNT(*) AS Payments, SUM(p.AmountDue) AS Amount
       FROM dbo.Payments p JOIN dbo.Users u ON u.UserId = p.ReceivedBy WHERE p.ShiftId = @id GROUP BY u.FullName ORDER BY Amount DESC`,
      p,
    ),
    query(
      `SELECT ISNULL(SUM(PromoDiscount), 0) AS Promo, ISNULL(SUM(MemberDiscount), 0) AS Member, ISNULL(SUM(ManualDiscount), 0) AS Manual,
              ISNULL(SUM(RoundingAdj), 0) AS Rounding
       FROM dbo.Payments WHERE ShiftId = @id`,
      p,
    ),
    query(
      `SELECT p.PaymentId, p.PaidAt, p.AmountDue, p.AmountReceived, p.ChangeGiven, u.FullName, COALESCE(t.Name, N'Mang đi') AS Target, o.OrderCode,
              ISNULL((SELECT SUM(r.Amount) FROM dbo.Refunds r WHERE r.PaymentId = p.PaymentId), 0) AS Refunded
       FROM dbo.Payments p JOIN dbo.Users u ON u.UserId = p.ReceivedBy
       LEFT JOIN dbo.Sessions s ON s.SessionId = p.SessionId LEFT JOIN dbo.Tables t ON t.TableId = s.TableId
       LEFT JOIN dbo.Orders o ON o.OrderId = p.OrderId
       WHERE p.ShiftId = @id ORDER BY p.PaidAt DESC`,
      p,
    ),
    query(
      `SELECT r.RefundId, r.PaymentId, r.Amount, r.Reason, r.CreatedAt, cu.FullName AS CreatedBy, au.FullName AS ApprovedBy
       FROM dbo.Refunds r JOIN dbo.Users cu ON cu.UserId = r.CreatedBy JOIN dbo.Users au ON au.UserId = r.ApprovedBy
       WHERE r.ShiftId = @id ORDER BY r.CreatedAt DESC`,
      p,
    ),
    query(
      `SELECT COUNT(*) AS Orders FROM dbo.Orders o
       WHERE o.Status NOT IN ('CANCELLED') AND o.PaymentStatus = 'PAID'
         AND (o.OrderId IN (SELECT OrderId FROM dbo.Payments WHERE ShiftId = @id AND OrderId IS NOT NULL)
              OR o.SessionId IN (SELECT SessionId FROM dbo.Payments WHERE ShiftId = @id AND SessionId IS NOT NULL))`,
      p,
    ),
  ]);
  const d = discounts.recordset[0];
  return {
    orderCount: orders.recordset[0].Orders,
    byStaff: byStaff.recordset.map((x) => ({ fullName: x.FullName, payments: x.Payments, amount: Number(x.Amount) })),
    discounts: { promo: Number(d.Promo), member: Number(d.Member), manual: Number(d.Manual), rounding: Number(d.Rounding) },
    payments: payments.recordset.map((x) => ({
      paymentId: x.PaymentId,
      paidAt: x.PaidAt,
      target: x.OrderCode ? `${x.Target} · #${x.OrderCode}` : x.Target,
      amountDue: Number(x.AmountDue),
      amountReceived: Number(x.AmountReceived),
      changeGiven: Number(x.ChangeGiven),
      receivedBy: x.FullName,
      refunded: Number(x.Refunded),
    })),
    refunds: refunds.recordset.map((x) => ({
      refundId: x.RefundId,
      paymentId: x.PaymentId,
      amount: Number(x.Amount),
      reason: x.Reason,
      createdAt: x.CreatedAt,
      createdBy: x.CreatedBy,
      approvedBy: x.ApprovedBy,
    })),
  };
}
