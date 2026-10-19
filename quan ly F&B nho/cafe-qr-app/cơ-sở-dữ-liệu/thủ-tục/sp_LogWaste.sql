-- Phiếu hủy hàng (FEATURE-032; F-028 hủy lô hết hạn): trừ tồn + InventoryTransactions(ADJUST, Reason 'WASTE:…', WasteId) + WasteLogs,
-- cùng transaction. Không được đụng vào phần đang giữ cho đơn (ADR-001); nguyên liệu đang kiểm kê bị khóa (F-023).
-- @LotId: hủy đúng lô đó (mặc định toàn bộ phần còn lại của lô, lý do EXPIRED); không có → trừ FEFO.
-- Lỗi: 50041 INGREDIENT_NOT_FOUND, 50043 BELOW_RESERVED, 50104 STOCKTAKE_LOCKED, 50121 WASTE_INVALID, 50122 LOT_SHORT.
CREATE OR ALTER PROCEDURE dbo.sp_LogWaste
  @IngredientId INT = NULL,
  @Qty          DECIMAL(18,3) = NULL,
  @Reason       VARCHAR(20),
  @Note         NVARCHAR(200) = NULL,
  @LotId        INT = NULL,
  @UserId       INT,
  @WasteId      INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF @Reason NOT IN ('SPILL', 'EXPIRED', 'QUALITY', 'OTHER') THROW 50121, 'WASTE_INVALID', 1;

  BEGIN TRAN;

  IF @LotId IS NOT NULL
  BEGIN
    DECLARE @LotIng INT, @LotQty DECIMAL(18,3);
    SELECT @LotIng = IngredientId, @LotQty = Qty FROM dbo.IngredientLots WITH (UPDLOCK, HOLDLOCK) WHERE LotId = @LotId AND IsClosed = 0;
    IF @LotIng IS NULL OR (@IngredientId IS NOT NULL AND @IngredientId <> @LotIng) BEGIN ROLLBACK; THROW 50121, 'WASTE_INVALID', 1; END
    SET @IngredientId = @LotIng;
    SET @Qty = COALESCE(@Qty, @LotQty);
    IF @Qty > @LotQty BEGIN ROLLBACK; THROW 50121, 'WASTE_INVALID', 1; END
  END
  IF @Qty IS NULL OR @Qty <= 0 BEGIN ROLLBACK; THROW 50121, 'WASTE_INVALID', 1; END

  DECLARE @Stock DECIMAL(18,3), @Reserved DECIMAL(18,3), @Avg DECIMAL(18,4), @Track BIT;
  SELECT @Stock = StockQty, @Reserved = ReservedQty, @Avg = AvgCost, @Track = TrackLots
  FROM dbo.Ingredients WITH (UPDLOCK, HOLDLOCK) WHERE IngredientId = @IngredientId AND DeletedAt IS NULL;
  IF @Stock IS NULL BEGIN ROLLBACK; THROW 50041, 'INGREDIENT_NOT_FOUND', 1; END
  IF EXISTS (SELECT 1 FROM dbo.StocktakeLines l JOIN dbo.Stocktakes s ON s.StocktakeId = l.StocktakeId
             WHERE l.IngredientId = @IngredientId AND s.Status = 'DRAFT')
  BEGIN ROLLBACK; THROW 50104, 'STOCKTAKE_LOCKED', 1; END
  IF @Stock - @Qty < @Reserved BEGIN ROLLBACK; THROW 50043, 'BELOW_RESERVED', 1; END

  DECLARE @Method VARCHAR(10) = ISNULL((SELECT SettingValue FROM dbo.Settings WHERE SettingKey = N'cost.method'), 'AVG');
  INSERT dbo.WasteLogs (IngredientId, Qty, Reason, Note, LotId, CreatedBy) VALUES (@IngredientId, @Qty, @Reason, NULLIF(LTRIM(RTRIM(@Note)), ''), @LotId, @UserId);
  SET @WasteId = SCOPE_IDENTITY();

  UPDATE dbo.Ingredients SET StockQty = StockQty - @Qty WHERE IngredientId = @IngredientId;
  DECLARE @After DECIMAL(18,3) = @Stock - @Qty;
  DECLARE @ReasonText NVARCHAR(200) = LEFT(N'WASTE:' + @Reason + ISNULL(N' — ' + NULLIF(LTRIM(RTRIM(@Note)), ''), N''), 200);

  IF @Track = 1
  BEGIN
    CREATE TABLE #LotUse (IngredientId INT NOT NULL, LotId INT NOT NULL, Qty DECIMAL(18,3) NOT NULL, UnitCost DECIMAL(18,4) NOT NULL, Expired BIT NOT NULL);
    EXEC dbo.sp_LotConsume @IngredientId = @IngredientId, @Qty = @Qty, @LotId = @LotId;
    INSERT dbo.InventoryTransactions (IngredientId, Type, Delta, BalanceAfter, Reason, CreatedBy, WasteId, UnitCost, CostAmount, LotId)
    SELECT @IngredientId, 'ADJUST', -u.Qty, @After, @ReasonText, @UserId, @WasteId,
           CASE WHEN @Method = 'FIFO' THEN u.UnitCost ELSE @Avg END, ROUND(u.Qty * CASE WHEN @Method = 'FIFO' THEN u.UnitCost ELSE @Avg END, 2), u.LotId
    FROM #LotUse u;
  END
  ELSE
    INSERT dbo.InventoryTransactions (IngredientId, Type, Delta, BalanceAfter, Reason, CreatedBy, WasteId, UnitCost, CostAmount)
    VALUES (@IngredientId, 'ADJUST', -@Qty, @After, @ReasonText, @UserId, @WasteId, @Avg, ROUND(@Qty * @Avg, 2));

  UPDATE dbo.WasteLogs SET CostAmount = (SELECT SUM(CostAmount) FROM dbo.InventoryTransactions WHERE WasteId = @WasteId) WHERE WasteId = @WasteId;

  COMMIT;
END
