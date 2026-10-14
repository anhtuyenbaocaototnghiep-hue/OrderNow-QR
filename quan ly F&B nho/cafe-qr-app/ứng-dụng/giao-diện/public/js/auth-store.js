// Lưu phiên đăng nhập nhân viên trong localStorage (token JWT + thông tin hiển thị).
const TOKEN_KEY = 'cf_staff_token';
const USER_KEY = 'cf_staff_user';

const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const getToken = () => safe(() => localStorage.getItem(TOKEN_KEY));
export const getStoredUser = () => safe(() => JSON.parse(localStorage.getItem(USER_KEY)));

export function saveStaffSession(token, user) {
  safe(() => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  });
}

export function clearStaffSession() {
  safe(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  });
}
