// F-071 (ADR-029 D-120): lần nhập sai mật khẩu — đăng nhập (theo tên + máy) và tài khoản duyệt ở quầy (theo tên + người đứng quầy).
import { query, sql } from '../db.js';

const keyWhere = `Kind = @k AND Username = @u
  AND (@actor IS NULL OR ActorUserId = @actor) AND (@ip IS NULL OR Ip = @ip) AND At >= @since`;
const keyParams = ({ kind, username, actorUserId = null, ip = null, since }) => ({
  k: [sql.VarChar(10), kind],
  u: [sql.NVarChar(50), username],
  actor: [sql.Int, actorUserId],
  ip: [sql.VarChar(45), ip],
  since: [sql.DateTime2(0), since],
});

/** Số lần sai của khóa (kind, username, actor | ip) từ `since`. */
export async function count(key) {
  const r = await query(`SELECT COUNT(*) AS N FROM dbo.AuthFailures WHERE ${keyWhere}`, keyParams(key));
  return r.recordset[0].N;
}

/** Ghi một lần sai (dọn dòng quá 1 ngày cùng lúc) → số lần sai của khóa từ `since`, kể cả lần này. */
export async function add(key) {
  const r = await query(
    `DELETE dbo.AuthFailures WHERE At < DATEADD(DAY, -1, SYSUTCDATETIME());
     INSERT dbo.AuthFailures (Kind, Username, ActorUserId, Ip) VALUES (@k, @u, @actor, @ip);
     SELECT COUNT(*) AS N FROM dbo.AuthFailures WHERE ${keyWhere};`,
    keyParams(key),
  );
  return r.recordset[0].N;
}
