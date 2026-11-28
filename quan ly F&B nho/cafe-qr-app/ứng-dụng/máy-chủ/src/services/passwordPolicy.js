// F-102 (ADR-073 D-266…D-271): mật khẩu mặc định / dễ đoán — chặn khi đặt, bắt đổi khi đăng nhập, không dùng để xác nhận.
// Cài đặt `security.block_weak_passwords` (mặc định bật) bật / tắt D-267, D-269, D-270; tự đổi mật khẩu (D-268) luôn chặn.
import { weakPasswordReason } from '../domain/password.js';
import { AppError, badRequest } from '../errors.js';
import { getSettings } from './settingsService.js';

export const blockingWeak = async () => (await getSettings()).blockWeakPasswords;

/** Đăng nhập bằng mật khẩu này có phải đổi ngay không (D-267). */
export const mustChangeOnLogin = async (password, username) => (await blockingWeak()) && weakPasswordReason(password, username) !== null;

/**
 * Đặt mật khẩu mới (tạo tài khoản / đặt lại — D-269; tự đổi — D-268 với `always`): dễ đoán → 400 WEAK_PASSWORD gắn vào ô `field`.
 */
export async function assertStrongPassword(password, username, { field = 'password', always = false } = {}) {
  if (!always && !(await blockingWeak())) return;
  const reason = weakPasswordReason(password, username);
  if (!reason) return;
  throw badRequest('WEAK_PASSWORD', `Mật khẩu này dễ đoán (${reason}) — chọn mật khẩu khác`, {
    fields: [{ path: field, message: `Mật khẩu dễ đoán (${reason}) — chọn mật khẩu khác` }],
  });
}

/**
 * D-270: mật khẩu ĐÚNG nhưng dễ đoán không dùng để xác nhận việc gì (duyệt ở quầy, đặt PIN, xác nhận tạo chủ quán).
 * Gọi SAU khi đã so đúng mật khẩu — sai mật khẩu vẫn báo / đếm như trước, không lộ thêm gì cho người dò.
 */
export async function assertNotWeakInUse(password, username, message) {
  if (!(await blockingWeak()) || !weakPasswordReason(password, username)) return;
  throw new AppError(403, 'WEAK_PASSWORD_IN_USE', message);
}
