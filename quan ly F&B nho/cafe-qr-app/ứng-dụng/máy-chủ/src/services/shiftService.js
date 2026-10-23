// FEATURE-018 Chốt ca: phải có ca mở mới thu tiền (409 NO_OPEN_SHIFT); một ca mở tại một thời điểm; ca đã đóng không sửa.
import { sqlErrorNumber, withDeadlockRetry } from '../db.js';
import { conflict, notFound } from '../errors.js';
import * as cashRepo from '../repositories/cashRepo.js';
import * as shiftsRepo from '../repositories/shiftsRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { storeStatus } from './settingsService.js';

export const current = () => shiftsRepo.current();

/**
 * Ca đang mở — bắt buộc trước mọi lượt thu tiền / hoàn tiền (F-018) và mọi thao tác xử lý đơn (F-055, ADR-017 D-65).
 * `action` chỉ đổi lời nhắn ("… trước khi xử lý đơn"); mã lỗi luôn là 409 NO_OPEN_SHIFT.
 */
export async function requireOpenShift(action = 'thu tiền') {
  const shift = await shiftsRepo.current();
  if (!shift) throw conflict('NO_OPEN_SHIFT', `Chưa mở ca — hãy mở ca trước khi ${action}`);
  return shift;
}

/** Chỉ cần biết có ca mở (không cần số liệu ca) — truy vấn nhẹ; `message` là lời nhắn đầy đủ cho người gọi (quầy / khách). */
export async function assertShiftOpen(message = 'Chưa mở ca — hãy mở ca trước khi xử lý đơn') {
  if (!(await shiftsRepo.isOpen())) throw conflict('NO_OPEN_SHIFT', message);
}

/** Mở / đóng ca đổi việc khách gửi được đơn hay không (F-055) → báo khách + quầy, như công tắc nhận đơn QR. */
async function publishStoreStatus() {
  // Sau commit: lỗi đọc trạng thái chỉ làm lỡ một lần báo realtime, không được biến thao tác mở / đóng ca thành 500
  try {
    publish([ROOMS.public, ROOMS.staff], 'store.status_changed', await storeStatus());
  } catch (err) {
    console.error('store.status_changed sau mở / đóng ca:', err.message);
  }
}

/** F-054 (ADR-014 D-59): người mở ca đang chạy phải đếm tiền và đóng ca trước khi đăng xuất; người khác đăng xuất bình thường. */
export async function assertCanLogout(user) {
  const shift = await shiftsRepo.current();
  if (shift && shift.openedBy.userId === user.userId) {
    // cashPending: khoản chi chờ duyệt chặn đóng ca (CASH_PENDING) → giao diện nhắc nhờ trưởng ca / quản lý duyệt trước (review G3)
    throw conflict('SHIFT_OPEN', `Bạn đang giữ ca #${shift.shiftId} — đếm tiền và đóng ca trước khi đăng xuất`, {
      shiftId: shift.shiftId,
      cashPending: shift.cashPending ?? 0,
    });
  }
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
  await publishStoreStatus();
  return shift;
}

export async function close(id, { countedCash, note }, user) {
  const shift = await withDeadlockRetry(() => shiftsRepo.close(id, { countedCash, note, userId: user.userId }));
  if (!shift) throw notFound('Không tìm thấy ca');
  publish([ROOMS.staff], 'shift.closed', { shift });
  await publishStoreStatus();
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
