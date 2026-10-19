-- Hoàn tất một mẻ sơ chế (FEATURE-027, ADR-006 D-19): trừ nguyên liệu đầu vào (PREP_OUT) + cộng bán thành phẩm (PREP_IN) trong
-- một transaction. Giá vốn mẻ = Σ giá vốn đầu vào (AVG, hoặc giá lô khi FIFO); giá vốn bán thành phẩm bình quân lại.
-- Khóa nguyên liệu theo IngredientId tăng dần; đầu vào phải đủ khả dụng (tồn − đang giữ − lô hết hạn). Bán thành phẩm theo lô → tạo lô
-- với hạn = lúc pha + ShelfLifeHours (F-028).
-- Lỗi: 50120 PREP_SHORT (message = tên nguyên liệu thiếu), 50123 NO_RECIPE, 50104 STOCKTAKE_LOCKED, 50122 LOT_SHORT.
CREATE OR ALTER PROCEDURE dbo.sp_PostPrepBatch
  @SemiIngredientId INT,
  @Multiplier       DECIMAL(9,3),
  @UserId           INT,
  @Note             NVARCHAR(200) = NULL,
  @BatchId          INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF @Multiplier IS NULL OR @Multiplier <= 0 OR @Multiplier > 100 THROW 50012, 'INVALID_ORDER', 1;

  BEGIN TRAN;

  DECLARE @OutPer DECIMAL(18,3) = (
    SELECT r.OutputQty FROM dbo.SemiRecipes r JOIN dbo.Ingredients i ON i.IngredientId = r.SemiIngredientId
    WHERE r.SemiIngredientId = @SemiIngredientId AND i.Kind = 'SEMI' AND i.DeletedAt IS NULL);
  IF @OutPer IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.SemiRecipeLines WHERE SemiIngredientId = @SemiIngredientId)
  BEGIN ROLLBACK; THROW 50123, 'NO_RECIPE', 1; END

  -- Khóa đầu vào + đầu ra theo IngredientId tăng dần
  DECLARE @Ing TABLE (IngredientId INT PRIMARY KEY, Name NVARCHAR(100), StockQty DECIMAL(18,3), ReservedQty DECIMAL(18,3), AvgCost DECIMAL(18,4),
                      TrackLots BIT, ShelfLifeHours INT, Need DECIMAL(18,3) NULL);
  INSERT @Ing (IngredientId, Name, StockQty, ReservedQty, AvgCost, TrackLots, ShelfLifeHours)
  SELECT i.IngredientId, i.Name, i.StockQty, i.ReservedQty, i.AvgCost, i.TrackLots, i.ShelfLifeHours
  FROM dbo.Ingredients i WITH (UPDLOCK, HOLDLOCK)
  WHERE i.IngredientId = @SemiIngredientId OR i.IngredientId IN (SELECT InputIngredientId FROM dbo.SemiRecipeLines WHERE SemiIngredientId = @SemiIngredientId)
  ORDER BY i.IngredientId;
  UPDATE x SET Need = ROUND(rl.Qty * @Multiplier, 3) FROM @Ing x JOIN dbo.SemiRecipeLines rl ON rl.InputIngredientId = x.IngredientId AND rl.SemiIngredientId = @SemiIngredientId;

  IF EXISTS (SELECT 1 FROM dbo.StocktakeLines l JOIN dbo.Stocktakes s ON s.StocktakeId = l.StocktakeId
             WHERE s.Status = 'DRAFT' AND l.IngredientId IN (SELECT IngredientId FROM @Ing))
  BEGIN ROLLBACK; THROW 50104, 'STOCKTAKE_LOCKED', 1; END

  DECLARE @Short NVARCHAR(2000) = (
    SELECT STRING_AGG(x.Name, N', ') FROM @Ing x LEFT JOIN dbo.tvf_ExpiredLotQty() e ON e.IngredientId = x.IngredientId
    WHERE x.Need IS NOT NULL AND x.StockQty - x.ReservedQty - ISNULL(e.ExpiredQty, 0) < x.Need);
  IF @Short IS NOT NULL BEGIN ROLLBACK; THROW 50120, @Short, 1; END

  DECLARE @Method VARCHAR(10) = ISNULL((SELECT SettingValue FROM dbo.Settings WHERE SettingKey = N'cost.method'), 'AVG');
  DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();
  DECLARE @OutQty DECIMAL(18,3) = ROUND(@OutPer * @Multiplier, 3);
  DECLARE @SemiShelf INT = (SELECT ShelfLifeHours FROM @Ing WHERE IngredientId = @SemiIngredientId);

  INSERT dbo.PrepBatches (SemiIngredientId, Multiplier, OutputQty, TotalCost, UnitCost, PreparedBy, PreparedAt, ExpiresAt, Note)
  VALUES (@SemiIngredientId, @Multiplier, @OutQty, 0, 0, @UserId, @Now,
          CASE WHEN @SemiShelf IS NOT NULL THEN DATEADD(HOUR, @SemiShelf, @Now) END, NULLIF(LTRIM(RTRIM(@Note)), ''));
  SET @BatchId = SCOPE_IDENTITY();

  -- Đầu vào: trừ tồn (lô FEFO nếu có)
  CREATE TABLE #LotUse (IngredientId INT NOT NULL, LotId INT NOT NULL, Qty DECIMAL(18,3) NOT NULL, UnitCost DECIMAL(18,4) NOT NULL, Expired BIT NOT NULL);
  DECLARE @Id INT = (SELECT MIN(IngredientId) FROM @Ing WHERE Need IS NOT NULL AND TrackLots = 1), @Q DECIMAL(18,3);
  WHILE @Id IS NOT NULL
  BEGIN
    SET @Q = (SELECT Need FROM @Ing WHERE IngredientId = @Id);
    EXEC dbo.sp_LotConsume @IngredientId = @Id, @Qty = @Q;
    SET @Id = (SELECT MIN(IngredientId) FROM @Ing WHERE Need IS NOT NULL AND TrackLots = 1 AND IngredientId > @Id);
  END

  DECLARE @AfterIn TABLE (IngredientId INT PRIMARY KEY, StockQty DECIMAL(18,3));
  UPDATE ing SET StockQty = ing.StockQty - x.Need
  OUTPUT inserted.IngredientId, inserted.StockQty INTO @AfterIn
  FROM dbo.Ingredients ing JOIN @Ing x ON x.IngredientId = ing.IngredientId WHERE x.Need IS NOT NULL;

  INSERT dbo.InventoryTransactions (IngredientId, Type, Delta, BalanceAfter, Reason, CreatedBy, PrepBatchId, UnitCost, CostAmount)
  SELECT x.IngredientId, 'PREP_OUT', -x.Need, a.StockQty, LEFT(N'Sơ chế #' + CAST(@BatchId AS NVARCHAR(10)), 200), @UserId, @BatchId,
         x.AvgCost, ROUND(x.Need * x.AvgCost, 2)
  FROM @Ing x JOIN @AfterIn a ON a.IngredientId = x.IngredientId WHERE x.Need IS NOT NULL AND x.TrackLots = 0;
  INSERT dbo.InventoryTransactions (IngredientId, Type, Delta, BalanceAfter, Reason, CreatedBy, PrepBatchId, UnitCost, CostAmount, LotId)
  SELECT u.IngredientId, 'PREP_OUT', -u.Qty, a.StockQty, LEFT(N'Sơ chế #' + CAST(@BatchId AS NVARCHAR(10)), 200), @UserId, @BatchId,
         CASE WHEN @Method = 'FIFO' THEN u.UnitCost ELSE x.AvgCost END, ROUND(u.Qty * CASE WHEN @Method = 'FIFO' THEN u.UnitCost ELSE x.AvgCost END, 2), u.LotId
  FROM #LotUse u JOIN @Ing x ON x.IngredientId = u.IngredientId JOIN @AfterIn a ON a.IngredientId = u.IngredientId;

  -- Đầu ra: giá vốn mẻ, bình quân lại giá vốn bán thành phẩm, lô mới (nếu theo lô)
  DECLARE @Total DECIMAL(18,2) = ISNULL((SELECT SUM(CostAmount) FROM dbo.InventoryTransactions WHERE PrepBatchId = @BatchId AND Type = 'PREP_OUT'), 0);
  DECLARE @Unit DECIMAL(18,4) = ROUND(@Total / @OutQty, 4);
  UPDATE dbo.PrepBatches SET TotalCost = @Total, UnitCost = @Unit WHERE BatchId = @BatchId;

  DECLARE @SemiAfter DECIMAL(18,3), @SemiLots BIT = (SELECT TrackLots FROM @Ing WHERE IngredientId = @SemiIngredientId), @LotId INT = NULL;
  UPDATE dbo.Ingredients
     SET AvgCost = CASE WHEN @Unit = 0 THEN AvgCost WHEN AvgCost = 0 OR StockQty <= 0 THEN @Unit
                        ELSE ROUND((StockQty * AvgCost + @OutQty * @Unit) / (StockQty + @OutQty), 4) END,
         StockQty = StockQty + @OutQty,
         @SemiAfter = StockQty + @OutQty
   WHERE IngredientId = @SemiIngredientId;
  IF @SemiLots = 1
  BEGIN
    INSERT dbo.IngredientLots (IngredientId, Qty, ExpiryDate, UnitCost, Source, SourceId)
    VALUES (@SemiIngredientId, @OutQty,
            CASE WHEN @SemiShelf IS NOT NULL THEN CAST(DATEADD(HOUR, 7 + @SemiShelf, @Now) AS DATE) END, @Unit, 'PREP', @BatchId);
    SET @LotId = SCOPE_IDENTITY();
  END
  INSERT dbo.InventoryTransactions (IngredientId, Type, Delta, BalanceAfter, Reason, CreatedBy, PrepBatchId, UnitCost, CostAmount, LotId)
  VALUES (@SemiIngredientId, 'PREP_IN', @OutQty, @SemiAfter, LEFT(N'Sơ chế #' + CAST(@BatchId AS NVARCHAR(10)), 200), @UserId, @BatchId, @Unit, @Total, @LotId);

  COMMIT;
END
