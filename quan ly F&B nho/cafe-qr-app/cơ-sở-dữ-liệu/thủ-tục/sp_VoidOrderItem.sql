-- Sửa / xóa món đã gọi (FEATURE-046, ADR-007 D-33, D-34). Chỉ dòng CHƯA THU của đơn tại bàn PENDING / PREPARING / COMPLETED, phiên chưa đóng.
-- Khóa: Sessions → Orders → Ingredients (+ lô) — cùng thứ tự với gửi đơn / thu tiền / hoàn tất.
-- Lỗi: 50181 ITEM_NOT_EDITABLE, 50182 INVALID_QTY, 50183 APPROVAL_REQUIRED, 50185 ITEM_NOT_FOUND, 50186 REASON_REQUIRED.

-- Lõi bỏ @RemoveQty phần của MỘT dòng khách chọn (gọi trong transaction của người gọi, đơn đã khóa):
--   kho: đơn chưa pha xong → trả phần đang giữ (RELEASE); đã pha xong → RESTOCK (VOID_BACK) hoặc WASTE (WasteLogs, không trừ thêm);
--   giá vốn dòng giảm (CogsReduction ghi ở OrderItemVoids); dòng: @Delete = 1 → xóa hẳn khi bỏ hết, = 0 → giữ dòng (hủy cả đơn).
CREATE OR ALTER PROCEDURE dbo.sp_VoidLineCore
  @OrderItemId INT,
  @RemoveQty   INT,
  @UserId      INT,
  @ApprovedBy  INT = NULL,
  @Reason      NVARCHAR(200),
  @StockMode   VARCHAR(10) = NULL,      -- 'WASTE' | 'RESTOCK' (chỉ dùng cho đơn đã pha xong; mặc định WASTE)
  @Delete      BIT = 1
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  DECLARE @OrderId INT, @MenuItemId INT, @Qty INT, @List DECIMAL(12,0), @Unit DECIMAL(12,0), @Cogs DECIMAL(12,0),
          @Status VARCHAR(10), @SessionId UNIQUEIDENTIFIER, @Name NVARCHAR(100), @Code VARCHAR(8);
  SELECT @OrderId = oi.OrderId, @MenuItemId = oi.MenuItemId, @Qty = oi.Quantity, @List = oi.ListPrice, @Unit = oi.UnitPrice,
         @Cogs = oi.CogsAmount, @Status = o.Status, @SessionId = o.SessionId, @Name = m.Name, @Code = o.OrderCode
  FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId JOIN dbo.MenuItems m ON m.MenuItemId = oi.MenuItemId
  WHERE oi.OrderItemId = @OrderItemId AND oi.ParentOrderItemId IS NULL;
  IF @OrderId IS NULL THROW 50185, 'ITEM_NOT_FOUND', 1;
  IF @RemoveQty IS NULL OR @RemoveQty <= 0 OR @RemoveQty > @Qty THROW 50182, 'INVALID_QTY', 1;
  DECLARE @Whole BIT = CASE WHEN @RemoveQty = @Qty THEN 1 ELSE 0 END;
  DECLARE @Mode VARCHAR(10) = CASE WHEN @Status = 'COMPLETED' THEN CASE WHEN @StockMode = 'RESTOCK' THEN 'RESTOCK' ELSE 'WASTE' END ELSE 'RELEASE' END;

  -- Định lượng của phần bị bỏ: BOM món đơn + thành phần combo (theo tỉ lệ) + định lượng tùy chọn — như lúc gửi đơn
  DECLARE @Need TABLE (IngredientId INT PRIMARY KEY, Qty DECIMAL(18,3) NOT NULL);
  INSERT @Need (IngredientId, Qty)
  SELECT x.IngredientId, SUM(x.Q) FROM (
    SELECT b.IngredientId, CAST(@RemoveQty AS DECIMAL(18,6)) * b.Amount AS Q
    FROM dbo.BomItems b JOIN dbo.MenuItems mm ON mm.MenuItemId = b.MenuItemId AND mm.ItemType = 'SINGLE'
    WHERE b.MenuItemId = @MenuItemId
    UNION ALL
    SELECT b.IngredientId, CAST(c.Quantity AS DECIMAL(18,6)) * @RemoveQty / @Qty * b.Amount
    FROM dbo.OrderItems c JOIN dbo.BomItems b ON b.MenuItemId = c.MenuItemId
    WHERE c.ParentOrderItemId = @OrderItemId
    UNION ALL
    SELECT ob.IngredientId, CAST(@RemoveQty AS DECIMAL(18,6)) * ob.Amount
    FROM dbo.OrderItemModifiers im JOIN dbo.ModifierOptionBom ob ON ob.OptionId = im.OptionId
    WHERE im.OrderItemId = @OrderItemId) x
  GROUP BY x.IngredientId;

  -- Không vượt phần đơn đang giữ / đã trừ (BOM có thể đã đổi sau khi gọi); đã pha xong: trừ phần đã hoàn / đã ghi hủy ở lần xóa trước
  UPDATE n SET Qty = CASE WHEN n.Qty > cap.Q THEN cap.Q ELSE n.Qty END
  FROM @Need n
  CROSS APPLY (SELECT CASE WHEN @Status = 'COMPLETED'
                            THEN ISNULL((SELECT SUM(-t.Delta) FROM dbo.InventoryTransactions t WHERE t.OrderId = @OrderId AND t.IngredientId = n.IngredientId AND t.Type = 'DEDUCT'), 0)
                               - ISNULL((SELECT SUM(t.Delta) FROM dbo.InventoryTransactions t WHERE t.OrderId = @OrderId AND t.IngredientId = n.IngredientId AND t.Type = 'VOID_BACK'), 0)
                               - ISNULL((SELECT SUM(w.Qty) FROM dbo.WasteLogs w JOIN dbo.OrderItemVoids v ON v.VoidId = w.VoidId
                                         WHERE v.OrderId = @OrderId AND w.IngredientId = n.IngredientId), 0)
                            ELSE ISNULL((SELECT r.Qty FROM dbo.OrderIngredients r WHERE r.OrderId = @OrderId AND r.IngredientId = n.IngredientId), 0) END AS Q) cap;
  DELETE @Need WHERE Qty <= 0;

  -- Giá vốn đã trừ / đơn vị (đơn đã pha xong)
  DECLARE @Cost TABLE (IngredientId INT PRIMARY KEY, Qty DECIMAL(18,3), UnitCost DECIMAL(18,4), Amount DECIMAL(18,2));
  IF @Status = 'COMPLETED'
    INSERT @Cost
    SELECT n.IngredientId, n.Qty, u.UnitCost, ROUND(n.Qty * u.UnitCost, 2)
    FROM @Need n
    CROSS APPLY (SELECT CASE WHEN SUM(-t.Delta) > 0 THEN ROUND(SUM(ISNULL(t.CostAmount, 0)) / SUM(-t.Delta), 4) ELSE 0 END AS UnitCost
                 FROM dbo.InventoryTransactions t WHERE t.OrderId = @OrderId AND t.IngredientId = n.IngredientId AND t.Type = 'DEDUCT') u;

  -- Giá vốn dòng giảm (giữ bất biến Σ CogsAmount = giá vốn kho đã trừ − Σ CogsReduction)
  DECLARE @Reduce DECIMAL(12,0) = 0;
  IF @Cogs IS NOT NULL
  BEGIN
    IF @Whole = 1 OR @Delete = 0 SET @Reduce = CASE WHEN @Whole = 1 THEN @Cogs ELSE ROUND(@Cogs * @RemoveQty / @Qty, 0) END;
    ELSE IF @Mode = 'RESTOCK' SET @Reduce = ISNULL((SELECT ROUND(SUM(Amount), 0) FROM @Cost), 0);
    ELSE SET @Reduce = ROUND(@Cogs * @RemoveQty / @Qty, 0);
    IF @Reduce > @Cogs SET @Reduce = @Cogs;
  END

  DECLARE @VoidId INT;
  INSERT dbo.OrderItemVoids (OrderId, OrderItemId, SessionId, MenuItemId, ItemName, Qty, UnitPrice, Amount, OrderStatus, StockMode,
                             CogsReduction, Reason, ApprovedBy, CreatedBy)
  VALUES (@OrderId, @OrderItemId, @SessionId, @MenuItemId, @Name, @RemoveQty, @Unit, @RemoveQty * @Unit, @Status, @Mode,
          @Reduce, LTRIM(RTRIM(@Reason)), @ApprovedBy, @UserId);
  SET @VoidId = SCOPE_IDENTITY();

  IF @Mode = 'RELEASE'
  BEGIN
    UPDATE ing SET ReservedQty = ing.ReservedQty - n.Qty
    FROM dbo.Ingredients ing WITH (UPDLOCK, HOLDLOCK) JOIN @Need n ON n.IngredientId = ing.IngredientId;
    DELETE r FROM dbo.OrderIngredients r JOIN @Need n ON n.IngredientId = r.IngredientId
    WHERE r.OrderId = @OrderId AND r.Qty <= n.Qty;
    UPDATE r SET Qty = r.Qty - n.Qty FROM dbo.OrderIngredients r JOIN @Need n ON n.IngredientId = r.IngredientId WHERE r.OrderId = @OrderId;
  END
  ELSE IF @Mode = 'RESTOCK'
  BEGIN
    DECLARE @After TABLE (IngredientId INT PRIMARY KEY, StockQty DECIMAL(18,3), TrackLots BIT);
    UPDATE ing SET StockQty = ing.StockQty + c.Qty,
                   AvgCost = CASE WHEN c.Amount = 0 THEN ing.AvgCost WHEN ing.AvgCost = 0 OR ing.StockQty <= 0 THEN c.UnitCost
                                  ELSE ROUND((ing.StockQty * ing.AvgCost + c.Amount) / (ing.StockQty + c.Qty), 4) END
    OUTPUT inserted.IngredientId, inserted.StockQty, inserted.TrackLots INTO @After
    FROM dbo.Ingredients ing WITH (UPDLOCK, HOLDLOCK) JOIN @Cost c ON c.IngredientId = ing.IngredientId;

    -- F-028: nguyên liệu theo lô → lô mới nguồn RESTOCK (giữ Σ lô = tồn)
    DECLARE @Lots TABLE (LotId INT, IngredientId INT);
    INSERT dbo.IngredientLots (IngredientId, LotCode, Qty, UnitCost, Source, SourceId)
    OUTPUT inserted.LotId, inserted.IngredientId INTO @Lots
    SELECT c.IngredientId, LEFT(N'Xóa món #' + @Code, 30), c.Qty, c.UnitCost, 'RESTOCK', @OrderId
    FROM @Cost c JOIN @After a ON a.IngredientId = c.IngredientId WHERE a.TrackLots = 1;

    INSERT dbo.InventoryTransactions (IngredientId, OrderId, Type, Delta, BalanceAfter, Reason, CreatedBy, UnitCost, CostAmount, LotId, VoidId)
    SELECT c.IngredientId, @OrderId, 'VOID_BACK', c.Qty, a.StockQty, LEFT(N'Xóa món đã pha #' + @Code + N': ' + @Reason, 200), @UserId,
           c.UnitCost, c.Amount, l.LotId, @VoidId
    FROM @Cost c JOIN @After a ON a.IngredientId = c.IngredientId LEFT JOIN @Lots l ON l.IngredientId = c.IngredientId;
  END
  ELSE IF @Mode = 'WASTE'
    INSERT dbo.WasteLogs (IngredientId, Qty, Reason, Note, CostAmount, CreatedBy, VoidId)
    SELECT c.IngredientId, c.Qty, 'OTHER', LEFT(N'Xóa món đã pha #' + @Code + N' (' + @Name + N'): ' + @Reason, 200), c.Amount, @UserId, @VoidId
    FROM @Cost c;

  -- Dòng món
  IF @Delete = 1 AND @Whole = 1
  BEGIN
    DELETE dbo.OrderItemModifiers WHERE OrderItemId = @OrderItemId OR OrderItemId IN (SELECT OrderItemId FROM dbo.OrderItems WHERE ParentOrderItemId = @OrderItemId);
    DELETE dbo.PromotionUsages WHERE OrderItemId = @OrderItemId OR OrderItemId IN (SELECT OrderItemId FROM dbo.OrderItems WHERE ParentOrderItemId = @OrderItemId);
    DELETE dbo.OrderItems WHERE ParentOrderItemId = @OrderItemId;
    DELETE dbo.OrderItems WHERE OrderItemId = @OrderItemId;
  END
  ELSE IF @Delete = 1
  BEGIN
    DECLARE @New INT = @Qty - @RemoveQty;
    UPDATE dbo.OrderItems
       SET Quantity = @New, LineDiscount = CASE WHEN @List IS NULL THEN LineDiscount ELSE (@List - @Unit) * @New END,
           CogsAmount = CASE WHEN CogsAmount IS NULL THEN NULL ELSE CogsAmount - @Reduce END
     WHERE OrderItemId = @OrderItemId;
    UPDATE dbo.OrderItems SET Quantity = Quantity / @Qty * @New WHERE ParentOrderItemId = @OrderItemId;
    UPDATE dbo.PromotionUsages SET DiscountAmount = (@List - @Unit) * @New WHERE OrderItemId = @OrderItemId AND @List IS NOT NULL;
  END
  ELSE
    -- Hủy cả đơn: giữ dòng làm lịch sử, giá vốn dòng về 0 (đã ghi ở CogsReduction)
    UPDATE dbo.OrderItems SET CogsAmount = CASE WHEN CogsAmount IS NULL THEN NULL ELSE CogsAmount - @Reduce END WHERE OrderItemId = @OrderItemId;
END
GO

-- Tính lại tổng đơn sau khi bỏ món: tạm tính / sau khuyến mãi dòng theo dòng còn lại; khuyến mãi đơn đã áp tính lại (bỏ nếu dưới tối thiểu).
-- Hết dòng → CANCELLED (trả nốt phần kho còn giữ nếu đơn chưa pha xong).
CREATE OR ALTER PROCEDURE dbo.sp_RecalcOrder
  @OrderId INT,
  @UserId  INT,
  @Reason  NVARCHAR(200)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  DECLARE @Status VARCHAR(10), @Legacy BIT, @PromoId INT;
  SELECT @Status = Status, @Legacy = CASE WHEN SubtotalAmount IS NULL THEN 1 ELSE 0 END, @PromoId = OrderPromotionId
  FROM dbo.Orders WHERE OrderId = @OrderId;

  DECLARE @N INT, @Sub DECIMAL(12,0), @After DECIMAL(12,0);
  SELECT @N = COUNT(*), @Sub = SUM(CAST(Quantity AS DECIMAL(12,0)) * ListPrice), @After = SUM(CAST(Quantity AS DECIMAL(12,0)) * UnitPrice)
  FROM dbo.OrderItems WHERE OrderId = @OrderId AND ParentOrderItemId IS NULL;

  IF @N = 0
  BEGIN
    IF @Status IN ('PENDING', 'PREPARING')
      UPDATE ing SET ReservedQty = ing.ReservedQty - r.Qty
      FROM dbo.Ingredients ing WITH (UPDLOCK, HOLDLOCK) JOIN dbo.OrderIngredients r ON r.IngredientId = ing.IngredientId
      WHERE r.OrderId = @OrderId;
    DELETE dbo.PromotionUsages WHERE OrderId = @OrderId;
    UPDATE dbo.Orders
       SET Status = 'CANCELLED', CancelledAt = SYSUTCDATETIME(), CancelledBy = @UserId, CancelReason = LEFT(LTRIM(RTRIM(@Reason)), 200),
           TotalAmount = 0, SubtotalAmount = CASE WHEN SubtotalAmount IS NULL THEN NULL ELSE 0 END, PromoDiscount = 0, OrderPromotionId = NULL
     WHERE OrderId = @OrderId;
    RETURN;
  END

  DECLARE @OrderDisc DECIMAL(12,0) = 0;
  IF @PromoId IS NOT NULL
  BEGIN
    DECLARE @Type VARCHAR(20), @Value DECIMAL(12,2), @Min DECIMAL(12,0);
    SELECT @Type = Type, @Value = Value, @Min = MinOrderAmount FROM dbo.Promotions WHERE PromotionId = @PromoId;
    IF @After >= ISNULL(@Min, 0)
      SET @OrderDisc = CASE @Type WHEN 'ORDER_PERCENT' THEN ROUND(@After * @Value / 100, 0) WHEN 'ORDER_AMOUNT' THEN ROUND(@Value, 0) ELSE 0 END;
    IF @OrderDisc > @After SET @OrderDisc = @After;
    IF @OrderDisc <= 0
    BEGIN
      DELETE dbo.PromotionUsages WHERE OrderId = @OrderId AND OrderItemId IS NULL;
      UPDATE dbo.Orders SET OrderPromotionId = NULL WHERE OrderId = @OrderId;
    END
    ELSE
      UPDATE dbo.PromotionUsages SET DiscountAmount = @OrderDisc WHERE OrderId = @OrderId AND OrderItemId IS NULL;
  END

  UPDATE dbo.Orders
     SET TotalAmount = @After - @OrderDisc,
         SubtotalAmount = CASE WHEN @Legacy = 1 OR @Sub IS NULL THEN SubtotalAmount ELSE @Sub END,
         PromoDiscount = CASE WHEN @Legacy = 1 OR @Sub IS NULL THEN PromoDiscount ELSE @Sub - (@After - @OrderDisc) END
   WHERE OrderId = @OrderId;
END
GO

-- Phiên đã thu một phần (chia bill): bỏ nốt dòng chưa thu → đơn còn toàn dòng đã thu thành PAID; hết đơn chưa thu → đóng phiên
-- như lượt thu cuối (sp_SettleSplit bước 8). Phiên chưa có lượt thu thì giữ mở (bàn trống: đóng bàn / hủy bàn).
CREATE OR ALTER PROCEDURE dbo.sp_CloseIfSettled
  @SessionId UNIQUEIDENTIFIER,
  @UserId    INT,
  @Closed    BIT OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  SET @Closed = 0;
  UPDATE o SET PaymentStatus = 'PAID',
               PaymentMethod = ISNULL((SELECT TOP 1 p.Method FROM dbo.Payments p WHERE p.SessionId = @SessionId ORDER BY p.PaidAt DESC, p.PaymentId DESC), 'CASH'),
               PaidAt = (SELECT MAX(x.PaidAt) FROM dbo.OrderItems x WHERE x.OrderId = o.OrderId)
  FROM dbo.Orders o
  WHERE o.SessionId = @SessionId AND o.Status NOT IN ('CANCELLED', 'VOIDED') AND o.PaymentStatus = 'UNPAID'
    AND EXISTS (SELECT 1 FROM dbo.OrderItems x WHERE x.OrderId = o.OrderId AND x.ParentOrderItemId IS NULL)
    AND NOT EXISTS (SELECT 1 FROM dbo.OrderItems x WHERE x.OrderId = o.OrderId AND x.ParentOrderItemId IS NULL AND x.PaidAt IS NULL);
  IF EXISTS (SELECT 1 FROM dbo.Payments WHERE SessionId = @SessionId)
     AND NOT EXISTS (SELECT 1 FROM dbo.Orders WHERE SessionId = @SessionId AND Status NOT IN ('CANCELLED', 'VOIDED') AND PaymentStatus = 'UNPAID')
  BEGIN
    UPDATE dbo.Sessions SET Status = 'CLOSED', ClosedAt = SYSUTCDATETIME(), ClosedBy = @UserId WHERE SessionId = @SessionId AND Status <> 'CLOSED';
    UPDATE dbo.SessionSplits SET Status = 'PAID' WHERE SessionId = @SessionId;
    SET @Closed = 1;
  END
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_VoidOrderItem
  @OrderItemId   INT,
  @NewQty        INT,
  @UserId        INT,
  @ApprovedBy    INT = NULL,
  @Reason        NVARCHAR(200),
  @StockMode     VARCHAR(10) = NULL,
  @OrderId       INT OUTPUT,
  @OrderStatus   VARCHAR(10) OUTPUT,
  @SessionClosed BIT = 0 OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  SET @SessionClosed = 0;
  IF NULLIF(LTRIM(RTRIM(@Reason)), '') IS NULL THROW 50186, 'REASON_REQUIRED', 1;
  SELECT @OrderId = OrderId FROM dbo.OrderItems WHERE OrderItemId = @OrderItemId AND ParentOrderItemId IS NULL;
  IF @OrderId IS NULL THROW 50185, 'ITEM_NOT_FOUND', 1;
  DECLARE @SessionId UNIQUEIDENTIFIER = (SELECT SessionId FROM dbo.Orders WHERE OrderId = @OrderId);
  IF @SessionId IS NULL THROW 50181, 'ITEM_NOT_EDITABLE', 1;   -- mang đi: đã thu ngay → dùng hoàn tiền

  BEGIN TRAN;
  IF NOT EXISTS (SELECT 1 FROM dbo.Sessions WITH (UPDLOCK, HOLDLOCK) WHERE SessionId = @SessionId AND Status <> 'CLOSED')
  BEGIN ROLLBACK; THROW 50181, 'ITEM_NOT_EDITABLE', 1; END
  DECLARE @Status VARCHAR(10), @Pay VARCHAR(6);
  SELECT @Status = Status, @Pay = PaymentStatus FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK) WHERE OrderId = @OrderId;
  IF @Status NOT IN ('PENDING', 'PREPARING', 'COMPLETED') OR @Pay <> 'UNPAID'
     OR EXISTS (SELECT 1 FROM dbo.OrderItems WHERE OrderItemId = @OrderItemId AND PaidAt IS NOT NULL)
  BEGIN ROLLBACK; THROW 50181, 'ITEM_NOT_EDITABLE', 1; END
  DECLARE @Qty INT = (SELECT Quantity FROM dbo.OrderItems WHERE OrderItemId = @OrderItemId);
  IF @Qty IS NULL BEGIN ROLLBACK; THROW 50185, 'ITEM_NOT_FOUND', 1; END   -- vừa bị xóa bởi request song song
  IF @NewQty IS NULL OR @NewQty < 0 OR @NewQty >= @Qty BEGIN ROLLBACK; THROW 50182, 'INVALID_QTY', 1; END
  -- D-33: đơn đã tiếp nhận / đã pha → cần người duyệt (kiểm lại ở đây: đơn có thể vừa được tiếp nhận)
  IF @Status <> 'PENDING' AND @ApprovedBy IS NULL BEGIN ROLLBACK; THROW 50183, 'APPROVAL_REQUIRED', 1; END

  DECLARE @Remove INT = @Qty - @NewQty;
  EXEC dbo.sp_VoidLineCore @OrderItemId = @OrderItemId, @RemoveQty = @Remove, @UserId = @UserId, @ApprovedBy = @ApprovedBy,
       @Reason = @Reason, @StockMode = @StockMode, @Delete = 1;
  EXEC dbo.sp_RecalcOrder @OrderId = @OrderId, @UserId = @UserId, @Reason = @Reason;
  EXEC dbo.sp_CloseIfSettled @SessionId = @SessionId, @UserId = @UserId, @Closed = @SessionClosed OUTPUT;
  SELECT @OrderStatus = Status FROM dbo.Orders WHERE OrderId = @OrderId;
  COMMIT;
END
GO
