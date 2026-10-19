// FEATURE-045 (skill F-024): đơn đã thu của hội viên (lần trước) + món yêu thích (♥ và hay gọi).
import { query, sql } from '../db.js';

/** Đơn đã thu gần nhất của hội viên (dine-in qua phiên, mang đi qua đơn), không gồm đơn hủy/hoàn. */
export async function recentOrderIds(memberId, limit = 3) {
  const r = await query(
    `SELECT TOP (@n) o.OrderId
     FROM dbo.Orders o
     WHERE o.PaymentStatus = 'PAID' AND o.Status NOT IN ('CANCELLED', 'VOIDED')
       AND EXISTS (SELECT 1 FROM dbo.Payments p WHERE p.MemberId = @m AND ((p.SessionId IS NOT NULL AND p.SessionId = o.SessionId) OR p.OrderId = o.OrderId))
     ORDER BY o.PaidAt DESC, o.OrderId DESC`,
    { m: [sql.Int, memberId], n: [sql.Int, limit] },
  );
  return r.recordset.map((x) => x.OrderId);
}

/** Hội viên đã trả đơn này? (gọi lại đơn chỉ được với đơn của chính hội viên). */
export async function orderBelongsToMember(orderId, memberId) {
  const r = await query(
    `SELECT 1 AS ok FROM dbo.Orders o
     WHERE o.OrderId = @o AND o.PaymentStatus = 'PAID'
       AND EXISTS (SELECT 1 FROM dbo.Payments p WHERE p.MemberId = @m AND ((p.SessionId IS NOT NULL AND p.SessionId = o.SessionId) OR p.OrderId = o.OrderId))`,
    { o: [sql.Int, orderId], m: [sql.Int, memberId] },
  );
  return r.recordset.length > 0;
}

/** Hội viên đã thu của một đơn (null nếu không có). */
export async function memberOfOrder(orderId) {
  const r = await query(
    `SELECT TOP 1 p.MemberId FROM dbo.Orders o
     JOIN dbo.Payments p ON (p.SessionId IS NOT NULL AND p.SessionId = o.SessionId) OR p.OrderId = o.OrderId
     WHERE o.OrderId = @o AND p.MemberId IS NOT NULL ORDER BY p.PaidAt DESC`,
    { o: [sql.Int, orderId] },
  );
  return r.recordset[0]?.MemberId ?? null;
}

/** Thiết bị (cf_client) đang ở phiên chưa đóng có gắn hội viên này? — khách chỉ xem dữ liệu hội viên của chính mình. */
export async function clientHasMember(clientToken, memberId) {
  if (!clientToken) return false;
  const r = await query(
    `SELECT 1 AS ok FROM dbo.SessionClients c JOIN dbo.Sessions s ON s.SessionId = c.SessionId
     WHERE c.ClientToken = @c AND s.MemberId = @m AND s.Status <> 'CLOSED'`,
    { c: [sql.Char(32), clientToken], m: [sql.Int, memberId] },
  );
  return r.recordset.length > 0;
}

export async function favoriteIds(memberId) {
  const r = await query('SELECT MenuItemId FROM dbo.MemberFavorites WHERE MemberId = @m ORDER BY CreatedAt', { m: [sql.Int, memberId] });
  return r.recordset.map((x) => x.MenuItemId);
}

/** Top món hội viên mua nhiều nhất (đơn đã thu; dòng khách chọn, món/combo chưa xóa). */
export async function topItems(memberId, n = 5) {
  const r = await query(
    `SELECT TOP (@n) oi.MenuItemId, SUM(oi.Quantity) AS Qty
     FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId JOIN dbo.MenuItems m ON m.MenuItemId = oi.MenuItemId
     WHERE oi.ParentOrderItemId IS NULL AND o.PaymentStatus = 'PAID' AND o.Status NOT IN ('CANCELLED', 'VOIDED') AND m.DeletedAt IS NULL
       AND EXISTS (SELECT 1 FROM dbo.Payments p WHERE p.MemberId = @m AND ((p.SessionId IS NOT NULL AND p.SessionId = o.SessionId) OR p.OrderId = o.OrderId))
     GROUP BY oi.MenuItemId ORDER BY SUM(oi.Quantity) DESC, oi.MenuItemId`,
    { m: [sql.Int, memberId], n: [sql.Int, n] },
  );
  return r.recordset.map((x) => ({ menuItemId: x.MenuItemId, quantity: x.Qty }));
}

export async function addFavorite(memberId, menuItemId) {
  await query(
    `IF NOT EXISTS (SELECT 1 FROM dbo.MemberFavorites WHERE MemberId = @m AND MenuItemId = @i)
       INSERT dbo.MemberFavorites (MemberId, MenuItemId) VALUES (@m, @i)`,
    { m: [sql.Int, memberId], i: [sql.Int, menuItemId] },
  );
}

export async function removeFavorite(memberId, menuItemId) {
  await query('DELETE dbo.MemberFavorites WHERE MemberId = @m AND MenuItemId = @i', { m: [sql.Int, memberId], i: [sql.Int, menuItemId] });
}
