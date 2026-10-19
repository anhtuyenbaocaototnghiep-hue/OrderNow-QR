// Phân khúc + chiến dịch (FEATURE-037, ADR-006 D-29). Luật phân khúc là AND các điều kiện đơn giản, dịch sang SQL có tham số.
import { query, sql } from '../db.js';

/** Điều kiện SQL + tham số từ luật. Hội viên đã ẩn danh / ngừng / từ chối nhận tin (OptOut) luôn bị loại. */
function ruleWhere(rule) {
  const p = {
    tiers: [sql.NVarChar(400), rule.tierIn?.length ? JSON.stringify(rule.tierIn) : null],
    lvGte: [sql.Int, rule.lastVisitDaysGte ?? null],
    lvLte: [sql.Int, rule.lastVisitDaysLte ?? null],
    vcGte: [sql.Int, rule.visitCountGte ?? null],
    vcLte: [sql.Int, rule.visitCountLte ?? null],
    spent: [sql.Decimal(12, 0), rule.totalSpentGte ?? null],
    bm: [sql.Int, rule.birthdayMonth ?? null],
    pts: [sql.Int, rule.hasPointsGte ?? null],
  };
  const where = `m.IsActive = 1 AND m.AnonymizedAt IS NULL
    AND (@tiers IS NULL OR m.TierCode IN (SELECT value FROM OPENJSON(@tiers)))
    AND (@lvGte IS NULL OR COALESCE(m.LastVisitAt, m.CreatedAt) <= DATEADD(DAY, -@lvGte, SYSUTCDATETIME()))
    AND (@lvLte IS NULL OR COALESCE(m.LastVisitAt, m.CreatedAt) >= DATEADD(DAY, -@lvLte, SYSUTCDATETIME()))
    AND (@vcGte IS NULL OR m.VisitCount >= @vcGte)
    AND (@vcLte IS NULL OR m.VisitCount <= @vcLte)
    AND (@spent IS NULL OR m.TotalSpent >= @spent)
    AND (@bm IS NULL OR MONTH(m.BirthDate) = @bm)
    AND (@pts IS NULL OR m.Points >= @pts)`;
  return { where, p };
}

/** Hội viên khớp luật (đã loại OptOut) + số người từ chối nhận tin bị loại. */
export async function members(rule) {
  const { where, p } = ruleWhere(rule);
  const [rows, opted] = await Promise.all([
    query(
      `SELECT m.MemberId, m.Phone, m.FullName, m.TierCode, t.Name AS TierName, m.LastContactedAt, m.LastVisitAt, m.VisitCount, m.TotalSpent, m.Points
       FROM dbo.Members m JOIN dbo.MemberTiers t ON t.TierCode = m.TierCode
       WHERE ${where} AND m.OptOut = 0 ORDER BY m.MemberId`,
      p,
    ),
    query(`SELECT COUNT(*) AS N FROM dbo.Members m WHERE ${where} AND m.OptOut = 1`, p),
  ]);
  return {
    optedOut: opted.recordset[0].N,
    members: rows.recordset.map((r) => ({
      memberId: r.MemberId,
      phone: r.Phone,
      fullName: r.FullName,
      tierCode: r.TierCode,
      tierName: r.TierName,
      lastContactedAt: r.LastContactedAt,
      lastVisitAt: r.LastVisitAt,
      visitCount: r.VisitCount,
      totalSpent: Number(r.TotalSpent),
      points: r.Points,
    })),
  };
}

// ---- Phân khúc ----
const mapSegment = (r) => ({ segmentId: r.SegmentId, name: r.Name, rule: JSON.parse(r.RuleJson), createdAt: r.CreatedAt, updatedAt: r.UpdatedAt });

export async function segments() {
  const r = await query('SELECT * FROM dbo.Segments ORDER BY SegmentId DESC');
  return r.recordset.map(mapSegment);
}
export async function segment(id) {
  const r = await query('SELECT * FROM dbo.Segments WHERE SegmentId = @id', { id: [sql.Int, id] });
  return r.recordset[0] ? mapSegment(r.recordset[0]) : null;
}
export async function saveSegment(id, { name, rule }, userId) {
  const p = { id: [sql.Int, id], n: [sql.NVarChar(100), name], j: [sql.NVarChar(1000), JSON.stringify(rule)], u: [sql.Int, userId] };
  const r = id
    ? await query('UPDATE dbo.Segments SET Name = @n, RuleJson = @j, UpdatedAt = SYSUTCDATETIME() OUTPUT inserted.* WHERE SegmentId = @id', p)
    : await query('INSERT dbo.Segments (Name, RuleJson, CreatedBy) OUTPUT inserted.* VALUES (@n, @j, @u)', p);
  return r.recordset[0] ? mapSegment(r.recordset[0]) : null;
}
export async function deleteSegment(id) {
  const used = await query('SELECT COUNT(*) AS N FROM dbo.Campaigns WHERE SegmentId = @id', { id: [sql.Int, id] });
  if (used.recordset[0].N > 0) return 'IN_USE';
  const r = await query('DELETE dbo.Segments WHERE SegmentId = @id', { id: [sql.Int, id] });
  return r.rowsAffected[0] ? 'DELETED' : null;
}

// ---- Chiến dịch ----
const CAMPAIGN_SELECT = `
  SELECT c.*, s.Name AS SegmentName,
         (SELECT COUNT(*) FROM dbo.CampaignDeliveries d WHERE d.CampaignId = c.CampaignId AND d.Status IN ('SENT', 'EXPORTED')) AS Delivered,
         (SELECT COUNT(*) FROM dbo.CampaignDeliveries d WHERE d.CampaignId = c.CampaignId AND d.Status = 'SKIPPED') AS Skipped,
         (SELECT COUNT(*) FROM dbo.CampaignDeliveries d WHERE d.CampaignId = c.CampaignId AND d.Status = 'FAILED') AS Failed
  FROM dbo.Campaigns c JOIN dbo.Segments s ON s.SegmentId = c.SegmentId`;
const mapCampaign = (r) => ({
  campaignId: r.CampaignId,
  name: r.Name,
  segment: { segmentId: r.SegmentId, name: r.SegmentName },
  channel: r.Channel,
  messageTemplate: r.MessageTemplate,
  voucherPercent: r.VoucherPercent === null ? null : Number(r.VoucherPercent),
  voucherDays: r.VoucherDays,
  voucherMinOrder: Number(r.VoucherMinOrder),
  scheduledAt: r.ScheduledAt,
  status: r.Status,
  startedAt: r.StartedAt,
  finishedAt: r.FinishedAt,
  error: r.Error,
  createdAt: r.CreatedAt,
  counts: { delivered: r.Delivered, skipped: r.Skipped, failed: r.Failed },
});

export async function campaigns() {
  const r = await query(`${CAMPAIGN_SELECT} ORDER BY c.CampaignId DESC`);
  return r.recordset.map(mapCampaign);
}
export async function campaign(id) {
  const r = await query(`${CAMPAIGN_SELECT} WHERE c.CampaignId = @id`, { id: [sql.Int, id] });
  return r.recordset[0] ? mapCampaign(r.recordset[0]) : null;
}

const campaignParams = (id, b, userId) => ({
  id: [sql.Int, id],
  n: [sql.NVarChar(100), b.name],
  s: [sql.Int, b.segmentId],
  ch: [sql.VarChar(10), b.channel],
  m: [sql.NVarChar(500), b.messageTemplate],
  vp: [sql.Decimal(5, 2), b.voucherPercent ?? null],
  vd: [sql.Int, b.voucherPercent ? b.voucherDays : null],
  vm: [sql.Decimal(12, 0), b.voucherMinOrder ?? 0],
  at: [sql.DateTime2(0), b.scheduledAt ?? null],
  st: [sql.VarChar(10), b.scheduledAt ? 'SCHEDULED' : 'DRAFT'],
  u: [sql.Int, userId],
});
export async function createCampaign(b, userId) {
  const r = await query(
    `INSERT dbo.Campaigns (Name, SegmentId, Channel, MessageTemplate, VoucherPercent, VoucherDays, VoucherMinOrder, ScheduledAt, Status, CreatedBy)
     OUTPUT inserted.CampaignId VALUES (@n, @s, @ch, @m, @vp, @vd, @vm, @at, @st, @u)`,
    campaignParams(null, b, userId),
  );
  return campaign(r.recordset[0].CampaignId);
}
/** Chỉ sửa khi còn nháp / đã hẹn giờ (chưa chạy). */
export async function updateCampaign(id, b) {
  const r = await query(
    `UPDATE dbo.Campaigns SET Name = @n, SegmentId = @s, Channel = @ch, MessageTemplate = @m, VoucherPercent = @vp, VoucherDays = @vd,
            VoucherMinOrder = @vm, ScheduledAt = @at, Status = @st
     WHERE CampaignId = @id AND Status IN ('DRAFT', 'SCHEDULED')`,
    campaignParams(id, b, null),
  );
  return r.rowsAffected[0] > 0;
}
export async function deleteCampaign(id) {
  const r = await query(
    `DELETE dbo.Campaigns WHERE CampaignId = @id AND Status IN ('DRAFT', 'SCHEDULED')
       AND NOT EXISTS (SELECT 1 FROM dbo.CampaignDeliveries WHERE CampaignId = @id)`,
    { id: [sql.Int, id] },
  );
  return r.rowsAffected[0] > 0;
}

/** Giành quyền chạy (một tiến trình thắng): DRAFT/SCHEDULED → RUNNING. */
export async function claim(id) {
  const r = await query(
    `UPDATE dbo.Campaigns SET Status = 'RUNNING', StartedAt = SYSUTCDATETIME(), Error = NULL
     WHERE CampaignId = @id AND Status IN ('DRAFT', 'SCHEDULED')`,
    { id: [sql.Int, id] },
  );
  return r.rowsAffected[0] > 0;
}
export async function finish(id, status, error = null) {
  await query('UPDATE dbo.Campaigns SET Status = @s, FinishedAt = SYSUTCDATETIME(), Error = @e WHERE CampaignId = @id', {
    id: [sql.Int, id],
    s: [sql.VarChar(10), status],
    e: [sql.NVarChar(400), error ? String(error).slice(0, 400) : null],
  });
}
export async function dueCampaigns() {
  const r = await query("SELECT CampaignId FROM dbo.Campaigns WHERE Status = 'SCHEDULED' AND ScheduledAt <= SYSUTCDATETIME() ORDER BY ScheduledAt");
  return r.recordset.map((x) => x.CampaignId);
}

/**
 * Ghi kết quả cho một hội viên (một transaction): delivery + voucher (nếu có) + LastContactedAt.
 * Chạy lại chiến dịch không nhân đôi (UQ_Deliveries). status SKIPPED / FAILED: không tạo voucher, không đổi LastContactedAt.
 */
export async function deliver({ campaignId, memberId, status, error = null, voucher = null }) {
  const r = await query(
    `SET XACT_ABORT ON;
     BEGIN TRAN;
     IF EXISTS (SELECT 1 FROM dbo.CampaignDeliveries WITH (UPDLOCK, HOLDLOCK) WHERE CampaignId = @c AND MemberId = @m)
     BEGIN COMMIT; SELECT CAST(0 AS BIT) AS Created, NULL AS VoucherId; RETURN; END
     DECLARE @V INT = NULL;
     IF @code IS NOT NULL
     BEGIN
       INSERT dbo.Vouchers (Code, MemberId, DiscountPercent, MinOrderAmount, ExpiresAt, Source, CampaignId)
       VALUES (@code, @m, @pct, @min, @exp, 'CAMPAIGN', @c);
       SET @V = SCOPE_IDENTITY();
     END
     INSERT dbo.CampaignDeliveries (CampaignId, MemberId, VoucherId, Status, SentAt, Error)
     VALUES (@c, @m, @V, @st, CASE WHEN @st IN ('SENT', 'EXPORTED') THEN SYSUTCDATETIME() END, @err);
     IF @st IN ('SENT', 'EXPORTED') UPDATE dbo.Members SET LastContactedAt = SYSUTCDATETIME() WHERE MemberId = @m;
     COMMIT;
     SELECT CAST(1 AS BIT) AS Created, @V AS VoucherId;`,
    {
      c: [sql.Int, campaignId],
      m: [sql.Int, memberId],
      st: [sql.VarChar(10), status],
      err: [sql.NVarChar(200), error ? String(error).slice(0, 200) : null],
      code: [sql.VarChar(20), voucher?.code ?? null],
      pct: [sql.Decimal(5, 2), voucher?.percent ?? null],
      min: [sql.Decimal(12, 0), voucher?.minOrderAmount ?? 0],
      exp: [sql.DateTime2(0), voucher?.expiresAt ?? null],
    },
  );
  const row = r.recordset[0];
  return { created: Boolean(row.Created), voucherId: row.VoucherId };
}

/** Danh sách gửi (xuất CSV / xem): SĐT đầy đủ chỉ dùng cho file xuất có nhật ký. */
export async function deliveries(campaignId) {
  const r = await query(
    `SELECT d.*, m.FullName, m.Phone, t.Name AS TierName, v.Code, v.DiscountPercent, v.ExpiresAt, v.UsedAt
     FROM dbo.CampaignDeliveries d JOIN dbo.Members m ON m.MemberId = d.MemberId JOIN dbo.MemberTiers t ON t.TierCode = m.TierCode
     LEFT JOIN dbo.Vouchers v ON v.VoucherId = d.VoucherId
     WHERE d.CampaignId = @c ORDER BY d.DeliveryId`,
    { c: [sql.Int, campaignId] },
  );
  return r.recordset.map((x) => ({
    deliveryId: x.DeliveryId,
    memberId: x.MemberId,
    fullName: x.FullName,
    phone: x.Phone,
    tierName: x.TierName,
    status: x.Status,
    sentAt: x.SentAt,
    error: x.Error,
    voucher: x.Code ? { code: x.Code, percent: Number(x.DiscountPercent), expiresAt: x.ExpiresAt, usedAt: x.UsedAt } : null,
  }));
}

/** Hiệu quả: voucher đã dùng, doanh thu lượt thu dùng voucher, khách quay lại trong 14 ngày sau khi nhận tin. */
export async function effectiveness(campaignId) {
  const r = await query(
    `SELECT
       (SELECT COUNT(*) FROM dbo.Vouchers WHERE CampaignId = @c AND UsedAt IS NOT NULL) AS VouchersUsed,
       (SELECT ISNULL(SUM(p.AmountDue), 0) FROM dbo.Payments p JOIN dbo.Vouchers v ON v.VoucherId = p.VoucherId WHERE v.CampaignId = @c) AS Revenue,
       (SELECT COUNT(*) FROM dbo.CampaignDeliveries d WHERE d.CampaignId = @c AND d.Status IN ('SENT', 'EXPORTED')
          AND EXISTS (SELECT 1 FROM dbo.Payments p WHERE p.MemberId = d.MemberId AND p.PaidAt >= d.SentAt AND p.PaidAt <= DATEADD(DAY, 14, d.SentAt))) AS Returned`,
    { c: [sql.Int, campaignId] },
  );
  const x = r.recordset[0];
  return { vouchersUsed: x.VouchersUsed, revenue: Number(x.Revenue), returned14d: x.Returned };
}

export async function setOptOut(memberId, optOut) {
  const r = await query('UPDATE dbo.Members SET OptOut = @o WHERE MemberId = @m', { m: [sql.Int, memberId], o: [sql.Bit, optOut] });
  return r.rowsAffected[0] > 0;
}
