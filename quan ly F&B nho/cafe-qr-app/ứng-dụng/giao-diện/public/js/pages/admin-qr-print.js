// Trang in lưới QR để dán lên bàn (FEATURE-010). F-059: có Wi-Fi cho khách trong Cài đặt → mỗi thẻ in thêm QR Wi-Fi (bước ①).
import { staffApi, staffBlobUrl } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { current } from '../auth.js';
import { $, clear, el, errorMessage } from '../ui.js';
import { icon } from '../icons.js';

await mountAdminShell('tables');

clear(
  $('#head-actions'),
  el('a', { class: 'btn', href: '/admin/tables' }, '← Về danh sách bàn'),
  el('button', { class: 'btn btn-primary', type: 'button', onclick: () => window.print() }, icon('printer'), 'In'),
);

/** Khối "① Quét để vào Wi-Fi" — kèm tên / mật khẩu cho máy không quét được (BR-092). */
function wifiBlock(settings, src) {
  return el(
    'div',
    { class: 'qr-wifi' },
    el('div', { class: 'qr-step' }, '① Quét để vào Wi-Fi'),
    el('img', { src, alt: `QR Wi-Fi ${settings.wifiSsid}` }),
    el(
      'div',
      { class: 'small' },
      'Wi-Fi: ',
      el('strong', {}, settings.wifiSsid),
      settings.wifiPassword ? [' · Mật khẩu: ', el('strong', {}, settings.wifiPassword)] : ' · không mật khẩu',
    ),
  );
}

try {
  const [tables, settings] = await Promise.all([staffApi('/api/admin/tables'), staffApi('/api/admin/settings')]);
  const active = tables.filter((t) => t.isActive);
  // Một ảnh QR Wi-Fi dùng chung cho mọi thẻ; tải lỗi (vd. tên Wi-Fi vừa bị xóa ở máy khác) → vẫn in thẻ bàn, không có khối Wi-Fi (review G3)
  const wifiSrc = settings.wifiSsid ? await staffBlobUrl('/api/admin/wifi-qr.png').catch(() => null) : null;
  const wifiWarn =
    settings.wifiSsid && !wifiSrc
      ? el('div', { class: 'alert warning no-print' }, 'Không tải được QR Wi-Fi — thẻ in ra không có Wi-Fi. Tải lại trang để thử lại.')
      : null;
  const cards = await Promise.all(
    active.map(async (t) => {
      const img = el('img', { alt: `QR ${t.name}` });
      img.src = await staffBlobUrl(`/api/admin/tables/${t.tableId}/qr.png`);
      return el(
        'div',
        { class: 'qr-card' },
        el('div', { class: 'small muted' }, current.shop?.name ?? ''),
        el('div', { class: 'tname' }, t.name),
        wifiSrc ? [wifiBlock(settings, wifiSrc), el('div', { class: 'qr-step' }, '② Quét để gọi món')] : null,
        img,
        el('strong', {}, 'Quét mã để xem thực đơn & gọi món'),
        el('div', { class: 'small muted' }, 'Thanh toán tiền mặt hoặc chuyển khoản — bấm "Gọi thanh toán" khi xong'),
      );
    }),
  );
  clear($('#content'), wifiWarn, active.length ? el('div', { class: 'qr-grid' }, cards) : el('div', { class: 'empty card' }, 'Không có bàn đang hoạt động.'));
} catch (err) {
  clear($('#content'), el('div', { class: 'alert danger' }, errorMessage(err)));
}
