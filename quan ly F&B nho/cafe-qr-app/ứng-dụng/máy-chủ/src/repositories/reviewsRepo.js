// Đánh giá sau khi dùng món (FEATURE-051, ADR-010 D-46…D-48): mỗi điện thoại một đánh giá / phiên (duy nhất SessionId + ClientToken),
// sao 1–5 từng món + góp ý; có món ≤ 2 sao → HasLow (báo quầy, nhân viên bấm Đã xử lý).
import { inTransaction, query, sql, txQuery } from '../db.js';

/** Món nhóm đã gọi (dòng cấp trên, đơn không hủy, còn số lượng) — phạm vi được chấm sao. */
export async function sessionItems(sessionId) {
  const r = await query(
    `SELECT DISTINCT oi.MenuItemId, m.Name
     FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId JOIN dbo.MenuItems m ON m.MenuItemId = oi.MenuItemId
     WHERE o.SessionId = @s AND o.Status NOT IN ('CANCELLED', 'VOIDED') AND oi.ParentOrderItemId IS NULL AND oi.Quantity > 0
     ORDER BY m.Name`,
    { s: [sql.UniqueIdentifier, sessionId] },
  );
  return r.recordset.map((x) => ({ menuItemId: x.MenuItemId, name: x.Name }));
}

/** Số đánh giá (số điện thoại) đã gửi cho phiên — giới hạn mỗi nhóm (review G3). */
export async function countForSession(sessionId) {
  const r = await query('SELECT COUNT(*) AS n FROM dbo.Reviews WHERE SessionId = @s', { s: [sql.UniqueIdentifier, sessionId] });
  return r.recordset[0].n;
}

/** Nhóm đã có đánh giá thấp chưa xử lý (để chỉ rung chuông một lần / nhóm). */
export async function hasOpenLow(sessionId, exceptId) {
  const r = await query('SELECT TOP 1 1 AS x FROM dbo.Reviews WHERE SessionId = @s AND HasLow = 1 AND HandledAt IS NULL AND ReviewId <> @id', {
    s: [sql.UniqueIdentifier, sessionId],
    id: [sql.Int, exceptId],
  });
  return r.recordset.length > 0;
}

export async function findBySessionClient(sessionId, clientToken) {
  const r = await query('SELECT ReviewId FROM dbo.Reviews WHERE SessionId = @s AND ClientToken = @c', {
    s: [sql.UniqueIdentifier, sessionId],
    c: [sql.Char(32), clientToken],
  });
  return r.recordset[0]?.ReviewId ?? null;
}

/** Ghi đánh giá + các dòng sao trong một transaction. Trùng (SessionId, ClientToken) → lỗi SQL 2627 / 2601 (service đổi thành 409). */
export async function create({ sessionId, clientToken, comment, items, hasLow }) {
  return inTransaction(async (tx) => {
    const r = await txQuery(tx, 'INSERT dbo.Reviews (SessionId, ClientToken, Comment, HasLow) OUTPUT inserted.ReviewId VALUES (@s, @c, @cm, @low)', {
      s: [sql.UniqueIdentifier, sessionId],
      c: [sql.Char(32), clientToken],
      cm: [sql.NVarChar(300), comment || null],
      low: [sql.Bit, hasLow],
    });
    const id = r.recordset[0].ReviewId;
    for (const it of items) {
      await txQuery(tx, 'INSERT dbo.ReviewItems (ReviewId, MenuItemId, Stars) VALUES (@r, @m, @st)', {
        r: [sql.Int, id],
        m: [sql.Int, it.menuItemId],
        st: [sql.TinyInt, it.stars],
      });
    }
    return id;
  });
}

const REVIEW_SELECT = `
  SELECT r.ReviewId, r.SessionId, r.Comment, r.HasLow, r.CreatedAt, r.HandledAt, hu.FullName AS HandledByName, t.Name AS TableName,
         (SELECT ri.MenuItemId AS menuItemId, m.Name AS name, ri.Stars AS stars
          FROM dbo.ReviewItems ri JOIN dbo.MenuItems m ON m.MenuItemId = ri.MenuItemId
          WHERE ri.ReviewId = r.ReviewId ORDER BY ri.Stars, m.Name FOR JSON PATH) AS ItemsJson
  FROM dbo.Reviews r
  JOIN dbo.Sessions s ON s.SessionId = r.SessionId
  JOIN dbo.Tables t ON t.TableId = s.TableId
  LEFT JOIN dbo.Users hu ON hu.UserId = r.HandledBy`;

const mapReview = (x) => ({
  reviewId: x.ReviewId,
  sessionId: x.SessionId.toLowerCase(),
  table: { name: x.TableName },
  comment: x.Comment,
  hasLow: Boolean(x.HasLow),
  items: x.ItemsJson ? JSON.parse(x.ItemsJson) : [],
  createdAt: x.CreatedAt,
  handledAt: x.HandledAt,
  handledBy: x.HandledByName ?? null,
});

export async function getById(id) {
  const r = await query(`${REVIEW_SELECT} WHERE r.ReviewId = @id`, { id: [sql.Int, id] });
  return r.recordset[0] ? mapReview(r.recordset[0]) : null;
}

/** Đánh giá thấp chưa xử lý từ @since (đầu ngày quán) — dải "Đánh giá thấp" ở quầy. */
export async function openAlerts(sinceUtc) {
  const r = await query(`${REVIEW_SELECT} WHERE r.HasLow = 1 AND r.HandledAt IS NULL AND r.CreatedAt >= @f ORDER BY r.CreatedAt`, {
    f: [sql.DateTime2(0), sinceUtc],
  });
  return r.recordset.map(mapReview);
}

/** Đã xử lý → true; đã xử lý trước đó / không phải đánh giá thấp → false. */
export async function handle(id, userId) {
  const r = await query('UPDATE dbo.Reviews SET HandledBy = @u, HandledAt = SYSUTCDATETIME() WHERE ReviewId = @id AND HasLow = 1 AND HandledAt IS NULL', {
    id: [sql.Int, id],
    u: [sql.Int, userId],
  });
  return r.rowsAffected[0] > 0;
}

/**
 * Sao trung bình theo món từ @since (menu khách — D-48), tính theo NHÓM (phiên): trung bình trong nhóm trước, rồi trung bình các nhóm;
 * số lượt = số nhóm khác nhau. Một người mở nhiều tab / điện thoại trong cùng nhóm không dồn được phiếu (review G3).
 */
export async function ratingsSince(sinceUtc) {
  const r = await query(
    `WITH g AS (SELECT r.SessionId, ri.MenuItemId, AVG(CAST(ri.Stars AS DECIMAL(6,3))) AS A
                FROM dbo.ReviewItems ri JOIN dbo.Reviews r ON r.ReviewId = ri.ReviewId
                WHERE r.CreatedAt >= @f GROUP BY r.SessionId, ri.MenuItemId)
     SELECT MenuItemId, COUNT(*) AS Cnt, AVG(A) AS Avg FROM g GROUP BY MenuItemId`,
    { f: [sql.DateTime2(0), sinceUtc] },
  );
  return new Map(r.recordset.map((x) => [x.MenuItemId, { count: x.Cnt, avg: Number(x.Avg) }]));
}

/** Báo cáo quản lý: theo món (lượt, trung bình, phân bố 1–5) + danh sách đánh giá trong khoảng. */
export async function report(fromUtc, toUtc) {
  const p = { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] };
  const [items, reviews] = await Promise.all([
    query(
      `SELECT ri.MenuItemId, m.Name, COUNT(*) AS Cnt, AVG(CAST(ri.Stars AS DECIMAL(6,3))) AS Avg,
              SUM(CASE WHEN ri.Stars = 1 THEN 1 ELSE 0 END) AS S1, SUM(CASE WHEN ri.Stars = 2 THEN 1 ELSE 0 END) AS S2,
              SUM(CASE WHEN ri.Stars = 3 THEN 1 ELSE 0 END) AS S3, SUM(CASE WHEN ri.Stars = 4 THEN 1 ELSE 0 END) AS S4,
              SUM(CASE WHEN ri.Stars = 5 THEN 1 ELSE 0 END) AS S5
       FROM dbo.ReviewItems ri JOIN dbo.Reviews r ON r.ReviewId = ri.ReviewId JOIN dbo.MenuItems m ON m.MenuItemId = ri.MenuItemId
       WHERE r.CreatedAt >= @f AND r.CreatedAt < @t
       GROUP BY ri.MenuItemId, m.Name ORDER BY Avg, Cnt DESC, m.Name`,
      p,
    ),
    query(`${REVIEW_SELECT} WHERE r.CreatedAt >= @f AND r.CreatedAt < @t ORDER BY r.CreatedAt DESC`, p),
  ]);
  return {
    items: items.recordset.map((x) => ({
      menuItemId: x.MenuItemId,
      name: x.Name,
      count: x.Cnt,
      avg: Math.round(Number(x.Avg) * 10) / 10,
      dist: [x.S1, x.S2, x.S3, x.S4, x.S5],
    })),
    reviews: reviews.recordset.map(mapReview),
  };
}
