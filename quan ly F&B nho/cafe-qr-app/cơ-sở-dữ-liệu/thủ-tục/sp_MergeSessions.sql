-- Thu chung nhiều bàn (FEATURE-057, ADR-019 D-73): gộp các phiên nguồn vào phiên đích ngay trước khi thu.
-- Service gọi thủ tục này rồi sp_SettleSession TRONG CÙNG một transaction → thu không thành thì không gộp gì.
-- Khóa phiên đích rồi các phiên nguồn (theo SessionId) bằng UPDLOCK → chạy tuần tự với sp_SubmitOrder / thu tiền / chuyển bàn.
-- Đơn chuyển sang phiên đích nhưng GIỮ TableId bàn gốc (bill nhóm theo bàn; phân tích "Theo bàn" tính theo lượt thu → ghi vào bàn đích); điện thoại của phiên nguồn
-- được chép sang phiên đích (xem bill, đánh giá món); phiên nguồn đóng, ghi MergedIntoSessionId.
-- @SourceIds: danh sách SessionId cách nhau bằng dấu phẩy (1–10, không trùng, khác phiên đích).
-- Lỗi: 50005 NOT_FOUND (phiên đích), 50031 SESSION_CLOSED (phiên đích), 50113 SESSION_HAS_SPLITS (phiên đích),
--      50210 MERGE_INVALID, 50211 MERGE_NOT_FOUND, 50212 MERGE_SESSION_CLOSED, 50213 MERGE_HAS_SPLITS.
CREATE OR ALTER PROCEDURE dbo.sp_MergeSessions
  @TargetSessionId UNIQUEIDENTIFIER,
  @SourceIds       NVARCHAR(1000),
  @UserId          INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;

  DECLARE @Src TABLE (SessionId UNIQUEIDENTIFIER NULL);
  INSERT @Src (SessionId) SELECT TRY_CAST(LTRIM(RTRIM(value)) AS UNIQUEIDENTIFIER) FROM STRING_SPLIT(@SourceIds, ',') WHERE LTRIM(RTRIM(value)) <> '';
  IF NOT EXISTS (SELECT 1 FROM @Src) OR (SELECT COUNT(*) FROM @Src) > 10
     OR EXISTS (SELECT 1 FROM @Src WHERE SessionId IS NULL OR SessionId = @TargetSessionId)
     OR (SELECT COUNT(DISTINCT SessionId) FROM @Src) <> (SELECT COUNT(*) FROM @Src)
    THROW 50210, 'MERGE_INVALID', 1;

  BEGIN TRAN;

  DECLARE @TargetStatus VARCHAR(20);
  SELECT @TargetStatus = Status FROM dbo.Sessions WITH (UPDLOCK, HOLDLOCK) WHERE SessionId = @TargetSessionId;
  IF @TargetStatus IS NULL BEGIN ROLLBACK; THROW 50005, 'NOT_FOUND', 1; END
  IF @TargetStatus = 'CLOSED' BEGIN ROLLBACK; THROW 50031, 'SESSION_CLOSED', 1; END

  DECLARE @Locked TABLE (SessionId UNIQUEIDENTIFIER PRIMARY KEY, Status VARCHAR(20) NOT NULL);
  INSERT @Locked (SessionId, Status)
  SELECT s.SessionId, s.Status FROM dbo.Sessions s WITH (UPDLOCK, HOLDLOCK)
  WHERE s.SessionId IN (SELECT SessionId FROM @Src);
  IF (SELECT COUNT(*) FROM @Locked) <> (SELECT COUNT(*) FROM @Src) BEGIN ROLLBACK; THROW 50211, 'MERGE_NOT_FOUND', 1; END
  IF EXISTS (SELECT 1 FROM @Locked WHERE Status = 'CLOSED') BEGIN ROLLBACK; THROW 50212, 'MERGE_SESSION_CLOSED', 1; END

  IF EXISTS (SELECT 1 FROM dbo.SessionSplits WHERE SessionId = @TargetSessionId) BEGIN ROLLBACK; THROW 50113, 'SESSION_HAS_SPLITS', 1; END
  IF EXISTS (SELECT 1 FROM dbo.SessionSplits WHERE SessionId IN (SELECT SessionId FROM @Locked)) BEGIN ROLLBACK; THROW 50213, 'MERGE_HAS_SPLITS', 1; END

  -- Đơn sang phiên đích (giữ TableId bàn gốc)
  UPDATE o SET SessionId = @TargetSessionId
  FROM dbo.Orders o WITH (UPDLOCK, HOLDLOCK)
  WHERE o.SessionId IN (SELECT SessionId FROM @Locked);

  -- Lịch sử sửa / xóa món đi theo đơn sang bill chung
  UPDATE dbo.OrderItemVoids SET SessionId = @TargetSessionId WHERE SessionId IN (SELECT SessionId FROM @Locked);

  -- Điện thoại của phiên nguồn thành thành viên phiên đích (xem bill, đánh giá món)
  INSERT dbo.SessionClients (SessionId, ClientToken, JoinedAt)
  SELECT @TargetSessionId, c.ClientToken, MIN(c.JoinedAt)
  FROM dbo.SessionClients c
  WHERE c.SessionId IN (SELECT SessionId FROM @Locked)
    AND NOT EXISTS (SELECT 1 FROM dbo.SessionClients t WHERE t.SessionId = @TargetSessionId AND t.ClientToken = c.ClientToken)
  GROUP BY c.ClientToken;

  UPDATE dbo.Sessions
     SET Status = 'CLOSED', ClosedAt = SYSUTCDATETIME(), ClosedBy = @UserId, MergedIntoSessionId = @TargetSessionId
   WHERE SessionId IN (SELECT SessionId FROM @Locked);

  COMMIT;
END
