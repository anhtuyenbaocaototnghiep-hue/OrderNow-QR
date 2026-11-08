// Đăng nhập (FEATURE-009) và quản lý tài khoản nhân viên (ADMIN). BR-004 (username duy nhất, không phân biệt hoa/thường), BR-017.
import bcrypt from 'bcryptjs';
import { sqlErrorNumber, withDeadlockRetry } from '../db.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../errors.js';
import { signToken } from '../middleware/auth.js';
import * as usersRepo from '../repositories/usersRepo.js';
import { config } from '../config.js';
import { onLogin } from './attendanceService.js';
import * as authGuard from './authGuardService.js';
import { verifyPin } from './pinService.js';

const BCRYPT_COST = 10;
// Hash giả để so sánh khi không có user → thời gian phản hồi như nhau (không lộ username tồn tại hay không)
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

export async function login(username, password, { ip = null, area } = {}) {
  const who = { username, ip };
  await authGuard.assertNotLocked('LOGIN', who); // F-071: đang khóa → 429 kể cả khi gõ đúng
  const user = await usersRepo.findByUsernameWithHash(username);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await authGuard.recordFailure('LOGIN', who);
    throw unauthorized('Sai tên đăng nhập hoặc mật khẩu');
  }
  if (!user.isActive) throw forbidden('Tài khoản đã bị khóa', 'ACCOUNT_LOCKED');
  const { passwordHash: _omit, ...publicUser } = user;
  // F-084 (ADR-043 D-196): tài khoản Chủ quán chỉ dùng trang Quản lý — màn đăng nhập quầy (area = 'pos') từ chối sau khi đúng mật khẩu
  // (không lộ vai trò khi sai mật khẩu, không đếm là lần sai, không chấm công)
  if (area === 'pos' && user.role === 'ADMIN') {
    throw forbidden('Tài khoản Chủ quán chỉ dùng trang Quản lý — không đăng nhập máy quầy', 'OWNER_ADMIN_ONLY');
  }
  // F-035: đăng nhập máy quầy → chấm công vào (không chặn đăng nhập nếu ghi chấm công lỗi). F-080: trang Quản lý thì không.
  if (area !== 'admin') {
    await onLogin(publicUser).catch((err) => {
      if (config.env !== 'test') console.error('[attendance] không ghi được giờ vào', err.message);
    });
  }
  return { accessToken: signToken(publicUser), user: publicUser };
}

/**
 * F-072 (ADR-030 D-126) "Đổi người" ở máy quầy: người sắp đứng máy nhập PIN của mình → phiên mới đứng tên người đó
 * (mọi thao tác sau đó ghi đúng người). Chỉ nhân viên / trưởng ca; quản lý đăng nhập bằng mật khẩu.
 */
export async function switchTo(userId, pin, actor) {
  const target = await usersRepo.findById(userId);
  if (!target || !target.isActive || target.role === 'ADMIN') throw notFound('Không tìm thấy nhân viên');
  await verifyPin(target, pin, actor);
  await onLogin(target).catch((err) => {
    if (config.env !== 'test') console.error('[attendance] không ghi được giờ vào', err.message);
  });
  return { accessToken: signToken(target), user: target };
}

export const list = () => usersRepo.list();

export async function create({ username, password, fullName, role, positions = null, level = 'OFFICIAL' }) {
  try {
    return await usersRepo.create({ username, passwordHash: await bcrypt.hash(password, BCRYPT_COST), fullName, role, positions, level });
  } catch (err) {
    const n = sqlErrorNumber(err);
    if (n === 2627 || n === 2601) throw conflict('USERNAME_TAKEN', 'Tên đăng nhập đã tồn tại, vui lòng chọn tên khác');
    throw err;
  }
}

/**
 * Đổi họ tên / vai trò (+ vị trí, cấp của nhân viên — F-078). Không tự đổi vai trò; không hạ quản lý cuối cùng (409 LAST_ADMIN — kiểm
 * nguyên tử trong SQL). Vắng `positions` / `level` → giữ như cũ.
 */
export async function update(id, { fullName, role, positions, level }, actor) {
  if (id === actor.userId && role !== actor.role) throw badRequest('CANNOT_CHANGE_OWN_ROLE', 'Không thể tự đổi vai trò của chính mình');
  const cur = positions === undefined || level === undefined ? await usersRepo.findById(id) : null;
  const next = { fullName, role, positions: positions === undefined ? cur?.positions : positions, level: level ?? cur?.level ?? 'OFFICIAL' };
  const user = await withDeadlockRetry(() => usersRepo.update(id, next));
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
  const user = await withDeadlockRetry(() => usersRepo.setActive(id, isActive));
  if (!user) throw notFound('Không tìm thấy tài khoản');
  return user;
}

/**
 * Xác thực lại cho thao tác vượt quyền (giảm giá tay vượt ngưỡng — D-14/D-24, hoàn tiền — D-15, duyệt chi quỹ — D-23).
 * Người thao tác là ADMIN → tự duyệt; là MANAGER và `allowManager` → tự duyệt; là STORE_MGR và `allowStoreManager` (mặc định có —
 * F-077) → tự duyệt. Không thì kiểm tên + mật khẩu tài khoản chủ quán (hoặc quản lý cửa hàng / trưởng ca theo hai cờ) đang hoạt động —
 * không dùng token của người đang đứng quầy.
 * F-071: 5 lần sai / 15 phút cùng tên duyệt + cùng người đứng quầy → 429 APPROVAL_LOCKED (chặn dò mật khẩu quản lý).
 */
export async function resolveApproval(
  user,
  { adminUsername, adminPassword } = {},
  what = 'thao tác này',
  { allowManager = false, allowStoreManager = true } = {},
) {
  const may = (role) => role === 'ADMIN' || (allowStoreManager && role === 'STORE_MGR') || (allowManager && role === 'MANAGER');
  if (may(user.role)) return user;
  const who = allowManager ? 'trưởng ca / quản lý' : allowStoreManager ? 'quản lý' : 'chủ quán';
  if (!adminUsername || !adminPassword) throw forbidden(`Cần tài khoản ${who} duyệt ${what}`, 'ADMIN_APPROVAL_REQUIRED');
  const attempt = { username: adminUsername, actor: user };
  await authGuard.assertNotLocked('APPROVAL', attempt);
  const admin = await usersRepo.findByUsernameWithHash(adminUsername);
  const ok = await bcrypt.compare(adminPassword, admin?.passwordHash ?? DUMMY_HASH);
  const roleOk = admin && may(admin.role);
  if (!admin || !ok || !roleOk || !admin.isActive) {
    if (!admin || !ok) await authGuard.recordFailure('APPROVAL', attempt); // chỉ đếm sai tên / mật khẩu — đúng mật khẩu mà không đủ quyền không phải dò
    throw forbidden(`Tài khoản ${who} hoặc mật khẩu không đúng`, 'ADMIN_APPROVAL_INVALID');
  }
  const { passwordHash: _omit, ...approver } = admin;
  return approver;
}
