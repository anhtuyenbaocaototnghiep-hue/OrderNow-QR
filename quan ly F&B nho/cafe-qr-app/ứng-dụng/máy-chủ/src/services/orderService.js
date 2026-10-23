// Đơn hàng: gửi đơn (FEATURE-003), dashboard + tiếp nhận/hoàn tất/hủy (FEATURE-007), bán mang đi (FEATURE-008),
// nhân viên gọi món giúp khách tại bàn (FEATURE-024).
// ADR-005: giá mỗi dòng do bộ pricing tính (khuyến mãi, combo, tùy chọn) rồi truyền vào SP; mang đi tính thêm hội viên + giảm tay.
// Ghi kho/thu tiền chỉ qua SP; realtime phát sau commit.
import { sqlErrorNumber, withDeadlockRetry } from '../db.js';
import { AppError, conflict, forbidden, fromSqlError, idsFromMessage, notFound } from '../errors.js';
import * as ordersRepo from '../repositories/ordersRepo.js';
import * as sessionsRepo from '../repositories/sessionsRepo.js';
import { publish, publishOrderEvent, ROOMS } from '../realtime/publisher.js';
import { toSpLines } from '../pricing/pricing.js';
import { approvalFor, computeTotals, loyaltyInput, manualInput, orderFromPriced } from './billingService.js';
import * as loyaltyService from './loyaltyService.js';
import { refreshAvailability } from './menuService.js';
import { invalidatePromotions, publicQuote, quote } from './pricingService.js';
import { visibility } from './scheduleService.js';
import { getSettings, shopInfo } from './settingsService.js';
import { invalidateQueue } from './etaService.js';
import { assertShiftOpen, requireOpenShift } from './shiftService.js';
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

const usesPromotion = (priced) => Boolean(priced.orderPromotion) || priced.lines.some((l) => l.promotionId);

/** F-020 / F-040: món ngoài lịch thực đơn (giờ bán danh mục, lịch theo mùa/khung giờ) → khách không đặt được (quầy vẫn bán). */
async function assertSellHours(priced, catalog) {
  const visible = await visibility();
  const closed = priced.lines.filter((l) => !visible({ id: l.menuItemId, categoryId: catalog.items.get(l.menuItemId)?.categoryId ?? null }));
  if (closed.length) {
    const items = closed.map((l) => ({ menuItemId: l.menuItemId, name: l.name }));
    throw conflict('ITEM_UNAVAILABLE', `${items.map((i) => i.name).join(', ')} hiện ngoài giờ bán. Vui lòng chọn món khác`, { items });
  }
}

/**
 * Gửi một đơn dine-in vào phiên. Khuyến mãi khóa lúc gửi (D-8); tranh lượt cuối thua → tính lại không có khuyến mãi đó.
 * `staff` (F-024): nhân viên nhập → ghi CreatedBy, vào thẳng PREPARING, không xét giờ bán (giống bán mang đi).
 */
async function submitToSession({ sessionId, items, note }, staff = null) {
  const exclude = [];
  for (let attempt = 1; ; attempt++) {
    const { priced, catalog } = await quote(items, { exclude });
    if (!staff) await assertSellHours(priced, catalog);
    const { rows, options } = toSpLines(priced);
    try {
      const { orderId, sessionReopened } = await submitWithRetry({
        type: 'DINE_IN',
        sessionId,
        createdBy: staff?.userId ?? null,
        acceptNow: Boolean(staff),
        note,
        lines: rows,
        options,
        orderPromotion: priced.orderPromotion,
      });
      if (usesPromotion(priced)) invalidatePromotions();
      const order = await ordersRepo.getById(orderId);
      invalidateQueue();
      publishOrderEvent('order.created', order, { order });
      if (sessionReopened) publish([ROOMS.staff, ROOMS.session(sessionId)], 'session.payment_cancelled', { sessionId });
      refreshAvailability();
      return order;
    } catch (err) {
      if (err.code === 'PROMO_EXHAUSTED' && attempt < 3) {
        exclude.push(...idsFromMessage(err.sqlMessage));
        continue;
      }
      throw err;
    }
  }
}

/** FEATURE-003: khách gửi đơn dine-in (cần quán đang nhận đơn QR + thiết bị thuộc phiên). */
export async function submitDineIn({ sessionId, items, note }, clientToken, idempotencyKey) {
  const settings = await getSettings();
  if (!settings.acceptingOrders) throw new AppError(503, 'STORE_CLOSED', settings.closedMessage);
  // F-055 (ADR-017 D-64): chưa mở ca thì khách không gửi được đơn (vẫn xem menu)
  await assertShiftOpen('Quán chưa mở ca nên chưa nhận đơn — vui lòng chờ nhân viên mở ca');
  if (!(await sessionsRepo.isMember(sessionId, clientToken))) {
    throw forbidden('Phiên này không thuộc thiết bị của bạn. Vui lòng quét lại mã QR tại bàn.');
  }
  return idempotent(idempotencyKey ? `${clientToken}:${idempotencyKey}` : null, () => submitToSession({ sessionId, items, note }));
}

/**
 * FEATURE-024: nhân viên gọi món giúp khách tại bàn (khách không dùng QR). Không phụ thuộc công tắc nhận đơn QR / giờ bán;
 * phiên phải đang mở (SP khóa phiên — đã thu tiền → SESSION_CLOSED).
 */
export async function submitByStaff(sessionId, { items, note }, user, idempotencyKey) {
  await assertShiftOpen(); // F-055 (ADR-017 D-65): chưa mở ca thì không xử lý đơn
  const session = await sessionsRepo.findById(sessionId);
  if (!session) throw notFound('Không tìm thấy phiên');
  if (session.status === 'CLOSED') throw conflict('SESSION_CLOSED', `${session.table.name} đã thanh toán — hãy mở bàn mới`);
  return idempotent(idempotencyKey ? `staff:${user.userId}:${idempotencyKey}` : null, () => submitToSession({ sessionId, items, note }, user));
}

/** Báo giá giỏ hàng (khách và quầy): cùng bộ tính với lúc gửi đơn. */
export async function quoteItems(items) {
  const { priced } = await quote(items);
  return publicQuote(priced);
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
  await assertShiftOpen(); // F-055 (ADR-017 D-65): chưa mở ca thì không xử lý đơn
  const { changed, status } = await ordersRepo.accept(orderId);
  if (!status) throw notFound('Không tìm thấy đơn hàng');
  if (!changed) {
    if (status === 'PREPARING' || status === 'COMPLETED') throw conflict('ALREADY_PROCESSED', 'Đơn hàng này đã được nhân viên khác xử lý');
    throw conflict('INVALID_STATE', 'Đơn hàng đã bị hủy');
  }
  const order = await ordersRepo.getById(orderId);
  invalidateQueue();
  publishOrderEvent('order.status_changed', order, { orderId, sessionId: order.sessionId, status: order.status, changedAt: order.acceptedAt, order });
  return order;
}

export async function complete(orderId, user) {
  await assertShiftOpen(); // F-055 (ADR-017 D-65): chưa mở ca thì không xử lý đơn
  const deducted = await withDeadlockRetry(() => ordersRepo.complete(orderId, user.userId));
  const order = await ordersRepo.getById(orderId);
  invalidateQueue();
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
  await assertShiftOpen(); // F-055 (ADR-017 D-65): chưa mở ca thì không xử lý đơn
  await withDeadlockRetry(() => ordersRepo.cancel(orderId, user.userId, reason));
  const order = await ordersRepo.getById(orderId);
  invalidateQueue();
  publishOrderEvent('order.cancelled', order, { orderId, sessionId: order.sessionId, reason: order.cancelReason, order });
  refreshAvailability();
  return order;
}

/** Báo giá + tổng thanh toán đơn mang đi (hiển thị trên quầy trước khi thu). */
async function takeawayTotals(body, role = 'STAFF') {
  const { items, memberId, manualDiscount, manualReason } = body;
  const { priced } = await quote(items);
  const calc = await computeTotals({
    orders: [orderFromPriced(priced)],
    memberId: memberId ?? null,
    manual: manualInput(manualDiscount, manualReason),
    role,
    loyalty: loyaltyInput(body),
  });
  return { priced, ...calc };
}

export async function takeawayQuote(body, user) {
  const { priced, totals, memberView, needsApproval } = await takeawayTotals(body, user?.role);
  return { ...publicQuote(priced), totals, member: memberView, needsApproval };
}

/**
 * FEATURE-008: bán mang đi — đơn PREPARING/PAID + Payments(CASH) trong cùng transaction (sp_SubmitOrder).
 * ADR-005: bắt buộc ca mở (F-018), hội viên (F-014), giảm tay có ngưỡng (F-022); expectedAmountDue lệch → AMOUNT_CHANGED.
 */
export async function takeaway(body, user) {
  const shift = await requireOpenShift();
  const calc = await takeawayTotals(body, user.role);
  const { priced, totals } = calc;
  if (body.expectedAmountDue !== undefined && body.expectedAmountDue !== null && body.expectedAmountDue !== totals.amountDue) {
    throw conflict('AMOUNT_CHANGED', 'Tổng tiền vừa thay đổi (giá/khuyến mãi), vui lòng kiểm tra lại', { amountDue: totals.amountDue });
  }
  const approvedBy = await approvalFor(user, calc, body);
  const { rows, options } = toSpLines(priced);
  let orderId;
  try {
    ({ orderId } = await submitWithRetry({
      type: 'TAKE_AWAY',
      createdBy: user.userId,
      paymentMethod: 'CASH',
      note: body.note,
      lines: rows,
      options,
      orderPromotion: priced.orderPromotion,
      pay: {
        amountReceived: body.amountReceived,
        expectedDue: totals.amountDue,
        shiftId: shift.shiftId,
        memberId: calc.member?.memberId ?? null,
        memberPercent: calc.member ? totals.memberPercent : null,
        memberDiscount: totals.memberDiscount,
        manualDiscount: totals.manualDiscount,
        manualReason: totals.manualDiscount > 0 ? body.manualReason.trim() : null,
        approvedBy,
        roundingAdj: totals.roundingAdj,
        voucherDiscount: totals.voucherDiscount,
        rewardDiscount: totals.rewardDiscount,
        loyaltyJson: calc.loyaltyJson,
      },
    }));
  } catch (err) {
    if (err.code === 'PROMO_EXHAUSTED') throw conflict('AMOUNT_CHANGED', 'Khuyến mãi vừa hết lượt hôm nay — tổng tiền đã thay đổi, vui lòng kiểm tra lại');
    throw err;
  }
  if (usesPromotion(priced)) invalidatePromotions();
  const [order, payment] = await Promise.all([ordersRepo.getById(orderId), ordersRepo.paymentForOrder(orderId)]);
  await loyaltyService.announceIssued(payment.paymentId);
  invalidateQueue();
  publishOrderEvent('order.created', order, { order });
  refreshAvailability();
  return { order, payment, totals };
}

/** Dòng in bill: dòng khách chọn + tùy chọn + thành phần combo (giá 0). */
export const receiptLines = (items) =>
  items.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    listPrice: i.listPrice,
    lineTotal: i.lineTotal,
    note: i.note,
    options: i.options.map((o) => o.name),
    children: i.children.map((c) => ({ name: c.name, quantity: c.quantity })),
    promotionName: i.promotionName,
  }));

/** Dòng breakdown từ thanh toán đã ghi (bill chính thức). */
export function paymentBreakdown(payment, fallbackTotal) {
  const subtotal = payment.subtotalAmount ?? fallbackTotal;
  const lines = [{ key: 'subtotal', label: 'Tạm tính', amount: subtotal }];
  if (payment.promoDiscount > 0) lines.push({ key: 'promo', label: 'Khuyến mãi', amount: -payment.promoDiscount });
  if (payment.memberDiscount > 0) {
    lines.push({ key: 'member', label: `Hội viên ${payment.member?.fullName ?? ''} −${Number(payment.memberPercent ?? 0)}%`, amount: -payment.memberDiscount });
  }
  if (payment.voucherDiscount > 0) lines.push({ key: 'voucher', label: `Voucher ${payment.voucherCode ?? ''}`.trim(), amount: -payment.voucherDiscount });
  if (payment.rewardDiscount > 0) lines.push({ key: 'reward', label: 'Đổi thưởng', amount: -payment.rewardDiscount });
  if (payment.manualDiscount > 0) {
    lines.push({ key: 'manual', label: payment.manualReason ? `Giảm giá (${payment.manualReason})` : 'Giảm giá', amount: -payment.manualDiscount });
  }
  if (payment.roundingAdj > 0) lines.push({ key: 'rounding', label: 'Làm tròn', amount: -payment.roundingAdj });
  lines.push({ key: 'total', label: 'Tổng thanh toán', amount: payment.amountDue });
  // F-039: điểm / tem đã tích (in cuối bill)
  if (payment.pointsEarned > 0) lines.push({ key: 'points', label: `Tích +${payment.pointsEarned} điểm`, amount: null, info: true });
  if (payment.stampsEarned > 0) lines.push({ key: 'stamps', label: `Tích +${payment.stampsEarned} tem`, amount: null, info: true });
  return lines;
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
    shop: await shopInfo(), // F-053
    table: null,
    order: { orderId, orderCode: order.orderCode, createdAt: order.createdAt, status: order.status },
    orders: [{ orderCode: order.orderCode, createdAt: order.createdAt }],
    lines: receiptLines(order.items),
    amountDue: payment?.amountDue ?? order.totalAmount,
    breakdown: payment ? paymentBreakdown(payment, order.totalAmount) : null,
    payment,
    memberCard: await loyaltyService.receiptCard(payment?.member?.memberId), // F-047 D-38
    printedAt: new Date(),
  };
}
