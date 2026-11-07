import { inTransaction, query, request, sql, txQuery } from '../db.js';

const map = (r) =>
  r && {
    userId: r.UserId,
    username: r.Username,
    fullName: r.FullName,
    role: r.Role,
    isActive: Boolean(r.IsActive),
    createdAt: r.CreatedAt,
    tourSeenAt: r.TourSeenAt ?? null, // F-061: đã xem hướng dẫn 5 bước ở màn quầy
    hasPin: Boolean(r.HasPin), // F-072: đã đặt PIN chấm công / xác nhận thao tác tiền (không bao giờ trả mã băm)
    positions: r.Positions ? r.Positions.split(',') : null, // F-078: vị trí của nhân viên; null = mọi vị trí
    level: r.StaffLevel ?? 'OFFICIAL', // F-078: PROBATION (thử việc) / OFFICIAL
  };

const COLS =
  'UserId, Username, FullName, Role, IsActive, CreatedAt, TourSeenAt, Positions, StaffLevel, CAST(CASE WHEN PinHash IS NULL THEN 0 ELSE 1 END AS BIT) AS HasPin';
/** F-078: chỉ nhân viên (STAFF) có vị trí / cấp; vai khác lưu NULL / OFFICIAL. */
const positionsCsv = (role, positions) => (role === 'STAFF' && positions?.length ? positions.join(',') : null);
const levelOf = (role, level) => (role === 'STAFF' && level === 'PROBATION' ? 'PROBATION' : 'OFFICIAL');

export async function findById(id) {
  const r = await query(`SELECT ${COLS} FROM dbo.Users WHERE UserId = @id AND DeletedAt IS NULL`, { id: [sql.Int, id] });
  return map(r.recordset[0]);
}

/** Username so sánh không phân biệt hoa/thường (collation CI của DB — BR-004). */
export async function findByUsernameWithHash(username) {
  const r = await query(`SELECT ${COLS}, PasswordHash FROM dbo.Users WHERE Username = @u AND DeletedAt IS NULL`, { u: [sql.NVarChar(50), username] });
  const row = r.recordset[0];
  return row ? { ...map(row), passwordHash: row.PasswordHash } : null;
}

/** F-061 (ADR-021 D-80): xem xong / bỏ qua hướng dẫn — giữ lần đầu (gọi lại không đổi giờ). */
export async function markTourSeen(id) {
  const r = await query('UPDATE dbo.Users SET TourSeenAt = COALESCE(TourSeenAt, SYSUTCDATETIME()) OUTPUT inserted.TourSeenAt WHERE UserId = @id', {
    id: [sql.Int, id],
  });
  return r.recordset[0]?.TourSeenAt ?? null;
}

export async function list() {
  const r = await query(
    `SELECT ${COLS},
       (SELECT COUNT(*) FROM dbo.UserGrants g WHERE g.UserId = Users.UserId AND (g.ExpiresAt IS NULL OR g.ExpiresAt > SYSUTCDATETIME())) AS GrantCount
     FROM dbo.Users WHERE DeletedAt IS NULL ORDER BY Role, Username`,
  );
  return r.recordset.map((row) => ({ ...map(row), grantCount: row.GrantCount })); // F-079: số quyền riêng còn hạn
}

export async function create({ username, passwordHash, fullName, role, positions = null, level = 'OFFICIAL' }) {
  const r = await query(
    `INSERT dbo.Users (Username, PasswordHash, FullName, Role, Positions, StaffLevel)
     OUTPUT inserted.UserId, inserted.Username, inserted.FullName, inserted.Role, inserted.IsActive, inserted.CreatedAt, inserted.Positions, inserted.StaffLevel
     VALUES (@u, @h, @n, @r, @pos, @lv)`,
    {
      u: [sql.NVarChar(50), username],
      h: [sql.NVarChar(255), passwordHash],
      n: [sql.NVarChar(100), fullName],
      r: [sql.VarChar(10), role],
      pos: [sql.VarChar(40), positionsCsv(role, positions)],
      lv: [sql.VarChar(10), levelOf(role, level)],
    },
  );
  return map(r.recordset[0]);
}

// F-036: luôn còn ít nhất một quản lý (ADMIN) đang hoạt động. Khóa U toàn bộ dòng ADMIN đang hoạt động (cùng thứ tự quét)
// → hai quản lý hạ quyền / khóa nhau cùng lúc chạy tuần tự, người sau nhận 50150 LAST_ADMIN.
const LAST_ADMIN_GUARD = (losesAdmin) => `
  SET XACT_ABORT ON;
  BEGIN TRAN;
  DECLARE @Admins INT = (SELECT COUNT(*) FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE Role = 'ADMIN' AND IsActive = 1 AND DeletedAt IS NULL);
  IF (${losesAdmin}) AND @Admins <= 1
     AND EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @id AND Role = 'ADMIN' AND IsActive = 1 AND DeletedAt IS NULL)
  BEGIN ROLLBACK; THROW 50150, 'LAST_ADMIN', 1; END`;

export async function update(id, { fullName, role, positions = null, level = 'OFFICIAL' }) {
  const r = await query(
    `${LAST_ADMIN_GUARD("@r <> 'ADMIN'")}
     UPDATE dbo.Users SET FullName = @n, Role = @r, Positions = @pos, StaffLevel = @lv
     OUTPUT inserted.UserId, inserted.Username, inserted.FullName, inserted.Role, inserted.IsActive, inserted.CreatedAt, inserted.Positions, inserted.StaffLevel
     WHERE UserId = @id AND DeletedAt IS NULL;
     COMMIT;`,
    {
      id: [sql.Int, id],
      n: [sql.NVarChar(100), fullName],
      r: [sql.VarChar(10), role],
      pos: [sql.VarChar(40), positionsCsv(role, positions)],
      lv: [sql.VarChar(10), levelOf(role, level)],
    },
  );
  return map(r.recordset[0]);
}

export async function setPassword(id, passwordHash) {
  const r = await query('UPDATE dbo.Users SET PasswordHash = @h WHERE UserId = @id AND DeletedAt IS NULL', {
    id: [sql.Int, id],
    h: [sql.NVarChar(255), passwordHash],
  });
  return r.rowsAffected[0] > 0;
}

export async function setActive(id, isActive) {
  const r = await query(
    `${LAST_ADMIN_GUARD('@a = 0')}
     UPDATE dbo.Users SET IsActive = @a
     OUTPUT inserted.UserId, inserted.Username, inserted.FullName, inserted.Role, inserted.IsActive, inserted.CreatedAt, inserted.Positions, inserted.StaffLevel
     WHERE UserId = @id AND DeletedAt IS NULL;
     COMMIT;`,
    { id: [sql.Int, id], a: [sql.Bit, isActive] },
  );
  return map(r.recordset[0]);
}

/** Xóa (ADR-004): 'DELETED' (xóa hẳn) | 'ARCHIVED' (xóa mềm vì đã có lịch sử). */
export async function remove(id, actorId) {
  const r = await (
    await request()
  )
    .input('UserId', sql.Int, id)
    .input('ActorId', sql.Int, actorId)
    .output('Result', sql.VarChar(10))
    .execute('dbo.sp_DeleteUser');
  return r.output.Result;
}

// ---- F-079 (ADR-037): quyền riêng từng tài khoản ----
const mapGrant = (r) => ({
  capability: r.Capability,
  effect: r.Effect,
  expiresAt: r.ExpiresAt ?? null,
  grantedBy: r.GrantedBy ? { userId: r.GrantedBy, fullName: r.GrantedByName ?? null } : null,
  grantedAt: r.GrantedAt ?? null,
  note: r.Note ?? null,
});

/** Quyền riêng còn hạn của một người (nạp mỗi request). */
export async function activeGrants(userId) {
  const r = await query('SELECT Capability, Effect, ExpiresAt FROM dbo.UserGrants WHERE UserId = @id AND (ExpiresAt IS NULL OR ExpiresAt > SYSUTCDATETIME())', {
    id: [sql.Int, userId],
  });
  return r.recordset.map(mapGrant);
}

/** Quyền riêng còn hạn kèm người cấp (hộp "Quyền" ở trang Tài khoản). */
export async function grantsOf(userId) {
  const r = await query(
    `SELECT g.Capability, g.Effect, g.ExpiresAt, g.GrantedBy, g.GrantedAt, g.Note, u.FullName AS GrantedByName
     FROM dbo.UserGrants g JOIN dbo.Users u ON u.UserId = g.GrantedBy
     WHERE g.UserId = @id AND (g.ExpiresAt IS NULL OR g.ExpiresAt > SYSUTCDATETIME())`,
    { id: [sql.Int, userId] },
  );
  return r.recordset.map(mapGrant);
}

/** Thay toàn bộ quyền riêng của một người (trong một transaction). grants: [{ capability, effect, expiresAt, note }]. */
export function replaceGrants(userId, grants, grantedBy) {
  return inTransaction(async (tx) => {
    await txQuery(tx, 'DELETE dbo.UserGrants WHERE UserId = @id', { id: [sql.Int, userId] });
    for (const g of grants) {
      await txQuery(tx, 'INSERT dbo.UserGrants (UserId, Capability, Effect, ExpiresAt, GrantedBy, Note) VALUES (@id, @cap, @eff, @exp, @by, @note)', {
        id: [sql.Int, userId],
        cap: [sql.VarChar(30), g.capability],
        eff: [sql.VarChar(5), g.effect],
        exp: [sql.DateTime2(0), g.expiresAt ?? null],
        by: [sql.Int, grantedBy],
        note: [sql.NVarChar(200), g.note ?? null],
      });
    }
  });
}

/** Cho phép một quyền (duyệt xin quyền): ghi đè dòng cũ của quyền đó. */
export async function upsertGrant(userId, { capability, effect, expiresAt = null, note = null }, grantedBy) {
  await query(
    `MERGE dbo.UserGrants WITH (HOLDLOCK) AS t
     USING (SELECT @id AS UserId, @cap AS Capability) AS s ON t.UserId = s.UserId AND t.Capability = s.Capability
     WHEN MATCHED THEN UPDATE SET Effect = @eff, ExpiresAt = @exp, GrantedBy = @by, GrantedAt = SYSUTCDATETIME(), Note = @note
     WHEN NOT MATCHED THEN INSERT (UserId, Capability, Effect, ExpiresAt, GrantedBy, Note) VALUES (@id, @cap, @eff, @exp, @by, @note);`,
    {
      id: [sql.Int, userId],
      cap: [sql.VarChar(30), capability],
      eff: [sql.VarChar(5), effect],
      exp: [sql.DateTime2(0), expiresAt],
      by: [sql.Int, grantedBy],
      note: [sql.NVarChar(200), note],
    },
  );
}

// ---- F-072 (ADR-030 D-125): PIN riêng từng người (bcrypt) ----
export async function pinHash(id) {
  const r = await query('SELECT PinHash FROM dbo.Users WHERE UserId = @id AND DeletedAt IS NULL', { id: [sql.Int, id] });
  return r.recordset[0]?.PinHash ?? null;
}

export async function setPin(id, hash) {
  const r = await query('UPDATE dbo.Users SET PinHash = @h, PinSetAt = CASE WHEN @h IS NULL THEN NULL ELSE SYSUTCDATETIME() END WHERE UserId = @id', {
    id: [sql.Int, id],
    h: [sql.NVarChar(100), hash],
  });
  return r.rowsAffected[0] === 1;
}
