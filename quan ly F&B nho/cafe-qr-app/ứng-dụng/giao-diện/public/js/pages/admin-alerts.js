// SCR-47 Cảnh báo bất thường (FEATURE-060, ADR-020 D-75…D-78): dấu hiệu thất thoát app tự phát hiện lúc đóng ca / hoàn tiền lớn /
// hủy – sửa khoản sổ quỹ đã duyệt. Chỉ quản lý (server kiểm quyền); cảnh báo mới tới qua phòng realtime `admin`.
// Cảnh báo là gợi ý để kiểm tra, không kết luận ai sai — nút "Nhật ký thao tác" mở đúng khoảng giờ / người liên quan.
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { getToken } from '../auth.js';
import { connectRealtime } from '../socket.js';
import { $, clear, dateTime, el, errorMessage, modal, money, setBusy, toast } from '../ui.js';

await mountAdminShell('alerts');

const KIND = {
  CASH_DIFF: 'Lệch két',
  TRANSFER_SHARE: 'Tỉ lệ chuyển khoản',
  VOIDS: 'Hủy món đã pha',
  REFUNDS: 'Hoàn tiền nhiều',
  MANUAL_DISCOUNT: 'Giảm giá tay nhiều',
  BIG_REFUND: 'Hoàn tiền lớn',
  CASH_VOID: 'Sửa / hủy sổ quỹ',
};
const STATUS = { NEW: 'Mới', SEEN: 'Đã xem', RESOLVED: 'Đã xử lý' };
const state = { status: 'NEW' };
const body = el('div');
const newBtn = el('button', { class: 'btn', type: 'button', 'aria-pressed': 'true', onclick: () => setFilter('NEW') }, 'Mới');
const allBtn = el('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', onclick: () => setFilter('ALL') }, 'Tất cả');

clear(
  $('#content'),
  el('div', { class: 'row wrap', role: 'group', 'aria-label': 'Lọc cảnh báo' }, newBtn, allBtn),
  el(
    'p',
    { class: 'small muted' },
    'App tự kiểm khi đóng ca (lệch két, tỉ lệ chuyển khoản, món đã pha bị hủy, hoàn tiền, giảm giá tay) và ngay khi hoàn tiền lớn / sửa – hủy khoản sổ quỹ đã duyệt. Ngưỡng và email nhận chỉnh ở Cài đặt. Cảnh báo là gợi ý để kiểm tra, không kết luận ai sai.',
  ),
  body,
);

function setFilter(status) {
  state.status = status;
  newBtn.setAttribute('aria-pressed', String(status === 'NEW'));
  allBtn.setAttribute('aria-pressed', String(status === 'ALL'));
  load();
}

async function load() {
  clear(body, el('p', { class: 'muted' }, 'Đang tải…'));
  try {
    const r = await staffApi(`/api/admin/alerts?status=${state.status}`);
    clear(newBtn, `Mới (${r.newCount})`);
    render(r.alerts);
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

const vnDate = (d) => new Date(new Date(d).getTime() + 7 * 3600e3).toISOString().slice(0, 10);

/** Link Nhật ký thao tác: ngày của cảnh báo / ca, lọc theo người liên quan chính. */
function auditLink(a) {
  const from = vnDate(a.detail?.window?.from ?? a.createdAt);
  const to = vnDate(a.detail?.window?.to ?? a.createdAt);
  const q = new URLSearchParams({ from, to, ...(a.user ? { userId: a.user.userId } : {}) });
  return `/admin/audit?${q}`;
}

function facts(a) {
  const d = a.detail ?? {};
  const unit = d.unit ?? '';
  const lines = [];
  if (a.kind === 'CASH_DIFF') lines.push(`Lệch: ${d.difference < 0 ? '−' : '+'}${money(Math.abs(d.difference))} · cho phép ${money(d.fixed)}`);
  else if (a.kind === 'BIG_REFUND') lines.push(`Số tiền: ${money(d.amount)} · mức lớn từ ${money(d.fixed)} · lượt thu #${d.paymentId}`);
  else if (a.kind === 'CASH_VOID')
    lines.push(
      `Khoản #${d.cashTxnId} · ${d.category ?? ''}: ${money(d.amount)}${d.newAmount !== null && d.newAmount !== undefined ? ` → ${money(d.newAmount)}` : ' (hủy)'}`,
    );
  else lines.push(`Giá trị: ${d.value}${unit} · ngưỡng ${d.fixed}${unit}`);
  if (d.normal)
    lines.push(
      `Bình thường ~${d.normal.mean}${unit} (giới hạn ${d.normal.limit}${unit}, ${d.normal.shifts} ca gần nhất)${d.byStats ? ' — vượt mức bình thường' : ''}`,
    );
  if (d.payments) lines.push(`Chuyển khoản ${d.payments.transfer}/${d.payments.total} lượt thu — đối chiếu app ngân hàng`);
  if (d.people?.length)
    lines.push(`Liên quan: ${d.people.map((p) => `${p.fullName}${p.count > 1 || p.total ? ` (${p.count}${p.total ? `/${p.total}` : ''})` : ''}`).join(', ')}`);
  if (d.reason) lines.push(`Lý do ghi: ${d.reason}`);
  return lines;
}

function render(alerts) {
  if (!alerts.length) {
    clear(body, el('div', { class: 'empty card' }, state.status === 'NEW' ? 'Không có cảnh báo mới.' : 'Chưa có cảnh báo nào.'));
    return;
  }
  clear(
    body,
    el(
      'div',
      { class: 'alert-list' },
      alerts.map((a) =>
        el(
          'article',
          { class: 'card alert-card', dataset: { alertId: a.alertId } },
          el(
            'div',
            { class: 'row wrap' },
            el('span', { class: `badge ${a.severity === 'HIGH' ? 'danger' : 'pending'}` }, KIND[a.kind] ?? a.kind),
            el('span', { class: 'small' }, a.severity === 'HIGH' ? 'Mức cao' : 'Mức vừa'), // không chỉ dựa vào màu (WCAG 1.4.1)
            el('span', { class: 'badge' }, STATUS[a.status]),
            el('span', { class: 'small muted' }, `${dateTime(a.createdAt)}${a.shiftId ? ` · Ca #${a.shiftId}` : ''}`),
          ),
          el('h2', { class: 'alert-title' }, a.title),
          el(
            'ul',
            { class: 'small' },
            facts(a).map((t) => el('li', {}, t)),
          ),
          a.status !== 'NEW'
            ? el(
                'p',
                { class: 'small muted' },
                `${STATUS[a.status]} bởi ${a.handledBy?.fullName ?? ''} lúc ${dateTime(a.handledAt)}${a.note ? ` — ${a.note}` : ''}`,
              )
            : null,
          el(
            'div',
            { class: 'row wrap' },
            a.status === 'NEW' ? el('button', { class: 'btn', type: 'button', onclick: (e) => setStatus(a, 'SEEN', null, e.currentTarget) }, 'Đã xem') : null,
            a.status !== 'RESOLVED' ? el('button', { class: 'btn btn-primary', type: 'button', onclick: () => resolve(a) }, 'Đã xử lý…') : null,
            el('a', { class: 'btn', href: auditLink(a) }, 'Nhật ký thao tác'),
          ),
        ),
      ),
    ),
  );
}

async function setStatus(a, status, note, btn) {
  if (btn) setBusy(btn, true);
  try {
    await staffApi(`/api/admin/alerts/${a.alertId}`, { method: 'PATCH', body: { status, note } });
    toast(status === 'SEEN' ? 'Đã đánh dấu đã xem' : 'Đã ghi nhận xử lý', 'success');
    await load();
  } catch (err) {
    toast(errorMessage(err), 'error');
    if (btn) setBusy(btn, false);
  }
}

function resolve(a) {
  const note = el('textarea', { class: 'input', rows: 3, maxlength: 300, placeholder: 'vd: đã đối chiếu app ngân hàng, đủ tiền' });
  modal({
    title: 'Ghi nhận đã xử lý',
    body: el('div', { class: 'field' }, el('label', {}, 'Ghi chú (không bắt buộc)'), note),
    actions: [
      { label: 'Hủy', value: null },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async () => {
          await setStatus(a, 'RESOLVED', note.value.trim() || null);
        },
      },
    ],
  });
}

// Cảnh báo mới (phòng `admin`): báo + tải lại danh sách
const socket = connectRealtime({ token: getToken(), onOnline: (reconnected) => reconnected && load() });
socket?.on('alert.created', ({ alert }) => {
  toast(`⚠️ ${alert.title}`, 'error', 8000);
  load();
});

load();
