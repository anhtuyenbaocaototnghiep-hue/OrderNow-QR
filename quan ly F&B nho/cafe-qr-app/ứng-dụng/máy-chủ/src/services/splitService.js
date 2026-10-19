// FEATURE-026 Chia bill theo người trong phiên gộp (ADR-006 D-17).
// Mỗi khách (điện thoại) tạo phần của mình, chạm chọn dòng món; dòng chưa ai nhận = phần "Chung".
// Quầy thu từng phần (hội viên / giảm tay riêng từng phần), phần cuối tự gộp dòng Chung; thu hết → đóng phiên.
// Tiền: pricing.partOrders (khuyến mãi đơn chia theo dòng) → settleTotals — cùng bộ tính với thu cả bàn (D-7).
import { withDeadlockRetry } from '../db.js';
import { conflict, forbidden, fromSqlError, idsFromMessage, notFound } from '../errors.js';
import { allocateOrderPromo, partOrders } from '../pricing/pricing.js';
import * as ordersRepo from '../repositories/ordersRepo.js';
import * as sessionsRepo from '../repositories/sessionsRepo.js';
import * as splitsRepo from '../repositories/splitsRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { approvalFor, computeTotals, loyaltyInput, manualInput, orderForSplit } from './billingService.js';
import * as loyaltyService from './loyaltyService.js';
import { maskName } from './memberService.js';
import { requireOpenShift } from './shiftService.js';
import { assertViewer } from './sessionService.js';

const billable = (orders) => orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'VOIDED');

function changed(sessionId) {
  publish([ROOMS.staff, ROOMS.session(sessionId)], 'session.split_changed', { sessionId });
}

/** Dòng món khách chọn của phiên kèm phần khuyến mãi đơn đã phân bổ (để ước tính tiền từng phần). */
function sessionLines(orders) {
  const out = [];
  for (const o of orders) {
    const alloc = allocateOrderPromo(
      o.items.map((i) => i.lineTotal),
      o.orderPromotion?.discount ?? 0,
    );
    o.items.forEach((i, k) =>
      out.push({
        orderItemId: i.orderItemId,
        orderId: o.orderId,
        orderCode: o.orderCode,
        name: i.name,
        quantity: i.quantity,
        options: i.options.map((x) => x.name),
        children: i.children.map((c) => `${c.quantity}× ${c.name}`),
        note: i.note,
        lineTotal: i.lineTotal,
        amount: i.lineTotal - alloc[k],
        splitId: i.splitId,
        paid: Boolean(i.paidAt),
      }),
    );
  }
  return out;
}

/** Ảnh chụp chia bill của phiên. Khách: `mine` = phần của điện thoại này; tên hội viên che. */
export async function view(sessionId, viewer) {
  await assertViewer(sessionId, viewer);
  const session = await sessionsRepo.findById(sessionId);
  if (!session) throw notFound('Không tìm thấy phiên');
  const [orders, splits] = await Promise.all([ordersRepo.listBySession(sessionId), splitsRepo.listBySession(sessionId)]);
  const lines = sessionLines(billable(orders));
  const staff = Boolean(viewer.user);
  const out = splits.map((sp) => {
    const mine = lines.filter((l) => (sp.isCommon ? l.splitId === null : l.splitId === sp.splitId));
    return {
      splitId: sp.splitId,
      label: sp.label,
      isCommon: sp.isCommon,
      status: sp.status,
      mine: !staff && sp.clientToken !== null && sp.clientToken === viewer.clientToken,
      member: sp.memberId ? { memberId: staff ? sp.memberId : undefined, name: staff ? sp.memberName : maskName(sp.memberName) } : null,
      paidAmount: sp.paidAmount,
      paymentId: staff ? sp.paymentId : undefined,
      lines: mine,
      unpaidAmount: mine.filter((l) => !l.paid).reduce((s, l) => s + l.amount, 0),
    };
  });
  return {
    sessionId,
    status: session.status,
    hasSplits: splits.length > 0,
    splits: out,
    lines: splits.length ? [] : lines, // chưa chia: mọi dòng là "Chung"
  };
}

export async function create(sessionId, { label }, viewer) {
  await assertViewer(sessionId, viewer);
  const r = await withDeadlockRetry(() => splitsRepo.create(sessionId, { label, clientToken: viewer.user ? null : viewer.clientToken }));
  if (r.error === 'NOT_FOUND') throw notFound('Không tìm thấy phiên');
  if (r.error === 'CLOSED') throw conflict('SESSION_CLOSED', 'Phiên đã đóng (đã thanh toán)');
  changed(sessionId);
  return { splitId: r.splitId, ...(await view(sessionId, viewer)) };
}

/** Gán dòng món cho phần (null = về Chung). Khách chỉ gán/bỏ dòng của phần mình hoặc dòng Chung. */
export async function assign(sessionId, orderItemId, splitId, viewer) {
  await assertViewer(sessionId, viewer);
  const splits = await splitsRepo.listBySession(sessionId);
  if (!splits.length) throw conflict('NO_SPLITS', 'Bàn chưa chia bill — hãy tạo phần trước');
  let allowedFrom = null;
  if (!viewer.user) {
    const mine = splits.filter((s) => !s.isCommon && s.status === 'OPEN' && s.clientToken === viewer.clientToken).map((s) => s.splitId);
    const target = splits.find((s) => s.splitId === splitId);
    if (splitId !== null && !(target?.isCommon || mine.includes(splitId))) throw forbidden('Bạn chỉ chọn món cho phần của mình');
    allowedFrom = mine.length ? mine : [-1];
  }
  const r = await withDeadlockRetry(() => splitsRepo.assignLine(sessionId, orderItemId, splitId, { allowedFrom }));
  if (r === 'CLOSED') throw conflict('SESSION_CLOSED', 'Phiên đã đóng (đã thanh toán)');
  if (r === 'SPLIT') throw conflict('SPLIT_PAID', 'Phần này đã thu tiền hoặc không tồn tại');
  if (r === 'LINE') throw conflict('LINE_LOCKED', 'Món này đã thu tiền hoặc thuộc phần của người khác');
  changed(sessionId);
  return view(sessionId, viewer);
}

export async function merge(sessionId, user) {
  const r = await withDeadlockRetry(() => splitsRepo.merge(sessionId));
  if (r.error === 'NOT_FOUND') throw notFound('Không tìm thấy phiên');
  if (r.error === 'CLOSED') throw conflict('SESSION_CLOSED', 'Phiên đã đóng (đã thanh toán)');
  changed(sessionId);
  return { ...r, ...(await view(sessionId, { user })) };
}

/**
 * Số phải thu của một phần. memberId: undefined → hội viên của phần; null → không. Phần cuối còn mở tự gộp dòng Chung.
 * → { split, includeCommon, part, totals, member, memberView, needsApproval, settings }
 */
async function splitTotals(splitId, body, role = 'STAFF') {
  const { memberId, manualDiscount, manualReason } = body;
  const split = await splitsRepo.get(splitId);
  if (!split) throw notFound('Không tìm thấy phần chia bill');
  const session = await sessionsRepo.findById(split.sessionId);
  if (session.status === 'CLOSED') throw conflict('ALREADY_SETTLED', 'Phiên này đã được thu tiền');
  if (split.status === 'PAID') throw conflict('SPLIT_PAID', 'Phần này đã được thu tiền');
  const [orders, splits] = await Promise.all([ordersRepo.listBySession(split.sessionId), splitsRepo.listBySession(split.sessionId)]);
  const active = billable(orders).map(orderForSplit);
  const unpaid = active.flatMap((o) => o.lines).filter((l) => !l.paidAt);
  const othersOpen = splits.some((s) => !s.isCommon && s.splitId !== split.splitId && s.status === 'OPEN' && unpaid.some((l) => l.splitId === s.splitId));
  const includeCommon = split.isCommon || (!othersOpen && unpaid.some((l) => l.splitId === null));
  const inPart = (l) => !l.paidAt && (split.isCommon ? l.splitId === null : l.splitId === split.splitId || (includeCommon && l.splitId === null));
  const part = partOrders(active, inPart);
  if (!part.orders.length) throw conflict('SPLIT_EMPTY', 'Phần này chưa có món nào để thu');
  const resolvedMember = memberId === undefined ? split.memberId : memberId;
  const calc = await computeTotals({
    orders: part.orders,
    memberId: resolvedMember,
    manual: manualInput(manualDiscount, manualReason),
    role,
    loyalty: loyaltyInput(body),
  });
  return { split, includeCommon, part, ...calc };
}

export async function preview(splitId, body, user) {
  const { split, includeCommon, part, totals, memberView, needsApproval } = await splitTotals(splitId, body, user?.role);
  return {
    split: { splitId: split.splitId, label: split.label, isCommon: split.isCommon },
    includeCommon,
    lineCount: part.orders.reduce((s, o) => s + o.lines.length, 0),
    totals,
    member: memberView,
    needsApproval,
  };
}

export async function settle(splitId, body, user) {
  const calc = await splitTotals(splitId, body, user.role);
  const shift = await requireOpenShift();
  const { split, part, totals, includeCommon } = calc;
  if (body.expectedAmountDue !== undefined && body.expectedAmountDue !== null && body.expectedAmountDue !== totals.amountDue) {
    throw conflict('AMOUNT_CHANGED', 'Tổng tiền của phần vừa thay đổi, vui lòng kiểm tra lại', { amountDue: totals.amountDue });
  }
  const approvedBy = await approvalFor(user, calc, body);
  let r;
  try {
    r = await withDeadlockRetry(() =>
      splitsRepo.settle(splitId, {
        includeCommon,
        amountReceived: body.amountReceived,
        userId: user.userId,
        linesTotal: part.linesTotal,
        promoAlloc: part.promoAlloc,
        expectedDue: totals.amountDue,
        memberId: calc.member?.memberId ?? null,
        totals,
        manualReason: totals.manualDiscount > 0 ? body.manualReason.trim() : null,
        loyaltyJson: calc.loyaltyJson,
        approvedBy,
        shiftId: shift.shiftId,
      }),
    );
  } catch (err) {
    const appErr = fromSqlError(err);
    if (appErr?.code === 'HAS_PENDING_ORDERS') appErr.details = { orderIds: idsFromMessage(appErr.sqlMessage) };
    if (!appErr && [2627, 2601].includes(err?.number ?? err?.originalError?.info?.number)) {
      throw conflict('SPLIT_PAID', 'Phần Chung đã thu riêng — món Chung mới sẽ được gộp vào phần cuối');
    }
    throw appErr ?? err;
  }
  const [session, payment] = await Promise.all([sessionsRepo.findById(split.sessionId), ordersRepo.paymentById(r.paymentId)]);
  await loyaltyService.announceIssued(payment.paymentId, { sessionId: split.sessionId });
  changed(split.sessionId);
  if (r.sessionClosed) {
    publish([ROOMS.staff, ROOMS.session(split.sessionId)], 'session.settled', {
      sessionId: split.sessionId,
      table: session.table,
      paymentId: payment.paymentId,
      amountDue: session.paidAmount,
      amountReceived: payment.amountReceived,
      changeGiven: payment.changeGiven,
      paidAt: payment.paidAt,
    });
  }
  return { split: { splitId, label: split.label }, includeCommon, payment, sessionClosed: r.sessionClosed, totals };
}
