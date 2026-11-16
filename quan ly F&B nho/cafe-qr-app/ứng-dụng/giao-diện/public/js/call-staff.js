// F-021 Gọi nhân viên — hộp chọn nhanh yêu cầu (hoặc ghi chú) dùng chung: trang Theo dõi đơn và màn chào khi quét QR (F-092).
// Quầy nhận dải "Gọi nhân viên" + chuông; mỗi phiên gọi lại được sau 60 giây (máy chủ trả 429 TOO_SOON kèm retryAfter).
import { api } from './api.js';
import { el, errorMessage, modal, toast } from './ui.js';

export const CALL_COOLDOWN_MS = 60 * 1000;
export const CALL_CHOICES = ['Xin nước lọc', 'Xin thêm đá', 'Xin khăn giấy', 'Dọn bàn'];

/** Mở hộp, gửi yêu cầu. → { sent: true } | { sent: false, retryAfter: số giây còn phải chờ | null } (bấm Hủy: retryAfter null). */
export async function callStaffSheet(sessionId) {
  const other = el('input', { class: 'input', maxlength: 100, placeholder: 'Yêu cầu khác (không bắt buộc)', 'aria-label': 'Yêu cầu khác' });
  let chosen = CALL_CHOICES[0];
  const chips = el(
    'div',
    { class: 'note-chips' },
    CALL_CHOICES.map((c, i) =>
      el(
        'button',
        {
          class: 'chip',
          type: 'button',
          'aria-pressed': String(i === 0),
          onclick: (e) => {
            chosen = c;
            chips.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
          },
        },
        c,
      ),
    ),
  );
  const ok = await modal({
    title: 'Gọi nhân viên',
    sheet: true,
    body: el('div', { class: 'stack' }, el('p', { class: 'small muted' }, 'Chọn nhanh yêu cầu của bạn:'), chips, other),
    actions: [
      { label: 'Hủy', value: false },
      { label: 'Gọi nhân viên', class: 'btn-primary', value: true },
    ],
  }).result;
  if (ok !== true) return { sent: false, retryAfter: null };
  try {
    await api(`/api/sessions/${sessionId}/call-staff`, { method: 'POST', body: { message: other.value.trim() || chosen } });
    toast('Đã gọi nhân viên, vui lòng chờ trong giây lát.', 'success');
    return { sent: true };
  } catch (err) {
    toast(errorMessage(err), err.status === 429 ? 'warning' : 'error');
    return { sent: false, retryAfter: err.code === 'TOO_SOON' ? (err.details?.retryAfter ?? 60) : null };
  }
}
