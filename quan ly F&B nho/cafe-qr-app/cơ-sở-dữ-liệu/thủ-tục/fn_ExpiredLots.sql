-- FEATURE-028 (ADR-006 D-20): lượng còn trong các lô ĐÃ HẾT HẠN của từng nguyên liệu (ExpiryDate < hôm nay giờ quán).
-- Khả dụng để bán = StockQty − ReservedQty − ExpiredQty (nguyên liệu không theo lô không có lô mở → 0).
CREATE OR ALTER FUNCTION dbo.tvf_ExpiredLotQty()
RETURNS TABLE
AS
RETURN
  SELECT l.IngredientId, SUM(l.Qty) AS ExpiredQty
  FROM dbo.IngredientLots l
  WHERE l.IsClosed = 0 AND l.Qty > 0 AND l.ExpiryDate < CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE)
  GROUP BY l.IngredientId;
