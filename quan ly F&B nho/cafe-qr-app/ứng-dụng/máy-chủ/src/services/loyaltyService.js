// FEATURE-039 Tích điểm đổi quà & tem (ADR-006 D-27) + FEATURE-038 voucher / giới thiệu bạn (D-28).
// Lúc thu tiền: service kiểm voucher / quà, tính số giảm bằng pricing; SP (sp_ApplyLoyalty) trừ điểm / lượt quà / đánh dấu voucher
// trong CÙNG transaction lượt thu (hai quầy cùng dùng → một bên thắng: 409). Đổi thưởng không dùng cùng giảm tay trên một lượt thu.
import crypto from 'node:crypto';
import { badRequest, conflict, notFound } from '../errors.js';
import * as loyaltyRepo from '../repositories/loyaltyRepo.js';
import * as membersRepo from '../repositories/membersRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { cheapestUnit, stampsFor } from '../pricing/pricing.js';

const normCode = (code) =>
  String(code ?? '')
    .trim()
    .toUpperCase();

/** Kiểm voucher theo mã cho hội viên (member có thể null). Trả voucher hoặc ném lỗi có mã rõ ràng. */
export async function checkVoucher(code, member, { now = new Date() } = {}) {
  const v = await loyaltyRepo.voucherByCode(normCode(code));
  if (!v) throw notFound('Không tìm thấy mã voucher', 'VOUCHER_NOT_FOUND');
  if (v.usedAt) throw conflict('VOUCHER_USED', 'Voucher này đã được dùng');
  if (new Date(v.expiresAt) <= now) throw conflict('VOUCHER_EXPIRED', 'Voucher đã hết hạn');
  if (v.memberId && v.memberId !== member?.memberId) {
    throw conflict('VOUCHER_NOT_OWNER', 'Voucher này thuộc hội viên khác — hãy gắn đúng hội viên trước khi dùng');
  }
  return v;
}

/**
 * Chuẩn bị voucher + quà cho pricing và JSON cho SP.
 * input: { voucherCode?, reward?: { type: 'POINTS', rewardId } | { type: 'STAMP', programId } }, manual (đã chuẩn hóa).
 * → { voucher (pricing) | null, reward (pricing) | null, loyaltyJson (string | null), check(totals) — kiểm sau khi có tổng, stamps }
 */
export async function prepare({ orders, member, voucherCode = null, reward = null, manual = null }) {
  let voucher = null;
  let rewardCalc = null;
  const json = {};
  if (voucherCode) {
    const v = await checkVoucher(voucherCode, member);
    voucher = { voucherId: v.voucherId, code: v.code, percent: v.percent, amount: v.amount, maxDiscount: v.maxDiscount, stackWithMember: v.stackWithMember };
    voucher.minOrderAmount = v.minOrderAmount;
    json.voucherId = v.voucherId;
  }
  if (reward) {
    if (!member) throw badRequest('MEMBER_REQUIRED', 'Gắn hội viên trước khi đổi thưởng');
    if (manual) throw badRequest('REWARD_WITH_MANUAL', 'Đổi thưởng không dùng cùng giảm giá tay trên một lượt thu');
    if (reward.type === 'POINTS') {
      const r = await loyaltyRepo.reward(reward.rewardId);
      if (!r || !r.isActive) throw conflict('REWARD_UNAVAILABLE', 'Quà đổi điểm này không còn áp dụng');
      if (member.points < r.pointsCost) {
        throw conflict('POINTS_INSUFFICIENT', `Cần ${r.pointsCost} điểm, hội viên đang có ${member.points} điểm`);
      }
      let amount = r.discountAmount;
      let freeItemId = null;
      if (r.rewardType === 'FREE_ITEM') {
        const hit = cheapestUnit(orders, [r.menuItemId]);
        if (!hit) throw conflict('REWARD_ITEM_NOT_IN_BILL', `Bill chưa có món "${r.menuItemName ?? 'quà tặng'}" để tặng`);
        amount = hit.unit;
        freeItemId = hit.menuItemId;
      }
      rewardCalc = { amount, label: `Đổi ${r.pointsCost} điểm: ${r.name}` };
      json.reward = { type: 'POINTS', rewardId: r.rewardId, menuItemId: freeItemId };
    } else {
      const program = (await loyaltyRepo.programs()).find((p) => p.programId === reward.programId);
      if (!program) throw conflict('STAMP_REWARD_UNAVAILABLE', 'Chương trình tem không còn áp dụng');
      const card = (await loyaltyRepo.cards(member.memberId)).find((c) => c.programId === program.programId);
      if (!card || card.rewardsAvailable < 1) throw conflict('STAMP_REWARD_UNAVAILABLE', 'Hội viên chưa có lượt món miễn phí của chương trình này');
      const hit = cheapestUnit(orders, program.rewardMenuItemId ? [program.rewardMenuItemId] : program.menuItemIds);
      if (!hit) throw conflict('REWARD_ITEM_NOT_IN_BILL', 'Bill chưa có món thuộc chương trình tem để tặng');
      rewardCalc = { amount: hit.unit, label: `Tặng 1 ${hit.name ?? 'món'} (thẻ tem ${program.name})` };
      json.reward = { type: 'STAMP', programId: program.programId, menuItemId: hit.menuItemId };
    }
  }
  const programs = member ? await loyaltyRepo.programs() : [];
  return {
    voucher,
    reward: rewardCalc,
    loyaltyJson: Object.keys(json).length ? JSON.stringify(json) : null,
    stamps: member ? stampsFor(orders, programs, json.reward?.menuItemId ?? null) : [],
    /** Kiểm sau khi pricing có tổng: đơn tối thiểu của voucher. */
    check(totals) {
      if (voucher && totals.ordersTotal < voucher.minOrderAmount) {
        throw conflict('VOUCHER_MIN_ORDER', `Voucher áp cho đơn từ ${voucher.minOrderAmount.toLocaleString('vi-VN')}đ`);
      }
    },
  };
}

// ---- Thông tin cho quầy / khách ----
/** Điểm, thẻ tem (kèm "còn N ly nữa"), quà đổi được, voucher còn dùng được. */
export async function summary(member, { staff = false } = {}) {
  if (!member) return null;
  const [cards, rewards, vouchers] = await Promise.all([
    loyaltyRepo.cards(member.memberId),
    loyaltyRepo.rewards(),
    loyaltyRepo.vouchersOf(member.memberId, { onlyUsable: true }),
  ]);
  const programs = await loyaltyRepo.programs();
  const cardOf = (p) => cards.find((c) => c.programId === p.programId) ?? { stamps: 0, completedCards: 0, rewardsAvailable: 0 };
  return {
    points: member.points,
    stampCards: programs.map((p) => {
      const c = cardOf(p);
      return {
        programId: p.programId,
        name: p.name,
        requiredStamps: p.requiredStamps,
        stamps: c.stamps,
        rewardsAvailable: c.rewardsAvailable,
        text:
          c.rewardsAvailable > 0
            ? `${c.stamps}/${p.requiredStamps} tem — có ${c.rewardsAvailable} lượt món miễn phí`
            : `${c.stamps}/${p.requiredStamps} tem — còn ${p.requiredStamps - c.stamps} ly nữa được tặng`,
      };
    }),
    rewards: staff
      ? rewards.map((r) => ({ ...r, affordable: member.points >= r.pointsCost }))
      : rewards.map(({ rewardId, name, pointsCost }) => ({ rewardId, name, pointsCost })),
    vouchers: vouchers.map((v) => ({
      code: v.code,
      percent: v.percent,
      amount: v.amount,
      minOrderAmount: v.minOrderAmount,
      expiresAt: v.expiresAt,
      source: v.source,
    })),
  };
}

export const vouchersOf = (memberId) => loyaltyRepo.vouchersOf(memberId);

// ---- F-047 Thẻ thành viên (ADR-008 D-37) + khối quyền lợi trên bill (D-38) ----
const POINT_LABEL = { EARN: 'Tích điểm', REDEEM: 'Đổi quà', ADJUST: 'Quán điều chỉnh', EXPIRE: 'Điểm hết hạn', REFUND: 'Hoàn tiền — trả / trừ điểm' };
const SOURCE_LABEL = { REFERRAL: 'Giới thiệu bạn', MANUAL: 'Quán tặng', CAMPAIGN: 'Chiến dịch của quán' };
/** Voucher cho khách xem: giá trị, điều kiện, hạn, nguồn — KHÔNG có mã (quầy chọn mã khi thu, như F-038). */
const voucherView = (v) => ({
  percent: v.percent,
  amount: v.amount,
  maxDiscount: v.maxDiscount,
  minOrderAmount: v.minOrderAmount,
  expiresAt: v.expiresAt,
  source: v.source,
  sourceLabel: v.campaignName ? `Chiến dịch "${v.campaignName}"` : (SOURCE_LABEL[v.source] ?? 'Quán tặng'),
});

/** Thẻ thành viên: điểm + 10 giao dịch gần nhất (không kèm tên nhân viên), thẻ tem, quà (đủ / thiếu điểm), voucher còn dùng. */
export async function memberCard(member) {
  const [base, history, vouchers] = await Promise.all([
    summary(member),
    loyaltyRepo.pointHistory(member.memberId, 10),
    loyaltyRepo.vouchersOf(member.memberId, { onlyUsable: true }),
  ]);
  return {
    points: member.points,
    pointHistory: history.map((h) => ({ delta: h.delta, type: h.type, label: POINT_LABEL[h.type] ?? h.type, createdAt: h.createdAt })),
    stampCards: base.stampCards,
    rewards: base.rewards.map((r) => ({ ...r, missing: Math.max(0, r.pointsCost - member.points) })),
    vouchers: vouchers.map(voucherView),
  };
}

/** Khối "Thẻ thành viên (lúc in)" trên bill thanh toán có hội viên; null nếu không có / đã ẩn danh. */
export async function receiptCard(memberId) {
  if (!memberId) return null;
  const member = await membersRepo.findById(memberId);
  if (!member || !member.isActive || member.anonymizedAt) return null;
  const [base, vouchers] = await Promise.all([summary(member), loyaltyRepo.vouchersOf(memberId, { onlyUsable: true })]);
  return { points: member.points, stampCards: base.stampCards.map((c) => c.text), vouchers: vouchers.map(voucherView) };
}

/** Quầy kiểm mã voucher trước khi thu: { valid, voucher?, code?, message? } — không ném lỗi để hiện ngay dưới ô nhập. */
export async function validate(code, member) {
  try {
    const v = await checkVoucher(code, member);
    return {
      valid: true,
      voucher: { code: v.code, percent: v.percent, amount: v.amount, minOrderAmount: v.minOrderAmount, expiresAt: v.expiresAt, memberId: v.memberId },
    };
  } catch (err) {
    if (err.status && err.status < 500) return { valid: false, code: err.code, message: err.message };
    throw err;
  }
}

// ---- Quản lý ----
export const rewards = () => loyaltyRepo.rewards({ all: true });
export async function saveReward(id, body) {
  const r = await loyaltyRepo.saveReward(id, body);
  if (!r) throw notFound('Không tìm thấy quà');
  return r;
}
export async function removeReward(id) {
  const r = await loyaltyRepo.deleteReward(id);
  if (!r) throw notFound('Không tìm thấy quà');
  return r;
}
export const programs = () => loyaltyRepo.programs({ all: true });
export async function saveProgram(id, body) {
  if (body.rewardMenuItemId && !body.menuItemIds.includes(body.rewardMenuItemId)) {
    throw badRequest('VALIDATION_ERROR', 'Món tặng phải thuộc danh sách món tích tem');
  }
  const p = await loyaltyRepo.saveProgram(id, body);
  if (!p) throw notFound('Không tìm thấy chương trình tem');
  return p;
}
export async function removeProgram(id) {
  const r = await loyaltyRepo.deleteProgram(id);
  if (!r) throw notFound('Không tìm thấy chương trình tem');
  return r;
}

export async function memberDetail(memberId) {
  const [cards, history, vouchers, referrals] = await Promise.all([
    loyaltyRepo.cards(memberId),
    loyaltyRepo.pointHistory(memberId),
    loyaltyRepo.vouchersOf(memberId),
    loyaltyRepo.referrals(memberId),
  ]);
  return { cards, pointHistory: history, vouchers, referrals };
}

export async function adjustPoints(memberId, { delta, reason }, user) {
  return { points: await loyaltyRepo.adjustPoints(memberId, delta, reason, user.userId) };
}

/** Voucher tay (quản lý tặng khách): mã ngẫu nhiên 'QL' + 8 ký tự. */
export async function createManualVoucher(body, user) {
  const code = `QL${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const expiresAt = new Date(Date.now() + body.days * 86400e3);
  return loyaltyRepo.createVoucher({ ...body, code, expiresAt, source: 'MANUAL', createdBy: user.userId });
}

export const listVouchers = (filter) => loyaltyRepo.listVouchers(filter);
export const vouchersIssuedFor = (paymentId) => loyaltyRepo.vouchersIssuedFor(paymentId);

/**
 * Sau commit lượt thu: voucher giới thiệu vừa tặng (D-28) → báo quầy (kèm mã) và màn khách của phiên (không kèm mã).
 * Không làm hỏng lượt thu nếu gửi thông báo lỗi.
 */
export async function announceIssued(paymentId, { sessionId = null } = {}) {
  try {
    const issued = await loyaltyRepo.vouchersIssuedFor(paymentId);
    if (!issued.length) return [];
    publish([ROOMS.staff], 'member.vouchers_issued', {
      paymentId,
      vouchers: issued.map(({ memberId, code, percent, expiresAt, source }) => ({ memberId, code, percent, expiresAt, source })),
    });
    if (sessionId) {
      publish([ROOMS.session(sessionId)], 'member.vouchers_issued', { count: issued.length, percent: issued[0].percent, expiresAt: issued[0].expiresAt });
    }
    return issued;
  } catch {
    return [];
  }
}
