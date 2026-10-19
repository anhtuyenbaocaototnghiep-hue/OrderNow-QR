-- Hoàn tiền sau khi đã thu (FEATURE-019, ADR-005 D-15). Chỉ trong ngày thu tiền (giờ VN); Σ hoàn ≤ AmountDue.
-- Đơn bị hoàn (@OrderIds, hoặc toàn bộ khi hoàn đủ số đã thu) → VOIDED:
--   đơn PREPARING (chưa làm) → trả phần kho đang giữ; đơn COMPLETED + @Restock = 1 → cộng lại kho theo lượng đã trừ (RESTOCK).
-- Hội viên: trừ TotalSpent (không hạ hạng); trả lại điểm / tem tương ứng (sp_ReverseLoyalty — F-039). Khóa: Payments → Shifts (S) → Orders → Ingredients → Members.
-- Lượt thu một phần chia bill (F-026): chỉ hoàn tiền, không hủy đơn (đơn dùng chung nhiều phần) — @OrderIds → 50093.
-- Lỗi: 50070 NO_OPEN_SHIFT, 50090 PAYMENT_NOT_FOUND, 50091 REFUND_EXCEEDS, 50092 REFUND_WINDOW_EXPIRED, 50093 INVALID_REFUND.
CREATE OR ALTER PROCEDURE dbo.sp_RefundPayment
  @PaymentId   INT,
  @Amount      DECIMAL(12,0),
  @Reason      NVARCHAR(200),
  @Restock     BIT = 0,
  @OrderIds    NVARCHAR(400) = NULL,   -- "12,15" — đơn bị hủy theo lần hoàn này
  @UserId      INT,
  @ApprovedBy  INT,
  @ShiftId     INT = NULL,
  @RefundId    INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF @Amount IS NULL OR @Amount <= 0 OR NULLIF(LTRIM(RTRIM(@Reason)), '') IS NULL THROW 50093, 'INVALID_REFUND', 1;

  BEGIN TRAN;

  DECLARE @Due DECIMAL(12,0), @PaidAt DATETIME2(0), @SessionId UNIQUEIDENTIFIER, @PayOrderId INT, @MemberId INT, @PaySplitId INT;
  SELECT @Due = AmountDue, @PaidAt = PaidAt, @SessionId = SessionId, @PayOrderId = OrderId, @MemberId = MemberId, @PaySplitId = SplitId
  FROM dbo.Payments WITH (UPDLOCK, HOLDLOCK) WHERE PaymentId = @PaymentId;
  IF @Due IS NULL BEGIN ROLLBACK; THROW 50090, 'PAYMENT_NOT_FOUND', 1; END

  IF CAST(DATEADD(HOUR, 7, @PaidAt) AS DATE) <> CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE)
  BEGIN ROLLBACK; THROW 50092, 'REFUND_WINDOW_EXPIRED', 1; END

  DECLARE @Already DECIMAL(12,0) = ISNULL((SELECT SUM(Amount) FROM dbo.Refunds WHERE PaymentId = @PaymentId), 0);
  IF @Already + @Amount > @Due BEGIN ROLLBACK; THROW 50091, 'REFUND_EXCEEDS', 1; END

  IF @ShiftId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Shifts WITH (HOLDLOCK) WHERE ShiftId = @ShiftId AND ClosedAt IS NULL)
  BEGIN ROLLBACK; THROW 50070, 'NO_OPEN_SHIFT', 1; END

  -- Đơn thuộc lần thu này còn hiệu lực
  DECLARE @PayOrders TABLE (OrderId INT PRIMARY KEY, Status VARCHAR(10) NOT NULL);
  INSERT @PayOrders
  SELECT OrderId, Status FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK)
  WHERE ((@SessionId IS NOT NULL AND SessionId = @SessionId) OR OrderId = @PayOrderId) AND Status NOT IN ('CANCELLED', 'VOIDED');

  DECLARE @Void TABLE (OrderId INT PRIMARY KEY, Status VARCHAR(10) NOT NULL);
  IF @PaySplitId IS NOT NULL AND NULLIF(LTRIM(RTRIM(@OrderIds)), '') IS NOT NULL BEGIN ROLLBACK; THROW 50093, 'INVALID_REFUND', 1; END

  IF @PaySplitId IS NOT NULL
    SET @OrderIds = NULL;   -- không hủy đơn theo phần
  ELSE IF NULLIF(LTRIM(RTRIM(@OrderIds)), '') IS NOT NULL
  BEGIN
    DECLARE @Asked TABLE (OrderId INT PRIMARY KEY);
    INSERT @Asked SELECT DISTINCT TRY_CAST(value AS INT) FROM STRING_SPLIT(@OrderIds, ',') WHERE TRY_CAST(value AS INT) IS NOT NULL;
    IF NOT EXISTS (SELECT 1 FROM @Asked) OR EXISTS (SELECT 1 FROM @Asked a WHERE NOT EXISTS (SELECT 1 FROM @PayOrders p WHERE p.OrderId = a.OrderId))
    BEGIN ROLLBACK; THROW 50093, 'INVALID_REFUND', 1; END
    INSERT @Void SELECT p.OrderId, p.Status FROM @PayOrders p JOIN @Asked a ON a.OrderId = p.OrderId;
  END
  ELSE IF @Already + @Amount = @Due AND @PaySplitId IS NULL
    INSERT @Void SELECT OrderId, Status FROM @PayOrders;

  IF EXISTS (SELECT 1 FROM @Void)
  BEGIN
    UPDATE o SET Status = 'VOIDED', VoidedAt = SYSUTCDATETIME()
    FROM dbo.Orders o JOIN @Void v ON v.OrderId = o.OrderId;

    -- Đơn chưa làm xong: trả phần kho đang giữ (bất biến ReservedQty = Σ đơn PENDING/PREPARING)
    UPDATE ing SET ReservedQty = ing.ReservedQty - x.Qty
    FROM dbo.Ingredients ing WITH (UPDLOCK, HOLDLOCK)
    JOIN (SELECT r.IngredientId, SUM(r.Qty) AS Qty FROM dbo.OrderIngredients r JOIN @Void v ON v.OrderId = r.OrderId
          WHERE v.Status IN ('PENDING', 'PREPARING') GROUP BY r.IngredientId) x ON x.IngredientId = ing.IngredientId;

    -- Đơn đã làm: hoàn kho theo đúng lượng đã trừ (nhân viên chọn khi món pha sai/chưa giao)
    IF @Restock = 1
    BEGIN
      -- Một dòng mỗi đơn × nguyên liệu (gộp các dòng DEDUCT theo lô); giá = giá vốn đã ghi lúc trừ (F-031)
      DECLARE @Back TABLE (OrderId INT, IngredientId INT, Qty DECIMAL(18,3), Cost DECIMAL(18,2), PRIMARY KEY (OrderId, IngredientId));
      -- F-046: phần đã hoàn kho (VOID_BACK) / đã ghi hủy hàng (WasteLogs của lần xóa món) trước lúc thu không hoàn lần nữa
      INSERT @Back SELECT x.OrderId, x.IngredientId, SUM(x.Q), CASE WHEN SUM(x.C) > 0 THEN SUM(x.C) ELSE 0 END
      FROM (
        SELECT t.OrderId, t.IngredientId, -t.Delta AS Q, CASE WHEN t.Type = 'DEDUCT' THEN ISNULL(t.CostAmount, 0) ELSE -ISNULL(t.CostAmount, 0) END AS C
        FROM dbo.InventoryTransactions t JOIN @Void v ON v.OrderId = t.OrderId
        WHERE v.Status = 'COMPLETED' AND t.Type IN ('DEDUCT', 'VOID_BACK')
        UNION ALL
        SELECT vd.OrderId, w.IngredientId, -w.Qty, -ISNULL(w.CostAmount, 0)
        FROM dbo.WasteLogs w JOIN dbo.OrderItemVoids vd ON vd.VoidId = w.VoidId JOIN @Void v ON v.OrderId = vd.OrderId
        WHERE v.Status = 'COMPLETED') x
      GROUP BY x.OrderId, x.IngredientId
      HAVING SUM(x.Q) > 0;

      DECLARE @After TABLE (IngredientId INT PRIMARY KEY, StockQty DECIMAL(18,3), TrackLots BIT);
      UPDATE ing SET StockQty = ing.StockQty + x.Qty,
                     AvgCost = CASE WHEN x.Cost = 0 THEN ing.AvgCost WHEN ing.AvgCost = 0 OR ing.StockQty <= 0 THEN ROUND(x.Cost / x.Qty, 4)
                                    ELSE ROUND((ing.StockQty * ing.AvgCost + x.Cost) / (ing.StockQty + x.Qty), 4) END
      OUTPUT inserted.IngredientId, inserted.StockQty, inserted.TrackLots INTO @After
      FROM dbo.Ingredients ing WITH (UPDLOCK, HOLDLOCK)
      JOIN (SELECT IngredientId, SUM(Qty) AS Qty, SUM(Cost) AS Cost FROM @Back GROUP BY IngredientId) x ON x.IngredientId = ing.IngredientId;

      -- F-028: nguyên liệu theo lô → hàng hoàn vào một lô RESTOCK (giữ Σ lô = tồn)
      DECLARE @RLots TABLE (LotId INT, IngredientId INT, OrderId INT);
      INSERT dbo.IngredientLots (IngredientId, LotCode, Qty, UnitCost, Source, SourceId)
      OUTPUT inserted.LotId, inserted.IngredientId, inserted.SourceId INTO @RLots
      SELECT b.IngredientId, N'Hoàn tiền', b.Qty, ROUND(b.Cost / b.Qty, 4), 'RESTOCK', b.OrderId
      FROM @Back b JOIN @After a ON a.IngredientId = b.IngredientId WHERE a.TrackLots = 1;

      -- BalanceAfter: số dư sau toàn bộ lần hoàn (mỗi đơn × nguyên liệu một dòng — unique index chặn hoàn kho 2 lần)
      INSERT dbo.InventoryTransactions (IngredientId, OrderId, Type, Delta, BalanceAfter, Reason, CreatedBy, UnitCost, CostAmount, LotId)
      SELECT b.IngredientId, b.OrderId, 'RESTOCK', b.Qty, a.StockQty, LEFT(N'Hoàn tiền: ' + @Reason, 200), @UserId,
             ROUND(b.Cost / b.Qty, 4), b.Cost, rl.LotId
      FROM @Back b JOIN @After a ON a.IngredientId = b.IngredientId
      LEFT JOIN @RLots rl ON rl.IngredientId = b.IngredientId AND rl.OrderId = b.OrderId;
    END
  END

  INSERT dbo.Refunds (PaymentId, Amount, Reason, RestockInventory, VoidedOrderIds, ApprovedBy, CreatedBy, ShiftId)
  VALUES (@PaymentId, @Amount, LTRIM(RTRIM(@Reason)), @Restock,
          (SELECT STRING_AGG(CAST(OrderId AS NVARCHAR(10)), ',') FROM @Void), @ApprovedBy, @UserId, @ShiftId);
  SET @RefundId = SCOPE_IDENTITY();

  IF @MemberId IS NOT NULL
  BEGIN
    DECLARE @Tier VARCHAR(20);
    UPDATE dbo.Members
       SET TotalSpent = CASE WHEN TotalSpent > @Amount THEN TotalSpent - @Amount ELSE 0 END, @Tier = TierCode
     WHERE MemberId = @MemberId;
    IF @Tier IS NOT NULL
      INSERT dbo.MemberTransactions (MemberId, PaymentId, SpentAmount, DiscountAmount, TierBefore, TierAfter)
      VALUES (@MemberId, @PaymentId, -@Amount, 0, @Tier, @Tier);
    EXEC dbo.sp_ReverseLoyalty @PaymentId = @PaymentId, @RefundId = @RefundId;
  END

  COMMIT;
END
