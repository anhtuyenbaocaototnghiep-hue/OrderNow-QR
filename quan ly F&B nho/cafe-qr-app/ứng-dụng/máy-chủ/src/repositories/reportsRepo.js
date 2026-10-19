// Báo cáo doanh thu (FEATURE-012) theo ngày thanh toán quy đổi UTC+7 (ADR-003).
// ADR-005: doanh thu = số tiền thực thu (Payments.AmountDue, đã trừ khuyến mãi/hội viên/giảm tay) − hoàn tiền (theo ngày hoàn).
// Không có giảm giá thì bằng Σ TotalAmount của đơn đã thu như trước.
import { query, sql } from '../db.js';

const ORDER_FILTER = `o.PaymentStatus = 'PAID' AND o.Status NOT IN ('CANCELLED', 'VOIDED') AND o.PaidAt >= @f AND o.PaidAt < @t`;
const VN_DAY = (col) => `CONVERT(CHAR(10), DATEADD(HOUR, 7, ${col}), 23)`;

export async function revenue(fromUtc, toUtc, { byHour = false } = {}) {
  const p = { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] };
  const [totals, payDays, refundDays, orderDays, top, staff, hours] = await Promise.all([
    query(
      `SELECT (SELECT COUNT(*) FROM dbo.Orders o WHERE ${ORDER_FILTER}) AS OrderCount,
              (SELECT ISNULL(SUM(AmountDue), 0) FROM dbo.Payments WHERE PaidAt >= @f AND PaidAt < @t) AS Collected,
              (SELECT ISNULL(SUM(Amount), 0) FROM dbo.Refunds WHERE CreatedAt >= @f AND CreatedAt < @t) AS Refunded`,
      p,
    ),
    query(`SELECT ${VN_DAY('PaidAt')} AS D, SUM(AmountDue) AS Amount FROM dbo.Payments WHERE PaidAt >= @f AND PaidAt < @t GROUP BY ${VN_DAY('PaidAt')}`, p),
    query(
      `SELECT ${VN_DAY('CreatedAt')} AS D, SUM(Amount) AS Amount FROM dbo.Refunds WHERE CreatedAt >= @f AND CreatedAt < @t GROUP BY ${VN_DAY('CreatedAt')}`,
      p,
    ),
    query(`SELECT ${VN_DAY('o.PaidAt')} AS D, COUNT(*) AS Orders FROM dbo.Orders o WHERE ${ORDER_FILTER} GROUP BY ${VN_DAY('o.PaidAt')}`, p),
    query(
      `SELECT TOP 10 oi.MenuItemId, m.Name, SUM(oi.Quantity) AS Qty, SUM(oi.Quantity * oi.UnitPrice) AS Revenue
       FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId JOIN dbo.MenuItems m ON m.MenuItemId = oi.MenuItemId
       WHERE ${ORDER_FILTER} AND oi.ParentOrderItemId IS NULL GROUP BY oi.MenuItemId, m.Name ORDER BY Qty DESC, Revenue DESC`,
      p,
    ),
    query(
      `SELECT p.ReceivedBy, u.FullName, COUNT(*) AS Payments, SUM(p.AmountDue) AS Amount
       FROM dbo.Payments p JOIN dbo.Users u ON u.UserId = p.ReceivedBy
       WHERE p.PaidAt >= @f AND p.PaidAt < @t GROUP BY p.ReceivedBy, u.FullName ORDER BY Amount DESC`,
      p,
    ),
    byHour
      ? query(
          `SELECT x.H, SUM(x.Orders) AS Orders, SUM(x.Amount) AS Revenue FROM (
             SELECT DATEPART(HOUR, DATEADD(HOUR, 7, o.PaidAt)) AS H, COUNT(*) AS Orders, 0 AS Amount FROM dbo.Orders o WHERE ${ORDER_FILTER}
             GROUP BY DATEPART(HOUR, DATEADD(HOUR, 7, o.PaidAt))
             UNION ALL
             SELECT DATEPART(HOUR, DATEADD(HOUR, 7, PaidAt)), 0, SUM(AmountDue) FROM dbo.Payments WHERE PaidAt >= @f AND PaidAt < @t
             GROUP BY DATEPART(HOUR, DATEADD(HOUR, 7, PaidAt))
             UNION ALL
             SELECT DATEPART(HOUR, DATEADD(HOUR, 7, CreatedAt)), 0, -SUM(Amount) FROM dbo.Refunds WHERE CreatedAt >= @f AND CreatedAt < @t
             GROUP BY DATEPART(HOUR, DATEADD(HOUR, 7, CreatedAt))) x
           GROUP BY x.H ORDER BY x.H`,
          p,
        )
      : null,
  ]);
  const days = new Map();
  const day = (d) => days.get(d) ?? days.set(d, { date: d, revenue: 0, orders: 0 }).get(d);
  for (const x of payDays.recordset) day(x.D).revenue += Number(x.Amount);
  for (const x of refundDays.recordset) day(x.D).revenue -= Number(x.Amount);
  for (const x of orderDays.recordset) day(x.D).orders += x.Orders;
  const t = totals.recordset[0];
  return {
    totalRevenue: Number(t.Collected) - Number(t.Refunded),
    refunded: Number(t.Refunded),
    orderCount: t.OrderCount,
    byDay: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byHour: hours ? hours.recordset.map((x) => ({ hour: x.H, revenue: Number(x.Revenue), orders: x.Orders })) : null,
    topItems: top.recordset.map((x) => ({ menuItemId: x.MenuItemId, name: x.Name, qty: x.Qty, revenue: x.Revenue })),
    byStaff: staff.recordset.map((x) => ({ userId: x.ReceivedBy, fullName: x.FullName, payments: x.Payments, amount: x.Amount })),
  };
}

export async function payments(fromUtc, toUtc) {
  const r = await query(
    `SELECT p.PaymentId, p.SessionId, p.OrderId, p.AmountDue, p.AmountReceived, p.ChangeGiven, p.PaidAt, u.FullName,
            COALESCE(ts.Name, N'Mang đi') AS Target, o.OrderCode, p.SubtotalAmount, p.PromoDiscount, p.MemberDiscount, p.ManualDiscount,
            p.ManualReason, p.RoundingAdj, mem.FullName AS MemberName,
            ISNULL((SELECT SUM(rf.Amount) FROM dbo.Refunds rf WHERE rf.PaymentId = p.PaymentId), 0) AS Refunded
     FROM dbo.Payments p
     JOIN dbo.Users u ON u.UserId = p.ReceivedBy
     LEFT JOIN dbo.Sessions s ON s.SessionId = p.SessionId
     LEFT JOIN dbo.Tables ts ON ts.TableId = s.TableId
     LEFT JOIN dbo.Orders o ON o.OrderId = p.OrderId
     LEFT JOIN dbo.Members mem ON mem.MemberId = p.MemberId
     WHERE p.PaidAt >= @f AND p.PaidAt < @t ORDER BY p.PaidAt DESC`,
    { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] },
  );
  return r.recordset.map((x) => ({
    paymentId: x.PaymentId,
    sessionId: x.SessionId ? x.SessionId.toLowerCase() : null,
    orderId: x.OrderId,
    orderCode: x.OrderCode,
    target: x.Target,
    amountDue: x.AmountDue,
    amountReceived: x.AmountReceived,
    changeGiven: x.ChangeGiven,
    paidAt: x.PaidAt,
    receivedBy: x.FullName,
    discount: Number(x.PromoDiscount ?? 0) + Number(x.MemberDiscount ?? 0) + Number(x.ManualDiscount ?? 0) + Number(x.RoundingAdj ?? 0),
    manualReason: x.ManualReason,
    member: x.MemberName,
    refunded: Number(x.Refunded),
  }));
}

/** Báo cáo Marketing & Khách hàng (ADR-005): hội viên mới, hội viên vs khách lẻ, quay lại 30 ngày, chiết khấu theo loại, top khuyến mãi, giảm tay. */
export async function marketing(fromUtc, toUtc, windowStartUtc) {
  const p = { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] };
  const [newMembers, split, ret, disc, promos, manual] = await Promise.all([
    query(
      `SELECT ${VN_DAY('CreatedAt')} AS D, COUNT(*) AS N FROM dbo.Members WHERE CreatedAt >= @f AND CreatedAt < @t GROUP BY ${VN_DAY('CreatedAt')} ORDER BY D`,
      p,
    ),
    query(
      `SELECT CASE WHEN MemberId IS NULL THEN 'WALKIN' ELSE 'MEMBER' END AS K, COUNT(*) AS Payments, ISNULL(SUM(AmountDue), 0) AS Amount
       FROM dbo.Payments WHERE PaidAt >= @f AND PaidAt < @t GROUP BY CASE WHEN MemberId IS NULL THEN 'WALKIN' ELSE 'MEMBER' END`,
      p,
    ),
    query(
      `SELECT COUNT(*) AS Active, SUM(CASE WHEN n >= 2 THEN 1 ELSE 0 END) AS Returning
       FROM (SELECT MemberId, COUNT(*) AS n FROM dbo.Payments WHERE MemberId IS NOT NULL AND PaidAt >= @w AND PaidAt < @t GROUP BY MemberId) x`,
      { ...p, w: [sql.DateTime2(0), windowStartUtc] },
    ),
    query(
      `SELECT ISNULL(SUM(PromoDiscount), 0) AS Promo, ISNULL(SUM(MemberDiscount), 0) AS Member, ISNULL(SUM(ManualDiscount), 0) AS Manual,
              ISNULL(SUM(RoundingAdj), 0) AS Rounding,
              (SELECT ISNULL(SUM(Amount), 0) FROM dbo.Refunds WHERE CreatedAt >= @f AND CreatedAt < @t) AS Refunds
       FROM dbo.Payments WHERE PaidAt >= @f AND PaidAt < @t`,
      p,
    ),
    query(
      `SELECT TOP 10 pr.PromotionId, pr.Name, pr.Type, COUNT(DISTINCT u.OrderId) AS Uses, SUM(u.DiscountAmount) AS Discount
       FROM dbo.PromotionUsages u JOIN dbo.Promotions pr ON pr.PromotionId = u.PromotionId JOIN dbo.Orders o ON o.OrderId = u.OrderId
       WHERE u.UsedAt >= @f AND u.UsedAt < @t AND o.Status NOT IN ('CANCELLED', 'VOIDED')
       GROUP BY pr.PromotionId, pr.Name, pr.Type ORDER BY Discount DESC`,
      p,
    ),
    query(
      `SELECT ${VN_DAY('p.PaidAt')} AS D, u.FullName, COUNT(*) AS N, SUM(p.ManualDiscount) AS Amount, ap.FullName AS ApprovedBy
       FROM dbo.Payments p JOIN dbo.Users u ON u.UserId = p.ReceivedBy LEFT JOIN dbo.Users ap ON ap.UserId = p.ApprovedBy
       WHERE p.PaidAt >= @f AND p.PaidAt < @t AND p.ManualDiscount > 0
       GROUP BY ${VN_DAY('p.PaidAt')}, u.FullName, ap.FullName ORDER BY D DESC, Amount DESC`,
      p,
    ),
  ]);
  const s = Object.fromEntries(split.recordset.map((x) => [x.K, { payments: x.Payments, amount: Number(x.Amount) }]));
  const d = disc.recordset[0];
  const rr = ret.recordset[0];
  return {
    newMembers: newMembers.recordset.map((x) => ({ date: x.D, count: x.N })),
    newMemberTotal: newMembers.recordset.reduce((sum, x) => sum + x.N, 0),
    memberVsWalkin: { member: s.MEMBER ?? { payments: 0, amount: 0 }, walkin: s.WALKIN ?? { payments: 0, amount: 0 } },
    return30: { activeMembers: rr.Active ?? 0, returning: rr.Returning ?? 0, rate: rr.Active ? Math.round((1000 * rr.Returning) / rr.Active) / 10 : 0 },
    discounts: { promo: Number(d.Promo), member: Number(d.Member), manual: Number(d.Manual), rounding: Number(d.Rounding), refunds: Number(d.Refunds) },
    topPromotions: promos.recordset.map((x) => ({ promotionId: x.PromotionId, name: x.Name, type: x.Type, uses: x.Uses, discount: Number(x.Discount) })),
    manualByStaff: manual.recordset.map((x) => ({ date: x.D, fullName: x.FullName, count: x.N, amount: Number(x.Amount), approvedBy: x.ApprovedBy })),
  };
}
