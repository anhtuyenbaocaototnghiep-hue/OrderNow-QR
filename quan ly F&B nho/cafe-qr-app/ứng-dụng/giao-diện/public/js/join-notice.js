// ADR-065 D-255 (TASK-127): khách vừa tự vào nhóm của bàn (F-097) thấy dòng "Bạn đã vào nhóm của Bàn …" kèm nút nhỏ
// "Tôi đi riêng — hóa đơn riêng" ở màn chào và đầu thực đơn — tới khi điện thoại này gửi món đầu tiên trong nhóm hoặc bấm ✕.
// Bấm → máy chủ cho điện thoại rời nhóm (không còn xem món / hóa đơn của nhóm đó) và mở nhóm riêng ở cùng bàn; giỏ đang chọn đi theo.
import { api } from './api.js';
import { clearCart, loadCart } from './cart.js';
import { carryCart, setSessionId } from './customer.js';
import { icon } from './icons.js';
import { el, errorMessage, setBusy, toast } from './ui.js';

const key = (qr) => `cf_joined:${qr}`;
const read = (qr) => {
  try {
    return JSON.parse(sessionStorage.getItem(key(qr)));
  } catch {
    return null;
  }
};

/** Ghi nhớ (theo thẻ trình duyệt) điện thoại vừa tự vào nhóm nào — để hiện dòng "đi riêng". */
export function markJoined(qr, sessionId, tableName) {
  try {
    sessionStorage.setItem(key(qr), JSON.stringify({ sessionId, tableName }));
  } catch {
    // trình duyệt chặn lưu tạm → không hiện dòng "đi riêng" (vẫn chia bill được)
  }
}

export function clearJoined(qr) {
  try {
    sessionStorage.removeItem(key(qr));
  } catch {
    // bỏ qua
  }
}

/**
 * Dòng thông báo + nút "Tôi đi riêng — hóa đơn riêng" cho nhóm `sessionId` (null nếu điện thoại không vừa tự vào nhóm này).
 * onSeparate(newSessionId) — trang tự vẽ lại theo nhóm mới.
 */
export function joinedNotice(qr, sessionId, { onSeparate }) {
  const joined = read(qr);
  if (!joined || joined.sessionId !== sessionId) return null;
  const separate = async (button) => {
    setBusy(button, true);
    try {
      const r = await api(`/api/sessions/${sessionId}/separate`, { method: 'POST', body: { qrToken: qr } });
      const lines = loadCart(sessionId);
      if (lines.length) carryCart(qr, lines); // giỏ đang chọn sang nhóm mới
      clearCart(sessionId);
      clearJoined(qr);
      setSessionId(qr, r.session.sessionId);
      onSeparate(r.session.sessionId);
    } catch (err) {
      setBusy(button, false);
      if (err.code === 'ALREADY_ORDERED' || err.code === 'SESSION_CLOSED' || err.code === 'NOT_IN_GROUP') {
        clearJoined(qr);
        box.remove();
      }
      toast(errorMessage(err), 'warning', 6000);
    }
  };
  const box = el(
    'div',
    { class: 'join-notice', role: 'status' },
    el(
      'div',
      { class: 'jn-text' },
      el('strong', {}, `Bạn đã vào nhóm của ${joined.tableName}`),
      el('span', { class: 'small' }, 'Món cả nhóm gọi chung một hóa đơn.'),
    ),
    el(
      'div',
      { class: 'jn-actions' },
      el('button', { class: 'btn btn-sm jn-alone', type: 'button', onclick: (e) => separate(e.currentTarget) }, 'Tôi đi riêng — hóa đơn riêng'),
      el(
        'button',
        {
          class: 'icon-btn',
          type: 'button',
          'aria-label': 'Ẩn dòng này',
          onclick: () => {
            clearJoined(qr);
            box.remove();
          },
        },
        icon('x'),
      ),
    ),
  );
  return box;
}

export const SEPARATED_MESSAGE = 'Đã tạo nhóm riêng cho bạn — món bạn gọi tính vào hóa đơn riêng.';
