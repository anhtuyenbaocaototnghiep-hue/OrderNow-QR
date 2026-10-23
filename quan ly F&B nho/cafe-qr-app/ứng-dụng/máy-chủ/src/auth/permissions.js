// Ma trận quyền (FEATURE-036, ADR-006 D-24). Server kiểm ở mọi endpoint; FE chỉ ẩn/hiện. Test sinh từ chính bảng này.
// STAFF < MANAGER (Trưởng ca) < ADMIN (Quản lý). Lệch docs F-018: STAFF vẫn mở/đóng ca (Q-022).
import { forbidden, unauthorized } from '../errors.js';
import { userFromToken } from '../middleware/auth.js';

export const ROLES = ['STAFF', 'MANAGER', 'ADMIN'];

const ALL = ['STAFF', 'MANAGER', 'ADMIN'];
const MGR = ['MANAGER', 'ADMIN'];

export const PERMISSIONS = {
  'pos.use': ALL, // bán, tiếp nhận, hoàn tất, thu tiền, mang đi, in
  'shift.manage': ALL, // mở / đóng ca (FEATURE-018 — Q-022)
  'cash.create': ALL, // ghi thu / chi quỹ (khoản lớn chờ duyệt — D-23)
  'cash.approve': MGR, // duyệt chi quỹ (MANAGER ≤ ngưỡng)
  'attendance.edit': MGR, // sửa chấm công (MANAGER trong ngày)
  'prep.post': ALL, // sơ chế
  'waste.create': ALL, // hủy hàng
  'po.receive': ALL, // nhận hàng theo PO
  'inventory.adjust': MGR, // điều chỉnh kho tay
  'stocktake.post': MGR, // kiểm kê: tạo, nhập số, chốt
  'dashboard.view': MGR, // /admin/today (MANAGER bản rút gọn — F-043)
  'admin.all': ['ADMIN'], // menu/giá/BOM/khuyến mãi/hội viên cấu hình, tài khoản, báo cáo tài chính, lãi/lỗ, audit
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
    req.user = user;
    next();
  };
  middleware.permission = permission;
  return middleware;
}

/** Ngưỡng giảm giá tay theo vai trò (D-14 nhân viên, D-24 trưởng ca; quản lý không giới hạn). */
export function discountLimits(role, settings) {
  if (role === 'ADMIN') return null;
  if (role === 'MANAGER') return { staffMaxPercent: settings.managerMaxPercent, staffMaxAmount: settings.managerMaxAmount };
  return { staffMaxPercent: settings.staffMaxPercent, staffMaxAmount: settings.staffMaxAmount };
}
