// FEATURE-019 Hoàn tiền sau khi đã thu (ADR-005 D-15): ADMIN, hoặc STAFF kèm tài khoản quản lý xác thực lại; bắt buộc lý do;
// trong ngày thu tiền; trừ vào ca đang mở (F-018). Ghi qua sp_RefundPayment (khóa lượt thu → bấm đồng thời không hoàn vượt).
// ADR-006 D-24: trưởng ca (MANAGER) tự hoàn / duyệt cho lượt thu TRONG CA ĐANG MỞ (manager.refund_same_shift_only).
import { withDeadlockRetry } from '../db.js';
import { notFound } from '../errors.js';
import * as ordersRepo from '../repositories/ordersRepo.js';
import * as refundsRepo from '../repositories/refundsRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { refreshAvailability } from './menuService.js';
import { requireOpenShift } from './shiftService.js';
import { resolveApproval } from './userService.js';
import { getSettings } from './settingsService.js';
import * as alertService from './alertService.js';

/** Chi tiết lượt thu để chọn hoàn: thanh toán + các đơn + các lần đã hoàn. */
export async function paymentDetail(paymentId) {
  const payment = await ordersRepo.paymentById(paymentId);
  if (!payment) throw notFound('Không tìm thấy lượt thu tiền');
  const orders = payment.sessionId ? await ordersRepo.listBySession(payment.sessionId) : [await ordersRepo.getById(payment.orderId)];
  return { payment, orders: orders.filter((o) => o.status !== 'CANCELLED'), refunds: await refundsRepo.listForPayment(paymentId) };
}

export async function refund(paymentId, body, user) {
  const payment = await ordersRepo.paymentById(paymentId);
  if (!payment) throw notFound('Không tìm thấy lượt thu tiền');
  const shift = await requireOpenShift();
  const settings = await getSettings();
  const allowManager = !settings.managerRefundSameShiftOnly || payment.shiftId === shift.shiftId;
  const approver = await resolveApproval(user, body, 'việc hoàn tiền', { allowManager });
  const refundId = await withDeadlockRetry(() =>
    refundsRepo.create({
      paymentId,
      amount: body.amount,
      reason: body.reason,
      restock: body.restockInventory,
      orderIds: body.orderIds,
      userId: user.userId,
      approvedBy: approver.userId,
      shiftId: shift.shiftId,
    }),
  );
  const detail = await paymentDetail(paymentId);
  const created = detail.refunds.find((x) => x.refundId === refundId);
  publish([ROOMS.staff], 'payment.refunded', { paymentId, refund: created });
  for (const o of detail.orders.filter((x) => created.voidedOrderIds.includes(x.orderId))) {
    publish([ROOMS.staff], 'order.status_changed', { orderId: o.orderId, sessionId: o.sessionId, status: o.status, order: o });
  }
  refreshAvailability();
  // F-060 (ADR-020 D-75): hoàn tiền lớn → cảnh báo tức thì (lỗi không làm hỏng việc hoàn tiền)
  await alertService.onRefund(created, { user, shiftId: shift.shiftId }).catch((err) => console.error('alert refund:', err?.message ?? err));
  return { refund: created, ...detail };
}

export const list = (fromUtc, toUtc) => refundsRepo.list(fromUtc, toUtc);
