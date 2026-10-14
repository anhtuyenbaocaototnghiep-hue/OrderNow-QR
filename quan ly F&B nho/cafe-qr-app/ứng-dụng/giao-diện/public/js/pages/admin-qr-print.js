// Trang in lưới QR để dán lên bàn (FEATURE-010).
import { staffApi, staffBlobUrl } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { current } from '../auth.js';
import { $, clear, el, errorMessage } from '../ui.js';

await mountAdminShell('tables');

clear(
  $('#head-actions'),
  el('a', { class: 'btn', href: '/admin/tables' }, '← Về danh sách bàn'),
  el('button', { class: 'btn btn-primary', type: 'button', onclick: () => window.print() }, '🖨 In'),
);

try {
  const tables = (await staffApi('/api/admin/tables')).filter((t) => t.isActive);
  const cards = await Promise.all(
    tables.map(async (t) => {
      const img = el('img', { alt: `QR ${t.name}` });
      img.src = await staffBlobUrl(`/api/admin/tables/${t.tableId}/qr.png`);
      return el(
        'div',
        { class: 'qr-card' },
        el('div', { class: 'small muted' }, current.shop?.name ?? ''),
        el('div', { class: 'tname' }, t.name),
        img,
        el('strong', {}, 'Quét mã để xem thực đơn & gọi món'),
        el('div', { class: 'small muted' }, 'Thanh toán tiền mặt tại bàn — bấm "Gọi thanh toán" khi xong'),
      );
    }),
  );
  clear($('#content'), tables.length ? el('div', { class: 'qr-grid' }, cards) : el('div', { class: 'empty card' }, 'Không có bàn đang hoạt động.'));
} catch (err) {
  clear($('#content'), el('div', { class: 'alert danger' }, errorMessage(err)));
}
