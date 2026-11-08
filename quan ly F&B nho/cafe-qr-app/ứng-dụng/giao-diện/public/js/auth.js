// Bảo vệ trang quầy/quản lý: chưa đăng nhập → /pos/login (máy quầy) hoặc /admin/login (trang Quản lý — F-080, phiên riêng);
// trang admin cần quyền trang đó (F-077, F-079). Đây chỉ là trải nghiệm — quyền thật được kiểm ở server cho mọi endpoint.
import { staffApi } from './api.js';
import { clearAdminSession, clearStaffSession, getPosToken, getToken, isAdminArea, saveAdminSession } from './auth-store.js';
import { confirmDialog } from './ui.js';
import { canOpenAdminPage, firstAdminHref, hasAdminPages, pageCap } from './roles.js';

/** Thông tin phiên hiện tại sau requireStaffPage(): { user, shop, modules } — modules: nhóm menu nâng cao đang bật (F-061). */
export const current = { user: null, shop: null, modules: [], attendance: { mode: 'LOGIN', moneyPin: false }, pos: { oneTap: false } };

/** F-080: đi từ nút "Quản lý" của máy quầy (?from=pos) → trang Quản lý dùng phiên của người đang đứng máy quầy. */
function followPosIfAsked() {
  const params = new URLSearchParams(location.search);
  if (!isAdminArea() || params.get('from') !== 'pos') return;
  const pos = getPosToken();
  if (pos) saveAdminSession(pos, null, { follow: true });
  params.delete('from');
  const q = params.toString();
  history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
}

export async function requireStaffPage({ admin = false, page = '' } = {}) {
  followPosIfAsked();
  if (!getToken()) {
    const login = isAdminArea() ? '/admin/login' : '/pos/login';
    location.replace(`${login}?next=${encodeURIComponent(location.pathname + location.search)}`);
    return new Promise(() => {}); // dừng trang trong lúc chuyển hướng
  }
  const { user, shop, modules, attendance, pos } = await staffApi('/api/auth/me');
  current.user = user;
  current.shop = shop;
  current.modules = modules ?? [];
  current.attendance = attendance ?? { mode: 'LOGIN', moneyPin: false }; // F-072
  current.pos = pos ?? { oneTap: false }; // F-076
  // F-084 (ADR-043): chủ quán chỉ dùng trang Quản lý. Phiên máy quầy đứng tên chủ quán (đăng nhập trước khi có luật này) → chuyển
  // thành phiên Quản lý riêng, bỏ phiên máy quầy, sang Hôm nay. Không gọi đăng xuất server (chủ quán không chấm công).
  if (!isAdminArea() && user.role === 'ADMIN') {
    saveAdminSession(getPosToken(), user);
    clearStaffSession();
    location.replace('/admin/today');
    return new Promise(() => {});
  }
  if (admin && !canOpenAdminPage(user, page)) {
    const cap = pageCap(page); // F-079: quyền cấp riêng được → mời "Xin quyền"
    const home = hasAdminPages(user) ? firstAdminHref(user) : null;
    // F-080: có trang Quản lý khác → ở lại trang Quản lý (trang đầu tiên được mở); không có → về máy quầy / trang đăng nhập Quản lý
    if (home) location.replace(`${home}${cap ? `?cap=${cap}` : ''}`);
    else if (getPosToken()) location.replace(`/pos?denied=admin${cap ? `&cap=${cap}` : ''}`);
    else location.replace('/admin/login?reason=noaccess');
    return new Promise(() => {});
  }
  return user;
}

/** F-080: thoát trang Quản lý — chỉ xóa phiên Quản lý trên máy này (máy quầy, chấm công, ca không bị ảnh hưởng). */
export function adminLogout() {
  clearAdminSession();
  location.href = '/admin/login';
}

/**
 * Đăng xuất: báo server kết thúc chấm công (F-035) rồi xóa phiên trên máy.
 * F-054 (ADR-014 D-59): người mở ca đang chạy bị server từ chối (409 SHIFT_OPEN) → phải đếm tiền, đóng ca ở trang Ca rồi mới đăng xuất.
 * Lỗi khác (mất mạng, token hết hạn) vẫn xóa phiên trên máy như trước.
 */
let loggingOut = false; // bấm Đăng xuất hai lần không chồng hai hộp thoại (review G3)
export async function logout() {
  if (loggingOut) return;
  loggingOut = true;
  try {
    await staffApi('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    if (err?.code === 'SHIFT_OPEN') {
      const pending = err.details?.cashPending ?? 0;
      const go = await confirmDialog(
        'Đóng ca trước khi đăng xuất',
        `${err.message}. ` +
          (pending ? `Còn ${pending} khoản chi chờ duyệt — cần trưởng ca / quản lý duyệt hoặc từ chối trước khi đóng ca. ` : '') +
          'Chênh lệch két sẽ được ghi cho đúng người giữ ca.',
        { okLabel: 'Đến trang đóng ca', cancelLabel: 'Ở lại' },
      );
      loggingOut = false;
      if (go) location.href = '/pos/shift?then=logout';
      return;
    }
  }
  clearStaffSession();
  location.href = '/pos/login';
}

export { getToken };
