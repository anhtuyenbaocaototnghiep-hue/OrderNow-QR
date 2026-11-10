// Gọi nhân viên (FEATURE-021).
import { query, sql } from '../db.js';

const SELECT = `
  SELECT c.CallId, c.SessionId, c.Type, c.Message, c.RequestedAt, c.HandledAt, c.HandledBy, u.FullName AS HandledByName,
         t.TableId, t.Code AS TableCode, t.Name AS TableName, tt.TableId AS ToTableId, tt.Code AS ToTableCode, tt.Name AS ToTableName,
         -- F-087 (ADR-048 D-213): bàn đích đang có bao nhiêu nhóm khác (để quầy quyết chuyển hay thu chung)
         (SELECT COUNT(*) FROM dbo.Sessions ds WHERE ds.TableId = c.ToTableId AND ds.Status <> 'CLOSED' AND ds.SessionId <> c.SessionId) AS ToTableGroups
  FROM dbo.StaffCalls c
  JOIN dbo.Sessions s ON s.SessionId = c.SessionId
  JOIN dbo.Tables t ON t.TableId = s.TableId
  LEFT JOIN dbo.Tables tt ON tt.TableId = c.ToTableId
  LEFT JOIN dbo.Users u ON u.UserId = c.HandledBy`;

export const map = (r) =>
  r && {
    callId: r.CallId,
    type: r.Type ?? 'STAFF', // F-086: 'MOVE' = khách xin chuyển nhóm sang toTable
    sessionId: r.SessionId.toLowerCase(),
    table: { tableId: r.TableId, code: r.TableCode, name: r.TableName },
    toTable: r.ToTableId ? { tableId: r.ToTableId, code: r.ToTableCode, name: r.ToTableName, openGroups: r.ToTableGroups ?? 0 } : null,
    message: r.Message,
    requestedAt: r.RequestedAt,
    handledAt: r.HandledAt,
    handledBy: r.HandledBy ? r.HandledByName : null,
  };

/** Tạo yêu cầu nếu phiên còn mở và không có yêu cầu nào trong `cooldownSec` giây gần nhất (chống spam — một câu lệnh, không tách kiểm-rồi-ghi). */
export async function create(sessionId, message, cooldownSec) {
  const r = await query(
    `INSERT dbo.StaffCalls (SessionId, Message)
     OUTPUT inserted.CallId
     SELECT @s, @m
     WHERE EXISTS (SELECT 1 FROM dbo.Sessions WITH (UPDLOCK, HOLDLOCK) WHERE SessionId = @s AND Status <> 'CLOSED')
       AND NOT EXISTS (SELECT 1 FROM dbo.StaffCalls WITH (UPDLOCK, HOLDLOCK)
                       WHERE SessionId = @s AND Type = 'STAFF' AND RequestedAt > DATEADD(SECOND, -@cool, SYSUTCDATETIME()))`,
    { s: [sql.UniqueIdentifier, sessionId], m: [sql.NVarChar(100), message || null], cool: [sql.Int, cooldownSec] },
  );
  return r.recordset[0]?.CallId ?? null;
}

export async function findById(id) {
  const r = await query(`${SELECT} WHERE c.CallId = @id`, { id: [sql.Int, id] });
  return map(r.recordset[0]);
}

export async function lastForSession(sessionId) {
  const r = await query(`${SELECT} WHERE c.SessionId = @s AND c.Type = 'STAFF' ORDER BY c.RequestedAt DESC, c.CallId DESC`, {
    s: [sql.UniqueIdentifier, sessionId],
  });
  return map(r.recordset[0]);
}

/** Yêu cầu chưa xử lý của phiên chưa đóng. */
export async function listOpen() {
  const r = await query(`${SELECT} WHERE c.HandledAt IS NULL AND s.Status <> 'CLOSED' ORDER BY c.RequestedAt`);
  return r.recordset.map(map);
}

export async function handle(id, userId) {
  const r = await query('UPDATE dbo.StaffCalls SET HandledAt = SYSUTCDATETIME(), HandledBy = @u WHERE CallId = @id AND HandledAt IS NULL', {
    id: [sql.Int, id],
    u: [sql.Int, userId],
  });
  return r.rowsAffected[0] > 0;
}

/**
 * F-086 (ADR-047 D-208): khách xin chuyển nhóm sang bàn khác — mỗi phiên tối đa một yêu cầu đang chờ (đổi ý thì cập nhật bàn đích + giờ).
 * Một batch có khóa (UPDLOCK, HOLDLOCK) + chỉ mục duy nhất UX_StaffCalls_OpenMove → hai lần bấm cùng lúc không tạo hai yêu cầu. Trả CallId (null nếu phiên đã đóng).
 */
export async function upsertMove(sessionId, toTableId) {
  const r = await query(
    `SET XACT_ABORT ON;
     BEGIN TRAN;
     DECLARE @id INT = (SELECT CallId FROM dbo.StaffCalls WITH (UPDLOCK, HOLDLOCK) WHERE SessionId = @s AND Type = 'MOVE' AND HandledAt IS NULL);
     IF @id IS NOT NULL
       UPDATE dbo.StaffCalls SET ToTableId = @t, RequestedAt = SYSUTCDATETIME() WHERE CallId = @id;
     ELSE IF EXISTS (SELECT 1 FROM dbo.Sessions WITH (UPDLOCK, HOLDLOCK) WHERE SessionId = @s AND Status <> 'CLOSED')
     BEGIN
       INSERT dbo.StaffCalls (SessionId, Type, ToTableId) VALUES (@s, 'MOVE', @t);
       SET @id = SCOPE_IDENTITY();
     END
     COMMIT;
     SELECT @id AS CallId;`,
    { s: [sql.UniqueIdentifier, sessionId], t: [sql.Int, toTableId] },
  );
  return r.recordset[0]?.CallId ?? null;
}
