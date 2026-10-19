-- 0024_du_bao_nhap — FEATURE-029 Dự báo nhập hàng (ADR-006 D-22). Job 02:00 tính 14 ngày tới; ghi đè theo (nguyên liệu, ngày).
IF OBJECT_ID('dbo.DemandForecasts') IS NULL
  CREATE TABLE dbo.DemandForecasts (
    IngredientId INT NOT NULL CONSTRAINT FK_Forecasts_Ingredient REFERENCES dbo.Ingredients(IngredientId),
    ForecastDate DATE NOT NULL,                 -- ngày quán (giờ VN)
    ForecastQty  DECIMAL(18,3) NOT NULL CONSTRAINT CK_Forecasts_Qty CHECK (ForecastQty >= 0),
    Samples      INT NOT NULL,                  -- số tuần có dữ liệu cùng thứ (0 = không đủ dữ liệu)
    ComputedAt   DATETIME2(0) NOT NULL,
    CONSTRAINT PK_DemandForecasts PRIMARY KEY (IngredientId, ForecastDate)
  );
INSERT dbo.Settings (SettingKey, SettingValue)
SELECT k, v FROM (VALUES (N'forecast.safety_percent', N'20'), (N'forecast.weeks', N'4')) x(k, v)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Settings s WHERE s.SettingKey = x.k);
GO
