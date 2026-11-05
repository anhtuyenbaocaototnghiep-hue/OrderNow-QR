// F-072 (ADR-030 D-125…D-127): PIN riêng từng người — chấm công ở màn chung, "Đổi người" ở quầy, xác nhận thao tác tiền.
//  - Mỗi người tự đặt PIN sau khi nhập mật khẩu đăng nhập (quản lý không biết PIN của ai; chỉ xóa được để người đó đặt lại).
//  - Sai 5 lần / 15 phút cùng người bị thử + cùng người đứng quầy → 429 PIN_LOCKED + cảnh báo AUTH_LOCK (F-071).
//  - Thao tác tiền (giảm giá tay, hoàn tiền, xóa món đã pha, chi / hủy / duyệt sổ quỹ) khi `security.money_pin` bật: nhân viên và
//    trưởng ca gửi PIN của chính mình qua header X-Actor-Pin; quản lý (chủ quán) không cần.
import bcrypt from 'bcryptjs';
import { ACTOR_PIN } from '../auth/actorPin.js';
import { pinProblem } from '../domain/payroll.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import * as usersRepo from '../repositories/usersRepo.js';
import * as authGuard from './authGuardService.js';
import { getSettings } from './settingsService.js';

const BCRYPT_COST = 10;

/** Đặt / đổi PIN của chính mình — mật khẩu đăng nhập chứng minh đúng người. */
export async function setOwnPin(user, { password, pin }) {
  const problem = pinProblem(pin);
  if (problem) throw badRequest('PIN_WEAK', problem);
  const who = { username: user.username, actor: user };
  await authGuard.assertNotLocked('PIN', who);
  const full = await usersRepo.findByUsernameWithHash(user.username);
  if (!full || !(await bcrypt.compare(String(password ?? ''), full.passwordHash))) {
    await authGuard.recordFailure('PIN', who);
    throw forbidden('Mật khẩu đăng nhập không đúng', 'PASSWORD_INVALID');
  }
  await usersRepo.setPin(user.userId, await bcrypt.hash(String(pin), BCRYPT_COST));
  return { hasPin: true };
}

/** Quản lý xóa PIN (quên PIN / nghi bị lộ) → người đó đăng nhập bằng mật khẩu để đặt lại. */
export async function resetPin(userId) {
  if (!(await usersRepo.setPin(userId, null))) throw notFound('Không tìm thấy tài khoản');
  return { hasPin: false };
}

/** Kiểm PIN của `target` do `actor` (người đang đứng quầy) nhập. */
export async function verifyPin(target, pin, actor) {
  const who = { username: target.username, actor };
  await authGuard.assertNotLocked('PIN', who);
  const hash = await usersRepo.pinHash(target.userId);
  if (!hash) throw forbidden(`${target.fullName} chưa đặt PIN — đăng nhập bằng mật khẩu một lần để đặt PIN`, 'PIN_NOT_SET');
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
