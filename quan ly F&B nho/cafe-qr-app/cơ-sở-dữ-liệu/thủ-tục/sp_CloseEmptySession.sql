-- "Đóng bàn trống": phiên không có đơn nào khác CANCELLED (Q-018/ADR-003). Không tạo Payments.
-- Khóa Sessions trước khi kiểm đơn → không lọt đơn đang được gửi đồng thời (Q-013).
-- Lỗi: 50005 SESSION_NOT_FOUND, 50031 SESSION_CLOSED, 50035 HAS_ORDERS.
CREATE OR ALTER PROCEDURE dbo.sp_CloseEmptySession
  @SessionId UNIQUEIDENTIFIER,
  @UserId    INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  DECLARE @Status VARCHAR(20) = (SELECT Status FROM dbo.Sessions WITH (UPDLOCK, ROWLOCK) WHERE SessionId = @SessionId);
  IF @Status IS NULL BEGIN ROLLBACK; THROW 50005, 'SESSION_NOT_FOUND', 1; END
  IF @Status = 'CLOSED' BEGIN ROLLBACK; THROW 50031, 'SESSION_CLOSED', 1; END

  IF EXISTS (SELECT 1 FROM dbo.Orders WHERE SessionId = @SessionId AND Status <> 'CANCELLED')
  BEGIN ROLLBACK; THROW 50035, 'HAS_ORDERS', 1; END

  UPDATE dbo.Sessions SET Status = 'CLOSED', ClosedAt = SYSUTCDATETIME(), ClosedBy = @UserId WHERE SessionId = @SessionId;

  COMMIT;
END
