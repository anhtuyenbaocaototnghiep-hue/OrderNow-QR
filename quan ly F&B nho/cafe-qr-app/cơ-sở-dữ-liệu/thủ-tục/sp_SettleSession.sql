-- Nhân viên bấm "Đã thu tiền" cho một phiên (ADR-000 / D-2; BR-007, BR-019).
-- Khóa Sessions trước tiên → chạy tuần tự với sp_SubmitOrder (Q-013). Một phiên chỉ thu một lần.
-- @ExpectedDue (tùy chọn): số tiền POS đang hiển thị; nếu khác số thực (có đơn mới/hủy) → 50034 AMOUNT_CHANGED.
-- Lỗi: 50005 SESSION_NOT_FOUND, 50020 INSUFFICIENT_AMOUNT, 50030 NO_ORDERS, 50032 ALREADY_SETTLED,
--      50033 HAS_PENDING_ORDERS (message = danh sách OrderId), 50034 AMOUNT_CHANGED.
CREATE OR ALTER PROCEDURE dbo.sp_SettleSession
  @SessionId      UNIQUEIDENTIFIER,
  @AmountReceived DECIMAL(12,0),
  @UserId         INT,
  @ExpectedDue    DECIMAL(12,0) = NULL,
  @PaymentId      INT OUTPUT,
  @AmountDue      DECIMAL(12,0) OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  -- 1. Chỉ một client thắng
  UPDATE dbo.Sessions
     SET Status = 'CLOSED', ClosedAt = SYSUTCDATETIME(), ClosedBy = @UserId
   WHERE SessionId = @SessionId AND Status IN ('OPEN', 'PAYMENT_REQUESTED');
  IF @@ROWCOUNT = 0
  BEGIN
    ROLLBACK;
    IF NOT EXISTS (SELECT 1 FROM dbo.Sessions WHERE SessionId = @SessionId) THROW 50005, 'SESSION_NOT_FOUND', 1;
    THROW 50032, 'ALREADY_SETTLED', 1;
  END

  -- 2. Không còn đơn chưa tiếp nhận
  DECLARE @Pending NVARCHAR(2000) = (
    SELECT STRING_AGG(CAST(OrderId AS NVARCHAR(10)), ',')
    FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK)
    WHERE SessionId = @SessionId AND Status = 'PENDING');
  IF @Pending IS NOT NULL BEGIN ROLLBACK; THROW 50033, @Pending, 1; END

  -- 3. Tổng phải thu = mọi đơn không hủy
  IF NOT EXISTS (SELECT 1 FROM dbo.Orders WHERE SessionId = @SessionId AND Status <> 'CANCELLED')
  BEGIN ROLLBACK; THROW 50030, 'NO_ORDERS', 1; END   -- dùng sp_CloseEmptySession

  SET @AmountDue = (SELECT SUM(TotalAmount) FROM dbo.Orders WHERE SessionId = @SessionId AND Status <> 'CANCELLED');
  IF @ExpectedDue IS NOT NULL AND @ExpectedDue <> @AmountDue BEGIN ROLLBACK; THROW 50034, 'AMOUNT_CHANGED', 1; END
  IF @AmountReceived IS NULL OR @AmountReceived < @AmountDue BEGIN ROLLBACK; THROW 50020, 'INSUFFICIENT_AMOUNT', 1; END

  -- 4. Ghi nhận
  DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();
  UPDATE dbo.Orders
     SET PaymentStatus = 'PAID', PaymentMethod = 'CASH', PaidAt = @Now
   WHERE SessionId = @SessionId AND Status <> 'CANCELLED' AND PaymentStatus = 'UNPAID';

  INSERT dbo.Payments (SessionId, Method, AmountDue, AmountReceived, ReceivedBy, PaidAt)
  VALUES (@SessionId, 'CASH', @AmountDue, @AmountReceived, @UserId, @Now);
  SET @PaymentId = SCOPE_IDENTITY();

  COMMIT;
END
