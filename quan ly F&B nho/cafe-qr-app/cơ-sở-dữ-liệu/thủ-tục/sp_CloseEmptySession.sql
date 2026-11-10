-- "Đóng bàn trống": phiên không có đơn nào khác CANCELLED (Q-018/ADR-003). Không tạo Payments.
-- Khóa Sessions trước khi kiểm đơn → không lọt đơn đang được gửi đồng thời (Q-013).
-- F-086 (ADR-047 D-209): @Reason = 'IDLE_EMPTY' — hệ thống tự đóng phiên trống quá lâu (@UserId NULL). Kiểm lại trong cùng khóa:
--   không có yêu cầu gọi nhân viên / xin chuyển bàn đang chờ, và lần gần nhất có người vào nhóm (mở phiên / thêm điện thoại) đã quá @IdleMinutes phút.
-- Lỗi: 50005 SESSION_NOT_FOUND, 50031 SESSION_CLOSED, 50035 HAS_ORDERS, 50127 NOT_IDLE (tự đóng: phiên vừa có hoạt động — bỏ qua).
CREATE OR ALTER PROCEDURE dbo.sp_CloseEmptySession
  @SessionId   UNIQUEIDENTIFIER,
  @UserId      INT,
  @Reason      VARCHAR(20) = NULL,
  @IdleMinutes INT = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  DECLARE @Status VARCHAR(20), @OpenedAt DATETIME2(0);
  SELECT @Status = Status, @OpenedAt = OpenedAt FROM dbo.Sessions WITH (UPDLOCK, ROWLOCK) WHERE SessionId = @SessionId;
  IF @Status IS NULL BEGIN ROLLBACK; THROW 50005, 'SESSION_NOT_FOUND', 1; END
  IF @Status = 'CLOSED' BEGIN ROLLBACK; THROW 50031, 'SESSION_CLOSED', 1; END

  IF EXISTS (SELECT 1 FROM dbo.Orders WHERE SessionId = @SessionId AND Status <> 'CANCELLED')
  BEGIN ROLLBACK; THROW 50035, 'HAS_ORDERS', 1; END

  IF @Reason = 'IDLE_EMPTY'
  BEGIN
    DECLARE @LastActive DATETIME2(0) = (SELECT MAX(x) FROM (SELECT @OpenedAt AS x UNION ALL SELECT JoinedAt FROM dbo.SessionClients WHERE SessionId = @SessionId) a);
    IF @Status <> 'OPEN'
       OR EXISTS (SELECT 1 FROM dbo.StaffCalls WHERE SessionId = @SessionId AND HandledAt IS NULL)
       OR @LastActive > DATEADD(MINUTE, -ISNULL(@IdleMinutes, 30), SYSUTCDATETIME())
    BEGIN ROLLBACK; THROW 50127, 'NOT_IDLE', 1; END
  END

  UPDATE dbo.Sessions SET Status = 'CLOSED', ClosedAt = SYSUTCDATETIME(), ClosedBy = @UserId, CloseReason = @Reason WHERE SessionId = @SessionId;

  COMMIT;
END
