// S-12 In hóa đơn: /pos/sessions/{id}/receipt?mode=final|provisional (phiên), /pos/orders/{id}/receipt (mang đi),
// /pos/payments/{id}/receipt (một phần chia bill — F-026).
// ADR-019: ghi cách trả (tiền mặt / chuyển khoản — F-056); bill thu chung nhiều bàn in món theo từng bàn (F-057, ?merge= khi tạm tính).
// Bản tạm tính có chữ TẠM TÍNH (BR-014). ?autoprint=1 → tự gọi window.print(); ?embed=1 → báo trang cha qua postMessage.
import { staffApi } from '../api.js';
import { receiptWidth, setReceiptWidth } from '../print.js';
import { $, clear, dateOnly, dateTime, el, errorMessage, money, voucherValue } from '../ui.js';

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

/** Dòng món của bill; thu chung nhiều bàn (F-057) → nhóm theo bàn, mỗi bàn một dòng tiêu đề. */
function lineGroups(data) {
  if (!(data.tables?.length > 1)) return [{ table: null, lines: data.lines }];
  const groups = new Map(data.tables.map((t) => [t, []]));
  for (const l of data.lines) (groups.get(l.table) ?? groups.set(l.table, []).get(l.table)).push(l);
  return [...groups].filter(([, lines]) => lines.length).map(([table, lines]) => ({ table, lines }));
}

function render(data) {
  const provisional = data.mode === 'provisional';
  const tableNames = data.tables?.length > 1 ? data.tables.join(' + ') : data.table?.name;
  const where =
    data.kind === 'session'
      ? `${tableNames} · Phiên ${data.session.code}${data.splitLabel ? ` · Phần: ${data.splitLabel}` : ''}`
      : `Mang đi · Đơn #${data.order.orderCode}`;
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
        lineGroups(data).map((g) => [
          g.table ? el('tr', { class: 'group' }, el('td', { colspan: 3 }, el('strong', {}, g.table))) : null,
          g.lines.map((l) => [
            el('tr', {}, el('td', {}, l.name), el('td', { class: 'q' }, `x${l.quantity}`), el('td', { class: 'm' }, money(l.lineTotal))),
            l.options?.length ? el('tr', {}, el('td', { class: 'note', colspan: 3 }, `  + ${l.options.join(', ')}`)) : null,
            (l.children ?? []).map((c) =>
              el('tr', { class: 'child' }, el('td', {}, `  · ${c.name}`), el('td', { class: 'q' }, `x${c.quantity}`), el('td', { class: 'm' }, money(0))),
            ),
            l.listPrice > l.unitPrice
              ? el('tr', {}, el('td', { class: 'note', colspan: 3 }, `  ${l.promotionName ?? 'Khuyến mãi'} (giá gốc ${money(l.listPrice)})`))
              : null,
            l.note ? el('tr', {}, el('td', { class: 'note', colspan: 3 }, `  (${l.note})`)) : null,
          ]),
        ]),
      ),
    ),
    el('hr'),
    // ADR-005: tạm tính − khuyến mãi − hội viên − giảm giá − làm tròn (số do server tính)
    (data.breakdown ?? []).filter((b) => b.key !== 'total' && !b.info && data.breakdown.length > 2).map((b) => kv(b.label, money(b.amount))),
    kv(provisional && data.breakdown?.length > 2 ? 'TỔNG CỘNG (dự kiến)' : 'TỔNG CỘNG', money(data.amountDue), 'total'),
    // F-039: điểm / tem vừa tích
    (data.breakdown ?? []).filter((b) => b.info).map((b) => kv(b.label, '')),
    data.payment
      ? [
          // F-056: chuyển khoản không có tiền khách đưa / tiền thừa
          data.payment.method === 'TRANSFER' ? null : kv('Tiền khách đưa', money(data.payment.amountReceived)),
          data.payment.method === 'TRANSFER' ? null : kv('Tiền thừa', money(data.payment.changeGiven)),
          kv('Thanh toán', data.payment.method === 'TRANSFER' ? 'Chuyển khoản' : 'Tiền mặt'),
          kv('Thu ngân', data.payment.receivedBy.fullName),
          data.payment.member ? kv('Hội viên', data.payment.member.fullName) : null,
          data.payment.refunded > 0 ? kv('Đã hoàn tiền', money(data.payment.refunded)) : null,
          kv('Thời gian', dateTime(data.payment.paidAt)),
        ]
      : data.splitPayments
        ? [
            kv('Đã thu theo phần', `${data.splitPayments.length} lượt`),
            data.splitPayments.map((p, i) => kv(`  Phần ${i + 1} · ${dateTime(p.paidAt)}`, money(p.amountDue))),
          ]
        : el('div', { class: 'center' }, 'Chưa thanh toán — thanh toán bằng tiền mặt hoặc chuyển khoản'),
    // F-047 (ADR-008 D-38): quyền lợi hội viên lúc in — điểm hiện có, thẻ tem, voucher còn hạn
    data.memberCard
      ? [
          el('hr'),
          el('div', { class: 'center' }, 'THẺ THÀNH VIÊN (lúc in)'),
          kv('Điểm hiện có', `${data.memberCard.points} điểm`),
          data.memberCard.stampCards.map((t) => el('div', { class: 'note' }, t)),
          data.memberCard.vouchers.length
            ? [
                el('div', {}, `Voucher còn hạn (${data.memberCard.vouchers.length}):`),
                data.memberCard.vouchers.map((v) => el('div', { class: 'note' }, `  ${voucherValue(v)} · HSD ${dateOnly(v.expiresAt)}`)),
              ]
            : null,
        ]
      : null,
    el('hr'),
    el('div', { class: 'center' }, provisional ? 'Phiếu này không phải hóa đơn thanh toán' : 'Cảm ơn quý khách! Hẹn gặp lại.'),
    el('div', { class: 'center' }, `In lúc ${dateTime(data.printedAt)}`),
  );
}

async function main() {
  applyWidth();
  try {
    const url =
      kind === 'sessions'
        ? `/api/sessions/${id}/receipt?mode=${mode}${params.get('merge') ? `&merge=${encodeURIComponent(params.get('merge'))}` : ''}`
        : kind === 'payments'
          ? `/api/payments/${id}/receipt`
          : `/api/orders/${id}/receipt`;
    const data = await staffApi(url);
    render(data);
    applyWidth();
    document.title = `${data.mode === 'provisional' ? 'Tạm tính' : 'Hóa đơn'} — ${data.kind === 'session' ? (data.tables ?? [data.table.name]).join(' + ') : data.order.orderCode}`;
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
