// Chấm công, lịch làm, năng suất (FEATURE-035, ADR-006 D-25).
import { query, request, sql } from '../db.js';

const SELECT = `
  SELECT a.AttId, a.UserId, u.FullName, u.Role, a.ClockIn, a.ClockOut, a.ShiftId, a.Source, a.EditedBy, eu.FullName AS EditedByName,
         a.EditReason, a.EditedAt
  FROM dbo.Attendance a
  JOIN dbo.Users u ON u.UserId = a.UserId
  LEFT JOIN dbo.Users eu ON eu.UserId = a.EditedBy`;

const map = (r) => ({
  attId: r.AttId,
  user: { userId: r.UserId, fullName: r.FullName, role: r.Role },
  clockIn: r.ClockIn,
  clockOut: r.ClockOut,
  minutes: Math.max(0, Math.round(((r.ClockOut ? new Date(r.ClockOut) : new Date()) - new Date(r.ClockIn)) / 60000)),
  shiftId: r.ShiftId,
  source: r.Source,
  editedBy: r.EditedBy ? { userId: r.EditedBy, fullName: r.EditedByName } : null,
  editReason: r.EditReason,
  editedAt: r.EditedAt,
});

export async function clockIn(userId, staleHours = 12) {
  const r = await (
    await request()
  )
    .input('UserId', sql.Int, userId)
    .input('StaleHours', sql.Int, staleHours)
    .output('AttId', sql.Int)
    .output('Created', sql.Bit)
    .execute('dbo.sp_ClockIn');
  return { attId: r.output.AttId, created: Boolean(r.output.Created) };
}

/** Kết thúc mọi bản ghi đang mở của người dùng (đăng xuất). Trả số bản ghi đã đóng. */
export async function clockOut(userId) {
  const r = await query('UPDATE dbo.Attendance SET ClockOut = SYSUTCDATETIME() WHERE UserId = @u AND ClockOut IS NULL', { u: [sql.Int, userId] });
  return r.rowsAffected[0];
}

/** Job: bản ghi mở quá `hours` giờ (token đã hết hạn, quên đăng xuất) → đóng tại ClockIn + hours. */
export async function autoClose(hours) {
  const r = await query(
    `UPDATE dbo.Attendance SET ClockOut = DATEADD(MINUTE, @m, ClockIn)
     WHERE ClockOut IS NULL AND ClockIn < DATEADD(MINUTE, -@m, SYSUTCDATETIME())`,
    { m: [sql.Int, Math.round(hours * 60)] },
  );
  return r.rowsAffected[0];
}

export async function getById(id) {
  const r = await query(`${SELECT} WHERE a.AttId = @id`, { id: [sql.Int, id] });
  return r.recordset[0] ? map(r.recordset[0]) : null;
}

export async function openFor(userId) {
  const r = await query(`${SELECT} WHERE a.UserId = @u AND a.ClockOut IS NULL`, { u: [sql.Int, userId] });
  return r.recordset[0] ? map(r.recordset[0]) : null;
}

/** Bản ghi giao với khoảng [from, to) (giờ UTC). */
export async function list({ fromUtc, toUtc, userId = null }) {
  const r = await query(
    `${SELECT} WHERE a.ClockIn < @t AND (a.ClockOut IS NULL OR a.ClockOut >= @f) AND (@u IS NULL OR a.UserId = @u)
     ORDER BY a.ClockIn DESC`,
    { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc], u: [sql.Int, userId] },
  );
  return r.recordset.map(map);
}

export async function update(id, { clockIn, clockOut, reason, editedBy }) {
  await query(
    `UPDATE dbo.Attendance SET ClockIn = @i, ClockOut = @o, EditedBy = @e, EditReason = @r, EditedAt = SYSUTCDATETIME()
     WHERE AttId = @id`,
    {
      id: [sql.Int, id],
      i: [sql.DateTime2(0), clockIn],
      o: [sql.DateTime2(0), clockOut],
      e: [sql.Int, editedBy],
      r: [sql.NVarChar(200), reason],
    },
  );
  return getById(id);
}

export async function createManual({ userId, clockIn, clockOut, reason, editedBy }) {
  const r = await query(
    `INSERT dbo.Attendance (UserId, ClockIn, ClockOut, Source, EditedBy, EditReason, EditedAt)
     OUTPUT inserted.AttId VALUES (@u, @i, @o, 'MANUAL', @e, @r, SYSUTCDATETIME())`,
    {
      u: [sql.Int, userId],
      i: [sql.DateTime2(0), clockIn],
      o: [sql.DateTime2(0), clockOut],
      e: [sql.Int, editedBy],
      r: [sql.NVarChar(200), reason],
    },
  );
  return getById(r.recordset[0].AttId);
}

/** Có bản ghi khác của cùng người giao với khoảng [clockIn, clockOut) không (chặn chấm công chồng nhau). */
export async function overlaps(userId, clockIn, clockOut, exceptId = null) {
  const r = await query(
    `SELECT TOP 1 AttId FROM dbo.Attendance
     WHERE UserId = @u AND (@x IS NULL OR AttId <> @x)
       AND ClockIn < ISNULL(@o, '9999-12-31') AND ISNULL(ClockOut, SYSUTCDATETIME()) > @i`,
    { u: [sql.Int, userId], i: [sql.DateTime2(0), clockIn], o: [sql.DateTime2(0), clockOut], x: [sql.Int, exceptId] },
  );
  return r.recordset.length > 0;
}

// ---- Lịch làm (roster) ----
const time5 = (t) => (t instanceof Date ? t.toISOString().slice(11, 16) : String(t).slice(0, 5));
const mapRoster = (r) => ({
  rosterId: r.RosterId,
  user: { userId: r.UserId, fullName: r.FullName },
  workDate: r.WorkDate instanceof Date ? r.WorkDate.toISOString().slice(0, 10) : r.WorkDate,
  startTime: time5(r.StartTime),
  endTime: time5(r.EndTime),
  note: r.Note,
});

export async function rosters(from, to) {
  const r = await query(
    `SELECT ro.*, u.FullName FROM dbo.Rosters ro JOIN dbo.Users u ON u.UserId = ro.UserId
     WHERE ro.WorkDate BETWEEN @f AND @t ORDER BY ro.WorkDate, ro.StartTime, u.FullName`,
    { f: [sql.Date, from], t: [sql.Date, to] },
  );
  return r.recordset.map(mapRoster);
}

export async function rosterById(id) {
  const r = await query('SELECT ro.*, u.FullName FROM dbo.Rosters ro JOIN dbo.Users u ON u.UserId = ro.UserId WHERE ro.RosterId = @id', {
    id: [sql.Int, id],
  });
  return r.recordset[0] ? mapRoster(r.recordset[0]) : null;
}

export async function saveRoster(id, { userId, workDate, startTime, endTime, note, createdBy }) {
  const p = {
    id: [sql.Int, id],
    u: [sql.Int, userId],
    d: [sql.Date, workDate],
    s: [sql.VarChar(8), startTime],
    e: [sql.VarChar(8), endTime],
    n: [sql.NVarChar(100), note ?? null],
    c: [sql.Int, createdBy],
  };
  if (id) {
    const r = await query(
      `UPDATE dbo.Rosters SET UserId = @u, WorkDate = @d, StartTime = CAST(@s AS TIME(0)), EndTime = CAST(@e AS TIME(0)), Note = @n
       WHERE RosterId = @id`,
      p,
    );
    return r.rowsAffected[0] ? rosterById(id) : null;
  }
  const r = await query(
    `INSERT dbo.Rosters (UserId, WorkDate, StartTime, EndTime, Note, CreatedBy)
     OUTPUT inserted.RosterId VALUES (@u, @d, CAST(@s AS TIME(0)), CAST(@e AS TIME(0)), @n, @c)`,
    p,
  );
  return rosterById(r.recordset[0].RosterId);
}

export async function deleteRoster(id) {
  const r = await query('DELETE dbo.Rosters WHERE RosterId = @id', { id: [sql.Int, id] });
  return r.rowsAffected[0] > 0;
}

/** Lần chấm công vào đầu tiên của từng người trong từng ngày (giờ VN) — để cảnh báo đi muộn. */
export async function firstClockIns(from, to) {
  const r = await query(
    `SELECT UserId, CONVERT(CHAR(10), DATEADD(HOUR, 7, ClockIn), 23) AS D, MIN(ClockIn) AS FirstIn
     FROM dbo.Attendance
     WHERE ClockIn >= DATEADD(HOUR, -7, CAST(@f AS DATETIME2(0))) AND ClockIn < DATEADD(HOUR, 17, CAST(@t AS DATETIME2(0)))
     GROUP BY UserId, CONVERT(CHAR(10), DATEADD(HOUR, 7, ClockIn), 23)`,
    { f: [sql.Date, from], t: [sql.Date, to] },
  );
  return r.recordset.map((x) => ({ userId: x.UserId, date: x.D, firstIn: x.FirstIn }));
}

/** Năng suất: tiền thu (ReceivedBy), số lượt thu, số đơn hoàn tất (CompletedBy), số phút chấm công trong kỳ. */
export async function productivity(fromUtc, toUtc) {
  const r = await query(
    `SELECT u.UserId, u.FullName, u.Role,
            ISNULL(p.Payments, 0) AS Payments, ISNULL(p.Amount, 0) AS Amount, ISNULL(o.Orders, 0) AS Orders,
            ISNULL(a.Minutes, 0) AS Minutes
     FROM dbo.Users u
     LEFT JOIN (SELECT ReceivedBy, COUNT(*) AS Payments, SUM(AmountDue) AS Amount FROM dbo.Payments
                WHERE PaidAt >= @f AND PaidAt < @t GROUP BY ReceivedBy) p ON p.ReceivedBy = u.UserId
     LEFT JOIN (SELECT CompletedBy, COUNT(*) AS Orders FROM dbo.Orders
                WHERE Status = 'COMPLETED' AND CompletedAt >= @f AND CompletedAt < @t GROUP BY CompletedBy) o ON o.CompletedBy = u.UserId
     LEFT JOIN (SELECT UserId, SUM(DATEDIFF(MINUTE,
                  CASE WHEN ClockIn > @f THEN ClockIn ELSE @f END,
                  CASE WHEN ISNULL(ClockOut, SYSUTCDATETIME()) < @t THEN ISNULL(ClockOut, SYSUTCDATETIME()) ELSE @t END)) AS Minutes
                FROM dbo.Attendance WHERE ClockIn < @t AND ISNULL(ClockOut, SYSUTCDATETIME()) > @f GROUP BY UserId) a ON a.UserId = u.UserId
     WHERE u.DeletedAt IS NULL OR p.Payments IS NOT NULL OR o.Orders IS NOT NULL OR a.Minutes IS NOT NULL
     ORDER BY ISNULL(p.Amount, 0) DESC, u.FullName`,
    { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] },
  );
  return r.recordset
    .map((x) => ({
      user: { userId: x.UserId, fullName: x.FullName, role: x.Role },
      payments: x.Payments,
      amount: Number(x.Amount),
      orders: x.Orders,
      minutes: Math.max(0, x.Minutes),
      amountPerHour: x.Minutes > 0 ? Math.round((Number(x.Amount) * 60) / x.Minutes) : null,
    }))
    .filter((x) => x.payments || x.orders || x.minutes);
}
