-- 0039_chuyen_khoan_gop_hoa_don — ADR-019: thu bằng chuyển khoản (FEATURE-056), thu chung nhiều bàn (FEATURE-057).
-- Chỉ nới ràng buộc / thêm cột; dữ liệu cũ giữ nguyên (mọi lượt thu cũ là CASH).
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Payments_Method' AND definition NOT LIKE '%TRANSFER%')
BEGIN
  ALTER TABLE dbo.Payments DROP CONSTRAINT CK_Payments_Method;
  ALTER TABLE dbo.Payments ADD CONSTRAINT CK_Payments_Method CHECK (Method IN ('CASH', 'TRANSFER'));
END
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Orders_PaymentMethod' AND definition NOT LIKE '%TRANSFER%')
BEGIN
  ALTER TABLE dbo.Orders DROP CONSTRAINT CK_Orders_PaymentMethod;
  ALTER TABLE dbo.Orders ADD CONSTRAINT CK_Orders_PaymentMethod CHECK (PaymentMethod IN ('CASH', 'TRANSFER'));
END
GO

-- Phiên được thu chung vào phiên khác (F-057): đơn chuyển sang phiên đích, phiên này đóng và trỏ tới phiên đích
IF COL_LENGTH('dbo.Sessions', 'MergedIntoSessionId') IS NULL
  ALTER TABLE dbo.Sessions ADD MergedIntoSessionId UNIQUEIDENTIFIER NULL CONSTRAINT FK_Sessions_MergedInto REFERENCES dbo.Sessions(SessionId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sessions_MergedInto' AND object_id = OBJECT_ID('dbo.Sessions'))
  CREATE INDEX IX_Sessions_MergedInto ON dbo.Sessions (MergedIntoSessionId) WHERE MergedIntoSessionId IS NOT NULL;
GO
