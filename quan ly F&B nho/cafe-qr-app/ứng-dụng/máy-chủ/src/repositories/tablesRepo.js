import { query, request, sql } from '../db.js';

export const mapTable = (r) => r && { tableId: r.TableId, code: r.Code, name: r.Name, qrToken: r.QrToken, isActive: Boolean(r.IsActive) };

export async function findByQrToken(qrToken) {
  const r = await query('SELECT * FROM dbo.Tables WHERE QrToken = @q AND DeletedAt IS NULL', { q: [sql.Char(32), qrToken] });
  return mapTable(r.recordset[0]);
}

export async function findById(id) {
  const r = await query('SELECT * FROM dbo.Tables WHERE TableId = @id AND DeletedAt IS NULL', { id: [sql.Int, id] });
  return mapTable(r.recordset[0]);
}

export async function list() {
  const r = await query(`
    SELECT t.*, (SELECT COUNT(*) FROM dbo.Sessions s WHERE s.TableId = t.TableId AND s.Status <> 'CLOSED') AS OpenSessions
    FROM dbo.Tables t WHERE t.DeletedAt IS NULL ORDER BY t.Code`);
  return r.recordset.map((row) => ({ ...mapTable(row), openSessions: row.OpenSessions }));
}

export async function create({ code, name, qrToken }) {
  const r = await query('INSERT dbo.Tables (Code, Name, QrToken) OUTPUT inserted.* VALUES (@c, @n, @q)', {
    c: [sql.NVarChar(10), code],
    n: [sql.NVarChar(50), name],
    q: [sql.Char(32), qrToken],
  });
  return mapTable(r.recordset[0]);
}

export async function update(id, { code, name, isActive }) {
  const r = await query('UPDATE dbo.Tables SET Code = @c, Name = @n, IsActive = @a OUTPUT inserted.* WHERE TableId = @id AND DeletedAt IS NULL', {
    id: [sql.Int, id],
    c: [sql.NVarChar(10), code],
    n: [sql.NVarChar(50), name],
    a: [sql.Bit, isActive],
  });
  return mapTable(r.recordset[0]);
}

export async function setQrToken(id, qrToken) {
  const r = await query('UPDATE dbo.Tables SET QrToken = @q OUTPUT inserted.* WHERE TableId = @id AND DeletedAt IS NULL', {
    id: [sql.Int, id],
    q: [sql.Char(32), qrToken],
  });
  return mapTable(r.recordset[0]);
}

/** Xóa (ADR-004): 'DELETED' (xóa hẳn) | 'ARCHIVED' (xóa mềm vì đã có lịch sử). */
export async function remove(id) {
  const r = await (await request()).input('TableId', sql.Int, id).output('Result', sql.VarChar(10)).execute('dbo.sp_DeleteTable');
  return r.output.Result;
}
