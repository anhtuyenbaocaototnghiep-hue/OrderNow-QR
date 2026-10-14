// S-01 — Vào bàn: quét QR → phiên mới / vào lại phiên cũ / chọn Gộp chung nhóm hay Tạo đơn cá nhân (FEATURE-001, BR-008).
import { api } from '../api.js';
import { $, clear, el, errorMessage, setBusy, time, toast } from '../ui.js';
import { qrToken, setFlash, setSessionId, takeFlash } from '../customer.js';

const qr = qrToken();
const app = $('#app');

const flash = takeFlash();
if (flash) toast(flash.message, flash.type, 6000);

function enter(sessionId) {
  setSessionId(qr, sessionId);
  location.replace(`/t/${qr}/menu`);
}

function loading(text = 'Đang mở thực đơn…') {
  clear(app, el('div', { class: 'c-loading' }, el('div', { class: 'spinner' }), text));
}

async function start() {
  loading();
  try {
    const res = await api('/api/sessions/scan', { method: 'POST', body: { qrToken: qr } });
    if (res.state === 'NEW' || res.state === 'MEMBER') return enter(res.session.sessionId);
    showChoice(res);
  } catch (err) {
    if (err.status === 404 || err.code === 'VALIDATION_ERROR' || err.code === 'TABLE_NOT_FOUND') return showInvalid();
    showError(err);
  }
}

function showChoice({ table, openSessions }) {
  clear(
    app,
    el(
      'div',
      { class: 'c-hero' },
      el('div', { class: 'logo', 'aria-hidden': 'true' }, '☕'),
      el('h1', {}, table.name),
      el('p', { class: 'muted' }, 'Bàn đang có người. Bạn đi cùng nhóm hay đi lẻ?'),
    ),
    openSessions.map((s) =>
      el(
        'button',
        { class: 'c-choice', type: 'button', onclick: (e) => join(s.sessionId, e.currentTarget) },
        el('strong', {}, 'Gộp chung nhóm'),
        el('span', { class: 'muted small' }, `${s.label} · ${s.itemCount} món · mở lúc ${time(s.openedAt)}`),
        el('span', { class: 'small' }, 'Xem chung các món đã gọi và thanh toán chung một hóa đơn'),
      ),
    ),
    el(
      'button',
      { class: 'c-choice alt', type: 'button', onclick: (e) => createOwn(e.currentTarget) },
      el('strong', {}, 'Tạo đơn cá nhân'),
      el('span', { class: 'small muted' }, 'Gọi món và thanh toán riêng, không bị nhầm bill'),
    ),
  );
}

async function join(sessionId, button) {
  setBusy(button, true);
  try {
    const res = await api(`/api/sessions/${sessionId}/join`, { method: 'POST', body: { qrToken: qr } });
    enter(res.session.sessionId);
  } catch (err) {
    setBusy(button, false);
    if (err.code === 'SESSION_CLOSED') {
      // AC-001-04: nhóm vừa thanh toán → tự chuyển sang tạo phiên mới và báo khách
      setFlash(err.message, 'warning');
      return createOwn(null, true);
    }
    if (err.status === 404) {
      toast('Nhóm này không còn trên bàn, vui lòng chọn lại', 'warning');
      return start();
    }
    toast(errorMessage(err), 'error');
  }
}

async function createOwn(button, silent = false) {
  setBusy(button, true);
  if (silent) loading('Đang tạo phiên mới cho bạn…');
  try {
    const res = await api('/api/sessions', { method: 'POST', body: { qrToken: qr } });
    enter(res.session.sessionId);
  } catch (err) {
    setBusy(button, false);
    if (err.status === 404) return showInvalid();
    showError(err);
  }
}

function showInvalid() {
  clear(
    app,
    el(
      'div',
      { class: 'c-hero' },
      el('div', { class: 'logo' }, '⚠️'),
      el('h1', {}, 'Mã bàn không hợp lệ'),
      el('p', { class: 'muted' }, 'Mã QR này không còn hiệu lực. Vui lòng quét lại mã dán trên bàn hoặc gọi nhân viên.'),
    ),
  );
}

function showError(err) {
  clear(
    app,
    el('div', { class: 'c-hero' }, el('div', { class: 'logo' }, '📶'), el('h1', {}, 'Chưa mở được thực đơn'), el('p', { class: 'muted' }, errorMessage(err))),
    el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button', onclick: start }, 'Thử lại'),
  );
}

start();
