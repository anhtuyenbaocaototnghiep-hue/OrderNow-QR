-- Hủy phiếu kiểm kê đã chốt (FEATURE-048, ADR-009 D-41) — một transaction: hoàn lại mọi chênh lệch đã điều chỉnh khi chốt
-- (ADJUST = −chênh lệch, cùng StocktakeId → Σ giao dịch của phiếu = 0), phiếu → VOIDED (báo cáo hao hụt / thất thoát bỏ qua).
-- Nguyên liệu theo lô (F-028): thiếu đã trừ lô → trả lại đúng các lô đó (phần không có lô — bật theo lô sau khi chốt — thành lô ADJUST mới);
--   thừa đã thành lô "Kiểm kê" → trừ lô đó trước rồi FEFO.
-- Điều kiện: phiếu đã chốt; là lần chốt gần nhất của mọi nguyên liệu trong phiếu; không nằm trong phiếu nháp khác; phần thừa còn đủ để trừ
--   (tồn − thừa ≥ đang giữ cho đơn).
-- Lỗi: 50104 STOCKTAKE_LOCKED (tên), 50195 không có phiếu, 50196 STOCKTAKE_NOT_POSTED, 50197 STOCKTAKE_NOT_LATEST (tên),
--      50198 STOCKTAKE_SURPLUS_USED (tên), 50199 thiếu lý do.
CREATE OR ALTER PROCEDURE dbo.sp_VoidStocktake
  @StocktakeId INT,
  @UserId      INT,
  @Reason      NVARCHAR(200)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  DECLARE @R NVARCHAR(200) = NULLIF(LTRIM(RTRIM(@Reason)), N'');
  IF @R IS NULL THROW 50199, 'REASON_REQUIRED', 1;

  BEGIN TRAN;

  DECLARE @Status VARCHAR(10), @PostedAt DATETIME2(0);
  SELECT @Status = Status, @PostedAt = PostedAt FROM dbo.Stocktakes WITH (UPDLOCK, HOLDLOCK) WHERE StocktakeId = @StocktakeId;
  IF @Status IS NULL BEGIN ROLLBACK; THROW 50195, 'STOCKTAKE_NOT_FOUND', 1; END
  IF @Status <> 'POSTED' BEGIN ROLLBACK; THROW 50196, 'STOCKTAKE_NOT_POSTED', 1; END

  DECLARE @Cur TABLE (IngredientId INT PRIMARY KEY, Name NVARCHAR(100), StockQty DECIMAL(18,3), ReservedQty DECIMAL(18,3), TrackLots BIT,
                      Diff DECIMAL(18,3), UnitCost DECIMAL(18,4));
  INSERT @Cur
  SELECT i.IngredientId, i.Name, i.StockQty, i.ReservedQty, i.TrackLots, l.Diff, l.UnitCost
  FROM dbo.Ingredients i WITH (UPDLOCK, HOLDLOCK)
  JOIN dbo.StocktakeLines l ON l.IngredientId = i.IngredientId AND l.StocktakeId = @StocktakeId;

  DECLARE @Names NVARCHAR(2000) = (
    SELECT STRING_AGG(c.Name, N', ') FROM @Cur c
    WHERE EXISTS (SELECT 1 FROM dbo.StocktakeLines l JOIN dbo.Stocktakes s ON s.StocktakeId = l.StocktakeId
                  WHERE l.IngredientId = c.IngredientId AND s.Status = 'DRAFT'));
  IF @Names IS NOT NULL BEGIN ROLLBACK; THROW 50104, @Names, 1; END

  SET @Names = (
    SELECT STRING_AGG(c.Name, N', ') FROM @Cur c
    WHERE EXISTS (SELECT 1 FROM dbo.StocktakeLines l JOIN dbo.Stocktakes s ON s.StocktakeId = l.StocktakeId
                  WHERE l.IngredientId = c.IngredientId AND s.Status = 'POSTED' AND s.StocktakeId <> @StocktakeId
                    AND (s.PostedAt > @PostedAt OR (s.PostedAt = @PostedAt AND s.StocktakeId > @StocktakeId))));
  IF @Names IS NOT NULL BEGIN ROLLBACK; THROW 50197, @Names, 1; END

  SET @Names = (SELECT STRING_AGG(c.Name, N', ') FROM @Cur c WHERE c.Diff > 0 AND c.StockQty - c.Diff < c.ReservedQty);
  IF @Names IS NOT NULL BEGIN ROLLBACK; THROW 50198, @Names, 1; END

  UPDATE ing SET StockQty = ing.StockQty - c.Diff
  FROM dbo.Ingredients ing JOIN @Cur c ON c.IngredientId = ing.IngredientId
  WHERE c.Diff <> 0;

  -- Thiếu (Diff < 0) của nguyên liệu theo lô: trả lại đúng các lô đã bị trừ khi chốt
  DECLARE @Back TABLE (IngredientId INT, LotId INT, Qty DECIMAL(18,3));
  INSERT @Back
  SELECT t.IngredientId, t.LotId, SUM(-t.Delta)
  FROM dbo.InventoryTransactions t JOIN @Cur c ON c.IngredientId = t.IngredientId
  WHERE t.StocktakeId = @StocktakeId AND t.Delta < 0 AND t.LotId IS NOT NULL AND c.TrackLots = 1 AND c.Diff < 0
  GROUP BY t.IngredientId, t.LotId;
  -- Lô đã đóng mà vẫn còn số (tắt theo lô rồi bật lại → tồn đã vào lô "Tồn đầu") không mở lại được: phần đó thành lô ADJUST mới (bên dưới)
  DELETE b FROM @Back b JOIN dbo.IngredientLots lot ON lot.LotId = b.LotId WHERE lot.IsClosed = 1 AND lot.Qty > 0;
  UPDATE lot SET Qty = lot.Qty + b.Qty, IsClosed = 0
  FROM dbo.IngredientLots lot WITH (UPDLOCK) JOIN @Back b ON b.LotId = lot.LotId;
  DECLARE @Rest TABLE (IngredientId INT, LotId INT, Qty DECIMAL(18,3));
  INSERT dbo.IngredientLots (IngredientId, LotCode, Qty, UnitCost, Source, SourceId)
  OUTPUT inserted.IngredientId, inserted.LotId, inserted.Qty INTO @Rest
  SELECT c.IngredientId, N'Hủy kiểm kê', -c.Diff - ISNULL(b.Q, 0), ISNULL(c.UnitCost, 0), 'ADJUST', @StocktakeId
  FROM @Cur c OUTER APPLY (SELECT SUM(Qty) AS Q FROM @Back WHERE IngredientId = c.IngredientId) b
  WHERE c.TrackLots = 1 AND c.Diff < 0 AND -c.Diff - ISNULL(b.Q, 0) > 0;

  -- Thừa (Diff > 0) của nguyên liệu theo lô: trừ lô "Kiểm kê" của phiếu trước, rồi FEFO
  CREATE TABLE #LotUse (IngredientId INT NOT NULL, LotId INT NOT NULL, Qty DECIMAL(18,3) NOT NULL, UnitCost DECIMAL(18,4) NOT NULL, Expired BIT NOT NULL);
  DECLARE @Id INT = (SELECT MIN(IngredientId) FROM @Cur WHERE TrackLots = 1 AND Diff > 0);
  DECLARE @Q DECIMAL(18,3), @Lot INT, @InLot DECIMAL(18,3), @Take DECIMAL(18,3);
  WHILE @Id IS NOT NULL
  BEGIN
    SET @Q = (SELECT Diff FROM @Cur WHERE IngredientId = @Id);
    SELECT @Lot = NULL, @InLot = NULL;
    SELECT TOP 1 @Lot = LotId, @InLot = Qty FROM dbo.IngredientLots WITH (UPDLOCK)
    WHERE IngredientId = @Id AND Source = 'ADJUST' AND SourceId = @StocktakeId AND IsClosed = 0 AND Qty > 0
    ORDER BY LotId;
    IF @Lot IS NOT NULL
    BEGIN
      SET @Take = CASE WHEN @InLot < @Q THEN @InLot ELSE @Q END;
      EXEC dbo.sp_LotConsume @IngredientId = @Id, @Qty = @Take, @LotId = @Lot;
      SET @Q -= @Take;
    END
    IF @Q > 0 EXEC dbo.sp_LotConsume @IngredientId = @Id, @Qty = @Q;
    SET @Id = (SELECT MIN(IngredientId) FROM @Cur WHERE TrackLots = 1 AND Diff > 0 AND IngredientId > @Id);
  END

  DECLARE @Txt NVARCHAR(200) = LEFT(N'Hủy kiểm kê #' + CAST(@StocktakeId AS NVARCHAR(10)) + N' — ' + @R, 200);
  INSERT dbo.InventoryTransactions (IngredientId, Type, Delta, BalanceAfter, Reason, CreatedBy, StocktakeId, UnitCost, CostAmount, LotId)
  SELECT c.IngredientId, 'ADJUST', -c.Diff, c.StockQty - c.Diff, @Txt, @UserId, @StocktakeId, c.UnitCost,
         ROUND(ABS(c.Diff) * ISNULL(c.UnitCost, 0), 2), NULL
  FROM @Cur c WHERE c.Diff <> 0 AND c.TrackLots = 0
  UNION ALL
  SELECT x.IngredientId, 'ADJUST', x.Qty, c.StockQty - c.Diff, @Txt, @UserId, @StocktakeId, c.UnitCost, ROUND(x.Qty * ISNULL(c.UnitCost, 0), 2), x.LotId
  FROM (SELECT IngredientId, LotId, Qty FROM @Back UNION ALL SELECT IngredientId, LotId, Qty FROM @Rest) x JOIN @Cur c ON c.IngredientId = x.IngredientId
  UNION ALL
  SELECT u.IngredientId, 'ADJUST', -u.Qty, c.StockQty - c.Diff, @Txt, @UserId, @StocktakeId, c.UnitCost, ROUND(u.Qty * ISNULL(c.UnitCost, 0), 2), u.LotId
  FROM #LotUse u JOIN @Cur c ON c.IngredientId = u.IngredientId;

  UPDATE dbo.Stocktakes SET Status = 'VOIDED', VoidedBy = @UserId, VoidedAt = SYSUTCDATETIME(), VoidReason = @R WHERE StocktakeId = @StocktakeId;

  COMMIT;
END
