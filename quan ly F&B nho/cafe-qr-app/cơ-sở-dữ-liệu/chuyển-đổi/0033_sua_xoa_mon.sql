-- 0033_sua_xoa_mon — FEATURE-046 Sửa / xóa món đã gọi, hủy lượt phục vụ bàn (ADR-007 D-33…D-35).
-- Lịch sử mỗi lần bỏ món (dòng bị xóa hẳn khỏi đơn vẫn còn ảnh chụp ở đây); giao dịch kho VOID_BACK = hoàn kho món đã pha bị xóa.
IF OBJECT_ID('dbo.OrderItemVoids') IS NULL
BEGIN
  CREATE TABLE dbo.OrderItemVoids (
    VoidId        INT IDENTITY CONSTRAINT PK_OrderItemVoids PRIMARY KEY,
    OrderId       INT NOT NULL CONSTRAINT FK_Voids_Order REFERENCES dbo.Orders(OrderId),
    OrderItemId   INT NULL,                         -- không FK: dòng có thể đã bị xóa hẳn
    SessionId     UNIQUEIDENTIFIER NULL CONSTRAINT FK_Voids_Session REFERENCES dbo.Sessions(SessionId),
    MenuItemId    INT NOT NULL CONSTRAINT FK_Voids_MenuItem REFERENCES dbo.MenuItems(MenuItemId),
    ItemName      NVARCHAR(100) NOT NULL,
    Qty           INT NOT NULL CONSTRAINT CK_Voids_Qty CHECK (Qty > 0),
    UnitPrice     DECIMAL(12,0) NOT NULL,
    Amount        DECIMAL(12,0) NOT NULL,           -- Qty × UnitPrice (trước khuyến mãi đơn)
    OrderStatus   VARCHAR(10) NOT NULL,             -- trạng thái đơn lúc bỏ món
    StockMode     VARCHAR(10) NOT NULL CONSTRAINT CK_Voids_Stock CHECK (StockMode IN ('RELEASE', 'RESTOCK', 'WASTE')),
    CogsReduction DECIMAL(12,0) NOT NULL CONSTRAINT DF_Voids_Cogs DEFAULT 0,   -- giá vốn dòng giảm (hoàn kho / ghi hủy món đã pha)
    Reason        NVARCHAR(200) NOT NULL,
    ApprovedBy    INT NULL CONSTRAINT FK_Voids_ApprovedBy REFERENCES dbo.Users(UserId),
    CreatedBy     INT NOT NULL CONSTRAINT FK_Voids_CreatedBy REFERENCES dbo.Users(UserId),
    CreatedAt     DATETIME2(0) NOT NULL CONSTRAINT DF_Voids_At DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_Voids_Order ON dbo.OrderItemVoids (OrderId);
  CREATE INDEX IX_Voids_At ON dbo.OrderItemVoids (CreatedAt);
END
GO

-- Giao dịch kho VOID_BACK (≤ 10 ký tự): hoàn kho món đã pha bị xóa khỏi đơn chưa thu
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_InvTxn_Type' AND definition LIKE '%VOID_BACK%')
BEGIN
  ALTER TABLE dbo.InventoryTransactions DROP CONSTRAINT CK_InvTxn_Type;
  ALTER TABLE dbo.InventoryTransactions ADD CONSTRAINT CK_InvTxn_Type
    CHECK (Type IN ('DEDUCT', 'ADJUST', 'IMPORT', 'RESTOCK', 'PREP_OUT', 'PREP_IN', 'VOID_BACK'));
END
IF COL_LENGTH('dbo.InventoryTransactions', 'VoidId') IS NULL
  ALTER TABLE dbo.InventoryTransactions ADD VoidId INT NULL CONSTRAINT FK_InvTxn_Voids REFERENCES dbo.OrderItemVoids(VoidId);
IF COL_LENGTH('dbo.WasteLogs', 'VoidId') IS NULL
  ALTER TABLE dbo.WasteLogs ADD VoidId INT NULL CONSTRAINT FK_WasteLogs_Voids REFERENCES dbo.OrderItemVoids(VoidId);
IF COL_LENGTH('dbo.Sessions', 'CancelledBy') IS NULL
  ALTER TABLE dbo.Sessions ADD
    CancelledBy  INT NULL CONSTRAINT FK_Sessions_CancelledBy REFERENCES dbo.Users(UserId),
    CancelReason NVARCHAR(200) NULL;
GO
