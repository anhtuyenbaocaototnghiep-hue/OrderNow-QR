// F-074 (ADR-032 D-140…D-146): bán tiếp khi mất mạng.
// Máy quầy mất kết nối vẫn bán mang đi / tại quầy theo bảng giá đã lưu (giá niêm yết, không khuyến mãi / giảm giá / voucher), lưu đơn vào
// bộ nhớ của chính nó, có mạng lại tự gửi bù qua đây. Trưởng ca / quản lý cũng nhập lại đơn ghi trên phiếu bán tay (nguồn PAPER).
//  - Mỗi lượt thu có mã (ClientRef) do máy quầy tạo → gửi lại bao nhiêu lần cũng chỉ ghi một đơn (UX_Orders_ClientRef).
//  - Đơn đã giao cho khách nên không bị từ chối vì món đang tắt hay kho thiếu: ghi đúng giờ bán, đúng giá đã thu, vào thẳng "Đã xong";
//    kho chỉ trừ phần còn có (tồn kho không bao giờ âm), phần thiếu báo để kiểm kho.
//  - Ghi vào ca đang mở; bán trong ca đã đóng → ghi vào ca hiện tại + báo. Chưa có ca mở → 409 NO_OPEN_SHIFT (máy quầy giữ lại, gửi sau).
//  - Việc cần kiểm (giá khác bảng giá, kho thiếu, ghi vào ca khác, chuyển khoản cần đối chiếu) lưu kèm đơn; ba loại đầu tạo cảnh báo.
import { conflict, forbidden, badRequest } from '../errors.js';
import { toSpLines } from '../pricing/pricing.js';
import { publishOrderEvent } from '../realtime/publisher.js';
import * as membersRepo from '../repositories/membersRepo.js';
import * as offlineSalesRepo from '../repositories/offlineSalesRepo.js';
import * as ordersRepo from '../repositories/ordersRepo.js';
import * as shiftsRepo from '../repositories/shiftsRepo.js';
import * as usersRepo from '../repositories/usersRepo.js';
import { withDeadlockRetry } from '../db.js';
import { onOfflineSale } from './alertService.js';
import * as loyaltyService from './loyaltyService.js';
import { normalizePhone } from './memberService.js';
import { refreshAvailability } from './menuService.js';
import { submitWithRetry } from './orderService.js';
import { quote } from './pricingService.js';

/** Đơn bán lúc mất mạng gửi bù trong 72 giờ; phiếu bán tay nhập trong 7 ngày (cũ hơn → nhập điều chỉnh, hỏi kế toán). */
export const MAX_AGE_HOURS = { OFFLINE: 72, PAPER: 7 * 24 };
const FUTURE_SLACK_MS = 5 * 60_000; // đồng hồ máy quầy lệch vài phút
const vnd = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;

/** Ghi một đơn đã bán (gửi bù). → { status: SYNCED | DUPLICATE, order, payment, issues } */
export async function record(body, user) {
  const source = body.source ?? 'OFFLINE';
  const existing = await ordersRepo.orderIdByClientRef(body.clientRef);
  if (existing) return finish(existing, 'DUPLICATE', { body, user, source });

  if (source === 'PAPER' && !['ADMIN', 'STORE_MGR', 'MANAGER'].includes(user.role)) {
    throw forbidden('Chỉ trưởng ca hoặc quản lý nhập đơn từ phiếu bán tay', 'PAPER_SALE_FORBIDDEN');
  }
  const soldAt = new Date(body.soldAt);
  if (soldAt.getTime() > Date.now() + FUTURE_SLACK_MS) throw badRequest('VALIDATION_ERROR', 'Giờ bán ở tương lai — kiểm tra đồng hồ máy quầy');
  if (soldAt.getTime() < Date.now() - MAX_AGE_HOURS[source] * 3600e3) {
    throw badRequest(
      'SALE_TOO_OLD',
      source === 'PAPER'
        ? `Chỉ nhập phiếu bán tay trong ${MAX_AGE_HOURS.PAPER / 24} ngày gần đây`
        : `Đơn bán tạm quá ${MAX_AGE_HOURS.OFFLINE} giờ — quản lý nhập lại bằng "Nhập đơn bán tay"`,
    );
  }
  const seller = (body.soldBy && (await usersRepo.findById(body.soldBy))) || user;

  // Giá: bảng giá niêm yết (không khuyến mãi) — đúng như máy quầy tính lúc mất mạng; ghi đúng số đã thu, lệch thì báo
  let priced;
  try {
    ({ priced } = await quote(
      body.items.map(({ menuItemId, quantity, note, optionIds }) => ({ menuItemId, quantity, note, optionIds: optionIds ?? [] })),
      { withPromotions: false, now: soldAt },
    ));
  } catch (err) {
    if (err.code === 'ITEM_UNAVAILABLE' || err.code === 'INVALID_OPTIONS') {
      throw conflict('OFFLINE_ITEM_MISSING', `${err.message} — trưởng ca nhập lại đơn này bằng "Nhập đơn bán tay" với món thay thế`, err.details);
    }
    throw err;
  }
  const issues = [];
  const diffs = [];
  priced.lines.forEach((line, i) => {
    const paid = body.items[i].unitPrice;
    if (paid !== line.listPrice) diffs.push(`${line.name}: thu ${vnd(paid)}, bảng giá ${vnd(line.listPrice)}`);
    Object.assign(line, { listPrice: paid, unitPrice: paid, lineDiscount: 0, lineTotal: paid * line.quantity, promotionId: null, allowMemberStack: true });
  });
  const total = priced.lines.reduce((s, l) => s + l.lineTotal, 0);
  if (total !== body.total) throw badRequest('VALIDATION_ERROR', `Tổng tiền (${vnd(body.total)}) không khớp các dòng món (${vnd(total)})`);
  if (diffs.length) issues.push({ code: 'PRICE_DIFF', text: diffs.join('; ').slice(0, 400) });

  let memberId = null;
  if (body.memberPhone) {
    const member = await membersRepo.findByPhone(normalizePhone(body.memberPhone));
    if (member) memberId = member.memberId;
    else issues.push({ code: 'MEMBER_NOT_FOUND', text: 'Số điện thoại chưa là hội viên — chưa cộng điểm' });
  }

  const shift = await shiftsRepo.current();
  if (!shift) throw conflict('NO_OPEN_SHIFT', 'Chưa mở ca — mở ca rồi đơn bán tạm sẽ tự gửi');
  if (body.shiftId && body.shiftId !== shift.shiftId) {
    issues.push({ code: 'SHIFT_LATE', text: `Bán trong ca #${body.shiftId} (ca đó đã đóng) — tiền ghi vào ca #${shift.shiftId}` });
  }
  if (body.method === 'TRANSFER') issues.push({ code: 'TRANSFER_CHECK', text: 'Chuyển khoản lúc mất mạng — đối chiếu với app ngân hàng' });

  const { rows, options } = toSpLines(priced);
  let submitted;
  try {
    submitted = await submitWithRetry({
      type: 'TAKE_AWAY',
      createdBy: seller.userId,
      paymentMethod: body.method,
      note: body.note,
      lines: rows,
      options,
      orderPromotion: null,
      pay: {
        amountReceived: body.method === 'CASH' ? body.amountReceived : null,
        expectedDue: total,
        shiftId: shift.shiftId,
        memberId,
        memberPercent: null,
        memberDiscount: 0,
        manualDiscount: 0,
        roundingAdj: 0,
        voucherDiscount: 0,
        rewardDiscount: 0,
        loyaltyJson: null,
      },
      backfill: { clientRef: body.clientRef, source, soldAt },
    });
  } catch (err) {
    if (err.code === 'DUPLICATE_SALE') return finish(await ordersRepo.orderIdByClientRef(body.clientRef), 'DUPLICATE', { body, user, source });
    // Món đã bị xóa khỏi thực đơn (bảng giá trong bộ nhớ có thể còn) → không ghi được dòng món đó
    if (err.code === 'ITEM_UNAVAILABLE') {
      throw conflict('OFFLINE_ITEM_MISSING', `${err.message.split('.')[0]} — trưởng ca nhập lại đơn này bằng "Nhập đơn bán tay" với món thay thế`, err.details);
    }
    throw err;
  }
  const { orderId, stockShort } = submitted;
  if (stockShort.length) {
    const names = await offlineSalesRepo.ingredientNames(stockShort);
    issues.push({ code: 'STOCK_SHORT', text: `Chưa trừ: ${names.map((n) => n.name).join(', ')} — kiểm kho lại`, ingredientIds: stockShort });
  }
  await withDeadlockRetry(() => ordersRepo.complete(orderId, user.userId, soldAt));
  await offlineSalesRepo.insert({
    orderId,
    clientRef: body.clientRef,
    source,
    localCode: body.localCode,
    soldAt,
    soldBy: seller.userId,
    syncedBy: user.userId,
    device: body.device,
    clientTotal: body.total,
    shiftIdAtSale: body.shiftId ?? null,
    shiftIdRecorded: shift.shiftId,
    issues,
  });
  const result = await finish(orderId, 'SYNCED');
  await loyaltyService.announceIssued(result.payment.paymentId);
  publishOrderEvent('order.created', result.order, { order: result.order });
  refreshAvailability();
  await onOfflineSale({ shiftId: shift.shiftId, user, orderCode: result.order.orderCode, issues }).catch((err) =>
    console.error('[offline-sale] không tạo được cảnh báo', err.message),
  );
  return result;
}

/**
 * Trả đơn đã ghi. Gửi lại sau sự cố giữa chừng (đã ghi đơn nhưng chưa hoàn tất / chưa lưu chi tiết) → làm nốt, không ghi lại đơn.
 * `retry`: dữ liệu lần gửi này (để lưu chi tiết nếu còn thiếu).
 */
async function finish(orderId, status, retry = null) {
  let order = await ordersRepo.getById(orderId);
  let meta = await offlineSalesRepo.byOrder(orderId);
  if (retry && order.saleSource) {
    const soldAt = new Date(retry.body.soldAt);
    if (order.status === 'PREPARING') await withDeadlockRetry(() => ordersRepo.complete(orderId, retry.user.userId, soldAt));
    if (!meta) {
      const payment = await ordersRepo.paymentForOrder(orderId);
      await offlineSalesRepo.insert({
        orderId,
        clientRef: retry.body.clientRef,
        source: order.saleSource,
        localCode: retry.body.localCode,
        soldAt,
        soldBy: order.createdBy?.userId ?? retry.user.userId,
        syncedBy: retry.user.userId,
        device: retry.body.device,
        clientTotal: retry.body.total,
        shiftIdAtSale: retry.body.shiftId ?? null,
        shiftIdRecorded: payment.shiftId,
        issues: [],
      });
    }
    [order, meta] = await Promise.all([ordersRepo.getById(orderId), offlineSalesRepo.byOrder(orderId)]);
  }
  const payment = await ordersRepo.paymentForOrder(orderId);
  return { status, order, payment, issues: meta?.issues ?? [], offline: meta };
}

/** Màn Ca & hoàn tiền: đơn gửi bù ghi vào ca này. */
export const forShift = (shiftId) => offlineSalesRepo.forShift(shiftId);
