// S-01 — Vào bàn: quét QR → phiên mới / vào lại phiên cũ / chọn Gộp chung nhóm hay Tạo đơn cá nhân (FEATURE-001, BR-008).
import { api } from '../api.js';
import { $, clear, el, errorMessage, setBusy, time, toast } from '../ui.js';
import { clearSessionId, qrToken, setFlash, setSessionId, takeFlash } from '../customer.js';
import { icon } from '../icons.js';

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
    if (res.state === 'NEW' || res.state === 'MEMBER') {
      // Vào thẳng thực đơn: chuyển tiếp lời nhắn (vd "bàn trống đã đóng, giỏ vẫn còn") — trang này chuyển đi ngay, khách không kịp đọc (F-086)
      if (flash) setFlash(flash.message, flash.type);
      return enter(res.session.sessionId);
    }
    if (res.state === 'ELSEWHERE') return showElsewhere(res); // F-086
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
      el('div', { class: 'logo' }, icon('coffee')),
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

/**
 * F-086 (ADR-047): điện thoại đang có nhóm mở ở bàn khác — hỏi khách đã đổi bàn chưa thay vì lặng lẽ mở nhóm mới (món mang ra nhầm bàn,
 * khách tưởng mất đơn rồi gọi lại). Nhóm chưa gửi món, chỉ một mình → chuyển ngay, giỏ đi theo; còn lại → nhờ quầy chuyển.
 */
function showElsewhere(res) {
  const { table, elsewhere: e, otherGroups = [] } = res;
  const sent = e.orderCount > 0;
  const status = sent ? `đã gửi ${e.itemCount} món` : 'chưa gửi món nào';
  const choices = [];
  if (e.canMoveNow) {
    choices.push(
      el(
        'button',
        { class: 'c-choice', type: 'button', onclick: (ev) => moveHere(res, ev.currentTarget) },
        el('strong', {}, `Chuyển sang ${table.name}`),
        el('span', { class: 'small' }, `Món bạn đang chọn đi theo. ${e.table.name} được trả lại cho quán.`),
      ),
    );
  } else {
    choices.push(
      el(
        'button',
        { class: 'c-choice', type: 'button', onclick: (ev) => requestMove(res, ev.currentTarget) },
        el('strong', {}, `Nhờ quầy chuyển nhóm sang ${table.name}`),
        el(
          'span',
          { class: 'small' },
          sent ? 'Món đã gửi và hóa đơn chuyển theo — nhân viên xác nhận trong giây lát.' : 'Cả nhóm chuyển theo — nhân viên xác nhận trong giây lát.',
        ),
      ),
      el(
        'button',
        { class: 'c-choice alt', type: 'button', onclick: (ev) => orderSeparately(res, ev.currentTarget) },
        el('strong', {}, `Gọi món riêng ở ${table.name}`),
        el('span', { class: 'small muted' }, `Nhóm ở ${e.table.name} vẫn giữ nguyên, hóa đơn riêng.`),
      ),
    );
  }
  // Điện thoại còn nhóm khác (đã "gọi riêng" ở bàn khác trước đó) → mỗi nhóm một lựa chọn chuyển
  for (const g of otherGroups) {
    const label = g.orderCount > 0 ? `đã gửi ${g.itemCount} món` : 'chưa gửi món';
    choices.push(
      el(
        'button',
        { class: 'c-choice alt', type: 'button', onclick: (ev) => (g.canMoveNow ? moveHere : requestMove)({ ...res, elsewhere: g }, ev.currentTarget) },
        el('strong', {}, g.canMoveNow ? `Chuyển nhóm ${g.table.name} sang ${table.name}` : `Nhờ quầy chuyển nhóm ${g.table.name} sang ${table.name}`),
        el('span', { class: 'small muted' }, `Nhóm thứ hai của bạn ở ${g.table.name} (${label}).`),
      ),
    );
  }
  clear(
    app,
    el(
      'div',
      { class: 'c-hero' },
      el('div', { class: 'logo' }, icon('coffee')),
      el('h1', {}, table.name),
      el('p', { class: 'muted' }, `Bạn đang gọi món ở ${e.table.name} (${status}). Bạn đã chuyển sang ${table.name}?`),
    ),
    e.moveRequest ? el('div', { class: 'alert info' }, `Bạn đã nhờ quầy chuyển sang ${e.moveRequest.toTable} — đang chờ nhân viên xác nhận.`) : null,
    choices,
    el('a', { class: 'btn btn-block c-back', href: `/t/${e.table.qrToken}` }, `Quay lại ${e.table.name}`),
  );
}

async function moveHere(res, button) {
  const { table, elsewhere: e } = res;
  setBusy(button, true);
  try {
    await api(`/api/sessions/${e.sessionId}/move-here`, { method: 'POST', body: { qrToken: qr } });
    clearSessionId(e.table.qrToken);
    setFlash(`Đã chuyển sang ${table.name} — món bạn đang chọn vẫn còn trong giỏ.`, 'success');
    enter(e.sessionId);
  } catch (err) {
    setBusy(button, false);
    toast(errorMessage(err), 'warning', 6000);
    start(); // nhóm vừa có món / có người vào → hỏi lại với lựa chọn "Nhờ quầy chuyển"
  }
}

async function requestMove(res, button) {
  const { elsewhere: e } = res;
  setBusy(button, true);
  try {
    await api(`/api/sessions/${e.sessionId}/move-request`, { method: 'POST', body: { qrToken: qr } });
    // Về trang của nhóm ở bàn cũ: trang theo nhóm — quầy chuyển xong thì tự mở lại ở bàn mới
    setSessionId(e.table.qrToken, e.sessionId);
    // Không cần thông báo nổi: trang theo dõi đơn hiện dòng "Đã nhờ quầy chuyển…" cho tới khi xong
    location.replace(`/t/${e.table.qrToken}/${e.orderCount > 0 ? 'track' : 'menu'}`);
  } catch (err) {
    setBusy(button, false);
    toast(errorMessage(err), 'error');
    if (err.code === 'SESSION_CLOSED') start();
  }
}

function orderSeparately(res, button) {
  if (res.openSessions?.length) return showChoice(res); // bàn này có nhóm khác → Gộp chung / Tạo đơn cá nhân như thường
  return createOwn(button);
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
      el('div', { class: 'logo warn' }, icon('triangle-alert')),
      el('h1', {}, 'Mã bàn không hợp lệ'),
      el('p', { class: 'muted' }, 'Mã QR này không còn hiệu lực. Vui lòng quét lại mã dán trên bàn hoặc gọi nhân viên.'),
    ),
  );
}

function showError(err) {
  clear(
    app,
    el(
      'div',
      { class: 'c-hero' },
      el('div', { class: 'logo warn' }, icon('wifi-off')),
      el('h1', {}, 'Chưa mở được thực đơn'),
      el('p', { class: 'muted' }, errorMessage(err)),
    ),
    el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button', onclick: start }, 'Thử lại'),
  );
}

start();
