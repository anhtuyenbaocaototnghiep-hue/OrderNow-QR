// Khung trang quản lý: chỉ ADMIN (server vẫn kiểm quyền cho mọi API — đây chỉ là trải nghiệm).
import { staffApi } from './api.js';
import { current, logout, requireStaffPage } from './auth.js';
import { $, clear, confirmDialog, el, errorMessage, toast } from './ui.js';
import { brandMark, icon } from './icons.js';

// Menu quản lý (TASK-066, ADR-013 D-58): "Hôm nay" luôn ở trên; 6 nhóm thu gọn được, nhóm chứa trang đang mở tự mở.
// Mục: [khóa trang, đường dẫn, tên ngắn một dòng, tên đầy đủ (tiêu đề trang — hiện khi rê chuột)].
const HOME = ['today', '/admin/today', 'Hôm nay'];
const NAV = [
  {
    id: 'overview',
    title: 'Tổng quan',
    icon: 'chart-column',
    items: [
      ['reports', '/admin/reports', 'Báo cáo & lịch sử'],
      ['analytics', '/admin/analytics', 'Phân tích', 'Phân tích & menu engineering'],
      ['pnl', '/admin/pnl', 'Lãi / lỗ'],
    ],
  },
  {
    id: 'menu',
    title: 'Thực đơn',
    icon: 'utensils-crossed',
    items: [
      ['menu', '/admin/menu', 'Món & định lượng', 'Thực đơn & định lượng'],
      ['modifiers', '/admin/modifiers', 'Tùy chọn món'],
      ['combos', '/admin/combos', 'Combo'],
      ['schedules', '/admin/menu-schedules', 'Lịch thực đơn', 'Lịch thực đơn & thời gian pha'],
    ],
  },
  {
    id: 'stock',
    title: 'Kho hàng',
    icon: 'package',
    items: [
      ['ingredients', '/admin/ingredients', 'Nguyên liệu', 'Kho nguyên liệu'],
      ['stock', '/admin/stock', 'Nhập kho & kiểm kê'],
      ['purchasing', '/admin/purchasing', 'Nhà cung cấp', 'Nhà cung cấp & đặt hàng'],
    ],
  },
  {
    id: 'customers',
    title: 'Khách hàng',
    icon: 'users',
    items: [
      ['members', '/admin/members', 'Hội viên'],
      ['loyalty', '/admin/loyalty', 'Tích điểm & voucher', 'Tích điểm, voucher & chiến dịch'],
      ['promotions', '/admin/promotions', 'Khuyến mãi'],
      ['suggestions', '/admin/suggestions', 'Gợi ý & ghim'],
      ['reviews', '/admin/reviews', 'Đánh giá món'],
    ],
  },
  {
    id: 'finance',
    title: 'Thu chi & nhân sự',
    icon: 'wallet',
    items: [
      ['shifts', '/admin/shifts', 'Ca & hoàn tiền'],
      ['cash', '/admin/cash', 'Sổ quỹ'],
      ['alerts', '/admin/alerts', 'Cảnh báo', 'Cảnh báo bất thường'], // F-060
      ['staff', '/admin/staff', 'Nhân sự & chấm công'],
    ],
  },
  {
    id: 'system',
    title: 'Hệ thống',
    icon: 'settings',
    items: [
      ['tables', '/admin/tables', 'Bàn & mã QR'],
      ['users', '/admin/users', 'Tài khoản'],
      ['audit', '/admin/audit', 'Nhật ký thao tác'],
      ['settings', '/admin/settings', 'Cài đặt'],
      ['api-docs', '/admin/api-docs', 'Tra cứu API'], // F-052
    ],
  },
];

// F-061 (ADR-021 D-79): mục thuộc nhóm nâng cao — chỉ hiện trong menu khi nhóm đó bật ở Cài đặt (ui.modules).
// Ẩn menu, không chặn trang / API: mở thẳng đường dẫn vẫn dùng được (có dải nhắc). Khóa nhóm: src/utils/modules.js.
export const MODULE_OF = {
  ingredients: 'inventory',
  stock: 'inventory',
  purchasing: 'inventory',
  members: 'customers',
  loyalty: 'customers',
  promotions: 'customers',
  suggestions: 'customers',
  reviews: 'customers',
  cash: 'finance',
  staff: 'finance',
  analytics: 'analytics',
  pnl: 'analytics',
  schedules: 'advanced',
  audit: 'advanced',
  'api-docs': 'advanced',
};
const shown = (key) => !MODULE_OF[key] || current.modules.includes(MODULE_OF[key]);

// Nhóm người dùng tự mở được nhớ trên máy (tiện ích riêng mỗi trình duyệt; bị chặn lưu thì chỉ mất ghi nhớ)
const OPEN_KEY = 'admin.nav.open';
function savedOpen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
function saveOpen(ids) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...ids]));
  } catch {
    /* trình duyệt chặn lưu → bỏ qua */
  }
}

const navLink = ([key, href, label, full], active, ...lead) =>
  el('a', { href, class: key === active ? 'active' : '', 'aria-current': key === active ? 'page' : null, title: full || null }, ...lead, label);

function navGroup(g, active, open) {
  const items = g.items.filter(([key]) => shown(key));
  if (!items.length) return null; // cả nhóm đang ẩn (chế độ cơ bản)
  const here = items.some(([key]) => key === active);
  const summary = el('summary', {}, icon(g.icon), el('span', { class: 'grow' }, g.title), icon('chevron-down'));
  const group = el(
    'details',
    { class: 'nav-sec', open: here || open.has(g.id) },
    summary,
    el(
      'div',
      { class: 'nav-items' },
      items.map((i) => navLink(i, active)),
    ),
  );
  // Chỉ nhớ thao tác của người dùng (click / Enter / Space trên tiêu đề nhóm), không nhớ việc tự mở nhóm của trang đang xem
  summary.addEventListener('click', () => {
    if (group.open) open.delete(g.id);
    else open.add(g.id);
    saveOpen(open);
  });
  return group;
}

export async function mountAdminShell(active) {
  const user = await requireStaffPage({ admin: true });
  const side = $('#side');
  const open = savedOpen();
  clear(
    side,
    el('div', { class: 'brand' }, brandMark(), current.shop?.name || 'Quản lý'),
    navLink(HOME, active, icon('house')),
    NAV.map((g) => navGroup(g, active, open)),
    el('a', { href: '/pos', class: 'nav-pos' }, icon('monitor'), 'Màn hình quầy'),
    el('div', { class: 'spacer' }),
    el('div', { class: 'who' }, el('strong', {}, user.fullName), el('div', { class: 'small', title: 'Tên đăng nhập' }, `@${user.username}`)),
    el('button', { class: 'btn btn-sm', type: 'button', onclick: logout }, icon('log-out'), 'Đăng xuất'),
  );
  noteHiddenPage(active);
  refreshQrBanner(active);
  return user;
}

/** F-061: trang đang mở thuộc nhóm đang ẩn khỏi menu → nhắc cách hiện lại (trang vẫn dùng bình thường). */
function noteHiddenPage(active) {
  $('#module-hidden-note')?.remove();
  if (shown(active)) return;
  $('#content')?.before(
    el(
      'div',
      { class: 'alert info module-hidden-note', id: 'module-hidden-note', role: 'status' },
      'Mục này đang ẩn khỏi menu (chế độ cơ bản) — vẫn dùng bình thường. ',
      el('a', { href: '/admin/settings#giao-dien' }, 'Hiện lại trong menu: Cài đặt → Giao diện quản lý'),
    ),
  );
}

/**
 * F-063 (ADR-021 D-82): QR đang dán trên bàn được in ở địa chỉ khác địa chỉ app đang chạy → dải đỏ ở mọi trang quản lý.
 * Địa chỉ localhost → chỉ báo ở trang Bàn & mã QR / In QR (chạy thử trên máy là bình thường). Lỗi mạng → bỏ qua.
 */
export async function refreshQrBanner(active) {
  let q;
  try {
    q = await staffApi('/api/qr-check');
  } catch {
    return;
  }
  $('#qr-wrong')?.remove();
  const local = q.localhost && active === 'tables';
  if (!q.mismatch && !local && !q.unreachable) return;
  const here = q.machineIps?.length ? q.machineIps.join(', ') : 'chưa có mạng';
  const msg = q.unreachable
    ? [
        `QR bàn đang trỏ tới ${q.baseUrl} nhưng máy chủ không còn ở IP đó (IP hiện tại: ${here}) — điện thoại sẽ không vào được. `,
        'Sửa PUBLIC_BASE_URL trong .env theo IP hiện tại (tốt nhất đặt IP cố định cho máy chủ trong router), khởi động lại app rồi ',
        el('a', { href: '/admin/tables/print' }, 'in lại QR'),
        '.',
      ]
    : q.mismatch
      ? [
          `QR đang dán trên bàn trỏ tới ${q.printedBaseUrl} nhưng app đang chạy ở ${q.baseUrl} — khách quét sẽ lỗi. `,
          el('a', { href: '/admin/tables/print' }, 'In lại QR'),
          ' (hoặc đặt IP cố định cho máy chủ trong router để QR không phải in lại).',
        ]
      : [
          `App đang chạy ở ${q.baseUrl} — điện thoại không mở được địa chỉ localhost, QR in ra sẽ không quét được. `,
          'Đặt PUBLIC_BASE_URL = địa chỉ IP của máy chủ trong mạng LAN rồi khởi động lại app.',
        ];
  $('#content')?.before(el('div', { class: 'banner qr-wrong', id: 'qr-wrong', role: 'alert' }, icon('triangle-alert'), ' ', ...msg));
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
