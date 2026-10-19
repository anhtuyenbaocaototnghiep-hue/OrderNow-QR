-- Hoàn tất đơn: PREPARING → COMPLETED và trừ kho đúng một lần (BR-001, BR-002, BR-013; ADR-001).
-- Lượng trừ lấy từ OrderIngredients (chụp lúc gửi đơn), trừ cả StockQty và ReservedQty.
-- ADR-006: nguyên liệu theo lô (F-028) trừ FEFO → một dòng DEDUCT mỗi lô; mỗi dòng DEDUCT ghi giá vốn (F-031: AVG, hoặc giá lô khi
--   cost.method = FIFO); giá vốn đơn chia cho các dòng món (OrderItems.CogsAmount) theo định lượng × giá vốn — chốt lúc hoàn tất (D-21).
-- Lỗi: 50001 ALREADY_PROCESSED, 50002 OUT_OF_STOCK, 50003 INVALID_STATE, 50004 ORDER_NOT_FOUND, 50122 LOT_SHORT.
-- Trả về result set: nguyên liệu đã trừ + khả dụng sau trừ (để app phát inventory.low).
CREATE OR ALTER PROCEDURE dbo.sp_CompleteOrder
  @OrderId INT,
  @UserId  INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  -- 1. Đổi trạng thái có điều kiện: chỉ một client thắng
  UPDATE dbo.Orders
     SET Status = 'COMPLETED', CompletedAt = SYSUTCDATETIME(), CompletedBy = @UserId
   WHERE OrderId = @OrderId AND Status = 'PREPARING';

  IF @@ROWCOUNT = 0
  BEGIN
    ROLLBACK;
    DECLARE @Current VARCHAR(10) = (SELECT Status FROM dbo.Orders WHERE OrderId = @OrderId);
    IF @Current IS NULL THROW 50004, 'ORDER_NOT_FOUND', 1;
    IF @Current = 'COMPLETED' THROW 50001, 'ALREADY_PROCESSED', 1;
    THROW 50003, 'INVALID_STATE', 1;
  END

  DECLARE @Method VARCHAR(10) = ISNULL((SELECT SettingValue FROM dbo.Settings WHERE SettingKey = N'cost.method'), 'AVG');

  -- 2. Trừ thật + trả giữ chỗ (khóa dòng Ingredients)
  DECLARE @NeedCount INT = (SELECT COUNT(*) FROM dbo.OrderIngredients WHERE OrderId = @OrderId);
  DECLARE @Done TABLE (IngredientId INT PRIMARY KEY, BalanceAfter DECIMAL(18,3) NOT NULL, TrackLots BIT NOT NULL, AvgCost DECIMAL(18,4) NOT NULL);

  IF @NeedCount > 0
  BEGIN
    UPDATE ing
       SET StockQty = ing.StockQty - r.Qty,
           ReservedQty = ing.ReservedQty - r.Qty
    OUTPUT inserted.IngredientId, inserted.StockQty, inserted.TrackLots, inserted.AvgCost INTO @Done (IngredientId, BalanceAfter, TrackLots, AvgCost)
    FROM dbo.Ingredients ing WITH (UPDLOCK, HOLDLOCK)
    JOIN dbo.OrderIngredients r ON r.IngredientId = ing.IngredientId
    WHERE r.OrderId = @OrderId AND ing.StockQty >= r.Qty AND ing.ReservedQty >= r.Qty;

    -- Với ADR-001 điều kiện luôn đúng (điều chỉnh kho không được xuống dưới ReservedQty); giữ để an toàn
    IF (SELECT COUNT(*) FROM @Done) <> @NeedCount
    BEGIN ROLLBACK; THROW 50002, 'OUT_OF_STOCK', 1; END

    -- 3a. Nguyên liệu theo lô: tiêu thụ FEFO
    CREATE TABLE #LotUse (IngredientId INT NOT NULL, LotId INT NOT NULL, Qty DECIMAL(18,3) NOT NULL, UnitCost DECIMAL(18,4) NOT NULL, Expired BIT NOT NULL);
    DECLARE @LotIng INT = (SELECT MIN(IngredientId) FROM @Done WHERE TrackLots = 1), @LotQty DECIMAL(18,3);
    WHILE @LotIng IS NOT NULL
    BEGIN
      SET @LotQty = (SELECT Qty FROM dbo.OrderIngredients WHERE OrderId = @OrderId AND IngredientId = @LotIng);
      EXEC dbo.sp_LotConsume @IngredientId = @LotIng, @Qty = @LotQty;
      SET @LotIng = (SELECT MIN(IngredientId) FROM @Done WHERE TrackLots = 1 AND IngredientId > @LotIng);
    END

    -- 3b. Nhật ký + giá vốn (unique index (đơn, nguyên liệu, lô) chặn trừ 2 lần)
    INSERT dbo.InventoryTransactions (IngredientId, OrderId, Type, Delta, BalanceAfter, CreatedBy, UnitCost, CostAmount)
    SELECT r.IngredientId, @OrderId, 'DEDUCT', -r.Qty, d.BalanceAfter, @UserId, d.AvgCost, ROUND(r.Qty * d.AvgCost, 2)
    FROM dbo.OrderIngredients r JOIN @Done d ON d.IngredientId = r.IngredientId
    WHERE r.OrderId = @OrderId AND d.TrackLots = 0;

    INSERT dbo.InventoryTransactions (IngredientId, OrderId, Type, Delta, BalanceAfter, CreatedBy, UnitCost, CostAmount, LotId)
    SELECT u.IngredientId, @OrderId, 'DEDUCT', -u.Qty, d.BalanceAfter, @UserId,
           CASE WHEN @Method = 'FIFO' THEN u.UnitCost ELSE d.AvgCost END,
           ROUND(u.Qty * CASE WHEN @Method = 'FIFO' THEN u.UnitCost ELSE d.AvgCost END, 2), u.LotId
    FROM #LotUse u JOIN @Done d ON d.IngredientId = u.IngredientId;

    -- 4. Giá vốn dòng món (F-031): chia tổng giá vốn đơn theo trọng số định lượng × giá vốn hiện tại.
    --    Có nguyên liệu chưa biết giá (giá vốn 0) → để NULL (báo cáo tự ước tính / gắn cờ).
    IF NOT EXISTS (SELECT 1 FROM dbo.InventoryTransactions WHERE OrderId = @OrderId AND Type = 'DEDUCT' AND ISNULL(UnitCost, 0) = 0)
    BEGIN
      DECLARE @W TABLE (OrderItemId INT PRIMARY KEY, W DECIMAL(38,6) NOT NULL);
      INSERT @W (OrderItemId, W)
      SELECT x.TopId, SUM(x.Need * ing.AvgCost)
      FROM (
        SELECT oi.OrderItemId AS TopId, b.IngredientId, oi.Quantity * b.Amount AS Need
        FROM dbo.OrderItems oi JOIN dbo.MenuItems m ON m.MenuItemId = oi.MenuItemId AND m.ItemType = 'SINGLE'
        JOIN dbo.BomItems b ON b.MenuItemId = oi.MenuItemId
        WHERE oi.OrderId = @OrderId AND oi.ParentOrderItemId IS NULL
        UNION ALL
        SELECT c.ParentOrderItemId, b.IngredientId, c.Quantity * b.Amount
        FROM dbo.OrderItems c JOIN dbo.BomItems b ON b.MenuItemId = c.MenuItemId
        WHERE c.OrderId = @OrderId AND c.ParentOrderItemId IS NOT NULL
        UNION ALL
        SELECT oi.OrderItemId, ob.IngredientId, oi.Quantity * ob.Amount
        FROM dbo.OrderItemModifiers im JOIN dbo.OrderItems oi ON oi.OrderItemId = im.OrderItemId
        JOIN dbo.ModifierOptionBom ob ON ob.OptionId = im.OptionId
        WHERE oi.OrderId = @OrderId) x
      JOIN dbo.Ingredients ing ON ing.IngredientId = x.IngredientId
      GROUP BY x.TopId
      HAVING SUM(x.Need * ing.AvgCost) > 0;

      DECLARE @C DECIMAL(18,2) = (SELECT SUM(CostAmount) FROM dbo.InventoryTransactions WHERE OrderId = @OrderId AND Type = 'DEDUCT');
      DECLARE @SW DECIMAL(38,6) = (SELECT SUM(W) FROM @W);
      IF @SW > 0 AND @C > 0
      BEGIN
        UPDATE oi SET CogsAmount = ROUND(@C * w.W / @SW, 0) FROM dbo.OrderItems oi JOIN @W w ON w.OrderItemId = oi.OrderItemId;
        DECLARE @Diff DECIMAL(12,0) = ROUND(@C, 0) - (SELECT SUM(oi.CogsAmount) FROM dbo.OrderItems oi JOIN @W w ON w.OrderItemId = oi.OrderItemId);
        IF @Diff <> 0
          UPDATE dbo.OrderItems SET CogsAmount = CogsAmount + @Diff
          WHERE OrderItemId = (SELECT TOP 1 OrderItemId FROM @W ORDER BY W DESC, OrderItemId);
      END
    END
  END

  COMMIT;

  SELECT r.IngredientId AS ingredientId, ing.Name AS name, ing.Unit AS unit, r.Qty AS qty,
         ing.StockQty - ing.ReservedQty AS available, ing.LowStockThreshold AS threshold
  FROM dbo.OrderIngredients r JOIN dbo.Ingredients ing ON ing.IngredientId = r.IngredientId
  WHERE r.OrderId = @OrderId
  ORDER BY r.IngredientId;
END
