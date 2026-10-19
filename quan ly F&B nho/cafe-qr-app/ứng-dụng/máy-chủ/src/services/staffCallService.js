// FEATURE-021 Gọi nhân viên: khách gọi từ màn theo dõi đơn (chống spam 60 giây/phiên); quầy bấm "Đã xử lý".
import { conflict, notFound, tooMany } from '../errors.js';
import * as sessionsRepo from '../repositories/sessionsRepo.js';
import * as staffCallsRepo from '../repositories/staffCallsRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { assertViewer } from './sessionService.js';

export const COOLDOWN_SEC = 60;

export async function call(sessionId, message, clientToken) {
  await assertViewer(sessionId, { clientToken });
  const session = await sessionsRepo.findById(sessionId);
  if (!session) throw notFound('Không tìm thấy phiên');
  if (session.status === 'CLOSED') throw conflict('SESSION_CLOSED', 'Phiên đã đóng (đã thanh toán)');
  const callId = await staffCallsRepo.create(sessionId, message, COOLDOWN_SEC);
  if (!callId) {
    const last = await staffCallsRepo.lastForSession(sessionId);
    const wait = last ? Math.max(1, COOLDOWN_SEC - Math.floor((Date.now() - new Date(last.requestedAt).getTime()) / 1000)) : COOLDOWN_SEC;
    throw tooMany('TOO_SOON', `Bạn vừa gọi nhân viên, vui lòng chờ ${wait} giây nữa`, { retryAfter: wait });
  }
  const c = await staffCallsRepo.findById(callId);
  publish([ROOMS.staff, ROOMS.session(sessionId)], 'session.staff_called', c);
  return c;
}

export const listOpen = () => staffCallsRepo.listOpen();

export async function handle(callId, user) {
  const c = await staffCallsRepo.findById(callId);
  if (!c) throw notFound('Không tìm thấy yêu cầu');
  if (!(await staffCallsRepo.handle(callId, user.userId))) throw conflict('ALREADY_PROCESSED', 'Yêu cầu này đã được nhân viên khác xử lý');
  const done = await staffCallsRepo.findById(callId);
  publish([ROOMS.staff, ROOMS.session(c.sessionId)], 'session.staff_call_handled', done);
  return done;
}
