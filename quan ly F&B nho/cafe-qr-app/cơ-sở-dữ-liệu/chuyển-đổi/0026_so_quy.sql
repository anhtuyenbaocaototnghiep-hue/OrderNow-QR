-- 0026_so_quy — FEATURE-033 Sổ quỹ: thu / chi tiền mặt ngoài bán hàng trong ca (ADR-006 D-23).
-- Chốt ca: ExpectedCash = OpeningCash + Σ thu bán − Σ hoàn + Σ thu khác + − Σ chi (đã duyệt); ca còn khoản chờ duyệt không đóng được.
IF OBJECT_ID('dbo.CashCategories') IS NULL
BEGIN
  CREATE TABLE dbo.CashCategories (
    CategoryId       INT IDENTITY CONSTRAINT PK_CashCategories PRIMARY KEY,
    Name             NVARCHAR(50) NOT NULL,
    Direction        CHAR(3) NOT NULL CONSTRAINT CK_CashCategories_Dir CHECK (Direction IN ('IN', 'OUT')),
    IsExpense        BIT NOT NULL CONSTRAINT DF_CashCategories_Expense DEFAULT 0,      -- tính vào chi phí lãi/lỗ (F-034)
    RequiresApproval BIT NOT NULL CONSTRAINT DF_CashCategories_Approval DEFAULT 0,     -- "Khác" luôn chờ duyệt (D-23)
    IsActive         BIT NOT NULL CONSTRAINT DF_CashCategories_Active DEFAULT 1,
    SortOrder        INT NOT NULL CONSTRAINT DF_CashCategories_Sort DEFAULT 0
  );
  CREATE TABLE dbo.CashTransactions (
    CashTxnId        INT IDENTITY CONSTRAINT PK_CashTransactions PRIMARY KEY,
    ShiftId          INT NOT NULL CONSTRAINT FK_CashTxn_Shift REFERENCES dbo.Shifts(ShiftId),
    CategoryId       INT NOT NULL CONSTRAINT FK_CashTxn_Category REFERENCES dbo.CashCategories(CategoryId),
    Direction        CHAR(3) NOT NULL CONSTRAINT CK_CashTxn_Dir CHECK (Direction IN ('IN', 'OUT')),
    Amount           DECIMAL(12,0) NOT NULL CONSTRAINT CK_CashTxn_Amount CHECK (Amount > 0),
    Reason           NVARCHAR(200) NOT NULL,
    ReceiptImagePath NVARCHAR(200) NULL,
    Status           VARCHAR(10) NOT NULL CONSTRAINT CK_CashTxn_Status CHECK (Status IN ('PENDING', 'APPROVED', 'REJECTED')),
    CreatedBy        INT NOT NULL CONSTRAINT FK_CashTxn_CreatedBy REFERENCES dbo.Users(UserId),
    CreatedAt        DATETIME2(0) NOT NULL CONSTRAINT DF_CashTxn_At DEFAULT SYSUTCDATETIME(),
    ApprovedBy       INT NULL CONSTRAINT FK_CashTxn_ApprovedBy REFERENCES dbo.Users(UserId),
    ApprovedAt       DATETIME2(0) NULL,
    RejectReason     NVARCHAR(200) NULL
  );
  CREATE INDEX IX_CashTxn_Shift ON dbo.CashTransactions (ShiftId, Status);
  CREATE INDEX IX_CashTxn_At ON dbo.CashTransactions (CreatedAt);

  INSERT dbo.CashCategories (Name, Direction, IsExpense, RequiresApproval, SortOrder) VALUES
    (N'Mua đá', 'OUT', 1, 0, 1), (N'Điện nước', 'OUT', 1, 0, 2), (N'Trả shipper', 'OUT', 1, 0, 3), (N'Lương tạm ứng', 'OUT', 1, 0, 4),
    (N'Mua vật tư nhỏ', 'OUT', 1, 0, 5), (N'Nộp tiền về két tổng', 'OUT', 0, 0, 6), (N'Khác (chi)', 'OUT', 1, 1, 9),
    (N'Bổ sung tiền lẻ', 'IN', 0, 0, 1), (N'Thu khác', 'IN', 0, 0, 9);
END
INSERT dbo.Settings (SettingKey, SettingValue)
SELECT N'cash.approve_threshold', N'500000' WHERE NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey = N'cash.approve_threshold');
GO
