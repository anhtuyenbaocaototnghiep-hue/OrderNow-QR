// Nhật ký thao tác (FEATURE-035, ADR-006 D-26): chỉ thêm + đọc; trigger TR_AuditLogs_ReadOnly chặn sửa; xóa chỉ do job giữ 12 tháng.
import { query, sql } from '../db.js';

export async function insert(e) {
  await query(
    `INSERT dbo.AuditLogs (UserId, UserName, Role, Action, Entity, EntityId, BeforeJson, AfterJson, Ip, UserAgent)
     VALUES (@u, @un, @r, @a, @e, @eid, @b, @af, @ip, @ua)`,
    {
      u: [sql.Int, e.userId ?? null],
      un: [sql.NVarChar(100), e.userName ?? null],
      r: [sql.VarChar(10), e.role ?? null],
      a: [sql.VarChar(60), e.action],
      e: [sql.VarChar(40), e.entity],
      eid: [sql.NVarChar(60), e.entityId ?? null],
      b: [sql.NVarChar(sql.MAX), e.beforeJson ?? null],
      af: [sql.NVarChar(sql.MAX), e.afterJson ?? null],
      ip: [sql.VarChar(45), e.ip ?? null],
      ua: [sql.NVarChar(200), e.userAgent ?? null],
    },
  );
}

/** Ảnh chụp một dòng trước khi đổi (FOR JSON — kết quả dài bị SQL Server cắt thành nhiều dòng → nối lại). */
export async function snapshot(table, pk, id) {
  if (!/^[A-Za-z]+$/.test(table) || !/^[A-Za-z]+$/.test(pk)) throw new Error('snapshot: tên bảng không hợp lệ');
  const r = await query(`SELECT * FROM dbo.${table} WHERE ${pk} = @id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES`, {
    id: [sql.Int, id],
  });
  const text = r.recordset.map((row) => Object.values(row)[0]).join('');
  return text ? JSON.parse(text) : null;
}

export async function settingsSnapshot() {
  const r = await query('SELECT SettingKey, SettingValue FROM dbo.Settings ORDER BY SettingKey');
  return Object.fromEntries(r.recordset.map((x) => [x.SettingKey, x.SettingValue]));
}

const map = (r) => ({
  auditId: Number(r.AuditId),
  at: r.At,
  user: r.UserId ? { userId: r.UserId, fullName: r.UserName, role: r.Role } : null,
  action: r.Action,
  entity: r.Entity,
  entityId: r.EntityId,
  before: r.BeforeJson ? JSON.parse(r.BeforeJson) : null,
  after: r.AfterJson ? JSON.parse(r.AfterJson) : null,
  ip: r.Ip,
  userAgent: r.UserAgent,
});

export async function list({ fromUtc, toUtc, userId = null, entity = null, entityId = null, action = null, page = 1, pageSize = 50 }) {
  const p = {
    f: [sql.DateTime2(0), fromUtc],
    t: [sql.DateTime2(0), toUtc],
    u: [sql.Int, userId],
    e: [sql.VarChar(40), entity],
    eid: [sql.NVarChar(60), entityId],
    a: [sql.VarChar(61), action ? `${action}%` : null],
    off: [sql.Int, (page - 1) * pageSize],
    n: [sql.Int, pageSize],
  };
  const where = `At >= @f AND At < @t AND (@u IS NULL OR UserId = @u) AND (@e IS NULL OR Entity = @e)
                 AND (@eid IS NULL OR EntityId = @eid) AND (@a IS NULL OR Action LIKE @a)`;
  const [rows, total] = await Promise.all([
    query(`SELECT * FROM dbo.AuditLogs WHERE ${where} ORDER BY At DESC, AuditId DESC OFFSET @off ROWS FETCH NEXT @n ROWS ONLY`, p),
    query(`SELECT COUNT(*) AS N FROM dbo.AuditLogs WHERE ${where}`, p),
  ]);
  return { rows: rows.recordset.map(map), total: total.recordset[0].N, page, pageSize };
}

/** Giá trị cho bộ lọc: thực thể + người đã có trong nhật ký. */
export async function facets() {
  const [entities, users] = await Promise.all([
    query('SELECT DISTINCT Entity FROM dbo.AuditLogs ORDER BY Entity'),
    query('SELECT UserId, MAX(UserName) AS UserName FROM dbo.AuditLogs WHERE UserId IS NOT NULL GROUP BY UserId ORDER BY MAX(UserName)'),
  ]);
  return {
    entities: entities.recordset.map((x) => x.Entity),
    users: users.recordset.map((x) => ({ userId: x.UserId, fullName: x.UserName })),
  };
}

/** Job giữ 12 tháng: xóa theo lô để không khóa bảng lâu. */
export async function purgeOlderThan(months) {
  let total = 0;
  for (;;) {
    const r = await query('DELETE TOP (5000) FROM dbo.AuditLogs WHERE At < DATEADD(MONTH, -@m, SYSUTCDATETIME())', { m: [sql.Int, months] });
    total += r.rowsAffected[0];
    if (r.rowsAffected[0] < 5000) return total;
  }
}
