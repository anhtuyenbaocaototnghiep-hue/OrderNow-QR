-- 0059_so_dien_thoai_tai_khoan — FEATURE-091 (ADR-053 D-227): số điện thoại liên lạc của tài khoản nhân viên. Chỉ thêm cột, không đổi dữ liệu cũ.
-- Không bắt buộc (NULL = chưa có), lưu dạng chuẩn '+84' + 9 chữ số như SĐT hội viên (BR-024); không bắt trùng; chỉ chủ quán xem.
IF COL_LENGTH('dbo.Users', 'Phone') IS NULL
  ALTER TABLE dbo.Users ADD Phone VARCHAR(15) NULL;
GO
IF OBJECT_ID('dbo.CK_Users_Phone') IS NULL
  ALTER TABLE dbo.Users ADD CONSTRAINT CK_Users_Phone CHECK (Phone IS NULL OR Phone LIKE '+84[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');
GO
