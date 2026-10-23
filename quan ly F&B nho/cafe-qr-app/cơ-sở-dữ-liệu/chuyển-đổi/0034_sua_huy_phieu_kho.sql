-- 0034_sua_huy_phieu_kho — FEATURE-048 sửa / hủy phiếu nhập kho, hủy phiếu kiểm kê đã chốt (ADR-009 D-39…D-42).
-- Chỉ thêm cột / mở rộng CHECK: phiếu cũ mặc định POSTED, không đổi dữ liệu đã có.
IF COL_LENGTH('dbo.StockReceipts', 'Status') IS NULL
  ALTER TABLE dbo.StockReceipts ADD
    Status     VARCHAR(10) NOT NULL CONSTRAINT DF_StockReceipts_Status DEFAULT 'POSTED'
                 CONSTRAINT CK_StockReceipts_Status CHECK (Status IN ('POSTED', 'VOIDED')),
    VoidedBy   INT NULL CONSTRAINT FK_StockReceipts_VoidedBy REFERENCES dbo.Users(UserId),
    VoidedAt   DATETIME2(0) NULL,
    VoidReason NVARCHAR(200) NULL,
    EditedBy   INT NULL CONSTRAINT FK_StockReceipts_EditedBy REFERENCES dbo.Users(UserId),   -- lần sửa gần nhất
    EditedAt   DATETIME2(0) NULL,
    EditReason NVARCHAR(200) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Stocktakes_Status' AND definition LIKE '%VOIDED%')
BEGIN
  ALTER TABLE dbo.Stocktakes DROP CONSTRAINT CK_Stocktakes_Status;
  ALTER TABLE dbo.Stocktakes ADD CONSTRAINT CK_Stocktakes_Status CHECK (Status IN ('DRAFT', 'POSTED', 'VOIDED'));
END
IF COL_LENGTH('dbo.Stocktakes', 'VoidedBy') IS NULL
  ALTER TABLE dbo.Stocktakes ADD
    VoidedBy   INT NULL CONSTRAINT FK_Stocktakes_VoidedBy REFERENCES dbo.Users(UserId),
    VoidedAt   DATETIME2(0) NULL,
    VoidReason NVARCHAR(200) NULL;
GO

-- Tìm phiếu nhập theo nguyên liệu khi kiểm "phiếu nhập có giá mới nhất" (giá nhập gần nhất)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ReceiptLines_Ingredient' AND object_id = OBJECT_ID('dbo.StockReceiptLines'))
  CREATE INDEX IX_ReceiptLines_Ingredient ON dbo.StockReceiptLines (IngredientId);
GO
