-- Chuyển bàn (FEATURE-049, ADR-010 D-43): chuyển cả nhóm (phiên chưa đóng) sang bàn khác đang dùng — bàn trống hoặc bàn có nhóm khác
-- (khi đó hai phiên song song, bill riêng — như khách chọn "Cá nhân"). Một transaction: Sessions.TableId + Orders.TableId mọi đơn của phiên
-- (thẻ đơn / phiếu pha / bill hiện bàn mới) + SessionTableMoves. Chia bill, hội viên, gọi nhân viên, gọi thanh toán gắn theo phiên nên đi theo.
-- Khóa phiên UPDLOCK → chạy tuần tự với sp_SubmitOrder (đơn mới luôn lấy đúng bàn), thu tiền, đóng bàn.
-- @ExpectedFromTableId (không bắt buộc): bàn máy quầy đang thấy — nhóm đã bị máy khác chuyển đi thì từ chối thay vì chuyển nhầm.
-- F-086 (ADR-047 D-207): @ByGuest = 1 — khách tự chuyển khi quét QR bàn khác: @UserId NULL, @ClientToken là điện thoại của khách;
--   chỉ khi khách thuộc nhóm, nhóm chưa gọi thanh toán, chưa có món (trừ đơn đã hủy) và chỉ một điện thoại — kiểm trong cùng khóa phiên.
-- Chuyển xong (khách hay nhân viên): yêu cầu "xin chuyển bàn" đang chờ của nhóm (StaffCalls MOVE) tự đánh dấu đã xử lý.
-- Lỗi: 50200 không có phiên, 50201 SESSION_CLOSED, 50202 không có bàn (hoặc đã xóa), 50203 TABLE_INACTIVE, 50204 SAME_TABLE, 50205 SESSION_MOVED,
--      50125 NOT_SESSION_MEMBER (khách không thuộc nhóm), 50126 GUEST_MOVE_BLOCKED (message: PAYMENT | ORDERS | SHARED).
CREATE OR ALTER PROCEDURE dbo.sp_MoveSession
  @SessionId   UNIQUEIDENTIFIER,
  @ToTableId   INT,
  @UserId      INT,
  @ExpectedFromTableId INT = NULL,
  @FromTableId INT OUTPUT,
  @ByGuest     BIT = 0,
  @ClientToken CHAR(32) = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  DECLARE @Status VARCHAR(20);
  SELECT @Status = Status, @FromTableId = TableId FROM dbo.Sessions WITH (UPDLOCK, HOLDLOCK) WHERE SessionId = @SessionId;
  IF @Status IS NULL BEGIN ROLLBACK; THROW 50200, 'SESSION_NOT_FOUND', 1; END
  IF @Status = 'CLOSED' BEGIN ROLLBACK; THROW 50201, 'SESSION_CLOSED', 1; END
  IF @ExpectedFromTableId IS NOT NULL AND @ExpectedFromTableId <> @FromTableId BEGIN ROLLBACK; THROW 50205, 'SESSION_MOVED', 1; END

  IF ISNULL(@ByGuest, 0) = 1
  BEGIN
    IF @ClientToken IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.SessionClients WHERE SessionId = @SessionId AND ClientToken = @ClientToken)
    BEGIN ROLLBACK; THROW 50125, 'NOT_SESSION_MEMBER', 1; END
    IF @Status <> 'OPEN' BEGIN ROLLBACK; THROW 50126, 'PAYMENT', 1; END
    IF EXISTS (SELECT 1 FROM dbo.Orders WHERE SessionId = @SessionId AND Status NOT IN ('CANCELLED', 'VOIDED'))
    BEGIN ROLLBACK; THROW 50126, 'ORDERS', 1; END
    IF (SELECT COUNT(*) FROM dbo.SessionClients WHERE SessionId = @SessionId) > 1 BEGIN ROLLBACK; THROW 50126, 'SHARED', 1; END
  END

  DECLARE @Found BIT = 0, @Active BIT, @Deleted DATETIME2(0);
  SELECT @Found = 1, @Active = IsActive, @Deleted = DeletedAt FROM dbo.Tables WITH (UPDLOCK, HOLDLOCK) WHERE TableId = @ToTableId;
  IF @Found = 0 OR @Deleted IS NOT NULL BEGIN ROLLBACK; THROW 50202, 'TABLE_NOT_FOUND', 1; END
  IF @Active = 0 BEGIN ROLLBACK; THROW 50203, 'TABLE_INACTIVE', 1; END
  IF @ToTableId = @FromTableId BEGIN ROLLBACK; THROW 50204, 'SAME_TABLE', 1; END

  UPDATE dbo.Sessions SET TableId = @ToTableId WHERE SessionId = @SessionId;
  UPDATE dbo.Orders SET TableId = @ToTableId WHERE SessionId = @SessionId;
  INSERT dbo.SessionTableMoves (SessionId, FromTableId, ToTableId, MovedBy, ByGuest)
  VALUES (@SessionId, @FromTableId, @ToTableId, CASE WHEN ISNULL(@ByGuest, 0) = 1 THEN NULL ELSE @UserId END, ISNULL(@ByGuest, 0));
  UPDATE dbo.StaffCalls SET HandledAt = SYSUTCDATETIME(), HandledBy = CASE WHEN ISNULL(@ByGuest, 0) = 1 THEN NULL ELSE @UserId END
  WHERE SessionId = @SessionId AND Type = 'MOVE' AND HandledAt IS NULL;

  COMMIT;
END
