-- 0023_nha_cung_cap — FEATURE-030 Nhà cung cấp & đơn đặt hàng (PO) (ADR-006).
-- Nhận hàng theo PO đi qua sp_ReceiveStock (@PoId): cộng ReceivedBaseQty, chuyển PARTIAL / RECEIVED, lưu lịch sử giá.
IF OBJECT_ID('dbo.Suppliers') IS NULL
BEGIN
  CREATE TABLE dbo.Suppliers (
    SupplierId       INT IDENTITY CONSTRAINT PK_Suppliers PRIMARY KEY,
    Name             NVARCHAR(100) NOT NULL,
    Phone            VARCHAR(20) NULL,
    Email            NVARCHAR(100) NULL,
    LeadTimeDays     INT NOT NULL CONSTRAINT DF_Suppliers_Lead DEFAULT 1 CONSTRAINT CK_Suppliers_Lead CHECK (LeadTimeDays BETWEEN 0 AND 60),
    DeliveryDaysMask TINYINT NOT NULL CONSTRAINT DF_Suppliers_Days DEFAULT 127 CONSTRAINT CK_Suppliers_Days CHECK (DeliveryDaysMask BETWEEN 1 AND 127),
    Note             NVARCHAR(200) NULL,
    IsActive         BIT NOT NULL CONSTRAINT DF_Suppliers_Active DEFAULT 1,
    CreatedAt        DATETIME2(0) NOT NULL CONSTRAINT DF_Suppliers_At DEFAULT SYSUTCDATETIME()
  );
  CREATE TABLE dbo.SupplierIngredients (
    SupplierId   INT NOT NULL CONSTRAINT FK_SupIng_Supplier REFERENCES dbo.Suppliers(SupplierId),
    IngredientId INT NOT NULL CONSTRAINT FK_SupIng_Ingredient REFERENCES dbo.Ingredients(IngredientId),
    PackUnitCode NVARCHAR(10) NOT NULL CONSTRAINT FK_SupIng_Unit REFERENCES dbo.Units(UnitCode),
    PackSize     DECIMAL(18,3) NOT NULL CONSTRAINT CK_SupIng_Pack CHECK (PackSize > 0),   -- 1 gói = PackSize đơn vị gốc
    LastPrice    DECIMAL(14,2) NULL,                                                      -- giá / gói gần nhất
    IsPreferred  BIT NOT NULL CONSTRAINT DF_SupIng_Pref DEFAULT 0,
    CONSTRAINT PK_SupplierIngredients PRIMARY KEY (SupplierId, IngredientId)
  );
  CREATE UNIQUE INDEX UX_SupIng_Preferred ON dbo.SupplierIngredients (IngredientId) WHERE IsPreferred = 1;
  CREATE TABLE dbo.PurchaseOrders (
    PoId         INT IDENTITY CONSTRAINT PK_PurchaseOrders PRIMARY KEY,
    SupplierId   INT NOT NULL CONSTRAINT FK_PO_Supplier REFERENCES dbo.Suppliers(SupplierId),
    Status       VARCHAR(10) NOT NULL CONSTRAINT DF_PO_Status DEFAULT 'DRAFT'
                   CONSTRAINT CK_PO_Status CHECK (Status IN ('DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED')),
    ExpectedDate DATE NULL,
    CreatedBy    INT NOT NULL CONSTRAINT FK_PO_CreatedBy REFERENCES dbo.Users(UserId),
    CreatedAt    DATETIME2(0) NOT NULL CONSTRAINT DF_PO_At DEFAULT SYSUTCDATETIME(),
    SentAt       DATETIME2(0) NULL,
    ReceivedAt   DATETIME2(0) NULL,          -- lúc nhận đủ (RECEIVED)
    Note         NVARCHAR(200) NULL
  );
  CREATE INDEX IX_PO_Status ON dbo.PurchaseOrders (Status, ExpectedDate);
  CREATE TABLE dbo.PurchaseOrderLines (
    PoLineId        INT IDENTITY CONSTRAINT PK_PurchaseOrderLines PRIMARY KEY,
    PoId            INT NOT NULL CONSTRAINT FK_POL_PO REFERENCES dbo.PurchaseOrders(PoId),
    IngredientId    INT NOT NULL CONSTRAINT FK_POL_Ingredient REFERENCES dbo.Ingredients(IngredientId),
    PackUnitCode    NVARCHAR(10) NOT NULL CONSTRAINT FK_POL_Unit REFERENCES dbo.Units(UnitCode),
    PackSize        DECIMAL(18,3) NOT NULL CONSTRAINT CK_POL_PackSize CHECK (PackSize > 0),
    OrderedPacks    DECIMAL(18,3) NOT NULL CONSTRAINT CK_POL_Packs CHECK (OrderedPacks > 0),
    OrderedBaseQty  DECIMAL(18,3) NOT NULL,
    ReceivedBaseQty DECIMAL(18,3) NOT NULL CONSTRAINT DF_POL_Received DEFAULT 0 CONSTRAINT CK_POL_Received CHECK (ReceivedBaseQty >= 0),
    UnitPrice       DECIMAL(14,2) NULL,      -- giá / gói dự kiến
    CONSTRAINT UQ_POL_Ingredient UNIQUE (PoId, IngredientId)
  );
  CREATE TABLE dbo.SupplierPriceHistory (
    PriceId      INT IDENTITY CONSTRAINT PK_SupplierPriceHistory PRIMARY KEY,
    SupplierId   INT NOT NULL CONSTRAINT FK_SPH_Supplier REFERENCES dbo.Suppliers(SupplierId),
    IngredientId INT NOT NULL CONSTRAINT FK_SPH_Ingredient REFERENCES dbo.Ingredients(IngredientId),
    PackUnitCode NVARCHAR(10) NULL,
    PackPrice    DECIMAL(14,2) NULL,
    UnitCost     DECIMAL(18,4) NOT NULL,     -- / đơn vị gốc
    ReceiptId    INT NULL CONSTRAINT FK_SPH_Receipt REFERENCES dbo.StockReceipts(ReceiptId),
    RecordedAt   DATETIME2(0) NOT NULL CONSTRAINT DF_SPH_At DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_SPH_Ingredient ON dbo.SupplierPriceHistory (IngredientId, RecordedAt);
END
GO
IF COL_LENGTH('dbo.StockReceipts', 'PoId') IS NULL
  ALTER TABLE dbo.StockReceipts ADD
    PoId       INT NULL CONSTRAINT FK_StockReceipts_PO REFERENCES dbo.PurchaseOrders(PoId),
    SupplierId INT NULL CONSTRAINT FK_StockReceipts_Supplier REFERENCES dbo.Suppliers(SupplierId);
IF COL_LENGTH('dbo.StockReceiptLines', 'PoLineId') IS NULL
  ALTER TABLE dbo.StockReceiptLines ADD
    PoLineId   INT NULL CONSTRAINT FK_ReceiptLines_POL REFERENCES dbo.PurchaseOrderLines(PoLineId),
    ExpiryDate DATE NULL,                    -- F-028: hạn dùng lô nhập
    LotId      INT NULL CONSTRAINT FK_ReceiptLines_Lot REFERENCES dbo.IngredientLots(LotId);
GO
