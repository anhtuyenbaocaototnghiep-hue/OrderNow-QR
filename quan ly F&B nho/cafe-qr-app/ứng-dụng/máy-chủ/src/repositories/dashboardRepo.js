// Dashboard chủ quán (FEATURE-043, ADR-006 D-32): bảng tổng hợp ngày + các đếm nhẹ cho "việc cần làm".
import { query, sql } from '../db.js';

const range = (fromUtc, toUtc) => ({ f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] });

/** Số liệu thô của một ngày (giờ VN) — ngoài phần doanh thu / giá vốn (pnlRepo.daily). */
export async function dayFacts(fromUtc, toUtc) {
  const p = range(fromUtc, toUtc);
  const [c, top, shifts] = await Promise.all([
    query(
      `SELECT (SELECT COUNT(*) FROM dbo.Orders WHERE PaymentStatus = 'PAID' AND Status <> 'CANCELLED' AND PaidAt >= @f AND PaidAt < @t) AS Orders,
              (SELECT COUNT(*) FROM dbo.Members WHERE CreatedAt >= @f AND CreatedAt < @t) AS NewMembers,
              (SELECT COUNT(*) FROM dbo.Vouchers WHERE UsedAt >= @f AND UsedAt < @t) AS VouchersUsed`,
      p,
    ),
    query(
      `SELECT TOP 3 oi.MenuItemId, m.Name, SUM(oi.Quantity) AS Qty
       FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId JOIN dbo.MenuItems m ON m.MenuItemId = oi.MenuItemId
       WHERE oi.ParentOrderItemId IS NULL AND o.Status IN ('PREPARING', 'COMPLETED') AND o.PaymentStatus = 'PAID' AND o.PaidAt >= @f AND o.PaidAt < @t
       GROUP BY oi.MenuItemId, m.Name ORDER BY SUM(oi.Quantity) DESC, m.Name`,
      p,
    ),
    query('SELECT COUNT(*) AS N, SUM(Difference) AS Diff FROM dbo.Shifts WHERE ClosedAt >= @f AND ClosedAt < @t', p),
  ]);
  return {
    orders: c.recordset[0].Orders,
    newMembers: c.recordset[0].NewMembers,
    vouchersUsed: c.recordset[0].VouchersUsed,
    topItems: top.recordset.map((x) => ({ menuItemId: x.MenuItemId, name: x.Name, qty: x.Qty })),
    shiftCount: shifts.recordset[0].N,
    cashVariance: shifts.recordset[0].N ? Number(shifts.recordset[0].Diff ?? 0) : null,
  };
}

export async function upsert(date, s) {
  await query(
    `MERGE dbo.DailySummaries WITH (HOLDLOCK) AS d
     USING (SELECT @d AS SummaryDate) AS src ON d.SummaryDate = src.SummaryDate
     WHEN MATCHED THEN UPDATE SET RevenueNet = @rev, PaymentCount = @pc, OrderCount = @oc, AvgBill = @avg, Cogs = @cogs, GrossProfit = @gp,
       CashVariance = @cv, ShiftCount = @sc, NewMembers = @nm, VouchersUsed = @vu, TopItemsJson = @top, LowStockJson = @low,
       ExpiringJson = @exp, PendingApprovals = @pend, ComputedAt = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (SummaryDate, RevenueNet, PaymentCount, OrderCount, AvgBill, Cogs, GrossProfit, CashVariance, ShiftCount,
       NewMembers, VouchersUsed, TopItemsJson, LowStockJson, ExpiringJson, PendingApprovals)
       VALUES (@d, @rev, @pc, @oc, @avg, @cogs, @gp, @cv, @sc, @nm, @vu, @top, @low, @exp, @pend);`,
    {
      d: [sql.Date, date],
      rev: [sql.Decimal(14, 0), s.revenueNet],
      pc: [sql.Int, s.paymentCount],
      oc: [sql.Int, s.orderCount],
      avg: [sql.Decimal(12, 0), s.avgBill],
      cogs: [sql.Decimal(14, 0), s.cogs],
      gp: [sql.Decimal(14, 0), s.grossProfit],
      cv: [sql.Decimal(12, 0), s.cashVariance],
      sc: [sql.Int, s.shiftCount],
      nm: [sql.Int, s.newMembers],
      vu: [sql.Int, s.vouchersUsed],
      top: [sql.NVarChar(sql.MAX), JSON.stringify(s.topItems)],
      low: [sql.NVarChar(sql.MAX), JSON.stringify(s.lowStock)],
      exp: [sql.NVarChar(sql.MAX), JSON.stringify(s.expiring)],
      pend: [sql.Int, s.pendingApprovals],
    },
  );
}

const map = (r) => ({
  date: r.SummaryDate instanceof Date ? r.SummaryDate.toISOString().slice(0, 10) : r.SummaryDate,
  revenueNet: Number(r.RevenueNet),
  paymentCount: r.PaymentCount,
  orderCount: r.OrderCount,
  avgBill: Number(r.AvgBill),
  cogs: Number(r.Cogs),
  grossProfit: Number(r.GrossProfit),
  cashVariance: r.CashVariance === null ? null : Number(r.CashVariance),
  shiftCount: r.ShiftCount,
  newMembers: r.NewMembers,
  vouchersUsed: r.VouchersUsed,
  topItems: JSON.parse(r.TopItemsJson ?? '[]'),
  lowStock: JSON.parse(r.LowStockJson ?? '[]'),
  expiring: JSON.parse(r.ExpiringJson ?? '[]'),
  pendingApprovals: r.PendingApprovals,
  computedAt: r.ComputedAt,
});

export async function get(date) {
  const r = await query('SELECT * FROM dbo.DailySummaries WHERE SummaryDate = @d', { d: [sql.Date, date] });
  return r.recordset[0] ? map(r.recordset[0]) : null;
}

/** "Việc cần làm" (đếm trực tiếp — nhẹ): chi quỹ chờ duyệt, PO đến hạn nhận, lô hết hạn còn hàng, lần chốt kiểm kê gần nhất. */
export async function todos(today) {
  const r = await query(
    `SELECT (SELECT COUNT(*) FROM dbo.CashTransactions WHERE Status = 'PENDING') AS PendingCash,
            (SELECT ISNULL(SUM(Amount), 0) FROM dbo.CashTransactions WHERE Status = 'PENDING') AS PendingCashAmount,
            (SELECT COUNT(*) FROM dbo.PurchaseOrders WHERE Status IN ('SENT', 'PARTIAL') AND ExpectedDate <= @today) AS PosDue,
            (SELECT COUNT(*) FROM dbo.IngredientLots WHERE IsClosed = 0 AND Qty > 0 AND ExpiryDate < @today) AS ExpiredLots,
            (SELECT MAX(PostedAt) FROM dbo.Stocktakes WHERE Status = 'POSTED') AS LastStocktake`,
    { today: [sql.Date, today] },
  );
  const x = r.recordset[0];
  return {
    pendingCash: x.PendingCash,
    pendingCashAmount: Number(x.PendingCashAmount),
    posDue: x.PosDue,
    expiredLots: x.ExpiredLots,
    lastStocktakeAt: x.LastStocktake,
  };
}

/** Ca đóng gần nhất (lệch két). */
export async function lastClosedShift() {
  const r = await query(
    'SELECT TOP 1 ShiftId, ClosedAt, Difference, CountedCash, ExpectedCash FROM dbo.Shifts WHERE ClosedAt IS NOT NULL ORDER BY ClosedAt DESC',
  );
  const x = r.recordset[0];
  return x
    ? { shiftId: x.ShiftId, closedAt: x.ClosedAt, difference: Number(x.Difference), expectedCash: Number(x.ExpectedCash), countedCash: Number(x.CountedCash) }
    : null;
}
