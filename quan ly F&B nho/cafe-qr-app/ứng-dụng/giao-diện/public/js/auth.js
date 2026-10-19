// Bảo vệ trang quầy/quản lý: chưa đăng nhập → /pos/login; trang admin cần vai trò ADMIN.
// Đây chỉ là trải nghiệm — quyền thật được kiểm ở server cho mọi endpoint.
import { staffApi } from './api.js';
import { clearStaffSession, getToken } from './auth-store.js';

/** Thông tin phiên hiện tại sau requireStaffPage(): { user, shop }. */
export const current = { user: null, shop: null };

export async function requireStaffPage({ admin = false } = {}) {
  if (!getToken()) {
    location.replace(`/pos/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    return new Promise(() => {}); // dừng trang trong lúc chuyển hướng
  }
  const { user, shop } = await staffApi('/api/auth/me');
  current.user = user;
  current.shop = shop;
  if (admin && user.role !== 'ADMIN') {
    location.replace('/pos?denied=admin');
    return new Promise(() => {});
  }
  return user;
}

/** Đăng xuất: báo server kết thúc chấm công (F-035) rồi xóa phiên trên máy. */
export async function logout() {
  await staffApi('/api/auth/logout', { method: 'POST' }).catch(() => {});
  clearStaffSession();
  location.href = '/pos/login';
}

export { getToken };
