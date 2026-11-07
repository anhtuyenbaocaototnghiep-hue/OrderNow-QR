-- FEATURE-075 (ADR-033 D-147, D-148): "hộp đang mở" của từng nguyên liệu (PackSize + OpenShelfHours đã đặt).
--
-- sp_TrackOpenPacks: gọi TRONG transaction của sp_CompleteOrder / sp_PostPrepBatch ngay sau khi trừ kho. Đọc bảng tạm #PackUse
--   (IngredientId, Qty) do thủ tục gọi tạo (cùng kiểu #LotUse). Dùng q: lấy trước từ hộp đang mở (OpenLeft); thiếu → mở thêm đủ số hộp
--   cho phần còn lại, OpenedAt = @At (giờ bán / sơ chế), OpenLeft = phần còn trong hộp mở sau cùng; dùng vừa hết hộp → không còn hộp mở.
--   OpenLeft không vượt tồn kho sau khi trừ.
-- sp_DiscardOpenPack: bỏ phần còn lại của hộp đang mở (đã quá hạn sau khi mở, hoặc nhân viên thấy hỏng) → phiếu hủy EXPIRED (qua
--   sp_LogWaste: theo lô thì trừ FEFO, có giá vốn) cho phần còn lại (không đụng phần đang giữ cho đơn chờ), rồi xóa trạng thái hộp mở.
--   Lỗi: 50041 INGREDIENT_NOT_FOUND, 50124 NO_OPEN_PACK.
CREATE OR ALTER PROCEDURE dbo.sp_TrackOpenPacks
  @At DATETIME2(0) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Now DATETIME2(0) = ISNULL(@At, SYSUTCDATETIME());
  UPDATE ing SET
    OpenedAt = CASE WHEN x.NewLeft = 0 THEN NULL WHEN u.Qty <= ing.OpenLeft THEN ing.OpenedAt ELSE @Now END,
    OpenLeft = x.NewLeft
  FROM dbo.Ingredients ing
  JOIN (SELECT IngredientId, SUM(Qty) AS Qty FROM #PackUse GROUP BY IngredientId) u ON u.IngredientId = ing.IngredientId
  CROSS APPLY (SELECT CASE WHEN u.Qty <= ing.OpenLeft THEN ing.OpenLeft - u.Qty
                           ELSE CEILING((u.Qty - ing.OpenLeft) / ing.PackSize) * ing.PackSize - (u.Qty - ing.OpenLeft) END AS Raw) r
  CROSS APPLY (SELECT CASE WHEN r.Raw > ing.StockQty THEN ing.StockQty WHEN r.Raw < 0 THEN 0 ELSE r.Raw END AS NewLeft) x
  WHERE ing.PackSize > 0 AND ing.OpenShelfHours IS NOT NULL AND u.Qty > 0;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_DiscardOpenPack
  @IngredientId INT,
  @UserId       INT,
  @Note         NVARCHAR(200) = NULL,
  @WasteId      INT OUTPUT,
  @Qty          DECIMAL(18,3) OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  SET @WasteId = NULL;
  BEGIN TRAN;
  DECLARE @Left DECIMAL(18,3), @Stock DECIMAL(18,3), @Reserved DECIMAL(18,3);
  SELECT @Left = OpenLeft, @Stock = StockQty, @Reserved = ReservedQty
  FROM dbo.Ingredients WITH (UPDLOCK, HOLDLOCK) WHERE IngredientId = @IngredientId AND DeletedAt IS NULL;
  IF @Left IS NULL BEGIN ROLLBACK; THROW 50041, 'INGREDIENT_NOT_FOUND', 1; END
  IF @Left <= 0 BEGIN ROLLBACK; THROW 50124, 'NO_OPEN_PACK', 1; END
  -- Không hủy phần đang giữ cho đơn chờ làm (ReservedQty) — nếu hộp mở chỉ còn phần đó thì chỉ xóa trạng thái
  SET @Qty = CASE WHEN @Left < @Stock - @Reserved THEN @Left ELSE @Stock - @Reserved END;
  IF @Qty > 0
    EXEC dbo.sp_LogWaste @IngredientId = @IngredientId, @Qty = @Qty, @Reason = 'EXPIRED',
         @Note = @Note, @UserId = @UserId, @WasteId = @WasteId OUTPUT;
  ELSE SET @Qty = 0;
  UPDATE dbo.Ingredients SET OpenLeft = 0, OpenedAt = NULL WHERE IngredientId = @IngredientId;
  COMMIT;
END
GO
