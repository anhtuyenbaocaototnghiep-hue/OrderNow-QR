// Đơn hàng: mọi thao tác đổi trạng thái kèm kho đi qua SP (rules); tiếp nhận là UPDATE có điều kiện (không chạm kho).
import { query, request, sql } from '../db.js';

const ORDER_SELECT = `
  SELECT o.OrderId, o.OrderCode, o.SessionId, o.TableId, t.Code AS TableCode, t.Name AS TableName, o.Type, o.Status,
         o.PaymentStatus, o.PaymentMethod, o.TotalAmount, o.SubtotalAmount, o.PromoDiscount, o.OrderPromotionId, op.Name AS OrderPromotionName,
         o.MemberId, o.Note, o.CreatedBy, cu.FullName AS CreatedByName,
         o.CreatedAt, o.AcceptedAt, o.PaidAt, o.CompletedAt, o.CancelledAt, o.CancelReason, o.VoidedAt
  FROM dbo.Orders o
  LEFT JOIN dbo.Tables t ON t.TableId = o.TableId
  LEFT JOIN dbo.Users cu ON cu.UserId = o.CreatedBy
  LEFT JOIN dbo.Promotions op ON op.PromotionId = o.OrderPromotionId`;

const mapOrder = (r) => ({
  orderId: r.OrderId,
  orderCode: r.OrderCode,
  sessionId: r.SessionId ? r.SessionId.toLowerCase() : null,
  table: r.TableId ? { tableId: r.TableId, code: r.TableCode, name: r.TableName } : null,
  type: r.Type,
  status: r.Status,
  paymentStatus: r.PaymentStatus,
  paymentMethod: r.PaymentMethod,
  totalAmount: r.TotalAmount,
  subtotalAmount: r.SubtotalAmount ?? r.TotalAmount, // đơn trước ADR-005 không có giá niêm yết riêng
  promoDiscount: r.PromoDiscount ?? 0,
  orderPromotion: r.OrderPromotionId ? { promotionId: r.OrderPromotionId, name: r.OrderPromotionName, discount: 0 } : null,
  memberId: r.MemberId ?? null,
  note: r.Note,
  createdBy: r.CreatedBy ? { userId: r.CreatedBy, fullName: r.CreatedByName } : null,
  createdAt: r.CreatedAt,
  acceptedAt: r.AcceptedAt,
  paidAt: r.PaidAt,
  completedAt: r.CompletedAt,
  cancelledAt: r.CancelledAt,
  cancelReason: r.CancelReason,
  voidedAt: r.VoidedAt ?? null,
  items: [],
});

/**
 * Gắn dòng món: `items` = dòng khách chọn (kèm `options` đã chọn và `children` = thành phần combo, giá 0).
 * ADR-005: listPrice (niêm yết, gồm phụ thu), unitPrice (sau khuyến mãi dòng), lineDiscount, allowMemberStack.
 */
async function attachItems(orders) {
  if (orders.length === 0) return orders;
  const ids = [sql.NVarChar(sql.MAX), orders.map((o) => o.orderId).join(',')];
  const r = await query(
    `SELECT oi.OrderItemId, oi.OrderId, oi.MenuItemId, m.Name, m.ItemType, oi.Quantity, oi.UnitPrice, oi.ListPrice, oi.LineDiscount,
            oi.PromotionId, p.Name AS PromotionName, oi.AllowMemberStack, oi.ParentOrderItemId, oi.Note, oi.SplitId, oi.PaidAt, oi.PaymentId
     FROM dbo.OrderItems oi JOIN dbo.MenuItems m ON m.MenuItemId = oi.MenuItemId
     LEFT JOIN dbo.Promotions p ON p.PromotionId = oi.PromotionId
     WHERE oi.OrderId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
     ORDER BY oi.OrderItemId;
     SELECT im.OrderItemId, im.OptionId, im.OptionName, im.PriceDelta
     FROM dbo.OrderItemModifiers im JOIN dbo.OrderItems oi ON oi.OrderItemId = im.OrderItemId
     WHERE oi.OrderId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
     ORDER BY im.OrderItemId, im.OptionId;`,
    { ids },
  );
  const [rows, mods] = r.recordsets;
  const byId = new Map(orders.map((o) => [o.orderId, o]));
  const lines = new Map();
  for (const row of rows) {
    const line = {
      orderItemId: row.OrderItemId,
      menuItemId: row.MenuItemId,
      name: row.Name,
      itemType: row.ItemType,
      quantity: row.Quantity,
      unitPrice: row.UnitPrice,
      listPrice: row.ListPrice ?? row.UnitPrice,
      lineDiscount: row.LineDiscount ?? 0,
      lineTotal: row.Quantity * row.UnitPrice,
      promotionName: row.PromotionName ?? null,
      allowMemberStack: row.AllowMemberStack !== false,
      note: row.Note,
      splitId: row.SplitId ?? null, // F-026: null = phần Chung
      paidAt: row.PaidAt ?? null,
      paymentId: row.PaymentId ?? null,
      options: [],
      children: [],
    };
    lines.set(row.OrderItemId, line);
    if (row.ParentOrderItemId) lines.get(row.ParentOrderItemId)?.children.push({ menuItemId: row.MenuItemId, name: row.Name, quantity: row.Quantity });
    else byId.get(row.OrderId)?.items.push(line);
  }
  for (const m of mods) lines.get(m.OrderItemId)?.options.push({ optionId: m.OptionId, name: m.OptionName, priceDelta: m.PriceDelta });
  for (const o of orders) {
    if (o.orderPromotion) o.orderPromotion.discount = o.promoDiscount - o.items.reduce((s, i) => s + i.lineDiscount, 0);
  }
  return orders;
}

export async function getById(orderId) {
  const r = await query(`${ORDER_SELECT} WHERE o.OrderId = @id`, { id: [sql.Int, orderId] });
  if (!r.recordset[0]) return null;
  return (await attachItems([mapOrder(r.recordset[0])]))[0];
}

/** Nhiều đơn theo id (giữ thứ tự id truyền vào). */
export async function listByIds(ids) {
  if (!ids.length) return [];
  const r = await query(`${ORDER_SELECT} WHERE o.OrderId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))`, {
    ids: [sql.NVarChar(sql.MAX), ids.join(',')],
  });
  const orders = await attachItems(r.recordset.map(mapOrder));
  const byId = new Map(orders.map((o) => [o.orderId, o]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function listBySession(sessionId) {
  const r = await query(`${ORDER_SELECT} WHERE o.SessionId = @s ORDER BY o.CreatedAt, o.OrderId`, { s: [sql.UniqueIdentifier, sessionId] });
  return attachItems(r.recordset.map(mapOrder));
}

/** Dashboard quầy: đơn theo trạng thái; `since` lọc đơn có thay đổi từ mốc đó (tạo/tiếp nhận/hoàn tất/hủy/thu tiền). */
export async function listActive({ statuses, since = null, completedSince = null, type = null }) {
  const r = await query(
    `${ORDER_SELECT}
     WHERE o.Status IN (SELECT value FROM STRING_SPLIT(@statuses, ','))
       AND (@type IS NULL OR o.Type = @type)
       AND (@since IS NULL OR o.CreatedAt >= @since OR o.AcceptedAt >= @since OR o.CompletedAt >= @since
            OR o.CancelledAt >= @since OR o.PaidAt >= @since)
       AND (@completedSince IS NULL OR o.Status <> 'COMPLETED' OR o.CompletedAt >= @completedSince)
     ORDER BY o.CreatedAt, o.OrderId`,
    {
      statuses: [sql.NVarChar(200), statuses.join(',')],
      since: [sql.DateTime2(0), since],
      completedSince: [sql.DateTime2(0), completedSince],
      type: [sql.VarChar(10), type],
    },
  );
  return attachItems(r.recordset.map(mapOrder));
}

export async function history({ fromUtc, toUtc, status = null, type = null, page = 1, pageSize = 50 }) {
  const r = await query(
    `${ORDER_SELECT.replace('SELECT o.OrderId', 'SELECT COUNT(*) OVER () AS Total, o.OrderId')}
     WHERE o.CreatedAt >= @f AND o.CreatedAt < @t
       AND (@status IS NULL OR o.Status = @status)
       AND (@type IS NULL OR o.Type = @type)
     ORDER BY o.CreatedAt DESC, o.OrderId DESC
     OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`,
    {
      f: [sql.DateTime2(0), fromUtc],
      t: [sql.DateTime2(0), toUtc],
      status: [sql.VarChar(10), status],
      type: [sql.VarChar(10), type],
      skip: [sql.Int, (page - 1) * pageSize],
      take: [sql.Int, pageSize],
    },
  );
  const total = r.recordset[0]?.Total ?? 0;
  return { items: await attachItems(r.recordset.map(mapOrder)), total, page, pageSize };
}

export async function menuItemNames(ids) {
  if (ids.length === 0) return [];
  const r = await query("SELECT MenuItemId, Name FROM dbo.MenuItems WHERE MenuItemId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))", {
    ids: [sql.NVarChar(sql.MAX), ids.join(',')],
  });
  const names = new Map(r.recordset.map((x) => [x.MenuItemId, x.Name]));
  return ids.map((id) => ({ menuItemId: id, name: names.get(id) ?? `Món #${id}` }));
}

/**
 * sp_SubmitOrder (dine-in hoặc mang đi) với dòng đã tính giá (pricing.toSpLines). `acceptNow` (F-024): nhân viên nhập đơn
 * tại bàn → vào thẳng PREPARING. `pay` chỉ dùng cho mang đi:
 * { amountReceived, expectedDue, shiftId, memberId, memberPercent, memberDiscount, manualDiscount, manualReason, approvedBy, roundingAdj }.
 */
export async function submit({
  type,
  sessionId = null,
  createdBy = null,
  paymentMethod = null,
  note = null,
  lines,
  options = [],
  orderPromotion = null,
  acceptNow = false,
  pay = {},
}) {
  const tvp = new sql.Table('dbo.OrderLineInput');
  tvp.columns.add('LineNum', sql.Int, { nullable: false });
  tvp.columns.add('ParentLineNum', sql.Int, { nullable: true });
  tvp.columns.add('MenuItemId', sql.Int, { nullable: false });
  tvp.columns.add('Quantity', sql.Int, { nullable: false });
  tvp.columns.add('Note', sql.NVarChar(200), { nullable: true });
  tvp.columns.add('ListPrice', sql.Decimal(12, 0), { nullable: false });
  tvp.columns.add('UnitPrice', sql.Decimal(12, 0), { nullable: false });
  tvp.columns.add('PromotionId', sql.Int, { nullable: true });
  tvp.columns.add('AllowMemberStack', sql.Bit, { nullable: false });
  for (const l of lines) {
    tvp.rows.add(l.lineNum, l.parentLineNum, l.menuItemId, l.quantity, l.note || null, l.listPrice, l.unitPrice, l.promotionId, l.allowMemberStack);
  }
  const opt = new sql.Table('dbo.OrderLineOptionInput');
  opt.columns.add('LineNum', sql.Int, { nullable: false });
  opt.columns.add('OptionId', sql.Int, { nullable: false });
  for (const o of options) opt.rows.add(o.lineNum, o.optionId);

  const r = await (
    await request()
  )
    .input('Type', sql.VarChar(10), type)
    .input('SessionId', sql.UniqueIdentifier, sessionId)
    .input('CreatedBy', sql.Int, createdBy)
    .input('PaymentMethod', sql.VarChar(10), paymentMethod)
    .input('AmountReceived', sql.Decimal(12, 0), pay.amountReceived ?? null)
    .input('Note', sql.NVarChar(200), note || null)
    .input('Lines', tvp)
    .input('LineOptions', opt)
    .input('OrderPromoDiscount', sql.Decimal(12, 0), orderPromotion?.discount ?? 0)
    .input('OrderPromotionId', sql.Int, orderPromotion?.promotionId ?? null)
    .input('MemberId', sql.Int, pay.memberId ?? null)
    .input('MemberPercent', sql.Decimal(5, 2), pay.memberPercent ?? null)
    .input('MemberDiscount', sql.Decimal(12, 0), pay.memberDiscount ?? 0)
    .input('ManualDiscount', sql.Decimal(12, 0), pay.manualDiscount ?? 0)
    .input('ManualReason', sql.NVarChar(200), pay.manualReason ?? null)
    .input('ApprovedBy', sql.Int, pay.approvedBy ?? null)
    .input('RoundingAdj', sql.Decimal(12, 0), pay.roundingAdj ?? 0)
    .input('VoucherDiscount', sql.Decimal(12, 0), pay.voucherDiscount ?? 0)
    .input('RewardDiscount', sql.Decimal(12, 0), pay.rewardDiscount ?? 0)
    .input('LoyaltyJson', sql.NVarChar(sql.MAX), pay.loyaltyJson ?? null)
    .input('ExpectedDue', sql.Decimal(12, 0), pay.expectedDue ?? null)
    .input('ShiftId', sql.Int, pay.shiftId ?? null)
    .input('AcceptNow', sql.Bit, acceptNow)
    .output('OrderId', sql.Int)
    .output('OrderCode', sql.Char(8))
    .output('SessionReopened', sql.Bit)
    .execute('dbo.sp_SubmitOrder');
  return { orderId: r.output.OrderId, orderCode: r.output.OrderCode, sessionReopened: Boolean(r.output.SessionReopened) };
}

/** PENDING → PREPARING (Q-004b). Trả trạng thái hiện tại nếu không đổi được. */
export async function accept(orderId) {
  const r = await query(
    `UPDATE dbo.Orders SET Status = 'PREPARING', AcceptedAt = SYSUTCDATETIME() WHERE OrderId = @id AND Status = 'PENDING';
     SELECT @@ROWCOUNT AS Changed, (SELECT Status FROM dbo.Orders WHERE OrderId = @id) AS Status;`,
    { id: [sql.Int, orderId] },
  );
  return { changed: r.recordset[0].Changed === 1, status: r.recordset[0].Status };
}

/** sp_CompleteOrder → danh sách nguyên liệu đã trừ (kèm khả dụng sau trừ). */
export async function complete(orderId, userId) {
  const r = await (await request()).input('OrderId', sql.Int, orderId).input('UserId', sql.Int, userId).execute('dbo.sp_CompleteOrder');
  return r.recordset ?? [];
}

export async function cancel(orderId, userId, reason) {
  await (
    await request()
  )
    .input('OrderId', sql.Int, orderId)
    .input('UserId', sql.Int, userId)
    .input('Reason', sql.NVarChar(200), reason || null)
    .execute('dbo.sp_CancelOrder');
}

export const PAYMENT_SELECT = `
  SELECT p.PaymentId, p.SessionId, p.OrderId, p.SplitId, p.AmountDue, p.AmountReceived, p.ChangeGiven, p.PaidAt, p.ReceivedBy, u.FullName,
         p.SubtotalAmount, p.PromoDiscount, p.MemberDiscount, p.MemberPercent, p.ManualDiscount, p.ManualReason, p.RoundingAdj, p.ShiftId,
         p.VoucherDiscount, p.RewardDiscount, p.PointsEarned, p.StampsEarned, v.Code AS VoucherCode,
         p.MemberId, mem.FullName AS MemberName, ap.FullName AS ApprovedByName,
         ISNULL((SELECT SUM(rf.Amount) FROM dbo.Refunds rf WHERE rf.PaymentId = p.PaymentId), 0) AS Refunded
  FROM dbo.Payments p
  JOIN dbo.Users u ON u.UserId = p.ReceivedBy
  LEFT JOIN dbo.Members mem ON mem.MemberId = p.MemberId
  LEFT JOIN dbo.Users ap ON ap.UserId = p.ApprovedBy
  LEFT JOIN dbo.Vouchers v ON v.VoucherId = p.VoucherId`;

export async function paymentForOrder(orderId) {
  const r = await query(`${PAYMENT_SELECT} WHERE p.OrderId = @id`, { id: [sql.Int, orderId] });
  const p = r.recordset[0];
  return p ? mapPayment(p) : null;
}

export async function paymentById(paymentId) {
  const r = await query(`${PAYMENT_SELECT} WHERE p.PaymentId = @id`, { id: [sql.Int, paymentId] });
  const p = r.recordset[0];
  return p ? { ...mapPayment(p), sessionId: p.SessionId ? p.SessionId.toLowerCase() : null, orderId: p.OrderId } : null;
}

/** Thanh toán + breakdown (ADR-005). `member` chỉ có tên — SĐT không đưa ra ngoài (D-16). */
export const mapPayment = (p) => ({
  paymentId: p.PaymentId,
  method: 'CASH',
  amountDue: p.AmountDue,
  amountReceived: p.AmountReceived,
  changeGiven: p.ChangeGiven,
  paidAt: p.PaidAt,
  receivedBy: { userId: p.ReceivedBy, fullName: p.FullName },
  subtotalAmount: p.SubtotalAmount ?? null,
  promoDiscount: p.PromoDiscount ?? 0,
  memberDiscount: p.MemberDiscount ?? 0,
  memberPercent: p.MemberPercent ?? null,
  manualDiscount: p.ManualDiscount ?? 0,
  manualReason: p.ManualReason ?? null,
  approvedBy: p.ApprovedByName ?? null,
  roundingAdj: p.RoundingAdj ?? 0,
  shiftId: p.ShiftId ?? null,
  member: p.MemberId ? { memberId: p.MemberId, fullName: p.MemberName } : null,
  refunded: p.Refunded ?? 0,
  splitId: p.SplitId ?? null, // F-026: lượt thu một phần chia bill
  // F-038 / F-039: voucher, đổi thưởng, điểm / tem đã tích
  voucherDiscount: Number(p.VoucherDiscount ?? 0),
  voucherCode: p.VoucherCode ?? null,
  rewardDiscount: Number(p.RewardDiscount ?? 0),
  pointsEarned: p.PointsEarned ?? null,
  stampsEarned: p.StampsEarned ?? null,
});
