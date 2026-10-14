// Khung trang quản lý: chỉ ADMIN (server vẫn kiểm quyền cho mọi API — đây chỉ là trải nghiệm).
import { staffApi } from './api.js';
import { current, logout, requireStaffPage } from './auth.js';
import { $, clear, confirmDialog, el, errorMessage, toast } from './ui.js';

const NAV = [
  ['reports', '/admin/reports', 'Báo cáo & lịch sử'],
  ['menu', '/admin/menu', 'Thực đơn & định lượng'],
  ['ingredients', '/admin/ingredients', 'Kho nguyên liệu'],
  ['tables', '/admin/tables', 'Bàn & mã QR'],
  ['users', '/admin/users', 'Tài khoản'],
];

export async function mountAdminShell(active) {
  const user = await requireStaffPage({ admin: true });
  const side = $('#side');
  clear(
    side,
    el('div', { class: 'brand' }, '☕ ', current.shop?.name || 'Quản lý'),
    NAV.map(([key, href, label]) => el('a', { href, class: key === active ? 'active' : '', 'aria-current': key === active ? 'page' : null }, label)),
    el('a', { href: '/pos' }, '→ Màn hình quầy'),
    el('div', { class: 'spacer' }),
    el('div', { class: 'who' }, el('strong', {}, user.fullName), el('div', { class: 'small', title: 'Tên đăng nhập' }, `@${user.username}`)),
    el('button', { class: 'btn btn-sm', type: 'button', onclick: logout }, 'Đăng xuất'),
  );
  return user;
}

/** Ô bật/tắt dạng switch. */
export function toggle(checked, onChange, label) {
  const input = el('input', { type: 'checkbox', checked, 'aria-label': label });
  input.addEventListener('change', () => onChange(input.checked, input));
  return el('label', { class: 'switch' }, input, el('span'));
}

/**
 * Xóa có xác nhận (ADR-004). Server tự quyết: chưa có lịch sử → xóa hẳn ('DELETED');
 * đã có lịch sử → xóa mềm ('ARCHIVED'): biến mất khỏi danh sách nhưng báo cáo/lịch sử cũ vẫn giữ.
 */
export async function confirmAndDelete({ url, label, warning = '', onDone }) {
  const message = `${warning ? `${warning} ` : ''}Nếu ${label} đã có trong lịch sử (đơn hàng, kho, thu tiền), hệ thống vẫn giữ lại cho báo cáo cũ nhưng sẽ không còn hiển thị hay sử dụng được. Không thể hoàn tác.`;
  if (!(await confirmDialog(`Xóa ${label}?`, message, { okLabel: 'Xóa', danger: true }))) return false;
  try {
    const { result } = await staffApi(url, { method: 'DELETE' });
    toast(result === 'ARCHIVED' ? `Đã xóa ${label} (vẫn giữ trong lịch sử, báo cáo cũ)` : `Đã xóa ${label}`, 'success', 5000);
    await onDone?.();
    return true;
  } catch (err) {
    toast(errorMessage(err), 'error', 7000);
    return false;
  }
}
