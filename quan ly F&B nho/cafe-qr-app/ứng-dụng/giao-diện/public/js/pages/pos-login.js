// S-09 Đăng nhập: sai → "Sai tên đăng nhập hoặc mật khẩu"; khóa → "Tài khoản đã bị khóa".
// F-084 (ADR-043): tài khoản Chủ quán chỉ dùng trang Quản lý — server từ chối đăng nhập quầy (OWNER_ADMIN_ONLY) → đăng nhập trang Quản lý
// bằng chính mật khẩu vừa gõ và chuyển sang đó (không có phiên máy quầy, không chấm công).
import { api } from '../api.js';
import { getToken, saveAdminSession, saveStaffSession } from '../auth-store.js';
import { $, clear, el, errorMessage, setBusy } from '../ui.js';

const params = new URLSearchParams(location.search);
const next = params.get('next');
const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;

const reason = params.get('reason');
if (reason === 'expired') clear($('#msg'), el('div', { class: 'alert info' }, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.'));
if (reason === 'locked') clear($('#msg'), el('div', { class: 'alert danger' }, 'Tài khoản đã bị khóa.'));
if (getToken() && !reason) location.replace(safeNext || '/pos');

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('#username').value.trim();
  const password = $('#password').value;
  if (!username || !password) {
    clear($('#msg'), el('div', { class: 'alert danger' }, 'Vui lòng nhập tên đăng nhập và mật khẩu.'));
    return;
  }
  const btn = $('#submit');
  setBusy(btn, true);
  try {
    const { accessToken, user } = await api('/api/auth/login', { method: 'POST', body: { username, password, area: 'pos' } });
    saveStaffSession(accessToken, user);
    location.replace(safeNext || '/pos');
  } catch (err) {
    const shown = err?.code === 'OWNER_ADMIN_ONLY' ? await ownerToAdmin(username, password).catch((e) => e) : err;
    if (!shown) return; // đang chuyển sang trang Quản lý
    setBusy(btn, false);
    clear($('#msg'), el('div', { class: 'alert danger' }, errorMessage(shown)));
    $('#password').select();
  }
});

/** F-084: chủ quán gõ tài khoản ở màn quầy → đăng nhập trang Quản lý (phiên Quản lý riêng) rồi chuyển sang; trả null khi đã chuyển. */
async function ownerToAdmin(username, password) {
  const { accessToken, user } = await api('/api/auth/login', { method: 'POST', body: { username, password, area: 'admin' } });
  saveAdminSession(accessToken, user);
  location.replace(safeNext?.startsWith('/admin') ? safeNext : '/admin/today');
  return null;
}
