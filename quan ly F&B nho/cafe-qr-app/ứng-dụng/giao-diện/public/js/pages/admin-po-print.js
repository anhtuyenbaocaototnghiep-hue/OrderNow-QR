// In / chép đơn đặt hàng (FEATURE-030): /admin/purchase-orders/{id}/print.
import { staffApi } from '../api.js';
import { current, requireStaffPage } from '../auth.js';
import { $, clear, dateTime, el, errorMessage, money, num, toast } from '../ui.js';

await requireStaffPage({ admin: true });
const id = Number(location.pathname.split('/')[3]);
const fmtDate = (d) => (d ? d.split('-').reverse().join('/') : '—');

try {
  const po = await staffApi(`/api/admin/purchase-orders/${id}`);
  document.title = `Đơn đặt hàng #${po.poId} — ${po.supplierName}`;
  clear(
    $('#sheet'),
    el('h1', {}, current.shop?.name ?? 'Quán cà phê'),
    current.shop?.address ? el('div', { class: 'muted' }, current.shop.address) : null,
    el('h2', {}, `ĐƠN ĐẶT HÀNG #${po.poId}`),
    el('div', {}, `Gửi: ${po.supplierName}`),
    el('div', {}, `Ngày đặt: ${dateTime(po.sentAt ?? po.createdAt)} · Ngày giao mong muốn: ${fmtDate(po.expectedDate)}`),
    el(
      'table',
      { class: 'table' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          ['#', 'Hàng', 'Số lượng', 'Đơn giá', 'Thành tiền'].map((h) => el('th', {}, h)),
        ),
      ),
      el(
        'tbody',
        {},
        po.lines.map((l, k) =>
          el(
            'tr',
            {},
            el('td', {}, k + 1),
            el('td', {}, l.name),
            el('td', {}, `${num(l.orderedPacks)} ${l.packUnitCode}`),
            el('td', { class: 'num' }, l.unitPrice === null ? '' : money(l.unitPrice)),
            el('td', { class: 'num' }, l.unitPrice === null ? '' : money(l.unitPrice * l.orderedPacks)),
          ),
        ),
      ),
    ),
    el('div', { class: 'due' }, el('span', {}, 'Tổng dự kiến'), el('span', {}, money(po.total))),
    po.note ? el('p', {}, `Ghi chú: ${po.note}`) : null,
  );
  const text = [
    `ĐƠN ĐẶT HÀNG #${po.poId} — ${current.shop?.name ?? ''}`,
    `Giao mong muốn: ${fmtDate(po.expectedDate)}`,
    ...po.lines.map((l) => `- ${l.name}: ${num(l.orderedPacks)} ${l.packUnitCode}${l.unitPrice ? ` × ${money(l.unitPrice)}` : ''}`),
    `Tổng dự kiến: ${money(po.total)}`,
    po.note ? `Ghi chú: ${po.note}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  $('#copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Đã chép — dán vào Zalo gửi nhà cung cấp', 'success');
    } catch {
      toast('Trình duyệt không cho chép tự động — hãy bôi đen và chép tay', 'warning');
    }
  });
} catch (err) {
  clear($('#sheet'), el('div', { class: 'alert danger' }, errorMessage(err)));
}
$('#print').addEventListener('click', () => window.print());
