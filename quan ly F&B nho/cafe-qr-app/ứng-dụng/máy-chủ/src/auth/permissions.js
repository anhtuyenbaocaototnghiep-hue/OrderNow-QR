// Ma trận quyền (FEATURE-036, ADR-006 D-24; FEATURE-077, ADR-035). Server kiểm ở mọi endpoint; FE chỉ ẩn/hiện. Test sinh từ chính bảng này.
// STAFF (Nhân viên) < MANAGER (Trưởng ca) < STORE_MGR (Quản lý cửa hàng — F-077) < ADMIN (Chủ quán). Lệch docs F-018: STAFF vẫn mở/đóng ca (Q-022).
import { forbidden, unauthorized } from '../errors.js';
import { userFromToken } from '../middleware/auth.js';
import { withActorPin } from './actorPin.js';

export const ROLES = ['STAFF', 'MANAGER', 'STORE_MGR', 'ADMIN'];

const ALL = [...ROLES];
const MGR = ['MANAGER', 'STORE_MGR', 'ADMIN'];

export const PERMISSIONS = {
  'pos.use': ALL, // bán, tiếp nhận, hoàn tất, thu tiền, mang đi, in
  'shift.manage': ALL, // mở / đóng ca (FEATURE-018 — Q-022)
  'cash.create': ALL, // ghi thu / chi quỹ (khoản lớn chờ duyệt — D-23)
  'cash.approve': MGR, // duyệt chi quỹ (MANAGER ≤ ngưỡng; STORE_MGR ≤ 3 × ngưỡng — F-077)
  'attendance.edit': MGR, // sửa chấm công (MANAGER trong ngày; STORE_MGR mọi ngày — không tự sửa của mình)
  'prep.post': ALL, // sơ chế
  'waste.create': ALL, // hủy hàng
  'po.receive': ALL, // nhận hàng theo PO
  'inventory.adjust': MGR, // điều chỉnh kho tay
  'stocktake.post': MGR, // kiểm kê: tạo, nhập số, chốt
  'dashboard.view': MGR, // /admin/today (MANAGER bản rút gọn — F-043)
  'admin.all': ['ADMIN'], // tài khoản, cài đặt chung, lãi/lỗ, chi phí cố định, lương, phân tích, nhật ký (phần STORE_MGR dùng: STORE_MGR_AREAS)
};

export const can = (user, permission) => Boolean(user && PERMISSIONS[permission]?.includes(user.role));

const bearer = (req) => {
  const h = req.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
};

/** Middleware: cần quyền `permission` (401 chưa đăng nhập, 403 không đủ quyền). Mang `.permission` để trang Tra cứu API đọc (F-052). */
export function requirePermission(permission) {
  const middleware = async (req, _res, next) => {
    const user = req.user ?? (await userFromToken(bearer(req)));
    if (!user) throw unauthorized();
    if (!can(user, permission)) throw forbidden('Tài khoản của bạn không có quyền thực hiện thao tác này');
    req.user = withActorPin(req, user);
    next();
  };
  middleware.permission = permission;
  return middleware;
}

/**
 * F-077 (ADR-035 D-157): phần trang Quản lý (/api/admin) mà Quản lý cửa hàng dùng được. Đường dẫn tính dưới /api/admin.
 * - full: mọi thao tác trong nhóm (khóa = đoạn đầu; `reports/…`, `jobs/…` = hai đoạn đầu);
 * - read: chỉ xem (GET);
 * - only: đúng "METHOD /mẫu" (`:id` = một đoạn bất kỳ) — mở thêm ngoài full / read;
 * - deny: chặn dù nhóm đã mở.
 * Không có trong bảng → chỉ Chủ quán (ADMIN): tài khoản (sửa), cài đặt chung, nhật ký thao tác, chi phí cố định, lãi / lỗ, phân tích,
 * lương / hồ sơ lương / ngày lễ / duyệt giờ công, cách chấm công, email cảnh báo, việc chạy nền khác, hạn dùng (tiền hủy), tra cứu API.
 */
export const STORE_MGR_AREAS = {
  full: [
    // Thực đơn
    'categories',
    'menu-items',
    'modifier-groups',
    'combos',
    'menu-schedules',
    'prep-stats',
    // Bàn & QR
    'tables',
    'wifi-qr.png',
    'qr-printed',
    // Kho hàng
    'ingredients',
    'units',
    'stock-receipts',
    'stocktakes',
    'suppliers',
    'purchase-orders',
    'lots',
    'inventory',
    // Khách hàng & khuyến mãi
    'promotions',
    'suggestions',
    'reviews',
    'members',
    'member-tiers',
    'rewards',
    'stamp-programs',
    'vouchers',
    'segments',
    'campaigns',
    'birthday',
    'winback',
    'lucky-spin',
    'gift-drinks',
    // Nhân sự: xếp lịch làm
    'rosters',
  ],
  read: [
    'shifts',
    'refunds',
    'payments',
    'orders',
    'cash-transactions',
    'cash-categories',
    'payroll-week', // giờ công + tổng tiền công mỗi ca so với doanh thu — không có lương từng người
    'alerts',
    'users',
    'settings',
    'jobs',
    'reports/revenue',
    'reports/marketing',
    'reports/cogs',
    'reports/costs',
    'reports/loss',
    'reports/suppliers',
    'reports/productivity',
  ],
  only: ['PATCH /alerts/:id', 'PUT /settings', 'POST /jobs/prep-stats/run', 'POST /jobs/demand-forecast/run'],
  deny: ['POST /members/:id/anonymize', 'GET /alerts/mail-status'],
};

/** Cài đặt Quản lý cửa hàng được đổi (vận hành quầy / bếp). Còn lại (giảm giá, ngưỡng duyệt, cảnh báo, Wi-Fi, tên quán…) — Chủ quán. */
export const STORE_MGR_SETTINGS = [
  'acceptingOrders',
  'closedMessage',
  'etaBaseSeconds',
  'kitchenParallelism',
  'etaSpreadPercent',
  'etaDefaultItemSeconds',
  'oneTap',
];

/** Loại cảnh báo chỉ Chủ quán xem (khóa đăng nhập; giá món do quản lý cửa hàng đổi). */
export const OWNER_ONLY_ALERTS = ['AUTH_LOCK', 'PRICE_CHANGE'];

const pattern = (rule) => {
  const [method, p] = rule.split(' ');
  const re = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/:[^/]+/g, '/[^/]+')}/?$`);
  return { method, re };
};
const FULL = new Set(STORE_MGR_AREAS.full);
const READ = new Set(STORE_MGR_AREAS.read);
const ONLY = STORE_MGR_AREAS.only.map(pattern);
const DENY = STORE_MGR_AREAS.deny.map(pattern);

function areaKey(path) {
  const seg = path.split('/').filter(Boolean);
  return ['reports', 'jobs'].includes(seg[0]) && seg.length > 1 ? `${seg[0]}/${seg[1]}` : (seg[0] ?? '');
}

/** Quản lý cửa hàng được gọi `method path` (path dưới /api/admin, ví dụ '/menu-items/5' hoặc mẫu '/menu-items/:id')? */
export function storeManagerMay(method, path) {
  const m = String(method).toUpperCase() === 'HEAD' ? 'GET' : String(method).toUpperCase();
  const match = (r) => r.method === m && r.re.test(path);
  if (DENY.some(match)) return false;
  if (ONLY.some(match)) return true;
  const key = areaKey(path);
  return FULL.has(key) || (m === 'GET' && READ.has(key));
}

/**
 * Middleware cho /api/admin (thay requireAdmin — F-077): Chủ quán mọi thứ; Quản lý cửa hàng theo STORE_MGR_AREAS; vai khác 403.
 * Trang Tra cứu API nhận ra middleware này qua `.adminArea`.
 */
export async function requireAdminArea(req, _res, next) {
  const user = await userFromToken(bearer(req));
  if (!user) throw unauthorized();
  if (user.role !== 'ADMIN') {
    if (user.role !== 'STORE_MGR') throw forbidden('Chỉ quản lý được truy cập chức năng này');
    if (!storeManagerMay(req.method, req.path)) throw forbidden('Chức năng này chỉ chủ quán dùng được', 'OWNER_ONLY');
  }
  req.user = withActorPin(req, user);
  next();
}
requireAdminArea.adminArea = true;

// ---- F-078 (ADR-036): vị trí + cấp của nhân viên (vai STAFF). Trưởng ca trở lên không bị giới hạn. ----
export const POSITIONS = ['CASHIER', 'BARISTA', 'SERVER'];
export const POSITION_LABEL = { CASHIER: 'Thu ngân', BARISTA: 'Pha chế', SERVER: 'Phục vụ' };
export const LEVELS = ['PROBATION', 'OFFICIAL'];

/** Có ít nhất một trong các vị trí? Vai khác STAFF, hoặc nhân viên chưa đặt vị trí (null = mọi vị trí) → có. */
export const hasPosition = (user, ...positions) =>
  Boolean(user) && (user.role !== 'STAFF' || !user.positions?.length || positions.some((p) => user.positions.includes(p)));
/** Nhân viên thử việc: giảm giá tay, chi quỹ, sửa / xóa món luôn cần trưởng ca trở lên duyệt. */
export const isProbation = (user) => user?.role === 'STAFF' && user.level === 'PROBATION';
/** Vai dùng để tính ngưỡng giảm giá tay (thử việc → 'PROBATION' = 0). */
export const discountRole = (user) => (isProbation(user) ? 'PROBATION' : user?.role);

/** Middleware: việc của vị trí `positions` (403 POSITION_REQUIRED). Đặt sau requireStaff / requirePermission. Mang `.positions` cho Tra cứu API. */
export function requirePosition(...positions) {
  const middleware = async (req, _res, next) => {
    const user = req.user ?? (await userFromToken(bearer(req)));
    if (!user) throw unauthorized();
    if (!hasPosition(user, ...positions)) {
      const names = positions.map((p) => POSITION_LABEL[p]).join(' / ');
      throw forbidden(`Việc này của vị trí ${names} — nhờ người đúng vị trí hoặc trưởng ca`, 'POSITION_REQUIRED');
    }
    req.user = withActorPin(req, user);
    next();
  };
  middleware.positions = positions;
  return middleware;
}

/** Ngưỡng giảm giá tay theo vai trò (D-14 nhân viên, D-24 trưởng ca; quản lý cửa hàng và chủ quán không giới hạn; thử việc 0 — F-078). */
export function discountLimits(role, settings) {
  if (role === 'ADMIN' || role === 'STORE_MGR') return null;
  if (role === 'PROBATION') return { staffMaxPercent: 0, staffMaxAmount: 0 };
  if (role === 'MANAGER') return { staffMaxPercent: settings.managerMaxPercent, staffMaxAmount: settings.managerMaxAmount };
  return { staffMaxPercent: settings.staffMaxPercent, staffMaxAmount: settings.staffMaxAmount };
}

/** F-077: Quản lý cửa hàng duyệt chi quỹ tới 3 × ngưỡng của trưởng ca. */
export const storeManagerCashMax = (settings) => settings.managerCashApproveMax * 3;
