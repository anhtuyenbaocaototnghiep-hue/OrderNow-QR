// F-070 ly treo (ADR-028 D-112…D-114): hộp "Bán ly tặng" ở quầy — thu đúng giá món hiện tại, tạo mã + QR trang quà
// để khách quét bằng điện thoại và tự gửi cho bạn (nút chia sẻ — không tốn phí). Tiền mặt máy chủ tự ghi Sổ quỹ.
import { staffApi } from './api.js';
import { clear, dateOnly, el, errorMessage, modal, money, setBusy, toast } from './ui.js';
import { icon } from './icons.js';

const field = (label, input) => el('div', { class: 'field' }, el('label', { for: input.id }, label), input);

/** Gắn nút "Bán ly tặng" vào `slot` khi quản lý đã bật ly tặng (không bật → không hiện gì). */
export async function mountGiftSell(slot) {
  let cfg;
  try {
    cfg = await staffApi('/api/gift-drinks/config');
  } catch {
    return;
  }
  if (!cfg.enabled || !cfg.items.length) return;
  slot.append(el('button', { class: 'btn btn-sm', type: 'button', id: 'gift-sell', onclick: () => open(cfg) }, icon('gift'), 'Bán ly tặng'));
}

function open(cfg) {
  const item = el(
    'select',
    { class: 'input', id: 'gift-item' },
    cfg.items.map((i) => el('option', { value: i.menuItemId }, `${i.name} — ${money(i.price)}`)),
  );
  const giver = el('input', { class: 'input', id: 'gift-giver', maxlength: 60, autocomplete: 'off', placeholder: 'Ví dụ: Lan' });
  const message = el('textarea', { class: 'input', id: 'gift-message', maxlength: 150, rows: 2, placeholder: 'Ví dụ: Chúc mừng sinh nhật!' });
  let method = 'CASH';
  const methods = el('div', { class: 'row', role: 'group', 'aria-labelledby': 'gift-method-label' });
  for (const [key, label] of [
    ['CASH', 'Tiền mặt'],
    ['TRANSFER', 'Chuyển khoản'],
  ]) {
    methods.append(
      el(
        'button',
        {
          class: 'btn',
          type: 'button',
          'aria-pressed': String(method === key),
          onclick: (e) => {
            method = key;
            for (const b of methods.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
          },
        },
        label,
      ),
    );
  }
  const priceOf = () => cfg.items.find((i) => String(i.menuItemId) === item.value)?.price ?? 0;
  const sellBtn = el('button', { class: 'btn btn-primary btn-block', type: 'button' });
  const setLabel = () => (sellBtn.textContent = `Thu ${money(priceOf())} & tạo mã`);
  item.addEventListener('change', setLabel);
  setLabel();
  const body = el(
    'div',
    { class: 'stack gift-sell' },
    el(
      'p',
      { class: 'small muted' },
      `Khách trả trước 1 ly cho bạn. Quầy tạo mã, khách quét QR để gửi cho bạn qua Zalo. Bạn tới quán đọc mã là nhận ly. Mã dùng được ${cfg.validDays} ngày.`,
    ),
    field('Món tặng', item),
    field('Người tặng (không bắt buộc)', giver),
    field('Lời nhắn (không bắt buộc)', message),
    el('div', { class: 'field' }, el('div', { class: 'birth-label', id: 'gift-method-label' }, 'Thu bằng'), methods),
    sellBtn,
  );
  const m = modal({ title: 'Bán ly tặng', body });
  sellBtn.addEventListener('click', async () => {
    setBusy(sellBtn, true);
    try {
      const g = await staffApi('/api/gift-drinks', {
        method: 'POST',
        body: { menuItemId: Number(item.value), giverName: giver.value.trim() || null, message: message.value.trim() || null, method },
      });
      showResult(body, g, m);
    } catch (err) {
      setBusy(sellBtn, false);
      toast(errorMessage(err), 'error');
    }
  });
}

function showResult(body, g, m) {
  clear(
    body,
    el('div', { class: 'alert success' }, `Đã thu ${money(g.amount)} — ${g.method === 'CASH' ? 'tiền mặt, đã ghi Sổ quỹ' : 'chuyển khoản'}.`),
    el(
      'div',
      { class: 'gift-result' },
      el('div', { class: 'small muted' }, `Ly tặng: 1 ${g.menuItemName}${g.giverName ? ` · ${g.giverName} tặng` : ''}`),
      el('div', { class: 'gift-code', id: 'gift-code' }, g.code),
      el('img', { class: 'gift-qr', src: g.qr, alt: 'QR trang quà', width: 200, height: 200 }),
      el('p', { class: 'small' }, 'Khách quét QR bằng điện thoại để mở thẻ quà, rồi bấm "Gửi cho bạn" (Zalo, Messenger…) — không tốn phí.'),
      el('p', { class: 'small muted' }, `Dùng đến hết ${dateOnly(g.expiresAt)} · người nhận đọc mã ở quầy`),
    ),
    el(
      'div',
      { class: 'row wrap' },
      el('a', { class: 'btn', href: `/qua/${g.token}?in=1`, target: '_blank', rel: 'noopener' }, icon('printer'), 'In phiếu'),
      el('button', { class: 'btn btn-primary', type: 'button', onclick: () => m.close() }, 'Xong'),
    ),
  );
}
