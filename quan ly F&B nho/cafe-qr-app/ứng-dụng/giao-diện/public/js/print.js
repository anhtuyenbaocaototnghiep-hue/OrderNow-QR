// In hóa đơn qua window.print() (DEC-007). Dùng iframe ẩn để in ngay sau thao tác mà không bị chặn popup.
import { toast } from './ui.js';

/** printUrl('/pos/sessions/<id>/receipt?mode=final') — trang receipt tự gọi print() khi có autoprint=1. */
export function printUrl(url) {
  const sep = url.includes('?') ? '&' : '?';
  const frame = document.createElement('iframe');
  frame.title = 'In hóa đơn';
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  frame.src = `${url}${sep}autoprint=1&embed=1&w=${receiptWidth()}`;
  const onMessage = (e) => {
    if (e.source !== frame.contentWindow) return;
    if (e.data?.type === 'receipt-error') toast(e.data.message || 'Không in được hóa đơn', 'error');
    if (e.data?.type === 'receipt-done' || e.data?.type === 'receipt-error') {
      window.removeEventListener('message', onMessage);
      setTimeout(() => frame.remove(), 1000);
    }
  };
  window.addEventListener('message', onMessage);
  document.body.append(frame);
  setTimeout(() => frame.isConnected && frame.remove(), 5 * 60 * 1000);
}

/** Khổ giấy máy in nhiệt của máy POS này (58 hoặc 80 mm), lưu theo trình duyệt. */
export function receiptWidth() {
  try {
    return localStorage.getItem('cf_receipt_width') === '58' ? 58 : 80;
  } catch {
    return 80;
  }
}

export function setReceiptWidth(w) {
  try {
    localStorage.setItem('cf_receipt_width', String(w === 58 ? 58 : 80));
  } catch {
    /* bỏ qua */
  }
}
