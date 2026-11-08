// S-56 Đăng nhập Quản lý (FEATURE-080, ADR-038 D-173…D-177): trang đăng nhập riêng của trang Quản lý.
//  - Phiên Quản lý riêng với máy quầy (auth-store saveAdminSession); đăng nhập ở đây gửi area = 'admin' → không chấm công vào.
//  - ADR-044: luôn phải gõ mật khẩu — không còn nút "Vào bằng tài khoản này" (dùng phiên máy quầy đang mở).
//  - Người không có trang Quản lý nào → báo + "Xin quyền" (chọn phần trang Quản lý cần, gửi bằng phiên vừa đăng nhập, không lưu phiên).
import { api, ApiError } from '../api.js';
import { getAdminSession, saveAdminSession } from '../auth-store.js';
import { canOpenAdminPage, firstAdminHref, hasAdminPages } from '../roles.js';
import { brandMark } from '../icons.js';
import { $, clear, el, errorMessage, setBusy } from '../ui.js';

const params = new URLSearchParams(location.search);
const next = params.get('next');
const safeNext = next && next.startsWith('/admin') && !next.startsWith('//') ? next : null;
const reason = params.get('reason');
const say = (cls, text) => clear($('#msg'), el('div', { class: `alert ${cls}` }, text));

clear($('#brand'), brandMark());
if (reason === 'expired') say('info', 'Phiên đăng nhập trang Quản lý đã hết hạn, vui lòng đăng nhập lại.');
if (reason === 'locked') say('danger', 'Tài khoản đã bị khóa.');
if (reason === 'noaccess') say('warning', 'Tài khoản này chưa có quyền vào trang Quản lý.');
if (reason === 'owner') say('info', 'Tài khoản Chủ quán chỉ dùng trang Quản lý — đăng nhập để tiếp tục.'); // F-084 + ADR-044

/** Gọi API bằng một token cụ thể (chưa lưu phiên). */
async function withToken(token, path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

const mayEnter = (user) => hasAdminPages(user) || canOpenAdminPage(user, 'today');
const landing = (user) => safeNext || (canOpenAdminPage(user, 'today') ? '/admin/today' : firstAdminHref(user));

// Đã có phiên Quản lý (đăng nhập ở đây trước đó, chưa đăng xuất) → vào luôn. ADR-044: phiên máy quầy KHÔNG dùng được ở đây.
if (getAdminSession() && !reason) location.replace(safeNext || '/admin/today');

/** Không có quyền trang Quản lý → báo + xin quyền (dùng token vừa đăng nhập, không lưu). */
async function showNoAccess(token, user) {
  say('warning', `${user.fullName}: tài khoản này chưa có quyền vào trang Quản lý — dùng màn hình quầy, hoặc xin chủ quán cấp quyền.`);
  let caps = [];
  try {
    caps = (await withToken(token, '/api/access/capabilities')).filter((c) => c.group === 'Trang Quản lý');
  } catch {
    return;
  }
  const pick = el(
    'select',
    { class: 'input', id: 'ask-cap' },
    caps.map((c) => el('option', { value: c.key }, c.label)),
  );
  const why = el('input', { class: 'input', id: 'ask-reason', maxlength: 200, placeholder: 'Ví dụ: nhập hàng thay quản lý' });
  const send = el('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'Xin quyền');
  send.addEventListener('click', async () => {
    setBusy(send, true);
    try {
      const r = await withToken(token, '/api/access-requests', { method: 'POST', body: { capability: pick.value, reason: why.value.trim() || null } });
      clear(
        $('#noaccess'),
        el('div', { class: 'alert success' }, r.created ? 'Đã gửi — chờ chủ quán duyệt rồi đăng nhập lại.' : 'Bạn đã xin quyền này — đang chờ chủ quán duyệt.'),
      );
    } catch (err) {
      setBusy(send, false);
      say('danger', errorMessage(err));
    }
  });
  clear(
    $('#noaccess'),
    el(
      'div',
      { class: 'stack admin-login-ask' },
      el('div', { class: 'field' }, el('label', { for: 'ask-cap' }, 'Cần quyền'), pick),
      el('div', { class: 'field' }, el('label', { for: 'ask-reason' }, 'Lý do (không bắt buộc)'), why),
      send,
    ),
  );
}

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('#username').value.trim();
  const password = $('#password').value;
  if (!username || !password) return say('danger', 'Vui lòng nhập tên đăng nhập và mật khẩu.');
  const btn = $('#submit');
  setBusy(btn, true);
  clear($('#noaccess'));
  try {
    const { accessToken } = await api('/api/auth/login', { method: 'POST', body: { username, password, area: 'admin' } });
    const { user } = await withToken(accessToken, '/api/auth/me');
    if (!mayEnter(user)) {
      setBusy(btn, false);
      return showNoAccess(accessToken, user);
    }
    saveAdminSession(accessToken, user);
    location.replace(landing(user));
  } catch (err) {
    setBusy(btn, false);
    say('danger', errorMessage(err));
    $('#password').select();
  }
});
