-- 0053_quan_ly_cua_hang — FEATURE-077 phân quyền rõ ràng, đợt 1 (ADR-035 D-156…D-161). Chỉ thêm.
-- Thêm vai trò Quản lý cửa hàng (STORE_MGR) giữa Trưởng ca (MANAGER) và Chủ quán (ADMIN). Tài khoản cũ giữ nguyên vai trò và quyền.
-- Quyền kiểm ở server (src/auth/permissions.js — STORE_MGR_AREAS). Cảnh báo mới PRICE_CHANGE: quản lý cửa hàng đổi giá món → báo chủ quán.
ALTER TABLE dbo.Users DROP CONSTRAINT CK_Users_Role;
ALTER TABLE dbo.Users ADD CONSTRAINT CK_Users_Role CHECK (Role IN ('STAFF', 'MANAGER', 'STORE_MGR', 'ADMIN'));
GO

ALTER TABLE dbo.Alerts DROP CONSTRAINT CK_Alerts_Kind;
ALTER TABLE dbo.Alerts ADD CONSTRAINT CK_Alerts_Kind
  CHECK (Kind IN ('CASH_DIFF', 'TRANSFER_SHARE', 'VOIDS', 'REFUNDS', 'MANUAL_DISCOUNT', 'BIG_REFUND', 'CASH_VOID', 'COST_RISE', 'AUTH_LOCK', 'OFFLINE_SALE',
                  'EXPIRY_RISK', 'PRICE_CHANGE'));
GO
