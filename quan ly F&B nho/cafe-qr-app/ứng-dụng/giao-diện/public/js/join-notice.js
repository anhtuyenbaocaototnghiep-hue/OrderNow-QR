// ADR-065 D-255 (TASK-127) + TASK-128 (chủ quán: "khó thấy quá… làm lại sao cho đơn giản khách dễ thấy và thao tác"):
// khách vừa tự vào nhóm của bàn (F-097) thấy THẺ NỔI BẬT đầu trang (màn chào / thực đơn):
//   "Bàn 05 đang có khách — Bạn đi chung hay đi riêng?"  [👥 Đi chung · chung một hóa đơn]  [👤 Đi riêng · hóa đơn riêng]
// Không bắt bấm: gọi món luôn = đi chung (nhóm bạn bè không thêm bước). Thẻ mất khi đã chọn hoặc điện thoại gửi món trong nhóm.
// "Đi riêng" → máy chủ cho điện thoại rời nhóm (không còn xem món / hóa đơn của nhóm đó), mở nhóm riêng ở cùng bàn; giỏ đi theo.
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

/** Ghi nhớ (theo thẻ trình duyệt) điện thoại vừa tự vào nhóm nào — để hỏi "đi chung hay đi riêng". */
export function markJoined(qr, sessionId, tableName) {
  try {
    sessionStorage.setItem(key(qr), JSON.stringify({ sessionId, tableName }));
  } catch {
    // trình duyệt chặn lưu tạm → không hỏi (vẫn chia bill được)
  }
}

export function clearJoined(qr) {
  try {
    sessionStorage.removeItem(key(qr));
  } catch {
    // bỏ qua
  }
}

export const SEPARATED_MESSAGE = 'Bạn đã có hóa đơn riêng — món bạn gọi tính riêng.';

/**
 * Thẻ "Bạn đi chung hay đi riêng?" cho nhóm `sessionId` (null nếu điện thoại không vừa tự vào nhóm này).
 * onSeparate(newSessionId) — trang tự vẽ lại theo nhóm mới.
 */
export function togetherCard(qr, sessionId, { onSeparate }) {
  const joined = read(qr);
  if (!joined || joined.sessionId !== sessionId) return null;
  const done = () => {
    clearJoined(qr);
    card.remove();
  };
  const choice = (cls, iconName, label, sub, onclick) =>
    el(
      'button',
      { class: `tc-btn ${cls}`, type: 'button', onclick },
      el('span', { class: 'tc-ic', 'aria-hidden': 'true' }, icon(iconName)),
      el('strong', {}, label),
      el('span', { class: 'tc-sub' }, sub),
    );
  const together = choice('tc-together', 'users', 'Đi chung', 'chung một hóa đơn', () => {
    done();
    toast(`Bạn đi chung với nhóm ở ${joined.tableName} — gọi món chung một hóa đơn.`, 'success', 4000);
  });
  const alone = choice('tc-alone', 'user', 'Đi riêng', 'hóa đơn riêng', async (e) => {
    const button = e.currentTarget;
    setBusy(button, true);
    together.disabled = true;
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
      together.disabled = false;
      if (err.code === 'ALREADY_ORDERED' || err.code === 'SESSION_CLOSED' || err.code === 'NOT_IN_GROUP') done();
      toast(errorMessage(err), 'warning', 6000);
    }
  });
  const card = el(
    'section',
    { class: 'together-card', 'aria-label': 'Đi chung hay đi riêng' },
    el('p', { class: 'tc-title' }, `${joined.tableName} đang có khách`),
    el('p', { class: 'tc-ask' }, 'Bạn đi chung hay đi riêng?'),
    el('div', { class: 'tc-choices' }, together, alone),
  );
  return card;
}
