// Số liệu phân tích giai đoạn 8 (ADR-006): menu engineering (F-041), giờ cao điểm / doanh thu ngày / bàn (F-042). Ngày theo giờ VN.
import { query, sql } from '../db.js';

const VN_DAY = (col) => `CONVERT(CHAR(10), DATEADD(HOUR, 7, ${col}), 23)`;
const VN_HOUR = (col) => `DATEPART(HOUR, DATEADD(HOUR, 7, ${col}))`;
const range = (fromUtc, toUtc) => ({ f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] });

/**
 * Theo món (dòng khách chọn — combo tính là một món, không tính thành phần) của đơn đã hoàn tất trong kỳ:
 * số lượng, doanh thu dòng (SL × đơn giá đã gồm khuyến mãi dòng + tùy chọn), giá vốn đã chốt (F-031);
 * dòng chưa có giá vốn → ước tính theo định lượng × giá vốn bình quân hiện tại (đếm EstimatedQty).
 */
export async function menuItems(fromUtc, toUtc) {
  const r = await query(
    `WITH x AS (
       SELECT oi.MenuItemId, SUM(oi.Quantity) AS Qty, SUM(oi.Quantity * oi.UnitPrice) AS Revenue,
              ISNULL(SUM(oi.CogsAmount), 0) AS KnownCogs, SUM(CASE WHEN oi.CogsAmount IS NULL THEN oi.Quantity ELSE 0 END) AS UnknownQty
       FROM dbo.OrderItems oi
       JOIN dbo.Orders o ON o.OrderId = oi.OrderId AND o.Status = 'COMPLETED' AND o.CompletedAt >= @f AND o.CompletedAt < @t
       WHERE oi.ParentOrderItemId IS NULL
       GROUP BY oi.MenuItemId)
     SELECT x.*, m.Name, m.ItemType, m.CategoryId, c.Name AS CategoryName, m.DeletedAt,
            COALESCE(bc.UnitCost, cb.UnitCost, 0) AS UnitCost
     FROM x
     JOIN dbo.MenuItems m ON m.MenuItemId = x.MenuItemId
     LEFT JOIN dbo.Categories c ON c.CategoryId = m.CategoryId
     OUTER APPLY (SELECT SUM(b.Amount * i.AvgCost) AS UnitCost FROM dbo.BomItems b JOIN dbo.Ingredients i ON i.IngredientId = b.IngredientId
                  WHERE b.MenuItemId = x.MenuItemId) bc
     OUTER APPLY (SELECT SUM(cc.Quantity * b.Amount * i.AvgCost) AS UnitCost FROM dbo.ComboComponents cc
                  JOIN dbo.BomItems b ON b.MenuItemId = cc.ComponentMenuItemId JOIN dbo.Ingredients i ON i.IngredientId = b.IngredientId
                  WHERE cc.ComboMenuItemId = x.MenuItemId) cb`,
    range(fromUtc, toUtc),
  );
  return r.recordset.map((x) => ({
    menuItemId: x.MenuItemId,
    name: x.Name,
    itemType: x.ItemType,
    categoryId: x.CategoryId,
    categoryName: x.CategoryName,
    archived: Boolean(x.DeletedAt),
    qty: x.Qty,
    revenue: Number(x.Revenue),
    cogs: Math.round(Number(x.KnownCogs) + x.UnknownQty * Number(x.UnitCost)),
    estimatedQty: x.UnknownQty,
  }));
}

/** Theo ngày × giờ (giờ VN): số đơn (đơn tạo, không tính đơn hủy) hoặc doanh thu (số phải thu theo giờ thu tiền). */
export async function hourly(fromUtc, toUtc, metric) {
  const r =
    metric === 'revenue'
      ? await query(
          `SELECT ${VN_DAY('PaidAt')} AS D, ${VN_HOUR('PaidAt')} AS H, SUM(AmountDue) AS V FROM dbo.Payments
           WHERE PaidAt >= @f AND PaidAt < @t GROUP BY ${VN_DAY('PaidAt')}, ${VN_HOUR('PaidAt')}`,
          range(fromUtc, toUtc),
        )
      : await query(
          `SELECT ${VN_DAY('CreatedAt')} AS D, ${VN_HOUR('CreatedAt')} AS H, COUNT(*) AS V FROM dbo.Orders
           WHERE CreatedAt >= @f AND CreatedAt < @t AND Status <> 'CANCELLED' GROUP BY ${VN_DAY('CreatedAt')}, ${VN_HOUR('CreatedAt')}`,
          range(fromUtc, toUtc),
        );
  return r.recordset.map((x) => ({ date: x.D, hour: x.H, value: Number(x.V) }));
}

/** Doanh thu thuần theo ngày (thu − hoàn) + ngày có lượt thu đầu tiên của quán (trước đó coi như chưa mở bán). */
export async function dailyNet(fromUtc, toUtc) {
  const [pay, ref, first] = await Promise.all([
    query(
      `SELECT ${VN_DAY('PaidAt')} AS D, SUM(AmountDue) AS V FROM dbo.Payments WHERE PaidAt >= @f AND PaidAt < @t GROUP BY ${VN_DAY('PaidAt')}`,
      range(fromUtc, toUtc),
    ),
    query(
      `SELECT ${VN_DAY('CreatedAt')} AS D, SUM(Amount) AS V FROM dbo.Refunds WHERE CreatedAt >= @f AND CreatedAt < @t GROUP BY ${VN_DAY('CreatedAt')}`,
      range(fromUtc, toUtc),
    ),
    query(`SELECT ${VN_DAY('MIN(PaidAt)')} AS D FROM dbo.Payments`),
  ]);
  const map = new Map();
  for (const x of pay.recordset) map.set(x.D, Number(x.V));
  for (const x of ref.recordset) map.set(x.D, (map.get(x.D) ?? 0) - Number(x.V));
  return { byDay: map, firstDay: first.recordset[0]?.D ?? null };
}

/** Số đơn đã thu + hội viên mới trong khoảng (so sánh kỳ). */
export async function counts(fromUtc, toUtc) {
  const r = await query(
    `SELECT (SELECT COUNT(*) FROM dbo.Orders WHERE PaymentStatus = 'PAID' AND Status <> 'CANCELLED' AND PaidAt >= @f AND PaidAt < @t) AS Orders,
            (SELECT COUNT(*) FROM dbo.Members WHERE CreatedAt >= @f AND CreatedAt < @t) AS NewMembers`,
    range(fromUtc, toUtc),
  );
  return { orders: r.recordset[0].Orders, newMembers: r.recordset[0].NewMembers };
}

/** Theo bàn: phiên đã đóng có thu tiền trong kỳ — số phiên, phút ngồi (mở → đóng), doanh thu thuần của phiên. */
export async function tables(fromUtc, toUtc) {
  const r = await query(
    `SELECT t.TableId, t.Code, t.Name, COUNT(s.SessionId) AS Sessions,
            ISNULL(SUM(DATEDIFF(MINUTE, s.OpenedAt, s.ClosedAt)), 0) AS Minutes, ISNULL(SUM(pay.Amount), 0) AS Revenue
     FROM dbo.Tables t
     LEFT JOIN dbo.Sessions s ON s.TableId = t.TableId AND s.Status = 'CLOSED' AND s.ClosedAt >= @f AND s.ClosedAt < @t
       AND EXISTS (SELECT 1 FROM dbo.Payments p WHERE p.SessionId = s.SessionId)
     OUTER APPLY (SELECT SUM(p.AmountDue) - ISNULL((SELECT SUM(rf.Amount) FROM dbo.Refunds rf JOIN dbo.Payments p2 ON p2.PaymentId = rf.PaymentId
                                                    WHERE p2.SessionId = s.SessionId), 0) AS Amount
                  FROM dbo.Payments p WHERE p.SessionId = s.SessionId) pay
     WHERE t.DeletedAt IS NULL OR s.SessionId IS NOT NULL
     GROUP BY t.TableId, t.Code, t.Name
     ORDER BY t.Code`,
    range(fromUtc, toUtc),
  );
  return r.recordset.map((x) => ({ tableId: x.TableId, code: x.Code, name: x.Name, sessions: x.Sessions, minutes: x.Minutes, revenue: Number(x.Revenue) }));
}
