// Khuyến mãi (FEATURE-016): ứng viên đang trong khoảng ngày + lượt đã dùng hôm nay; CRUD quản lý; thống kê.
import { inTransaction, query, sql, txQuery } from '../db.js';

const timeText = (t) => {
  if (!t) return null;
  if (typeof t === 'string') return t.slice(0, 5);
  const d = new Date(t);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const dateText = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

const mapPromotion = (r) => ({
  promotionId: r.PromotionId,
  name: r.Name,
  type: r.Type,
  value: Number(r.Value),
  minOrderAmount: Number(r.MinOrderAmount),
  startDate: dateText(r.StartDate),
  endDate: dateText(r.EndDate),
  daysOfWeekMask: r.DaysOfWeekMask,
  startTime: timeText(r.StartTime),
  endTime: timeText(r.EndTime),
  maxUsesPerDay: r.MaxUsesPerDay,
  stackWithMember: Boolean(r.StackWithMember),
  badgeText: r.BadgeText,
  isActive: Boolean(r.IsActive),
  sortOrder: r.SortOrder,
  usedToday: r.UsedToday ?? 0,
  itemIds: [],
  categoryIds: [],
});

async function attachTargets(list) {
  if (list.length === 0) return list;
  const r = await query(
    `SELECT PromotionId, MenuItemId, CategoryId FROM dbo.PromotionTargets
     WHERE PromotionId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))`,
    { ids: [sql.NVarChar(sql.MAX), list.map((p) => p.promotionId).join(',')] },
  );
  const byId = new Map(list.map((p) => [p.promotionId, p]));
  for (const t of r.recordset) {
    const p = byId.get(t.PromotionId);
    if (t.MenuItemId) p.itemIds.push(t.MenuItemId);
    else p.categoryIds.push(t.CategoryId);
  }
  return list;
}

const USED_TODAY = `(SELECT COUNT(DISTINCT u.OrderId) FROM dbo.PromotionUsages u JOIN dbo.Orders o ON o.OrderId = u.OrderId
                     WHERE u.PromotionId = p.PromotionId AND u.UsedAt >= @dayStart AND o.Status <> 'CANCELLED')`;

/** Khuyến mãi bật + trong khoảng ngày (giờ VN); `exhausted` = đã đủ lượt hôm nay. Lọc thứ/giờ do pricing làm. */
export async function candidates(today, dayStartUtc) {
  const r = await query(
    `SELECT p.*, ${USED_TODAY} AS UsedToday FROM dbo.Promotions p
     WHERE p.IsActive = 1 AND p.DeletedAt IS NULL AND p.StartDate <= @today AND p.EndDate >= @today
     ORDER BY p.SortOrder, p.PromotionId`,
    { today: [sql.Date, today], dayStart: [sql.DateTime2(0), dayStartUtc] },
  );
  const list = await attachTargets(r.recordset.map(mapPromotion));
  for (const p of list) p.exhausted = p.maxUsesPerDay !== null && p.usedToday >= p.maxUsesPerDay;
  return list;
}

export async function list(dayStartUtc) {
  const r = await query(
    `SELECT p.*, ${USED_TODAY} AS UsedToday FROM dbo.Promotions p WHERE p.DeletedAt IS NULL ORDER BY p.IsActive DESC, p.SortOrder, p.PromotionId DESC`,
    {
      dayStart: [sql.DateTime2(0), dayStartUtc],
    },
  );
  return attachTargets(r.recordset.map(mapPromotion));
}

export async function getById(id, dayStartUtc) {
  const r = await query(`SELECT p.*, ${USED_TODAY} AS UsedToday FROM dbo.Promotions p WHERE p.PromotionId = @id AND p.DeletedAt IS NULL`, {
    id: [sql.Int, id],
    dayStart: [sql.DateTime2(0), dayStartUtc],
  });
  if (!r.recordset[0]) return null;
  return (await attachTargets([mapPromotion(r.recordset[0])]))[0];
}

const params = (d) => ({
  n: [sql.NVarChar(100), d.name],
  t: [sql.VarChar(20), d.type],
  v: [sql.Decimal(12, 2), d.value],
  min: [sql.Decimal(12, 0), d.minOrderAmount],
  sd: [sql.Date, d.startDate],
  ed: [sql.Date, d.endDate],
  dow: [sql.TinyInt, d.daysOfWeekMask],
  st: [sql.VarChar(8), d.startTime],
  et: [sql.VarChar(8), d.endTime],
  max: [sql.Int, d.maxUsesPerDay],
  stack: [sql.Bit, d.stackWithMember],
  badge: [sql.NVarChar(30), d.badgeText],
  act: [sql.Bit, d.isActive],
  sort: [sql.Int, d.sortOrder],
});

async function replaceTargets(tx, id, d) {
  await txQuery(tx, 'DELETE dbo.PromotionTargets WHERE PromotionId = @id', { id: [sql.Int, id] });
  for (const itemId of d.itemIds) {
    await txQuery(tx, 'INSERT dbo.PromotionTargets (PromotionId, MenuItemId) VALUES (@id, @m)', { id: [sql.Int, id], m: [sql.Int, itemId] });
  }
  for (const catId of d.categoryIds) {
    await txQuery(tx, 'INSERT dbo.PromotionTargets (PromotionId, CategoryId) VALUES (@id, @c)', { id: [sql.Int, id], c: [sql.Int, catId] });
  }
}

export async function create(d) {
  return inTransaction(async (tx) => {
    const r = await txQuery(
      tx,
      `INSERT dbo.Promotions (Name, Type, Value, MinOrderAmount, StartDate, EndDate, DaysOfWeekMask, StartTime, EndTime, MaxUsesPerDay,
                              StackWithMember, BadgeText, IsActive, SortOrder)
       OUTPUT inserted.PromotionId
       VALUES (@n, @t, @v, @min, @sd, @ed, @dow, CAST(@st AS TIME(0)), CAST(@et AS TIME(0)), @max, @stack, @badge, @act, @sort)`,
      params(d),
    );
    const id = r.recordset[0].PromotionId;
    await replaceTargets(tx, id, d);
    return id;
  });
}

export async function update(id, d) {
  return inTransaction(async (tx) => {
    const r = await txQuery(
      tx,
      `UPDATE dbo.Promotions SET Name = @n, Type = @t, Value = @v, MinOrderAmount = @min, StartDate = @sd, EndDate = @ed, DaysOfWeekMask = @dow,
              StartTime = CAST(@st AS TIME(0)), EndTime = CAST(@et AS TIME(0)), MaxUsesPerDay = @max, StackWithMember = @stack,
              BadgeText = @badge, IsActive = @act, SortOrder = @sort
       WHERE PromotionId = @id AND DeletedAt IS NULL`,
      { id: [sql.Int, id], ...params(d) },
    );
    if (!r.rowsAffected[0]) return false;
    await replaceTargets(tx, id, d);
    return true;
  });
}

export async function setActive(id, isActive) {
  const r = await query('UPDATE dbo.Promotions SET IsActive = @a WHERE PromotionId = @id AND DeletedAt IS NULL', {
    id: [sql.Int, id],
    a: [sql.Bit, isActive],
  });
  return r.rowsAffected[0] > 0;
}

/** Chưa dùng lần nào → xóa hẳn; đã dùng → xóa mềm (giữ cho báo cáo). */
export async function remove(id) {
  return inTransaction(async (tx) => {
    const used = await txQuery(
      tx,
      `SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.PromotionUsages WHERE PromotionId = @id)
                     OR EXISTS (SELECT 1 FROM dbo.OrderItems WHERE PromotionId = @id)
                     OR EXISTS (SELECT 1 FROM dbo.Orders WHERE OrderPromotionId = @id) THEN 1 ELSE 0 END AS Used,
              (SELECT COUNT(*) FROM dbo.Promotions WITH (UPDLOCK, HOLDLOCK) WHERE PromotionId = @id AND DeletedAt IS NULL) AS Found`,
      { id: [sql.Int, id] },
    );
    const { Used, Found } = used.recordset[0];
    if (!Found) return null;
    if (Used) {
      await txQuery(tx, 'UPDATE dbo.Promotions SET DeletedAt = SYSUTCDATETIME(), IsActive = 0 WHERE PromotionId = @id', { id: [sql.Int, id] });
      return 'ARCHIVED';
    }
    await txQuery(tx, 'DELETE dbo.PromotionTargets WHERE PromotionId = @id; DELETE dbo.Promotions WHERE PromotionId = @id;', { id: [sql.Int, id] });
    return 'DELETED';
  });
}

/** Thống kê: lượt dùng (đơn), tiền giảm, doanh thu đơn có khuyến mãi (đơn đã thu, không hủy/hoàn). */
export async function stats(id, fromUtc, toUtc) {
  const r = await query(
    `SELECT COUNT(DISTINCT u.OrderId) AS Uses, ISNULL(SUM(u.DiscountAmount), 0) AS Discount,
            (SELECT ISNULL(SUM(o.TotalAmount), 0) FROM dbo.Orders o
             WHERE o.OrderId IN (SELECT OrderId FROM dbo.PromotionUsages WHERE PromotionId = @id AND UsedAt >= @f AND UsedAt < @t)
               AND o.PaymentStatus = 'PAID' AND o.Status NOT IN ('CANCELLED', 'VOIDED')) AS Revenue
     FROM dbo.PromotionUsages u JOIN dbo.Orders o ON o.OrderId = u.OrderId
     WHERE u.PromotionId = @id AND u.UsedAt >= @f AND u.UsedAt < @t AND o.Status NOT IN ('CANCELLED', 'VOIDED')`,
    { id: [sql.Int, id], f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] },
  );
  const x = r.recordset[0];
  return { uses: x.Uses, discount: Number(x.Discount), revenue: Number(x.Revenue) };
}
