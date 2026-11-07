-- FEATURE-028 (ADR-006 D-20): lượng còn trong các lô ĐÃ HẾT HẠN của từng nguyên liệu (ExpiryDate < hôm nay giờ quán).
-- Khả dụng để bán = StockQty − ReservedQty − ExpiredQty (nguyên liệu không theo lô không có lô mở → 0).
-- F-075 (ADR-033 D-148): cộng thêm phần còn của HỘP ĐANG MỞ đã quá hạn sau khi mở (OpenedAt + OpenShelfHours < bây giờ), tối đa bằng tồn.
--   Hộp mở thường lấy từ lô sớm hết hạn nhất (FEFO) nên hai phần có thể trùng → lấy phần lớn hơn (không trừ hai lần).
CREATE OR ALTER FUNCTION dbo.tvf_ExpiredLotQty()
RETURNS TABLE
AS
RETURN
  SELECT x.IngredientId, MAX(x.Qty) AS ExpiredQty
  FROM (
    SELECT l.IngredientId, SUM(l.Qty) AS Qty
    FROM dbo.IngredientLots l
    WHERE l.IsClosed = 0 AND l.Qty > 0 AND l.ExpiryDate < CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE)
    GROUP BY l.IngredientId
    UNION ALL
    SELECT i.IngredientId, CASE WHEN i.OpenLeft < i.StockQty THEN i.OpenLeft ELSE i.StockQty END
    FROM dbo.Ingredients i
    WHERE i.OpenLeft > 0 AND i.OpenShelfHours IS NOT NULL AND i.OpenedAt IS NOT NULL
      AND DATEADD(HOUR, i.OpenShelfHours, i.OpenedAt) < SYSUTCDATETIME()
  ) x
  GROUP BY x.IngredientId;
