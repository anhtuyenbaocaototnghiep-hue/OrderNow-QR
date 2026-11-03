// F-067 quà sinh nhật (ADR-025): quà của hội viên theo năm, phát quà (voucher BIRTHDAY + dòng BirthdayGifts trong một transaction),
// hội viên có ngày sinh (danh sách sắp tới), thống kê, khách tự thêm ngày sinh.
import { inTransaction, query, sql, sqlErrorNumber, txQuery } from '../db.js';

const mapGift = (r) =>
  r && {
    memberId: r.MemberId,
    year: r.GiftYear,
    birthdayDate: r.BirthdayDate.toISOString().slice(0, 10),
    voucherId: r.VoucherId,
    code: r.Code,
    percent: r.DiscountPercent === null ? null : Number(r.DiscountPercent),
    amount: r.DiscountAmount === null ? null : Number(r.DiscountAmount),
    maxDiscount: r.MaxDiscount === null ? null : Number(r.MaxDiscount),
    menuItemId: r.MenuItemId ?? null,
    menuItemName: r.MenuItemName ?? null,
    expiresAt: r.ExpiresAt,
    usedAt: r.UsedAt,
  };

const GIFT_SELECT = `
  SELECT g.MemberId, g.GiftYear, g.BirthdayDate, v.VoucherId, v.Code, v.DiscountPercent, v.DiscountAmount, v.MaxDiscount, v.MenuItemId,
         mi.Name AS MenuItemName, v.ExpiresAt, v.UsedAt
  FROM dbo.BirthdayGifts g JOIN dbo.Vouchers v ON v.VoucherId = g.VoucherId
  LEFT JOIN dbo.MenuItems mi ON mi.MenuItemId = v.MenuItemId`;

export async function giftOf(memberId, year) {
  const r = await query(`${GIFT_SELECT} WHERE g.MemberId = @m AND g.GiftYear = @y`, { m: [sql.Int, memberId], y: [sql.SmallInt, year] });
  return mapGift(r.recordset[0]);
}

/** Quà các năm `years` của nhiều hội viên — cho danh sách sinh nhật sắp tới. → Map `${memberId}:${year}` → quà */
export async function giftsForYears(years) {
  const r = await query(
    `${GIFT_SELECT} WHERE g.GiftYear IN (${years.map((_, i) => `@y${i}`).join(', ')})`,
    Object.fromEntries(years.map((y, i) => [`y${i}`, [sql.SmallInt, y]])),
  );
  return new Map(r.recordset.map((x) => [`${x.MemberId}:${x.GiftYear}`, mapGift(x)]));
}

/**
 * Phát quà: voucher BIRTHDAY gắn hội viên + dòng BirthdayGifts trong một transaction.
 * Đã có quà năm đó (hai yêu cầu cùng lúc) → khóa chính chặn, transaction hủy cả voucher → trả null để bên gọi đọc lại.
 */
export async function issue({ memberId, year, birthdayDate, code, percent, amount, maxDiscount, menuItemId, expiresAt }) {
  try {
    await inTransaction(async (tx) => {
      const v = await txQuery(
        tx,
        `INSERT dbo.Vouchers (Code, MemberId, DiscountPercent, DiscountAmount, MaxDiscount, MenuItemId, ExpiresAt, Source)
         OUTPUT inserted.VoucherId VALUES (@c, @m, @p, @a, @x, @mi, @e, 'BIRTHDAY')`,
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
      await txQuery(tx, 'INSERT dbo.BirthdayGifts (MemberId, GiftYear, BirthdayDate, VoucherId) VALUES (@m, @y, @d, @v)', {
        m: [sql.Int, memberId],
        y: [sql.SmallInt, year],
        d: [sql.Date, birthdayDate],
        v: [sql.Int, v.recordset[0].VoucherId],
      });
    });
  } catch (err) {
    if ([2601, 2627].includes(sqlErrorNumber(err))) return null;
    throw err;
  }
  return giftOf(memberId, year);
}

/** Món được tặng (FREE_ITEM): còn bán, không phải combo đã xóa. */
export async function menuItem(id) {
  const r = await query('SELECT MenuItemId, Name, Price, IsActive FROM dbo.MenuItems WHERE MenuItemId = @id', { id: [sql.Int, id] });
  const x = r.recordset[0];
  return x && { menuItemId: x.MenuItemId, name: x.Name, price: Number(x.Price), isActive: Boolean(x.IsActive) };
}

/** Hội viên đang hoạt động có ngày sinh + số hội viên chưa có ngày sinh. */
export async function membersWithBirthDate() {
  const r = await query(
    `SELECT m.MemberId, m.FullName, m.Phone, t.Name AS TierName, m.BirthDate, m.BirthDateSelfAt
     FROM dbo.Members m JOIN dbo.MemberTiers t ON t.TierCode = m.TierCode
     WHERE m.IsActive = 1 AND m.AnonymizedAt IS NULL AND m.BirthDate IS NOT NULL;
     SELECT COUNT(*) AS N FROM dbo.Members WHERE IsActive = 1 AND AnonymizedAt IS NULL AND BirthDate IS NULL;`,
  );
  return {
    members: r.recordsets[0].map((x) => ({
      memberId: x.MemberId,
      fullName: x.FullName,
      phone: x.Phone,
      tierName: x.TierName,
      birthDate: x.BirthDate.toISOString().slice(0, 10),
      birthDateSelfAt: x.BirthDateSelfAt,
    })),
    withoutBirthDate: r.recordsets[1][0].N,
  };
}

/** Quà của năm `year`: đã tặng, đã dùng, tiền khách trả ở các lượt dùng quà, tổng tiền quà đã trừ. */
export async function stats(year) {
  const r = await query(
    `SELECT COUNT(*) AS Issued, SUM(CASE WHEN v.UsedAt IS NOT NULL THEN 1 ELSE 0 END) AS Used,
            ISNULL(SUM(p.AmountDue), 0) AS UsedRevenue, ISNULL(SUM(p.VoucherDiscount), 0) AS GiftValue
     FROM dbo.BirthdayGifts g JOIN dbo.Vouchers v ON v.VoucherId = g.VoucherId
     LEFT JOIN dbo.Payments p ON p.PaymentId = v.UsedPaymentId
     WHERE g.GiftYear = @y`,
    { y: [sql.SmallInt, year] },
  );
  const x = r.recordset[0];
  return { issued: x.Issued, used: x.Used ?? 0, usedRevenue: Number(x.UsedRevenue), giftValue: Number(x.GiftValue) };
}

/** D-99: khách tự thêm ngày sinh — chỉ khi còn trống (một lần). → true nếu ghi được */
export async function setSelfBirthDate(memberId, birthDate) {
  const r = await query(
    `UPDATE dbo.Members SET BirthDate = @b, BirthDateSelfAt = SYSUTCDATETIME()
     WHERE MemberId = @m AND BirthDate IS NULL AND AnonymizedAt IS NULL AND IsActive = 1`,
    { m: [sql.Int, memberId], b: [sql.Date, birthDate] },
  );
  return r.rowsAffected[0] === 1;
}
