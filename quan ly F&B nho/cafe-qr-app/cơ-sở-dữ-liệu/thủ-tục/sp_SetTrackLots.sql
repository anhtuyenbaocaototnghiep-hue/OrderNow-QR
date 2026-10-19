-- Bật / tắt theo dõi lô cho một nguyên liệu (FEATURE-028).
-- Bật: tồn hiện có thành một lô mở đầu (Source ADJUST, không hạn, giá = AvgCost) → bất biến Σ lô mở = StockQty đúng ngay.
-- Tắt: đóng mọi lô (bất biến chỉ áp cho nguyên liệu đang theo lô).
-- Lỗi: 50041 INGREDIENT_NOT_FOUND.
CREATE OR ALTER PROCEDURE dbo.sp_SetTrackLots
  @IngredientId INT,
  @On           BIT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;
  DECLARE @Track BIT, @Stock DECIMAL(18,3), @Avg DECIMAL(18,4);
  SELECT @Track = TrackLots, @Stock = StockQty, @Avg = AvgCost FROM dbo.Ingredients WITH (UPDLOCK, HOLDLOCK)
  WHERE IngredientId = @IngredientId AND DeletedAt IS NULL;
  IF @Track IS NULL BEGIN ROLLBACK; THROW 50041, 'INGREDIENT_NOT_FOUND', 1; END
  IF @Track = @On BEGIN COMMIT; RETURN; END

  IF @On = 1
  BEGIN
    UPDATE dbo.IngredientLots SET IsClosed = 1 WHERE IngredientId = @IngredientId AND IsClosed = 0;
    IF @Stock > 0
      INSERT dbo.IngredientLots (IngredientId, LotCode, Qty, UnitCost, Source) VALUES (@IngredientId, N'Tồn đầu', @Stock, @Avg, 'ADJUST');
  END
  ELSE
    UPDATE dbo.IngredientLots SET IsClosed = 1 WHERE IngredientId = @IngredientId AND IsClosed = 0;

  UPDATE dbo.Ingredients SET TrackLots = @On WHERE IngredientId = @IngredientId;
  COMMIT;
END
