// Lưu phiên đăng nhập nhân viên trong localStorage (token JWT + thông tin hiển thị).
// F-080 (ADR-038): trang Quản lý (/admin/…) giữ phiên RIÊNG với máy quầy (/pos/…):
//  - Đăng nhập ở /admin/login → phiên Quản lý độc lập (đăng xuất bên này không làm văng bên kia).
//  - Đi từ máy quầy sang (nút "Quản lý", hoặc mở /admin khi chưa có phiên Quản lý) → phiên Quản lý "đi theo" phiên máy quầy
//    (adopted): máy quầy đổi người / đăng xuất thì phiên Quản lý đi theo đó bỏ.
//  - Đăng xuất trang Quản lý khi đang đi theo máy quầy → nhớ token máy quầy đó (SKIP) để không tự vào lại; máy quầy đăng nhập
//    người khác (token mới) thì lại đi theo được.
const TOKEN_KEY = 'cf_staff_token';
const USER_KEY = 'cf_staff_user';
const ADMIN_KEY = 'cf_admin_session'; // { token, user, adopted }
const SKIP_KEY = 'cf_admin_skip';

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

/** Phiên Quản lý hiện tại (tự đi theo máy quầy khi chưa đăng nhập riêng). */
export function getAdminSession() {
  const s = readJson(ADMIN_KEY);
  const pos = getPosToken();
  if (s?.token && !s.adopted) return s;
  if (s?.adopted && s.token === pos) return s;
  if (s) safe(() => localStorage.removeItem(ADMIN_KEY)); // máy quầy đã đổi người / đăng xuất
  if (pos && safe(() => localStorage.getItem(SKIP_KEY)) !== pos) {
    const follow = { token: pos, user: getPosUser(), adopted: true };
    safe(() => localStorage.setItem(ADMIN_KEY, JSON.stringify(follow)));
    return follow;
  }
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

/** Đăng nhập ở /admin/login: phiên Quản lý riêng (follow = true: dùng phiên máy quầy đang mở trên máy này). */
export function saveAdminSession(token, user, { follow = false } = {}) {
  safe(() => {
    localStorage.setItem(ADMIN_KEY, JSON.stringify({ token, user, adopted: follow }));
    localStorage.removeItem(SKIP_KEY);
  });
}

/** Thoát trang Quản lý; máy quầy (nếu có) giữ nguyên và không tự được dùng lại cho trang Quản lý. */
export function clearAdminSession() {
  safe(() => {
    localStorage.removeItem(ADMIN_KEY);
    const pos = getPosToken();
    if (pos) localStorage.setItem(SKIP_KEY, pos);
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
