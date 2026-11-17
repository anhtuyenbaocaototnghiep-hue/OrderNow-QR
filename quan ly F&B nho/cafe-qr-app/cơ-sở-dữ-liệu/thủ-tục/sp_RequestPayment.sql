-- Khách bấm "Gọi thanh toán" (ADR-000 / D-2, BR-018). Idempotent: bấm lại khi đang PAYMENT_REQUESTED chỉ cập nhật thời gian.
-- F-099 (ADR-062 D-246): @Method = cách trả khách chọn (CASH | TRANSFER) — chỉ là gợi ý cho quầy, không đổi trạng thái thanh toán.
-- Lỗi: 50005 SESSION_NOT_FOUND, 50030 NO_ORDERS, 50031 SESSION_CLOSED.
CREATE OR ALTER PROCEDURE dbo.sp_RequestPayment
  @SessionId   UNIQUEIDENTIFIER,
  @AmountDue   DECIMAL(12,0) OUTPUT,
  @RequestedAt DATETIME2(0) OUTPUT,
  @Method      VARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  DECLARE @Status VARCHAR(20) = (SELECT Status FROM dbo.Sessions WITH (UPDLOCK, ROWLOCK) WHERE SessionId = @SessionId);
  IF @Status IS NULL BEGIN ROLLBACK; THROW 50005, 'SESSION_NOT_FOUND', 1; END
  IF @Status = 'CLOSED' BEGIN ROLLBACK; THROW 50031, 'SESSION_CLOSED', 1; END

  IF NOT EXISTS (SELECT 1 FROM dbo.Orders WHERE SessionId = @SessionId AND Status <> 'CANCELLED')
  BEGIN ROLLBACK; THROW 50030, 'NO_ORDERS', 1; END

  SET @AmountDue = (SELECT SUM(TotalAmount) FROM dbo.Orders WHERE SessionId = @SessionId AND Status <> 'CANCELLED');
  SET @RequestedAt = SYSUTCDATETIME();

  UPDATE dbo.Sessions SET Status = 'PAYMENT_REQUESTED', PaymentRequestedAt = @RequestedAt,
         PayMethodHint = CASE WHEN @Method IN ('CASH', 'TRANSFER') THEN @Method ELSE 'CASH' END
  WHERE SessionId = @SessionId;

  COMMIT;
END
