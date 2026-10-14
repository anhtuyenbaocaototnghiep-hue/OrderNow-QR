// S-12 In hóa đơn: /pos/sessions/{id}/receipt?mode=final|provisional (phiên) hoặc /pos/orders/{id}/receipt (mang đi).
// Bản tạm tính có chữ TẠM TÍNH (BR-014). ?autoprint=1 → tự gọi window.print(); ?embed=1 → báo trang cha qua postMessage.
import { staffApi } from '../api.js';
import { receiptWidth, setReceiptWidth } from '../print.js';
import { $, clear, dateTime, el, errorMessage, money } from '../ui.js';

const params = new URLSearchParams(location.search);
const [, , kind, id] = location.pathname.split('/'); // /pos/sessions/:id/receipt | /pos/orders/:id/receipt
const mode = params.get('mode') === 'provisional' ? 'provisional' : 'final';
const embed = params.get('embed') === '1';
let width = Number(params.get('w')) === 58 ? 58 : Number(params.get('w')) === 80 ? 80 : receiptWidth();

const notifyParent = (msg) => embed && window.parent !== window && window.parent.postMessage(msg, location.origin);

function applyWidth() {
  $('#page-size').textContent = `@page { size: ${width}mm auto; margin: 0; }`;
  $('#receipt').classList.toggle('w58', width === 58);
  document.querySelectorAll('input[name="w"]').forEach((r) => (r.checked = Number(r.value) === width));
}

function kv(label, value, cls = '') {
  return el('div', { class: `kv ${cls}` }, el('span', {}, label), el('span', {}, value));
}

function render(data) {
  const provisional = data.mode === 'provisional';
  const where = data.kind === 'session' ? `${data.table.name} · Phiên ${data.session.code}` : `Mang đi · Đơn #${data.order.orderCode}`;
  clear(
    $('#receipt'),
    provisional ? el('div', { class: 'watermark', 'aria-hidden': 'true' }, 'TẠM TÍNH') : null,
    el('h1', {}, data.shop.name),
    data.shop.address ? el('div', { class: 'center' }, data.shop.address) : null,
    el('div', { class: 'title' }, provisional ? 'PHIẾU TẠM TÍNH' : 'HÓA ĐƠN THANH TOÁN'),
    el('div', { class: 'center' }, where),
    data.kind === 'session'
      ? el('div', { class: 'center' }, `Giờ vào: ${dateTime(data.session.openedAt)}`)
      : el('div', { class: 'center' }, `Giờ đặt: ${dateTime(data.order.createdAt)}`),
    el('div', { class: 'center' }, `Đơn: ${data.orders.map((o) => '#' + o.orderCode).join(', ')}`),
    el('hr'),
    el(
      'table',
      {},
      el(
        'tbody',
        {},
        data.lines.map((l) => [
          el('tr', {}, el('td', {}, l.name), el('td', { class: 'q' }, `x${l.quantity}`), el('td', { class: 'm' }, money(l.lineTotal))),
          l.note ? el('tr', {}, el('td', { class: 'note', colspan: 3 }, `  (${l.note})`)) : null,
        ]),
      ),
    ),
    el('hr'),
    kv('TỔNG CỘNG', money(data.amountDue), 'total'),
    data.payment
      ? [
          kv('Tiền khách đưa', money(data.payment.amountReceived)),
          kv('Tiền thừa', money(data.payment.changeGiven)),
          kv('Thanh toán', 'Tiền mặt'),
          kv('Thu ngân', data.payment.receivedBy.fullName),
          kv('Thời gian', dateTime(data.payment.paidAt)),
        ]
      : el('div', { class: 'center' }, 'Chưa thanh toán — thanh toán bằng tiền mặt'),
    el('hr'),
    el('div', { class: 'center' }, provisional ? 'Phiếu này không phải hóa đơn thanh toán' : 'Cảm ơn quý khách! Hẹn gặp lại.'),
    el('div', { class: 'center' }, `In lúc ${dateTime(data.printedAt)}`),
  );
}

async function main() {
  applyWidth();
  try {
    const url = kind === 'sessions' ? `/api/sessions/${id}/receipt?mode=${mode}` : `/api/orders/${id}/receipt`;
    const data = await staffApi(url);
    render(data);
    applyWidth();
    document.title = `${data.mode === 'provisional' ? 'Tạm tính' : 'Hóa đơn'} — ${data.kind === 'session' ? data.table.name : data.order.orderCode}`;
    if (params.get('autoprint') === '1') {
      window.addEventListener('afterprint', () => notifyParent({ type: 'receipt-done' }), { once: true });
      setTimeout(() => window.print(), 150);
    }
  } catch (err) {
    clear($('#receipt'), el('p', { class: 'err' }, errorMessage(err)));
    notifyParent({ type: 'receipt-error', message: errorMessage(err) });
  }
}

document.querySelectorAll('input[name="w"]').forEach((r) =>
  r.addEventListener('change', () => {
    width = Number(r.value);
    setReceiptWidth(width);
    applyWidth();
  }),
);
$('#print').addEventListener('click', () => window.print());
$('#close').addEventListener('click', () => (history.length > 1 ? history.back() : window.close()));

main();
