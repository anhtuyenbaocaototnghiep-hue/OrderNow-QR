-- 0019_don_vi_gia_von — FEATURE-031 Đổi đơn vị & giá vốn bình quân (ADR-006 D-21).
-- Tồn kho / BOM luôn theo đơn vị gốc của nguyên liệu (BaseUnitCode = Unit). Đơn vị đóng gói quy đổi qua chuỗi Units (thùng → lon → ml).
-- AvgCost bình quân gia quyền cập nhật khi nhập; COGS dòng đơn (OrderItems.CogsAmount) chốt lúc hoàn tất.
IF OBJECT_ID('dbo.Units') IS NULL
  CREATE TABLE dbo.Units (
    UnitCode     NVARCHAR(10) NOT NULL CONSTRAINT PK_Units PRIMARY KEY,
    Name         NVARCHAR(30) NOT NULL,
    BaseUnitCode NVARCHAR(10) NULL CONSTRAINT FK_Units_Base REFERENCES dbo.Units(UnitCode),
    Factor       DECIMAL(18,6) NULL,          -- 1 UnitCode = Factor × BaseUnitCode
    CONSTRAINT CK_Units_Factor CHECK ((BaseUnitCode IS NULL AND Factor IS NULL) OR (BaseUnitCode IS NOT NULL AND Factor > 0 AND BaseUnitCode <> UnitCode))
  );
GO
-- Đơn vị gốc đang dùng + đơn vị quy đổi thường gặp
INSERT dbo.Units (UnitCode, Name)
SELECT x.c, x.n FROM (VALUES (N'ml', N'mililít'), (N'g', N'gam'), (N'cái', N'cái'), (N'miếng', N'miếng')) x(c, n)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Units u WHERE u.UnitCode = x.c);
INSERT dbo.Units (UnitCode, Name)
SELECT DISTINCT i.Unit, i.Unit FROM dbo.Ingredients i WHERE NOT EXISTS (SELECT 1 FROM dbo.Units u WHERE u.UnitCode = i.Unit);
INSERT dbo.Units (UnitCode, Name, BaseUnitCode, Factor)
SELECT x.c, x.n, x.b, x.f FROM (VALUES (N'l', N'lít', N'ml', 1000), (N'kg', N'kilôgam', N'g', 1000), (N'lon', N'lon 330ml', N'ml', 330),
                                       (N'thùng', N'thùng 24 lon', N'lon', 24)) x(c, n, b, f)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Units u WHERE u.UnitCode = x.c);
GO
IF COL_LENGTH('dbo.Ingredients', 'BaseUnitCode') IS NULL
  ALTER TABLE dbo.Ingredients ADD
    BaseUnitCode NVARCHAR(10) NULL CONSTRAINT FK_Ingredients_Units REFERENCES dbo.Units(UnitCode),
    AvgCost      DECIMAL(18,4) NOT NULL CONSTRAINT DF_Ingredients_AvgCost DEFAULT 0 CONSTRAINT CK_Ingredients_AvgCost CHECK (AvgCost >= 0);
IF COL_LENGTH('dbo.StockReceiptLines', 'PackUnitCode') IS NULL
  ALTER TABLE dbo.StockReceiptLines ADD
    PackUnitCode NVARCHAR(10) NULL CONSTRAINT FK_ReceiptLines_Units REFERENCES dbo.Units(UnitCode),
    PackQty      DECIMAL(18,3) NULL,        -- số lượng theo đơn vị đóng gói (vd. 2 thùng)
    PackPrice    DECIMAL(14,2) NULL;        -- giá / đơn vị đóng gói
IF COL_LENGTH('dbo.InventoryTransactions', 'UnitCost') IS NULL
  ALTER TABLE dbo.InventoryTransactions ADD
    UnitCost   DECIMAL(18,4) NULL,          -- giá vốn / đơn vị gốc của dòng (AVG hoặc giá lô khi FIFO)
    CostAmount DECIMAL(18,2) NULL;          -- giá trị = |Delta| × UnitCost
IF COL_LENGTH('dbo.OrderItems', 'CogsAmount') IS NULL
  ALTER TABLE dbo.OrderItems ADD CogsAmount DECIMAL(12,0) NULL;   -- giá vốn dòng, chốt lúc hoàn tất (NULL = chưa biết giá)
GO
UPDATE dbo.Ingredients SET BaseUnitCode = Unit WHERE BaseUnitCode IS NULL;
UPDATE dbo.Ingredients SET AvgCost = LastUnitCost WHERE AvgCost = 0 AND LastUnitCost IS NOT NULL;
INSERT dbo.Settings (SettingKey, SettingValue)
SELECT N'cost.method', N'AVG' WHERE NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey = N'cost.method');
GO
