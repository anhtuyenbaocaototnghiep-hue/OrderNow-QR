-- Điều chỉnh tồn kho thủ công (Q-011/ADR-003): đặt số mới (@NewQty) HOẶC cộng/trừ (@Delta), kèm lý do.
-- Không cho âm (BR-001) và không thấp hơn phần đang giữ cho đơn (ADR-001). Ghi InventoryTransactions(ADJUST).
-- Lỗi: 50040 INVALID_ADJUSTMENT, 50041 INGREDIENT_NOT_FOUND, 50042 NEGATIVE_STOCK, 50043 BELOW_RESERVED.
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

  DECLARE @Stock DECIMAL(18,3), @Reserved DECIMAL(18,3);
  SELECT @Stock = StockQty, @Reserved = ReservedQty
  FROM dbo.Ingredients WITH (UPDLOCK, HOLDLOCK)
  WHERE IngredientId = @IngredientId AND DeletedAt IS NULL; -- đã xóa (ADR-004) → không tìm thấy

  IF @Stock IS NULL BEGIN ROLLBACK; THROW 50041, 'INGREDIENT_NOT_FOUND', 1; END

  DECLARE @Target DECIMAL(18,3) = COALESCE(@NewQty, @Stock + @Delta);
  IF @Target < 0 BEGIN ROLLBACK; THROW 50042, 'NEGATIVE_STOCK', 1; END
  IF @Target < @Reserved BEGIN ROLLBACK; THROW 50043, 'BELOW_RESERVED', 1; END
  IF @Target = @Stock BEGIN ROLLBACK; THROW 50040, 'INVALID_ADJUSTMENT', 1; END

  UPDATE dbo.Ingredients SET StockQty = @Target WHERE IngredientId = @IngredientId;

  INSERT dbo.InventoryTransactions (IngredientId, Type, Delta, BalanceAfter, Reason, CreatedBy)
  VALUES (@IngredientId, 'ADJUST', @Target - @Stock, @Target, NULLIF(LTRIM(RTRIM(@Reason)), ''), @UserId);

  SET @BalanceAfter = @Target;
  COMMIT;
END
