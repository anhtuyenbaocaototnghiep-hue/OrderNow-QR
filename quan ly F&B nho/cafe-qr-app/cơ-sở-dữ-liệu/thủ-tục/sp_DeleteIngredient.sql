-- Xóa nguyên liệu (ADR-004): còn trong BOM của món chưa xóa → chặn (message = tên các món); đang giữ cho đơn → chặn;
-- đã có lịch sử kho/đơn → xóa mềm; chưa có → xóa hẳn.
-- Lỗi: 50050 NOT_FOUND, 50051 IN_USE, 50052 HAS_RESERVED. @Result: 'DELETED' | 'ARCHIVED'.
CREATE OR ALTER PROCEDURE dbo.sp_DeleteIngredient
  @IngredientId INT,
  @Result       VARCHAR(10) OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  DECLARE @Reserved DECIMAL(18,3) = (
    SELECT ReservedQty FROM dbo.Ingredients WITH (UPDLOCK, HOLDLOCK) WHERE IngredientId = @IngredientId AND DeletedAt IS NULL);
  IF @Reserved IS NULL BEGIN ROLLBACK; THROW 50050, 'NOT_FOUND', 1; END

  DECLARE @UsedBy NVARCHAR(2000) = (
    SELECT STRING_AGG(m.Name, N', ')
    FROM dbo.BomItems b JOIN dbo.MenuItems m ON m.MenuItemId = b.MenuItemId
    WHERE b.IngredientId = @IngredientId AND m.DeletedAt IS NULL);
  -- Định lượng của tùy chọn món (FEATURE-013) cũng tính là đang dùng
  DECLARE @UsedByOption NVARCHAR(2000) = (
    SELECT STRING_AGG(N'tùy chọn ' + o.Name, N', ')
    FROM dbo.ModifierOptionBom ob JOIN dbo.ModifierOptions o ON o.OptionId = ob.OptionId JOIN dbo.ModifierGroups g ON g.GroupId = o.GroupId
    WHERE ob.IngredientId = @IngredientId AND o.DeletedAt IS NULL AND g.DeletedAt IS NULL);
  SET @UsedBy = CASE WHEN @UsedBy IS NULL THEN @UsedByOption WHEN @UsedByOption IS NULL THEN @UsedBy ELSE @UsedBy + N', ' + @UsedByOption END;
  -- Đầu vào công thức sơ chế của bán thành phẩm khác (FEATURE-027)
  DECLARE @UsedByRecipe NVARCHAR(2000) = (
    SELECT STRING_AGG(N'công thức ' + s.Name, N', ') FROM dbo.SemiRecipeLines rl JOIN dbo.Ingredients s ON s.IngredientId = rl.SemiIngredientId
    WHERE rl.InputIngredientId = @IngredientId AND s.DeletedAt IS NULL);
  SET @UsedBy = CASE WHEN @UsedBy IS NULL THEN @UsedByRecipe WHEN @UsedByRecipe IS NULL THEN @UsedBy ELSE @UsedBy + N', ' + @UsedByRecipe END;
  IF @UsedBy IS NOT NULL BEGIN ROLLBACK; THROW 50051, @UsedBy, 1; END

  IF @Reserved > 0 BEGIN ROLLBACK; THROW 50052, 'HAS_RESERVED', 1; END

  IF EXISTS (SELECT 1 FROM dbo.InventoryTransactions WHERE IngredientId = @IngredientId)
     OR EXISTS (SELECT 1 FROM dbo.OrderIngredients WHERE IngredientId = @IngredientId)
     OR EXISTS (SELECT 1 FROM dbo.BomItems WHERE IngredientId = @IngredientId)   -- BOM của món đã xóa mềm
     OR EXISTS (SELECT 1 FROM dbo.ModifierOptionBom WHERE IngredientId = @IngredientId)
     OR EXISTS (SELECT 1 FROM dbo.StockReceiptLines WHERE IngredientId = @IngredientId)
     OR EXISTS (SELECT 1 FROM dbo.StocktakeLines WHERE IngredientId = @IngredientId)
     OR EXISTS (SELECT 1 FROM dbo.PrepBatches WHERE SemiIngredientId = @IngredientId)
     OR EXISTS (SELECT 1 FROM dbo.WasteLogs WHERE IngredientId = @IngredientId)
     OR EXISTS (SELECT 1 FROM dbo.IngredientLots WHERE IngredientId = @IngredientId)
     OR EXISTS (SELECT 1 FROM dbo.PurchaseOrderLines WHERE IngredientId = @IngredientId)
     OR EXISTS (SELECT 1 FROM dbo.SupplierPriceHistory WHERE IngredientId = @IngredientId)
  BEGIN
    UPDATE dbo.Ingredients SET DeletedAt = SYSUTCDATETIME(), IsActive = 0 WHERE IngredientId = @IngredientId;
    SET @Result = 'ARCHIVED';
  END
  ELSE
  BEGIN
    DELETE dbo.SemiRecipeLines WHERE SemiIngredientId = @IngredientId;
    DELETE dbo.SemiRecipes WHERE SemiIngredientId = @IngredientId;
    DELETE dbo.SupplierIngredients WHERE IngredientId = @IngredientId;
    DELETE dbo.DemandForecasts WHERE IngredientId = @IngredientId;
    DELETE dbo.Ingredients WHERE IngredientId = @IngredientId;
    SET @Result = 'DELETED';
  END

  COMMIT;
END
