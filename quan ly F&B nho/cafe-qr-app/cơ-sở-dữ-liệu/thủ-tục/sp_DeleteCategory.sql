-- Xóa danh mục (ADR-004): còn món chưa xóa → chặn; chỉ còn món đã xóa mềm → xóa mềm; không còn món → xóa hẳn.
-- Lỗi: 50050 NOT_FOUND, 50054 HAS_ITEMS. @Result: 'DELETED' | 'ARCHIVED'.
CREATE OR ALTER PROCEDURE dbo.sp_DeleteCategory
  @CategoryId INT,
  @Result     VARCHAR(10) OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  IF NOT EXISTS (SELECT 1 FROM dbo.Categories WITH (UPDLOCK, HOLDLOCK) WHERE CategoryId = @CategoryId AND DeletedAt IS NULL)
  BEGIN ROLLBACK; THROW 50050, 'NOT_FOUND', 1; END

  IF EXISTS (SELECT 1 FROM dbo.MenuItems WHERE CategoryId = @CategoryId AND DeletedAt IS NULL)
  BEGIN ROLLBACK; THROW 50054, 'HAS_ITEMS', 1; END

  IF EXISTS (SELECT 1 FROM dbo.MenuItems WHERE CategoryId = @CategoryId)
  BEGIN
    UPDATE dbo.Categories SET DeletedAt = SYSUTCDATETIME() WHERE CategoryId = @CategoryId;
    SET @Result = 'ARCHIVED';
  END
  ELSE
  BEGIN
    DELETE dbo.Categories WHERE CategoryId = @CategoryId;
    SET @Result = 'DELETED';
  END

  COMMIT;
END
