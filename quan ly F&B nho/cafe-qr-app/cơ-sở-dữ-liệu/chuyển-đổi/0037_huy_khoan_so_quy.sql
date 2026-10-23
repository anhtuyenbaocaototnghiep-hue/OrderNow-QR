-- 0037_huy_khoan_so_quy — FEATURE-050 hủy / sửa khoản sổ quỹ đã duyệt (ADR-010 D-44, D-45). Chỉ thêm cột / mở rộng CHECK.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_CashTxn_Status' AND definition LIKE '%VOIDED%')
BEGIN
  ALTER TABLE dbo.CashTransactions DROP CONSTRAINT CK_CashTxn_Status;
  ALTER TABLE dbo.CashTransactions ADD CONSTRAINT CK_CashTxn_Status CHECK (Status IN ('PENDING', 'APPROVED', 'REJECTED', 'VOIDED'));
END
IF COL_LENGTH('dbo.CashTransactions', 'VoidedBy') IS NULL
  ALTER TABLE dbo.CashTransactions ADD
    VoidedBy     INT NULL CONSTRAINT FK_CashTxn_VoidedBy REFERENCES dbo.Users(UserId),
    VoidedAt     DATETIME2(0) NULL,
    VoidReason   NVARCHAR(200) NULL,
    ReplacedById INT NULL CONSTRAINT FK_CashTxn_ReplacedBy REFERENCES dbo.CashTransactions(CashTxnId),   -- khoản thay thế (sửa)
    ReplacesId   INT NULL CONSTRAINT FK_CashTxn_Replaces REFERENCES dbo.CashTransactions(CashTxnId);     -- khoản bị thay
GO
-- Khoản đã hủy luôn có người / lúc / lý do; mỗi khoản bị thay tối đa một khoản thay thế (review G3)
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_CashTxn_Voided')
  ALTER TABLE dbo.CashTransactions ADD CONSTRAINT CK_CashTxn_Voided
    CHECK (Status <> 'VOIDED' OR (VoidedBy IS NOT NULL AND VoidedAt IS NOT NULL AND VoidReason IS NOT NULL));
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_CashTxn_Replaces' AND object_id = OBJECT_ID('dbo.CashTransactions'))
  CREATE UNIQUE INDEX UX_CashTxn_Replaces ON dbo.CashTransactions (ReplacesId) WHERE ReplacesId IS NOT NULL;
GO
