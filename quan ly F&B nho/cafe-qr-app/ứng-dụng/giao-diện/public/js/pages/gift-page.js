// SCR-50 trang quà ly tặng (FEATURE-070, ADR-028 D-114): ai có link là người được tặng — thấy món, lời nhắn, mã nhận ly.
// "Gửi cho bạn" dùng bảng chia sẻ của điện thoại (Zalo, Messenger, tin nhắn — tài khoản của khách, quán không tốn phí); ?in=1 → in phiếu.
import { api } from '../api.js';
import { $, clear, dateOnly, el, errorMessage, toast } from '../ui.js';
import { icon } from '../icons.js';

const token = location.pathname.split('/').pop();
const STATUS = { USED: 'Ly tặng này đã được dùng', EXPIRED: 'Ly tặng này đã hết hạn', CANCELLED: 'Ly tặng này đã bị hủy' };

async function copy(text, ok) {
  try {
    await navigator.clipboard.writeText(text);
    toast(ok, 'success');
  } catch {
    toast('Không chép được — hãy chụp màn hình gửi bạn', 'warning');
  }
}

try {
  const g = await api(`/api/gifts/${encodeURIComponent(token)}`);
  $('#shop').textContent = g.shopName;
  document.title = `Ly tặng — ${g.shopName}`;
  const from = g.giverName ? `${g.giverName} tặng bạn` : 'Bạn được tặng';
  const link = location.href.split('?')[0];
  const text = `${from} 1 ${g.menuItemName} ở ${g.shopName}. Đọc mã ${g.code} ở quầy, dùng đến hết ${dateOnly(g.expiresAt)}.${g.message ? ` Lời nhắn: "${g.message}"` : ''}`;
  async function share() {
    const data = { title: `Ly tặng ở ${g.shopName}`, text, url: link };
    if (navigator.share) {
      try {
        await navigator.share(data);
      } catch {
        /* khách đóng bảng chia sẻ */
      }
      return;
    }
    await copy(`${text} ${link}`, 'Đã chép lời nhắn kèm link — dán vào Zalo để gửi');
  }
  const ready = g.status === 'READY';
  clear(
    $('#main'),
    el(
      'section',
      { class: `gift-card${ready ? '' : ' off'}`, 'aria-labelledby': 'gift-title' },
      el('div', { class: 'gift-icon' }, icon('gift')),
      el('h1', { id: 'gift-title' }, `${from} 1 ${g.menuItemName}`),
      g.message ? el('blockquote', { class: 'gift-msg' }, `“${g.message}”`) : null,
      ready
        ? [
            el('div', { class: 'small muted' }, 'Mã nhận ly'),
            el('div', { class: 'gift-code', id: 'gift-code' }, g.code),
            el('p', { class: 'small' }, `Tới ${g.shopName}, gọi món này và đọc mã cho nhân viên. Dùng đến hết ${dateOnly(g.expiresAt)}.`),
          ]
        : el('div', { class: 'alert warning', role: 'status' }, `${STATUS[g.status]}${g.status === 'USED' && g.usedAt ? ` (${dateOnly(g.usedAt)})` : ''}.`),
    ),
    ready
      ? el(
          'div',
          { class: 'stack no-print gift-actions' },
          el('button', { class: 'btn btn-primary btn-block', type: 'button', id: 'gift-share', onclick: share }, 'Gửi cho bạn'),
          el('button', { class: 'btn btn-block', type: 'button', onclick: () => copy(text, 'Đã chép lời nhắn') }, 'Chép lời nhắn'),
          el('p', { class: 'small muted center' }, 'Gửi bằng Zalo, Messenger hay tin nhắn của bạn — quán không thu phí.'),
        )
      : null,
  );
  if (new URLSearchParams(location.search).get('in') === '1' && ready) setTimeout(() => window.print(), 300);
} catch (err) {
  clear($('#main'), el('div', { class: 'alert danger' }, errorMessage(err)));
}
