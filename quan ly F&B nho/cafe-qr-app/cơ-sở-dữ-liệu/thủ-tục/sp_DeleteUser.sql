-- Xóa tài khoản nhân viên (ADR-004): không tự xóa mình; đã có thao tác (đơn, thu tiền, đóng phiên, kho) → xóa mềm
-- (không đăng nhập được, token cũ hết hiệu lực); chưa có → xóa hẳn.
-- Lỗi: 50050 NOT_FOUND, 50055 CANNOT_DELETE_SELF. @Result: 'DELETED' | 'ARCHIVED'.
CREATE OR ALTER PROCEDURE dbo.sp_DeleteUser
  @UserId  INT,
  @ActorId INT,
  @Result  VARCHAR(10) OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF @UserId = @ActorId THROW 50055, 'CANNOT_DELETE_SELF', 1;

  BEGIN TRAN;

  IF NOT EXISTS (SELECT 1 FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE UserId = @UserId AND DeletedAt IS NULL)
  BEGIN ROLLBACK; THROW 50050, 'NOT_FOUND', 1; END

  IF EXISTS (SELECT 1 FROM dbo.Orders WHERE CreatedBy = @UserId OR CompletedBy = @UserId OR CancelledBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.Sessions WHERE ClosedBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.Payments WHERE ReceivedBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.InventoryTransactions WHERE CreatedBy = @UserId)
  BEGIN
    UPDATE dbo.Users SET DeletedAt = SYSUTCDATETIME(), IsActive = 0 WHERE UserId = @UserId;
    SET @Result = 'ARCHIVED';
  END
  ELSE
  BEGIN
    DELETE dbo.Users WHERE UserId = @UserId;
    SET @Result = 'DELETED';
  END

  COMMIT;
END
