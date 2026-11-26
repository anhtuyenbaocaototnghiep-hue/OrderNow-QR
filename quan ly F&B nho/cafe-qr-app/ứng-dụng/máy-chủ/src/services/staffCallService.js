// FEATURE-021 Gọi nhân viên: khách gọi từ màn theo dõi đơn / màn chào; quầy bấm "Đã xử lý".
// Chống spam (ADR-072 D-265): mỗi phiên tối đa CALL_LIMIT lần trong CALL_WINDOW_SEC giây gần nhất.
import { badRequest, conflict, notFound, tooMany } from '../errors.js';
import * as sessionsRepo from '../repositories/sessionsRepo.js';
import * as staffCallsRepo from '../repositories/staffCallsRepo.js';
import * as tablesRepo from '../repositories/tablesRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { assertViewer, moveSession } from './sessionService.js';

export const CALL_LIMIT = 5;
export const CALL_WINDOW_SEC = 60;

export async function call(sessionId, message, clientToken) {
  await assertViewer(sessionId, { clientToken });
  const session = await sessionsRepo.findById(sessionId);
  if (!session) throw notFound('Không tìm thấy phiên');
  if (session.status === 'CLOSED') throw conflict('SESSION_CLOSED', 'Phiên đã đóng (đã thanh toán)');
  const callId = await staffCallsRepo.create(sessionId, message, CALL_LIMIT, CALL_WINDOW_SEC);
  if (!callId) {
    // Đủ CALL_LIMIT lần trong cửa sổ → chờ tới khi lần cũ nhất trong CALL_LIMIT lần gần nhất qua đủ CALL_WINDOW_SEC giây
    const recent = await staffCallsRepo.recentForSession(sessionId, CALL_WINDOW_SEC);
    const oldest = recent[Math.min(CALL_LIMIT, recent.length) - 1];
    const age = oldest ? Math.floor((Date.now() - new Date(oldest.requestedAt).getTime()) / 1000) : 0;
    const wait = Math.min(CALL_WINDOW_SEC, Math.max(1, CALL_WINDOW_SEC - age));
    throw tooMany('TOO_SOON', `Bạn đã gọi nhân viên ${CALL_LIMIT} lần trong 1 phút, vui lòng chờ ${wait} giây nữa`, { retryAfter: wait });
  }
  const c = await staffCallsRepo.findById(callId);
  publish([ROOMS.staff, ROOMS.session(sessionId)], 'session.staff_called', c);
  return c;
}

export const listOpen = () => staffCallsRepo.listOpen();

/**
 * F-086 (ADR-047 D-208): khách quét QR bàn khác, nhóm đã có món / có người khác → "Nhờ quầy chuyển sang bàn này".
 * Hiện ở dải "Gọi nhân viên" của quầy (loại MOVE) với nút "Chuyển". Một yêu cầu đang chờ mỗi nhóm (đổi bàn đích thì cập nhật).
 */
export async function requestMove(sessionId, qrToken, clientToken) {
  await assertViewer(sessionId, { clientToken });
  const table = await tablesRepo.findByQrToken(qrToken);
  if (!table || !table.isActive) throw notFound('Mã bàn không hợp lệ', 'TABLE_NOT_FOUND');
  const session = await sessionsRepo.findById(sessionId);
  if (!session) throw notFound('Không tìm thấy phiên');
  if (session.status === 'CLOSED') throw conflict('SESSION_CLOSED', 'Nhóm đã thanh toán / đã đóng');
  if (session.table.tableId === table.tableId) throw badRequest('SAME_TABLE', 'Nhóm đang ngồi ở bàn này rồi');
  const callId = await staffCallsRepo.upsertMove(sessionId, table.tableId);
  if (!callId) throw conflict('SESSION_CLOSED', 'Nhóm đã thanh toán / đã đóng');
  const c = await staffCallsRepo.findById(callId);
  publish([ROOMS.staff, ROOMS.session(sessionId)], 'session.staff_called', c);
  return c;
}

/** F-086: quầy bấm "Chuyển" trên yêu cầu xin chuyển bàn → chuyển bàn như F-049 (SP tự đánh dấu yêu cầu đã xử lý). */
export async function acceptMove(callId, user) {
  const c = await staffCallsRepo.findById(callId);
  if (!c || c.type !== 'MOVE') throw notFound('Không tìm thấy yêu cầu chuyển bàn');
  if (c.handledAt) throw conflict('ALREADY_PROCESSED', 'Yêu cầu này đã được nhân viên khác xử lý');
  const result = await moveSession(c.sessionId, { toTableId: c.toTable.tableId, fromTableId: c.table.tableId }, user);
  const done = await staffCallsRepo.findById(callId);
  publish([ROOMS.staff, ROOMS.session(c.sessionId)], 'session.staff_call_handled', done);
  return { ...result, call: done };
}

export async function handle(callId, user) {
  const c = await staffCallsRepo.findById(callId);
  if (!c) throw notFound('Không tìm thấy yêu cầu');
  if (!(await staffCallsRepo.handle(callId, user.userId))) throw conflict('ALREADY_PROCESSED', 'Yêu cầu này đã được nhân viên khác xử lý');
  const done = await staffCallsRepo.findById(callId);
  publish([ROOMS.staff, ROOMS.session(c.sessionId)], 'session.staff_call_handled', done);
  return done;
}
