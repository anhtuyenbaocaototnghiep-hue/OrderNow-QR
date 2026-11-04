-- 0047_ly_treo — FEATURE-070 ly treo, mua tặng bạn một ly (ADR-028 D-112…D-118). Chỉ thêm.
-- Voucher ly tặng: nguồn GIFT (không gắn hội viên, MenuItemId = món, DiscountAmount = tiền đã trả)
ALTER TABLE dbo.Vouchers DROP CONSTRAINT CK_Vouchers_Source;
ALTER TABLE dbo.Vouchers ADD CONSTRAINT CK_Vouchers_Source CHECK (Source IN ('REFERRAL', 'CAMPAIGN', 'MANUAL', 'GAME', 'BIRTHDAY', 'WINBACK', 'GIFT'));
GO

-- Danh mục sổ quỹ hệ thống: tiền mặt bán / hoàn ly tặng vào két (chốt ca khớp). Tìm theo SystemCode (quản lý đổi tên vẫn chạy);
-- IsActive = 0 → không hiện trong ô chọn tay của Sổ quỹ; IsExpense = 0 → không phải chi phí trong Lãi/lỗ.
IF COL_LENGTH('dbo.CashCategories', 'SystemCode') IS NULL
  ALTER TABLE dbo.CashCategories ADD SystemCode VARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM dbo.CashCategories WHERE SystemCode = 'GIFT_SALE')
  INSERT dbo.CashCategories (Name, Direction, IsExpense, RequiresApproval, IsActive, SortOrder, SystemCode)
  VALUES (N'Bán ly tặng', 'IN', 0, 0, 0, 90, 'GIFT_SALE');
IF NOT EXISTS (SELECT 1 FROM dbo.CashCategories WHERE SystemCode = 'GIFT_REFUND')
  INSERT dbo.CashCategories (Name, Direction, IsExpense, RequiresApproval, IsActive, SortOrder, SystemCode)
  VALUES (N'Hoàn ly tặng', 'OUT', 0, 0, 0, 90, 'GIFT_REFUND');
GO

IF OBJECT_ID('dbo.GiftDrinks') IS NULL
BEGIN
  CREATE TABLE dbo.GiftDrinks (
    GiftId          INT IDENTITY CONSTRAINT PK_GiftDrinks PRIMARY KEY,
    Token           CHAR(32)      NOT NULL,      -- link trang quà /qua/{token} (công khai)
    VoucherId       INT           NOT NULL CONSTRAINT FK_GiftDrinks_Voucher REFERENCES dbo.Vouchers(VoucherId),
    MenuItemId      INT           NOT NULL CONSTRAINT FK_GiftDrinks_MenuItem REFERENCES dbo.MenuItems(MenuItemId),
    Amount          DECIMAL(12,0) NOT NULL CONSTRAINT CK_GiftDrinks_Amount CHECK (Amount > 0),
    Method          VARCHAR(10)   NOT NULL CONSTRAINT CK_GiftDrinks_Method CHECK (Method IN ('CASH', 'TRANSFER')),
    ShiftId         INT           NOT NULL CONSTRAINT FK_GiftDrinks_Shift REFERENCES dbo.Shifts(ShiftId),
    CashTxnId       INT           NULL CONSTRAINT FK_GiftDrinks_CashTxn REFERENCES dbo.CashTransactions(CashTxnId),
    GiverName       NVARCHAR(60)  NULL,
    Message         NVARCHAR(150) NULL,
    CreatedBy       INT           NOT NULL CONSTRAINT FK_GiftDrinks_User REFERENCES dbo.Users(UserId),
    CreatedAt       DATETIME2(0)  NOT NULL CONSTRAINT DF_GiftDrinks_At DEFAULT SYSUTCDATETIME(),
    CancelledAt     DATETIME2(0)  NULL,
    CancelledBy     INT           NULL CONSTRAINT FK_GiftDrinks_CancelledBy REFERENCES dbo.Users(UserId),
    RefundCashTxnId INT           NULL CONSTRAINT FK_GiftDrinks_RefundTxn REFERENCES dbo.CashTransactions(CashTxnId)
  );
  CREATE UNIQUE INDEX UX_GiftDrinks_Token ON dbo.GiftDrinks (Token);
  CREATE UNIQUE INDEX UX_GiftDrinks_Voucher ON dbo.GiftDrinks (VoucherId);
  CREATE INDEX IX_GiftDrinks_Created ON dbo.GiftDrinks (CreatedAt);
END
GO
