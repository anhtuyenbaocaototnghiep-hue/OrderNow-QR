// Xác thực nhân viên bằng JWT (Authorization: Bearer). Mỗi request kiểm lại tài khoản trong DB
// để khóa tài khoản có hiệu lực ngay (BR-017). ADMIN kế thừa quyền STAFF.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { forbidden, unauthorized } from '../errors.js';
import * as usersRepo from '../repositories/usersRepo.js';
import { withActorPin } from '../auth/actorPin.js';

/**
 * F-102 (ADR-073 D-267): `mustChangePassword` → token mang dấu `pwc` ("phải đổi mật khẩu") — chỉ dùng được cho /auth/me,
 * /auth/change-password, /auth/logout (requireStaffAllowPasswordChange); mọi chỗ khác userFromToken từ chối.
 */
export function signToken(user, { mustChangePassword = false } = {}) {
  const claims = { sub: String(user.userId), role: user.role, ...(mustChangePassword ? { pwc: 1 } : {}) };
  return jwt.sign(claims, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

/**
 * Trả user đang hoạt động từ token, hoặc null nếu không có token. Token sai/hết hạn → 401; tài khoản khóa → 403.
 * F-102: token "phải đổi mật khẩu" → 403 PASSWORD_CHANGE_REQUIRED, trừ khi `allowPasswordChange` (khi đó user.mustChangePassword = true).
 * Mặc định chặn → route / middleware / realtime mới viết sau cũng tự chặn.
 */
export async function userFromToken(token, { allowPasswordChange = false } = {}) {
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('Phiên đăng nhập hết hạn, vui lòng đăng nhập lại');
  }
  const user = await usersRepo.findById(Number(payload.sub));
  if (!user) throw unauthorized('Phiên đăng nhập không hợp lệ');
  if (!user.isActive) throw forbidden('Tài khoản đã bị khóa', 'ACCOUNT_LOCKED');
  if (payload.pwc) {
    if (!allowPasswordChange) {
      throw forbidden('Đổi mật khẩu trước khi dùng tiếp — mật khẩu đang dùng là mật khẩu mặc định / dễ đoán', 'PASSWORD_CHANGE_REQUIRED');
    }
    user.mustChangePassword = true;
  }
  // F-079: quyền riêng còn hạn — đổi / thu hồi có hiệu lực ngay request kế tiếp (chủ quán luôn đủ quyền, không cần nạp)
  user.grants = user.role === 'ADMIN' ? [] : await usersRepo.activeGrants(user.userId);
  return user;
}

const bearer = (req) => {
  const h = req.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
};

/** Gắn req.user nếu có Bearer token (không bắt buộc). Dùng cho endpoint cả khách và nhân viên đều gọi được. */
export async function optionalStaff(req, _res, next) {
  req.user = withActorPin(req, await userFromToken(bearer(req)));
  next();
}

export async function requireStaff(req, _res, next) {
  const user = await userFromToken(bearer(req));
  if (!user) throw unauthorized();
  req.user = withActorPin(req, user);
  next();
}

/** F-102 (ADR-073 D-267): như requireStaff nhưng nhận cả token "phải đổi mật khẩu" — CHỈ gắn cho /auth/me, /auth/change-password, /auth/logout. */
export async function requireStaffAllowPasswordChange(req, _res, next) {
  const user = await userFromToken(bearer(req), { allowPasswordChange: true });
  if (!user) throw unauthorized();
  req.user = withActorPin(req, user);
  next();
}

export async function requireAdmin(req, _res, next) {
  const user = await userFromToken(bearer(req));
  if (!user) throw unauthorized();
  if (user.role !== 'ADMIN') throw forbidden('Chỉ quản lý được truy cập chức năng này');
  req.user = withActorPin(req, user);
  next();
}
