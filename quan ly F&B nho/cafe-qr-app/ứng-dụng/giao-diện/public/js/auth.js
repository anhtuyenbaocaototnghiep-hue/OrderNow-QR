// Bảo vệ trang quầy/quản lý: chưa đăng nhập → /pos/login; trang admin cần vai trò ADMIN.
// Đây chỉ là trải nghiệm — quyền thật được kiểm ở server cho mọi endpoint.
import { staffApi } from './api.js';
import { clearStaffSession, getToken } from './auth-store.js';
import { confirmDialog } from './ui.js';

/** Thông tin phiên hiện tại sau requireStaffPage(): { user, shop, modules } — modules: nhóm menu nâng cao đang bật (F-061). */
export const current = { user: null, shop: null, modules: [] };

export async function requireStaffPage({ admin = false } = {}) {
  if (!getToken()) {
    location.replace(`/pos/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    return new Promise(() => {}); // dừng trang trong lúc chuyển hướng
  }
  const { user, shop, modules } = await staffApi('/api/auth/me');
  current.user = user;
  current.shop = shop;
  current.modules = modules ?? [];
  if (admin && user.role !== 'ADMIN') {
    location.replace('/pos?denied=admin');
    return new Promise(() => {});
  }
  return user;
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
