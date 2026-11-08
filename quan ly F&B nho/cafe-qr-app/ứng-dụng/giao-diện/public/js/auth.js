// Bảo vệ trang quầy/quản lý: chưa đăng nhập → /pos/login (máy quầy) hoặc /admin/login (trang Quản lý — F-080, phiên riêng);
// trang admin cần quyền trang đó (F-077, F-079). Đây chỉ là trải nghiệm — quyền thật được kiểm ở server cho mọi endpoint.
import { api, staffApi } from './api.js';
import { clearAdminSession, clearStaffSession, getAdminSession, getPosToken, getToken, isAdminArea, saveStaffSession } from './auth-store.js';
import { confirmDialog } from './ui.js';
import { canOpenAdminPage, firstAdminHref, hasAdminPages, pageCap } from './roles.js';

/** Thông tin phiên hiện tại sau requireStaffPage(): { user, shop, modules } — modules: nhóm menu nâng cao đang bật (F-061). */
export const current = { user: null, shop: null, modules: [], attendance: { mode: 'LOGIN', moneyPin: false }, pos: { oneTap: false } };

/** Người đang đứng máy quầy theo token (null: hết hạn / tài khoản khóa). */
async function whoIs(token) {
  try {
    return (await api('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })).user;
  } catch {
    return null;
  }
}

/**
 * ADR-045: "Mở màn hình quầy" ở trang Quản lý (`/pos?from=admin`) → máy quầy dùng luôn phiên Quản lý vừa đăng nhập bằng mật khẩu
 * (cùng một người — không hỏi lại), chấm công vào như đăng nhập quầy. Máy quầy đang có người khác đăng nhập (còn hạn) → giữ nguyên
 * người đó (không đá người đang đứng quầy). Chủ quán (F-084) hoặc phiên Quản lý hết hạn → trang đăng nhập quầy như thường.
 * Chiều ngược lại (quầy → trang Quản lý) vẫn phải gõ mật khẩu nếu chưa đăng nhập trang Quản lý (ADR-044).
 */
async function openPosFromAdmin() {
  const params = new URLSearchParams(location.search);
  if (isAdminArea() || params.get('from') !== 'admin') return;
  params.delete('from');
  const q = params.toString();
  history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
  const admin = getAdminSession();
  if (!admin) return;
  const pos = getPosToken();
  if (pos) {
    const standing = await whoIs(pos);
    if (standing && standing.role !== 'ADMIN') return;
  }
  try {
    const { user } = await api('/api/auth/pos-session', { method: 'POST', headers: { Authorization: `Bearer ${admin.token}` } });
    saveStaffSession(admin.token, user);
  } catch {
    /* chủ quán / phiên Quản lý hết hạn → để trang đăng nhập quầy xử lý */
  }
}

export async function requireStaffPage({ admin = false, page = '' } = {}) {
  await openPosFromAdmin();
  // ADR-044: trang Quản lý không dùng phiên máy quầy — chưa đăng nhập trang Quản lý thì phải gõ mật khẩu ở /admin/login
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
  // F-084 (ADR-043) + ADR-044: chủ quán chỉ dùng trang Quản lý. Phiên máy quầy đứng tên chủ quán (đăng nhập trước khi có luật) → bỏ,
  // sang trang Đăng nhập Quản lý — phải gõ mật khẩu, không đổi phiên quầy thành phiên Quản lý. Không gọi đăng xuất server.
  if (!isAdminArea() && user.role === 'ADMIN') {
    clearStaffSession();
    location.replace('/admin/login?reason=owner');
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
