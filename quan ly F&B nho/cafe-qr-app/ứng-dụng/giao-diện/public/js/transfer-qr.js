// F-099 (ADR-062): khung mã VietQR chuyển khoản — dùng chung cho điện thoại khách (Theo dõi đơn), hộp Thu tiền và Bán mang đi ở quầy.
// Mã do máy chủ của quán tạo (có sẵn số tiền + nội dung riêng của bàn). Đã trả CHỈ do nhân viên ghi khi thấy tiền vào (D-248).
import { el, modal, money, toast } from './ui.js';

/** Chép chữ — trang chạy http trong Wi-Fi quán thì không có navigator.clipboard (chỉ https / localhost) → dùng cách cũ. */
export async function copyText(text, done = 'Đã chép') {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const box = el('textarea', { readonly: true, 'aria-hidden': 'true', style: { position: 'fixed', top: '-200px', left: '0', opacity: '0' } });
      box.value = text;
      document.body.append(box);
      box.select();
      const ok = document.execCommand('copy');
      box.remove();
      if (!ok) throw new Error('copy');
    }
    toast(done, 'success', 2000);
  } catch {
    toast('Không chép được — giữ ngón tay lên chữ để chép', 'warning');
  }
}

/** Khung mã + người nhận. data = GET /api/sessions/{id}/transfer hoặc POST /api/payments/transfer-qr.
 *  Nhãn nằm trên giá trị (không cạnh nhau) — số tài khoản / số thẻ có cả bề ngang, không bị ngắt giữa số ở màn 320–390 px. */
export function transferPanel(data, { saveName = 'VietQR', big = false } = {}) {
  const row = (label, value, copy) =>
    el(
      'div',
      { class: 'tq-row' },
      el('div', { class: 'tq-text' }, el('span', { class: 'tq-label' }, label), el('strong', { class: 'tq-value' }, value)),
      copy
        ? el(
            'button',
            {
              class: 'btn btn-sm tq-copy',
              type: 'button',
              'aria-label': `Chép ${label.toLowerCase()}`,
              onclick: () => copyText(copy, `Đã chép ${label.toLowerCase()}`),
            },
            'Chép',
          )
        : null,
    );
  const size = big ? 320 : 220;
  return el(
    'div',
    { class: `transfer-panel${big ? ' big' : ''}` },
    el('img', { class: 'tq-img', src: data.qr, alt: `Mã VietQR chuyển ${money(data.amount)} tới ${data.bankName}`, width: size, height: size }),
    el('div', { class: 'tq-amount' }, money(data.amount)),
    el(
      'div',
      { class: 'tq-rows' },
      row('Ngân hàng', data.bankName),
      row(data.kind === 'CARD' ? 'Số thẻ' : 'Số tài khoản', data.number, String(data.number).replace(/\s/g, '')),
      row('Chủ tài khoản', data.holder),
      row('Số tiền', money(data.amount), String(data.amount)),
      row('Nội dung', data.content, data.content),
    ),
    el('a', { class: 'btn tq-save', href: data.qr, download: `${saveName}.png` }, 'Lưu ảnh mã QR'),
  );
}

/**
 * Khung mã nhỏ ở hộp Thu tiền / Bán mang đi: mã + từng dòng số tiền, ngân hàng · số, nội dung (DEF-032 — trước dính liền
 * "29.000đSacombank…") + "Phóng to cho khách quét"; có onPrint → thêm "In bill có mã QR" (TASK-125).
 */
export function smallQrBox(d, { onPrint = null } = {}) {
  return [
    el('img', { src: d.qr, alt: `Mã VietQR chuyển ${money(d.amount)}`, width: 132, height: 132 }),
    el(
      'div',
      { class: 'tq-side small' },
      el('strong', {}, `Khách quét mã — ${money(d.amount)}`),
      el('div', {}, `${d.bankName} · ${d.number}`),
      el('div', { class: 'muted' }, `Nội dung: ${d.content}`),
      el(
        'div',
        { class: 'tq-actions' },
        el('button', { class: 'btn btn-sm', type: 'button', onclick: () => showBigQr(d) }, 'Phóng to cho khách quét'),
        onPrint ? el('button', { class: 'btn btn-sm', type: 'button', onclick: onPrint }, 'In bill có mã QR') : null,
      ),
    ),
  ];
}

/** Phóng to mã cho khách quét (màn quầy quay về phía khách) — gọn: mã to + số tiền + người nhận + nội dung, vừa vùng Quầy 768 px. */
export const showBigQr = (data, title = 'Khách quét mã để chuyển khoản') =>
  modal({
    title,
    body: el(
      'div',
      { class: 'transfer-panel big' },
      el('img', { class: 'tq-img', src: data.qr, alt: `Mã VietQR chuyển ${money(data.amount)} tới ${data.bankName}`, width: 280, height: 280 }),
      el('div', { class: 'tq-amount' }, money(data.amount)),
      el('div', { class: 'center' }, `${data.bankName} · ${data.number}`),
      el('div', { class: 'center' }, el('strong', {}, data.holder)),
      el('div', { class: 'center muted' }, `Nội dung: ${data.content}`),
    ),
    actions: [{ label: 'Đóng', value: null }],
  });
