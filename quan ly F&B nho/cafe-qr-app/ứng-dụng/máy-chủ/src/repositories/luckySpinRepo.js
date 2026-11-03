// F-065 vòng quay may mắn (ADR-024): ô quà, lượt quay theo lượt thu, quay (sp_SpinLucky), thống kê.
import { inTransaction, query, request, sql, sqlErrorNumber, txQuery } from '../db.js';

const mapPrize = (r) => ({
  prizeId: r.PrizeId,
  label: r.Label,
  kind: r.Kind,
  value: Number(r.Value),
  maxDiscount: r.MaxDiscount === null ? null : Number(r.MaxDiscount),
  weight: r.Weight,
  sortOrder: r.SortOrder,
  isActive: Boolean(r.IsActive),
});

export async function prizes({ activeOnly = true } = {}) {
  const r = await query(`SELECT * FROM dbo.SpinPrizes ${activeOnly ? 'WHERE IsActive = 1' : ''} ORDER BY SortOrder, PrizeId`);
  return r.recordset.map(mapPrize);
}

/** Thay danh sách ô: ô cũ không còn trong danh sách → tắt (giữ cho lịch sử lượt quay); ô có prizeId → sửa; còn lại → thêm. */
export async function savePrizes(list) {
  await inTransaction(async (tx) => {
    await txQuery(tx, 'UPDATE dbo.SpinPrizes SET IsActive = 0');
    for (const [i, p] of list.entries()) {
      const params = {
        id: [sql.Int, p.prizeId ?? null],
        l: [sql.NVarChar(40), p.label],
        k: [sql.VarChar(10), p.kind],
        v: [sql.Decimal(12, 0), p.kind === 'NONE' ? 0 : p.value],
        m: [sql.Decimal(12, 0), p.kind === 'PERCENT' ? (p.maxDiscount ?? null) : null],
        w: [sql.Int, p.weight],
        s: [sql.Int, i + 1],
      };
      await txQuery(
        tx,
        `IF @id IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.SpinPrizes WHERE PrizeId = @id)
           UPDATE dbo.SpinPrizes SET Label = @l, Kind = @k, Value = @v, MaxDiscount = @m, Weight = @w, SortOrder = @s, IsActive = 1 WHERE PrizeId = @id
         ELSE
           INSERT dbo.SpinPrizes (Label, Kind, Value, MaxDiscount, Weight, SortOrder) VALUES (@l, @k, @v, @m, @w, @s)`,
        params,
      );
    }
  });
  return prizes();
}

const SPIN_SELECT = `
  SELECT s.*, p.MemberId, p.AmountDue, p.PaidAt, p.SessionId, v.Code AS VoucherCode, v.DiscountPercent, v.DiscountAmount, v.MaxDiscount AS VoucherMax,
         v.ExpiresAt AS VoucherExpiresAt,
         CASE WHEN EXISTS (SELECT 1 FROM dbo.Refunds r WHERE r.PaymentId = s.PaymentId) THEN 1 ELSE 0 END AS Refunded
  FROM dbo.LuckySpins s JOIN dbo.Payments p ON p.PaymentId = s.PaymentId
  LEFT JOIN dbo.Vouchers v ON v.VoucherId = s.VoucherId`;

const mapSpin = (r) =>
  r && {
    spinId: r.SpinId,
    paymentId: r.PaymentId,
    sessionId: r.SessionId ? String(r.SessionId).toLowerCase() : null,
    token: r.Token,
    createdAt: r.CreatedAt,
    expiresAt: r.ExpiresAt,
    spunAt: r.SpunAt,
    prizeId: r.PrizeId,
    kind: r.Kind,
    label: r.PrizeLabel,
    points: r.Points,
    memberId: r.MemberId ?? null,
    refunded: Boolean(r.Refunded),
    voucher: r.VoucherCode
      ? {
          code: r.VoucherCode,
          percent: r.DiscountPercent === null ? null : Number(r.DiscountPercent),
          amount: r.DiscountAmount === null ? null : Number(r.DiscountAmount),
          maxDiscount: r.VoucherMax === null ? null : Number(r.VoucherMax),
          expiresAt: r.VoucherExpiresAt,
        }
      : null,
  };

export async function byToken(token) {
  const r = await query(`${SPIN_SELECT} WHERE s.Token = @t`, { t: [sql.Char(32), token] });
  return mapSpin(r.recordset[0]);
}

export async function byPayment(paymentId) {
  const r = await query(`${SPIN_SELECT} WHERE s.PaymentId = @p`, { p: [sql.Int, paymentId] });
  return mapSpin(r.recordset[0]);
}

/** Tạo lượt quay cho lượt thu; đã có (in lại hóa đơn / hai yêu cầu cùng lúc) → giữ lượt cũ. */
export async function ensure({ paymentId, token, expiresAt }) {
  try {
    await query('INSERT dbo.LuckySpins (PaymentId, Token, ExpiresAt) VALUES (@p, @t, @e)', {
      p: [sql.Int, paymentId],
      t: [sql.Char(32), token],
      e: [sql.DateTime2(0), expiresAt],
    });
  } catch (err) {
    if (![2601, 2627].includes(sqlErrorNumber(err))) throw err;
  }
  return byPayment(paymentId);
}

/** Lượt thu dùng để xét quyền quay: số tiền, giờ thu, hội viên, đã hoàn tiền chưa. */
export async function payment(paymentId) {
  const r = await query(
    `SELECT p.PaymentId, p.AmountDue, p.PaidAt, p.MemberId, p.SessionId,
            CASE WHEN EXISTS (SELECT 1 FROM dbo.Refunds r WHERE r.PaymentId = p.PaymentId) THEN 1 ELSE 0 END AS Refunded
     FROM dbo.Payments p WHERE p.PaymentId = @p`,
    { p: [sql.Int, paymentId] },
  );
  const x = r.recordset[0];
  return x && { paymentId: x.PaymentId, amountDue: Number(x.AmountDue), paidAt: x.PaidAt, memberId: x.MemberId ?? null, refunded: Boolean(x.Refunded) };
}

/** Các lượt thu của một phiên (kể cả thu chung / chia bill). */
export async function paymentIdsForSession(sessionId) {
  const r = await query('SELECT PaymentId FROM dbo.Payments WHERE SessionId = @s ORDER BY PaymentId', { s: [sql.UniqueIdentifier, sessionId] });
  return r.recordset.map((x) => x.PaymentId);
}

export async function spin({ token, prizeId, noneId, dailyWinCap, voucherDays, dayStart }) {
  await (
    await request()
  )
    .input('Token', sql.Char(32), token)
    .input('PrizeId', sql.Int, prizeId)
    .input('NoneId', sql.Int, noneId)
    .input('DailyWinCap', sql.Int, dailyWinCap)
    .input('VoucherDays', sql.Int, voucherDays)
    .input('DayStart', sql.DateTime2(0), dayStart)
    .execute('dbo.sp_SpinLucky');
  return byToken(token);
}

/** Kết quả từ fromUtc: số lượt quay, lượt trúng, voucher đã phát / đã dùng, tiền khách trả ở các lượt dùng voucher trúng. */
export async function stats(fromUtc) {
  const r = await query(
    `SELECT
       (SELECT COUNT(*) FROM dbo.LuckySpins WHERE SpunAt >= @f) AS Spins,
       (SELECT COUNT(*) FROM dbo.LuckySpins WHERE SpunAt >= @f AND Kind <> 'NONE') AS Wins,
       (SELECT COUNT(*) FROM dbo.Vouchers WHERE Source = 'GAME' AND CreatedAt >= @f) AS Vouchers,
       (SELECT COUNT(*) FROM dbo.Vouchers WHERE Source = 'GAME' AND CreatedAt >= @f AND UsedAt IS NOT NULL) AS Used,
       (SELECT ISNULL(SUM(p.AmountDue), 0) FROM dbo.Vouchers v JOIN dbo.Payments p ON p.PaymentId = v.UsedPaymentId
         WHERE v.Source = 'GAME' AND v.CreatedAt >= @f) AS UsedRevenue,
       (SELECT ISNULL(SUM(Points), 0) FROM dbo.LuckySpins WHERE SpunAt >= @f) AS Points`,
    { f: [sql.DateTime2(0), fromUtc] },
  );
  const x = r.recordset[0];
  return { spins: x.Spins, wins: x.Wins, vouchers: x.Vouchers, used: x.Used, usedRevenue: Number(x.UsedRevenue), points: Number(x.Points) };
}
