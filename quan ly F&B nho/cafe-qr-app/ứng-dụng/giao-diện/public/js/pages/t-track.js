// S-05 Theo dõi đơn realtime + S-04 Gọi thanh toán (FEATURE-004, FEATURE-005; BR-018; REQ-019 bản mới).
// Mỗi sự kiện realtime hoặc khi kết nối lại → tải lại ảnh chụp phiên (không tin sự kiện bị nhỡ).
import { api } from '../api.js';
import { connectRealtime } from '../socket.js';
import { $, clear, el, elapsed, errorMessage, modal, money, setBusy, time, toast } from '../ui.js';
import { CUSTOMER_STATUS, clearSessionId, getSessionId, goEntry, qrToken, takeFlash } from '../customer.js';

const qr = qrToken();
const sessionId = getSessionId(qr);
if (!sessionId) {
  goEntry(qr);
  await new Promise(() => {});
}

const RECALL_AFTER_MS = 2 * 60 * 1000; // cho "Gọi lại" sau 2 phút
const BUSY_AFTER_MS = 5 * 60 * 1000; // sau 5 phút gợi ý ra quầy

let session = null;
let prevStatuses = null;
let loadTimer = null;

$('#menu-link').href = `/t/${qr}/menu`;
$('#more').href = `/t/${qr}/menu`;
const flash = takeFlash();
if (flash) toast(flash.message, flash.type, 5000);

async function load() {
  try {
    session = await api(`/api/sessions/${sessionId}`);
  } catch (err) {
    if (err.status === 403 || err.status === 404) return goEntry(qr);
    clear(
      $('#main'),
      el('div', { class: 'empty' }, el('p', {}, errorMessage(err)), el('button', { class: 'btn btn-primary', type: 'button', onclick: load }, 'Thử lại')),
    );
    return;
  }
  $('#table').textContent = session.table.name;
  notifyCompleted();
  render();
}

/** Pop-up khi có đơn vừa chuyển sang COMPLETED (AC-004-01). */
function notifyCompleted() {
  const now = new Map(session.orders.map((o) => [o.orderId, o.status]));
  if (prevStatuses) {
    const done = session.orders.filter((o) => o.status === 'COMPLETED' && prevStatuses.get(o.orderId) !== 'COMPLETED');
    if (done.length) {
      navigator.vibrate?.([200, 100, 200]);
      modal({
        title: 'Món của bạn đã xong',
        body: el(
          'div',
          { class: 'popup-done' },
          el('div', { class: 'big', 'aria-hidden': 'true' }, '🎉'),
          el('p', {}, done.length === 1 ? `Đơn #${done[0].orderCode} đã xong, vui lòng nhận tại quầy.` : `${done.length} đơn đã xong, vui lòng nhận tại quầy.`),
        ),
        actions: [{ label: 'Đã hiểu', class: 'btn-primary' }],
      });
    }
  }
  prevStatuses = now;
}

function progress(status) {
  const step = { PENDING: 1, PREPARING: 2, COMPLETED: 3 }[status] ?? 0;
  return el(
    'div',
    { class: 'progress', 'aria-hidden': 'true' },
    [1, 2, 3].map((i) => el('span', { class: i <= step ? 'on' : '' })),
  );
}

function orderCard(o) {
  return el(
    'article',
    { class: `order-card ${o.status.toLowerCase()}` },
    el(
      'div',
      { class: 'row between' },
      el('div', {}, el('strong', {}, `Đơn #${o.orderCode}`), el('span', { class: 'muted small' }, ` · ${time(o.createdAt)}`)),
      el('span', { class: `badge ${o.status.toLowerCase()}` }, CUSTOMER_STATUS[o.status]),
    ),
    o.status !== 'CANCELLED' ? progress(o.status) : o.cancelReason ? el('div', { class: 'muted small' }, `Lý do: ${o.cancelReason}`) : null,
    el(
      'ul',
      {},
      o.items.map((i) =>
        el(
          'li',
          {},
          el('span', {}, `${i.quantity} × ${i.name}`, i.note ? el('span', { class: 'line-note' }, i.note) : null),
          el('span', { class: 'nowrap' }, money(i.lineTotal)),
        ),
      ),
    ),
  );
}

function render() {
  const main = $('#main');
  const actions = $('#actions');
  if (session.status === 'CLOSED') {
    actions.hidden = true;
    const paid = session.payment;
    clear(
      main,
      el(
        'div',
        { class: 'thanks card' },
        el('div', { class: 'big', 'aria-hidden': 'true' }, '☕'),
        el('h1', {}, 'Cảm ơn quý khách!'),
        paid ? el('p', {}, `Đã thanh toán ${money(paid.amountDue)} (tiền mặt).`) : el('p', {}, 'Bàn đã được đóng.'),
        el('p', { class: 'muted' }, 'Hẹn gặp lại bạn lần sau.'),
        el(
          'button',
          {
            class: 'btn btn-primary btn-lg',
            type: 'button',
            onclick: () => {
              clearSessionId(qr);
              location.href = `/t/${qr}`;
            },
          },
          'Gọi món mới',
        ),
      ),
    );
    return;
  }

  const orders = session.orders;
  const active = orders.filter((o) => o.status !== 'CANCELLED');
  actions.hidden = false;
  $('#pay').hidden = active.length === 0; // BR-018: chưa có đơn → ẩn nút

  clear(
    main,
    paymentStatus(),
    orders.length === 0
      ? el('div', { class: 'empty card' }, el('p', {}, 'Bạn chưa gọi món nào.'), el('a', { class: 'btn btn-primary', href: `/t/${qr}/menu` }, 'Xem thực đơn'))
      : [...orders].reverse().map(orderCard),
    active.length ? el('div', { class: 'c-summary' }, el('span', {}, 'Tổng tạm tính'), el('span', {}, money(session.amountDue))) : null,
    active.length ? el('p', { class: 'muted small center' }, 'Thanh toán bằng tiền mặt. Bấm "Gọi thanh toán" khi bạn muốn tính tiền.') : null,
  );
  updatePayButton();
}

function paymentStatus() {
  if (session.status !== 'PAYMENT_REQUESTED') return null;
  const waited = Date.now() - new Date(session.paymentRequestedAt).getTime();
  return el(
    'div',
    { class: 'pay-status', id: 'pay-status' },
    el('strong', {}, 'Đã gọi thanh toán'),
    el('p', {}, `Nhân viên sẽ đến bàn trong giây lát · Tổng ${money(session.amountDue)} (tiền mặt)`),
    el(
      'div',
      { class: 'row between' },
      el('span', { class: 'muted' }, 'Đang chờ'),
      el('span', { class: 'timer', id: 'pay-timer' }, elapsed(session.paymentRequestedAt)),
    ),
    waited >= BUSY_AFTER_MS
      ? el(
          'div',
          { class: 'alert warning', style: { marginTop: '0.6rem', marginBottom: 0 } },
          'Nhân viên đang bận, bạn có thể ra quầy thanh toán hoặc bấm "Gọi lại".',
        )
      : null,
  );
}

function updatePayButton() {
  const btn = $('#pay');
  if (session?.status === 'PAYMENT_REQUESTED') {
    const waited = Date.now() - new Date(session.paymentRequestedAt).getTime();
    btn.disabled = waited < RECALL_AFTER_MS;
    btn.textContent = waited < RECALL_AFTER_MS ? `Gọi lại sau ${elapsed(Date.now() - (RECALL_AFTER_MS - waited), Date.now())}` : 'Gọi lại nhân viên';
  } else {
    btn.disabled = false;
    btn.textContent = 'Gọi thanh toán';
  }
}

async function requestPayment() {
  const active = session.orders.filter((o) => o.status !== 'CANCELLED');
  const recall = session.status === 'PAYMENT_REQUESTED';
  const ok = await modal({
    title: recall ? 'Gọi lại nhân viên?' : 'Gọi thanh toán',
    body: el(
      'div',
      {},
      el('p', {}, `Gọi nhân viên ra thu tiền ${money(session.amountDue)} (tiền mặt)?`),
      el(
        'ul',
        { class: 'small muted' },
        active.map((o) => el('li', {}, `Đơn #${o.orderCode} — ${money(o.totalAmount)}`)),
      ),
    ),
    actions: [
      { label: 'Hủy', value: false },
      { label: recall ? 'Gọi lại' : 'Xác nhận', class: 'btn-primary', value: true },
    ],
  }).result;
  if (ok !== true) return;
  const btn = $('#pay');
  setBusy(btn, true);
  try {
    await api(`/api/sessions/${sessionId}/request-payment`, { method: 'POST' });
    toast('Đã báo quầy. Nhân viên sẽ đến bàn thu tiền.', 'success');
    await load();
  } catch (err) {
    if (err.code === 'SESSION_CLOSED') return load();
    toast(errorMessage(err), 'error');
  } finally {
    setBusy(btn, false);
    updatePayButton();
  }
}

function scheduleLoad() {
  clearTimeout(loadTimer);
  loadTimer = setTimeout(load, 150);
}

$('#pay').addEventListener('click', requestPayment);

setInterval(() => {
  if (session?.status !== 'PAYMENT_REQUESTED') return;
  const timer = $('#pay-timer');
  if (timer) timer.textContent = elapsed(session.paymentRequestedAt);
  const waited = Date.now() - new Date(session.paymentRequestedAt).getTime();
  if (waited >= BUSY_AFTER_MS && !$('#pay-status .alert')) render();
  updatePayButton();
}, 1000);

await load();
const socket = connectRealtime({
  sessionId,
  onOnline: (reconnected) => {
    $('#offline').hidden = true;
    if (reconnected) load(); // AC-004-02
  },
  onOffline: () => ($('#offline').hidden = false),
  onAuthError: () => goEntry(qr),
});
for (const evt of [
  'order.created',
  'order.status_changed',
  'order.cancelled',
  'session.payment_requested',
  'session.payment_cancelled',
  'session.settled',
  'session.closed',
]) {
  socket?.on(evt, scheduleLoad);
}
