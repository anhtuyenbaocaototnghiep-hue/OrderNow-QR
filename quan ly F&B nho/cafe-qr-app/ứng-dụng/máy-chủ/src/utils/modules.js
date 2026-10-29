// F-061 (ADR-021 D-79): 5 nhóm mục nâng cao của menu quản lý — bật / tắt ở Cài đặt (khóa ui.modules).
// Chỉ ẩn giao diện (menu quản lý, mục quầy); quyền và API không đổi. Danh sách mục của từng nhóm ở public/js/admin-shell.js.
export const MODULES = ['inventory', 'customers', 'finance', 'analytics', 'advanced'];
