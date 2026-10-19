-- Phiếu nhập kho (FEATURE-023): mỗi dòng cộng tồn + ghi InventoryTransactions(IMPORT) + cập nhật giá nhập gần nhất, trong một transaction.
-- ADR-006:
--   F-031 dòng có đơn vị đóng gói (PackUnitCode/PackQty/PackPrice, service đã quy ra đơn vị gốc Qty/UnitCost); giá vốn bình quân
--         AvgCost = (tồn × AvgCost + nhập × giá) / (tồn + nhập) — chưa biết giá (AvgCost = 0) hoặc tồn ≤ 0 → lấy giá nhập; IMPORT ghi giá vốn.
--   F-028 nguyên liệu theo lô → mỗi dòng tạo một lô (hạn dùng: nhập tay, hoặc hôm nay + ShelfLifeHours).
--   F-030 nhận theo PO (@PoId): dòng trỏ PoLineId; cộng ReceivedBaseQty; PO → PARTIAL / RECEIVED; nhận vượt cần @ConfirmOver;
--         lưu lịch sử giá nhà cung cấp + giá gần nhất.
-- Dòng truyền qua @LinesJson (mới) hoặc TVP @Lines (cũ — vẫn chạy).
-- Lỗi: 50100 INVALID_RECEIPT (message = danh sách IngredientId sai/đã xóa, hoặc 'EMPTY'/'QTY'/'DUP'), 50130 PO_NOT_FOUND,
--      50131 OVER_RECEIPT (message = tên nguyên liệu), 50133 PO_NOT_RECEIVABLE.
CREATE OR ALTER PROCEDURE dbo.sp_ReceiveStock
  @Supplier    NVARCHAR(100) = NULL,
  @Note        NVARCHAR(200) = NULL,
  @UserId      INT,
  @Lines       dbo.StockLineInput READONLY,
  @LinesJson   NVARCHAR(MAX) = NULL,
  @PoId        INT = NULL,
  @SupplierId  INT = NULL,
  @ConfirmOver BIT = 0,
  @ReceiptId   INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  DECLARE @L TABLE (
    IngredientId INT NOT NULL, Qty DECIMAL(18,3) NOT NULL, UnitCost DECIMAL(18,4) NULL, PackUnitCode NVARCHAR(10) NULL, PackQty DECIMAL(18,3) NULL,
    PackPrice DECIMAL(14,2) NULL, ExpiryDate DATE NULL, LotCode NVARCHAR(30) NULL, PoLineId INT NULL);
  IF @LinesJson IS NOT NULL
    INSERT @L
    SELECT ingredientId, qty, unitCost, packUnitCode, packQty, packPrice, TRY_CAST(expiryDate AS DATE), lotCode, poLineId
    FROM OPENJSON(@LinesJson) WITH (ingredientId INT, qty DECIMAL(18,3), unitCost DECIMAL(18,4), packUnitCode NVARCHAR(10), packQty DECIMAL(18,3),
                                    packPrice DECIMAL(14,2), expiryDate VARCHAR(10), lotCode NVARCHAR(30), poLineId INT);
  ELSE
    INSERT @L (IngredientId, Qty, UnitCost) SELECT IngredientId, Qty, UnitCost FROM @Lines;

  IF NOT EXISTS (SELECT 1 FROM @L) THROW 50100, 'EMPTY', 1;
  IF EXISTS (SELECT 1 FROM @L WHERE IngredientId IS NULL OR Qty IS NULL OR Qty <= 0 OR UnitCost < 0) THROW 50100, 'QTY', 1;
  IF EXISTS (SELECT IngredientId FROM @L GROUP BY IngredientId HAVING COUNT(*) > 1) THROW 50100, 'DUP', 1;

  BEGIN TRAN;

  -- F-030: PO còn nhận được, dòng đúng PO, không nhận vượt (trừ khi xác nhận)
  IF @PoId IS NOT NULL
  BEGIN
    DECLARE @PoStatus VARCHAR(10), @PoSupplier INT;
    SELECT @PoStatus = Status, @PoSupplier = SupplierId FROM dbo.PurchaseOrders WITH (UPDLOCK, HOLDLOCK) WHERE PoId = @PoId;
    IF @PoStatus IS NULL BEGIN ROLLBACK; THROW 50130, 'PO_NOT_FOUND', 1; END
    IF @PoStatus NOT IN ('SENT', 'PARTIAL') BEGIN ROLLBACK; THROW 50133, 'PO_NOT_RECEIVABLE', 1; END
    SET @SupplierId = COALESCE(@SupplierId, @PoSupplier);
    IF EXISTS (SELECT 1 FROM @L l LEFT JOIN dbo.PurchaseOrderLines pl ON pl.PoLineId = l.PoLineId AND pl.PoId = @PoId AND pl.IngredientId = l.IngredientId
               WHERE l.PoLineId IS NOT NULL AND pl.PoLineId IS NULL)
    BEGIN ROLLBACK; THROW 50100, 'POLINE', 1; END
    DECLARE @Over NVARCHAR(2000) = (
      SELECT STRING_AGG(i.Name, N', ') FROM @L l JOIN dbo.PurchaseOrderLines pl WITH (UPDLOCK) ON pl.PoLineId = l.PoLineId
      JOIN dbo.Ingredients i ON i.IngredientId = l.IngredientId
      WHERE pl.ReceivedBaseQty + l.Qty > pl.OrderedBaseQty);
    IF @Over IS NOT NULL AND ISNULL(@ConfirmOver, 0) = 0 BEGIN ROLLBACK; THROW 50131, @Over, 1; END
  END

  DECLARE @Bad NVARCHAR(2000) = (
    SELECT STRING_AGG(CAST(l.IngredientId AS NVARCHAR(10)), ',')
    FROM @L l LEFT JOIN dbo.Ingredients i WITH (UPDLOCK, HOLDLOCK) ON i.IngredientId = l.IngredientId AND i.DeletedAt IS NULL
    WHERE i.IngredientId IS NULL);
  IF @Bad IS NOT NULL BEGIN ROLLBACK; THROW 50100, @Bad, 1; END

  INSERT dbo.StockReceipts (Supplier, ReceivedBy, Note, PoId, SupplierId)
  VALUES (COALESCE(NULLIF(LTRIM(RTRIM(@Supplier)), ''), (SELECT Name FROM dbo.Suppliers WHERE SupplierId = @SupplierId)), @UserId,
          NULLIF(LTRIM(RTRIM(@Note)), ''), @PoId, @SupplierId);
  SET @ReceiptId = SCOPE_IDENTITY();

  INSERT dbo.StockReceiptLines (ReceiptId, IngredientId, Qty, UnitCost, PackUnitCode, PackQty, PackPrice, PoLineId, ExpiryDate)
  SELECT @ReceiptId, IngredientId, Qty, UnitCost, PackUnitCode, PackQty, PackPrice, PoLineId, ExpiryDate FROM @L;

  -- Tồn + giá vốn bình quân (F-031)
  DECLARE @After TABLE (IngredientId INT PRIMARY KEY, StockQty DECIMAL(18,3), TrackLots BIT, AvgCost DECIMAL(18,4), ShelfLifeHours INT);
  UPDATE ing
     SET AvgCost = CASE WHEN l.UnitCost IS NULL THEN ing.AvgCost
                        WHEN ing.AvgCost = 0 OR ing.StockQty <= 0 THEN l.UnitCost
                        ELSE ROUND((ing.StockQty * ing.AvgCost + l.Qty * l.UnitCost) / (ing.StockQty + l.Qty), 4) END,
         StockQty = ing.StockQty + l.Qty,
         LastUnitCost = COALESCE(CAST(l.UnitCost AS DECIMAL(12,2)), ing.LastUnitCost)
  OUTPUT inserted.IngredientId, inserted.StockQty, inserted.TrackLots, inserted.AvgCost, inserted.ShelfLifeHours INTO @After
  FROM dbo.Ingredients ing WITH (UPDLOCK, HOLDLOCK) JOIN @L l ON l.IngredientId = ing.IngredientId;

  -- F-028: lô cho nguyên liệu theo lô
  DECLARE @Today DATE = CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE);
  DECLARE @NewLots TABLE (LotId INT, IngredientId INT);
  INSERT dbo.IngredientLots (IngredientId, LotCode, Qty, ExpiryDate, UnitCost, Source, SourceId)
  OUTPUT inserted.LotId, inserted.IngredientId INTO @NewLots
  SELECT l.IngredientId, NULLIF(LTRIM(RTRIM(l.LotCode)), ''), l.Qty,
         COALESCE(l.ExpiryDate, CASE WHEN a.ShelfLifeHours IS NOT NULL THEN DATEADD(DAY, CEILING(a.ShelfLifeHours / 24.0), @Today) END),
         COALESCE(l.UnitCost, a.AvgCost), 'RECEIPT', @ReceiptId
  FROM @L l JOIN @After a ON a.IngredientId = l.IngredientId
  WHERE a.TrackLots = 1;
  UPDATE rl SET LotId = n.LotId FROM dbo.StockReceiptLines rl JOIN @NewLots n ON n.IngredientId = rl.IngredientId WHERE rl.ReceiptId = @ReceiptId;

  INSERT dbo.InventoryTransactions (IngredientId, Type, Delta, BalanceAfter, Reason, CreatedBy, StockReceiptId, UnitCost, CostAmount, LotId)
  SELECT l.IngredientId, 'IMPORT', l.Qty, a.StockQty,
         LEFT(N'Nhập kho #' + CAST(@ReceiptId AS NVARCHAR(10)) + ISNULL(N' — ' + (SELECT Supplier FROM dbo.StockReceipts WHERE ReceiptId = @ReceiptId), N''), 200),
         @UserId, @ReceiptId, COALESCE(l.UnitCost, a.AvgCost), ROUND(l.Qty * COALESCE(l.UnitCost, a.AvgCost), 2), n.LotId
  FROM @L l JOIN @After a ON a.IngredientId = l.IngredientId LEFT JOIN @NewLots n ON n.IngredientId = l.IngredientId;

  -- F-030: cập nhật PO + lịch sử giá
  IF @PoId IS NOT NULL
  BEGIN
    UPDATE pl SET ReceivedBaseQty = pl.ReceivedBaseQty + l.Qty
    FROM dbo.PurchaseOrderLines pl JOIN @L l ON l.PoLineId = pl.PoLineId;
    UPDATE dbo.PurchaseOrders
       SET Status = CASE WHEN NOT EXISTS (SELECT 1 FROM dbo.PurchaseOrderLines WHERE PoId = @PoId AND ReceivedBaseQty < OrderedBaseQty) THEN 'RECEIVED' ELSE 'PARTIAL' END,
           ReceivedAt = CASE WHEN NOT EXISTS (SELECT 1 FROM dbo.PurchaseOrderLines WHERE PoId = @PoId AND ReceivedBaseQty < OrderedBaseQty) THEN SYSUTCDATETIME() END
     WHERE PoId = @PoId;
  END
  IF @SupplierId IS NOT NULL
  BEGIN
    INSERT dbo.SupplierPriceHistory (SupplierId, IngredientId, PackUnitCode, PackPrice, UnitCost, ReceiptId)
    SELECT @SupplierId, l.IngredientId, l.PackUnitCode, l.PackPrice, l.UnitCost, @ReceiptId FROM @L l WHERE l.UnitCost IS NOT NULL;
    UPDATE si SET LastPrice = COALESCE(CASE WHEN l.PackUnitCode = si.PackUnitCode THEN l.PackPrice END, ROUND(l.UnitCost * si.PackSize, 2))
    FROM dbo.SupplierIngredients si JOIN @L l ON l.IngredientId = si.IngredientId
    WHERE si.SupplierId = @SupplierId AND l.UnitCost IS NOT NULL;
  END

  COMMIT;
END
