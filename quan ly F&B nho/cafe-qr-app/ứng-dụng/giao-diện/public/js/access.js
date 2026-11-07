// F-079 (ADR-037): "Xin quyền". Máy chủ chặn một việc có quyền cấp riêng được (403 kèm details.capability) → thanh nhắc ở cuối màn
// hình; bấm "Xin quyền" → hộp ghi lý do → gửi chủ quán. Trong lúc chờ, trang hỏi lại mỗi 15 giây; chủ quán duyệt / từ chối → báo ngay
// (duyệt thì mời tải lại trang để menu mới hiện ra). Bị chuyển về từ trang không được mở (?denied=…&cap=…) cũng hiện thanh này.
import { setAccessNotifier, staffApi } from './api.js';
import { $, el, errorMessage, modal, toast } from './ui.js';

let catalogue = null;
/** Tên dễ hiểu của một quyền (danh mục lấy từ máy chủ, nhớ trong trang). */
export async function capLabel(key) {
  try {
    catalogue ??= await staffApi('/api/access/capabilities');
  } catch {
    return key;
  }
  return catalogue.find((c) => c.key === key)?.label ?? key;
}

const watching = new Set();
/** Hỏi lại mỗi 15 giây (tối đa 30 phút) tới khi chủ quán xử lý yêu cầu. */
function watchDecision(requestId, label) {
  if (watching.has(requestId)) return;
  watching.add(requestId);
  const started = Date.now();
  const timer = setInterval(async () => {
    if (Date.now() - started > 30 * 60_000) {
      clearInterval(timer);
      watching.delete(requestId);
      return;
    }
    let mine;
    try {
      mine = await staffApi('/api/access-requests/mine');
    } catch {
      return;
    }
    const r = mine.find((x) => x.requestId === requestId);
    if (!r || r.status === 'PENDING') return;
    clearInterval(timer);
    watching.delete(requestId);
    if (r.status === 'APPROVED') {
      showBar(
        el('span', {}, `Chủ quán đã cho phép: ${label}. Tải lại trang để dùng.`),
        el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => location.reload() }, 'Tải lại'),
        'ok',
      );
    } else {
      showBar(el('span', {}, `Chủ quán chưa cho phép: ${label}${r.decisionNote ? ` — ${r.decisionNote}` : ''}.`), null, 'warn');
    }
  }, 15_000);
}

/** Hộp gửi yêu cầu xin quyền. */
export async function askAccess(capability, label = null) {
  const name = label ?? (await capLabel(capability));
  const reason = el('input', { class: 'input', id: 'access-reason', maxlength: 200, placeholder: 'Ví dụ: thu ngân nghỉ, cần thu tiền giúp' });
  await modal({
    title: 'Xin quyền',
    body: el(
      'div',
      { class: 'stack' },
      el('p', {}, 'Gửi chủ quán duyệt quyền: ', el('strong', {}, name)),
      el('div', { class: 'field' }, el('label', { for: 'access-reason' }, 'Lý do (không bắt buộc)'), reason),
    ),
    actions: [
      { label: 'Để sau' },
      {
        label: 'Gửi yêu cầu',
        class: 'btn-primary',
        onClick: async () => {
          try {
            const r = await staffApi('/api/access-requests', { method: 'POST', body: { capability, reason: reason.value.trim() || null } });
            toast(r.created ? 'Đã gửi — chờ chủ quán duyệt' : 'Bạn đã xin quyền này rồi — đang chờ chủ quán duyệt', 'success', 5000);
            watchDecision(r.request.requestId, name);
            return true;
          } catch (err) {
            toast(errorMessage(err), 'error', 6000);
            return false;
          }
        },
      },
    ],
  });
}

function showBar(text, action, tone = 'warn') {
  $('#access-bar')?.remove();
  const bar = el(
    'div',
    { class: `access-bar ${tone}`, id: 'access-bar', role: 'status' },
    text,
    action,
    el('button', { class: 'btn btn-sm', type: 'button', onclick: () => bar.remove() }, 'Đóng'),
  );
  document.body.append(bar);
  if (tone !== 'ok') setTimeout(() => bar.remove(), 20_000);
}

/** Thanh nhắc "Xin quyền" khi thiếu một quyền cấp riêng được. */
export async function offerAccess(capability, label = null) {
  const name = label ?? (await capLabel(capability));
  showBar(
    el('span', {}, `Bạn chưa có quyền: ${name}.`),
    el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => ($('#access-bar')?.remove(), askAccess(capability, name)) }, 'Xin quyền'),
  );
}

/** Gọi một lần ở khung trang (máy quầy / Quản lý): mọi lần máy chủ chặn vì thiếu quyền cấp được → hiện thanh nhắc. */
export function registerAccessPrompter() {
  setAccessNotifier((err) => offerAccess(err.details.capability, err.details.capabilityLabel));
  const cap = new URLSearchParams(location.search).get('cap');
  if (cap) offerAccess(cap);
}
