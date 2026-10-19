import { query, request, sql } from '../db.js';

const map = (r) =>
  r && {
    userId: r.UserId,
    username: r.Username,
    fullName: r.FullName,
    role: r.Role,
    isActive: Boolean(r.IsActive),
    createdAt: r.CreatedAt,
  };

const COLS = 'UserId, Username, FullName, Role, IsActive, CreatedAt';

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

export async function list() {
  const r = await query(`SELECT ${COLS} FROM dbo.Users WHERE DeletedAt IS NULL ORDER BY Role, Username`);
  return r.recordset.map(map);
}

export async function create({ username, passwordHash, fullName, role }) {
  const r = await query(
    `INSERT dbo.Users (Username, PasswordHash, FullName, Role)
     OUTPUT inserted.UserId, inserted.Username, inserted.FullName, inserted.Role, inserted.IsActive, inserted.CreatedAt
     VALUES (@u, @h, @n, @r)`,
    { u: [sql.NVarChar(50), username], h: [sql.NVarChar(255), passwordHash], n: [sql.NVarChar(100), fullName], r: [sql.VarChar(10), role] },
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

export async function update(id, { fullName, role }) {
  const r = await query(
    `${LAST_ADMIN_GUARD("@r <> 'ADMIN'")}
     UPDATE dbo.Users SET FullName = @n, Role = @r
     OUTPUT inserted.UserId, inserted.Username, inserted.FullName, inserted.Role, inserted.IsActive, inserted.CreatedAt
     WHERE UserId = @id AND DeletedAt IS NULL;
     COMMIT;`,
    { id: [sql.Int, id], n: [sql.NVarChar(100), fullName], r: [sql.VarChar(10), role] },
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
     OUTPUT inserted.UserId, inserted.Username, inserted.FullName, inserted.Role, inserted.IsActive, inserted.CreatedAt
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
