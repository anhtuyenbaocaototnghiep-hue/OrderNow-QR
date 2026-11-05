// Chấm công, lịch làm, năng suất (FEATURE-035, ADR-006 D-25).
import { query, request, sql } from '../db.js';

const SELECT = `
  SELECT a.AttId, a.UserId, u.FullName, u.Role, a.ClockIn, a.ClockOut, a.ShiftId, a.Source, a.EditedBy, eu.FullName AS EditedByName,
         a.EditReason, a.EditedAt, a.NeedsReview, a.ClosedBy, cb.FullName AS ClosedByName, a.CheckResult, ck.FullName AS CheckedByName,
         a.PayDecision, dc.FullName AS DecidedByName, a.DecidedAt, a.DecisionNote,
         CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.AttendanceDisputes d WHERE d.AttId = a.AttId AND d.ResolvedAt IS NULL) THEN 1 ELSE 0 END AS BIT) AS OpenDispute
  FROM dbo.Attendance a
  JOIN dbo.Users u ON u.UserId = a.UserId
  LEFT JOIN dbo.Users eu ON eu.UserId = a.EditedBy
  LEFT JOIN dbo.Users cb ON cb.UserId = a.ClosedBy
  LEFT JOIN dbo.Users ck ON ck.UserId = a.CheckedBy
  LEFT JOIN dbo.Users dc ON dc.UserId = a.DecidedBy`;

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
  // F-072 / F-073
  needsReview: Boolean(r.NeedsReview),
  closedBy: r.ClosedBy ? { userId: r.ClosedBy, fullName: r.ClosedByName } : null,
  checkResult: r.CheckResult ?? null,
  checkedBy: r.CheckedByName ?? null,
  payDecision: r.PayDecision ?? null,
  decidedBy: r.DecidedByName ?? null,
  decidedAt: r.DecidedAt ?? null,
  decisionNote: r.DecisionNote ?? null,
  openDispute: Boolean(r.OpenDispute),
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

/** F-073: bản ghi CÓ GIỜ VÀO trong [from, to) — tính lương theo tháng (một lần chấm công thuộc tháng của giờ vào). */
export async function startedIn({ fromUtc, toUtc, userId = null }) {
  const r = await query(`${SELECT} WHERE a.ClockIn >= @f AND a.ClockIn < @t AND (@u IS NULL OR a.UserId = @u) ORDER BY a.ClockIn`, {
    f: [sql.DateTime2(0), fromUtc],
    t: [sql.DateTime2(0), toUtc],
    u: [sql.Int, userId],
  });
  return r.recordset.map(map);
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

// ---- F-072 (ADR-030): chấm công bằng màn chung + PIN, người đóng ca, quyết định trả lương, báo sai ----
const ids = (list) => [sql.VarChar(4000), list.map(Number).filter(Number.isInteger).join(',')];

/** Vào ca ở màn chung: chỉ khi người đó chưa có lần chấm công đang mở (khóa dòng — hai máy bấm cùng lúc chỉ tạo một). → bản ghi | null */
export async function punchIn(userId) {
  const r = await query(
    `SET XACT_ABORT ON;
     BEGIN TRAN;
     IF EXISTS (SELECT 1 FROM dbo.Attendance WITH (UPDLOCK, HOLDLOCK) WHERE UserId = @u AND ClockOut IS NULL)
       ROLLBACK;
     ELSE
     BEGIN
       INSERT dbo.Attendance (UserId, ClockIn, Source) OUTPUT inserted.AttId VALUES (@u, SYSUTCDATETIME(), 'KIOSK');
       COMMIT;
     END`,
    { u: [sql.Int, userId] },
  );
  const id = r.recordset?.[0]?.AttId;
  return id ? getById(id) : null;
}

/** Ra ca ở màn chung → bản ghi vừa đóng | null (không có lần đang mở). */
export async function punchOut(userId) {
  const r = await query('UPDATE dbo.Attendance SET ClockOut = SYSUTCDATETIME() OUTPUT inserted.AttId WHERE UserId = @u AND ClockOut IS NULL', {
    u: [sql.Int, userId],
  });
  return r.recordset[0] ? getById(r.recordset[0].AttId) : null;
}

/** Job (chế độ màn chung): lần chấm công mở quá `openHours` giờ → đóng ở giờ vào + `capHours`, đánh dấu cần xem lại. */
export async function autoCloseKiosk(openHours = 14, capHours = 8) {
  const r = await query(
    `UPDATE dbo.Attendance SET ClockOut = DATEADD(HOUR, @cap, ClockIn), NeedsReview = 1
     WHERE ClockOut IS NULL AND ClockIn < DATEADD(HOUR, -@open, SYSUTCDATETIME())`,
    { open: [sql.Int, openHours], cap: [sql.Int, capHours] },
  );
  return r.rowsAffected[0];
}

/** Bản ghi giao với ca thu ngân (từ lúc mở tới lúc đóng; ca đang mở → mọi lần chấm công từ lúc mở — giờ vào DATETIME2(0) có thể bị
 *  làm tròn lên quá "bây giờ" nửa giây, so với SYSUTCDATETIME() sẽ sót người vừa chấm vào). */
export async function forShift(shiftId) {
  const r = await query(
    `${SELECT} JOIN dbo.Shifts s ON s.ShiftId = @s
     WHERE a.ClockIn < ISNULL(s.ClosedAt, '9999-12-31') AND (a.ClockOut IS NULL OR a.ClockOut > s.OpenedAt)
     ORDER BY a.ClockIn`,
    { s: [sql.Int, shiftId] },
  );
  return r.recordset.map(map);
}

/** Người đóng ca chấm ra hộ những người quên (không phải chính mình) → cần quản lý xem lại. */
export async function closeByOther(attIds, closerId) {
  if (!attIds.length) return 0;
  const r = await query(
    `UPDATE dbo.Attendance SET ClockOut = SYSUTCDATETIME(), NeedsReview = 1, ClosedBy = @c
     WHERE ClockOut IS NULL AND UserId <> @c AND AttId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))`,
    { ids: ids(attIds), c: [sql.Int, closerId] },
  );
  return r.rowsAffected[0];
}

/** Người đóng ca đánh dấu có mặt (OK) / báo không có mặt (DISPUTED) — không đánh dấu được bản ghi của chính mình. */
export async function check(attIds, result, closerId) {
  if (!attIds.length) return 0;
  const r = await query(
    `UPDATE dbo.Attendance SET CheckResult = @r, CheckedBy = @c, CheckedAt = SYSUTCDATETIME()
     WHERE UserId <> @c AND AttId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))`,
    { ids: ids(attIds), r: [sql.VarChar(10), result], c: [sql.Int, closerId] },
  );
  return r.rowsAffected[0];
}

/** Quyết định trả lương của quản lý cho một lần chấm công (null = bỏ quyết định). */
export async function decide(id, { decision, note, by }) {
  await query(
    `UPDATE dbo.Attendance SET PayDecision = @d, DecisionNote = @n, DecidedBy = CASE WHEN @d IS NULL THEN NULL ELSE @b END,
       DecidedAt = CASE WHEN @d IS NULL THEN NULL ELSE SYSUTCDATETIME() END
     WHERE AttId = @id`,
    { id: [sql.Int, id], d: [sql.VarChar(10), decision], n: [sql.NVarChar(200), note ?? null], b: [sql.Int, by] },
  );
  return getById(id);
}

export async function addDispute({ attId, userId, note }) {
  const r = await query('INSERT dbo.AttendanceDisputes (AttId, UserId, Note) OUTPUT inserted.DisputeId VALUES (@a, @u, @n)', {
    a: [sql.Int, attId],
    u: [sql.Int, userId],
    n: [sql.NVarChar(300), note],
  });
  return r.recordset[0].DisputeId;
}

const mapDispute = (r) => ({
  disputeId: r.DisputeId,
  attId: r.AttId,
  user: { userId: r.UserId, fullName: r.FullName },
  note: r.Note,
  createdAt: r.CreatedAt,
  resolvedBy: r.ResolvedByName ?? null,
  resolvedAt: r.ResolvedAt ?? null,
  resolution: r.Resolution ?? null,
});

/** Báo sai: của một người (userId) hoặc theo các lần chấm công (attIds). */
export async function disputes({ userId = null, attIds = null, openOnly = false }) {
  const r = await query(
    `SELECT d.*, u.FullName, ru.FullName AS ResolvedByName FROM dbo.AttendanceDisputes d
     JOIN dbo.Users u ON u.UserId = d.UserId LEFT JOIN dbo.Users ru ON ru.UserId = d.ResolvedBy
     WHERE (@u IS NULL OR d.UserId = @u) AND (@ids IS NULL OR d.AttId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ',')))
       AND (@open = 0 OR d.ResolvedAt IS NULL)
     ORDER BY d.CreatedAt DESC`,
    { u: [sql.Int, userId], ids: attIds ? ids(attIds) : [sql.VarChar(4000), null], open: [sql.Bit, openOnly] },
  );
  return r.recordset.map(mapDispute);
}

export async function resolveDispute(id, { resolution, by }) {
  const r = await query(
    `UPDATE dbo.AttendanceDisputes SET ResolvedBy = @b, ResolvedAt = SYSUTCDATETIME(), Resolution = @r
     OUTPUT inserted.DisputeId WHERE DisputeId = @id AND ResolvedAt IS NULL`,
    { id: [sql.Int, id], b: [sql.Int, by], r: [sql.NVarChar(200), resolution] },
  );
  return r.recordset.length === 1;
}

/** Lịch sử sửa các lần chấm công (từ nhật ký thao tác — không sửa / xóa được). */
export async function editHistory(attIds) {
  if (!attIds.length) return [];
  const r = await query(
    `SELECT EntityId, UserName, Action, BeforeJson, AfterJson, At FROM dbo.AuditLogs
     WHERE Entity = 'Attendance' AND EntityId IN (SELECT value FROM STRING_SPLIT(@ids, ',')) ORDER BY At`,
    { ids: ids(attIds) },
  );
  return r.recordset.map((x) => ({ attId: Number(x.EntityId), by: x.UserName, action: x.Action, before: x.BeforeJson, after: x.AfterJson, at: x.At }));
}
