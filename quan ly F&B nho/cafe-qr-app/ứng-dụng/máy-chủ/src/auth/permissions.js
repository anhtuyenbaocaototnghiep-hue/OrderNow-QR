// Ma trận quyền (FEATURE-036, ADR-006 D-24; FEATURE-077, ADR-035; FEATURE-078, ADR-036; FEATURE-079, ADR-037). Server kiểm ở mọi endpoint;
// FE chỉ ẩn/hiện. STAFF (Nhân viên) < MANAGER (Trưởng ca) < STORE_MGR (Quản lý cửa hàng) < ADMIN (Chủ quán).
// F-079: mỗi việc cấp / thu được là một "quyền" (CAPABILITIES). Mặc định theo vai trò / vị trí; chủ quán đặt riêng từng người
// (UserGrants: ALLOW / DENY, có thể kèm hạn) — user.grants do userFromToken nạp (chỉ dòng còn hạn). Chủ quán luôn đủ mọi quyền.
// Lệch docs F-018: STAFF vẫn mở/đóng ca (Q-022).
import { AppError, unauthorized } from '../errors.js';
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
  'admin.all': ['ADMIN'], // tài khoản, cài đặt chung (phần còn lại của /api/admin: CAPABILITIES)
};

// ---- F-078 (ADR-036): vị trí + cấp của nhân viên (vai STAFF). ----
export const POSITIONS = ['CASHIER', 'BARISTA', 'SERVER'];
export const POSITION_LABEL = { CASHIER: 'Thu ngân', BARISTA: 'Pha chế', SERVER: 'Phục vụ' };
export const LEVELS = ['PROBATION', 'OFFICIAL'];
const POSITION_CAP = { CASHIER: 'pos.cashier', BARISTA: 'pos.barista', SERVER: 'pos.server' };

const atPosition = (p) => (u) => u.role !== 'STAFF' || !u.positions?.length || u.positions.includes(p);
const isLeadRole = (u) => MGR.includes(u.role);
const isStoreManager = (u) => u.role === 'STORE_MGR';

/**
 * F-079 (ADR-037 D-167): danh mục quyền cấp / thu được. `byRole` = mặc định khi không đặt riêng.
 * Quyền trang Quản lý mô tả phần /api/admin mở cho người có quyền đó (đường dẫn dưới /api/admin):
 *   full — mọi thao tác trong nhóm (khóa = đoạn đầu; `reports/…`, `jobs/…` = hai đoạn đầu); read — chỉ GET; only — đúng "METHOD /mẫu".
 * `pages` = khóa trang Quản lý (js/roles.js). `money` = dính tới tiền / lương → cấp thì ghi cảnh báo cho chủ quán.
 * Không có ở đây = chỉ chủ quán, không cấp được: tài khoản & phân quyền, cài đặt chung, cách chấm công, email cảnh báo, việc chạy nền
 * khác, danh mục thu chi (sửa), ẩn danh hội viên, tra cứu API, duyệt xin quyền.
 */
export const CAPABILITIES = [
  { key: 'pos.cashier', group: 'Máy quầy', label: 'Thu tiền, bán mang đi, mở / đóng ca, hoàn tiền, ghi thu chi', money: true, byRole: atPosition('CASHIER') },
  { key: 'pos.barista', group: 'Máy quầy', label: 'Nhận / làm đơn, sơ chế, hủy hàng, nhận hàng', byRole: atPosition('BARISTA') },
  { key: 'pos.server', group: 'Máy quầy', label: 'Mở bàn, gọi món tại bàn, chuyển bàn', byRole: atPosition('SERVER') },
  { key: 'stock.count', group: 'Máy quầy', label: 'Kiểm kê, điều chỉnh kho ở quầy', byRole: isLeadRole },
  { key: 'attendance.edit', group: 'Máy quầy', label: 'Sửa / thêm chấm công của người khác', byRole: isLeadRole },
  { key: 'dashboard.view', group: 'Trang Quản lý', label: 'Trang Hôm nay', byRole: isLeadRole, pages: ['today'] },
  {
    key: 'admin.reports',
    group: 'Trang Quản lý',
    label: 'Báo cáo bán hàng, lịch sử đơn, ca & hoàn tiền (xem)',
    money: true,
    byRole: isStoreManager,
    read: ['payments', 'orders', 'reports/revenue', 'reports/marketing', 'shifts', 'refunds'],
    pages: ['reports', 'shifts'],
  },
  {
    key: 'admin.menu',
    group: 'Trang Quản lý',
    label: 'Thực đơn & giá (món, tùy chọn, combo, lịch thực đơn)',
    byRole: isStoreManager,
    full: ['categories', 'menu-items', 'modifier-groups', 'combos', 'menu-schedules', 'prep-stats'],
    read: ['jobs'],
    only: ['POST /jobs/prep-stats/run'],
    pages: ['menu', 'modifiers', 'combos', 'schedules'],
  },
  {
    key: 'admin.stock',
    group: 'Trang Quản lý',
    label: 'Kho hàng (nguyên liệu, nhập kho, kiểm kê, nhà cung cấp, đặt hàng)',
    byRole: isStoreManager,
    full: ['ingredients', 'units', 'stock-receipts', 'stocktakes', 'suppliers', 'purchase-orders', 'lots', 'inventory'],
    read: ['reports/cogs', 'reports/costs', 'reports/loss', 'reports/suppliers', 'jobs'],
    only: ['POST /jobs/demand-forecast/run'],
    pages: ['ingredients', 'stock', 'purchasing'],
  },
  {
    key: 'admin.customers',
    group: 'Trang Quản lý',
    label: 'Khách hàng & khuyến mãi (hội viên, tích điểm, voucher, chiến dịch)',
    byRole: isStoreManager,
    full: [
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
    ],
    read: ['reports/marketing'],
    pages: ['members', 'loyalty', 'promotions', 'suggestions', 'reviews'],
  },
  {
    key: 'admin.tables',
    group: 'Trang Quản lý',
    label: 'Bàn & mã QR',
    byRole: isStoreManager,
    full: ['tables', 'wifi-qr.png', 'qr-printed'],
    pages: ['tables'],
  },
  {
    key: 'admin.staff',
    group: 'Trang Quản lý',
    label: 'Nhân sự: lịch làm, chấm công, giờ công tuần',
    byRole: isStoreManager,
    full: ['rosters'],
    read: ['users', 'payroll-week', 'reports/productivity'],
    pages: ['staff'],
  },
  {
    key: 'admin.cash',
    group: 'Trang Quản lý',
    label: 'Sổ quỹ (xem)',
    money: true,
    byRole: isStoreManager,
    read: ['cash-transactions', 'cash-categories'],
    pages: ['cash'],
  },
  {
    key: 'admin.alerts',
    group: 'Trang Quản lý',
    label: 'Cảnh báo bất thường',
    byRole: isStoreManager,
    read: ['alerts'],
    only: ['PATCH /alerts/:id'],
    pages: ['alerts'],
  },
  {
    key: 'admin.pnl',
    group: 'Trang Quản lý',
    label: 'Lãi / lỗ, chi phí cố định, phân tích',
    money: true,
    byRole: () => false,
    full: ['fixed-costs', 'reports/menu-engineering'],
    read: ['reports/pnl', 'reports/compare', 'reports/heatmap', 'reports/revenue-forecast', 'reports/tables', 'categories', 'expiry'],
    pages: ['pnl', 'analytics'],
  },
  {
    key: 'admin.payroll',
    group: 'Trang Quản lý',
    label: 'Lương (bảng lương, hồ sơ lương, ngày lễ, duyệt giờ công)',
    money: true,
    byRole: () => false,
    full: ['payroll', 'pay-profiles', 'holidays', 'missed-punches', 'attendance-disputes'],
    read: ['users'],
    only: ['POST /attendance/:id/decision'],
    pages: ['payroll'],
  },
  { key: 'admin.audit', group: 'Trang Quản lý', label: 'Nhật ký thao tác', byRole: () => false, read: ['audit-logs'], pages: ['audit'] },
];
export const CAPABILITY = Object.fromEntries(CAPABILITIES.map((c) => [c.key, c]));
const ADMIN_CAPS = CAPABILITIES.filter((c) => c.full || c.read || c.only);

/** Có quyền `key`? Chủ quán luôn có; đặt riêng (còn hạn) thắng mặc định theo vai trò. */
export function hasCap(user, key) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const g = user.grants?.find((x) => x.capability === key);
  if (g) return g.effect === 'ALLOW';
  return Boolean(CAPABILITY[key]?.byRole(user));
}
/** Mọi quyền đang có (gửi cho giao diện qua /auth/me để ẩn / hiện menu). */
export const capsOf = (user) => CAPABILITIES.filter((c) => hasCap(user, c.key)).map((c) => c.key);
export const hasAnyAdminCap = (user) => ADMIN_CAPS.some((c) => hasCap(user, c.key));

// Quyền quầy ↔ quyền cấp được (mặc định giống hệt bảng PERMISSIONS)
const PERMISSION_CAP = {
  'inventory.adjust': 'stock.count',
  'stocktake.post': 'stock.count',
  'attendance.edit': 'attendance.edit',
  'dashboard.view': 'dashboard.view',
};

export const can = (user, permission) =>
  Boolean(user) && (PERMISSION_CAP[permission] ? hasCap(user, PERMISSION_CAP[permission]) : Boolean(PERMISSIONS[permission]?.includes(user.role)));

const bearer = (req) => {
  const h = req.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
};

/** 403 kèm quyền cần (để giao diện mời "Xin quyền"). */
function noAccess(message, code, capability) {
  const cap = capability ? CAPABILITY[capability] : null;
  return new AppError(403, code, message, cap ? { capability: cap.key, capabilityLabel: cap.label } : undefined);
}

/** Middleware: cần quyền `permission` (401 chưa đăng nhập, 403 không đủ quyền). Mang `.permission` để trang Tra cứu API đọc (F-052). */
export function requirePermission(permission) {
  const middleware = async (req, _res, next) => {
    const user = req.user ?? (await userFromToken(bearer(req)));
    if (!user) throw unauthorized();
    if (!can(user, permission)) throw noAccess('Tài khoản của bạn không có quyền thực hiện thao tác này', 'FORBIDDEN', PERMISSION_CAP[permission]);
    req.user = withActorPin(req, user);
    next();
  };
  middleware.permission = permission;
  return middleware;
}

// ---- Trang Quản lý (/api/admin) ----
const pattern = (rule) => {
  const [method, p] = rule.split(' ');
  const re = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/:[^/]+/g, '/[^/]+')}/?$`);
  return { method, re };
};
function areaKey(path) {
  const seg = path.split('/').filter(Boolean);
  return ['reports', 'jobs'].includes(seg[0]) && seg.length > 1 ? `${seg[0]}/${seg[1]}` : (seg[0] ?? '');
}
const normMethod = (method) => (String(method).toUpperCase() === 'HEAD' ? 'GET' : String(method).toUpperCase());
const RULES = new Map(ADMIN_CAPS.map((c) => [c.key, { full: new Set(c.full ?? []), read: new Set(c.read ?? []), only: (c.only ?? []).map(pattern) }]));
/** Ai có ít nhất một quyền trang Quản lý: xem cài đặt (trang Thực đơn, In QR đọc), đổi phần vận hành (route tự giới hạn ô). */
const COMMON = { read: new Set(['settings']), only: ['PUT /settings'].map(pattern) };
/** Chặn với mọi người trừ chủ quán, dù nhóm đã mở. */
const DENY_RULES = ['POST /members/:id/anonymize', 'GET /alerts/mail-status'];
const DENY = DENY_RULES.map(pattern);
const ruleAllows = (r, m, path) => {
  const key = areaKey(path);
  return r.full?.has(key) || (m === 'GET' && r.read.has(key)) || r.only.some((o) => o.method === m && o.re.test(path));
};

/** Quyền trang Quản lý ứng với `method path` (để mời "Xin quyền"); null = chỉ chủ quán. */
export function capabilityForAdmin(method, path) {
  const m = normMethod(method);
  if (DENY.some((d) => d.method === m && d.re.test(path))) return null;
  return ADMIN_CAPS.find((c) => ruleAllows(RULES.get(c.key), m, path))?.key ?? null;
}

/** Người này gọi được `method path` dưới /api/admin? */
export function adminMay(user, method, path) {
  if (user?.role === 'ADMIN') return true;
  const m = normMethod(method);
  if (DENY.some((d) => d.method === m && d.re.test(path))) return false;
  const mine = ADMIN_CAPS.filter((c) => hasCap(user, c.key));
  if (!mine.length) return false;
  if ((m === 'GET' && COMMON.read.has(areaKey(path))) || COMMON.only.some((o) => o.method === m && o.re.test(path))) return true;
  return mine.some((c) => ruleAllows(RULES.get(c.key), m, path));
}

/** F-077: Quản lý cửa hàng (quyền mặc định, chưa đặt riêng) gọi được `method path`? — Tra cứu API ghi vai theo hàm này. */
export const storeManagerMay = (method, path) => adminMay({ role: 'STORE_MGR', grants: [] }, method, path);

/** Phần /api/admin mở mặc định cho Quản lý cửa hàng (tổng hợp từ CAPABILITIES — test kiểm khóa khớp route thật). */
const storeCaps = ADMIN_CAPS.filter((c) => c.byRole({ role: 'STORE_MGR' }));
const uniq = (a) => [...new Set(a)];
export const STORE_MGR_AREAS = {
  full: uniq(storeCaps.flatMap((c) => c.full ?? [])),
  read: uniq([...storeCaps.flatMap((c) => c.read ?? []), 'settings']),
  only: uniq([...storeCaps.flatMap((c) => c.only ?? []), 'PUT /settings']),
  deny: DENY_RULES,
};

/**
 * Middleware cho /api/admin (F-077, F-079): chủ quán mọi thứ; người khác theo quyền trang Quản lý đang có (mặc định theo vai + đặt riêng).
 * Không có quyền nào → 403 như trước; có quyền nhưng không đủ → 403 OWNER_ONLY. Có quyền cấp được → details.capability.
 * Trang Tra cứu API nhận ra middleware này qua `.adminArea`.
 */
export async function requireAdminArea(req, _res, next) {
  const user = await userFromToken(bearer(req));
  if (!user) throw unauthorized();
  if (!adminMay(user, req.method, req.path)) {
    const cap = capabilityForAdmin(req.method, req.path);
    const message = cap ? `Bạn chưa được cấp quyền "${CAPABILITY[cap].label}" — bấm Xin quyền để chủ quán duyệt` : 'Chức năng này chỉ chủ quán dùng được';
    if (!hasAnyAdminCap(user)) throw noAccess(cap ? message : 'Chỉ quản lý được truy cập chức năng này', 'FORBIDDEN', cap);
    throw noAccess(message, 'OWNER_ONLY', cap);
  }
  req.user = withActorPin(req, user);
  next();
}
requireAdminArea.adminArea = true;

/** Cài đặt người không phải chủ quán được đổi (vận hành quầy / bếp). Còn lại (giảm giá, ngưỡng duyệt, cảnh báo, Wi-Fi, tên quán…) — chủ quán. */
export const STORE_MGR_SETTINGS = [
  'acceptingOrders',
  'closedMessage',
  'etaBaseSeconds',
  'kitchenParallelism',
  'etaSpreadPercent',
  'etaDefaultItemSeconds',
  'oneTap',
  'menuSheetAll', // F-083
];

/** Loại cảnh báo chỉ chủ quán xem (khóa đăng nhập; giá món do quản lý cửa hàng đổi; cấp quyền dính tiền). */
export const OWNER_ONLY_ALERTS = ['AUTH_LOCK', 'PRICE_CHANGE', 'ACCESS_GRANT'];

/** Có ít nhất một trong các vị trí? (F-078; F-079: theo quyền pos.cashier / pos.barista / pos.server — đặt riêng được.) */
export const hasPosition = (user, ...positions) => positions.some((p) => hasCap(user, POSITION_CAP[p]));
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
      throw noAccess(`Việc này của vị trí ${names} — nhờ người đúng vị trí, trưởng ca, hoặc bấm Xin quyền`, 'POSITION_REQUIRED', POSITION_CAP[positions[0]]);
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
