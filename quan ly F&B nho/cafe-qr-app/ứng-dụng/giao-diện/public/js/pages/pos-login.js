// S-09 Đăng nhập: sai → "Sai tên đăng nhập hoặc mật khẩu"; khóa → "Tài khoản đã bị khóa".
import { api } from '../api.js';
import { getToken, saveStaffSession } from '../auth-store.js';
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
    const { accessToken, user } = await api('/api/auth/login', { method: 'POST', body: { username, password } });
    saveStaffSession(accessToken, user);
    location.replace(safeNext || '/pos');
  } catch (err) {
    setBusy(btn, false);
    clear($('#msg'), el('div', { class: 'alert danger' }, errorMessage(err)));
    $('#password').select();
  }
});
