// F-060 (ADR-020): số liệu ca để phát hiện bất thường, bảng Alerts, hàng đợi email AlertOutbox.
// Hủy món không có ShiftId → gán ca theo giờ mở – đóng ca; chỉ tính món ĐÃ PHA bị hủy (StockMode = WASTE).
import { query, sql, sqlErrorNumber } from '../db.js';

const isDuplicate = (err) => [2601, 2627].includes(sqlErrorNumber(err));

const METRICS = `
  SELECT s.ShiftId, s.OpenedAt, s.ClosedAt, s.Difference, s.OpenedBy, ou.FullName AS OpenedByName, s.ClosedBy, cu.FullName AS ClosedByName,
         (SELECT COUNT(*) FROM dbo.Payments p WHERE p.ShiftId = s.ShiftId) AS PaymentCount,
         (SELECT COUNT(*) FROM dbo.Payments p WHERE p.ShiftId = s.ShiftId AND p.Method = 'TRANSFER') AS TransferCount,
         (SELECT ISNULL(SUM(v.Qty), 0) FROM dbo.OrderItemVoids v
           WHERE v.StockMode = 'WASTE' AND v.CreatedAt >= s.OpenedAt AND v.CreatedAt <= ISNULL(s.ClosedAt, SYSUTCDATETIME())) AS VoidsQty,
         (SELECT COUNT(*) FROM dbo.Refunds r WHERE r.ShiftId = s.ShiftId) AS RefundCount,
         (SELECT COUNT(*) FROM dbo.Payments p WHERE p.ShiftId = s.ShiftId AND p.ManualDiscount > 0) AS ManualCount
  FROM dbo.Shifts s
  JOIN dbo.Users ou ON ou.UserId = s.OpenedBy
  LEFT JOIN dbo.Users cu ON cu.UserId = s.ClosedBy`;

const mapMetrics = (r) =>
  r && {
    shiftId: r.ShiftId,
    openedAt: r.OpenedAt,
    closedAt: r.ClosedAt,
    difference: r.Difference === null ? null : Number(r.Difference),
    openedBy: { userId: r.OpenedBy, fullName: r.OpenedByName },
    closedBy: r.ClosedBy ? { userId: r.ClosedBy, fullName: r.ClosedByName } : null,
    paymentCount: r.PaymentCount,
    transferCount: r.TransferCount,
    voidsQty: Number(r.VoidsQty),
    refundCount: r.RefundCount,
    manualCount: r.ManualCount,
  };

export async function shiftMetrics(shiftId) {
  const r = await query(`${METRICS} WHERE s.ShiftId = @id`, { id: [sql.Int, shiftId] });
  return mapMetrics(r.recordset[0]);
}

/** Số liệu của tối đa `limit` ca đã đóng TRƯỚC ca này (mới nhất trước) — để tính mức bình thường. */
export async function metricsHistory(shiftId, limit = 30) {
  const r = await query(
    `SELECT TOP (@n) * FROM (${METRICS}) m
     WHERE m.ClosedAt IS NOT NULL AND m.ShiftId <> @id
       AND m.ClosedAt <= (SELECT ClosedAt FROM dbo.Shifts WHERE ShiftId = @id)
     ORDER BY m.ClosedAt DESC`,
    { id: [sql.Int, shiftId], n: [sql.Int, limit] },
  );
  return r.recordset.map(mapMetrics);
}

const BY_USER = {
  VOIDS: `SELECT v.CreatedBy AS UserId, u.FullName, SUM(v.Qty) AS Cnt FROM dbo.OrderItemVoids v JOIN dbo.Users u ON u.UserId = v.CreatedBy
          JOIN dbo.Shifts s ON s.ShiftId = @id
          WHERE v.StockMode = 'WASTE' AND v.CreatedAt >= s.OpenedAt AND v.CreatedAt <= ISNULL(s.ClosedAt, SYSUTCDATETIME())
          GROUP BY v.CreatedBy, u.FullName`,
  REFUNDS: `SELECT r.CreatedBy AS UserId, u.FullName, COUNT(*) AS Cnt FROM dbo.Refunds r JOIN dbo.Users u ON u.UserId = r.CreatedBy
            WHERE r.ShiftId = @id GROUP BY r.CreatedBy, u.FullName`,
  MANUAL_DISCOUNT: `SELECT p.ReceivedBy AS UserId, u.FullName, COUNT(*) AS Cnt FROM dbo.Payments p JOIN dbo.Users u ON u.UserId = p.ReceivedBy
                    WHERE p.ShiftId = @id AND p.ManualDiscount > 0 GROUP BY p.ReceivedBy, u.FullName`,
  TRANSFER_SHARE: `SELECT p.ReceivedBy AS UserId, u.FullName, SUM(CASE WHEN p.Method = 'TRANSFER' THEN 1 ELSE 0 END) AS Cnt, COUNT(*) AS Total
                   FROM dbo.Payments p JOIN dbo.Users u ON u.UserId = p.ReceivedBy
                   WHERE p.ShiftId = @id GROUP BY p.ReceivedBy, u.FullName`,
};

/** Ai liên quan tới dấu hiệu trong ca (nhiều nhất trước). */
export async function byUser(shiftId, kind) {
  if (!BY_USER[kind]) return [];
  const r = await query(BY_USER[kind], { id: [sql.Int, shiftId] });
  return r.recordset
    .map((x) => ({ userId: x.UserId, fullName: x.FullName, count: Number(x.Cnt), ...(x.Total !== undefined ? { total: x.Total } : {}) }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
}

// ---------- Alerts ----------
const ALERT_SELECT = `
  SELECT a.*, u.FullName AS UserName, h.FullName AS HandledByName
  FROM dbo.Alerts a
  LEFT JOIN dbo.Users u ON u.UserId = a.UserId
  LEFT JOIN dbo.Users h ON h.UserId = a.HandledBy`;

const mapAlert = (r) =>
  r && {
    alertId: r.AlertId,
    kind: r.Kind,
    severity: r.Severity,
    shiftId: r.ShiftId,
    user: r.UserId ? { userId: r.UserId, fullName: r.UserName } : null,
    title: r.Title,
    detail: r.Detail ? JSON.parse(r.Detail) : null,
    status: r.Status,
    note: r.Note,
    handledBy: r.HandledBy ? { userId: r.HandledBy, fullName: r.HandledByName } : null,
    handledAt: r.HandledAt,
    createdAt: r.CreatedAt,
  };

/** Tạo cảnh báo; DedupeKey đã có → null (chạy lại phát hiện không tạo trùng). */
export async function createAlert({ kind, severity, shiftId = null, userId = null, title, detail, dedupeKey }) {
  try {
    const r = await query(
      `INSERT dbo.Alerts (Kind, Severity, ShiftId, UserId, Title, Detail, DedupeKey) OUTPUT inserted.AlertId
       VALUES (@k, @sev, @s, @u, @t, @d, @key)`,
      {
        k: [sql.VarChar(20), kind],
        sev: [sql.VarChar(10), severity],
        s: [sql.Int, shiftId],
        u: [sql.Int, userId],
        t: [sql.NVarChar(200), title.slice(0, 200)],
        d: [sql.NVarChar(sql.MAX), JSON.stringify(detail ?? null)],
        key: [sql.VarChar(100), dedupeKey],
      },
    );
    return findAlert(r.recordset[0].AlertId);
  } catch (err) {
    if (isDuplicate(err)) return null;
    throw err;
  }
}

export async function findAlert(id) {
  const r = await query(`${ALERT_SELECT} WHERE a.AlertId = @id`, { id: [sql.Int, id] });
  return mapAlert(r.recordset[0]);
}

/** Cảnh báo theo khóa chống trùng (chạy lại sau lỗi giữa chừng) — null nếu chưa có. */
export async function findAlertByKey(dedupeKey) {
  const r = await query('SELECT AlertId FROM dbo.Alerts WHERE DedupeKey = @k', { k: [sql.VarChar(100), dedupeKey] });
  return r.recordset[0] ? findAlert(r.recordset[0].AlertId) : null;
}

export async function listAlerts({ status = 'NEW', limit = 100 } = {}) {
  const r = await query(
    `SELECT TOP (@n) * FROM (${ALERT_SELECT}) x ${status === 'NEW' ? "WHERE x.Status = 'NEW'" : ''} ORDER BY x.CreatedAt DESC, x.AlertId DESC`,
    {
      n: [sql.Int, limit],
    },
  );
  return r.recordset.map(mapAlert);
}

export async function countNew() {
  const r = await query("SELECT COUNT(*) AS n FROM dbo.Alerts WHERE Status = 'NEW'");
  return r.recordset[0].n;
}

export async function setAlertStatus(id, { status, note = null, userId }) {
  const r = await query(
    `UPDATE dbo.Alerts SET Status = @st, Note = COALESCE(@note, Note), HandledBy = @u, HandledAt = SYSUTCDATETIME()
     WHERE AlertId = @id; SELECT @@ROWCOUNT AS n;`,
    { id: [sql.Int, id], st: [sql.VarChar(10), status], note: [sql.NVarChar(300), note], u: [sql.Int, userId] },
  );
  return r.recordset[0].n ? findAlert(id) : null;
}

// ---------- Hàng đợi email ----------
const mapOutbox = (r) =>
  r && {
    outboxId: r.OutboxId,
    kind: r.Kind,
    alertId: r.AlertId,
    dedupeKey: r.DedupeKey,
    recipients: r.Recipients,
    subject: r.Subject,
    text: r.BodyText,
    html: r.BodyHtml,
    status: r.Status,
    attempts: r.Attempts,
    nextAttemptAt: r.NextAttemptAt,
    lastError: r.LastError,
    createdAt: r.CreatedAt,
    sentAt: r.SentAt,
  };

/** Thêm email vào hàng đợi; DedupeKey đã có → null (không gửi trùng). notBefore: hoãn (giờ yên lặng). */
export async function enqueue({ kind, alertId = null, dedupeKey = null, recipients, subject, text, html, notBefore = null }) {
  try {
    const r = await query(
      `INSERT dbo.AlertOutbox (Kind, AlertId, DedupeKey, Recipients, Subject, BodyText, BodyHtml, NextAttemptAt)
       OUTPUT inserted.* VALUES (@k, @a, @key, @to, @sub, @txt, @html, COALESCE(@nb, SYSUTCDATETIME()))`,
      {
        k: [sql.VarChar(10), kind],
        a: [sql.Int, alertId],
        key: [sql.VarChar(120), dedupeKey],
        to: [sql.NVarChar(600), recipients.join(', ')],
        sub: [sql.NVarChar(250), subject.slice(0, 250)],
        txt: [sql.NVarChar(sql.MAX), text],
        html: [sql.NVarChar(sql.MAX), html],
        nb: [sql.DateTime2(0), notBefore],
      },
    );
    return mapOutbox(r.recordset[0]);
  } catch (err) {
    if (isDuplicate(err)) return null;
    throw err;
  }
}

export async function outboxExists(dedupeKey) {
  const r = await query('SELECT 1 AS x FROM dbo.AlertOutbox WHERE DedupeKey = @k', { k: [sql.VarChar(120), dedupeKey] });
  return r.recordset.length > 0;
}

/**
 * Nhận tối đa `limit` email tới giờ gửi → SENDING (READPAST: hai tiến trình không nhận trùng).
 * Dòng SENDING quá 10 phút (tiến trình chết giữa chừng) được nhận lại.
 * NextAttemptAt là DATETIME2(0) — SQL Server làm tròn LÊN tới giây → cho lệch 1 giây, không thì email vừa xếp hàng
 * (giờ đã bị làm tròn lên) bị bỏ qua ở lần gửi ngay sau và phải chờ thêm một phút.
 */
export async function claimDue(limit) {
  const r = await query(
    `UPDATE TOP (@n) o SET Status = 'SENDING', NextAttemptAt = SYSUTCDATETIME()
     OUTPUT inserted.*
     FROM dbo.AlertOutbox o WITH (ROWLOCK, READPAST, UPDLOCK)
     WHERE (o.Status = 'PENDING' AND o.NextAttemptAt <= DATEADD(SECOND, 1, SYSUTCDATETIME()))
        OR (o.Status = 'SENDING' AND o.NextAttemptAt <= DATEADD(MINUTE, -10, SYSUTCDATETIME()))`,
    { n: [sql.Int, limit] },
  );
  return r.recordset.map(mapOutbox).sort((a, b) => a.outboxId - b.outboxId);
}

export async function markSent(id) {
  await query("UPDATE dbo.AlertOutbox SET Status = 'SENT', SentAt = SYSUTCDATETIME(), Attempts = Attempts + 1, LastError = NULL WHERE OutboxId = @id", {
    id: [sql.Int, id],
  });
}

/** Gửi lỗi: nextAt = null → FAILED (hết lượt thử); còn lượt → PENDING, thử lại lúc nextAt. */
export async function markFailed(id, { error, attempts, nextAt }) {
  await query(
    `UPDATE dbo.AlertOutbox SET Status = @st, Attempts = @a, LastError = @e, NextAttemptAt = COALESCE(@next, NextAttemptAt)
     WHERE OutboxId = @id`,
    {
      id: [sql.Int, id],
      st: [sql.VarChar(10), nextAt ? 'PENDING' : 'FAILED'],
      a: [sql.Int, attempts],
      e: [sql.NVarChar(400), String(error).slice(0, 400)],
      next: [sql.DateTime2(0), nextAt],
    },
  );
}

/** Ghi lại email đã gửi thẳng (email thử) — để tính vào giới hạn mỗi giờ và hiện "lần gửi gần nhất". */
export async function logSent({ kind, recipients, subject, text, html }) {
  await query(
    `INSERT dbo.AlertOutbox (Kind, Recipients, Subject, BodyText, BodyHtml, Status, Attempts, SentAt)
     VALUES (@kind, @to, @sub, @text, @html, 'SENT', 1, SYSUTCDATETIME())`,
    {
      kind: [sql.VarChar(10), kind],
      to: [sql.NVarChar(600), recipients.join(', ')],
      sub: [sql.NVarChar(250), subject.slice(0, 250)],
      text: [sql.NVarChar(sql.MAX), text],
      html: [sql.NVarChar(sql.MAX), html],
    },
  );
}

/** Quản lý bấm "Gửi lại email lỗi": FAILED → PENDING, đếm lại từ đầu. → số email xếp lại */
export async function retryFailed() {
  const r = await query(
    "UPDATE dbo.AlertOutbox SET Status = 'PENDING', Attempts = 0, NextAttemptAt = SYSUTCDATETIME(), LastError = NULL WHERE Status = 'FAILED'",
  );
  return r.rowsAffected[0] ?? 0;
}

export async function sentLastHour() {
  const r = await query("SELECT COUNT(*) AS n FROM dbo.AlertOutbox WHERE Status = 'SENT' AND SentAt >= DATEADD(HOUR, -1, SYSUTCDATETIME())");
  return r.recordset[0].n;
}

export async function outboxStatus() {
  const r = await query(`
    SELECT (SELECT COUNT(*) FROM dbo.AlertOutbox WHERE Status IN ('PENDING', 'SENDING')) AS Pending,
           (SELECT COUNT(*) FROM dbo.AlertOutbox WHERE Status = 'FAILED') AS Failed;
    SELECT TOP 1 Subject, SentAt FROM dbo.AlertOutbox WHERE Status = 'SENT' ORDER BY SentAt DESC, OutboxId DESC;
    SELECT TOP 1 Subject, LastError, Status, NextAttemptAt FROM dbo.AlertOutbox WHERE LastError IS NOT NULL AND Status <> 'SENT' ORDER BY OutboxId DESC;`);
  const [counts, sent, failed] = r.recordsets;
  return {
    pending: counts[0].Pending,
    failed: counts[0].Failed,
    lastSent: sent[0] ? { subject: sent[0].Subject, at: sent[0].SentAt } : null,
    lastError: failed[0] ? { subject: failed[0].Subject, error: failed[0].LastError, status: failed[0].Status, retryAt: failed[0].NextAttemptAt } : null,
  };
}

/** Lần cuối một khóa cài đặt được lưu (vd alert.emails) — null nếu chưa từng lưu. */
export async function settingUpdatedAt(key) {
  const r = await query('SELECT UpdatedAt FROM dbo.Settings WHERE SettingKey = @k', { k: [sql.NVarChar(50), key] });
  return r.recordset[0]?.UpdatedAt ?? null;
}

// ---------- Tổng kết ngày ----------
export async function dayStats(fromUtc, toUtc) {
  const p = { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] };
  const r = await query(
    `SELECT ISNULL(SUM(CASE WHEN Method = 'CASH' THEN AmountDue END), 0) AS CashIn,
            ISNULL(SUM(CASE WHEN Method = 'TRANSFER' THEN AmountDue END), 0) AS TransferIn,
            COUNT(*) AS Payments,
            (SELECT ISNULL(SUM(Amount), 0) FROM dbo.Refunds WHERE CreatedAt >= @f AND CreatedAt < @t) AS Refunds,
            (SELECT COUNT(*) FROM dbo.Reviews WHERE HasLow = 1 AND CreatedAt >= @f AND CreatedAt < @t) AS LowReviews
     FROM dbo.Payments WHERE PaidAt >= @f AND PaidAt < @t;
     SELECT s.ShiftId, u.FullName AS OpenedByName, s.ClosedAt, s.Difference
     FROM dbo.Shifts s JOIN dbo.Users u ON u.UserId = s.OpenedBy
     WHERE s.ClosedAt >= @f AND s.ClosedAt < @t ORDER BY s.ClosedAt;
     SELECT Kind, Severity, Title FROM dbo.Alerts WHERE CreatedAt >= @f AND CreatedAt < @t ORDER BY CreatedAt;`,
    p,
  );
  const [totals, shifts, alerts] = r.recordsets;
  const t = totals[0];
  return {
    cashIn: Number(t.CashIn),
    transferIn: Number(t.TransferIn),
    payments: t.Payments,
    refunds: Number(t.Refunds),
    lowReviews: t.LowReviews,
    shifts: shifts.map((s) => ({ shiftId: s.ShiftId, openedBy: s.OpenedByName, closedAt: s.ClosedAt, difference: Number(s.Difference) })),
    alerts: alerts.map((a) => ({ kind: a.Kind, severity: a.Severity, title: a.Title })),
  };
}
