// Hội viên (FEATURE-014): tra cứu theo SĐT đã chuẩn hóa, đăng ký, quản lý, ẩn danh; hạng hội viên.
import { inTransaction, query, sql, txQuery } from '../db.js';

const SELECT = `
  SELECT m.MemberId, m.Phone, m.FullName, m.TierCode, t.Name AS TierName, t.DiscountPercent, m.TotalSpent, m.VisitCount, m.Points,
         m.FirstOrderDiscountUsed, m.BirthDate, m.Note, m.ConsentAt, m.IsActive, m.AnonymizedAt, m.CreatedAt, m.LastVisitAt,
         m.ReferredByMemberId, m.OptOut
  FROM dbo.Members m JOIN dbo.MemberTiers t ON t.TierCode = m.TierCode`;

const map = (r) =>
  r && {
    memberId: r.MemberId,
    phone: r.Phone,
    fullName: r.FullName,
    tierCode: r.TierCode,
    tierName: r.TierName,
    discountPercent: Number(r.DiscountPercent),
    totalSpent: Number(r.TotalSpent),
    visitCount: r.VisitCount,
    points: r.Points,
    firstOrderDiscount: !r.FirstOrderDiscountUsed,
    birthDate: r.BirthDate ? r.BirthDate.toISOString().slice(0, 10) : null,
    note: r.Note,
    consentAt: r.ConsentAt,
    isActive: Boolean(r.IsActive),
    anonymizedAt: r.AnonymizedAt,
    createdAt: r.CreatedAt,
    lastVisitAt: r.LastVisitAt,
    referredByMemberId: r.ReferredByMemberId ?? null, // F-038
    optOut: Boolean(r.OptOut), // F-037
  };

export async function findByPhone(phone) {
  const r = await query(`${SELECT} WHERE m.Phone = @p`, { p: [sql.VarChar(80), phone] });
  return map(r.recordset[0]);
}

export async function findById(id) {
  const r = await query(`${SELECT} WHERE m.MemberId = @id`, { id: [sql.Int, id] });
  return map(r.recordset[0]);
}

/**
 * Đăng ký. referrerId (F-038, D-28): người giới thiệu — khóa dòng người giới thiệu rồi đếm số người đã giới thiệu từ `referralSinceUtc`
 * trong cùng transaction → hai lượt đăng ký đồng thời không vượt `referralLimit`. Lỗi: 50080 (người giới thiệu không còn), 50174 REFERRAL_LIMIT.
 */
export async function create({ phone, fullName, referrerId = null, referralSinceUtc = null, referralLimit = 5 }) {
  const r = await query(
    `SET XACT_ABORT ON;
     BEGIN TRAN;
     IF @ref IS NOT NULL
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM dbo.Members WITH (UPDLOCK, HOLDLOCK) WHERE MemberId = @ref AND IsActive = 1 AND AnonymizedAt IS NULL)
       BEGIN ROLLBACK; THROW 50080, 'MEMBER_NOT_FOUND', 1; END
       IF (SELECT COUNT(*) FROM dbo.Members WHERE ReferredByMemberId = @ref AND CreatedAt >= @since) >= @lim
       BEGIN ROLLBACK; THROW 50174, 'REFERRAL_LIMIT', 1; END
     END
     INSERT dbo.Members (Phone, FullName, TierCode, ConsentAt, ReferredByMemberId)
     OUTPUT inserted.MemberId
     SELECT @p, @n, (SELECT TOP 1 TierCode FROM dbo.MemberTiers ORDER BY MinSpent, SortOrder), SYSUTCDATETIME(), @ref;
     COMMIT;`,
    {
      p: [sql.VarChar(80), phone],
      n: [sql.NVarChar(100), fullName],
      ref: [sql.Int, referrerId],
      since: [sql.DateTime2(0), referralSinceUtc ?? new Date(0)],
      lim: [sql.Int, referralLimit],
    },
  );
  return findById(r.recordset[0].MemberId);
}

/**
 * Danh sách quản lý: q = SĐT đầy đủ (đã chuẩn hóa) hoặc một phần tên.
 * view (TASK-082): all (mới đăng ký trước) · new (đăng ký từ đầu tháng) · top (chi nhiều) · points (nhiều điểm) · near (sắp lên hạng: đã chi ≥ 80% mức hạng kế)
 *   · lapsed (lần cuối ghé / đăng ký trước 30 ngày) · birthday (sinh nhật trong tháng, giờ quán). Mỗi dòng kèm hạng kế tiếp (null = hạng cao nhất).
 */
const VIEW_SQL = {
  all: { where: '', order: 'm.CreatedAt DESC, m.MemberId DESC' },
  new: { where: 'AND m.CreatedAt >= @monthStart', order: 'm.CreatedAt DESC, m.MemberId DESC' },
  top: { where: '', order: 'm.TotalSpent DESC, m.MemberId' },
  points: { where: 'AND m.Points > 0', order: 'm.Points DESC, m.MemberId' },
  near: { where: 'AND nt.MinSpent IS NOT NULL AND m.TotalSpent >= nt.MinSpent * 0.8', order: 'nt.MinSpent - m.TotalSpent, m.MemberId' },
  lapsed: { where: 'AND ISNULL(m.LastVisitAt, m.CreatedAt) < @lapsedBefore', order: 'ISNULL(m.LastVisitAt, m.CreatedAt), m.MemberId' },
  birthday: { where: 'AND MONTH(m.BirthDate) = @month', order: 'DAY(m.BirthDate), m.MemberId' },
};
export const MEMBER_VIEWS = Object.keys(VIEW_SQL);
const NEXT_TIER = `OUTER APPLY (SELECT TOP 1 x.Name, x.MinSpent FROM dbo.MemberTiers x WHERE x.MinSpent > t.MinSpent ORDER BY x.MinSpent) nt`;

export async function list({ phone = null, name = null, page = 1, pageSize = 30, view = 'all', monthStart, month, lapsedBefore }) {
  const v = VIEW_SQL[view] ?? VIEW_SQL.all;
  const r = await query(
    `${SELECT.replace('SELECT m.MemberId', 'SELECT COUNT(*) OVER () AS Total, nt.Name AS NextTierName, nt.MinSpent AS NextTierMin, m.MemberId')}
     ${NEXT_TIER}
     WHERE m.AnonymizedAt IS NULL
       AND (@phone IS NULL OR m.Phone = @phone)
       AND (@name IS NULL OR m.FullName LIKE @name)
       ${v.where}
     ORDER BY ${v.order}
     OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`,
    {
      phone: [sql.VarChar(80), phone],
      name: [sql.NVarChar(110), name ? `%${name.replace(/[%_[]/g, '[$&]')}%` : null],
      skip: [sql.Int, (page - 1) * pageSize],
      take: [sql.Int, pageSize],
      monthStart: [sql.DateTime2(0), monthStart],
      month: [sql.Int, month],
      lapsedBefore: [sql.DateTime2(0), lapsedBefore],
    },
  );
  return {
    items: r.recordset.map((x) => ({
      ...map(x),
      nextTier: x.NextTierName
        ? { name: x.NextTierName, minSpent: Number(x.NextTierMin), remaining: Math.max(0, Number(x.NextTierMin) - Number(x.TotalSpent)) }
        : null,
    })),
    total: r.recordset[0]?.Total ?? 0,
    page,
    pageSize,
  };
}

/**
 * Tổng quan trang Hội viên (TASK-082). Mốc thời gian (UTC) do service tính theo giờ quán.
 * recent: các lần cộng / trừ điểm gần nhất (tích tự động khi thu tiền, đổi quà, điều chỉnh, hoàn tiền) — chỉ hội viên chưa ẩn danh.
 */
export async function overview({ todayStart, monthStart, d7, d30, month }) {
  const p = {
    today: [sql.DateTime2(0), todayStart],
    monthStart: [sql.DateTime2(0), monthStart],
    d7: [sql.DateTime2(0), d7],
    d30: [sql.DateTime2(0), d30],
    month: [sql.Int, month],
  };
  const r = await query(
    `SELECT
       (SELECT COUNT(*) FROM dbo.Members WHERE AnonymizedAt IS NULL) AS Total,
       (SELECT COUNT(*) FROM dbo.Members WHERE AnonymizedAt IS NULL AND CreatedAt >= @monthStart) AS NewThisMonth,
       (SELECT COUNT(*) FROM dbo.Members WHERE AnonymizedAt IS NULL AND LastVisitAt >= @d30) AS Active30,
       (SELECT COUNT(*) FROM dbo.Members WHERE AnonymizedAt IS NULL AND ISNULL(LastVisitAt, CreatedAt) < @d30) AS Lapsed,
       (SELECT COUNT(*) FROM dbo.Members WHERE AnonymizedAt IS NULL AND MONTH(BirthDate) = @month) AS Birthdays,
       (SELECT COUNT(*) FROM dbo.Members m JOIN dbo.MemberTiers t ON t.TierCode = m.TierCode ${NEXT_TIER}
         WHERE m.AnonymizedAt IS NULL AND nt.MinSpent IS NOT NULL AND m.TotalSpent >= nt.MinSpent * 0.8) AS NearTier,
       (SELECT ISNULL(SUM(Points), 0) FROM dbo.Members WHERE AnonymizedAt IS NULL) AS PointsHeld,
       (SELECT ISNULL(SUM(Delta), 0) FROM dbo.PointTransactions WHERE Type = 'EARN' AND CreatedAt >= @today) AS EarnToday,
       (SELECT COUNT(DISTINCT MemberId) FROM dbo.PointTransactions WHERE Type = 'EARN' AND CreatedAt >= @today) AS EarnMembersToday,
       (SELECT ISNULL(SUM(Delta), 0) FROM dbo.PointTransactions WHERE Type = 'EARN' AND CreatedAt >= @d7) AS Earn7,
       (SELECT COUNT(*) FROM dbo.Payments WHERE PaidAt >= @today) AS PaymentsToday,
       (SELECT COUNT(*) FROM dbo.Payments WHERE PaidAt >= @today AND MemberId IS NOT NULL) AS MemberPaymentsToday,
       (SELECT ISNULL(SUM(AmountDue), 0) FROM dbo.Payments WHERE PaidAt >= @d30) AS Revenue30,
       (SELECT ISNULL(SUM(AmountDue), 0) FROM dbo.Payments WHERE PaidAt >= @d30 AND MemberId IS NOT NULL) AS MemberRevenue30;
     SELECT TOP 12 p.PtId, p.MemberId, m.FullName, p.Delta, p.Type, p.Note, p.PaymentId, p.CreatedAt
     FROM dbo.PointTransactions p JOIN dbo.Members m ON m.MemberId = p.MemberId
     WHERE m.AnonymizedAt IS NULL
     ORDER BY p.PtId DESC;`,
    p,
  );
  const x = r.recordsets[0][0];
  return {
    total: x.Total,
    newThisMonth: x.NewThisMonth,
    active30: x.Active30,
    lapsed: x.Lapsed,
    birthdays: x.Birthdays,
    nearTier: x.NearTier,
    pointsHeld: Number(x.PointsHeld),
    earnToday: Number(x.EarnToday),
    earnMembersToday: x.EarnMembersToday,
    earn7: Number(x.Earn7),
    paymentsToday: x.PaymentsToday,
    memberPaymentsToday: x.MemberPaymentsToday,
    revenue30: Number(x.Revenue30),
    memberRevenue30: Number(x.MemberRevenue30),
    recent: r.recordsets[1].map((t) => ({
      memberId: t.MemberId,
      fullName: t.FullName,
      delta: t.Delta,
      type: t.Type,
      note: t.Note,
      paymentId: t.PaymentId,
      createdAt: t.CreatedAt,
    })),
  };
}

export async function update(id, { fullName, tierCode, note, birthDate, isActive }) {
  const r = await query(
    `UPDATE dbo.Members SET FullName = @n, TierCode = @t, Note = @note, BirthDate = @b, IsActive = @a
     WHERE MemberId = @id AND AnonymizedAt IS NULL`,
    {
      id: [sql.Int, id],
      n: [sql.NVarChar(100), fullName],
      t: [sql.VarChar(20), tierCode],
      note: [sql.NVarChar(200), note || null],
      b: [sql.Date, birthDate || null],
      a: [sql.Bit, isActive],
    },
  );
  return r.rowsAffected[0] ? findById(id) : null;
}

/** D-16: xóa tên, thay SĐT bằng mã băm; giữ giao dịch/thanh toán. Gỡ khỏi phiên chưa thu tiền. */
export async function anonymize(id, phoneHash) {
  return inTransaction(async (tx) => {
    const r = await txQuery(
      tx,
      `UPDATE dbo.Members SET FullName = N'(đã ẩn danh)', Phone = @h, Note = NULL, BirthDate = NULL, IsActive = 0, AnonymizedAt = SYSUTCDATETIME()
       WHERE MemberId = @id AND AnonymizedAt IS NULL`,
      { id: [sql.Int, id], h: [sql.VarChar(80), phoneHash] },
    );
    if (!r.rowsAffected[0]) return false;
    await txQuery(tx, "UPDATE dbo.Sessions SET MemberId = NULL WHERE MemberId = @id AND Status <> 'CLOSED'", { id: [sql.Int, id] });
    return true;
  });
}

export async function history(id, limit = 50) {
  const r = await query(
    `SELECT TOP (@lim) x.TxnId, x.PaymentId, x.SpentAmount, x.DiscountAmount, x.TierBefore, x.TierAfter, x.CreatedAt
     FROM dbo.MemberTransactions x WHERE x.MemberId = @id ORDER BY x.TxnId DESC`,
    { id: [sql.Int, id], lim: [sql.Int, limit] },
  );
  return r.recordset.map((x) => ({
    txnId: Number(x.TxnId),
    paymentId: x.PaymentId,
    spentAmount: Number(x.SpentAmount),
    discountAmount: Number(x.DiscountAmount),
    tierBefore: x.TierBefore,
    tierAfter: x.TierAfter,
    createdAt: x.CreatedAt,
  }));
}

// ---- Hạng ----
const mapTier = (t) => ({
  tierCode: t.TierCode,
  name: t.Name,
  minSpent: Number(t.MinSpent),
  discountPercent: Number(t.DiscountPercent),
  sortOrder: t.SortOrder,
});

export async function tiers() {
  const r = await query('SELECT * FROM dbo.MemberTiers ORDER BY SortOrder, MinSpent');
  return r.recordset.map(mapTier);
}

export async function updateTiers(list) {
  await inTransaction(async (tx) => {
    for (const t of list) {
      await txQuery(tx, 'UPDATE dbo.MemberTiers SET Name = @n, MinSpent = @min, DiscountPercent = @d WHERE TierCode = @c', {
        c: [sql.VarChar(20), t.tierCode],
        n: [sql.NVarChar(50), t.name],
        min: [sql.Decimal(12, 0), t.minSpent],
        d: [sql.Decimal(5, 2), t.discountPercent],
      });
    }
  });
  return tiers();
}
