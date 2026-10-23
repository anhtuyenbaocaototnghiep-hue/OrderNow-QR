// FEATURE-051 Đánh giá sau khi dùng món (ADR-010 D-46…D-48).
// Điện thoại thuộc nhóm, nhóm đã thanh toán (phiên đóng, có lượt thu) trong 24 giờ: chấm 1–5 sao từng món nhóm đã gọi + góp ý, 1 lần / điện thoại.
// Có món ≤ 2 sao → báo quầy (review.low), nhân viên bấm Đã xử lý (review.handled). Menu khách hiện sao trung bình khi đủ lượt (D-48).
// Không import sessionService (tránh vòng import với menuService) — kiểm thành viên nhóm trực tiếp qua sessionsRepo.
import { sqlErrorNumber } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import * as reviewsRepo from '../repositories/reviewsRepo.js';
import * as sessionsRepo from '../repositories/sessionsRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { getSettings } from './settingsService.js';

export const REVIEW_WINDOW_MS = 24 * 3600e3;

// Một nhóm gửi tối đa = số món (ly / phần) đã gọi, không quá 10 đánh giá — chống một người mở nhiều tab dồn phiếu (review G3)
export const MAX_REVIEWS_PER_SESSION = 10;
export const ALERT_WINDOW_MS = 12 * 3600e3; // dải "Đánh giá thấp": chưa xử lý trong 12 giờ gần nhất (không mất lúc nửa đêm)

const MSG = {
  SESSION_NOT_PAID: 'Nhóm chưa thanh toán — bạn đánh giá sau khi thanh toán nhé',
  REVIEW_LIMIT: 'Nhóm của bạn đã đủ lượt đánh giá — cảm ơn bạn!',
  REVIEW_EXPIRED: 'Đã quá 24 giờ sau khi thanh toán — không đánh giá được nữa',
  ALREADY_REVIEWED: 'Bạn đã đánh giá lượt này rồi — cảm ơn bạn!',
};

/** Chỉ điện thoại thuộc nhóm (cookie khách) — quầy không đánh giá thay khách. */
async function memberSession(sessionId, viewer) {
  if (!viewer.clientToken || !(await sessionsRepo.isMember(sessionId, viewer.clientToken))) {
    throw forbidden('Chỉ khách trong nhóm mới đánh giá được. Vui lòng mở từ điện thoại đã gọi món.');
  }
  const session = await sessionsRepo.findById(sessionId);
  if (!session) throw notFound('Không tìm thấy phiên');
  return session;
}

async function blocker(session, clientToken) {
  // "Đã thanh toán" = phiên đóng và CÓ lượt thu (kể cả bill 0đ nhờ voucher / đổi điểm); hủy bàn / đóng bàn trống không có lượt thu
  if (session.status !== 'CLOSED' || (await sessionsRepo.paymentsForSession(session.sessionId)).length === 0) return 'SESSION_NOT_PAID';
  if (Date.now() - new Date(session.closedAt).getTime() > REVIEW_WINDOW_MS) return 'REVIEW_EXPIRED';
  if (await reviewsRepo.findBySessionClient(session.sessionId, clientToken)) return 'ALREADY_REVIEWED';
  if ((await reviewsRepo.countForSession(session.sessionId)) >= Math.min(Math.max(1, session.itemCount), MAX_REVIEWS_PER_SESSION)) return 'REVIEW_LIMIT';
  return null;
}

/** Điện thoại xem có đánh giá được không + danh sách món của nhóm. → { canReview, reason, submitted, items[] } */
export async function info(sessionId, viewer) {
  const session = await memberSession(sessionId, viewer);
  const reason = await blocker(session, viewer.clientToken);
  return {
    canReview: !reason,
    reason,
    submitted: reason === 'ALREADY_REVIEWED',
    items: reason ? [] : await reviewsRepo.sessionItems(sessionId),
  };
}

/** body: { items[{ menuItemId, stars 1–5 }] (mỗi món một lần — route kiểm), comment? } */
export async function submit(sessionId, { items, comment }, viewer) {
  const session = await memberSession(sessionId, viewer);
  const reason = await blocker(session, viewer.clientToken);
  if (reason) throw conflict(reason, MSG[reason]);
  const text = (comment ?? '').trim();
  if (!items.length && !text) throw badRequest('VALIDATION_ERROR', 'Chấm ít nhất một món hoặc viết góp ý');
  const allowed = new Set((await reviewsRepo.sessionItems(sessionId)).map((i) => i.menuItemId));
  if (items.some((i) => !allowed.has(i.menuItemId))) throw badRequest('VALIDATION_ERROR', 'Có món không thuộc lượt gọi của nhóm');
  const hasLow = items.some((i) => i.stars <= 2);
  let reviewId;
  try {
    reviewId = await reviewsRepo.create({ sessionId, clientToken: viewer.clientToken, comment: text || null, items, hasLow });
  } catch (err) {
    // Hai lần gửi cùng lúc từ một điện thoại: khóa duy nhất (SessionId, ClientToken) chặn lần sau
    if ([2627, 2601].includes(sqlErrorNumber(err))) throw conflict('ALREADY_REVIEWED', MSG.ALREADY_REVIEWED);
    throw err;
  }
  invalidateRatings();
  if (hasLow) {
    // Đã lưu xong — lỗi khi báo quầy không được làm khách nhận 500 (review G3); chỉ rung chuông lần đầu của nhóm
    try {
      const review = await reviewsRepo.getById(reviewId);
      publish([ROOMS.staff], 'review.low', { ...review, ring: !(await reviewsRepo.hasOpenLow(sessionId, reviewId)) });
    } catch {
      /* quầy vẫn thấy ở danh sách cảnh báo khi tải lại */
    }
  }
  return { reviewId, hasLow };
}

/** Dải "Đánh giá thấp" ở quầy: đánh giá có món ≤ 2 sao, chưa xử lý, trong 12 giờ gần nhất. */
export const alerts = () => reviewsRepo.openAlerts(new Date(Date.now() - ALERT_WINDOW_MS));

export async function handle(id, user) {
  const review = await reviewsRepo.getById(id);
  if (!review || !review.hasLow) throw notFound('Không tìm thấy đánh giá thấp');
  if (!(await reviewsRepo.handle(id, user.userId))) throw conflict('ALREADY_PROCESSED', 'Đánh giá này đã được xử lý');
  const updated = await reviewsRepo.getById(id);
  publish([ROOMS.staff], 'review.handled', { reviewId: id, handledBy: updated.handledBy });
  return updated;
}

export const report = (fromUtc, toUtc) => reviewsRepo.report(fromUtc, toUtc);

// ---------- Sao trên menu (D-48): cache 60 giây, xóa khi có đánh giá mới / đổi ngưỡng ----------
let cache = null;
export function invalidateRatings() {
  cache = null;
}

/** Map menuItemId → { avg (1 chữ số lẻ), count } — chỉ món có ≥ review.menu_min_count lượt trong review.menu_days ngày. */
export async function menuRatings() {
  const s = await getSettings();
  const key = `${s.reviewMenuDays}|${s.reviewMenuMinCount}`;
  if (cache && cache.key === key && cache.expires > Date.now()) return cache.value;
  const raw = await reviewsRepo.ratingsSince(new Date(Date.now() - s.reviewMenuDays * 86400e3));
  const value = new Map(
    [...raw].filter(([, v]) => v.count >= s.reviewMenuMinCount).map(([id, v]) => [id, { avg: Math.round(v.avg * 10) / 10, count: v.count }]),
  );
  cache = { key, value, expires: Date.now() + 60_000 };
  return value;
}
