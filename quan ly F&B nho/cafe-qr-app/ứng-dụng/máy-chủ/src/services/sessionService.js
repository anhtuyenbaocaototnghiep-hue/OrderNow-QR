// Phiên trên bàn: quét QR, gộp/tách (FEATURE-001), xem phiên (FEATURE-004), gọi thanh toán (FEATURE-005),
// thu tiền mặt / đóng bàn / hóa đơn (FEATURE-006). Quy tắc: BR-007, BR-008, BR-014, BR-018, BR-019.
import { config } from '../config.js';
import { conflict, forbidden, fromSqlError, idsFromMessage, notFound } from '../errors.js';
import { withDeadlockRetry } from '../db.js';
import * as ordersRepo from '../repositories/ordersRepo.js';
import * as sessionsRepo from '../repositories/sessionsRepo.js';
import * as tablesRepo from '../repositories/tablesRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';

const publicTable = (t) => ({ tableId: t.tableId, code: t.code, name: t.name });

async function activeTable(qrToken) {
  const table = await tablesRepo.findByQrToken(qrToken);
  if (!table || !table.isActive) throw notFound('Mã bàn không hợp lệ', 'TABLE_NOT_FOUND');
  return table;
}

/** Khách xem/thao tác phiên phải là thành viên (SessionClients); nhân viên xem được mọi phiên. */
export async function assertViewer(sessionId, viewer) {
  if (viewer.user) return;
  if (!(await sessionsRepo.isMember(sessionId, viewer.clientToken))) {
    throw forbidden('Phiên này không thuộc thiết bị của bạn. Vui lòng quét lại mã QR tại bàn.');
  }
}

export async function scan(qrToken, clientToken) {
  const table = await activeTable(qrToken);
  const mine = await sessionsRepo.findOpenForClient(table.tableId, clientToken);
  if (mine) return { state: 'MEMBER', table: publicTable(table), session: mine };
  const open = await sessionsRepo.listOpenByTable(table.tableId);
  if (open.length === 0) {
    const session = await sessionsRepo.createWithClient(table.tableId, clientToken);
    return { state: 'NEW', table: publicTable(table), session };
  }
  // Không lộ chi tiết đơn/ghi chú của khách khác — chỉ số món và giờ mở (FEATURE-001)
  return {
    state: 'OCCUPIED',
    table: publicTable(table),
    openSessions: open.map((s, i) => ({ sessionId: s.sessionId, label: `Nhóm ${i + 1}`, itemCount: s.itemCount, openedAt: s.openedAt })),
  };
}

export async function createSession(qrToken, clientToken) {
  const table = await activeTable(qrToken);
  const session = await sessionsRepo.createWithClient(table.tableId, clientToken);
  return { table: publicTable(table), session };
}

export async function join(sessionId, qrToken, clientToken) {
  const table = await activeTable(qrToken);
  const session = await sessionsRepo.findById(sessionId);
  if (!session || session.table.tableId !== table.tableId) throw notFound('Không tìm thấy nhóm trên bàn này');
  if (session.status === 'CLOSED') {
    throw conflict('SESSION_CLOSED', 'Đơn hàng nhóm đã được thanh toán, hệ thống sẽ tạo phiên mới cho bạn');
  }
  await sessionsRepo.addClient(sessionId, clientToken);
  return { table: publicTable(table), session };
}

export async function getDetail(sessionId, viewer) {
  await assertViewer(sessionId, viewer);
  const session = await sessionsRepo.findById(sessionId);
  if (!session) throw notFound('Không tìm thấy phiên');
  const [orders, payment] = await Promise.all([
    ordersRepo.listBySession(sessionId),
    session.status === 'CLOSED' ? sessionsRepo.paymentForSession(sessionId) : null,
  ]);
  return { ...session, orders, payment };
}

export async function requestPayment(sessionId, clientToken) {
  await assertViewer(sessionId, { clientToken });
  const { amountDue, requestedAt } = await withDeadlockRetry(() => sessionsRepo.requestPayment(sessionId));
  const session = await sessionsRepo.findById(sessionId);
  publish([ROOMS.staff, ROOMS.session(sessionId)], 'session.payment_requested', {
    sessionId,
    table: session.table,
    amountDue,
    requestedAt,
    orderCount: session.orderCount,
  });
  return { status: 'PAYMENT_REQUESTED', amountDue, requestedAt };
}

export const listByStatus = (statuses) => sessionsRepo.listByStatus(statuses);

export async function settle(sessionId, { amountReceived, expectedAmountDue }, user) {
  let result;
  try {
    result = await withDeadlockRetry(() => sessionsRepo.settle(sessionId, { amountReceived, expectedAmountDue, userId: user.userId }));
  } catch (err) {
    const appErr = fromSqlError(err);
    if (appErr?.code === 'HAS_PENDING_ORDERS') appErr.details = { orderIds: idsFromMessage(appErr.sqlMessage) };
    throw appErr ?? err;
  }
  const [session, payment] = await Promise.all([sessionsRepo.findById(sessionId), sessionsRepo.paymentForSession(sessionId)]);
  publish([ROOMS.staff, ROOMS.session(sessionId)], 'session.settled', {
    sessionId,
    table: session.table,
    paymentId: payment.paymentId,
    amountDue: payment.amountDue,
    amountReceived: payment.amountReceived,
    changeGiven: payment.changeGiven,
    paidAt: payment.paidAt,
  });
  return { session, payment, amountDue: result.amountDue };
}

export async function closeEmpty(sessionId, user) {
  await withDeadlockRetry(() => sessionsRepo.closeEmpty(sessionId, user.userId));
  const session = await sessionsRepo.findById(sessionId);
  publish([ROOMS.staff, ROOMS.session(sessionId)], 'session.closed', { sessionId, table: session.table });
  return session;
}

/** Dữ liệu in hóa đơn phiên: final chỉ khi đã thu tiền (BR-014); provisional = phiếu tạm tính. */
export async function receipt(sessionId, mode) {
  const session = await sessionsRepo.findById(sessionId);
  if (!session) throw notFound('Không tìm thấy phiên');
  const payment = session.status === 'CLOSED' ? await sessionsRepo.paymentForSession(sessionId) : null;
  if (mode === 'final' && !payment) throw conflict('UNPAID', 'Phiên chưa thu tiền — chỉ in được phiếu tạm tính');
  const orders = (await ordersRepo.listBySession(sessionId)).filter((o) => o.status !== 'CANCELLED');
  return {
    kind: 'session',
    mode,
    shop: config.shop,
    table: session.table,
    session: { sessionId, code: sessionId.slice(0, 8).toUpperCase(), openedAt: session.openedAt, closedAt: session.closedAt },
    orders: orders.map((o) => ({ orderCode: o.orderCode, createdAt: o.createdAt })),
    lines: orders.flatMap((o) => o.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal, note: i.note }))),
    amountDue: orders.reduce((s, o) => s + o.totalAmount, 0),
    payment,
    printedAt: new Date(),
  };
}
