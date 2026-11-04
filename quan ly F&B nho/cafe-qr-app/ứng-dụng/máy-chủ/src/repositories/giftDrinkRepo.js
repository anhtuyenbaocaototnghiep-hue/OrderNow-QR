// F-070 ly treo (ADR-028): bán ly tặng (voucher GIFT + sổ quỹ + GiftDrinks trong một transaction), trang quà, quản lý.
import { inTransaction, query, sql, txQuery } from '../db.js';

const n = (v) => (v === null || v === undefined ? null : Number(v));
const map = (r) =>
  r && {
    giftId: r.GiftId,
    token: r.Token.trim(),
    voucherId: r.VoucherId,
    code: r.Code,
    menuItemId: r.MenuItemId,
    menuItemName: r.MenuItemName,
    currentPrice: n(r.CurrentPrice),
    amount: n(r.Amount),
    method: r.Method,
    shiftId: r.ShiftId,
    giverName: r.GiverName,
    message: r.Message,
    createdAt: r.CreatedAt,
    expiresAt: r.ExpiresAt,
    usedAt: r.UsedAt,
    usedPaymentId: r.UsedPaymentId ?? null,
    cancelledAt: r.CancelledAt,
  };

const SELECT = `
  SELECT g.GiftId, g.Token, g.VoucherId, v.Code, g.MenuItemId, mi.Name AS MenuItemName, mi.Price AS CurrentPrice, g.Amount, g.Method,
         g.ShiftId, g.GiverName, g.Message, g.CreatedAt, v.ExpiresAt, v.UsedAt, v.UsedPaymentId, g.CancelledAt
  FROM dbo.GiftDrinks g JOIN dbo.Vouchers v ON v.VoucherId = g.VoucherId JOIN dbo.MenuItems mi ON mi.MenuItemId = g.MenuItemId`;

/** Món bán làm ly tặng được: món đơn (không combo), đang bán, chưa xóa, giá > 0. */
const SELLABLE = `mi.IsActive = 1 AND mi.DeletedAt IS NULL AND mi.ItemType = 'SINGLE' AND mi.Price > 0`;
export async function sellableItems() {
  const r = await query(`SELECT mi.MenuItemId, mi.Name, mi.Price FROM dbo.MenuItems mi WHERE ${SELLABLE} ORDER BY mi.Name`);
  return r.recordset.map((x) => ({ menuItemId: x.MenuItemId, name: x.Name, price: Number(x.Price) }));
}
export async function sellableItem(id) {
  const r = await query(`SELECT mi.MenuItemId, mi.Name, mi.Price FROM dbo.MenuItems mi WHERE mi.MenuItemId = @id AND ${SELLABLE}`, { id: [sql.Int, id] });
  const x = r.recordset[0];
  return x ? { menuItemId: x.MenuItemId, name: x.Name, price: Number(x.Price) } : null;
}

/**
 * D-112, D-116: bán một ly tặng. Khóa ca đang mở (HOLDLOCK — như sp_CreateCashTxn, chạy tuần tự với sp_CloseShift),
 * voucher GIFT, (tiền mặt) sổ quỹ thu "Bán ly tặng" đã duyệt, dòng GiftDrinks. Lỗi: 50070 NO_OPEN_SHIFT; trùng mã → 2601/2627.
 */
export async function sell({ shiftId, menuItemId, amount, method, giverName, message, userId, code, token, expiresAt, reason }) {
  const giftId = await inTransaction(async (tx) => {
    const shift = await txQuery(tx, 'SELECT ShiftId FROM dbo.Shifts WITH (HOLDLOCK) WHERE ShiftId = @s AND ClosedAt IS NULL', { s: [sql.Int, shiftId] });
    if (!shift.recordset.length) throw Object.assign(new Error('NO_OPEN_SHIFT'), { number: 50070 });
    const v = await txQuery(
      tx,
      `INSERT dbo.Vouchers (Code, MemberId, DiscountAmount, MenuItemId, ExpiresAt, Source, CreatedBy)
       OUTPUT inserted.VoucherId VALUES (@c, NULL, @a, @mi, @e, 'GIFT', @u)`,
      { c: [sql.VarChar(20), code], a: [sql.Decimal(12, 0), amount], mi: [sql.Int, menuItemId], e: [sql.DateTime2(0), expiresAt], u: [sql.Int, userId] },
    );
    let cashTxnId = null;
    if (method === 'CASH') {
      const c = await txQuery(
        tx,
        `INSERT dbo.CashTransactions (ShiftId, CategoryId, Direction, Amount, Reason, Status, CreatedBy, ApprovedBy, ApprovedAt)
         OUTPUT inserted.CashTxnId
         SELECT @s, CategoryId, 'IN', @a, @r, 'APPROVED', @u, @u, SYSUTCDATETIME() FROM dbo.CashCategories WHERE SystemCode = 'GIFT_SALE'`,
        { s: [sql.Int, shiftId], a: [sql.Decimal(12, 0), amount], r: [sql.NVarChar(200), reason], u: [sql.Int, userId] },
      );
      cashTxnId = c.recordset[0].CashTxnId;
    }
    const g = await txQuery(
      tx,
      `INSERT dbo.GiftDrinks (Token, VoucherId, MenuItemId, Amount, Method, ShiftId, CashTxnId, GiverName, Message, CreatedBy)
       OUTPUT inserted.GiftId VALUES (@t, @v, @mi, @a, @m, @s, @cx, @gn, @msg, @u)`,
      {
        t: [sql.Char(32), token],
        v: [sql.Int, v.recordset[0].VoucherId],
        mi: [sql.Int, menuItemId],
        a: [sql.Decimal(12, 0), amount],
        m: [sql.VarChar(10), method],
        s: [sql.Int, shiftId],
        cx: [sql.Int, cashTxnId],
        gn: [sql.NVarChar(60), giverName || null],
        msg: [sql.NVarChar(150), message || null],
        u: [sql.Int, userId],
      },
    );
    return g.recordset[0].GiftId;
  });
  return byId(giftId);
}

export async function byId(id) {
  const r = await query(`${SELECT} WHERE g.GiftId = @id`, { id: [sql.Int, id] });
  return map(r.recordset[0]);
}
export async function byToken(token) {
  const r = await query(`${SELECT} WHERE g.Token = @t`, { t: [sql.Char(32), token] });
  return map(r.recordset[0]);
}
export async function byVoucher(voucherId) {
  const r = await query(`${SELECT} WHERE g.VoucherId = @v`, { v: [sql.Int, voucherId] });
  return map(r.recordset[0]);
}
export async function list(limit = 30) {
  const r = await query(`${SELECT} ORDER BY g.CreatedAt DESC, g.GiftId DESC OFFSET 0 ROWS FETCH NEXT @n ROWS ONLY`, { n: [sql.Int, limit] });
  return r.recordset.map(map);
}

/**
 * Số liệu từ `since`: ly bán (chưa hủy) + tiền; ly đã dùng; trong đó người nhận là khách mới
 * (lượt thu không gắn hội viên, hoặc hội viên đăng ký từ lúc bán ly trở về sau).
 */
export async function stats(since) {
  const r = await query(
    `SELECT
       (SELECT COUNT(*) FROM dbo.GiftDrinks WHERE CreatedAt >= @since AND CancelledAt IS NULL) AS Sold,
       (SELECT ISNULL(SUM(Amount), 0) FROM dbo.GiftDrinks WHERE CreatedAt >= @since AND CancelledAt IS NULL) AS SoldAmount,
       (SELECT COUNT(*) FROM dbo.GiftDrinks g JOIN dbo.Vouchers v ON v.VoucherId = g.VoucherId WHERE v.UsedAt >= @since) AS Used,
       (SELECT COUNT(*) FROM dbo.GiftDrinks g JOIN dbo.Vouchers v ON v.VoucherId = g.VoucherId
          JOIN dbo.Payments p ON p.PaymentId = v.UsedPaymentId LEFT JOIN dbo.Members m ON m.MemberId = p.MemberId
          WHERE v.UsedAt >= @since AND (p.MemberId IS NULL OR m.CreatedAt >= g.CreatedAt)) AS NewCustomers`,
    { since: [sql.DateTime2(0), since] },
  );
  const x = r.recordset[0];
  return { sold: x.Sold, soldAmount: Number(x.SoldAmount), used: x.Used, newCustomers: x.NewCustomers };
}

/** Ly tặng đã bán, chưa dùng, chưa hủy, còn hạn — quán còn "nợ" khách (D-116). */
export async function outstanding() {
  const r = await query(
    `SELECT COUNT(*) AS N, ISNULL(SUM(g.Amount), 0) AS Amount
     FROM dbo.GiftDrinks g JOIN dbo.Vouchers v ON v.VoucherId = g.VoucherId
     WHERE g.CancelledAt IS NULL AND v.UsedAt IS NULL AND v.ExpiresAt > SYSUTCDATETIME()`,
  );
  return { count: r.recordset[0].N, amount: Number(r.recordset[0].Amount) };
}

/** Gia hạn: chỉ ly chưa dùng, chưa hủy. → true nếu đổi được */
export async function extend(id, expiresAt) {
  const r = await query(
    `UPDATE v SET ExpiresAt = @e FROM dbo.Vouchers v JOIN dbo.GiftDrinks g ON g.VoucherId = v.VoucherId
     WHERE g.GiftId = @id AND g.CancelledAt IS NULL AND v.UsedAt IS NULL`,
    { id: [sql.Int, id], e: [sql.DateTime2(0), expiresAt] },
  );
  return r.rowsAffected[0] === 1;
}

/**
 * D-117: hủy & hoàn tiền — một transaction: voucher hết hiệu lực ngay (chỉ khi chưa dùng — khóa dòng voucher), (tiền mặt) sổ quỹ chi
 * "Hoàn ly tặng" ở ca `shiftId` đang mở, đánh dấu hủy. → 'OK' | 'USED' | 'CANCELLED' | 'NO_SHIFT'
 */
export async function cancel({ id, userId, shiftId = null, reason }) {
  return inTransaction(async (tx) => {
    const cur = await txQuery(
      tx,
      `SELECT g.Method, g.Amount, g.CancelledAt, v.UsedAt, v.VoucherId
       FROM dbo.GiftDrinks g JOIN dbo.Vouchers v WITH (UPDLOCK, HOLDLOCK) ON v.VoucherId = g.VoucherId WHERE g.GiftId = @id`,
      { id: [sql.Int, id] },
    );
    const g = cur.recordset[0];
    if (!g) return 'NOT_FOUND';
    if (g.CancelledAt) return 'CANCELLED';
    if (g.UsedAt) return 'USED';
    let refundId = null;
    if (g.Method === 'CASH') {
      const shift = await txQuery(tx, 'SELECT ShiftId FROM dbo.Shifts WITH (HOLDLOCK) WHERE ShiftId = @s AND ClosedAt IS NULL', { s: [sql.Int, shiftId] });
      if (!shift.recordset.length) return 'NO_SHIFT';
      const c = await txQuery(
        tx,
        `INSERT dbo.CashTransactions (ShiftId, CategoryId, Direction, Amount, Reason, Status, CreatedBy, ApprovedBy, ApprovedAt)
         OUTPUT inserted.CashTxnId
         SELECT @s, CategoryId, 'OUT', @a, @r, 'APPROVED', @u, @u, SYSUTCDATETIME() FROM dbo.CashCategories WHERE SystemCode = 'GIFT_REFUND'`,
        { s: [sql.Int, shiftId], a: [sql.Decimal(12, 0), g.Amount], r: [sql.NVarChar(200), reason], u: [sql.Int, userId] },
      );
      refundId = c.recordset[0].CashTxnId;
    }
    // lùi 1 giây: DATETIME2(0) làm tròn — hết hạn "bây giờ" có thể bị tròn lên, mã vừa hủy còn hợp lệ thêm nửa giây
    await txQuery(tx, 'UPDATE dbo.Vouchers SET ExpiresAt = DATEADD(SECOND, -1, SYSUTCDATETIME()) WHERE VoucherId = @v', { v: [sql.Int, g.VoucherId] });
    await txQuery(tx, 'UPDATE dbo.GiftDrinks SET CancelledAt = SYSUTCDATETIME(), CancelledBy = @u, RefundCashTxnId = @r WHERE GiftId = @id', {
      id: [sql.Int, id],
      u: [sql.Int, userId],
      r: [sql.Int, refundId],
    });
    return 'OK';
  });
}
