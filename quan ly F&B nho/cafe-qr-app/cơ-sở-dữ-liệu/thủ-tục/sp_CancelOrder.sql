-- Hủy đơn PENDING (chỉ quầy — Q-010/ADR-003), trả lại phần kho đã giữ (ADR-001).
-- Lỗi: 50003 INVALID_STATE, 50004 ORDER_NOT_FOUND.
CREATE OR ALTER PROCEDURE dbo.sp_CancelOrder
  @OrderId INT,
  @UserId  INT,
  @Reason  NVARCHAR(200) = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  UPDATE dbo.Orders
     SET Status = 'CANCELLED', CancelledAt = SYSUTCDATETIME(), CancelledBy = @UserId,
         CancelReason = NULLIF(LTRIM(RTRIM(@Reason)), '')
   WHERE OrderId = @OrderId AND Status = 'PENDING';

  IF @@ROWCOUNT = 0
  BEGIN
    ROLLBACK;
    IF NOT EXISTS (SELECT 1 FROM dbo.Orders WHERE OrderId = @OrderId) THROW 50004, 'ORDER_NOT_FOUND', 1;
    THROW 50003, 'INVALID_STATE', 1;
  END

  UPDATE ing
     SET ReservedQty = ing.ReservedQty - r.Qty
  FROM dbo.Ingredients ing WITH (UPDLOCK, HOLDLOCK)
  JOIN dbo.OrderIngredients r ON r.IngredientId = ing.IngredientId
  WHERE r.OrderId = @OrderId;

  COMMIT;
END
