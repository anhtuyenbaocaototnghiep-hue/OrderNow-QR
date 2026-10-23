-- Sửa / hủy phiếu nhập kho (FEATURE-048, ADR-009 D-39, D-40) — một transaction.
--   @Mode 'VOID': bỏ mọi dòng (trừ lại kho), phiếu → VOIDED, dòng phiếu giữ nguyên để xem lại.
--   @Mode 'EDIT': so dòng mới (@LinesJson, đơn vị gốc — như sp_ReceiveStock) với dòng cũ: dòng giống hệt giữ nguyên; dòng đổi / thêm / bỏ =
--         bỏ dòng cũ + nhập dòng mới. Giữ số phiếu; ghi người / lúc / lý do sửa gần nhất.
-- Điều kiện (xét nguyên liệu bị ảnh hưởng): không nằm trong phiếu kiểm kê nháp; chưa có phiếu kiểm kê chốt từ lúc nhập trở đi; nguyên liệu
--   theo lô: lô của dòng cũ còn nguyên; tồn − SL cũ + SL mới ≥ phần đang giữ cho đơn.
-- Lịch sử kho: IMPORT "+ dòng mới" trước, "− dòng cũ" sau (số dư không âm giữa chừng), cùng StockReceiptId → Σ IMPORT của phiếu = Σ dòng hiện tại
--   (phiếu còn hiệu lực) hoặc 0 (đã hủy).
-- Giá vốn bình quân tính ngược: phần còn lại = tồn × AvgCost − SL cũ × giá cũ (giá trên dòng IMPORT gốc); còn hàng và giá trị > 0 → bình quân lại
--   với dòng mới như sp_ReceiveStock; không xác định được → giá dòng mới, hoặc giữ nguyên. Dòng cũ không có giá → phần còn lại giữ AvgCost.
-- Giá nhập gần nhất: chỉ tính lại nếu phiếu này là lần nhập có giá mới nhất của nguyên liệu.
-- PO (F-030): ReceivedBaseQty −cũ / +mới (dòng mới nối vào dòng PO cùng nguyên liệu), trạng thái tính lại; tăng vượt số đặt cần @ConfirmOver.
-- Lịch sử giá NCC: bỏ giá của phiếu (nguyên liệu bị ảnh hưởng), sửa → ghi lại giá mới (RecordedAt = lúc nhập gốc); LastPrice = lần ghi mới nhất còn lại,
--   chỉ khi phiếu này là lần ghi giá mới nhất của NCC cho nguyên liệu đó (giá nhập tay về sau không bị đè).
-- Lỗi: 50100 INVALID_RECEIPT ('EMPTY'/'QTY'/'DUP'/danh sách IngredientId sai), 50104 STOCKTAKE_LOCKED (tên), 50131 OVER_RECEIPT (tên), 50190 không có phiếu,
--      50191 RECEIPT_VOIDED, 50192 RECEIPT_AFTER_STOCKTAKE (tên), 50193 RECEIPT_STOCK_USED (tên), 50194 RECEIPT_LOT_USED (tên), 50199 thiếu lý do.
CREATE OR ALTER PROCEDURE dbo.sp_ReviseStockReceipt
  @ReceiptId   INT,
  @UserId      INT,
  @Mode        VARCHAR(4),
  @Reason      NVARCHAR(200),
  @Supplier    NVARCHAR(100) = NULL,
  @Note        NVARCHAR(200) = NULL,
  @LinesJson   NVARCHAR(MAX) = NULL,
  @ConfirmOver BIT = 0
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  DECLARE @R NVARCHAR(200) = NULLIF(LTRIM(RTRIM(@Reason)), N'');
  IF @R IS NULL THROW 50199, 'REASON_REQUIRED', 1;
  IF @Mode NOT IN ('EDIT', 'VOID') THROW 50100, 'MODE', 1;

  DECLARE @New TABLE (
    IngredientId INT NULL, Qty DECIMAL(18,3) NULL, UnitCost DECIMAL(18,4) NULL, PackUnitCode NVARCHAR(10) NULL, PackQty DECIMAL(18,3) NULL,
    PackPrice DECIMAL(14,2) NULL, ExpiryDate DATE NULL, LotCode NVARCHAR(30) NULL);
  IF @Mode = 'EDIT'
  BEGIN
    INSERT @New
    SELECT ingredientId, qty, unitCost, NULLIF(LTRIM(RTRIM(packUnitCode)), N''), packQty, packPrice, TRY_CAST(expiryDate AS DATE),
           NULLIF(LTRIM(RTRIM(lotCode)), N'')
    FROM OPENJSON(@LinesJson) WITH (ingredientId INT, qty DECIMAL(18,3), unitCost DECIMAL(18,4), packUnitCode NVARCHAR(10), packQty DECIMAL(18,3),
                                    packPrice DECIMAL(14,2), expiryDate VARCHAR(10), lotCode NVARCHAR(30));
    IF NOT EXISTS (SELECT 1 FROM @New) THROW 50100, 'EMPTY', 1;
    IF EXISTS (SELECT 1 FROM @New WHERE IngredientId IS NULL OR Qty IS NULL OR Qty <= 0 OR UnitCost < 0) THROW 50100, 'QTY', 1;
    IF EXISTS (SELECT IngredientId FROM @New GROUP BY IngredientId HAVING COUNT(*) > 1) THROW 50100, 'DUP', 1;
  END

  BEGIN TRAN;

  DECLARE @Status VARCHAR(10), @ReceivedAt DATETIME2(0), @PoId INT, @SupplierId INT;
  SELECT @Status = Status, @ReceivedAt = ReceivedAt, @PoId = PoId, @SupplierId = SupplierId
  FROM dbo.StockReceipts WITH (UPDLOCK, HOLDLOCK) WHERE ReceiptId = @ReceiptId;
  IF @Status IS NULL BEGIN ROLLBACK; THROW 50190, 'RECEIPT_NOT_FOUND', 1; END
  IF @Status <> 'POSTED' BEGIN ROLLBACK; THROW 50191, 'RECEIPT_VOIDED', 1; END
  -- Khóa PO trước nguyên liệu (cùng thứ tự với sp_ReceiveStock: PO → dòng PO → nguyên liệu)
  IF @PoId IS NOT NULL
  BEGIN
    DECLARE @PoLock VARCHAR(10) = (SELECT Status FROM dbo.PurchaseOrders WITH (UPDLOCK, HOLDLOCK) WHERE PoId = @PoId);
    DECLARE @PoLineLock INT = (SELECT COUNT(*) FROM dbo.PurchaseOrderLines WITH (UPDLOCK, HOLDLOCK) WHERE PoId = @PoId);
  END

  -- Dòng cũ + giá trên dòng IMPORT gốc (4 chữ số lẻ — dòng phiếu chỉ lưu 2)
  DECLARE @Old TABLE (
    IngredientId INT PRIMARY KEY, Qty DECIMAL(18,3), UnitCost DECIMAL(12,2), ImportCost DECIMAL(18,4), PackUnitCode NVARCHAR(10), PackQty DECIMAL(18,3),
    PackPrice DECIMAL(14,2), ExpiryDate DATE, LotId INT, LotCode NVARCHAR(30), PoLineId INT);
  INSERT @Old
  SELECT rl.IngredientId, rl.Qty, rl.UnitCost, t.UnitCost, rl.PackUnitCode, rl.PackQty, rl.PackPrice, rl.ExpiryDate, rl.LotId, lot.LotCode, rl.PoLineId
  FROM dbo.StockReceiptLines rl
  LEFT JOIN dbo.IngredientLots lot ON lot.LotId = rl.LotId
  OUTER APPLY (SELECT TOP 1 x.UnitCost FROM dbo.InventoryTransactions x
               WHERE x.StockReceiptId = @ReceiptId AND x.IngredientId = rl.IngredientId AND x.Type = 'IMPORT' AND x.Delta > 0 ORDER BY x.TxnId DESC) t
  WHERE rl.ReceiptId = @ReceiptId;

  -- Nguyên liệu bị ảnh hưởng: dòng bỏ / thêm / khác bất kỳ trường nào (VOID: mọi dòng)
  DECLARE @Chg TABLE (IngredientId INT PRIMARY KEY, OldQty DECIMAL(18,3) NOT NULL, NewQty DECIMAL(18,3) NOT NULL);
  INSERT @Chg
  SELECT COALESCE(o.IngredientId, n.IngredientId), ISNULL(o.Qty, 0), ISNULL(n.Qty, 0)
  FROM @Old o FULL JOIN @New n ON n.IngredientId = o.IngredientId
  WHERE o.IngredientId IS NULL OR n.IngredientId IS NULL
     OR NOT EXISTS (SELECT o.Qty, o.UnitCost, o.PackUnitCode, o.PackQty, o.PackPrice, o.ExpiryDate, o.LotCode
                    INTERSECT
                    SELECT n.Qty, CAST(n.UnitCost AS DECIMAL(12,2)), n.PackUnitCode, n.PackQty, n.PackPrice, n.ExpiryDate, n.LotCode);

  -- Nguyên liệu của dòng mới phải còn dùng
  DECLARE @Bad NVARCHAR(2000) = (
    SELECT STRING_AGG(CAST(c.IngredientId AS NVARCHAR(10)), ',') FROM @Chg c
    LEFT JOIN dbo.Ingredients i ON i.IngredientId = c.IngredientId AND i.DeletedAt IS NULL
    WHERE c.NewQty > 0 AND i.IngredientId IS NULL);
  IF @Bad IS NOT NULL BEGIN ROLLBACK; THROW 50100, @Bad, 1; END

  DECLARE @Ing TABLE (IngredientId INT PRIMARY KEY, Name NVARCHAR(100), StockQty DECIMAL(18,3), ReservedQty DECIMAL(18,3), AvgCost DECIMAL(18,4),
                      TrackLots BIT, ShelfLifeHours INT);
  INSERT @Ing
  SELECT i.IngredientId, i.Name, i.StockQty, i.ReservedQty, i.AvgCost, i.TrackLots, i.ShelfLifeHours
  FROM dbo.Ingredients i WITH (UPDLOCK, HOLDLOCK) JOIN @Chg c ON c.IngredientId = i.IngredientId;

  DECLARE @Names NVARCHAR(2000) = (
    SELECT STRING_AGG(i.Name, N', ') FROM @Ing i
    WHERE EXISTS (SELECT 1 FROM dbo.StocktakeLines l JOIN dbo.Stocktakes s ON s.StocktakeId = l.StocktakeId
                  WHERE l.IngredientId = i.IngredientId AND s.Status = 'DRAFT'));
  IF @Names IS NOT NULL BEGIN ROLLBACK; THROW 50104, @Names, 1; END

  SET @Names = (
    SELECT STRING_AGG(i.Name, N', ') FROM @Ing i
    WHERE EXISTS (SELECT 1 FROM dbo.StocktakeLines l JOIN dbo.Stocktakes s ON s.StocktakeId = l.StocktakeId
                  WHERE l.IngredientId = i.IngredientId AND s.Status = 'POSTED' AND s.PostedAt >= @ReceivedAt));
  IF @Names IS NOT NULL BEGIN ROLLBACK; THROW 50192, @Names, 1; END

  -- Theo lô: lô của dòng cũ phải còn nguyên (dòng cũ không có lô = nguyên liệu bật theo lô sau khi nhập → không xác định được lô)
  SET @Names = (
    SELECT STRING_AGG(i.Name, N', ') FROM @Old o JOIN @Chg c ON c.IngredientId = o.IngredientId JOIN @Ing i ON i.IngredientId = o.IngredientId
    LEFT JOIN dbo.IngredientLots lot WITH (UPDLOCK) ON lot.LotId = o.LotId
    WHERE i.TrackLots = 1 AND (lot.LotId IS NULL OR lot.IsClosed = 1 OR lot.Qty <> o.Qty));
  IF @Names IS NOT NULL BEGIN ROLLBACK; THROW 50194, @Names, 1; END

  SET @Names = (SELECT STRING_AGG(i.Name, N', ') FROM @Ing i JOIN @Chg c ON c.IngredientId = i.IngredientId
                WHERE i.StockQty - c.OldQty + c.NewQty < i.ReservedQty);
  IF @Names IS NOT NULL BEGIN ROLLBACK; THROW 50193, @Names, 1; END

  -- PO: dòng mới nối vào dòng PO cùng nguyên liệu; tăng vượt số đặt cần xác nhận
  DECLARE @NewPo TABLE (IngredientId INT PRIMARY KEY, PoLineId INT);
  IF @PoId IS NOT NULL
  BEGIN
    INSERT @NewPo SELECT c.IngredientId, pl.PoLineId FROM @Chg c
    JOIN dbo.PurchaseOrderLines pl WITH (UPDLOCK, HOLDLOCK) ON pl.PoId = @PoId AND pl.IngredientId = c.IngredientId
    WHERE c.NewQty > 0;
    SET @Names = (
      SELECT STRING_AGG(i.Name, N', ') FROM @Chg c JOIN dbo.PurchaseOrderLines pl ON pl.PoId = @PoId AND pl.IngredientId = c.IngredientId
      JOIN @Ing i ON i.IngredientId = c.IngredientId
      LEFT JOIN @Old o ON o.IngredientId = c.IngredientId AND o.PoLineId = pl.PoLineId
      WHERE c.NewQty > c.OldQty AND pl.ReceivedBaseQty - ISNULL(o.Qty, 0) + c.NewQty > pl.OrderedBaseQty);
    IF @Names IS NOT NULL AND ISNULL(@ConfirmOver, 0) = 0 BEGIN ROLLBACK; THROW 50131, @Names, 1; END
  END

  -- Phiếu này có phải lần nhập có giá mới nhất của nguyên liệu (trước khi sửa)?
  DECLARE @Latest TABLE (IngredientId INT PRIMARY KEY);
  INSERT @Latest SELECT c.IngredientId FROM @Chg c
  WHERE NOT EXISTS (SELECT 1 FROM dbo.StockReceiptLines rl JOIN dbo.StockReceipts sr ON sr.ReceiptId = rl.ReceiptId
                    WHERE rl.IngredientId = c.IngredientId AND rl.UnitCost IS NOT NULL AND sr.Status = 'POSTED' AND sr.ReceiptId <> @ReceiptId
                      AND (sr.ReceivedAt > @ReceivedAt OR (sr.ReceivedAt = @ReceivedAt AND sr.ReceiptId > @ReceiptId)));

  DECLARE @LatestSup TABLE (IngredientId INT PRIMARY KEY);
  IF @SupplierId IS NOT NULL
    INSERT @LatestSup SELECT c.IngredientId FROM @Chg c
    WHERE NOT EXISTS (SELECT 1 FROM dbo.SupplierPriceHistory h
                      WHERE h.SupplierId = @SupplierId AND h.IngredientId = c.IngredientId AND ISNULL(h.ReceiptId, 0) <> @ReceiptId
                        AND h.RecordedAt > @ReceivedAt);

  -- Tồn + giá vốn bình quân
  DECLARE @Calc TABLE (IngredientId INT PRIMARY KEY, BaseQty DECIMAL(18,3), BaseValue DECIMAL(38,6), NewQty DECIMAL(18,3), NewCost DECIMAL(18,4));
  INSERT @Calc
  SELECT c.IngredientId, i.StockQty - c.OldQty,
         CASE WHEN o.IngredientId IS NULL THEN i.StockQty * i.AvgCost
              WHEN o.UnitCost IS NULL THEN (i.StockQty - c.OldQty) * i.AvgCost
              ELSE i.StockQty * i.AvgCost - c.OldQty * COALESCE(o.ImportCost, o.UnitCost) END,
         c.NewQty, n.UnitCost
  FROM @Chg c JOIN @Ing i ON i.IngredientId = c.IngredientId
  LEFT JOIN @Old o ON o.IngredientId = c.IngredientId LEFT JOIN @New n ON n.IngredientId = c.IngredientId;

  DECLARE @After TABLE (IngredientId INT PRIMARY KEY, StockQty DECIMAL(18,3), AvgCost DECIMAL(18,4));
  UPDATE ing
     SET StockQty = k.BaseQty + k.NewQty,
         AvgCost = CASE WHEN k.NewQty > 0 AND k.NewCost IS NOT NULL
                          THEN CASE WHEN k.BaseQty > 0 AND k.BaseValue > 0 THEN ROUND((k.BaseValue + k.NewQty * k.NewCost) / (k.BaseQty + k.NewQty), 4)
                                    ELSE k.NewCost END
                        WHEN k.BaseQty > 0 AND k.BaseValue > 0 THEN ROUND(k.BaseValue / k.BaseQty, 4)
                        ELSE ing.AvgCost END
  OUTPUT inserted.IngredientId, inserted.StockQty, inserted.AvgCost INTO @After
  FROM dbo.Ingredients ing JOIN @Calc k ON k.IngredientId = ing.IngredientId;

  -- Lô: đóng lô của dòng cũ; dòng mới của nguyên liệu theo lô → lô mới
  UPDATE lot SET Qty = 0, IsClosed = 1
  FROM dbo.IngredientLots lot JOIN @Old o ON o.LotId = lot.LotId JOIN @Chg c ON c.IngredientId = o.IngredientId
  JOIN @Ing i ON i.IngredientId = o.IngredientId
  WHERE i.TrackLots = 1;
  -- Hạn dùng tự tính theo NGÀY NHẬP gốc (sửa giá không được "gia hạn" hàng); lô mới giữ thời điểm nhập gốc cho thứ tự FEFO
  DECLARE @RecvDay DATE = CAST(DATEADD(HOUR, 7, @ReceivedAt) AS DATE);
  DECLARE @NewLots TABLE (LotId INT, IngredientId INT);
  INSERT dbo.IngredientLots (IngredientId, LotCode, Qty, ExpiryDate, UnitCost, Source, SourceId, ReceivedAt)
  OUTPUT inserted.LotId, inserted.IngredientId INTO @NewLots
  SELECT n.IngredientId, n.LotCode, n.Qty,
         COALESCE(n.ExpiryDate, CASE WHEN i.ShelfLifeHours IS NOT NULL THEN DATEADD(DAY, CEILING(i.ShelfLifeHours / 24.0), @RecvDay) END),
         COALESCE(n.UnitCost, a.AvgCost), 'RECEIPT', @ReceiptId, @ReceivedAt
  FROM @New n JOIN @Chg c ON c.IngredientId = n.IngredientId JOIN @Ing i ON i.IngredientId = n.IngredientId JOIN @After a ON a.IngredientId = n.IngredientId
  WHERE i.TrackLots = 1;

  -- Lịch sử kho: + dòng mới, rồi − dòng cũ
  DECLARE @Txt NVARCHAR(200) = LEFT(CASE WHEN @Mode = 'VOID' THEN N'Hủy' ELSE N'Sửa' END + N' phiếu nhập #' + CAST(@ReceiptId AS NVARCHAR(10)) + N' — ' + @R, 200);
  INSERT dbo.InventoryTransactions (IngredientId, Type, Delta, BalanceAfter, Reason, CreatedBy, StockReceiptId, UnitCost, CostAmount, LotId)
  SELECT n.IngredientId, 'IMPORT', n.Qty, i.StockQty + n.Qty, @Txt, @UserId, @ReceiptId, COALESCE(n.UnitCost, a.AvgCost),
         ROUND(n.Qty * COALESCE(n.UnitCost, a.AvgCost), 2), nl.LotId
  FROM @New n JOIN @Chg c ON c.IngredientId = n.IngredientId JOIN @Ing i ON i.IngredientId = n.IngredientId JOIN @After a ON a.IngredientId = n.IngredientId
  LEFT JOIN @NewLots nl ON nl.IngredientId = n.IngredientId;
  INSERT dbo.InventoryTransactions (IngredientId, Type, Delta, BalanceAfter, Reason, CreatedBy, StockReceiptId, UnitCost, CostAmount, LotId)
  SELECT o.IngredientId, 'IMPORT', -o.Qty, a.StockQty, @Txt, @UserId, @ReceiptId, COALESCE(o.ImportCost, o.UnitCost, i.AvgCost),
         ROUND(o.Qty * COALESCE(o.ImportCost, o.UnitCost, i.AvgCost), 2), CASE WHEN i.TrackLots = 1 THEN o.LotId END
  FROM @Old o JOIN @Chg c ON c.IngredientId = o.IngredientId JOIN @Ing i ON i.IngredientId = o.IngredientId JOIN @After a ON a.IngredientId = o.IngredientId;

  -- Dòng phiếu (VOID giữ nguyên để xem lại)
  IF @Mode = 'EDIT'
  BEGIN
    DELETE rl FROM dbo.StockReceiptLines rl JOIN @Chg c ON c.IngredientId = rl.IngredientId WHERE rl.ReceiptId = @ReceiptId;
    INSERT dbo.StockReceiptLines (ReceiptId, IngredientId, Qty, UnitCost, PackUnitCode, PackQty, PackPrice, PoLineId, ExpiryDate, LotId)
    SELECT @ReceiptId, n.IngredientId, n.Qty, n.UnitCost, n.PackUnitCode, n.PackQty, n.PackPrice, p.PoLineId, n.ExpiryDate, nl.LotId
    FROM @New n JOIN @Chg c ON c.IngredientId = n.IngredientId LEFT JOIN @NewPo p ON p.IngredientId = n.IngredientId
    LEFT JOIN @NewLots nl ON nl.IngredientId = n.IngredientId;
    UPDATE dbo.StockReceipts
       SET Supplier = CASE WHEN @SupplierId IS NULL THEN NULLIF(LTRIM(RTRIM(@Supplier)), N'') ELSE Supplier END,
           Note = NULLIF(LTRIM(RTRIM(@Note)), N''), EditedBy = @UserId, EditedAt = SYSUTCDATETIME(), EditReason = @R
     WHERE ReceiptId = @ReceiptId;
  END
  ELSE
    UPDATE dbo.StockReceipts SET Status = 'VOIDED', VoidedBy = @UserId, VoidedAt = SYSUTCDATETIME(), VoidReason = @R WHERE ReceiptId = @ReceiptId;

  -- Giá nhập gần nhất: = dòng có giá còn hiệu lực mới nhất (nếu phiếu này từng là lần mới nhất)
  UPDATE ing SET LastUnitCost = x.UnitCost
  FROM dbo.Ingredients ing JOIN @Latest l ON l.IngredientId = ing.IngredientId
  CROSS APPLY (SELECT TOP 1 rl.UnitCost FROM dbo.StockReceiptLines rl JOIN dbo.StockReceipts sr ON sr.ReceiptId = rl.ReceiptId
               WHERE rl.IngredientId = ing.IngredientId AND rl.UnitCost IS NOT NULL AND sr.Status = 'POSTED'
               ORDER BY sr.ReceivedAt DESC, sr.ReceiptId DESC) x;

  -- PO: số đã nhận + trạng thái
  IF @PoId IS NOT NULL
  BEGIN
    UPDATE pl SET ReceivedBaseQty = pl.ReceivedBaseQty - ISNULL(o.Qty, 0) + CASE WHEN p.PoLineId IS NOT NULL THEN c.NewQty ELSE 0 END
    FROM dbo.PurchaseOrderLines pl JOIN @Chg c ON c.IngredientId = pl.IngredientId
    LEFT JOIN @Old o ON o.IngredientId = c.IngredientId AND o.PoLineId = pl.PoLineId
    LEFT JOIN @NewPo p ON p.IngredientId = c.IngredientId
    WHERE pl.PoId = @PoId;
    DECLARE @Any BIT = CASE WHEN EXISTS (SELECT 1 FROM dbo.PurchaseOrderLines WHERE PoId = @PoId AND ReceivedBaseQty > 0) THEN 1 ELSE 0 END;
    DECLARE @Full BIT = CASE WHEN NOT EXISTS (SELECT 1 FROM dbo.PurchaseOrderLines WHERE PoId = @PoId AND ReceivedBaseQty < OrderedBaseQty) THEN 1 ELSE 0 END;
    UPDATE dbo.PurchaseOrders
       SET Status = CASE WHEN @Any = 0 THEN 'SENT' WHEN @Full = 1 THEN 'RECEIVED' ELSE 'PARTIAL' END,
           ReceivedAt = CASE WHEN @Any = 1 AND @Full = 1 THEN COALESCE(ReceivedAt, SYSUTCDATETIME()) END
     WHERE PoId = @PoId AND Status IN ('SENT', 'PARTIAL', 'RECEIVED');
  END

  -- Lịch sử giá nhà cung cấp
  IF @SupplierId IS NOT NULL
  BEGIN
    DELETE h FROM dbo.SupplierPriceHistory h JOIN @Chg c ON c.IngredientId = h.IngredientId WHERE h.ReceiptId = @ReceiptId;
    INSERT dbo.SupplierPriceHistory (SupplierId, IngredientId, PackUnitCode, PackPrice, UnitCost, ReceiptId, RecordedAt)
    SELECT @SupplierId, n.IngredientId, n.PackUnitCode, n.PackPrice, n.UnitCost, @ReceiptId, @ReceivedAt
    FROM @New n JOIN @Chg c ON c.IngredientId = n.IngredientId WHERE n.UnitCost IS NOT NULL;
    UPDATE si SET LastPrice = COALESCE(CASE WHEN h.PackUnitCode = si.PackUnitCode THEN h.PackPrice END, ROUND(h.UnitCost * si.PackSize, 2))
    FROM dbo.SupplierIngredients si JOIN @LatestSup c ON c.IngredientId = si.IngredientId
    CROSS APPLY (SELECT TOP 1 x.PackUnitCode, x.PackPrice, x.UnitCost FROM dbo.SupplierPriceHistory x
                 WHERE x.SupplierId = si.SupplierId AND x.IngredientId = si.IngredientId ORDER BY x.RecordedAt DESC, x.PriceId DESC) h
    WHERE si.SupplierId = @SupplierId;
  END

  COMMIT;
END
