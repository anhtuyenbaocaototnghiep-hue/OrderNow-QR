// F-069 mừng khách quay lại (ADR-027): quà quay lại (voucher WINBACK + dòng WinbackGifts trong một transaction), thống kê, danh sách.
import { inTransaction, query, sql, sqlErrorNumber, txQuery } from '../db.js';

const mapGift = (r) =>
  r && {
    giftId: r.GiftId,
    memberId: r.MemberId,
    fullName: r.FullName ?? null,
    lastVisitBefore: r.LastVisitBefore,
    absentDays: r.AbsentDays,
    createdAt: r.CreatedAt,
    voucherId: r.VoucherId,
    code: r.Code,
    percent: r.DiscountPercent === null ? null : Number(r.DiscountPercent),
    amount: r.DiscountAmount === null ? null : Number(r.DiscountAmount),
    maxDiscount: r.MaxDiscount === null ? null : Number(r.MaxDiscount),
    menuItemId: r.MenuItemId ?? null,
    menuItemName: r.MenuItemName ?? null,
    expiresAt: r.ExpiresAt,
    usedAt: r.UsedAt,
    usedPaymentId: r.UsedPaymentId ?? null,
  };

const GIFT_SELECT = `
  SELECT w.GiftId, w.MemberId, m.FullName, w.LastVisitBefore, w.AbsentDays, w.CreatedAt, v.VoucherId, v.Code, v.DiscountPercent,
         v.DiscountAmount, v.MaxDiscount, v.MenuItemId, mi.Name AS MenuItemName, v.ExpiresAt, v.UsedAt, v.UsedPaymentId
  FROM dbo.WinbackGifts w JOIN dbo.Vouchers v ON v.VoucherId = w.VoucherId
  JOIN dbo.Members m ON m.MemberId = w.MemberId
  LEFT JOIN dbo.MenuItems mi ON mi.MenuItemId = v.MenuItemId`;

/** Quà quay lại gần nhất của hội viên (null nếu chưa từng có). */
export async function latestGift(memberId) {
  const r = await query(`${GIFT_SELECT} WHERE w.MemberId = @m ORDER BY w.CreatedAt DESC, w.GiftId DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY`, {
    m: [sql.Int, memberId],
  });
  return mapGift(r.recordset[0]);
}

/**
 * D-108: phát quà — voucher WINBACK gắn hội viên + dòng WinbackGifts trong một transaction.
 * Đợt vắng đã có quà (hai yêu cầu cùng lúc) → khóa (MemberId, LastVisitBefore) chặn, hủy cả voucher → null để bên gọi đọc lại.
 */
export async function issue({ memberId, lastVisitBefore, absentDays, code, percent, amount, maxDiscount, menuItemId, expiresAt }) {
  try {
    await inTransaction(async (tx) => {
      const v = await txQuery(
        tx,
        `INSERT dbo.Vouchers (Code, MemberId, DiscountPercent, DiscountAmount, MaxDiscount, MenuItemId, ExpiresAt, Source)
         OUTPUT inserted.VoucherId VALUES (@c, @m, @p, @a, @x, @mi, @e, 'WINBACK')`,
        {
          c: [sql.VarChar(20), code],
          m: [sql.Int, memberId],
          p: [sql.Decimal(5, 2), percent ?? null],
          a: [sql.Decimal(12, 0), amount ?? null],
          x: [sql.Decimal(12, 0), maxDiscount ?? null],
          mi: [sql.Int, menuItemId ?? null],
          e: [sql.DateTime2(0), expiresAt],
        },
      );
      await txQuery(tx, 'INSERT dbo.WinbackGifts (MemberId, LastVisitBefore, AbsentDays, VoucherId) VALUES (@m, @lv, @d, @v)', {
        m: [sql.Int, memberId],
        lv: [sql.DateTime2(0), lastVisitBefore],
        d: [sql.Int, absentDays],
        v: [sql.Int, v.recordset[0].VoucherId],
      });
    });
  } catch (err) {
    if ([2601, 2627].includes(sqlErrorNumber(err))) return null;
    throw err;
  }
  return latestGift(memberId);
}

/**
 * Quà phát từ `since`: đã tặng, đã dùng, tiền quà đã trừ, khách trả ở các lượt dùng quà,
 * returnedAgain = số quà đã dùng mà hội viên thanh toán thêm ít nhất một lần trong 30 ngày sau lượt dùng quà.
 */
export async function stats(since) {
  const r = await query(
    `SELECT COUNT(*) AS Issued, SUM(CASE WHEN v.UsedAt IS NOT NULL THEN 1 ELSE 0 END) AS Used,
            ISNULL(SUM(p.AmountDue), 0) AS UsedRevenue, ISNULL(SUM(p.VoucherDiscount), 0) AS GiftValue, SUM(again.Hit) AS ReturnedAgain
     FROM dbo.WinbackGifts w JOIN dbo.Vouchers v ON v.VoucherId = w.VoucherId
     LEFT JOIN dbo.Payments p ON p.PaymentId = v.UsedPaymentId
     OUTER APPLY (SELECT CASE WHEN p.PaymentId IS NOT NULL AND EXISTS (
                    SELECT 1 FROM dbo.Payments p2
                    WHERE p2.MemberId = w.MemberId AND p2.PaidAt > p.PaidAt AND p2.PaidAt <= DATEADD(DAY, 30, p.PaidAt)) THEN 1 ELSE 0 END AS Hit) again
     WHERE w.CreatedAt >= @since`,
    { since: [sql.DateTime2(0), since] },
  );
  const x = r.recordset[0];
  return {
    issued: x.Issued,
    used: x.Used ?? 0,
    returnedAgain: x.ReturnedAgain ?? 0,
    giftValue: Number(x.GiftValue),
    usedRevenue: Number(x.UsedRevenue),
  };
}

/** Quà gần đây (mới trước). */
export async function recent(limit = 20) {
  const r = await query(`${GIFT_SELECT} ORDER BY w.CreatedAt DESC, w.GiftId DESC OFFSET 0 ROWS FETCH NEXT @n ROWS ONLY`, { n: [sql.Int, limit] });
  return r.recordset.map(mapGift);
}

/** Số hội viên đang vắng: đã từng thanh toán, lần cuối trước `awayBefore` (UTC). */
export async function awayCount(awayBefore) {
  const r = await query(`SELECT COUNT(*) AS N FROM dbo.Members WHERE IsActive = 1 AND AnonymizedAt IS NULL AND LastVisitAt IS NOT NULL AND LastVisitAt < @b`, {
    b: [sql.DateTime2(0), awayBefore],
  });
  return r.recordset[0].N;
}
