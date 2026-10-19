-- 0020_ban_thanh_pham — FEATURE-027 Bán thành phẩm / BOM 2 cấp / phiếu sơ chế (ADR-006 D-19).
-- Bán thành phẩm (cốt cà phê, syrup…) là một nguyên liệu Kind='SEMI' có công thức; BOM món trỏ vào SEMI như nguyên liệu thường.
IF COL_LENGTH('dbo.Ingredients', 'Kind') IS NULL
  ALTER TABLE dbo.Ingredients ADD
    Kind           VARCHAR(5) NOT NULL CONSTRAINT DF_Ingredients_Kind DEFAULT 'RAW' CONSTRAINT CK_Ingredients_Kind CHECK (Kind IN ('RAW', 'SEMI')),
    ShelfLifeHours INT NULL CONSTRAINT CK_Ingredients_ShelfLife CHECK (ShelfLifeHours IS NULL OR ShelfLifeHours BETWEEN 1 AND 8760);
GO
IF OBJECT_ID('dbo.SemiRecipes') IS NULL
BEGIN
  CREATE TABLE dbo.SemiRecipes (
    SemiIngredientId INT NOT NULL CONSTRAINT PK_SemiRecipes PRIMARY KEY CONSTRAINT FK_SemiRecipes_Ingredient REFERENCES dbo.Ingredients(IngredientId),
    OutputQty        DECIMAL(18,3) NOT NULL CONSTRAINT CK_SemiRecipes_Output CHECK (OutputQty > 0),   -- một mẻ ra bao nhiêu (đơn vị gốc của SEMI)
    Instructions     NVARCHAR(500) NULL
  );
  CREATE TABLE dbo.SemiRecipeLines (
    SemiIngredientId  INT NOT NULL CONSTRAINT FK_SemiRecipeLines_Recipe REFERENCES dbo.SemiRecipes(SemiIngredientId),
    InputIngredientId INT NOT NULL CONSTRAINT FK_SemiRecipeLines_Input REFERENCES dbo.Ingredients(IngredientId),
    Qty               DECIMAL(18,3) NOT NULL CONSTRAINT CK_SemiRecipeLines_Qty CHECK (Qty > 0),
    CONSTRAINT PK_SemiRecipeLines PRIMARY KEY (SemiIngredientId, InputIngredientId),
    CONSTRAINT CK_SemiRecipeLines_Self CHECK (SemiIngredientId <> InputIngredientId)
  );
  CREATE INDEX IX_SemiRecipeLines_Input ON dbo.SemiRecipeLines (InputIngredientId);
  CREATE TABLE dbo.PrepBatches (
    BatchId          INT IDENTITY CONSTRAINT PK_PrepBatches PRIMARY KEY,
    SemiIngredientId INT NOT NULL CONSTRAINT FK_PrepBatches_Ingredient REFERENCES dbo.Ingredients(IngredientId),
    Multiplier       DECIMAL(9,3) NOT NULL CONSTRAINT DF_PrepBatches_Mult DEFAULT 1 CONSTRAINT CK_PrepBatches_Mult CHECK (Multiplier > 0),
    OutputQty        DECIMAL(18,3) NOT NULL,
    TotalCost        DECIMAL(18,2) NOT NULL,
    UnitCost         DECIMAL(18,4) NOT NULL,
    PreparedBy       INT NOT NULL CONSTRAINT FK_PrepBatches_User REFERENCES dbo.Users(UserId),
    PreparedAt       DATETIME2(0) NOT NULL CONSTRAINT DF_PrepBatches_At DEFAULT SYSUTCDATETIME(),
    ExpiresAt        DATETIME2(0) NULL,
    Note             NVARCHAR(200) NULL
  );
  CREATE INDEX IX_PrepBatches_At ON dbo.PrepBatches (PreparedAt);
END
GO
ALTER TABLE dbo.InventoryTransactions DROP CONSTRAINT CK_InvTxn_Type;
ALTER TABLE dbo.InventoryTransactions ADD CONSTRAINT CK_InvTxn_Type CHECK (Type IN ('DEDUCT', 'ADJUST', 'IMPORT', 'RESTOCK', 'PREP_OUT', 'PREP_IN'));
IF COL_LENGTH('dbo.InventoryTransactions', 'PrepBatchId') IS NULL
  ALTER TABLE dbo.InventoryTransactions ADD PrepBatchId INT NULL CONSTRAINT FK_InvTxn_PrepBatches REFERENCES dbo.PrepBatches(BatchId);
GO
