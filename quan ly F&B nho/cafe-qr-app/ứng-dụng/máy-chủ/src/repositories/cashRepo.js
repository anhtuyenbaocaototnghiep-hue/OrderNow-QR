// Sổ quỹ (FEATURE-033, ADR-006 D-23): danh mục thu/chi + khoản thu/chi tiền mặt ngoài bán hàng trong ca.
// Ghi / duyệt qua sp_CreateCashTxn / sp_ReviewCashTxn (khóa ca → tuần tự với sp_CloseShift).
import { query, request, sql } from '../db.js';

const mapCategory = (r) => ({
  categoryId: r.CategoryId,
  name: r.Name,
  direction: r.Direction.trim(), // CHAR(3): 'IN ' → 'IN'
  isExpense: Boolean(r.IsExpense),
  requiresApproval: Boolean(r.RequiresApproval),
  isActive: Boolean(r.IsActive),
  sortOrder: r.SortOrder,
});

export async function categories({ all = false } = {}) {
  const r = await query(`SELECT * FROM dbo.CashCategories ${all ? '' : 'WHERE IsActive = 1'} ORDER BY Direction DESC, SortOrder, Name`);
  return r.recordset.map(mapCategory);
}

export async function saveCategory(id, { name, direction, isExpense, requiresApproval, isActive, sortOrder }) {
  const p = {
    id: [sql.Int, id],
    n: [sql.NVarChar(50), name],
    d: [sql.Char(3), direction],
    e: [sql.Bit, isExpense],
    a: [sql.Bit, requiresApproval],
    act: [sql.Bit, isActive],
    s: [sql.Int, sortOrder],
  };
  const r = id
    ? await query(
        `UPDATE dbo.CashCategories SET Name = @n, IsExpense = @e, RequiresApproval = @a, IsActive = @act, SortOrder = @s
         OUTPUT inserted.* WHERE CategoryId = @id`,
        p,
      )
    : await query(
        `INSERT dbo.CashCategories (Name, Direction, IsExpense, RequiresApproval, IsActive, SortOrder)
         OUTPUT inserted.* VALUES (@n, @d, @e, @a, @act, @s)`,
        p,
      );
  return r.recordset[0] ? mapCategory(r.recordset[0]) : null;
}

const SELECT = `
  SELECT c.CashTxnId, c.ShiftId, c.CategoryId, cc.Name AS CategoryName, cc.IsExpense, c.Direction, c.Amount, c.Reason,
         c.ReceiptImagePath, c.Status, c.CreatedBy, cu.FullName AS CreatedByName, c.CreatedAt,
         c.ApprovedBy, au.FullName AS ApprovedByName, c.ApprovedAt, c.RejectReason,
         c.VoidedBy, vu.FullName AS VoidedByName, c.VoidedAt, c.VoidReason, c.ReplacedById, c.ReplacesId,
         CASE WHEN sh.ClosedAt IS NULL THEN 1 ELSE 0 END AS ShiftOpen
  FROM dbo.CashTransactions c
  JOIN dbo.CashCategories cc ON cc.CategoryId = c.CategoryId
  JOIN dbo.Users cu ON cu.UserId = c.CreatedBy
  JOIN dbo.Shifts sh ON sh.ShiftId = c.ShiftId
  LEFT JOIN dbo.Users au ON au.UserId = c.ApprovedBy
  LEFT JOIN dbo.Users vu ON vu.UserId = c.VoidedBy`;

const map = (r) => ({
  cashTxnId: r.CashTxnId,
  shiftId: r.ShiftId,
  category: { categoryId: r.CategoryId, name: r.CategoryName, isExpense: Boolean(r.IsExpense) },
  direction: r.Direction.trim(), // CHAR(3): 'IN ' → 'IN'
  amount: Number(r.Amount),
  reason: r.Reason,
  hasReceipt: Boolean(r.ReceiptImagePath),
  status: r.Status,
  createdBy: { userId: r.CreatedBy, fullName: r.CreatedByName },
  createdAt: r.CreatedAt,
  approvedBy: r.ApprovedBy ? { userId: r.ApprovedBy, fullName: r.ApprovedByName } : null,
  approvedAt: r.ApprovedAt,
  rejectReason: r.RejectReason,
  // F-050: hủy / sửa khoản đã duyệt
  voidedBy: r.VoidedBy ? { userId: r.VoidedBy, fullName: r.VoidedByName } : null,
  voidedAt: r.VoidedAt ?? null,
  voidReason: r.VoidReason ?? null,
  replacedById: r.ReplacedById ?? null,
  replacesId: r.ReplacesId ?? null,
  shiftOpen: Boolean(r.ShiftOpen),
});

export async function getById(id) {
  const r = await query(`${SELECT} WHERE c.CashTxnId = @id`, { id: [sql.Int, id] });
  return r.recordset[0] ? map(r.recordset[0]) : null;
}

/** Đường dẫn ảnh hóa đơn (tương đối trong thư mục uploads) — chỉ dùng phía server. */
export async function receiptPath(id) {
  const r = await query('SELECT ReceiptImagePath FROM dbo.CashTransactions WHERE CashTxnId = @id', { id: [sql.Int, id] });
  return r.recordset[0]?.ReceiptImagePath ?? null;
}

export async function setReceipt(id, relPath) {
  await query('UPDATE dbo.CashTransactions SET ReceiptImagePath = @p WHERE CashTxnId = @id', {
    id: [sql.Int, id],
    p: [sql.NVarChar(200), relPath],
  });
}

export async function create({ shiftId, categoryId, amount, reason, userId, threshold }) {
  const r = await (
    await request()
  )
    .input('ShiftId', sql.Int, shiftId)
    .input('CategoryId', sql.Int, categoryId)
    .input('Amount', sql.Decimal(12, 0), amount)
    .input('Reason', sql.NVarChar(200), reason)
    .input('UserId', sql.Int, userId)
    .input('Threshold', sql.Decimal(12, 0), threshold)
    .output('CashTxnId', sql.Int)
    .output('Status', sql.VarChar(10))
    .execute('dbo.sp_CreateCashTxn');
  return { cashTxnId: r.output.CashTxnId, status: r.output.Status };
}

export async function review(id, approve, userId, rejectReason) {
  await (
    await request()
  )
    .input('CashTxnId', sql.Int, id)
    .input('Approve', sql.Bit, approve)
    .input('UserId', sql.Int, userId)
    .input('RejectReason', sql.NVarChar(200), rejectReason ?? null)
    .execute('dbo.sp_ReviewCashTxn');
}

/** Hủy (replacement null) / sửa khoản đã duyệt — sp_VoidCashTxn (F-050). → { newTxnId, newStatus } */
export async function voidTxn({ id, approverId, actorId, reason, replacement = null, threshold }) {
  const r = await (
    await request()
  )
    .input('CashTxnId', sql.Int, id)
    .input('UserId', sql.Int, approverId)
    .input('ActorId', sql.Int, actorId)
    .input('Reason', sql.NVarChar(200), reason)
    .input('NewCategoryId', sql.Int, replacement?.categoryId ?? null)
    .input('NewAmount', sql.Decimal(12, 0), replacement?.amount ?? null)
    .input('NewReason', sql.NVarChar(200), replacement?.reason ?? null)
    .input('Threshold', sql.Decimal(12, 0), threshold)
    .output('NewTxnId', sql.Int)
    .output('NewStatus', sql.VarChar(10))
    .execute('dbo.sp_VoidCashTxn');
  return { newTxnId: r.output.NewTxnId ?? null, newStatus: r.output.NewStatus ?? null };
}

export async function listByShift(shiftId) {
  const r = await query(`${SELECT} WHERE c.ShiftId = @s ORDER BY c.CreatedAt DESC, c.CashTxnId DESC`, { s: [sql.Int, shiftId] });
  return r.recordset.map(map);
}

/** Sổ quỹ theo khoảng thời gian (giờ UTC) + lọc danh mục / trạng thái / chiều. */
export async function list({ fromUtc, toUtc, categoryId = null, status = null, direction = null }) {
  const r = await query(
    `${SELECT}
     WHERE c.CreatedAt >= @f AND c.CreatedAt < @t
       AND (@cat IS NULL OR c.CategoryId = @cat) AND (@st IS NULL OR c.Status = @st) AND (@dir IS NULL OR c.Direction = @dir)
     ORDER BY c.CreatedAt DESC, c.CashTxnId DESC`,
    {
      f: [sql.DateTime2(0), fromUtc],
      t: [sql.DateTime2(0), toUtc],
      cat: [sql.Int, categoryId],
      st: [sql.VarChar(10), status],
      dir: [sql.Char(3), direction],
    },
  );
  return r.recordset.map(map);
}

/** Đếm khoản thu/chi đang dùng danh mục (để biết xóa hẳn hay chỉ ngừng dùng). */
export async function categoryUsage(id) {
  const r = await query('SELECT COUNT(*) AS N FROM dbo.CashTransactions WHERE CategoryId = @id', { id: [sql.Int, id] });
  return r.recordset[0].N;
}

export async function deleteCategory(id) {
  const r = await query('DELETE dbo.CashCategories WHERE CategoryId = @id', { id: [sql.Int, id] });
  return r.rowsAffected[0] > 0;
}
