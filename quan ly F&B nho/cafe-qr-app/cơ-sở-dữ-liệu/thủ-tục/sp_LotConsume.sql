-- FEATURE-028: trừ @Qty của một nguyên liệu theo lô FEFO (hết hạn sớm trước; lô còn hạn trước lô đã hết hạn; lô không hạn sau cùng).
-- @LotId: chỉ trừ từ lô đó (hủy lô hết hạn). Gọi TRONG transaction của SP khác, SAU khi đã khóa dòng Ingredients.
-- Ghi phần đã lấy vào bảng tạm #LotUse của SP gọi: (IngredientId, LotId, Qty, UnitCost, Expired).
-- Lỗi: 50122 LOT_SHORT (Σ lô < số cần — bất biến Σ lô = StockQty bị vi phạm).
CREATE OR ALTER PROCEDURE dbo.sp_LotConsume
  @IngredientId INT,
  @Qty          DECIMAL(18,3),
  @LotId        INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  IF @Qty IS NULL OR @Qty <= 0 RETURN;
  DECLARE @Today DATE = CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE);
  DECLARE @Lots TABLE (Seq INT IDENTITY PRIMARY KEY, LotId INT, Qty DECIMAL(18,3), UnitCost DECIMAL(18,4), Expired BIT);

  INSERT @Lots (LotId, Qty, UnitCost, Expired)
  SELECT LotId, Qty, UnitCost, CASE WHEN ExpiryDate < @Today THEN 1 ELSE 0 END
  FROM dbo.IngredientLots WITH (UPDLOCK, HOLDLOCK)
  WHERE IngredientId = @IngredientId AND IsClosed = 0 AND Qty > 0 AND (@LotId IS NULL OR LotId = @LotId)
  ORDER BY CASE WHEN ExpiryDate < @Today THEN 1 ELSE 0 END, CASE WHEN ExpiryDate IS NULL THEN 1 ELSE 0 END, ExpiryDate, ReceivedAt, LotId;

  DECLARE @Left DECIMAL(18,3) = @Qty, @Seq INT = 1, @Max INT = (SELECT COUNT(*) FROM @Lots);
  DECLARE @Id INT, @Avail DECIMAL(18,3), @Cost DECIMAL(18,4), @Exp BIT, @Take DECIMAL(18,3);
  WHILE @Left > 0 AND @Seq <= @Max
  BEGIN
    SELECT @Id = LotId, @Avail = Qty, @Cost = UnitCost, @Exp = Expired FROM @Lots WHERE Seq = @Seq;
    SET @Take = CASE WHEN @Avail < @Left THEN @Avail ELSE @Left END;
    UPDATE dbo.IngredientLots SET Qty = Qty - @Take, IsClosed = CASE WHEN Qty - @Take = 0 THEN 1 ELSE 0 END WHERE LotId = @Id;
    INSERT #LotUse (IngredientId, LotId, Qty, UnitCost, Expired) VALUES (@IngredientId, @Id, @Take, @Cost, @Exp);
    SET @Left -= @Take;
    SET @Seq += 1;
  END
  IF @Left > 0 THROW 50122, 'LOT_SHORT', 1;
END
