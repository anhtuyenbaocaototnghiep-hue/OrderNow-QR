// Tích điểm, đổi thưởng, tem (FEATURE-039) + voucher / giới thiệu bạn (FEATURE-038). Trừ / cộng điểm, tem, voucher khi thu tiền
// nằm trong sp_ApplyLoyalty (cùng transaction lượt thu); repo này chỉ đọc + cấu hình + điều chỉnh tay.
import { query, request, sql } from '../db.js';

// ---- Danh mục thưởng ----
const mapReward = (r) => ({
  rewardId: r.RewardId,
  name: r.Name,
  pointsCost: r.PointsCost,
  rewardType: r.RewardType,
  discountAmount: r.DiscountAmount === null ? null : Number(r.DiscountAmount),
  menuItemId: r.MenuItemId,
  menuItemName: r.MenuItemName ?? null,
  isActive: Boolean(r.IsActive),
  sortOrder: r.SortOrder,
});
const REWARD_SELECT = 'SELECT r.*, m.Name AS MenuItemName FROM dbo.RewardCatalog r LEFT JOIN dbo.MenuItems m ON m.MenuItemId = r.MenuItemId';

export async function rewards({ all = false } = {}) {
  const res = await query(`${REWARD_SELECT} ${all ? '' : 'WHERE r.IsActive = 1'} ORDER BY r.SortOrder, r.PointsCost, r.Name`);
  return res.recordset.map(mapReward);
}

export async function reward(id) {
  const res = await query(`${REWARD_SELECT} WHERE r.RewardId = @id`, { id: [sql.Int, id] });
  return res.recordset[0] ? mapReward(res.recordset[0]) : null;
}

export async function saveReward(id, b) {
  const p = {
    id: [sql.Int, id],
    n: [sql.NVarChar(100), b.name],
    c: [sql.Int, b.pointsCost],
    t: [sql.VarChar(10), b.rewardType],
    d: [sql.Decimal(12, 0), b.rewardType === 'DISCOUNT' ? b.discountAmount : null],
    m: [sql.Int, b.rewardType === 'FREE_ITEM' ? b.menuItemId : null],
    a: [sql.Bit, b.isActive],
    s: [sql.Int, b.sortOrder],
  };
  const res = id
    ? await query(
        `UPDATE dbo.RewardCatalog SET Name = @n, PointsCost = @c, RewardType = @t, DiscountAmount = @d, MenuItemId = @m, IsActive = @a, SortOrder = @s
         WHERE RewardId = @id`,
        p,
      )
    : await query(
        `INSERT dbo.RewardCatalog (Name, PointsCost, RewardType, DiscountAmount, MenuItemId, IsActive, SortOrder)
         OUTPUT inserted.RewardId VALUES (@n, @c, @t, @d, @m, @a, @s)`,
        p,
      );
  return reward(id ?? res.recordset[0].RewardId);
}

/** ADR-004: đã có lượt đổi → chỉ ngừng (ARCHIVED); chưa → xóa hẳn. */
export async function deleteReward(id) {
  const used = await query('SELECT COUNT(*) AS N FROM dbo.RewardRedemptions WHERE RewardId = @id', { id: [sql.Int, id] });
  if (used.recordset[0].N > 0 || (await query('SELECT COUNT(*) AS N FROM dbo.Payments WHERE RewardId = @id', { id: [sql.Int, id] })).recordset[0].N > 0) {
    await query('UPDATE dbo.RewardCatalog SET IsActive = 0 WHERE RewardId = @id', { id: [sql.Int, id] });
    return 'ARCHIVED';
  }
  const r = await query('DELETE dbo.RewardCatalog WHERE RewardId = @id', { id: [sql.Int, id] });
  return r.rowsAffected[0] ? 'DELETED' : null;
}

// ---- Chương trình tem ----
export async function programs({ all = false } = {}) {
  const [ps, items] = await Promise.all([
    query(`SELECT p.*, m.Name AS RewardName FROM dbo.StampPrograms p LEFT JOIN dbo.MenuItems m ON m.MenuItemId = p.RewardMenuItemId
           ${all ? '' : 'WHERE p.IsActive = 1'} ORDER BY p.ProgramId`),
    query(`SELECT i.ProgramId, i.MenuItemId, m.Name FROM dbo.StampProgramItems i JOIN dbo.MenuItems m ON m.MenuItemId = i.MenuItemId
           WHERE m.DeletedAt IS NULL ORDER BY m.Name`),
  ]);
  return ps.recordset.map((p) => {
    const its = items.recordset.filter((i) => i.ProgramId === p.ProgramId);
    return {
      programId: p.ProgramId,
      name: p.Name,
      requiredStamps: p.RequiredStamps,
      rewardMenuItemId: p.RewardMenuItemId,
      rewardName: p.RewardName ?? null,
      isActive: Boolean(p.IsActive),
      menuItemIds: its.map((i) => i.MenuItemId),
      items: its.map((i) => ({ menuItemId: i.MenuItemId, name: i.Name })),
    };
  });
}

export async function saveProgram(id, b) {
  const tx = await request();
  const r = await tx
    .input('Id', sql.Int, id)
    .input('Name', sql.NVarChar(100), b.name)
    .input('Required', sql.Int, b.requiredStamps)
    .input('Reward', sql.Int, b.rewardMenuItemId ?? null)
    .input('Active', sql.Bit, b.isActive)
    .input('Items', sql.NVarChar(sql.MAX), JSON.stringify(b.menuItemIds)).query(`
      SET XACT_ABORT ON;
      BEGIN TRAN;
      DECLARE @Pid INT = @Id;
      IF @Pid IS NULL
      BEGIN
        INSERT dbo.StampPrograms (Name, RequiredStamps, RewardMenuItemId, IsActive) VALUES (@Name, @Required, @Reward, @Active);
        SET @Pid = SCOPE_IDENTITY();
      END
      ELSE
        UPDATE dbo.StampPrograms SET Name = @Name, RequiredStamps = @Required, RewardMenuItemId = @Reward, IsActive = @Active WHERE ProgramId = @Pid;
      DELETE dbo.StampProgramItems WHERE ProgramId = @Pid;
      INSERT dbo.StampProgramItems (ProgramId, MenuItemId)
      SELECT DISTINCT @Pid, CAST(value AS INT) FROM OPENJSON(@Items);
      COMMIT;
      SELECT @Pid AS ProgramId;`);
  const pid = r.recordset[0].ProgramId;
  return (await programs({ all: true })).find((p) => p.programId === pid) ?? null;
}

export async function deleteProgram(id) {
  const used = await query('SELECT COUNT(*) AS N FROM dbo.StampEvents WHERE ProgramId = @id', { id: [sql.Int, id] });
  if (used.recordset[0].N > 0) {
    await query('UPDATE dbo.StampPrograms SET IsActive = 0 WHERE ProgramId = @id', { id: [sql.Int, id] });
    return 'ARCHIVED';
  }
  const r = await query(
    'DELETE dbo.StampCards WHERE ProgramId = @id; DELETE dbo.StampProgramItems WHERE ProgramId = @id; DELETE dbo.StampPrograms WHERE ProgramId = @id',
    {
      id: [sql.Int, id],
    },
  );
  return r.rowsAffected.at(-1) ? 'DELETED' : null;
}

// ---- Thẻ tem / điểm của hội viên ----
export async function cards(memberId) {
  const r = await query(
    `SELECT c.ProgramId, p.Name, p.RequiredStamps, p.IsActive, c.Stamps, c.CompletedCards, c.RewardsAvailable
     FROM dbo.StampCards c JOIN dbo.StampPrograms p ON p.ProgramId = c.ProgramId
     WHERE c.MemberId = @m ORDER BY p.ProgramId`,
    { m: [sql.Int, memberId] },
  );
  return r.recordset.map((x) => ({
    programId: x.ProgramId,
    name: x.Name,
    requiredStamps: x.RequiredStamps,
    isActive: Boolean(x.IsActive),
    stamps: x.Stamps,
    completedCards: x.CompletedCards,
    rewardsAvailable: x.RewardsAvailable,
  }));
}

export async function pointHistory(memberId, limit = 50) {
  const r = await query(
    `SELECT TOP (@n) pt.PtId, pt.PaymentId, pt.Delta, pt.Type, pt.Note, pt.CreatedAt, u.FullName AS CreatedByName
     FROM dbo.PointTransactions pt LEFT JOIN dbo.Users u ON u.UserId = pt.CreatedBy
     WHERE pt.MemberId = @m ORDER BY pt.CreatedAt DESC, pt.PtId DESC`,
    { m: [sql.Int, memberId], n: [sql.Int, limit] },
  );
  return r.recordset.map((x) => ({
    ptId: Number(x.PtId),
    paymentId: x.PaymentId,
    delta: x.Delta,
    type: x.Type,
    note: x.Note,
    createdAt: x.CreatedAt,
    createdBy: x.CreatedByName,
  }));
}

export async function adjustPoints(memberId, delta, reason, userId) {
  const r = await (
    await request()
  )
    .input('MemberId', sql.Int, memberId)
    .input('Delta', sql.Int, delta)
    .input('Reason', sql.NVarChar(200), reason)
    .input('UserId', sql.Int, userId)
    .output('Balance', sql.Int)
    .execute('dbo.sp_AdjustPoints');
  return r.output.Balance;
}

// ---- Voucher ----
const mapVoucher = (v) => ({
  voucherId: v.VoucherId,
  code: v.Code,
  memberId: v.MemberId,
  percent: v.DiscountPercent === null ? null : Number(v.DiscountPercent),
  amount: v.DiscountAmount === null ? null : Number(v.DiscountAmount),
  maxDiscount: v.MaxDiscount === null ? null : Number(v.MaxDiscount),
  minOrderAmount: Number(v.MinOrderAmount),
  stackWithMember: Boolean(v.StackWithMember),
  expiresAt: v.ExpiresAt,
  usedAt: v.UsedAt,
  usedPaymentId: v.UsedPaymentId,
  source: v.Source,
  campaignId: v.CampaignId,
  campaignName: v.CampaignName ?? null, // F-047: chỉ có ở vouchersOf (nối Campaigns)
  createdAt: v.CreatedAt,
});

export async function voucherByCode(code) {
  const r = await query('SELECT * FROM dbo.Vouchers WHERE Code = @c', { c: [sql.VarChar(20), code] });
  return r.recordset[0] ? mapVoucher(r.recordset[0]) : null;
}

export async function vouchersOf(memberId, { onlyUsable = false } = {}) {
  const r = await query(
    `SELECT v.*, c.Name AS CampaignName FROM dbo.Vouchers v LEFT JOIN dbo.Campaigns c ON c.CampaignId = v.CampaignId
     WHERE v.MemberId = @m ${onlyUsable ? 'AND v.UsedAt IS NULL AND v.ExpiresAt > SYSUTCDATETIME()' : ''}
     ORDER BY CASE WHEN v.UsedAt IS NULL AND v.ExpiresAt > SYSUTCDATETIME() THEN 0 ELSE 1 END, v.ExpiresAt`,
    { m: [sql.Int, memberId] },
  );
  return r.recordset.map(mapVoucher);
}

export async function vouchersIssuedFor(paymentId) {
  const r = await query('SELECT * FROM dbo.Vouchers WHERE IssuedForPaymentId = @p', { p: [sql.Int, paymentId] });
  return r.recordset.map(mapVoucher);
}

/** Voucher tạo tay (quản lý) — Source MANUAL; mã do server sinh. */
export async function createVoucher({
  code,
  memberId,
  percent,
  amount,
  maxDiscount,
  minOrderAmount,
  stackWithMember,
  expiresAt,
  source = 'MANUAL',
  campaignId = null,
  createdBy,
}) {
  const r = await query(
    `INSERT dbo.Vouchers (Code, MemberId, DiscountPercent, DiscountAmount, MaxDiscount, MinOrderAmount, StackWithMember, ExpiresAt, Source, CampaignId, CreatedBy)
     OUTPUT inserted.* VALUES (@c, @m, @p, @a, @x, @min, @s, @e, @src, @camp, @u)`,
    {
      c: [sql.VarChar(20), code],
      m: [sql.Int, memberId ?? null],
      p: [sql.Decimal(5, 2), percent ?? null],
      a: [sql.Decimal(12, 0), amount ?? null],
      x: [sql.Decimal(12, 0), maxDiscount ?? null],
      min: [sql.Decimal(12, 0), minOrderAmount ?? 0],
      s: [sql.Bit, stackWithMember ?? true],
      e: [sql.DateTime2(0), expiresAt],
      src: [sql.VarChar(10), source],
      camp: [sql.Int, campaignId],
      u: [sql.Int, createdBy ?? null],
    },
  );
  return mapVoucher(r.recordset[0]);
}

export async function listVouchers({ fromUtc, toUtc, source = null }) {
  const r = await query(
    `SELECT v.*, m.FullName AS MemberName FROM dbo.Vouchers v LEFT JOIN dbo.Members m ON m.MemberId = v.MemberId
     WHERE v.CreatedAt >= @f AND v.CreatedAt < @t AND (@s IS NULL OR v.Source = @s) ORDER BY v.CreatedAt DESC`,
    { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc], s: [sql.VarChar(10), source] },
  );
  return r.recordset.map((v) => ({ ...mapVoucher(v), memberName: v.MemberName }));
}

// ---- Giới thiệu bạn (D-28) ----
/** Số người được `referrerId` giới thiệu từ thời điểm `sinceUtc`. */
export async function referralCount(referrerId, sinceUtc) {
  const r = await query('SELECT COUNT(*) AS N FROM dbo.Members WHERE ReferredByMemberId = @r AND CreatedAt >= @s', {
    r: [sql.Int, referrerId],
    s: [sql.DateTime2(0), sinceUtc],
  });
  return r.recordset[0].N;
}

export async function setReferrer(memberId, referrerId) {
  const r = await query('UPDATE dbo.Members SET ReferredByMemberId = @r WHERE MemberId = @m AND ReferredByMemberId IS NULL', {
    m: [sql.Int, memberId],
    r: [sql.Int, referrerId],
  });
  return r.rowsAffected[0] > 0;
}

export async function referrals(memberId) {
  const r = await query(`SELECT MemberId, FullName, CreatedAt, ReferralRewardedAt FROM dbo.Members WHERE ReferredByMemberId = @m ORDER BY CreatedAt DESC`, {
    m: [sql.Int, memberId],
  });
  return r.recordset.map((x) => ({ memberId: x.MemberId, fullName: x.FullName, createdAt: x.CreatedAt, rewardedAt: x.ReferralRewardedAt }));
}
