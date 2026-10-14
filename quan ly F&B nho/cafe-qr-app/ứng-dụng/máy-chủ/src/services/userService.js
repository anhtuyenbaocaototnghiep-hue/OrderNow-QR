// Đăng nhập (FEATURE-009) và quản lý tài khoản nhân viên (ADMIN). BR-004 (username duy nhất, không phân biệt hoa/thường), BR-017.
import bcrypt from 'bcryptjs';
import { sqlErrorNumber } from '../db.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../errors.js';
import { signToken } from '../middleware/auth.js';
import * as usersRepo from '../repositories/usersRepo.js';

const BCRYPT_COST = 10;
// Hash giả để so sánh khi không có user → thời gian phản hồi như nhau (không lộ username tồn tại hay không)
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

export async function login(username, password) {
  const user = await usersRepo.findByUsernameWithHash(username);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Sai tên đăng nhập hoặc mật khẩu');
  if (!user.isActive) throw forbidden('Tài khoản đã bị khóa', 'ACCOUNT_LOCKED');
  const { passwordHash: _omit, ...publicUser } = user;
  return { accessToken: signToken(publicUser), user: publicUser };
}

export const list = () => usersRepo.list();

export async function create({ username, password, fullName, role }) {
  try {
    return await usersRepo.create({ username, passwordHash: await bcrypt.hash(password, BCRYPT_COST), fullName, role });
  } catch (err) {
    const n = sqlErrorNumber(err);
    if (n === 2627 || n === 2601) throw conflict('USERNAME_TAKEN', 'Tên đăng nhập đã tồn tại, vui lòng chọn tên khác');
    throw err;
  }
}

export async function update(id, { fullName, role }, actor) {
  if (id === actor.userId && role !== actor.role) throw badRequest('CANNOT_CHANGE_OWN_ROLE', 'Không thể tự đổi vai trò của chính mình');
  const user = await usersRepo.update(id, { fullName, role });
  if (!user) throw notFound('Không tìm thấy tài khoản');
  return user;
}

export async function resetPassword(id, password) {
  if (!(await usersRepo.setPassword(id, await bcrypt.hash(password, BCRYPT_COST)))) throw notFound('Không tìm thấy tài khoản');
}

/** ADR-004: 'DELETED' | 'ARCHIVED' (đã có thao tác → xóa mềm, không đăng nhập được nữa). */
export const remove = (id, actor) => usersRepo.remove(id, actor.userId);

export async function setActive(id, isActive, actor) {
  if (id === actor.userId && !isActive) throw badRequest('CANNOT_LOCK_SELF', 'Không thể tự khóa tài khoản của chính mình');
  const user = await usersRepo.setActive(id, isActive);
  if (!user) throw notFound('Không tìm thấy tài khoản');
  return user;
}
