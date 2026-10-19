// Tính tiền cấp thanh toán (ADR-005 D-7): dùng chung cho thu tiền bàn (sessionService) và mang đi (orderService).
// Mọi số trên màn hình quầy, bill in và số ghi DB lấy từ cùng một kết quả settleTotals.
import { badRequest } from '../errors.js';
import { manualNeedsApproval, settleTotals } from '../pricing/pricing.js';
import { discountLimits } from '../auth/permissions.js';
import * as loyaltyService from './loyaltyService.js';
import { memberForPricing, publicMember } from './memberService.js';
import { getSettings } from './settingsService.js';
import { resolveApproval } from './userService.js';

/** Đơn đã lưu (ordersRepo) → đầu vào settleTotals. */
export const orderForTotals = (o) => ({
  totalAmount: o.totalAmount,
  subtotalAmount: o.subtotalAmount,
  promoDiscount: o.promoDiscount,
  orderPromoDiscount: o.orderPromotion?.discount ?? 0,
  lines: o.items.map((i) => ({ lineTotal: i.lineTotal, allowMemberStack: i.allowMemberStack, menuItemId: i.menuItemId, quantity: i.quantity, name: i.name })),
});

/** Đơn đã lưu → đầu vào partOrders (chia bill F-026 / ước tính phần chưa thu): dòng mang id, đã thu chưa, thuộc phần nào. */
export const orderForSplit = (o) => ({
  orderId: o.orderId,
  orderPromoDiscount: o.orderPromotion?.discount ?? 0,
  lines: o.items.map((i) => ({
    orderItemId: i.orderItemId,
    lineTotal: i.lineTotal,
    listTotal: i.listPrice * i.quantity,
    allowMemberStack: i.allowMemberStack,
    splitId: i.splitId,
    paidAt: i.paidAt,
    menuItemId: i.menuItemId, // F-039 quà món miễn phí / tem
    quantity: i.quantity,
    name: i.name,
  })),
});

/** Đơn vừa báo giá (pricing.priceOrder) → đầu vào settleTotals. */
export const orderFromPriced = (priced) => ({
  totalAmount: priced.total,
  subtotalAmount: priced.subtotal,
  promoDiscount: priced.promoDiscount,
  orderPromoDiscount: priced.orderPromotion?.discount ?? 0,
  lines: priced.lines.map((l) => ({
    lineTotal: l.lineTotal,
    allowMemberStack: l.allowMemberStack,
    menuItemId: l.menuItemId,
    quantity: l.quantity,
    name: l.name,
  })),
});

/** manualDiscount { kind, value } + manualReason → đầu vào pricing (null nếu không giảm). */
export function manualInput(manualDiscount, manualReason) {
  if (!manualDiscount || !(Number(manualDiscount.value) > 0)) return null;
  const reason = String(manualReason ?? '').trim();
  if (!reason) {
    throw badRequest('VALIDATION_ERROR', 'Nhập lý do giảm giá', { fields: [{ path: 'manualReason', message: 'Nhập lý do giảm giá' }] });
  }
  return { kind: manualDiscount.kind, value: Number(manualDiscount.value), reason };
}

/**
 * Tổng thanh toán cho danh sách đơn. memberId: số → hội viên đó; null → không hội viên.
 * role: vai người thao tác — ngưỡng giảm tay (D-14 nhân viên, D-24 trưởng ca, quản lý không giới hạn).
 * loyalty (F-038/F-039): { voucherCode?, reward? } — voucher + đổi thưởng; loyaltyJson truyền cho SP thu tiền.
 * Trả { totals (+ stampsEarned), member (đầy đủ, dùng phía server), memberView (cho quầy, kèm điểm/tem), needsApproval, settings, loyaltyJson }.
 */
export async function computeTotals({ orders, memberId = null, manual = null, role = 'STAFF', loyalty = {} }) {
  const [settings, member] = await Promise.all([getSettings(), memberForPricing(memberId)]);
  const prep = await loyaltyService.prepare({ orders, member, voucherCode: loyalty?.voucherCode ?? null, reward: loyalty?.reward ?? null, manual });
  const totals = { ...settleTotals({ orders, member, manual, settings, voucher: prep.voucher, reward: prep.reward }), stampsEarned: prep.stamps };
  prep.check(totals);
  const limits = discountLimits(role, settings);
  const needsApproval = limits ? manualNeedsApproval(totals.manualDiscount, totals.ordersTotal - totals.memberDiscount, limits) : false;
  const memberView = member ? { ...(await publicMember(member, { staff: true })), loyalty: await loyaltyService.summary(member, { staff: true }) } : null;
  return { totals, member, memberView, needsApproval, settings, loyaltyJson: prep.loyaltyJson };
}

/** Body thu tiền → đầu vào loyalty của computeTotals. */
export const loyaltyInput = (body) => ({ voucherCode: body.voucherCode || null, reward: body.reward ?? null });

/**
 * D-14 / D-24: giảm tay vượt ngưỡng của người thao tác → cần người có quyền cao hơn xác thực lại (quản lý; hoặc trưởng ca nếu
 * mức giảm nằm trong ngưỡng trưởng ca). Trả userId người duyệt (null khi nhân viên tự giảm trong ngưỡng).
 */
export async function approvalFor(user, { totals, needsApproval, settings }, creds) {
  if (totals.manualDiscount <= 0) return null;
  if (!needsApproval) return user.role === 'STAFF' ? null : user.userId;
  const base = totals.ordersTotal - totals.memberDiscount;
  const managerOk = !manualNeedsApproval(totals.manualDiscount, base, discountLimits('MANAGER', settings));
  const approver = await resolveApproval(user, creds, 'mức giảm giá vượt ngưỡng', { allowManager: managerOk });
  return approver.userId;
}
