-- Điều chỉnh tồn kho thủ công (Q-011/ADR-003): đặt số mới (@NewQty) HOẶC cộng/trừ (@Delta), kèm lý do.
-- Không cho âm (BR-001) và không thấp hơn phần đang giữ cho đơn (ADR-001). Ghi InventoryTransactions(ADJUST).
-- Nguyên liệu đang nằm trong phiếu kiểm kê DRAFT → khóa điều chỉnh tay (FEATURE-023).
-- ADR-006: giá vốn trên dòng ADJUST (F-031); nguyên liệu theo lô (F-028): giảm → trừ lô FEFO, tăng → lô mới (ADJUST, giá = AvgCost).
-- Lỗi: 50040 INVALID_ADJUSTMENT, 50041 INGREDIENT_NOT_FOUND, 50042 NEGATIVE_STOCK, 50043 BELOW_RESERVED, 50104 STOCKTAKE_LOCKED.
CREATE OR ALTER PROCEDURE dbo.sp_AdjustInventory
  @IngredientId INT,
  @NewQty       DECIMAL(18,3) = NULL,
  @Delta        DECIMAL(18,3) = NULL,
  @Reason       NVARCHAR(200),
  @UserId       INT,
  @BalanceAfter DECIMAL(18,3) OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF (@NewQty IS NULL AND @Delta IS NULL) OR (@NewQty IS NOT NULL AND @Delta IS NOT NULL)
    THROW 50040, 'INVALID_ADJUSTMENT', 1;

  BEGIN TRAN;

  DECLARE @Stock DECIMAL(18,3), @Reserved DECIMAL(18,3), @Avg DECIMAL(18,4), @Track BIT;
  SELECT @Stock = StockQty, @Reserved = ReservedQty, @Avg = AvgCost, @Track = TrackLots
  FROM dbo.Ingredients WITH (UPDLOCK, HOLDLOCK)
  WHERE IngredientId = @IngredientId AND DeletedAt IS NULL; -- đã xóa (ADR-004) → không tìm thấy

  IF @Stock IS NULL BEGIN ROLLBACK; THROW 50041, 'INGREDIENT_NOT_FOUND', 1; END
  IF EXISTS (SELECT 1 FROM dbo.StocktakeLines l JOIN dbo.Stocktakes s ON s.StocktakeId = l.StocktakeId
             WHERE l.IngredientId = @IngredientId AND s.Status = 'DRAFT')
  BEGIN ROLLBACK; THROW 50104, 'STOCKTAKE_LOCKED', 1; END

  DECLARE @Target DECIMAL(18,3) = COALESCE(@NewQty, @Stock + @Delta);
  IF @Target < 0 BEGIN ROLLBACK; THROW 50042, 'NEGATIVE_STOCK', 1; END
  IF @Target < @Reserved BEGIN ROLLBACK; THROW 50043, 'BELOW_RESERVED', 1; END
  IF @Target = @Stock BEGIN ROLLBACK; THROW 50040, 'INVALID_ADJUSTMENT', 1; END

  UPDATE dbo.Ingredients SET StockQty = @Target WHERE IngredientId = @IngredientId;
  DECLARE @Diff DECIMAL(18,3) = @Target - @Stock, @R NVARCHAR(200) = NULLIF(LTRIM(RTRIM(@Reason)), '');

  IF @Track = 1 AND @Diff < 0
  BEGIN
    CREATE TABLE #LotUse (IngredientId INT NOT NULL, LotId INT NOT NULL, Qty DECIMAL(18,3) NOT NULL, UnitCost DECIMAL(18,4) NOT NULL, Expired BIT NOT NULL);
    DECLARE @Out DECIMAL(18,3) = -@Diff;
    EXEC dbo.sp_LotConsume @IngredientId = @IngredientId, @Qty = @Out;
    INSERT dbo.InventoryTransactions (IngredientId, Type, Delta, BalanceAfter, Reason, CreatedBy, UnitCost, CostAmount, LotId)
    SELECT @IngredientId, 'ADJUST', -u.Qty, @Target, @R, @UserId, @Avg, ROUND(u.Qty * @Avg, 2), u.LotId FROM #LotUse u;
  END
  ELSE
  BEGIN
    DECLARE @NewLot INT = NULL;
    IF @Track = 1
    BEGIN
      INSERT dbo.IngredientLots (IngredientId, LotCode, Qty, UnitCost, Source) VALUES (@IngredientId, N'Điều chỉnh', @Diff, @Avg, 'ADJUST');
      SET @NewLot = SCOPE_IDENTITY();
    END
    INSERT dbo.InventoryTransactions (IngredientId, Type, Delta, BalanceAfter, Reason, CreatedBy, UnitCost, CostAmount, LotId)
    VALUES (@IngredientId, 'ADJUST', @Diff, @Target, @R, @UserId, @Avg, ROUND(ABS(@Diff) * @Avg, 2), @NewLot);
  END

  SET @BalanceAfter = @Target;
  COMMIT;
END
