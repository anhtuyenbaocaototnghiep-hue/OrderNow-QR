-- Hoàn tất đơn: PREPARING → COMPLETED và trừ kho đúng một lần (BR-001, BR-002, BR-013; ADR-001).
-- Lượng trừ lấy từ OrderIngredients (chụp lúc gửi đơn), trừ cả StockQty và ReservedQty.
-- Lỗi: 50001 ALREADY_PROCESSED, 50002 OUT_OF_STOCK, 50003 INVALID_STATE, 50004 ORDER_NOT_FOUND.
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

  -- 2. Trừ thật + trả giữ chỗ (khóa dòng Ingredients)
  DECLARE @NeedCount INT = (SELECT COUNT(*) FROM dbo.OrderIngredients WHERE OrderId = @OrderId);
  DECLARE @Done TABLE (IngredientId INT PRIMARY KEY, BalanceAfter DECIMAL(18,3) NOT NULL);

  IF @NeedCount > 0
  BEGIN
    UPDATE ing
       SET StockQty = ing.StockQty - r.Qty,
           ReservedQty = ing.ReservedQty - r.Qty
    OUTPUT inserted.IngredientId, inserted.StockQty INTO @Done (IngredientId, BalanceAfter)
    FROM dbo.Ingredients ing WITH (UPDLOCK, HOLDLOCK)
    JOIN dbo.OrderIngredients r ON r.IngredientId = ing.IngredientId
    WHERE r.OrderId = @OrderId AND ing.StockQty >= r.Qty AND ing.ReservedQty >= r.Qty;

    -- Với ADR-001 điều kiện luôn đúng (điều chỉnh kho không được xuống dưới ReservedQty); giữ để an toàn
    IF (SELECT COUNT(*) FROM @Done) <> @NeedCount
    BEGIN ROLLBACK; THROW 50002, 'OUT_OF_STOCK', 1; END

    -- 3. Nhật ký (unique index UX_InvTxn_Order_Ingredient chặn trừ 2 lần)
    INSERT dbo.InventoryTransactions (IngredientId, OrderId, Type, Delta, BalanceAfter, CreatedBy)
    SELECT r.IngredientId, @OrderId, 'DEDUCT', -r.Qty, d.BalanceAfter, @UserId
    FROM dbo.OrderIngredients r JOIN @Done d ON d.IngredientId = r.IngredientId
    WHERE r.OrderId = @OrderId;
  END

  COMMIT;

  SELECT r.IngredientId AS ingredientId, ing.Name AS name, ing.Unit AS unit, r.Qty AS qty,
         ing.StockQty - ing.ReservedQty AS available, ing.LowStockThreshold AS threshold
  FROM dbo.OrderIngredients r JOIN dbo.Ingredients ing ON ing.IngredientId = r.IngredientId
  WHERE r.OrderId = @OrderId
  ORDER BY r.IngredientId;
END
