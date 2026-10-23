import { icon } from './icons.js';
// Tiện ích giao diện dùng chung. Dữ liệu người dùng luôn đưa vào DOM qua textContent (el/clear) — không innerHTML.

/** el('div', { class: 'x', onclick: fn }, 'text', childNode, [nhiều con]) */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'value' && 'value' in node) node.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected') node[key] = Boolean(value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  appendChildren(node, children);
  if (tag === 'div' && node.classList.contains('field')) linkFieldLabel(node);
  // Thông báo lỗi chèn động → trình đọc màn hình đọc ngay (WCAG 4.1.3 — NFR-A11Y-08, TASK-057)
  const isError = node.classList.contains('field-error') || (node.classList.contains('alert') && node.classList.contains('danger'));
  if (isError && !node.hasAttribute('role')) node.setAttribute('role', 'alert');
  return node;
}

let fieldSeq = 0;
/**
 * Khối `.field` = một nhãn + đúng một ô nhập (mẫu dùng ở mọi form): tự gắn `<label for>` để trình đọc màn hình
 * đọc đúng nhãn và bấm nhãn thì focus ô (WCAG 1.3.1 / 4.1.2 — TASK-057). Không đổi giao diện.
 */
function linkFieldLabel(field) {
  const label = [...field.children].find((c) => c.tagName === 'LABEL' && !c.htmlFor && !c.querySelector('input, select, textarea'));
  const controls = [...field.children].filter((c) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(c.tagName));
  if (!label || controls.length !== 1) return;
  if (!controls[0].id) controls[0].id = `fld-${++fieldSeq}`;
  label.htmlFor = controls[0].id;
}

function appendChildren(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(node, ...children) {
  node.replaceChildren();
  appendChildren(node, children);
  return node;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// ---------- Định dạng ----------
const TZ = 'Asia/Ho_Chi_Minh';
export const money = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;
export const num = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
export const time = (d) => (d ? new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '');
export const dateTime = (d) =>
  d ? new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ }) : '';
export const todayVn = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
/** "31/10/2026" theo giờ quán (hạn voucher, lịch sử điểm). */
export const dateOnly = (d) => (d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ }) : '');
/** Giá trị voucher: "−10% (tối đa 50.000đ)" / "−20.000đ" (F-038, F-047). */
export const voucherValue = (v) => (v.percent ? `−${v.percent}%${v.maxDiscount ? ` (tối đa ${money(v.maxDiscount)})` : ''}` : `−${money(v.amount)}`);

/** "3:05" (phút:giây) hoặc "1 giờ 05 phút" từ một mốc thời gian. */
export function elapsed(from, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return `${Math.floor(s / 3600)} giờ ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} phút`;
}

export const ORDER_STATUS = {
  PENDING: 'Chờ xác nhận',
  PREPARING: 'Đang chuẩn bị',
  COMPLETED: 'Đã xong',
  CANCELLED: 'Đã hủy',
  VOIDED: 'Đã hoàn tiền',
};

/** Dòng breakdown tiền (server tính — ADR-005): [{ key, label, amount }] → các dòng nhãn / số tiền. */
export const breakdownRows = (lines, cls = 'kv') =>
  (lines ?? []).map((b) =>
    el(
      'div',
      { class: `${cls} ${b.key === 'total' ? 'total' : ''} ${b.amount < 0 ? 'minus' : ''} ${b.info ? 'info' : ''}` },
      el('span', {}, b.label),
      el('span', {}, b.info ? '' : money(b.amount)), // dòng thông tin (điểm / tem đã tích — F-039) không có số tiền
    ),
  );

export const statusBadge = (status, label) => el('span', { class: `badge ${status.toLowerCase()}` }, label ?? ORDER_STATUS[status] ?? status);
export const paymentBadge = (paymentStatus) =>
  el('span', { class: `badge ${paymentStatus === 'PAID' ? 'paid' : 'unpaid'}` }, paymentStatus === 'PAID' ? 'Đã thu' : 'Chưa thu');

// ---------- Toast ----------
let toastBox;
export function toast(message, type = 'info', ms = 3500) {
  if (!toastBox) {
    toastBox = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastBox);
  }
  const t = el('div', { class: `toast ${type}` }, message);
  toastBox.append(t);
  setTimeout(() => t.remove(), ms);
}

export const errorMessage = (err) => err?.message || 'Có lỗi xảy ra, vui lòng thử lại';

// ---------- Modal / drawer ----------
/**
 * Mở modal. actions: [{ label, class, value, onClick }]. onClick(close) trả false để giữ modal mở.
 * Trả { close, root, result } với result là Promise giá trị của action được bấm (null nếu đóng).
 */
export function modal({ title, body, actions = [], drawer = false, sheet = false, dismissable = true, onClose }) {
  const kind = drawer ? 'drawer' : sheet ? 'sheet' : 'modal';
  let resolveResult;
  const result = new Promise((r) => (resolveResult = r));
  const close = (value = null) => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.(value);
    resolveResult(value);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && dismissable) close(null);
  };
  const foot = actions.length
    ? el(
        'div',
        { class: 'modal-foot' },
        actions.map((a) =>
          el(
            'button',
            {
              type: 'button',
              class: `btn ${a.class ?? ''}`,
              onclick: async (e) => {
                if (a.onClick) {
                  const keep = await a.onClick(close, e);
                  if (keep === false) return;
                }
                close(a.value ?? a.label);
              },
            },
            a.label,
          ),
        ),
      )
    : null;
  const box = el(
    'div',
    { class: kind, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el(
      'div',
      { class: 'modal-head' },
      el('h2', {}, title),
      dismissable ? el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Đóng', onclick: () => close(null) }, icon('x')) : null,
    ),
    el('div', { class: 'modal-body' }, body),
    foot,
  );
  const overlay = el('div', { class: `overlay ${kind}-overlay` }, box);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay && dismissable) close(null);
  });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  box.querySelector('input, select, textarea, .btn-primary')?.focus();
  return { close, root: box, result };
}

export function confirmDialog(title, message, { okLabel = 'Đồng ý', cancelLabel = 'Hủy', danger = false } = {}) {
  return modal({
    title,
    body: el('p', {}, message),
    actions: [
      { label: cancelLabel, value: false },
      { label: okLabel, class: danger ? 'btn-danger' : 'btn-primary', value: true },
    ],
  }).result.then((v) => v === true);
}

/** Hỏi lý do bắt buộc (sửa / hủy phiếu kho — F-048). → lý do (đã bỏ khoảng trắng) hoặc null nếu bỏ qua. */
export function reasonDialog(title, message, { okLabel = 'Đồng ý', danger = false, placeholder = '' } = {}) {
  const input = el('input', { class: 'input', maxlength: 200, placeholder });
  const err = el('p', { class: 'field-error', hidden: true }, 'Nhập lý do');
  return modal({
    title,
    body: el('div', { class: 'stack' }, message ? el('p', {}, message) : null, el('div', { class: 'field' }, el('label', {}, 'Lý do (bắt buộc)'), input), err),
    actions: [
      { label: 'Thôi', value: false },
      {
        label: okLabel,
        class: danger ? 'btn-danger' : 'btn-primary',
        onClick: (close) => {
          const v = input.value.trim();
          if (v) close(v);
          else {
            err.hidden = false;
            input.focus();
          }
          return false;
        },
      },
    ],
  }).result.then((v) => (typeof v === 'string' ? v : null));
}

export function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle('loading', busy);
}

/** Đánh dấu ô lỗi theo details.fields [{ path, message }] của API; trả true nếu có ô được đánh dấu. */
export function showFieldErrors(form, err) {
  form.querySelectorAll('.invalid').forEach((n) => n.classList.remove('invalid'));
  form.querySelectorAll('.field-error').forEach((n) => n.remove());
  let marked = false;
  for (const f of err?.details?.fields ?? []) {
    const input = form.querySelector(`[name="${CSS.escape(f.path)}"]`);
    if (!input) continue;
    input.classList.add('invalid');
    input.after(el('div', { class: 'field-error' }, f.message));
    marked = true;
  }
  return marked;
}

// ---------- Âm thanh (Web Audio, không cần file) ----------
let audioCtx = null;
export function unlockAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return false;
  audioCtx ||= new Ctx();
  audioCtx.resume();
  return true;
}
export const audioReady = () => Boolean(audioCtx && audioCtx.state === 'running');

/** 'ting' = đơn mới; 'chime' = gọi thanh toán; 'bell' = khách gọi nhân viên (F-021) — khác nhau để nhân viên phân biệt không cần nhìn. */
const SOUNDS = {
  ting: [
    [1175, 0],
    [1568, 0.12],
  ],
  chime: [
    [784, 0],
    [988, 0.18],
    [1319, 0.36],
  ],
  bell: [
    [660, 0],
    [660, 0.22],
    [880, 0.44],
    [660, 0.66],
  ],
};
export function playSound(kind = 'ting') {
  if (!audioReady()) return false;
  const notes = SOUNDS[kind] ?? SOUNDS.ting;
  const t0 = audioCtx.currentTime;
  for (const [freq, at] of notes) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.35, t0 + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.5);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + 0.55);
  }
  return true;
}

/** Ô vuông chữ cái đầu khi món chưa có ảnh. */
export function thumb(name, imageUrl) {
  if (imageUrl) return el('img', { class: 'thumb', src: imageUrl, alt: '', loading: 'lazy' });
  return el('div', { class: 'thumb', 'aria-hidden': 'true' }, (name || '?').trim().charAt(0).toUpperCase());
}

/** Ô nhập tiền: chỉ giữ chữ số, hiển thị phân cách nghìn. */
export function moneyInput(attrs = {}) {
  const input = el('input', { class: 'input money-input', inputmode: 'numeric', autocomplete: 'off', placeholder: '0', ...attrs });
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    input.value = digits ? Number(digits).toLocaleString('vi-VN') : '';
  });
  return input;
}
export const moneyValue = (input) => {
  const digits = String(input.value).replace(/\D/g, '');
  return digits === '' ? null : Number(digits);
};
export function setMoney(input, value) {
  input.value = value === null || value === undefined ? '' : Number(value).toLocaleString('vi-VN');
}
