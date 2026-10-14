// Đơn hàng: gửi đơn (FEATURE-003), dashboard + tiếp nhận/hoàn tất/hủy (FEATURE-007), bán mang đi (FEATURE-008).
// Ghi kho/thu tiền chỉ qua SP; realtime phát sau commit.
import { config } from '../config.js';
import { sqlErrorNumber, withDeadlockRetry } from '../db.js';
import { conflict, forbidden, fromSqlError, idsFromMessage, notFound } from '../errors.js';
import * as ordersRepo from '../repositories/ordersRepo.js';
import * as sessionsRepo from '../repositories/sessionsRepo.js';
import { publish, publishOrderEvent, ROOMS } from '../realtime/publisher.js';
import { refreshAvailability } from './menuService.js';
import { todayVn, vnDayStartUtc } from '../utils/time.js';

// ---- Idempotency-Key (chống double-tap): cùng client + key trong 60 giây → trả lại cùng kết quả ----
const IDEM_TTL_MS = 60_000;
const idem = new Map();

function idempotent(key, run) {
  const now = Date.now();
  for (const [k, v] of idem) if (v.expires < now) idem.delete(k);
  if (!key) return run();
  const hit = idem.get(key);
  if (hit) return hit.promise;
  const promise = run();
  idem.set(key, { expires: now + IDEM_TTL_MS, promise });
  promise.catch(() => idem.delete(key));
  return promise;
}

async function submitWithRetry(args) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await withDeadlockRetry(() => ordersRepo.submit(args));
    } catch (err) {
      const n = sqlErrorNumber(err);
      if ((n === 2627 || n === 2601) && attempt < 3) continue; // trùng OrderCode (rất hiếm) → sinh mã khác
      const appErr = fromSqlError(err);
      if (!appErr) throw err;
      if (appErr.code === 'OUT_OF_STOCK' || appErr.code === 'ITEM_UNAVAILABLE') {
        const items = await ordersRepo.menuItemNames(idsFromMessage(appErr.sqlMessage));
        const names = items.map((i) => i.name).join(', ');
        appErr.details = { items };
        appErr.message =
          appErr.code === 'OUT_OF_STOCK' ? `Rất tiếc, ${names} vừa hết món. Vui lòng chọn món khác` : `${names} hiện không còn bán. Vui lòng chọn món khác`;
        refreshAvailability();
      }
      throw appErr;
    }
  }
}

/** FEATURE-003: khách gửi đơn dine-in. */
export async function submitDineIn({ sessionId, items, note }, clientToken, idempotencyKey) {
  if (!(await sessionsRepo.isMember(sessionId, clientToken))) {
    throw forbidden('Phiên này không thuộc thiết bị của bạn. Vui lòng quét lại mã QR tại bàn.');
  }
  return idempotent(idempotencyKey ? `${clientToken}:${idempotencyKey}` : null, async () => {
    const { orderId, sessionReopened } = await submitWithRetry({ type: 'DINE_IN', sessionId, items, note });
    const order = await ordersRepo.getById(orderId);
    publishOrderEvent('order.created', order, { order });
    if (sessionReopened) publish([ROOMS.staff, ROOMS.session(sessionId)], 'session.payment_cancelled', { sessionId });
    refreshAvailability();
    return order;
  });
}

/** Khách chỉ xem đơn thuộc phiên của mình; nhân viên xem mọi đơn. */
export async function getForViewer(orderId, viewer) {
  const order = await ordersRepo.getById(orderId);
  if (!order) throw notFound('Không tìm thấy đơn hàng');
  if (!viewer.user && !(order.sessionId && (await sessionsRepo.isMember(order.sessionId, viewer.clientToken)))) {
    throw forbidden('Đơn hàng không thuộc phiên của bạn');
  }
  return order;
}

/** Dashboard: mặc định PENDING + PREPARING (mọi lúc) + COMPLETED trong ngày (giờ VN). */
export function listForDashboard({ statuses, since, type }) {
  return ordersRepo.listActive({
    statuses: statuses ?? ['PENDING', 'PREPARING', 'COMPLETED'],
    since: since ?? null,
    completedSince: vnDayStartUtc(todayVn()),
    type: type ?? null,
  });
}

export async function accept(orderId) {
  const { changed, status } = await ordersRepo.accept(orderId);
  if (!status) throw notFound('Không tìm thấy đơn hàng');
  if (!changed) {
    if (status === 'PREPARING' || status === 'COMPLETED') throw conflict('ALREADY_PROCESSED', 'Đơn hàng này đã được nhân viên khác xử lý');
    throw conflict('INVALID_STATE', 'Đơn hàng đã bị hủy');
  }
  const order = await ordersRepo.getById(orderId);
  publishOrderEvent('order.status_changed', order, { orderId, sessionId: order.sessionId, status: order.status, changedAt: order.acceptedAt, order });
  return order;
}

export async function complete(orderId, user) {
  const deducted = await withDeadlockRetry(() => ordersRepo.complete(orderId, user.userId));
  const order = await ordersRepo.getById(orderId);
  publishOrderEvent('order.status_changed', order, { orderId, sessionId: order.sessionId, status: order.status, changedAt: order.completedAt, order });
  for (const ing of deducted) {
    if (ing.available <= ing.threshold) {
      publish([ROOMS.staff], 'inventory.low', {
        ingredientId: ing.ingredientId,
        name: ing.name,
        unit: ing.unit,
        available: ing.available,
        threshold: ing.threshold,
      });
    }
  }
  refreshAvailability();
  return { order, inventoryDeducted: deducted.map((d) => ({ ingredientId: d.ingredientId, name: d.name, qty: d.qty, unit: d.unit })) };
}

export async function cancel(orderId, user, reason) {
  await withDeadlockRetry(() => ordersRepo.cancel(orderId, user.userId, reason));
  const order = await ordersRepo.getById(orderId);
  publishOrderEvent('order.cancelled', order, { orderId, sessionId: order.sessionId, reason: order.cancelReason, order });
  refreshAvailability();
  return order;
}

/** FEATURE-008: bán mang đi — đơn PREPARING/PAID + Payments(CASH) trong cùng transaction (sp_SubmitOrder). */
export async function takeaway({ items, amountReceived, note }, user) {
  const { orderId } = await submitWithRetry({ type: 'TAKE_AWAY', createdBy: user.userId, paymentMethod: 'CASH', amountReceived, note, items });
  const [order, payment] = await Promise.all([ordersRepo.getById(orderId), ordersRepo.paymentForOrder(orderId)]);
  publishOrderEvent('order.created', order, { order });
  refreshAvailability();
  return { order, payment };
}

/** Hóa đơn đơn mang đi (BR-014: chỉ in khi đã thu tiền). */
export async function receipt(orderId) {
  const order = await ordersRepo.getById(orderId);
  if (!order) throw notFound('Không tìm thấy đơn hàng');
  if (order.paymentStatus !== 'PAID') throw conflict('UNPAID', 'Đơn chưa thu tiền');
  if (order.type !== 'TAKE_AWAY') throw conflict('USE_SESSION_RECEIPT', 'Đơn tại bàn in hóa đơn theo phiên');
  const payment = await ordersRepo.paymentForOrder(orderId);
  return {
    kind: 'order',
    mode: 'final',
    shop: config.shop,
    table: null,
    order: { orderId, orderCode: order.orderCode, createdAt: order.createdAt },
    orders: [{ orderCode: order.orderCode, createdAt: order.createdAt }],
    lines: order.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal, note: i.note })),
    amountDue: order.totalAmount,
    payment,
    printedAt: new Date(),
  };
}
