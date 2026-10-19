-- 0013_nhap_kho_kiem_ke — FEATURE-023 Nhập kho (phiếu nhập) & kiểm kê; giá nhập gần nhất để tính giá vốn/hao hụt.
ALTER TABLE dbo.Ingredients ADD LastUnitCost DECIMAL(12,2) NULL;

CREATE TABLE dbo.StockReceipts (
  ReceiptId  INT IDENTITY CONSTRAINT PK_StockReceipts PRIMARY KEY,
  Supplier   NVARCHAR(100) NULL,
  ReceivedBy INT NOT NULL CONSTRAINT FK_StockReceipts_Users REFERENCES dbo.Users(UserId),
  ReceivedAt DATETIME2(0) NOT NULL CONSTRAINT DF_StockReceipts_At DEFAULT SYSUTCDATETIME(),
  Note       NVARCHAR(200) NULL
);
CREATE INDEX IX_StockReceipts_At ON dbo.StockReceipts (ReceivedAt);

CREATE TABLE dbo.StockReceiptLines (
  ReceiptId    INT NOT NULL CONSTRAINT FK_ReceiptLines_Receipts REFERENCES dbo.StockReceipts(ReceiptId),
  IngredientId INT NOT NULL CONSTRAINT FK_ReceiptLines_Ingredients REFERENCES dbo.Ingredients(IngredientId),
  Qty          DECIMAL(18,3) NOT NULL CONSTRAINT CK_ReceiptLines_Qty CHECK (Qty > 0),
  UnitCost     DECIMAL(12,2) NULL CONSTRAINT CK_ReceiptLines_Cost CHECK (UnitCost IS NULL OR UnitCost >= 0),
  CONSTRAINT PK_StockReceiptLines PRIMARY KEY (ReceiptId, IngredientId)
);

CREATE TABLE dbo.Stocktakes (
  StocktakeId INT IDENTITY CONSTRAINT PK_Stocktakes PRIMARY KEY,
  Status      VARCHAR(10) NOT NULL CONSTRAINT DF_Stocktakes_Status DEFAULT 'DRAFT' CONSTRAINT CK_Stocktakes_Status CHECK (Status IN ('DRAFT', 'POSTED')),
  Note        NVARCHAR(200) NULL,
  CountedBy   INT NOT NULL CONSTRAINT FK_Stocktakes_CountedBy REFERENCES dbo.Users(UserId),
  CountedAt   DATETIME2(0) NOT NULL CONSTRAINT DF_Stocktakes_At DEFAULT SYSUTCDATETIME(),
  PostedBy    INT NULL CONSTRAINT FK_Stocktakes_PostedBy REFERENCES dbo.Users(UserId),
  PostedAt    DATETIME2(0) NULL
);

CREATE TABLE dbo.StocktakeLines (
  StocktakeId  INT NOT NULL CONSTRAINT FK_StocktakeLines_Stocktakes REFERENCES dbo.Stocktakes(StocktakeId),
  IngredientId INT NOT NULL CONSTRAINT FK_StocktakeLines_Ingredients REFERENCES dbo.Ingredients(IngredientId),
  SystemQty    DECIMAL(18,3) NOT NULL,        -- lúc tạo phiếu; khi chốt cập nhật = tồn thực tế lúc chốt
  CountedQty   DECIMAL(18,3) NULL CONSTRAINT CK_StocktakeLines_Counted CHECK (CountedQty IS NULL OR CountedQty >= 0),
  Diff         DECIMAL(18,3) NULL,            -- CountedQty − tồn lúc chốt
  UnitCost     DECIMAL(12,2) NULL,            -- giá nhập gần nhất lúc chốt (tính hao hụt)
  Note         NVARCHAR(200) NULL,
  CONSTRAINT PK_StocktakeLines PRIMARY KEY (StocktakeId, IngredientId)
);
CREATE INDEX IX_StocktakeLines_Ingredient ON dbo.StocktakeLines (IngredientId);

ALTER TABLE dbo.InventoryTransactions ADD
  StockReceiptId INT NULL CONSTRAINT FK_InvTxn_Receipts REFERENCES dbo.StockReceipts(ReceiptId),
  StocktakeId    INT NULL CONSTRAINT FK_InvTxn_Stocktakes REFERENCES dbo.Stocktakes(StocktakeId);
GO

CREATE TYPE dbo.StockLineInput AS TABLE (
  IngredientId INT NOT NULL PRIMARY KEY,
  Qty          DECIMAL(18,3) NOT NULL,
  UnitCost     DECIMAL(12,2) NULL
);
GO
