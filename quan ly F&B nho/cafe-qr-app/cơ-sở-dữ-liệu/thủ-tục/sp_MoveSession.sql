-- Chuyển bàn (FEATURE-049, ADR-010 D-43): chuyển cả nhóm (phiên chưa đóng) sang bàn khác đang dùng — bàn trống hoặc bàn có nhóm khác
-- (khi đó hai phiên song song, bill riêng — như khách chọn "Cá nhân"). Một transaction: Sessions.TableId + Orders.TableId mọi đơn của phiên
-- (thẻ đơn / phiếu pha / bill hiện bàn mới) + SessionTableMoves. Chia bill, hội viên, gọi nhân viên, gọi thanh toán gắn theo phiên nên đi theo.
-- Khóa phiên UPDLOCK → chạy tuần tự với sp_SubmitOrder (đơn mới luôn lấy đúng bàn), thu tiền, đóng bàn.
-- @ExpectedFromTableId (không bắt buộc): bàn máy quầy đang thấy — nhóm đã bị máy khác chuyển đi thì từ chối thay vì chuyển nhầm.
-- Lỗi: 50200 không có phiên, 50201 SESSION_CLOSED, 50202 không có bàn (hoặc đã xóa), 50203 TABLE_INACTIVE, 50204 SAME_TABLE, 50205 SESSION_MOVED.
CREATE OR ALTER PROCEDURE dbo.sp_MoveSession
  @SessionId   UNIQUEIDENTIFIER,
  @ToTableId   INT,
  @UserId      INT,
  @ExpectedFromTableId INT = NULL,
  @FromTableId INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  DECLARE @Status VARCHAR(20);
  SELECT @Status = Status, @FromTableId = TableId FROM dbo.Sessions WITH (UPDLOCK, HOLDLOCK) WHERE SessionId = @SessionId;
  IF @Status IS NULL BEGIN ROLLBACK; THROW 50200, 'SESSION_NOT_FOUND', 1; END
  IF @Status = 'CLOSED' BEGIN ROLLBACK; THROW 50201, 'SESSION_CLOSED', 1; END
  IF @ExpectedFromTableId IS NOT NULL AND @ExpectedFromTableId <> @FromTableId BEGIN ROLLBACK; THROW 50205, 'SESSION_MOVED', 1; END

  DECLARE @Found BIT = 0, @Active BIT, @Deleted DATETIME2(0);
  SELECT @Found = 1, @Active = IsActive, @Deleted = DeletedAt FROM dbo.Tables WITH (UPDLOCK, HOLDLOCK) WHERE TableId = @ToTableId;
  IF @Found = 0 OR @Deleted IS NOT NULL BEGIN ROLLBACK; THROW 50202, 'TABLE_NOT_FOUND', 1; END
  IF @Active = 0 BEGIN ROLLBACK; THROW 50203, 'TABLE_INACTIVE', 1; END
  IF @ToTableId = @FromTableId BEGIN ROLLBACK; THROW 50204, 'SAME_TABLE', 1; END

  UPDATE dbo.Sessions SET TableId = @ToTableId WHERE SessionId = @SessionId;
  UPDATE dbo.Orders SET TableId = @ToTableId WHERE SessionId = @SessionId;
  INSERT dbo.SessionTableMoves (SessionId, FromTableId, ToTableId, MovedBy) VALUES (@SessionId, @FromTableId, @ToTableId, @UserId);

  COMMIT;
END
