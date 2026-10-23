-- Xóa bàn (ADR-004): đang có khách (phiên chưa đóng) → chặn; đã có phiên → xóa mềm + đổi QrToken (QR cũ hết hiệu lực);
-- chưa từng có phiên → xóa hẳn. Lỗi: 50050 NOT_FOUND, 50053 TABLE_BUSY. @Result: 'DELETED' | 'ARCHIVED'.
CREATE OR ALTER PROCEDURE dbo.sp_DeleteTable
  @TableId INT,
  @Result  VARCHAR(10) OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  IF NOT EXISTS (SELECT 1 FROM dbo.Tables WITH (UPDLOCK, HOLDLOCK) WHERE TableId = @TableId AND DeletedAt IS NULL)
  BEGIN ROLLBACK; THROW 50050, 'NOT_FOUND', 1; END

  IF EXISTS (SELECT 1 FROM dbo.Sessions WHERE TableId = @TableId AND Status <> 'CLOSED')
  BEGIN ROLLBACK; THROW 50053, 'TABLE_BUSY', 1; END

  IF EXISTS (SELECT 1 FROM dbo.Sessions WHERE TableId = @TableId) OR EXISTS (SELECT 1 FROM dbo.Orders WHERE TableId = @TableId)
     OR EXISTS (SELECT 1 FROM dbo.SessionTableMoves WHERE FromTableId = @TableId OR ToTableId = @TableId)   -- F-049: từng là bàn cũ / mới khi chuyển
  BEGIN
    UPDATE dbo.Tables
       SET DeletedAt = SYSUTCDATETIME(), IsActive = 0, QrToken = LOWER(REPLACE(CAST(NEWID() AS CHAR(36)), '-', ''))
     WHERE TableId = @TableId;
    SET @Result = 'ARCHIVED';
  END
  ELSE
  BEGIN
    DELETE dbo.Tables WHERE TableId = @TableId;
    SET @Result = 'DELETED';
  END

  COMMIT;
END
