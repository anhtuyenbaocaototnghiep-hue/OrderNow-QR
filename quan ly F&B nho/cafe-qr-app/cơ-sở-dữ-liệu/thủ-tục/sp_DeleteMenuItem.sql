-- Xóa món (ADR-004): chưa từng có trong đơn → xóa hẳn (kèm BOM); đã bán → xóa mềm (ẩn vĩnh viễn, giữ cho báo cáo).
-- Lỗi: 50050 NOT_FOUND. @Result: 'DELETED' | 'ARCHIVED'.
CREATE OR ALTER PROCEDURE dbo.sp_DeleteMenuItem
  @MenuItemId INT,
  @Result     VARCHAR(10) OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  IF NOT EXISTS (SELECT 1 FROM dbo.MenuItems WITH (UPDLOCK, HOLDLOCK) WHERE MenuItemId = @MenuItemId AND DeletedAt IS NULL)
  BEGIN ROLLBACK; THROW 50050, 'NOT_FOUND', 1; END

  IF EXISTS (SELECT 1 FROM dbo.OrderItems WHERE MenuItemId = @MenuItemId)
  BEGIN
    UPDATE dbo.MenuItems SET DeletedAt = SYSUTCDATETIME(), IsActive = 0, IsAvailable = 0 WHERE MenuItemId = @MenuItemId;
    SET @Result = 'ARCHIVED';
  END
  ELSE
  BEGIN
    DELETE dbo.BomItems WHERE MenuItemId = @MenuItemId;
    DELETE dbo.MenuItems WHERE MenuItemId = @MenuItemId;
    SET @Result = 'DELETED';
  END

  COMMIT;
END
