// F-102 (ADR-073 D-267, D-268) — SCR-59 hộp "Đổi mật khẩu".
//  - Bắt buộc (`forced`): đăng nhập bằng mật khẩu mặc định / dễ đoán → không đóng được (không "×", Esc / chạm nền không đóng), chỉ
//    "Đăng xuất" hoặc đổi. Vừa gõ mật khẩu ở trang đăng nhập (`currentPassword`) → không hỏi lại.
//  - Tự mở: nút "Đổi mật khẩu" ở Giờ công của tôi / khung trang Quản lý — luôn hỏi mật khẩu đang dùng.
// Đổi xong máy chủ trả token mới → thay token cũ ở phiên máy quầy / phiên Quản lý nào đang giữ nó.
import { api } from './api.js';
import { getAdminSession, getPosToken, getToken, saveAdminSession, saveStaffSession } from './auth-store.js';
import { clear, el, errorMessage, modal, showFieldErrors, toast } from './ui.js';

/** Token cũ vừa đổi mật khẩu → token mới ở mọi phiên trên máy này đang dùng token cũ. */
function replaceToken(oldToken, accessToken, user) {
  const admin = getAdminSession();
  if (admin?.token === oldToken) saveAdminSession(accessToken, { ...admin.user, mustChangePassword: false });
  if (getPosToken() === oldToken) saveStaffSession(accessToken, { ...user, mustChangePassword: false });
}

/**
 * Mở hộp đổi mật khẩu. → `{ accessToken, user }` khi đã đổi; `'logout'` khi (hộp bắt buộc) chọn Đăng xuất; `null` khi đóng.
 * `token`: token dùng để gọi máy chủ (mặc định token của trang đang mở — trang đăng nhập truyền token vừa nhận).
 */
export function changePasswordDialog({ forced = false, currentPassword = null, token = getToken(), username = '' } = {}) {
  const knowCurrent = typeof currentPassword === 'string' && currentPassword.length > 0;
  const pw = (name, id, autocomplete) => el('input', { class: 'input', type: 'password', name, id, autocomplete, maxlength: 100, required: true });
  const field = (label, input) => el('div', { class: 'field' }, el('label', { for: input.id }, label), input);
  const cur = knowCurrent ? null : pw('currentPassword', 'cp-current', 'current-password');
  const next1 = pw('newPassword', 'cp-new', 'new-password');
  const next2 = pw('newPasswordAgain', 'cp-again', 'new-password');
  const msg = el('div', { 'aria-live': 'polite' });
  let saving = false;

  const fail = (input, text) => {
    showFieldErrors(form, { details: { fields: [{ path: input.name, message: text }] } });
    input.focus();
    return false;
  };
  const save = async (close) => {
    if (saving) return false;
    clear(msg);
    showFieldErrors(form, null);
    if (cur && !cur.value) return fail(cur, 'Nhập mật khẩu đang dùng');
    if (next1.value.length < 6) return fail(next1, 'Mật khẩu tối thiểu 6 ký tự');
    if (next1.value !== next2.value) return fail(next2, 'Hai lần nhập mật khẩu mới không giống nhau');
    saving = true;
    try {
      const r = await api('/api/auth/change-password', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: { currentPassword: knowCurrent ? currentPassword : cur.value, newPassword: next1.value },
      });
      replaceToken(token, r.accessToken, r.user);
      toast('Đã đổi mật khẩu', 'success');
      close(r);
    } catch (err) {
      saving = false;
      if (!showFieldErrors(form, err)) clear(msg, el('div', { class: 'alert danger' }, errorMessage(err)));
    }
    return false;
  };

  const intro = forced
    ? el(
        'p',
        {},
        knowCurrent ? 'Mật khẩu bạn vừa dùng' : 'Tài khoản này đang dùng mật khẩu',
        ' là mật khẩu mặc định hoặc quá dễ đoán — ai dùng chung Wi-Fi của quán cũng có thể thử được. Đặt mật khẩu mới để dùng tiếp.',
      )
    : null;
  const form = el(
    'form',
    {
      class: 'stack',
      novalidate: true,
      onsubmit: (e) => e.preventDefault(),
      // Enter trong ô = bấm "Đổi mật khẩu" (nút nằm ở chân hộp thoại, ngoài form)
      onkeydown: (e) => {
        if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
        e.preventDefault();
        primary()?.click();
      },
    },
    intro,
    // Ô tên đăng nhập ẩn: trình quản lý mật khẩu lưu đúng tài khoản cho mật khẩu mới
    username
      ? el('input', { type: 'text', name: 'username', autocomplete: 'username', value: username, hidden: true, tabindex: -1, 'aria-hidden': 'true' })
      : null,
    cur ? field('Mật khẩu đang dùng', cur) : null,
    field('Mật khẩu mới', next1),
    field('Nhập lại mật khẩu mới', next2),
    el(
      'p',
      { class: 'small muted' },
      'Ít nhất 6 ký tự. Không dùng mật khẩu mẫu (Admin@123, Staff@123…), 123456 hay tên đăng nhập — nên ghép vài từ chỉ bạn biết.',
    ),
    msg,
  );
  const dlg = modal({
    title: forced ? 'Đổi mật khẩu trước khi dùng tiếp' : 'Đổi mật khẩu',
    body: form,
    dismissable: !forced,
    actions: [
      forced ? { label: 'Đăng xuất', value: 'logout' } : { label: 'Thôi', value: null },
      { label: 'Đổi mật khẩu', class: 'btn-primary', onClick: save },
    ],
  });
  const primary = () => dlg.root.querySelector('.modal-foot .btn-primary');
  (cur ?? next1).focus();
  return dlg.result.then((v) => (v === 'logout' ? 'logout' : v && typeof v === 'object' ? v : null));
}
