// Xác thực nhân viên bằng JWT (Authorization: Bearer). Mỗi request kiểm lại tài khoản trong DB
// để khóa tài khoản có hiệu lực ngay (BR-017). ADMIN kế thừa quyền STAFF.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { forbidden, unauthorized } from '../errors.js';
import * as usersRepo from '../repositories/usersRepo.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user.userId), role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

/** Trả user đang hoạt động từ token, hoặc null nếu không có token. Token sai/hết hạn → 401; tài khoản khóa → 403. */
export async function userFromToken(token) {
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
  return user;
}

const bearer = (req) => {
  const h = req.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
};

/** Gắn req.user nếu có Bearer token (không bắt buộc). Dùng cho endpoint cả khách và nhân viên đều gọi được. */
export async function optionalStaff(req, _res, next) {
  req.user = await userFromToken(bearer(req));
  next();
}

export async function requireStaff(req, _res, next) {
  const user = await userFromToken(bearer(req));
  if (!user) throw unauthorized();
  req.user = user;
  next();
}

export async function requireAdmin(req, _res, next) {
  const user = await userFromToken(bearer(req));
  if (!user) throw unauthorized();
  if (user.role !== 'ADMIN') throw forbidden('Chỉ quản lý được truy cập chức năng này');
  req.user = user;
  next();
}
