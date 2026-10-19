// Phiên trên bàn: quét QR, gộp/tách (FEATURE-001), xem phiên (FEATURE-004), gọi thanh toán (FEATURE-005),
// thu tiền mặt / đóng bàn / hóa đơn (FEATURE-006). Quy tắc: BR-007, BR-008, BR-014, BR-018, BR-019.
// ADR-005: thu tiền tính hội viên + giảm tay + làm tròn bằng pricing (D-7), bắt buộc ca mở (F-018).
// FEATURE-024: nhân viên mở bàn + ghi chú bàn (chỉ nhân viên thấy — customerView bỏ đi).
// FEATURE-026: phiên đã chia bill thu từng phần (splitService); ước tính / hóa đơn tính theo dòng chưa thu.
import { config } from '../config.js';
import { conflict, forbidden, fromSqlError, idsFromMessage, notFound } from '../errors.js';
import { withDeadlockRetry } from '../db.js';
import * as membersRepo from '../repositories/membersRepo.js';
import * as ordersRepo from '../repositories/ordersRepo.js';
import * as sessionsRepo from '../repositories/sessionsRepo.js';
import * as splitsRepo from '../repositories/splitsRepo.js';
import * as tablesRepo from '../repositories/tablesRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { approvalFor, computeTotals, loyaltyInput, manualInput, orderForSplit, orderForTotals } from './billingService.js';
import * as loyaltyService from './loyaltyService.js';
import { partOrders } from '../pricing/pricing.js';
import { maskName, maskPhone } from './memberService.js';
import { paymentBreakdown, receiptLines } from './orderService.js';
import { getSettings } from './settingsService.js';
import { requireOpenShift } from './shiftService.js';

const publicTable = (t) => ({ tableId: t.tableId, code: t.code, name: t.name });
const billable = (orders) => orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'VOIDED');

/** Phiên trả cho khách: bỏ ghi chú nội bộ + người mở bàn (F-024). */
const customerView = (s) => {
  if (!s) return s;
  const { note: _note, noteUpdatedAt: _at, noteUpdatedBy: _by, openedBy: _ob, ...rest } = s;
  return rest;
};

/** Hội viên của phiên: khách thấy tên che; quầy thấy tên đầy đủ. */
const memberView = (m, staff) => m && { ...m, fullName: staff ? m.fullName : undefined, maskedName: maskName(m.fullName) };

/** Kèm % ưu đãi đơn đầu (cài đặt) + điểm / tem / voucher (F-039, F-038) để màn hình nói đúng quyền lợi của hội viên. */
async function withFirstOrder(member, { staff = false } = {}) {
  if (!member) return member;
  const full = await membersRepo.findById(member.memberId);
  const loyalty = full ? await loyaltyService.summary(full, { staff }) : null;
  // Khách cùng bàn thấy điểm / tem; mã voucher chỉ quầy thấy (quầy chọn khi thu tiền)
  const view = loyalty && !staff ? { ...loyalty, vouchers: loyalty.vouchers.map(({ code: _c, ...v }) => v) } : loyalty;
  const base = { ...member, loyalty: view };
  if (!member.firstOrderDiscount) return base;
  return { ...base, firstOrderPercent: (await getSettings()).firstOrderPercent };
}

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

/**
 * F-047 Thẻ thành viên (ADR-008 D-37): chỉ thiết bị thuộc phiên (hoặc quầy), phiên còn mở, phiên đang gắn hội viên.
 * Tên + SĐT che (D-16); không có mã voucher.
 */
export async function memberCard(sessionId, viewer) {
  const session = await sessionsRepo.findById(sessionId);
  if (!session) throw notFound('Không tìm thấy phiên');
  await assertViewer(sessionId, viewer);
  if (session.status === 'CLOSED') throw conflict('SESSION_CLOSED', 'Phiên đã đóng — Thẻ thành viên chỉ xem được khi đang ngồi tại quán');
  const member = session.member ? await membersRepo.findById(session.member.memberId) : null;
  if (!member || !member.isActive) throw notFound('Bàn chưa gắn số điện thoại hội viên', 'NO_MEMBER');
  const settings = member.firstOrderDiscount ? await getSettings() : null;
  return {
    member: {
      maskedName: maskName(member.fullName),
      maskedPhone: maskPhone(member.phone),
      tierName: member.tierName,
      discountPercent: member.discountPercent,
      firstOrderPercent: settings ? settings.firstOrderPercent : null,
    },
    ...(await loyaltyService.memberCard(member)),
  };
}

export async function scan(qrToken, clientToken) {
  const table = await activeTable(qrToken);
  const mine = await sessionsRepo.findOpenForClient(table.tableId, clientToken);
  if (mine) return { state: 'MEMBER', table: publicTable(table), session: customerView({ ...mine, member: memberView(mine.member, false) }) };
  const open = await sessionsRepo.listOpenByTable(table.tableId);
  if (open.length === 0) {
    const session = await sessionsRepo.createWithClient(table.tableId, clientToken);
    return { state: 'NEW', table: publicTable(table), session: customerView(session) };
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
  return { table: publicTable(table), session: customerView(session) };
}

export async function join(sessionId, qrToken, clientToken) {
  const table = await activeTable(qrToken);
  const session = await sessionsRepo.findById(sessionId);
  if (!session || session.table.tableId !== table.tableId) throw notFound('Không tìm thấy nhóm trên bàn này');
  if (session.status === 'CLOSED') {
    throw conflict('SESSION_CLOSED', 'Đơn hàng nhóm đã được thanh toán, hệ thống sẽ tạo phiên mới cho bạn');
  }
  await sessionsRepo.addClient(sessionId, clientToken);
  return { table: publicTable(table), session: customerView({ ...session, member: memberView(session.member, false) }) };
}

/**
 * Ước tính số phải trả (hội viên đang gắn, chưa giảm tay) — cùng bộ tính với lúc thu tiền.
 * Phiên đã thu một phần (chia bill F-026): chỉ tính các dòng chưa thu, không áp hội viên của phiên.
 */
async function estimate(session, orders) {
  const active = billable(orders);
  if (active.length === 0) return null;
  const partial = active.some((o) => o.items.some((i) => i.paidAt));
  if (partial || session.splitCount > 0) {
    const part = partOrders(active.map(orderForSplit), (l) => !l.paidAt);
    if (!part.orders.length) return null;
    const { totals } = await computeTotals({ orders: part.orders, memberId: null });
    return { amountDue: totals.amountDue, breakdown: totals.breakdownLines, partial: true };
  }
  const { totals } = await computeTotals({ orders: active.map(orderForTotals), memberId: session.member?.memberId ?? null });
  return { amountDue: totals.amountDue, breakdown: totals.breakdownLines };
}

export async function getDetail(sessionId, viewer) {
  await assertViewer(sessionId, viewer);
  const session = await sessionsRepo.findById(sessionId);
  if (!session) throw notFound('Không tìm thấy phiên');
  const [orders, payments] = await Promise.all([ordersRepo.listBySession(sessionId), sessionsRepo.paymentsForSession(sessionId)]);
  const payment = session.status === 'CLOSED' ? (payments.find((p) => !p.splitId) ?? null) : null;
  const bill = session.status === 'CLOSED' ? null : await estimate(session, orders);
  const detail = {
    ...session,
    member: await withFirstOrder(memberView(session.member, Boolean(viewer.user)), { staff: Boolean(viewer.user) }),
    orders,
    payment,
    // F-026: các lượt thu từng phần (khách chỉ thấy số tiền)
    payments: payments.map((p) =>
      viewer.user ? p : { paymentId: p.paymentId, splitId: p.splitId, amountDue: p.amountDue, paidAt: p.paidAt, memberDiscount: p.memberDiscount },
    ),
    bill,
  };
  return viewer.user ? detail : customerView(detail);
}

export async function requestPayment(sessionId, clientToken) {
  await assertViewer(sessionId, { clientToken });
  const { requestedAt } = await withDeadlockRetry(() => sessionsRepo.requestPayment(sessionId));
  const session = await sessionsRepo.findById(sessionId);
  const bill = await estimate(session, await ordersRepo.listBySession(sessionId));
  const amountDue = bill?.amountDue ?? session.amountDue;
  publish([ROOMS.staff, ROOMS.session(sessionId)], 'session.payment_requested', {
    sessionId,
    table: session.table,
    amountDue,
    requestedAt,
    orderCount: session.orderCount,
  });
  return { status: 'PAYMENT_REQUESTED', amountDue, requestedAt };
}

export const listByStatus = async (statuses) => (await sessionsRepo.listByStatus(statuses)).map((s) => ({ ...s, member: memberView(s.member, true) }));

// ---------- FEATURE-024: nhân viên mở bàn / gọi món tại bàn + ghi chú bàn ----------

/** Sơ đồ bàn cho quầy: bàn đang dùng + các phiên chưa đóng (kèm ghi chú). Không trả mã QR. */
export async function tablesOverview() {
  const [tables, sessions] = await Promise.all([tablesRepo.list(), listByStatus(['OPEN', 'PAYMENT_REQUESTED'])]);
  return tables.filter((t) => t.isActive).map((t) => ({ ...publicTable(t), sessions: sessions.filter((s) => s.table.tableId === t.tableId) }));
}

/** Mở bàn khi khách không quét QR. Bàn đang có nhóm → TABLE_OCCUPIED (kèm danh sách) trừ khi chọn "Nhóm mới". */
export async function openTable(tableId, { note, newGroup }, user) {
  const r = await withDeadlockRetry(() => sessionsRepo.openByStaff(tableId, user.userId, { note: note || null, newGroup: Boolean(newGroup) }));
  if (r.missing) throw notFound('Bàn không tồn tại hoặc đang tắt', 'TABLE_NOT_FOUND');
  if (r.occupied) {
    throw conflict('TABLE_OCCUPIED', 'Bàn này đang có khách — chọn nhóm đang mở hoặc "Nhóm mới"', {
      sessions: r.sessions.map((s) => ({ sessionId: s.sessionId, itemCount: s.itemCount, openedAt: s.openedAt })),
    });
  }
  const session = { ...r.session, member: memberView(r.session.member, true) };
  publish([ROOMS.staff], 'session.opened', { sessionId: session.sessionId, table: session.table, session });
  return session;
}

/** Ghi chú bàn (chỉ nhân viên thấy): phát cho các máy quầy, không phát vào phòng của khách. */
export async function setNote(sessionId, note, user) {
  if (!(await sessionsRepo.setNote(sessionId, note || null, user.userId))) {
    const s = await sessionsRepo.findById(sessionId);
    if (!s) throw notFound('Không tìm thấy phiên');
    throw conflict('SESSION_CLOSED', 'Phiên đã đóng (đã thanh toán)');
  }
  const session = await sessionsRepo.findById(sessionId);
  publish([ROOMS.staff], 'session.note_changed', {
    sessionId,
    table: session.table,
    note: session.note,
    noteUpdatedAt: session.noteUpdatedAt,
    noteUpdatedBy: session.noteUpdatedBy,
  });
  return { ...session, member: memberView(session.member, true) };
}

/** memberId: undefined → hội viên đang gắn với phiên; null → không áp hội viên; số → hội viên đó. */
async function sessionTotals(sessionId, body, role = 'STAFF') {
  const { memberId, manualDiscount, manualReason } = body;
  const session = await sessionsRepo.findById(sessionId);
  if (!session) throw notFound('Không tìm thấy phiên');
  if (session.status === 'CLOSED') throw conflict('ALREADY_SETTLED', 'Phiên này đã được thu tiền');
  if (await splitsRepo.hasSplits(sessionId)) {
    throw conflict('SESSION_HAS_SPLITS', 'Bàn đã chia bill — hãy thu từng phần hoặc bấm "Thu chung" để gộp lại');
  }
  const orders = billable(await ordersRepo.listBySession(sessionId));
  const resolvedMember = memberId === undefined ? (session.member?.memberId ?? null) : memberId;
  const calc = await computeTotals({
    orders: orders.map(orderForTotals),
    memberId: resolvedMember,
    manual: manualInput(manualDiscount, manualReason),
    role,
    loyalty: loyaltyInput(body),
  });
  return { session, orders, ...calc };
}

/** Xem trước số phải thu (drawer Thu tiền) — cùng kết quả với lúc bấm "Đã thu tiền". */
export async function settlePreview(sessionId, body, user) {
  const { session, orders, totals, memberView: member, needsApproval } = await sessionTotals(sessionId, body, user?.role);
  return {
    session: { ...session, member: await withFirstOrder(memberView(session.member, true), { staff: true }) },
    orderCount: orders.length,
    totals,
    member,
    needsApproval,
  };
}

export async function settle(sessionId, body, user) {
  const calc = await sessionTotals(sessionId, body, user.role);
  const shift = await requireOpenShift();
  const { totals } = calc;
  if (body.expectedAmountDue !== undefined && body.expectedAmountDue !== null && body.expectedAmountDue !== totals.amountDue) {
    throw conflict('AMOUNT_CHANGED', 'Tổng tiền của phiên vừa thay đổi, vui lòng kiểm tra lại', { amountDue: totals.amountDue });
  }
  const approvedBy = await approvalFor(user, calc, body);
  let result;
  try {
    result = await withDeadlockRetry(() =>
      sessionsRepo.settle(sessionId, {
        amountReceived: body.amountReceived,
        expectedAmountDue: totals.amountDue,
        userId: user.userId,
        shiftId: shift.shiftId,
        memberId: calc.member?.memberId ?? null,
        totals,
        manualReason: totals.manualDiscount > 0 ? body.manualReason.trim() : null,
        approvedBy,
        loyaltyJson: calc.loyaltyJson,
      }),
    );
  } catch (err) {
    const appErr = fromSqlError(err);
    if (appErr?.code === 'HAS_PENDING_ORDERS') appErr.details = { orderIds: idsFromMessage(appErr.sqlMessage) };
    throw appErr ?? err;
  }
  const [session, payment] = await Promise.all([sessionsRepo.findById(sessionId), sessionsRepo.paymentForSession(sessionId)]);
  await loyaltyService.announceIssued(payment.paymentId, { sessionId });
  publish([ROOMS.staff, ROOMS.session(sessionId)], 'session.settled', {
    sessionId,
    table: session.table,
    paymentId: payment.paymentId,
    amountDue: payment.amountDue,
    amountReceived: payment.amountReceived,
    changeGiven: payment.changeGiven,
    paidAt: payment.paidAt,
  });
  return { session: { ...session, member: memberView(session.member, true) }, payment, amountDue: result.amountDue, totals };
}

export async function closeEmpty(sessionId, user) {
  await withDeadlockRetry(() => sessionsRepo.closeEmpty(sessionId, user.userId));
  const session = await sessionsRepo.findById(sessionId);
  publish([ROOMS.staff, ROOMS.session(sessionId)], 'session.closed', { sessionId, table: session.table });
  return session;
}

/** Dữ liệu in hóa đơn phiên: final chỉ khi đã thu tiền (BR-014); provisional = phiếu tạm tính (ước tính hội viên). */
export async function receipt(sessionId, mode) {
  const session = await sessionsRepo.findById(sessionId);
  if (!session) throw notFound('Không tìm thấy phiên');
  const payments = session.status === 'CLOSED' ? await sessionsRepo.paymentsForSession(sessionId) : [];
  const payment = payments.find((p) => !p.splitId) ?? null;
  if (mode === 'final' && !payments.length) throw conflict('UNPAID', 'Phiên chưa thu tiền — chỉ in được phiếu tạm tính');
  const all = await ordersRepo.listBySession(sessionId);
  // Bill chính thức in đúng các đơn đã thu (kể cả đơn bị hoàn sau đó); tạm tính bỏ đơn hủy
  const orders = all.filter((o) => o.status !== 'CANCELLED' && (payment || o.status !== 'VOIDED'));
  const ordersTotal = orders.reduce((s, o) => s + o.totalAmount, 0);
  const est = payments.length ? null : await estimate(session, all);
  const splitPaid = payments.length > 0 && !payment; // chia bill: tổng các phần (bill từng phần in riêng)
  return {
    kind: 'session',
    mode,
    shop: config.shop,
    table: session.table,
    session: { sessionId, code: sessionId.slice(0, 8).toUpperCase(), openedAt: session.openedAt, closedAt: session.closedAt },
    orders: orders.map((o) => ({ orderCode: o.orderCode, createdAt: o.createdAt })),
    lines: orders.flatMap((o) => receiptLines(o.items)),
    amountDue: payment?.amountDue ?? (splitPaid ? payments.reduce((s, p) => s + p.amountDue, 0) : (est?.amountDue ?? ordersTotal)),
    breakdown: payment ? paymentBreakdown(payment, ordersTotal) : splitPaid ? null : (est?.breakdown ?? null),
    payment,
    splitPayments: splitPaid ? payments.map((p) => ({ paymentId: p.paymentId, amountDue: p.amountDue, paidAt: p.paidAt })) : null,
    memberCard: payment ? await loyaltyService.receiptCard(payment.member?.memberId) : null, // F-047 D-38
    printedAt: new Date(),
  };
}

/** Hóa đơn một lượt thu theo phần (F-026): chỉ các dòng của lượt thu đó. */
export async function paymentReceipt(paymentId) {
  const payment = await ordersRepo.paymentById(paymentId);
  if (!payment || !payment.sessionId) throw notFound('Không tìm thấy lượt thu');
  const session = await sessionsRepo.findById(payment.sessionId);
  const orders = (await ordersRepo.listBySession(payment.sessionId)).filter((o) => o.status !== 'CANCELLED');
  const lines = orders.flatMap((o) => receiptLines(o.items.filter((i) => i.paymentId === paymentId)));
  const split = payment.splitId ? await splitsRepo.get(payment.splitId) : null;
  return {
    kind: 'session',
    mode: 'final',
    shop: config.shop,
    table: session.table,
    session: { sessionId: payment.sessionId, code: payment.sessionId.slice(0, 8).toUpperCase(), openedAt: session.openedAt, closedAt: session.closedAt },
    splitLabel: split?.label ?? null,
    orders: orders.filter((o) => o.items.some((i) => i.paymentId === paymentId)).map((o) => ({ orderCode: o.orderCode, createdAt: o.createdAt })),
    lines,
    amountDue: payment.amountDue,
    breakdown: paymentBreakdown(payment, payment.subtotalAmount),
    payment,
    memberCard: await loyaltyService.receiptCard(payment.member?.memberId), // F-047 D-38
    printedAt: new Date(),
  };
}
