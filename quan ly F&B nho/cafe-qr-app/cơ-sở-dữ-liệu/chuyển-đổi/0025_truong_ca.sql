-- 0025_truong_ca — FEATURE-036 Vai Trưởng ca (MANAGER) và ma trận quyền (ADR-006 D-24). Quyền kiểm ở server (auth/permissions.js).
ALTER TABLE dbo.Users DROP CONSTRAINT CK_Users_Role;
ALTER TABLE dbo.Users ADD CONSTRAINT CK_Users_Role CHECK (Role IN ('STAFF', 'MANAGER', 'ADMIN'));
INSERT dbo.Settings (SettingKey, SettingValue)
SELECT k, v FROM (VALUES (N'manager.discount_max_percent', N'20'), (N'manager.discount_max_amount', N'50000'),
                         (N'manager.refund_same_shift_only', N'true'), (N'manager.cash_out_approve_max', N'2000000')) x(k, v)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Settings s WHERE s.SettingKey = x.k);
GO
