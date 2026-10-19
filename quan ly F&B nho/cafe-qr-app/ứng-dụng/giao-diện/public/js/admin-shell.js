// Khung trang quản lý: chỉ ADMIN (server vẫn kiểm quyền cho mọi API — đây chỉ là trải nghiệm).
import { staffApi } from './api.js';
import { current, logout, requireStaffPage } from './auth.js';
import { $, clear, confirmDialog, el, errorMessage, toast } from './ui.js';

// Chuỗi = tiêu đề nhóm (ADR-005: nhóm "Marketing & Khách hàng" và "Vận hành"; ADR-006: "Tài chính & nhân sự")
const NAV = [
  ['today', '/admin/today', 'Hôm nay'],
  ['reports', '/admin/reports', 'Báo cáo & lịch sử'],
  ['analytics', '/admin/analytics', 'Phân tích & menu engineering'],
  ['menu', '/admin/menu', 'Thực đơn & định lượng'],
  ['modifiers', '/admin/modifiers', 'Tùy chọn món'],
  ['schedules', '/admin/menu-schedules', 'Lịch thực đơn & thời gian pha'],
  ['ingredients', '/admin/ingredients', 'Kho nguyên liệu'],
  ['stock', '/admin/stock', 'Nhập kho & kiểm kê'],
  ['purchasing', '/admin/purchasing', 'Nhà cung cấp & đặt hàng'],
  ['tables', '/admin/tables', 'Bàn & mã QR'],
  ['users', '/admin/users', 'Tài khoản'],
  'Marketing & Khách hàng',
  ['members', '/admin/members', 'Hội viên'],
  ['loyalty', '/admin/loyalty', 'Tích điểm, voucher & chiến dịch'],
  ['combos', '/admin/combos', 'Combo'],
  ['promotions', '/admin/promotions', 'Khuyến mãi'],
  ['suggestions', '/admin/suggestions', 'Gợi ý & ghim'],
  'Tài chính & nhân sự',
  ['shifts', '/admin/shifts', 'Ca & hoàn tiền'],
  ['cash', '/admin/cash', 'Sổ quỹ'],
  ['pnl', '/admin/pnl', 'Lãi / lỗ'],
  ['staff', '/admin/staff', 'Nhân sự & chấm công'],
  ['audit', '/admin/audit', 'Nhật ký thao tác'],
  'Vận hành',
  ['settings', '/admin/settings', 'Cài đặt'],
];

export async function mountAdminShell(active) {
  const user = await requireStaffPage({ admin: true });
  const side = $('#side');
  clear(
    side,
    el('div', { class: 'brand' }, '☕ ', current.shop?.name || 'Quản lý'),
    NAV.map((n) =>
      typeof n === 'string'
        ? el('div', { class: 'nav-group' }, n)
        : el('a', { href: n[1], class: n[0] === active ? 'active' : '', 'aria-current': n[0] === active ? 'page' : null }, n[2]),
    ),
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
