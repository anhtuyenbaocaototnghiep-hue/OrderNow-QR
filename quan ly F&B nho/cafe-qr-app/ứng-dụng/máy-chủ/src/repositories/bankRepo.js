// F-100 (ADR-063): khoản tiền vào tài khoản quán có mã của quán (SePay / giả lập) — mỗi giao dịch một dòng, khóa (Provider, ProviderTxnId).
import { query, sql } from '../db.js';

const map = (r) =>
  r && {
    bankTxnId: r.BankTxnId,
    provider: r.Provider,
    providerTxnId: r.ProviderTxnId,
    accountNumber: r.AccountNumber,
    amount: Number(r.Amount),
    content: r.Content,
    referenceNumber: r.ReferenceNumber,
    transactionAt: r.TransactionAt,
    receivedAt: r.ReceivedAt,
    status: r.Status,
    sessionId: r.SessionId ? r.SessionId.toLowerCase() : null,
    table: r.TableName ? { code: r.TableCode, name: r.TableName } : null,
    paymentId: r.PaymentId,
    note: r.Note,
    handledBy: r.HandledByName ?? null,
    handledAt: r.HandledAt,
  };

const SELECT = `SELECT b.*, t.Code AS TableCode, t.Name AS TableName, hu.FullName AS HandledByName FROM dbo.BankTransactions b
  LEFT JOIN dbo.Sessions s ON s.SessionId = b.SessionId LEFT JOIN dbo.Tables t ON t.TableId = s.TableId
  LEFT JOIN dbo.Users hu ON hu.UserId = b.HandledBy`;

/** Ghi giao dịch mới; đã có (cùng Provider + ProviderTxnId) → null (không xử lý lại). */
export async function insert({ provider, providerTxnId, accountNumber = null, amount, content = null, referenceNumber = null, transactionAt }) {
  const r = await query(
    `IF NOT EXISTS (SELECT 1 FROM dbo.BankTransactions WITH (UPDLOCK, HOLDLOCK) WHERE Provider = @p AND ProviderTxnId = @id)
       INSERT dbo.BankTransactions (Provider, ProviderTxnId, AccountNumber, Amount, Content, ReferenceNumber, TransactionAt)
       OUTPUT inserted.BankTxnId VALUES (@p, @id, @acc, @a, @c, @ref, @at);`,
    {
      p: [sql.VarChar(10), provider],
      id: [sql.NVarChar(64), String(providerTxnId)],
      acc: [sql.VarChar(30), accountNumber ? String(accountNumber).slice(0, 30) : null],
      a: [sql.Decimal(12, 0), amount],
      c: [sql.NVarChar(500), content ? String(content).slice(0, 500) : null],
      ref: [sql.NVarChar(100), referenceNumber ? String(referenceNumber).slice(0, 100) : null],
      at: [sql.DateTime2(0), transactionAt],
    },
  );
  return r.recordset?.[0]?.BankTxnId ?? null;
}

const resultParams = (id, { status, sessionId = null, paymentId = null, note = null, handledBy = null }) => ({
  id: [sql.Int, id],
  s: [sql.VarChar(10), status],
  sid: [sql.UniqueIdentifier, sessionId],
  pid: [sql.Int, paymentId],
  n: [sql.NVarChar(200), note ? String(note).slice(0, 200) : null],
  hb: [sql.Int, handledBy],
});
// Người xử lý và lúc xử lý luôn đi cùng nhau (trả về "chưa khớp" sau khi thu lỗi → xóa cả hai)
const SET_RESULT = `Status = @s, SessionId = @sid, PaymentId = @pid, Note = @n,
  HandledBy = @hb, HandledAt = CASE WHEN @hb IS NULL THEN NULL ELSE SYSUTCDATETIME() END`;

/** Ghi kết quả cho dòng vừa nhận (NEW) hoặc ghi lại sau khi giữ chỗ. */
export async function setResult(id, result) {
  await query(`UPDATE dbo.BankTransactions SET ${SET_RESULT} WHERE BankTxnId = @id`, resultParams(id, result));
  return getById(id);
}

/**
 * Nhân viên xử lý một khoản "chưa khớp": chỉ đổi được khi vẫn còn UNMATCHED (hai máy quầy bấm cùng lúc → máy sau nhận false),
 * nên một khoản tiền không thể ghép cho hai bàn.
 */
export async function claimUnmatched(id, result) {
  const r = await query(`UPDATE dbo.BankTransactions SET ${SET_RESULT} WHERE BankTxnId = @id AND Status = 'UNMATCHED'`, resultParams(id, result));
  return r.rowsAffected[0] === 1;
}

export async function getById(id) {
  const r = await query(`${SELECT} WHERE b.BankTxnId = @id`, { id: [sql.Int, id] });
  return map(r.recordset[0]);
}

/** Khoản tiền vào theo trạng thái (null = mọi trạng thái) trong `days` ngày gần nhất — mới nhất trước. */
export async function list({ status = null, days = 14 } = {}) {
  const r = await query(`${SELECT} WHERE (@s IS NULL OR b.Status = @s) AND b.ReceivedAt >= DATEADD(DAY, -@d, SYSUTCDATETIME()) ORDER BY b.BankTxnId DESC`, {
    s: [sql.VarChar(10), status],
    d: [sql.Int, days],
  });
  return r.recordset.map(map);
}

export async function countUnmatched() {
  const r = await query("SELECT COUNT(*) AS N FROM dbo.BankTransactions WHERE Status = 'UNMATCHED'");
  return r.recordset[0].N;
}

/** Bàn đã thanh toán trong `hours` giờ qua — để báo "có thể khách chuyển hai lần" khi mã trùng bàn vừa đóng. */
export async function recentClosedSessions(hours = 24) {
  const r = await query(
    `SELECT s.SessionId, t.Code, t.Name FROM dbo.Sessions s JOIN dbo.Tables t ON t.TableId = s.TableId
     WHERE s.Status = 'CLOSED' AND s.ClosedAt >= DATEADD(HOUR, -@h, SYSUTCDATETIME())`,
    { h: [sql.Int, hours] },
  );
  return r.recordset.map((x) => ({ sessionId: x.SessionId.toLowerCase(), table: { code: x.Code, name: x.Name } }));
}

/** Tài khoản hệ thống "Tự động (ngân hàng)" (migration 0062, đã lưu trữ — không đăng nhập được): người ghi lượt thu tự động. */
export async function systemUser() {
  const r = await query("SELECT TOP 1 UserId, FullName FROM dbo.Users WHERE Username = N'he-thong-ngan-hang' AND DeletedAt IS NOT NULL ORDER BY UserId");
  const x = r.recordset[0];
  if (!x) throw new Error('Thiếu tài khoản hệ thống "Tự động (ngân hàng)" — chạy npm run db:migrate');
  return { userId: x.UserId, fullName: x.FullName, role: 'STAFF', level: 'OFFICIAL', positions: null };
}
