-- 0061_chuyen_khoan_vietqr — FEATURE-099 (ADR-062 D-246): khách gọi thanh toán chọn "Chuyển khoản" (quét VietQR) hay "Tiền mặt".
-- Chỉ thêm cột: cách trả khách chọn lúc gọi thanh toán — quầy thấy "chuyển khoản" ở dải Gọi thanh toán và hộp Thu tiền chọn sẵn.
-- Không phải trạng thái thanh toán: chỉ nhân viên thu tiền (sp_SettleSession) mới ghi đã trả (D-3 giữ nguyên).
IF COL_LENGTH('dbo.Sessions', 'PayMethodHint') IS NULL
  ALTER TABLE dbo.Sessions ADD PayMethodHint VARCHAR(10) NULL;
GO
IF OBJECT_ID('dbo.CK_Sessions_PayMethodHint') IS NULL
  ALTER TABLE dbo.Sessions ADD CONSTRAINT CK_Sessions_PayMethodHint CHECK (PayMethodHint IS NULL OR PayMethodHint IN ('CASH', 'TRANSFER'));
GO
