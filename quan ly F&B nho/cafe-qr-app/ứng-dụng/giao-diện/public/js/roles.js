// Vai trò (F-036, F-077 — ADR-035): tên hiển thị, việc mỗi vai làm, trang Quản lý mỗi vai mở được.
// Chỉ là trải nghiệm — quyền thật kiểm ở server (src/auth/permissions.js: PERMISSIONS, STORE_MGR_AREAS).

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

/** Trang trong menu Quản lý mà Quản lý cửa hàng mở được (khớp STORE_MGR_AREAS ở server). */
export const STORE_MGR_PAGES = new Set([
  'today',
  'reports',
  'menu',
  'modifiers',
  'combos',
  'schedules',
  'tables',
  'ingredients',
  'stock',
  'purchasing',
  'members',
  'loyalty',
  'promotions',
  'suggestions',
  'reviews',
  'shifts',
  'cash',
  'alerts',
  'staff',
]);

export const isOwner = (user) => user?.role === 'ADMIN';
/** Trưởng ca trở lên (duyệt tại quầy, kiểm kê, điều chỉnh kho). */
export const isLead = (user) => ['MANAGER', 'STORE_MGR', 'ADMIN'].includes(user?.role);
/** Vào được trang Quản lý `page` (khóa trang trong menu)? */
export const canOpenAdminPage = (user, page) => user?.role === 'ADMIN' || (user?.role === 'STORE_MGR' && STORE_MGR_PAGES.has(page));

// ---- F-078 (ADR-036): vị trí + cấp của nhân viên (vai STAFF). Để trống vị trí = mọi vị trí; trưởng ca trở lên không bị giới hạn. ----
export const POSITION_LABEL = { CASHIER: 'Thu ngân', BARISTA: 'Pha chế', SERVER: 'Phục vụ' };
export const POSITION_HINT = {
  CASHIER: 'thu tiền, bán mang đi, mở / đóng ca, hoàn tiền, ghi chi quỹ',
  BARISTA: 'nhận + làm đơn (Tiếp nhận / Hoàn tất / Xong), sơ chế, hủy hàng, nhận hàng',
  SERVER: 'mở bàn, gọi món tại bàn, chuyển bàn',
};
export const LEVEL_LABEL = { PROBATION: 'Thử việc', OFFICIAL: 'Chính thức' };

/** Có ít nhất một trong các vị trí (khớp hasPosition ở server). */
export const hasPosition = (user, ...positions) =>
  Boolean(user) && (user.role !== 'STAFF' || !user.positions?.length || positions.some((p) => user.positions.includes(p)));
export const isProbation = (user) => user?.role === 'STAFF' && user.level === 'PROBATION';

/** Trang máy quầy theo vị trí (không có trong bảng = mọi người). */
const POS_PAGE_POSITIONS = { tables: ['SERVER'], takeaway: ['CASHIER'], stock: ['BARISTA'], shift: ['CASHIER'] };
export const canOpenPosPage = (user, key) => !POS_PAGE_POSITIONS[key] || hasPosition(user, ...POS_PAGE_POSITIONS[key]);
/** "Thu ngân, Pha chế" / "Mọi vị trí" (nhân viên) — vai khác: null. */
export const positionsText = (user) =>
  user?.role !== 'STAFF' ? null : user.positions?.length ? user.positions.map((p) => POSITION_LABEL[p]).join(', ') : 'Mọi vị trí';
