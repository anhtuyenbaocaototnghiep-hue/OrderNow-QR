-- 0021_hao_hut — FEATURE-032 Hao hụt định mức & phiếu hủy hàng (ADR-006).
-- Mỗi phiếu hủy trừ kho bằng InventoryTransactions(ADJUST, Reason 'WASTE:…', WasteId) trong cùng transaction (sp_LogWaste).
IF COL_LENGTH('dbo.Ingredients', 'WastePercent') IS NULL
  ALTER TABLE dbo.Ingredients ADD WastePercent DECIMAL(5,2) NOT NULL CONSTRAINT DF_Ingredients_Waste DEFAULT 0
    CONSTRAINT CK_Ingredients_Waste CHECK (WastePercent BETWEEN 0 AND 100);
GO
IF OBJECT_ID('dbo.WasteLogs') IS NULL
BEGIN
  CREATE TABLE dbo.WasteLogs (
    WasteId      INT IDENTITY CONSTRAINT PK_WasteLogs PRIMARY KEY,
    IngredientId INT NOT NULL CONSTRAINT FK_WasteLogs_Ingredient REFERENCES dbo.Ingredients(IngredientId),
    Qty          DECIMAL(18,3) NOT NULL CONSTRAINT CK_WasteLogs_Qty CHECK (Qty > 0),
    Reason       VARCHAR(20) NOT NULL CONSTRAINT CK_WasteLogs_Reason CHECK (Reason IN ('SPILL', 'EXPIRED', 'QUALITY', 'OTHER')),
    Note         NVARCHAR(200) NULL,
    CostAmount   DECIMAL(18,2) NULL,
    CreatedBy    INT NOT NULL CONSTRAINT FK_WasteLogs_User REFERENCES dbo.Users(UserId),
    CreatedAt    DATETIME2(0) NOT NULL CONSTRAINT DF_WasteLogs_At DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_WasteLogs_At ON dbo.WasteLogs (CreatedAt);
  CREATE INDEX IX_WasteLogs_Ingredient ON dbo.WasteLogs (IngredientId, CreatedAt);
END
GO
IF COL_LENGTH('dbo.InventoryTransactions', 'WasteId') IS NULL
  ALTER TABLE dbo.InventoryTransactions ADD WasteId INT NULL CONSTRAINT FK_InvTxn_Waste REFERENCES dbo.WasteLogs(WasteId);
GO
