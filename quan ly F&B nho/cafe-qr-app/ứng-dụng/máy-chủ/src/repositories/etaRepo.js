// FEATURE-025 Thời gian chờ: thời gian chuẩn từng món, hàng chờ (đơn PENDING/PREPARING), thống kê thực tế (job 02:00).
import { query, sql } from '../db.js';

/** Món + combo: PrepSeconds quản lý nhập, trung vị thống kê, thành phần combo. */
export async function itemsForEta() {
  const r = await query(`
    SELECT m.MenuItemId, m.Name, m.ItemType, m.PrepSeconds, s.MedianSeconds, s.SampleCount, s.ComputedAt
    FROM dbo.MenuItems m LEFT JOIN dbo.ItemPrepStats s ON s.MenuItemId = m.MenuItemId
    WHERE m.DeletedAt IS NULL;
    SELECT ComboMenuItemId, ComponentMenuItemId, Quantity FROM dbo.ComboComponents;`);
  const [rows, comps] = r.recordsets;
  const items = new Map(
    rows.map((x) => [
      x.MenuItemId,
      {
        menuItemId: x.MenuItemId,
        name: x.Name,
        itemType: x.ItemType,
        prepSeconds: x.PrepSeconds,
        medianSeconds: x.MedianSeconds,
        sampleCount: x.SampleCount ?? 0,
        computedAt: x.ComputedAt,
        components: [],
      },
    ]),
  );
  for (const c of comps) items.get(c.ComboMenuItemId)?.components.push({ menuItemId: c.ComponentMenuItemId, quantity: c.Quantity });
  return items;
}

/**
 * Dòng món đang chờ làm (đơn PENDING/PREPARING) — chỉ món SINGLE (combo tính qua dòng con), kèm thứ tự đơn.
 * [{ orderId, sessionId, createdAt, menuItemId, quantity }]
 */
export async function queueLines() {
  const r = await query(`
    SELECT o.OrderId, o.SessionId, o.CreatedAt, oi.MenuItemId, oi.Quantity
    FROM dbo.Orders o JOIN dbo.OrderItems oi ON oi.OrderId = o.OrderId JOIN dbo.MenuItems m ON m.MenuItemId = oi.MenuItemId
    WHERE o.Status IN ('PENDING', 'PREPARING') AND m.ItemType = 'SINGLE'
      AND NOT (o.HoldMode IS NOT NULL AND o.ReleasedAt IS NULL AND o.HoldUntil > SYSUTCDATETIME()) -- F-066: đơn đang giữ chưa vào hàng chờ
    ORDER BY o.CreatedAt, o.OrderId`);
  return r.recordset.map((x) => ({
    orderId: x.OrderId,
    sessionId: x.SessionId ? x.SessionId.toLowerCase() : null,
    createdAt: x.CreatedAt,
    menuItemId: x.MenuItemId,
    quantity: x.Quantity,
  }));
}

/**
 * Job 02:00: trung vị 30 ngày của (CompletedAt − AcceptedAt) ÷ số dòng món SINGLE của đơn, theo món. Ghi đè ItemPrepStats.
 * Bỏ đơn bất thường (≤ 0 hoặc > 2 giờ). Trả số món có thống kê.
 * F-076 (ADR-034 D-155): đơn nhận + xong cùng lúc (quy trình 1 chạm / "Tiếp nhận & Hoàn tất", cách nhau < 10 giây) không có giờ bắt đầu pha
 *   → thời gian làm = từ lúc có thể bắt đầu (đơn sẵn sàng — tới / hết giữ — hoặc đơn trước vừa xong, lấy cái muộn hơn) tới lúc xong.
 */
export async function recomputePrepStats(days = 30) {
  const r = await query(
    `WITH Base AS (
       SELECT o.OrderId, o.AcceptedAt, o.CompletedAt,
              CASE WHEN o.HoldMode IS NOT NULL THEN COALESCE(o.ReleasedAt, o.HoldUntil, o.CreatedAt) ELSE o.CreatedAt END AS ReadyAt,
              LAG(o.CompletedAt) OVER (ORDER BY o.CompletedAt, o.OrderId) AS PrevDone
       FROM dbo.Orders o
       WHERE o.Status IN ('COMPLETED', 'VOIDED') AND o.AcceptedAt IS NOT NULL AND o.CompletedAt IS NOT NULL
         AND o.SaleSource IS NULL -- F-074: đơn gửi bù không có thời gian pha thật
         AND o.CompletedAt >= DATEADD(DAY, -@days, SYSUTCDATETIME())),
     OrderDur AS (
       SELECT b.OrderId,
              CASE WHEN DATEDIFF(SECOND, b.AcceptedAt, b.CompletedAt) >= 10 THEN DATEDIFF(SECOND, b.AcceptedAt, b.CompletedAt)
                   ELSE DATEDIFF(SECOND, CASE WHEN b.PrevDone > b.ReadyAt THEN b.PrevDone ELSE b.ReadyAt END, b.CompletedAt) END AS Dur,
              (SELECT COUNT(*) FROM dbo.OrderItems x JOIN dbo.MenuItems mx ON mx.MenuItemId = x.MenuItemId
               WHERE x.OrderId = b.OrderId AND mx.ItemType = 'SINGLE') AS Lines
       FROM Base b),
     Samples AS (
       SELECT oi.MenuItemId, CAST(d.Dur AS FLOAT) / d.Lines AS Sec
       FROM OrderDur d JOIN dbo.OrderItems oi ON oi.OrderId = d.OrderId JOIN dbo.MenuItems m ON m.MenuItemId = oi.MenuItemId AND m.ItemType = 'SINGLE'
       WHERE d.Lines > 0 AND d.Dur BETWEEN 1 AND 7200),
     Med AS (
       SELECT DISTINCT MenuItemId,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY Sec) OVER (PARTITION BY MenuItemId) AS MedianSec,
              COUNT(*) OVER (PARTITION BY MenuItemId) AS N
       FROM Samples)
     MERGE dbo.ItemPrepStats AS t
     USING (SELECT MenuItemId, CAST(ROUND(MedianSec, 0) AS INT) AS MedianSeconds, N FROM Med) AS s ON t.MenuItemId = s.MenuItemId
     WHEN MATCHED THEN UPDATE SET MedianSeconds = s.MedianSeconds, SampleCount = s.N, ComputedAt = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (MenuItemId, MedianSeconds, SampleCount, ComputedAt) VALUES (s.MenuItemId, s.MedianSeconds, s.N, SYSUTCDATETIME());
     SELECT COUNT(*) AS N FROM dbo.ItemPrepStats;`,
    { days: [sql.Int, days] },
  );
  return r.recordset[0]?.N ?? 0;
}
