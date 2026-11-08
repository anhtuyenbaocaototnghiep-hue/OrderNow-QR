// Lưu phiên đăng nhập nhân viên trong localStorage (token JWT + thông tin hiển thị).
// F-080 (ADR-038): trang Quản lý (/admin/…) giữ phiên RIÊNG với máy quầy (/pos/…) — đăng xuất bên này không làm văng bên kia.
// ADR-044 (08/11/2026): phiên Quản lý CHỈ có được bằng đăng nhập (gõ mật khẩu) — bỏ "đi theo phiên máy quầy" (nút "Vào bằng tài
// khoản này", ?from=pos, tự dùng phiên máy quầy khi mở /admin). Phiên "đi theo" cũ còn trong máy (adopted) bị bỏ khi đọc.
const TOKEN_KEY = 'cf_staff_token';
const USER_KEY = 'cf_staff_user';
const ADMIN_KEY = 'cf_admin_session'; // { token, user }
const OLD_SKIP_KEY = 'cf_admin_skip'; // F-080 cũ — chỉ còn để dọn

const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};
const readJson = (key) => safe(() => JSON.parse(localStorage.getItem(key)));

/** Đang ở trang Quản lý (đường dẫn /admin hoặc /admin/…)? F-084: trang in hóa đơn mở từ trang Quản lý (`…/receipt?area=admin`) dùng phiên Quản lý. */
export const isAdminArea = () =>
  location.pathname === '/admin' ||
  location.pathname.startsWith('/admin/') ||
  (location.pathname.endsWith('/receipt') && new URLSearchParams(location.search).get('area') === 'admin');

/** Token máy quầy trên máy này (không phụ thuộc trang đang mở). */
export const getPosToken = () => safe(() => localStorage.getItem(TOKEN_KEY));
const getPosUser = () => readJson(USER_KEY);

/** Phiên Quản lý hiện tại — chỉ phiên đăng nhập ở trang Quản lý (ADR-044); phiên "đi theo máy quầy" cũ bị bỏ. */
export function getAdminSession() {
  const s = readJson(ADMIN_KEY);
  if (s?.token && !s.adopted) return s;
  if (s) safe(() => localStorage.removeItem(ADMIN_KEY));
  return null;
}

/** Token dùng cho trang đang mở: trang Quản lý → phiên Quản lý; còn lại → phiên máy quầy. */
export const getToken = () => (isAdminArea() ? (getAdminSession()?.token ?? null) : getPosToken());
export const getStoredUser = () => (isAdminArea() ? (getAdminSession()?.user ?? null) : getPosUser());

export function saveStaffSession(token, user) {
  safe(() => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  });
}

/** Đăng nhập (gõ mật khẩu) ở /admin/login — hoặc chủ quán gõ ở màn quầy (F-084): phiên Quản lý riêng. */
export function saveAdminSession(token, user) {
  safe(() => {
    localStorage.setItem(ADMIN_KEY, JSON.stringify({ token, user }));
    localStorage.removeItem(OLD_SKIP_KEY);
  });
}

/** Thoát trang Quản lý; máy quầy (nếu có) giữ nguyên. */
export function clearAdminSession() {
  safe(() => {
    localStorage.removeItem(ADMIN_KEY);
    localStorage.removeItem(OLD_SKIP_KEY);
  });
}

/** Xóa phiên của khu đang mở (máy quầy hoặc trang Quản lý). */
export function clearStaffSession() {
  if (isAdminArea()) return clearAdminSession();
  safe(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  });
}
