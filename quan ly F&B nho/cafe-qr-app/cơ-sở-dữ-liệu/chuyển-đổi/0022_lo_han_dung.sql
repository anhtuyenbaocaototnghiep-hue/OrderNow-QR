-- 0022_lo_han_dung — FEATURE-028 Lô & hạn sử dụng, trừ kho FEFO (ADR-006 D-20, D-21 FIFO).
-- Bật theo nguyên liệu (TrackLots). Bất biến: Σ Qty lô mở = StockQty (nguyên liệu TrackLots). Lô hết hạn không tính vào khả dụng.
IF COL_LENGTH('dbo.Ingredients', 'TrackLots') IS NULL
  ALTER TABLE dbo.Ingredients ADD TrackLots BIT NOT NULL CONSTRAINT DF_Ingredients_TrackLots DEFAULT 0;
GO
IF OBJECT_ID('dbo.IngredientLots') IS NULL
BEGIN
  CREATE TABLE dbo.IngredientLots (
    LotId        INT IDENTITY CONSTRAINT PK_IngredientLots PRIMARY KEY,
    IngredientId INT NOT NULL CONSTRAINT FK_Lots_Ingredient REFERENCES dbo.Ingredients(IngredientId),
    LotCode      NVARCHAR(30) NULL,
    Qty          DECIMAL(18,3) NOT NULL CONSTRAINT CK_Lots_Qty CHECK (Qty >= 0),
    ExpiryDate   DATE NULL,
    UnitCost     DECIMAL(18,4) NOT NULL CONSTRAINT DF_Lots_Cost DEFAULT 0,
    Source       VARCHAR(10) NOT NULL CONSTRAINT CK_Lots_Source CHECK (Source IN ('RECEIPT', 'PREP', 'ADJUST', 'RESTOCK')),
    SourceId     INT NULL,
    ReceivedAt   DATETIME2(0) NOT NULL CONSTRAINT DF_Lots_At DEFAULT SYSUTCDATETIME(),
    IsClosed     BIT NOT NULL CONSTRAINT DF_Lots_Closed DEFAULT 0
  );
  CREATE INDEX IX_Lots_FEFO ON dbo.IngredientLots (IngredientId, IsClosed, ExpiryDate, ReceivedAt);
END
GO
IF COL_LENGTH('dbo.InventoryTransactions', 'LotId') IS NULL
  ALTER TABLE dbo.InventoryTransactions ADD LotId INT NULL CONSTRAINT FK_InvTxn_Lots REFERENCES dbo.IngredientLots(LotId);
IF COL_LENGTH('dbo.WasteLogs', 'LotId') IS NULL
  ALTER TABLE dbo.WasteLogs ADD LotId INT NULL CONSTRAINT FK_WasteLogs_Lots REFERENCES dbo.IngredientLots(LotId);
GO
-- Trừ theo lô có thể tách một DEDUCT thành nhiều dòng → khóa duy nhất (đơn, nguyên liệu, lô) vẫn chặn trừ 2 lần (BR-002)
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_InvTxn_Order_Ingredient' AND object_id = OBJECT_ID('dbo.InventoryTransactions'))
  DROP INDEX UX_InvTxn_Order_Ingredient ON dbo.InventoryTransactions;
CREATE UNIQUE INDEX UX_InvTxn_Order_Ingredient ON dbo.InventoryTransactions (OrderId, IngredientId, LotId) WHERE Type = 'DEDUCT';
GO
