// Báo cáo doanh thu (FEATURE-012): đơn PAID, không CANCELLED, theo ngày thanh toán (PaidAt) quy đổi UTC+7 (ADR-003).
import { query, sql } from '../db.js';

const FILTER = `o.PaymentStatus = 'PAID' AND o.Status <> 'CANCELLED' AND o.PaidAt >= @f AND o.PaidAt < @t`;

export async function revenue(fromUtc, toUtc, { byHour = false } = {}) {
  const p = { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] };
  const [totals, byDay, top, staff, hours] = await Promise.all([
    query(`SELECT COUNT(*) AS OrderCount, ISNULL(SUM(o.TotalAmount), 0) AS Revenue FROM dbo.Orders o WHERE ${FILTER}`, p),
    query(
      `SELECT CONVERT(CHAR(10), DATEADD(HOUR, 7, o.PaidAt), 23) AS D, COUNT(*) AS Orders, SUM(o.TotalAmount) AS Revenue
       FROM dbo.Orders o WHERE ${FILTER} GROUP BY CONVERT(CHAR(10), DATEADD(HOUR, 7, o.PaidAt), 23) ORDER BY D`,
      p,
    ),
    query(
      `SELECT TOP 10 oi.MenuItemId, m.Name, SUM(oi.Quantity) AS Qty, SUM(oi.Quantity * oi.UnitPrice) AS Revenue
       FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId JOIN dbo.MenuItems m ON m.MenuItemId = oi.MenuItemId
       WHERE ${FILTER} GROUP BY oi.MenuItemId, m.Name ORDER BY Qty DESC, Revenue DESC`,
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
          `SELECT DATEPART(HOUR, DATEADD(HOUR, 7, o.PaidAt)) AS H, COUNT(*) AS Orders, SUM(o.TotalAmount) AS Revenue
           FROM dbo.Orders o WHERE ${FILTER} GROUP BY DATEPART(HOUR, DATEADD(HOUR, 7, o.PaidAt)) ORDER BY H`,
          p,
        )
      : null,
  ]);
  return {
    totalRevenue: totals.recordset[0].Revenue,
    orderCount: totals.recordset[0].OrderCount,
    byDay: byDay.recordset.map((x) => ({ date: x.D, revenue: x.Revenue, orders: x.Orders })),
    byHour: hours ? hours.recordset.map((x) => ({ hour: x.H, revenue: x.Revenue, orders: x.Orders })) : null,
    topItems: top.recordset.map((x) => ({ menuItemId: x.MenuItemId, name: x.Name, qty: x.Qty, revenue: x.Revenue })),
    byStaff: staff.recordset.map((x) => ({ userId: x.ReceivedBy, fullName: x.FullName, payments: x.Payments, amount: x.Amount })),
  };
}

export async function payments(fromUtc, toUtc) {
  const r = await query(
    `SELECT p.PaymentId, p.SessionId, p.OrderId, p.AmountDue, p.AmountReceived, p.ChangeGiven, p.PaidAt, u.FullName,
            COALESCE(ts.Name, N'Mang đi') AS Target, o.OrderCode
     FROM dbo.Payments p
     JOIN dbo.Users u ON u.UserId = p.ReceivedBy
     LEFT JOIN dbo.Sessions s ON s.SessionId = p.SessionId
     LEFT JOIN dbo.Tables ts ON ts.TableId = s.TableId
     LEFT JOIN dbo.Orders o ON o.OrderId = p.OrderId
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
  }));
}
