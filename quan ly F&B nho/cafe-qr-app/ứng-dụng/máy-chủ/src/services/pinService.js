// F-072 (ADR-030 D-125…D-127): PIN riêng từng người — chấm công ở màn chung, "Đổi người" ở quầy, xác nhận thao tác tiền.
//  - Mỗi người tự đặt PIN sau khi nhập mật khẩu đăng nhập (quản lý không biết PIN của ai; chỉ xóa được để người đó đặt lại).
//  - Sai 5 lần / 15 phút cùng người bị thử + cùng người đứng quầy → 429 PIN_LOCKED + cảnh báo AUTH_LOCK (F-071).
//  - Thao tác tiền (giảm giá tay, hoàn tiền, xóa món đã pha, chi / hủy / duyệt sổ quỹ) khi `security.money_pin` bật: nhân viên và
//    trưởng ca gửi PIN của chính mình qua header X-Actor-Pin; quản lý (chủ quán) không cần.
//  - ADR-031 D-135: quên PIN / chưa đặt PIN → ngay ở màn chấm công chung chạm tên mình, nhập MẬT KHẨU ĐĂNG NHẬP + PIN mới
//    (không phải đăng xuất máy quầy). Sai mật khẩu ở đây tính chung với lần đăng nhập sai (10 lần / 15 phút cùng tên + cùng máy) — không
//    thành đường dò mật khẩu thứ hai, và người vừa bị khóa PIN vẫn đặt lại được ngay. Đặt PIN mới hoặc quản lý xóa PIN → xóa mọi lần sai
//    PIN cũ của người đó (hết bị khóa 15 phút).
import bcrypt from 'bcryptjs';
import { ACTOR_PIN } from '../auth/actorPin.js';
import { pinProblem } from '../domain/payroll.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import * as usersRepo from '../repositories/usersRepo.js';
import * as authGuard from './authGuardService.js';
import { getSettings } from './settingsService.js';

const BCRYPT_COST = 10;

/** Đặt PIN cho `target` — mật khẩu đăng nhập của chính `target` chứng minh đúng người. guard = loại khóa + khóa đếm lần sai. */
async function setPinWithPassword(target, { password, pin }, { kind, who }) {
  const problem = pinProblem(pin);
  if (problem) throw badRequest('PIN_WEAK', problem);
  await authGuard.assertNotLocked(kind, who);
  const full = await usersRepo.findByUsernameWithHash(target.username);
  if (!full || !(await bcrypt.compare(String(password ?? ''), full.passwordHash))) {
    await authGuard.recordFailure(kind, who);
    throw forbidden('Mật khẩu đăng nhập không đúng', 'PASSWORD_INVALID');
  }
  await usersRepo.setPin(target.userId, await bcrypt.hash(String(pin), BCRYPT_COST));
  await authGuard.clearFailures('PIN', target.username);
  return { hasPin: true };
}

/** Đặt / đổi PIN của chính mình (đang đăng nhập bằng tài khoản của mình). */
export const setOwnPin = (user, body) => setPinWithPassword(user, body, { kind: 'PIN', who: { username: user.username, actor: user } });

/** Màn chấm công chung: người chưa có PIN / quên PIN chạm tên mình, nhập mật khẩu đăng nhập + PIN mới (máy quầy vẫn đứng tên người khác). */
export async function setPinAtKiosk(userId, body, { ip }) {
  const target = await usersRepo.findById(userId);
  if (!target || !target.isActive || target.role === 'ADMIN') throw notFound('Không tìm thấy nhân viên');
  return setPinWithPassword(target, body, { kind: 'LOGIN', who: { username: target.username, ip } });
}

/** Quản lý xóa PIN (quên PIN / nghi bị lộ) → người đó đặt lại bằng mật khẩu đăng nhập; lần sai PIN cũ được xóa. */
export async function resetPin(userId) {
  const target = await usersRepo.findById(userId);
  if (!target || !(await usersRepo.setPin(userId, null))) throw notFound('Không tìm thấy tài khoản');
  await authGuard.clearFailures('PIN', target.username);
  return { hasPin: false };
}

/** Kiểm PIN của `target` do `actor` (người đang đứng quầy) nhập. */
export async function verifyPin(target, pin, actor) {
  const who = { username: target.username, actor };
  await authGuard.assertNotLocked('PIN', who);
  const hash = await usersRepo.pinHash(target.userId);
  if (!hash) throw forbidden(`${target.fullName} chưa đặt PIN — chạm tên mình ở màn Chấm công, nhập mật khẩu đăng nhập để đặt`, 'PIN_NOT_SET');
  if (!(await bcrypt.compare(String(pin ?? ''), hash))) {
    await authGuard.recordFailure('PIN', who);
    throw forbidden('PIN không đúng', 'PIN_INVALID');
  }
}

/** Thao tác tiền: người đang dùng phiên phải nhập đúng PIN của chính mình (khi bật `security.money_pin`; quản lý miễn). */
export async function assertActorPin(user) {
  if (user.role === 'ADMIN' || !(await getSettings()).moneyPin) return;
  if (!user[ACTOR_PIN]) throw forbidden('Nhập PIN của bạn để xác nhận thao tác tiền này', 'PIN_REQUIRED');
  await verifyPin(user, user[ACTOR_PIN], user);
}
