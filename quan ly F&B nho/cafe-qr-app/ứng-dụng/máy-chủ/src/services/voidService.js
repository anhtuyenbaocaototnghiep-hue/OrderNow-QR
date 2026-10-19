// FEATURE-046 Sửa / xóa món đã gọi, xóa đơn, hủy lượt phục vụ bàn (ADR-007).
// D-33: món của đơn chờ tiếp nhận → nhân viên tự làm; đơn đã tiếp nhận / đã pha → trưởng ca / quản lý tự làm, nhân viên nhập tài khoản
//       trưởng ca / quản lý (SP kiểm lại trạng thái lúc ghi). Luôn bắt buộc lý do. D-34: món đã pha → WASTE (mặc định) / RESTOCK.
// D-35: hủy bàn = hủy mọi đơn chưa thu + đóng phiên (bàn trống lại).
import { withDeadlockRetry } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import * as ordersRepo from '../repositories/ordersRepo.js';
import * as sessionsRepo from '../repositories/sessionsRepo.js';
import * as voidRepo from '../repositories/voidRepo.js';
import { publish, publishOrderEvent, ROOMS } from '../realtime/publisher.js';
import { refreshAvailability } from './menuService.js';
import { invalidateQueue } from './etaService.js';
import { resolveApproval } from './userService.js';

const LIVE = ['PENDING', 'PREPARING', 'COMPLETED'];

/** Người duyệt: trưởng ca / quản lý tự duyệt; nhân viên nhập tài khoản khi cần (hoặc tự nguyện nhập trước). null = không cần. */
async function approverFor(user, body, needed) {
  if (user.role !== 'STAFF') return user.userId;
  if (!needed && !body.adminUsername) return null;
  const a = await resolveApproval(user, body, 'việc xóa món đã tiếp nhận / đã pha', { allowManager: true });
  return a.userId;
}

function reasonOf(body) {
  const reason = String(body.reason ?? '').trim();
  if (!reason) throw badRequest('VALIDATION_ERROR', 'Nhập lý do sửa / xóa món', { fields: [{ path: 'reason', message: 'Nhập lý do' }] });
  return reason;
}

async function announce(orderId) {
  const order = await ordersRepo.getById(orderId);
  if (order.status === 'CANCELLED') {
    publishOrderEvent('order.cancelled', order, { orderId, sessionId: order.sessionId, reason: order.cancelReason, order });
  } else {
    publishOrderEvent('order.status_changed', order, { orderId, sessionId: order.sessionId, status: order.status, order });
  }
  return order;
}

function after() {
  invalidateQueue();
  refreshAvailability();
}

/** Bỏ nốt món chưa thu của phiên đã thu một phần (chia bill) → phiên đóng như lượt thu cuối. */
async function announceClosed(sessionId) {
  const session = await sessionsRepo.findById(sessionId);
  publish([ROOMS.staff, ROOMS.session(sessionId)], 'session.closed', { sessionId, table: session.table });
}

/** Giảm số lượng / xóa một dòng món (quantity = số mới, 0 = xóa). */
export async function voidItem(orderItemId, body, user) {
  const reason = reasonOf(body);
  const line = await voidRepo.lineInfo(orderItemId);
  if (!line) throw notFound('Không tìm thấy món trong đơn', 'ITEM_NOT_FOUND');
  if (!line.sessionId || line.paid || line.paymentStatus !== 'UNPAID' || !LIVE.includes(line.status)) {
    throw conflict('ITEM_NOT_EDITABLE', 'Món đã thu tiền hoặc đơn đã đóng — dùng Hoàn tiền nếu cần');
  }
  if (!(body.quantity >= 0 && body.quantity < line.quantity)) {
    throw badRequest('INVALID_QTY', `Số lượng mới phải từ 0 đến ${line.quantity - 1} (muốn thêm món dùng "Gọi thêm món")`);
  }
  const approvedBy = await approverFor(user, body, line.status !== 'PENDING');
  const r = await withDeadlockRetry(() =>
    voidRepo.voidItem({ orderItemId, newQty: body.quantity, userId: user.userId, approvedBy, reason, stockMode: body.stockMode }),
  );
  const order = await announce(r.orderId);
  if (r.sessionClosed) await announceClosed(line.sessionId);
  after();
  return { order, cancelled: r.status === 'CANCELLED', sessionClosed: r.sessionClosed };
}

/** Xóa cả một đơn tại bàn chưa thu (mọi trạng thái còn hiệu lực). */
export async function voidOrder(orderId, body, user) {
  const reason = reasonOf(body);
  const order = await ordersRepo.getById(orderId);
  if (!order) throw notFound('Không tìm thấy đơn hàng');
  if (!order.sessionId || order.paymentStatus !== 'UNPAID' || !LIVE.includes(order.status)) {
    throw conflict('ITEM_NOT_EDITABLE', 'Đơn đã thu tiền hoặc đã hủy — dùng Hoàn tiền nếu cần');
  }
  const approvedBy = await approverFor(user, body, order.status !== 'PENDING');
  const r = await withDeadlockRetry(() =>
    voidRepo.cancelOrders({ sessionId: order.sessionId, orderId, userId: user.userId, approvedBy, reason, stockMode: body.stockMode }),
  );
  const updated = await announce(orderId);
  if (r.sessionClosed) await announceClosed(order.sessionId);
  after();
  return { order: updated, sessionClosed: r.sessionClosed };
}

/** Hủy lượt phục vụ bàn: mọi đơn chưa thu → CANCELLED, đóng phiên (không tạo lượt thu). */
export async function cancelSession(sessionId, body, user) {
  const reason = reasonOf(body);
  const session = await sessionsRepo.findById(sessionId);
  if (!session) throw notFound('Không tìm thấy phiên');
  if (session.status === 'CLOSED') throw conflict('SESSION_CLOSED', 'Bàn đã đóng');
  const orders = await ordersRepo.listBySession(sessionId);
  const live = orders.filter((o) => LIVE.includes(o.status) && o.paymentStatus === 'UNPAID');
  const approvedBy = await approverFor(
    user,
    body,
    live.some((o) => o.status !== 'PENDING'),
  );
  const r = await withDeadlockRetry(() =>
    voidRepo.cancelOrders({ sessionId, orderId: null, userId: user.userId, approvedBy, reason, stockMode: body.stockMode }),
  );
  for (const o of live) await announce(o.orderId);
  const closed = await sessionsRepo.findById(sessionId);
  publish([ROOMS.staff, ROOMS.session(sessionId)], 'session.closed', { sessionId, table: closed.table, cancelled: true, reason });
  after();
  return { session: closed, cancelledOrders: r.cancelled };
}

export const voidsOfSession = (sessionId) => voidRepo.voidsOfSession(sessionId);
