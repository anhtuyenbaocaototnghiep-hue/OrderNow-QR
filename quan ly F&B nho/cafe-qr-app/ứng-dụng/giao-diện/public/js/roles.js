// Vai trò (F-036, F-077 — ADR-035; F-078 vị trí; F-079 quyền riêng): tên hiển thị, việc mỗi vai làm, trang mỗi người mở được.
// Chỉ là trải nghiệm — quyền thật kiểm ở server (src/auth/permissions.js: PERMISSIONS, CAPABILITIES).

export const ROLE_LABEL = { STAFF: 'Nhân viên', MANAGER: 'Trưởng ca', STORE_MGR: 'Quản lý cửa hàng', ADMIN: 'Chủ quán' };
export const ROLE_BADGE = { STAFF: '', MANAGER: 'ok', STORE_MGR: 'preparing', ADMIN: 'primary' };

/** Tóm tắt việc từng vai làm (trang Tài khoản). Thứ tự từ thấp tới cao. */
export const ROLE_SUMMARY = [
  ['STAFF', 'Bán hàng, nhận / làm đơn, thu tiền, mở / đóng ca, ghi chi quỹ (khoản lớn chờ duyệt), sơ chế, hủy hàng, nhận hàng. Giảm giá tay trong ngưỡng nhỏ.'],
  [
    'MANAGER',
    'Như nhân viên + duyệt giảm giá / hoàn tiền trong ca / chi quỹ tới ngưỡng trưởng ca, sửa chấm công trong ngày (không của mình), kiểm kê, điều chỉnh kho, xem "Hôm nay" bản gọn.',
  ],
  [
    'STORE_MGR',
    'Như trưởng ca + trang Quản lý phần vận hành: thực đơn & giá (đổi giá thì chủ quán được báo), kho & nhà cung cấp, khuyến mãi & hội viên, bàn & QR, xếp lịch làm, sửa chấm công mọi ngày, duyệt chi quỹ tới 3 × ngưỡng trưởng ca; xem báo cáo bán hàng, sổ quỹ, ca, cảnh báo. Không xem lương từng người, lãi / lỗ, tài khoản, cài đặt chung.',
  ],
  ['ADMIN', 'Toàn quyền: tài khoản & phân quyền, cài đặt, lương, lãi / lỗ, chi phí cố định, phân tích, nhật ký thao tác.'],
];

// ---- F-079 (ADR-037): quyền đang có = user.caps (máy chủ tính: mặc định theo vai / vị trí + quyền riêng chủ quán đặt) ----
/** Có quyền `key`? Chủ quán luôn có. */
export const hasCap = (user, key) => user?.role === 'ADMIN' || Boolean(user?.caps?.includes(key));

/** Trang Quản lý → quyền cần (khớp CAPABILITIES.pages ở server). Không có trong bảng = chỉ chủ quán (Tài khoản, Cài đặt, Tra cứu API). */
const PAGE_CAP = {
  today: 'dashboard.view',
  reports: 'admin.reports',
  shifts: 'admin.reports',
  menu: 'admin.menu',
  modifiers: 'admin.menu',
  combos: 'admin.menu',
  schedules: 'admin.menu',
  ingredients: 'admin.stock',
  stock: 'admin.stock',
  purchasing: 'admin.stock',
  members: 'admin.customers',
  loyalty: 'admin.customers',
  promotions: 'admin.customers',
  suggestions: 'admin.customers',
  reviews: 'admin.customers',
  tables: 'admin.tables',
  staff: 'admin.staff',
  cash: 'admin.cash',
  alerts: 'admin.alerts',
  pnl: 'admin.pnl',
  analytics: 'admin.pnl',
  payroll: 'admin.payroll',
  audit: 'admin.audit',
};
/** Thứ tự như thanh bên — trang đầu tiên được mở là đích của nút "Quản lý" ở máy quầy. */
const ADMIN_PAGE_HREF = [
  ['today', '/admin/today'],
  ['reports', '/admin/reports'],
  ['menu', '/admin/menu'],
  ['ingredients', '/admin/ingredients'],
  ['stock', '/admin/stock'],
  ['purchasing', '/admin/purchasing'],
  ['members', '/admin/members'],
  ['loyalty', '/admin/loyalty'],
  ['promotions', '/admin/promotions'],
  ['shifts', '/admin/shifts'],
  ['cash', '/admin/cash'],
  ['alerts', '/admin/alerts'],
  ['staff', '/admin/staff'],
  ['payroll', '/admin/payroll'],
  ['pnl', '/admin/pnl'],
  ['analytics', '/admin/analytics'],
  ['tables', '/admin/tables'],
  ['audit', '/admin/audit'],
];
export const pageCap = (page) => PAGE_CAP[page] ?? null;

export const isOwner = (user) => user?.role === 'ADMIN';
/** Trưởng ca trở lên (duyệt tại quầy). */
export const isLead = (user) => ['MANAGER', 'STORE_MGR', 'ADMIN'].includes(user?.role);
/** Vào được trang Quản lý `page` (khóa trang trong menu)? */
export const canOpenAdminPage = (user, page) => isOwner(user) || (Boolean(PAGE_CAP[page]) && hasCap(user, PAGE_CAP[page]));
/** Có quyền trang Quản lý nào (ngoài Hôm nay)? → máy quầy hiện nút "Quản lý". */
export const hasAdminPages = (user) => isOwner(user) || ADMIN_PAGE_HREF.some(([page]) => page !== 'today' && canOpenAdminPage(user, page));
/** Trang Quản lý đầu tiên mở được (đích nút "Quản lý" ở máy quầy). */
export const firstAdminHref = (user) => (isOwner(user) ? '/admin' : (ADMIN_PAGE_HREF.find(([page]) => canOpenAdminPage(user, page))?.[1] ?? null));

// ---- F-078 (ADR-036): vị trí + cấp của nhân viên (vai STAFF). Để trống vị trí = mọi vị trí; trưởng ca trở lên không bị giới hạn. ----
export const POSITION_LABEL = { CASHIER: 'Thu ngân', BARISTA: 'Pha chế', SERVER: 'Phục vụ' };
export const POSITION_HINT = {
  CASHIER: 'thu tiền, bán mang đi, mở / đóng ca, hoàn tiền, ghi chi quỹ',
  BARISTA: 'nhận + làm đơn (Tiếp nhận / Hoàn tất / Xong), sơ chế, hủy hàng, nhận hàng',
  SERVER: 'mở bàn, gọi món tại bàn, chuyển bàn',
};
export const LEVEL_LABEL = { PROBATION: 'Thử việc', OFFICIAL: 'Chính thức' };

const POSITION_CAP = { CASHIER: 'pos.cashier', BARISTA: 'pos.barista', SERVER: 'pos.server' };
/** Có ít nhất một trong các vị trí (khớp hasPosition ở server — F-079: theo quyền pos.cashier / pos.barista / pos.server). */
export const hasPosition = (user, ...positions) =>
  Array.isArray(user?.caps)
    ? positions.some((p) => hasCap(user, POSITION_CAP[p]))
    : Boolean(user) && (user.role !== 'STAFF' || !user.positions?.length || positions.some((p) => user.positions.includes(p)));
export const isProbation = (user) => user?.role === 'STAFF' && user.level === 'PROBATION';

/** Trang máy quầy theo vị trí (không có trong bảng = mọi người). */
const POS_PAGE_POSITIONS = { tables: ['SERVER'], takeaway: ['CASHIER'], stock: ['BARISTA'], shift: ['CASHIER'] };
export const canOpenPosPage = (user, key) => !POS_PAGE_POSITIONS[key] || hasPosition(user, ...POS_PAGE_POSITIONS[key]);
/** Quyền cần cho trang máy quầy (để mời "Xin quyền" khi bị chuyển về). */
export const posPageCap = (key) => (POS_PAGE_POSITIONS[key] ? POSITION_CAP[POS_PAGE_POSITIONS[key][0]] : null);
/** "Thu ngân, Pha chế" / "Mọi vị trí" (nhân viên) — vai khác: null. */
export const positionsText = (user) =>
  user?.role !== 'STAFF' ? null : user.positions?.length ? user.positions.map((p) => POSITION_LABEL[p]).join(', ') : 'Mọi vị trí';
