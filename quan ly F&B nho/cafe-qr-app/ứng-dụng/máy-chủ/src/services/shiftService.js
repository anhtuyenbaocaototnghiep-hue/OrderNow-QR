// FEATURE-018 Chốt ca: phải có ca mở mới thu tiền (409 NO_OPEN_SHIFT); một ca mở tại một thời điểm; ca đã đóng không sửa.
import { sqlErrorNumber, withDeadlockRetry } from '../db.js';
import { conflict, notFound } from '../errors.js';
import * as cashRepo from '../repositories/cashRepo.js';
import * as shiftsRepo from '../repositories/shiftsRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';

export const current = () => shiftsRepo.current();

/** Ca đang mở — bắt buộc trước mọi lượt thu tiền / hoàn tiền. */
export async function requireOpenShift() {
  const shift = await shiftsRepo.current();
  if (!shift) throw conflict('NO_OPEN_SHIFT', 'Chưa mở ca — hãy mở ca trước khi thu tiền');
  return shift;
}

export async function open(openingCash, user) {
  let shift;
  try {
    shift = await shiftsRepo.open(openingCash, user.userId);
  } catch (err) {
    if ([2627, 2601].includes(sqlErrorNumber(err))) throw conflict('SHIFT_ALREADY_OPEN', 'Đang có ca mở — hãy đóng ca hiện tại trước');
    throw err;
  }
  publish([ROOMS.staff], 'shift.opened', { shift });
  return shift;
}

export async function close(id, { countedCash, note }, user) {
  const shift = await withDeadlockRetry(() => shiftsRepo.close(id, { countedCash, note, userId: user.userId }));
  if (!shift) throw notFound('Không tìm thấy ca');
  publish([ROOMS.staff], 'shift.closed', { shift });
  return { shift, report: await fullReport(id) };
}

// Phiếu chốt ca in kèm bảng thu / chi quỹ (F-033)
const fullReport = async (id) => ({ ...(await shiftsRepo.report(id)), cashBook: await cashRepo.listByShift(id) });

export async function report(id) {
  const shift = await shiftsRepo.findById(id);
  if (!shift) throw notFound('Không tìm thấy ca');
  return { shift, report: await fullReport(id) };
}

export const list = (fromUtc, toUtc) => shiftsRepo.list(fromUtc, toUtc);
