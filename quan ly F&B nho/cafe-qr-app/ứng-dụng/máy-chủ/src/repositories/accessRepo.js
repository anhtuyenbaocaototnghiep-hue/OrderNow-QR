// F-079 (ADR-037): yêu cầu xin quyền — nhân viên gửi, chủ quán duyệt / từ chối. Mỗi người một yêu cầu đang chờ cho mỗi quyền.
import { query, sql, sqlErrorNumber } from '../db.js';

const SELECT = `SELECT r.RequestId, r.UserId, u.FullName, u.Username, u.Role, r.Capability, r.Reason, r.Status, r.CreatedAt,
                       r.DecidedBy, d.FullName AS DecidedByName, r.DecidedAt, r.Duration, r.DecisionNote
                FROM dbo.AccessRequests r
                JOIN dbo.Users u ON u.UserId = r.UserId
                LEFT JOIN dbo.Users d ON d.UserId = r.DecidedBy`;

const map = (r) =>
  r && {
    requestId: r.RequestId,
    user: { userId: r.UserId, fullName: r.FullName, username: r.Username, role: r.Role },
    capability: r.Capability,
    reason: r.Reason ?? null,
    status: r.Status,
    createdAt: r.CreatedAt,
    decidedBy: r.DecidedBy ? { userId: r.DecidedBy, fullName: r.DecidedByName } : null,
    decidedAt: r.DecidedAt ?? null,
    duration: r.Duration ?? null,
    decisionNote: r.DecisionNote ?? null,
  };

export async function find(id) {
  const r = await query(`${SELECT} WHERE r.RequestId = @id`, { id: [sql.Int, id] });
  return map(r.recordset[0]);
}

const findPending = async (userId, capability) =>
  map(
    (
      await query(`${SELECT} WHERE r.UserId = @u AND r.Capability = @c AND r.Status = 'PENDING'`, {
        u: [sql.Int, userId],
        c: [sql.VarChar(30), capability],
      })
    ).recordset[0],
  );

/** Tạo yêu cầu; đã có yêu cầu đang chờ cùng quyền → trả yêu cầu đó ({ created: false }). */
export async function create({ userId, capability, reason }) {
  const existing = await findPending(userId, capability);
  if (existing) return { request: existing, created: false };
  try {
    const r = await query('INSERT dbo.AccessRequests (UserId, Capability, Reason) OUTPUT inserted.RequestId VALUES (@u, @c, @why)', {
      u: [sql.Int, userId],
      c: [sql.VarChar(30), capability],
      why: [sql.NVarChar(200), reason ?? null],
    });
    return { request: await find(r.recordset[0].RequestId), created: true };
  } catch (err) {
    if ([2601, 2627].includes(sqlErrorNumber(err))) return { request: await findPending(userId, capability), created: false }; // hai lần bấm cùng lúc
    throw err;
  }
}

export async function list({ status = 'PENDING', limit = 100 } = {}) {
  const r = await query(
    `SELECT TOP (@n) * FROM (${SELECT}) x ${status === 'PENDING' ? "WHERE x.Status = 'PENDING'" : ''} ORDER BY x.CreatedAt DESC, x.RequestId DESC`,
    {
      n: [sql.Int, limit],
    },
  );
  return r.recordset.map(map);
}

export async function mine(userId, days = 7) {
  const r = await query(`${SELECT} WHERE r.UserId = @u AND r.CreatedAt >= DATEADD(DAY, -@d, SYSUTCDATETIME()) ORDER BY r.CreatedAt DESC, r.RequestId DESC`, {
    u: [sql.Int, userId],
    d: [sql.Int, days],
  });
  return r.recordset.map(map);
}

export async function countPending(userId = null) {
  const r = await query(`SELECT COUNT(*) AS n FROM dbo.AccessRequests WHERE Status = 'PENDING'${userId ? ' AND UserId = @u' : ''}`, { u: [sql.Int, userId] });
  return r.recordset[0].n;
}

/** Chốt yêu cầu đang chờ → true; đã được xử lý trước đó → false. */
export async function decide(id, { status, decidedBy, duration = null, note = null }) {
  const r = await query(
    `UPDATE dbo.AccessRequests SET Status = @st, DecidedBy = @by, DecidedAt = SYSUTCDATETIME(), Duration = @dur, DecisionNote = @note
     WHERE RequestId = @id AND Status = 'PENDING'; SELECT @@ROWCOUNT AS n;`,
    {
      id: [sql.Int, id],
      st: [sql.VarChar(10), status],
      by: [sql.Int, decidedBy],
      dur: [sql.VarChar(10), duration],
      note: [sql.NVarChar(200), note],
    },
  );
  return r.recordset[0].n > 0;
}
