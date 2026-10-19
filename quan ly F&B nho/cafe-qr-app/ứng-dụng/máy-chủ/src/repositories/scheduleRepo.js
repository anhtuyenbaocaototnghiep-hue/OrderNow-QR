// FEATURE-040 Lịch thực đơn: MenuSchedules + MenuScheduleItems. Lịch "Giờ bán" của danh mục (SourceCategoryId) đồng bộ với F-020.
import { inTransaction, query, sql, txQuery } from '../db.js';

const SELECT = `
  SELECT s.ScheduleId, s.Name, CONVERT(CHAR(10), s.StartDate, 23) AS StartDate, CONVERT(CHAR(10), s.EndDate, 23) AS EndDate,
         s.DaysOfWeekMask, CONVERT(CHAR(5), s.StartTime, 108) AS StartTime, CONVERT(CHAR(5), s.EndTime, 108) AS EndTime,
         s.IsActive, s.SourceCategoryId, s.CreatedAt
  FROM dbo.MenuSchedules s`;

const map = (r) => ({
  scheduleId: r.ScheduleId,
  name: r.Name,
  startDate: r.StartDate,
  endDate: r.EndDate,
  daysOfWeekMask: r.DaysOfWeekMask,
  startTime: r.StartTime,
  endTime: r.EndTime,
  isActive: Boolean(r.IsActive),
  sourceCategoryId: r.SourceCategoryId,
  targets: [],
});

export async function list() {
  const r = await query(
    `${SELECT} ORDER BY s.IsActive DESC, s.Name;
     SELECT i.ScheduleItemId, i.ScheduleId, i.MenuItemId, i.CategoryId, i.Mode, m.Name AS ItemName, c.Name AS CategoryName
     FROM dbo.MenuScheduleItems i
     LEFT JOIN dbo.MenuItems m ON m.MenuItemId = i.MenuItemId
     LEFT JOIN dbo.Categories c ON c.CategoryId = i.CategoryId
     ORDER BY i.ScheduleItemId;`,
  );
  const [heads, items] = r.recordsets;
  const byId = new Map(heads.map((h) => [h.ScheduleId, map(h)]));
  for (const i of items) {
    byId.get(i.ScheduleId)?.targets.push({
      menuItemId: i.MenuItemId,
      categoryId: i.CategoryId,
      mode: i.Mode,
      name: i.ItemName ?? i.CategoryName,
    });
  }
  return [...byId.values()];
}

export async function get(id) {
  return (await list()).find((s) => s.scheduleId === id) ?? null;
}

async function writeTargets(tx, id, targets) {
  await txQuery(tx, 'DELETE dbo.MenuScheduleItems WHERE ScheduleId = @id', { id: [sql.Int, id] });
  for (const t of targets) {
    await txQuery(tx, 'INSERT dbo.MenuScheduleItems (ScheduleId, MenuItemId, CategoryId, Mode) VALUES (@id, @m, @c, @mode)', {
      id: [sql.Int, id],
      m: [sql.Int, t.menuItemId ?? null],
      c: [sql.Int, t.categoryId ?? null],
      mode: [sql.VarChar(10), t.mode],
    });
  }
}

const params = (d) => ({
  n: [sql.NVarChar(100), d.name],
  sd: [sql.VarChar(10), d.startDate || null],
  ed: [sql.VarChar(10), d.endDate || null],
  dm: [sql.TinyInt, d.daysOfWeekMask ?? 127],
  st: [sql.VarChar(8), d.startTime || null],
  et: [sql.VarChar(8), d.endTime || null],
  a: [sql.Bit, d.isActive ?? true],
});

export async function create(d) {
  const id = await inTransaction(async (tx) => {
    const r = await txQuery(
      tx,
      `INSERT dbo.MenuSchedules (Name, StartDate, EndDate, DaysOfWeekMask, StartTime, EndTime, IsActive) OUTPUT inserted.ScheduleId
       VALUES (@n, CAST(@sd AS DATE), CAST(@ed AS DATE), @dm, CAST(@st AS TIME(0)), CAST(@et AS TIME(0)), @a)`,
      params(d),
    );
    const newId = r.recordset[0].ScheduleId;
    await writeTargets(tx, newId, d.targets);
    return newId;
  });
  return get(id);
}

export async function update(id, d) {
  const ok = await inTransaction(async (tx) => {
    const r = await txQuery(
      tx,
      `UPDATE dbo.MenuSchedules SET Name = @n, StartDate = CAST(@sd AS DATE), EndDate = CAST(@ed AS DATE), DaysOfWeekMask = @dm,
              StartTime = CAST(@st AS TIME(0)), EndTime = CAST(@et AS TIME(0)), IsActive = @a
       WHERE ScheduleId = @id`,
      { id: [sql.Int, id], ...params(d) },
    );
    if (!r.rowsAffected[0]) return false;
    await writeTargets(tx, id, d.targets);
    return true;
  });
  return ok ? get(id) : null;
}

export async function setActive(id, isActive) {
  const r = await query('UPDATE dbo.MenuSchedules SET IsActive = @a WHERE ScheduleId = @id', { id: [sql.Int, id], a: [sql.Bit, isActive] });
  return r.rowsAffected[0] > 0;
}

export async function remove(id) {
  return inTransaction(async (tx) => {
    await txQuery(tx, 'DELETE dbo.MenuScheduleItems WHERE ScheduleId = @id', { id: [sql.Int, id] });
    const r = await txQuery(tx, 'DELETE dbo.MenuSchedules WHERE ScheduleId = @id', { id: [sql.Int, id] });
    return r.rowsAffected[0] > 0;
  });
}

/** F-020 → F-040: giờ bán của danh mục = một lịch SHOW gắn SourceCategoryId (null giờ = xóa lịch). */
export async function syncCategorySchedule(categoryId, name, sellFrom, sellTo) {
  await inTransaction(async (tx) => {
    const r = await txQuery(tx, 'SELECT ScheduleId FROM dbo.MenuSchedules WITH (UPDLOCK, HOLDLOCK) WHERE SourceCategoryId = @c', {
      c: [sql.Int, categoryId],
    });
    const existing = r.recordset[0]?.ScheduleId ?? null;
    if (!sellFrom || !sellTo) {
      if (existing) {
        await txQuery(tx, 'DELETE dbo.MenuScheduleItems WHERE ScheduleId = @id; DELETE dbo.MenuSchedules WHERE ScheduleId = @id;', {
          id: [sql.Int, existing],
        });
      }
      return;
    }
    const p = {
      c: [sql.Int, categoryId],
      n: [sql.NVarChar(100), `Giờ bán — ${name}`.slice(0, 100)],
      st: [sql.VarChar(8), sellFrom],
      et: [sql.VarChar(8), sellTo],
    };
    if (existing) {
      await txQuery(tx, `UPDATE dbo.MenuSchedules SET Name = @n, StartTime = CAST(@st AS TIME(0)), EndTime = CAST(@et AS TIME(0)) WHERE ScheduleId = @id`, {
        ...p,
        id: [sql.Int, existing],
      });
    } else {
      await txQuery(
        tx,
        `DECLARE @id INT;
         INSERT dbo.MenuSchedules (Name, StartTime, EndTime, SourceCategoryId) VALUES (@n, CAST(@st AS TIME(0)), CAST(@et AS TIME(0)), @c);
         SET @id = SCOPE_IDENTITY();
         INSERT dbo.MenuScheduleItems (ScheduleId, CategoryId, Mode) VALUES (@id, @c, 'SHOW');`,
        p,
      );
    }
  });
}
