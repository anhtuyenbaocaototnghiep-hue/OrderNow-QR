-- Xóa món / combo (ADR-004): chưa từng có trong đơn → xóa hẳn (kèm BOM, thành phần combo, gán tùy chọn, mục tiêu khuyến mãi);
-- đã bán → xóa mềm (ẩn vĩnh viễn, giữ cho báo cáo). Món đang là thành phần của combo chưa xóa → chặn (FEATURE-015).
-- Lỗi: 50050 NOT_FOUND, 50056 IN_COMBO (message = tên combo). @Result: 'DELETED' | 'ARCHIVED'.
CREATE OR ALTER PROCEDURE dbo.sp_DeleteMenuItem
  @MenuItemId INT,
  @Result     VARCHAR(10) OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  IF NOT EXISTS (SELECT 1 FROM dbo.MenuItems WITH (UPDLOCK, HOLDLOCK) WHERE MenuItemId = @MenuItemId AND DeletedAt IS NULL)
  BEGIN ROLLBACK; THROW 50050, 'NOT_FOUND', 1; END

  DECLARE @Combos NVARCHAR(2000) = (
    SELECT STRING_AGG(c.Name, N', ') FROM dbo.ComboComponents cc JOIN dbo.MenuItems c ON c.MenuItemId = cc.ComboMenuItemId
    WHERE cc.ComponentMenuItemId = @MenuItemId AND c.DeletedAt IS NULL);
  IF @Combos IS NOT NULL BEGIN ROLLBACK; THROW 50056, @Combos, 1; END

  -- F-039: món không còn là quà / không còn tích tem; quà đổi điểm của món → ngừng (giữ lịch sử đổi thưởng)
  DELETE dbo.StampProgramItems WHERE MenuItemId = @MenuItemId;
  UPDATE dbo.StampPrograms SET RewardMenuItemId = NULL WHERE RewardMenuItemId = @MenuItemId;
  UPDATE dbo.RewardCatalog SET IsActive = 0 WHERE MenuItemId = @MenuItemId;

  IF EXISTS (SELECT 1 FROM dbo.OrderItems WHERE MenuItemId = @MenuItemId)
     OR EXISTS (SELECT 1 FROM dbo.RewardCatalog WHERE MenuItemId = @MenuItemId)
  BEGIN
    UPDATE dbo.MenuItems SET DeletedAt = SYSUTCDATETIME(), IsActive = 0, IsAvailable = 0 WHERE MenuItemId = @MenuItemId;
    DELETE dbo.MemberFavorites WHERE MenuItemId = @MenuItemId;
    DELETE dbo.MenuScheduleItems WHERE MenuItemId = @MenuItemId;
    SET @Result = 'ARCHIVED';
  END
  ELSE
  BEGIN
    DELETE dbo.BomItems WHERE MenuItemId = @MenuItemId;
    DELETE dbo.ComboComponents WHERE ComboMenuItemId = @MenuItemId OR ComponentMenuItemId = @MenuItemId;
    DELETE dbo.MenuItemModifierGroups WHERE MenuItemId = @MenuItemId;
    DELETE dbo.PromotionTargets WHERE MenuItemId = @MenuItemId;
    DELETE dbo.MemberFavorites WHERE MenuItemId = @MenuItemId;    -- F-045
    DELETE dbo.MenuScheduleItems WHERE MenuItemId = @MenuItemId;  -- F-040
    DELETE dbo.ItemPrepStats WHERE MenuItemId = @MenuItemId;      -- F-025
    DELETE dbo.MenuItems WHERE MenuItemId = @MenuItemId;
    SET @Result = 'DELETED';
  END

  COMMIT;
END
