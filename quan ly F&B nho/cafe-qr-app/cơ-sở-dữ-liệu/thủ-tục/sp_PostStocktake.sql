-- Chốt phiếu kiểm kê (FEATURE-023): DRAFT → POSTED. Chênh lệch tính theo tồn THỰC TẾ lúc chốt (đơn hoàn tất trong lúc đếm vẫn đúng);
-- mỗi chênh lệch ≠ 0 tạo InventoryTransactions(ADJUST). Không được đưa tồn xuống dưới phần đang giữ cho đơn (ADR-001).
-- ADR-006: giá vốn trên dòng ADJUST = AvgCost (F-031), hao hụt tính theo giá vốn bình quân; nguyên liệu theo lô (F-028):
--   thiếu → trừ lô FEFO, thừa → lô mới (ADJUST).
-- Lỗi: 50101 STOCKTAKE_NOT_DRAFT, 50102 STOCKTAKE_INCOMPLETE, 50103 BELOW_RESERVED (message = tên nguyên liệu), 50122 LOT_SHORT.
CREATE OR ALTER PROCEDURE dbo.sp_PostStocktake
  @StocktakeId INT,
  @UserId      INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  IF NOT EXISTS (SELECT 1 FROM dbo.Stocktakes WITH (UPDLOCK, HOLDLOCK) WHERE StocktakeId = @StocktakeId AND Status = 'DRAFT')
  BEGIN ROLLBACK; THROW 50101, 'STOCKTAKE_NOT_DRAFT', 1; END

  IF NOT EXISTS (SELECT 1 FROM dbo.StocktakeLines WHERE StocktakeId = @StocktakeId)
     OR EXISTS (SELECT 1 FROM dbo.StocktakeLines WHERE StocktakeId = @StocktakeId AND CountedQty IS NULL)
  BEGIN ROLLBACK; THROW 50102, 'STOCKTAKE_INCOMPLETE', 1; END

  -- Khóa nguyên liệu trong phiếu rồi kiểm phần đang giữ
  DECLARE @Cur TABLE (IngredientId INT PRIMARY KEY, StockQty DECIMAL(18,3), ReservedQty DECIMAL(18,3), Cost DECIMAL(18,4), Name NVARCHAR(100), TrackLots BIT);
  INSERT @Cur
  SELECT i.IngredientId, i.StockQty, i.ReservedQty, CASE WHEN i.AvgCost > 0 THEN i.AvgCost ELSE i.LastUnitCost END, i.Name, i.TrackLots
  FROM dbo.Ingredients i WITH (UPDLOCK, HOLDLOCK)
  JOIN dbo.StocktakeLines l ON l.IngredientId = i.IngredientId AND l.StocktakeId = @StocktakeId;

  DECLARE @Below NVARCHAR(2000) = (
    SELECT STRING_AGG(c.Name, N', ') FROM @Cur c JOIN dbo.StocktakeLines l ON l.IngredientId = c.IngredientId AND l.StocktakeId = @StocktakeId
    WHERE l.CountedQty < c.ReservedQty);
  IF @Below IS NOT NULL BEGIN ROLLBACK; THROW 50103, @Below, 1; END

  UPDATE l SET SystemQty = c.StockQty, Diff = l.CountedQty - c.StockQty, UnitCost = c.Cost
  FROM dbo.StocktakeLines l JOIN @Cur c ON c.IngredientId = l.IngredientId
  WHERE l.StocktakeId = @StocktakeId;

  UPDATE ing SET StockQty = l.CountedQty
  FROM dbo.Ingredients ing JOIN dbo.StocktakeLines l ON l.IngredientId = ing.IngredientId
  WHERE l.StocktakeId = @StocktakeId AND l.Diff <> 0;

  -- Nguyên liệu theo lô: thiếu → trừ FEFO; thừa → lô ADJUST
  CREATE TABLE #LotUse (IngredientId INT NOT NULL, LotId INT NOT NULL, Qty DECIMAL(18,3) NOT NULL, UnitCost DECIMAL(18,4) NOT NULL, Expired BIT NOT NULL);
  DECLARE @Id INT = (SELECT MIN(c.IngredientId) FROM @Cur c JOIN dbo.StocktakeLines l ON l.IngredientId = c.IngredientId AND l.StocktakeId = @StocktakeId
                     WHERE c.TrackLots = 1 AND l.Diff < 0), @Q DECIMAL(18,3);
  WHILE @Id IS NOT NULL
  BEGIN
    SET @Q = (SELECT -Diff FROM dbo.StocktakeLines WHERE StocktakeId = @StocktakeId AND IngredientId = @Id);
    EXEC dbo.sp_LotConsume @IngredientId = @Id, @Qty = @Q;
    SET @Id = (SELECT MIN(c.IngredientId) FROM @Cur c JOIN dbo.StocktakeLines l ON l.IngredientId = c.IngredientId AND l.StocktakeId = @StocktakeId
               WHERE c.TrackLots = 1 AND l.Diff < 0 AND c.IngredientId > @Id);
  END
  DECLARE @NewLots TABLE (LotId INT, IngredientId INT);
  INSERT dbo.IngredientLots (IngredientId, LotCode, Qty, UnitCost, Source, SourceId)
  OUTPUT inserted.LotId, inserted.IngredientId INTO @NewLots
  SELECT l.IngredientId, N'Kiểm kê', l.Diff, ISNULL(c.Cost, 0), 'ADJUST', @StocktakeId
  FROM dbo.StocktakeLines l JOIN @Cur c ON c.IngredientId = l.IngredientId
  WHERE l.StocktakeId = @StocktakeId AND c.TrackLots = 1 AND l.Diff > 0;

  INSERT dbo.InventoryTransactions (IngredientId, Type, Delta, BalanceAfter, Reason, CreatedBy, StocktakeId, UnitCost, CostAmount, LotId)
  SELECT l.IngredientId, 'ADJUST', l.Diff, l.CountedQty,
         LEFT(N'Kiểm kê #' + CAST(@StocktakeId AS NVARCHAR(10)) + ISNULL(N' — ' + l.Note, N''), 200), @UserId, @StocktakeId,
         c.Cost, ROUND(ABS(l.Diff) * ISNULL(c.Cost, 0), 2), n.LotId
  FROM dbo.StocktakeLines l JOIN @Cur c ON c.IngredientId = l.IngredientId LEFT JOIN @NewLots n ON n.IngredientId = l.IngredientId
  WHERE l.StocktakeId = @StocktakeId AND l.Diff <> 0 AND NOT (c.TrackLots = 1 AND l.Diff < 0);
  INSERT dbo.InventoryTransactions (IngredientId, Type, Delta, BalanceAfter, Reason, CreatedBy, StocktakeId, UnitCost, CostAmount, LotId)
  SELECT u.IngredientId, 'ADJUST', -u.Qty, l.CountedQty,
         LEFT(N'Kiểm kê #' + CAST(@StocktakeId AS NVARCHAR(10)) + ISNULL(N' — ' + l.Note, N''), 200), @UserId, @StocktakeId,
         c.Cost, ROUND(u.Qty * ISNULL(c.Cost, 0), 2), u.LotId
  FROM #LotUse u JOIN @Cur c ON c.IngredientId = u.IngredientId JOIN dbo.StocktakeLines l ON l.IngredientId = u.IngredientId AND l.StocktakeId = @StocktakeId;

  UPDATE dbo.Stocktakes SET Status = 'POSTED', PostedBy = @UserId, PostedAt = SYSUTCDATETIME() WHERE StocktakeId = @StocktakeId;

  COMMIT;
END
