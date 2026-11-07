-- 0054_vi_tri_cap_nhan_vien — FEATURE-078 phân quyền rõ ràng, đợt 2 (ADR-036 D-162…D-166). Chỉ thêm.
-- Vị trí của nhân viên (vai STAFF): CASHIER (Thu ngân), BARISTA (Pha chế), SERVER (Phục vụ) — lưu dạng 'CASHIER,BARISTA'; NULL = mọi vị trí
-- (tài khoản cũ giữ nguyên quyền). Cấp: PROBATION (Thử việc) / OFFICIAL (Chính thức, mặc định). Trưởng ca trở lên không dùng hai cột này.
IF COL_LENGTH('dbo.Users', 'Positions') IS NULL
  ALTER TABLE dbo.Users ADD
    Positions  VARCHAR(40) NULL CONSTRAINT CK_Users_Positions CHECK (Positions IS NULL OR (Positions <> '' AND Positions NOT LIKE '%[^A-Z,]%')),
    StaffLevel VARCHAR(10) NOT NULL CONSTRAINT DF_Users_StaffLevel DEFAULT 'OFFICIAL'
               CONSTRAINT CK_Users_StaffLevel CHECK (StaffLevel IN ('PROBATION', 'OFFICIAL'));
GO
