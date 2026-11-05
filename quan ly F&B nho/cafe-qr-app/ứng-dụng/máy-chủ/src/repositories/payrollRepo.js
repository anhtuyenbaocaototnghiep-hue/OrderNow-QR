// F-073 (ADR-030): hồ sơ lương, ngày lễ, khoản cộng / trừ, tạm ứng (sổ quỹ), bảng lương đã chốt.
import { inTransaction, query, sql, txQuery } from '../db.js';

const n = (v) => (v === null || v === undefined ? null : Number(v));
const time5 = (t) => (t instanceof Date ? t.toISOString().slice(11, 16) : String(t ?? '').slice(0, 5));
const day = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

const mapProfile = (r) => ({
  userId: r.UserId,
  fullName: r.FullName,
  role: r.Role,
  payType: r.PayType,
  hourlyRate: n(r.HourlyRate),
  monthlySalary: n(r.MonthlySalary),
  nightAllowance: n(r.NightAllowance),
  nightStart: time5(r.NightStart),
  holidayMultiplier: n(r.HolidayMultiplier),
  attendanceBonus: n(r.AttendanceBonus),
  bankBin: r.BankBin ? r.BankBin.trim() : null,
  bankAccount: r.BankAccount ?? null,
  bankAccountName: r.BankAccountName ?? null,
  updatedAt: r.UpdatedAt,
});

export async function profiles() {
  const r = await query(`SELECT p.*, u.FullName, u.Role FROM dbo.PayProfiles p JOIN dbo.Users u ON u.UserId = p.UserId ORDER BY u.FullName`);
  return r.recordset.map(mapProfile);
}

export async function profile(userId) {
  const r = await query('SELECT p.*, u.FullName, u.Role FROM dbo.PayProfiles p JOIN dbo.Users u ON u.UserId = p.UserId WHERE p.UserId = @u', {
    u: [sql.Int, userId],
  });
  return r.recordset[0] ? mapProfile(r.recordset[0]) : null;
}

export async function hasProfiles() {
  const r = await query('SELECT TOP 1 1 AS X FROM dbo.PayProfiles');
  return r.recordset.length > 0;
}

export async function saveProfile(userId, p, by) {
  await query(
    `MERGE dbo.PayProfiles AS t USING (SELECT @u AS UserId) AS s ON t.UserId = s.UserId
     WHEN MATCHED THEN UPDATE SET PayType = @pt, HourlyRate = @hr, MonthlySalary = @ms, NightAllowance = @na, NightStart = CAST(@ns AS TIME(0)),
       HolidayMultiplier = @hm, AttendanceBonus = @ab, BankBin = @bb, BankAccount = @ba, BankAccountName = @bn, UpdatedBy = @by, UpdatedAt = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (UserId, PayType, HourlyRate, MonthlySalary, NightAllowance, NightStart, HolidayMultiplier, AttendanceBonus,
       BankBin, BankAccount, BankAccountName, UpdatedBy)
       VALUES (@u, @pt, @hr, @ms, @na, CAST(@ns AS TIME(0)), @hm, @ab, @bb, @ba, @bn, @by);`,
    {
      u: [sql.Int, userId],
      pt: [sql.VarChar(10), p.payType],
      hr: [sql.Decimal(12, 0), p.hourlyRate ?? 0],
      ms: [sql.Decimal(12, 0), p.monthlySalary ?? 0],
      na: [sql.Decimal(12, 0), p.nightAllowance ?? 0],
      ns: [sql.VarChar(8), p.nightStart ?? '18:00'],
      hm: [sql.Decimal(4, 2), p.holidayMultiplier ?? 3],
      ab: [sql.Decimal(12, 0), p.attendanceBonus ?? 0],
      bb: [sql.Char(6), p.bankBin || null],
      ba: [sql.VarChar(30), p.bankAccount || null],
      bn: [sql.NVarChar(100), p.bankAccountName || null],
      by: [sql.Int, by],
    },
  );
  return profile(userId);
}

// ---- Ngày lễ ----
export async function holidays(from, to) {
  const r = await query('SELECT HolidayDate, Name FROM dbo.Holidays WHERE HolidayDate BETWEEN @f AND @t ORDER BY HolidayDate', {
    f: [sql.Date, from],
    t: [sql.Date, to],
  });
  return r.recordset.map((x) => ({ date: day(x.HolidayDate), name: x.Name }));
}

export async function saveHoliday(date, name) {
  await query(
    `MERGE dbo.Holidays AS t USING (SELECT CAST(@d AS DATE) AS D) AS s ON t.HolidayDate = s.D
     WHEN MATCHED THEN UPDATE SET Name = @n WHEN NOT MATCHED THEN INSERT (HolidayDate, Name) VALUES (s.D, @n);`,
    { d: [sql.Date, date], n: [sql.NVarChar(100), name] },
  );
}

export async function removeHoliday(date) {
  const r = await query('DELETE dbo.Holidays WHERE HolidayDate = @d', { d: [sql.Date, date] });
  return r.rowsAffected[0] > 0;
}

// ---- Khoản cộng / trừ theo tháng ----
export async function adjustments(month) {
  const r = await query(
    `SELECT a.*, u.FullName, cu.FullName AS CreatedByName FROM dbo.PayrollAdjustments a
     JOIN dbo.Users u ON u.UserId = a.UserId JOIN dbo.Users cu ON cu.UserId = a.CreatedBy
     WHERE a.Month = @m ORDER BY a.CreatedAt`,
    { m: [sql.Char(7), month] },
  );
  return r.recordset.map((x) => ({
    adjId: x.AdjId,
    month: x.Month,
    userId: x.UserId,
    fullName: x.FullName,
    amount: Number(x.Amount),
    reason: x.Reason,
    createdBy: x.CreatedByName,
    createdAt: x.CreatedAt,
  }));
}

export async function addAdjustment({ month, userId, amount, reason, by }) {
  const r = await query('INSERT dbo.PayrollAdjustments (Month, UserId, Amount, Reason, CreatedBy) OUTPUT inserted.AdjId VALUES (@m, @u, @a, @r, @b)', {
    m: [sql.Char(7), month],
    u: [sql.Int, userId],
    a: [sql.Decimal(12, 0), amount],
    r: [sql.NVarChar(200), reason],
    b: [sql.Int, by],
  });
  return r.recordset[0].AdjId;
}

export async function adjustment(id) {
  const r = await query('SELECT AdjId, Month, UserId FROM dbo.PayrollAdjustments WHERE AdjId = @id', { id: [sql.Int, id] });
  return r.recordset[0] ? { adjId: r.recordset[0].AdjId, month: r.recordset[0].Month, userId: r.recordset[0].UserId } : null;
}

export async function removeAdjustment(id) {
  const r = await query('DELETE dbo.PayrollAdjustments WHERE AdjId = @id', { id: [sql.Int, id] });
  return r.rowsAffected[0] > 0;
}

/** Tạm ứng lương đã duyệt, chưa hủy, ghi trong [from, to) — theo người nhận. */
export async function advances(fromUtc, toUtc) {
  const r = await query(
    `SELECT c.CashTxnId, c.EmployeeId, c.Amount, c.Reason, c.CreatedAt FROM dbo.CashTransactions c
     JOIN dbo.CashCategories cc ON cc.CategoryId = c.CategoryId
     WHERE cc.SystemCode = 'SALARY_ADVANCE' AND c.Status = 'APPROVED' AND c.VoidedAt IS NULL AND c.EmployeeId IS NOT NULL
       AND c.CreatedAt >= @f AND c.CreatedAt < @t
     ORDER BY c.CreatedAt`,
    { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] },
  );
  return r.recordset.map((x) => ({ cashTxnId: x.CashTxnId, userId: x.EmployeeId, amount: Number(x.Amount), reason: x.Reason, createdAt: x.CreatedAt }));
}

// ---- Bảng lương đã chốt ----
export async function run(month) {
  const r = await query(
    `SELECT r.*, lu.FullName AS LockedByName, ru.FullName AS ReopenedByName FROM dbo.PayrollRuns r
     LEFT JOIN dbo.Users lu ON lu.UserId = r.LockedBy LEFT JOIN dbo.Users ru ON ru.UserId = r.ReopenedBy WHERE r.Month = @m`,
    { m: [sql.Char(7), month] },
  );
  const x = r.recordset[0];
  return x
    ? {
        month: x.Month,
        status: x.Status,
        lockedBy: x.LockedByName,
        lockedAt: x.LockedAt,
        reopenedBy: x.ReopenedByName,
        reopenedAt: x.ReopenedAt,
        reopenReason: x.ReopenReason,
      }
    : null;
}

export async function isLocked(month) {
  const r = await query("SELECT 1 AS X FROM dbo.PayrollRuns WHERE Month = @m AND Status = 'LOCKED'", { m: [sql.Char(7), month] });
  return r.recordset.length > 0;
}

const LINE_COLS = [
  'Minutes',
  'NightMinutes',
  'HolidayMinutes',
  'BasePay',
  'NightPay',
  'HolidayPay',
  'AttendanceBonus',
  'Adjustments',
  'Advances',
  'NetPay',
  'LateCount',
  'AbsentCount',
];
const camel = (c) => c[0].toLowerCase() + c.slice(1);

/** Chốt: ghi ảnh chụp từng dòng (giữ "đã trả" / "đã xem" của lần chốt trước nếu mở lại rồi chốt lại). */
export async function lock(month, lines, by) {
  return inTransaction(async (tx) => {
    const prev = await txQuery(tx, 'SELECT UserId, PaidAt, PaidBy, PaidMethod, AckAt FROM dbo.PayrollLines WITH (UPDLOCK, HOLDLOCK) WHERE Month = @m', {
      m: [sql.Char(7), month],
    });
    const keep = new Map(prev.recordset.map((x) => [x.UserId, x]));
    await txQuery(
      tx,
      `MERGE dbo.PayrollRuns AS t USING (SELECT @m AS Month) AS s ON t.Month = s.Month
       WHEN MATCHED THEN UPDATE SET Status = 'LOCKED', LockedBy = @b, LockedAt = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (Month, Status, LockedBy, LockedAt) VALUES (@m, 'LOCKED', @b, SYSUTCDATETIME());`,
      { m: [sql.Char(7), month], b: [sql.Int, by] },
    );
    await txQuery(tx, 'DELETE dbo.PayrollLines WHERE Month = @m', { m: [sql.Char(7), month] });
    for (const l of lines) {
      const k = keep.get(l.userId);
      const params = Object.fromEntries(LINE_COLS.map((c) => [c, [/Count|Minutes/.test(c) ? sql.Int : sql.Decimal(12, 0), l[camel(c)]]]));
      await txQuery(
        tx,
        `INSERT dbo.PayrollLines (Month, UserId, ${LINE_COLS.join(', ')}, DetailJson, PaidAt, PaidBy, PaidMethod, AckAt)
         VALUES (@m, @u, ${LINE_COLS.map((c) => `@${c}`).join(', ')}, @d, @pa, @pb, @pm, @ack)`,
        {
          m: [sql.Char(7), month],
          u: [sql.Int, l.userId],
          ...params,
          d: [sql.NVarChar(sql.MAX), JSON.stringify(l.detail ?? null)],
          pa: [sql.DateTime2(0), k?.PaidAt ?? null],
          pb: [sql.Int, k?.PaidBy ?? null],
          pm: [sql.VarChar(10), k?.PaidMethod ?? null],
          ack: [sql.DateTime2(0), k?.AckAt ?? null],
        },
      );
    }
  });
}

export async function reopen(month, reason, by) {
  const r = await query(
    `UPDATE dbo.PayrollRuns SET Status = 'REOPENED', ReopenedBy = @b, ReopenedAt = SYSUTCDATETIME(), ReopenReason = @r
     OUTPUT inserted.Month WHERE Month = @m AND Status = 'LOCKED'`,
    { m: [sql.Char(7), month], b: [sql.Int, by], r: [sql.NVarChar(200), reason] },
  );
  return r.recordset.length === 1;
}

const mapLine = (x) => ({
  month: x.Month,
  userId: x.UserId,
  fullName: x.FullName,
  role: x.Role,
  ...Object.fromEntries(LINE_COLS.map((c) => [camel(c), Number(x[c])])),
  detail: x.DetailJson ? JSON.parse(x.DetailJson) : null,
  paidAt: x.PaidAt,
  paidBy: x.PaidByName ?? null,
  paidMethod: x.PaidMethod,
  ackAt: x.AckAt,
});

export async function lines(month, userId = null) {
  const r = await query(
    `SELECT l.*, u.FullName, u.Role, pu.FullName AS PaidByName FROM dbo.PayrollLines l
     JOIN dbo.Users u ON u.UserId = l.UserId LEFT JOIN dbo.Users pu ON pu.UserId = l.PaidBy
     WHERE l.Month = @m AND (@u IS NULL OR l.UserId = @u) ORDER BY u.FullName`,
    { m: [sql.Char(7), month], u: [sql.Int, userId] },
  );
  return r.recordset.map(mapLine);
}

export async function markPaid(month, userId, method, by) {
  const r = await query(
    `UPDATE l SET PaidAt = SYSUTCDATETIME(), PaidBy = @b, PaidMethod = @pm FROM dbo.PayrollLines l
     JOIN dbo.PayrollRuns r ON r.Month = l.Month AND r.Status = 'LOCKED'
     WHERE l.Month = @m AND l.UserId = @u AND l.PaidAt IS NULL`,
    { m: [sql.Char(7), month], u: [sql.Int, userId], pm: [sql.VarChar(10), method], b: [sql.Int, by] },
  );
  return r.rowsAffected[0] === 1;
}

export async function ack(month, userId) {
  const r = await query('UPDATE dbo.PayrollLines SET AckAt = COALESCE(AckAt, SYSUTCDATETIME()) WHERE Month = @m AND UserId = @u', {
    m: [sql.Char(7), month],
    u: [sql.Int, userId],
  });
  return r.rowsAffected[0] === 1;
}

/** Tháng đã chốt (mới nhất trước) — cho trang "Giờ công của tôi". */
export async function lockedMonthsFor(userId) {
  const r = await query(
    `SELECT l.Month FROM dbo.PayrollLines l JOIN dbo.PayrollRuns r ON r.Month = l.Month AND r.Status = 'LOCKED'
     WHERE l.UserId = @u ORDER BY l.Month DESC`,
    { u: [sql.Int, userId] },
  );
  return r.recordset.map((x) => x.Month);
}

/** Lịch làm của các người trong [from, to] (ngày VN) — có userId phẳng để tính lương. */
export async function rosters(from, to) {
  const r = await query('SELECT RosterId, UserId, WorkDate, StartTime, EndTime FROM dbo.Rosters WHERE WorkDate BETWEEN @f AND @t', {
    f: [sql.Date, from],
    t: [sql.Date, to],
  });
  return r.recordset.map((x) => ({
    rosterId: x.RosterId,
    userId: x.UserId,
    workDate: day(x.WorkDate),
    startTime: time5(x.StartTime),
    endTime: time5(x.EndTime),
  }));
}

/** Doanh thu và giờ mở / đóng của các ca thu ngân trong [from, to) — báo cáo % tiền lương theo ca. */
export async function shiftsWithRevenue(fromUtc, toUtc) {
  const r = await query(
    `SELECT s.ShiftId, s.OpenedAt, s.ClosedAt, ISNULL(SUM(p.AmountDue), 0) AS Revenue
     FROM dbo.Shifts s LEFT JOIN dbo.Payments p ON p.ShiftId = s.ShiftId
     WHERE s.OpenedAt >= @f AND s.OpenedAt < @t GROUP BY s.ShiftId, s.OpenedAt, s.ClosedAt ORDER BY s.OpenedAt`,
    { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] },
  );
  return r.recordset.map((x) => ({ shiftId: x.ShiftId, openedAt: x.OpenedAt, closedAt: x.ClosedAt, revenue: Number(x.Revenue) }));
}

/** Số lần sửa / thêm tay chấm công trong [from, to) theo người sửa. */
export async function manualEdits(fromUtc, toUtc) {
  const r = await query(
    `SELECT a.EditedBy, u.FullName, COUNT(*) AS N FROM dbo.Attendance a JOIN dbo.Users u ON u.UserId = a.EditedBy
     WHERE a.EditedAt >= @f AND a.EditedAt < @t GROUP BY a.EditedBy, u.FullName ORDER BY COUNT(*) DESC`,
    { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] },
  );
  return r.recordset.map((x) => ({ userId: x.EditedBy, fullName: x.FullName, count: x.N }));
}
