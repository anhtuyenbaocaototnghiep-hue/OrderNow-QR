-- 0007_tuy_chon_mon — FEATURE-013 Tùy chọn món / modifier (ADR-005 D-13): nhóm Min/Max, phụ thu và BOM cộng thêm.
CREATE TABLE dbo.ModifierGroups (
  GroupId   INT IDENTITY CONSTRAINT PK_ModifierGroups PRIMARY KEY,
  Name      NVARCHAR(50) NOT NULL,
  MinSelect INT NOT NULL CONSTRAINT DF_ModGroups_Min DEFAULT 0,
  MaxSelect INT NOT NULL CONSTRAINT DF_ModGroups_Max DEFAULT 1,
  SortOrder INT NOT NULL CONSTRAINT DF_ModGroups_Sort DEFAULT 0,
  DeletedAt DATETIME2(0) NULL,
  CONSTRAINT CK_ModGroups_MinMax CHECK (MinSelect >= 0 AND MaxSelect >= 1 AND MinSelect <= MaxSelect AND MaxSelect <= 20)
);

CREATE TABLE dbo.ModifierOptions (
  OptionId   INT IDENTITY CONSTRAINT PK_ModifierOptions PRIMARY KEY,
  GroupId    INT NOT NULL CONSTRAINT FK_ModOptions_Groups REFERENCES dbo.ModifierGroups(GroupId),
  Name       NVARCHAR(50) NOT NULL,
  PriceDelta DECIMAL(12,0) NOT NULL CONSTRAINT DF_ModOptions_Delta DEFAULT 0 CONSTRAINT CK_ModOptions_Delta CHECK (PriceDelta >= 0),
  IsDefault  BIT NOT NULL CONSTRAINT DF_ModOptions_Default DEFAULT 0,
  IsActive   BIT NOT NULL CONSTRAINT DF_ModOptions_Active DEFAULT 1,
  SortOrder  INT NOT NULL CONSTRAINT DF_ModOptions_Sort DEFAULT 0,
  DeletedAt  DATETIME2(0) NULL
);
CREATE INDEX IX_ModOptions_Group ON dbo.ModifierOptions (GroupId);

CREATE TABLE dbo.ModifierOptionBom (
  OptionId     INT NOT NULL CONSTRAINT FK_ModBom_Options REFERENCES dbo.ModifierOptions(OptionId),
  IngredientId INT NOT NULL CONSTRAINT FK_ModBom_Ingredients REFERENCES dbo.Ingredients(IngredientId),
  Amount       DECIMAL(18,3) NOT NULL CONSTRAINT CK_ModBom_Amount CHECK (Amount > 0),
  CONSTRAINT PK_ModifierOptionBom PRIMARY KEY (OptionId, IngredientId)
);
CREATE INDEX IX_ModBom_Ingredient ON dbo.ModifierOptionBom (IngredientId);

CREATE TABLE dbo.MenuItemModifierGroups (
  MenuItemId INT NOT NULL CONSTRAINT FK_ItemGroups_MenuItems REFERENCES dbo.MenuItems(MenuItemId),
  GroupId    INT NOT NULL CONSTRAINT FK_ItemGroups_Groups REFERENCES dbo.ModifierGroups(GroupId),
  CONSTRAINT PK_MenuItemModifierGroups PRIMARY KEY (MenuItemId, GroupId)
);

-- Snapshot tên + phụ thu lúc đặt (sửa tùy chọn sau đó không đổi đơn cũ)
CREATE TABLE dbo.OrderItemModifiers (
  OrderItemId INT NOT NULL CONSTRAINT FK_OrderItemMods_OrderItems REFERENCES dbo.OrderItems(OrderItemId),
  OptionId    INT NOT NULL CONSTRAINT FK_OrderItemMods_Options REFERENCES dbo.ModifierOptions(OptionId),
  OptionName  NVARCHAR(50) NOT NULL,
  PriceDelta  DECIMAL(12,0) NOT NULL,
  CONSTRAINT PK_OrderItemModifiers PRIMARY KEY (OrderItemId, OptionId)
);
GO

CREATE TYPE dbo.OrderLineOptionInput AS TABLE (
  LineNum  INT NOT NULL,
  OptionId INT NOT NULL,
  PRIMARY KEY (LineNum, OptionId)
);
GO
