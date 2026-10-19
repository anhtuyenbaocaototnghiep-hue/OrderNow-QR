-- Xóa cả đơn tại bàn chưa thu (@OrderId) hoặc hủy lượt phục vụ bàn (@OrderId NULL → mọi đơn chưa thu + đóng phiên) — FEATURE-046, ADR-007.
-- Mỗi dòng ghi OrderItemVoids (giữ dòng làm lịch sử); kho theo D-34 (sp_VoidLineCore). Đơn đã tiếp nhận / đã pha cần người duyệt (D-33).
-- Hủy bàn: phiên đã có lượt thu (chia bill một phần) → không được (xóa từng món chưa thu).
-- Lỗi: 50005 SESSION_NOT_FOUND, 50031 SESSION_CLOSED, 50004 ORDER_NOT_FOUND, 50181 ITEM_NOT_EDITABLE, 50183 APPROVAL_REQUIRED,
--      50184 SESSION_HAS_PAYMENTS, 50186 REASON_REQUIRED.
CREATE OR ALTER PROCEDURE dbo.sp_CancelOrders
  @SessionId  UNIQUEIDENTIFIER,
  @OrderId    INT = NULL,
  @UserId     INT,
  @ApprovedBy INT = NULL,
  @Reason     NVARCHAR(200),
  @StockMode  VARCHAR(10) = NULL,
  @Cancelled  INT OUTPUT,
  @SessionClosed BIT = 0 OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  SET @Cancelled = 0; SET @SessionClosed = 0;
  IF NULLIF(LTRIM(RTRIM(@Reason)), '') IS NULL THROW 50186, 'REASON_REQUIRED', 1;

  BEGIN TRAN;
  DECLARE @SStatus VARCHAR(20) = (SELECT Status FROM dbo.Sessions WITH (UPDLOCK, HOLDLOCK) WHERE SessionId = @SessionId);
  IF @SStatus IS NULL BEGIN ROLLBACK; THROW 50005, 'SESSION_NOT_FOUND', 1; END
  IF @SStatus = 'CLOSED' BEGIN ROLLBACK; THROW 50031, 'SESSION_CLOSED', 1; END
  IF @OrderId IS NULL AND EXISTS (SELECT 1 FROM dbo.Payments WHERE SessionId = @SessionId)
  BEGIN ROLLBACK; THROW 50184, 'SESSION_HAS_PAYMENTS', 1; END

  DECLARE @Orders TABLE (OrderId INT PRIMARY KEY, Status VARCHAR(10));
  INSERT @Orders
  SELECT OrderId, Status FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK)
  WHERE SessionId = @SessionId AND (@OrderId IS NULL OR OrderId = @OrderId)
    AND Status IN ('PENDING', 'PREPARING', 'COMPLETED') AND PaymentStatus = 'UNPAID';

  IF @OrderId IS NOT NULL
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.Orders WHERE OrderId = @OrderId AND SessionId = @SessionId) BEGIN ROLLBACK; THROW 50004, 'ORDER_NOT_FOUND', 1; END
    IF NOT EXISTS (SELECT 1 FROM @Orders) OR EXISTS (SELECT 1 FROM dbo.OrderItems WHERE OrderId = @OrderId AND PaidAt IS NOT NULL)
    BEGIN ROLLBACK; THROW 50181, 'ITEM_NOT_EDITABLE', 1; END
  END
  IF EXISTS (SELECT 1 FROM @Orders WHERE Status <> 'PENDING') AND @ApprovedBy IS NULL
  BEGIN ROLLBACK; THROW 50183, 'APPROVAL_REQUIRED', 1; END

  -- Từng dòng khách chọn: kho + lịch sử (giữ dòng)
  DECLARE @Lines TABLE (OrderItemId INT PRIMARY KEY, Qty INT);
  INSERT @Lines SELECT oi.OrderItemId, oi.Quantity FROM dbo.OrderItems oi JOIN @Orders o ON o.OrderId = oi.OrderId WHERE oi.ParentOrderItemId IS NULL;
  DECLARE @Line INT, @Q INT;
  WHILE EXISTS (SELECT 1 FROM @Lines)
  BEGIN
    SELECT TOP 1 @Line = OrderItemId, @Q = Qty FROM @Lines ORDER BY OrderItemId;
    EXEC dbo.sp_VoidLineCore @OrderItemId = @Line, @RemoveQty = @Q, @UserId = @UserId, @ApprovedBy = @ApprovedBy,
         @Reason = @Reason, @StockMode = @StockMode, @Delete = 0;
    DELETE @Lines WHERE OrderItemId = @Line;
  END

  -- Đơn chưa pha xong: trả nốt phần kho còn giữ (BOM đổi sau khi gọi) rồi hủy; khuyến mãi không còn tính lượt
  UPDATE ing SET ReservedQty = ing.ReservedQty - x.Qty
  FROM dbo.Ingredients ing WITH (UPDLOCK, HOLDLOCK)
  JOIN (SELECT r.IngredientId, SUM(r.Qty) AS Qty FROM dbo.OrderIngredients r JOIN @Orders o ON o.OrderId = r.OrderId
        WHERE o.Status IN ('PENDING', 'PREPARING') GROUP BY r.IngredientId) x ON x.IngredientId = ing.IngredientId;
  DELETE pu FROM dbo.PromotionUsages pu JOIN @Orders o ON o.OrderId = pu.OrderId;
  UPDATE ord SET Status = 'CANCELLED', CancelledAt = SYSUTCDATETIME(), CancelledBy = @UserId, CancelReason = LEFT(LTRIM(RTRIM(@Reason)), 200)
  FROM dbo.Orders ord JOIN @Orders o ON o.OrderId = ord.OrderId;
  SET @Cancelled = (SELECT COUNT(*) FROM @Orders);

  IF @OrderId IS NULL
  BEGIN
    UPDATE dbo.Sessions
       SET Status = 'CLOSED', ClosedAt = SYSUTCDATETIME(), ClosedBy = @UserId, CancelledBy = @UserId, CancelReason = LEFT(LTRIM(RTRIM(@Reason)), 200)
     WHERE SessionId = @SessionId;
    SET @SessionClosed = 1;
  END
  ELSE
    -- Xóa đơn chưa thu cuối cùng của phiên đã thu một phần → đóng phiên như lượt thu cuối
    EXEC dbo.sp_CloseIfSettled @SessionId = @SessionId, @UserId = @UserId, @Closed = @SessionClosed OUTPUT;
  COMMIT;
END
GO
