-- Hủy / sửa khoản sổ quỹ ĐÃ DUYỆT (FEATURE-050, ADR-010 D-44): chỉ khoản APPROVED của ca ĐANG MỞ — khóa ca HOLDLOCK như sp_CreateCashTxn
-- nên chạy tuần tự với sp_CloseShift (số đã chốt của ca đóng không bao giờ đổi).
--   Hủy: khoản → VOIDED (tiền dự kiến / sổ quỹ / lãi lỗ chỉ tính APPROVED nên tự loại).
--   Sửa: có @NewCategoryId → tạo khoản thay thế trong CÙNG transaction theo quy tắc ghi khoản (chi vượt ngưỡng / danh mục cần duyệt →
--        PENDING, còn lại APPROVED), nội dung thêm "(thay khoản #N)", nối ReplacedById / ReplacesId.
-- Quyền (trưởng ca ≤ ngưỡng / quản lý, không tự hủy khoản mình ghi, nhân viên nhập tài khoản) kiểm ở service; @UserId = người duyệt (VoidedBy),
-- @ActorId = người đứng máy (ghi khoản thay thế).
-- Lỗi: 50140 CASH_CATEGORY_INVALID, 50142 CASH_NOT_APPROVED, 50143 không có khoản, 50144 thiếu lý do, 50145 SHIFT_CLOSED.
CREATE OR ALTER PROCEDURE dbo.sp_VoidCashTxn
  @CashTxnId     INT,
  @UserId        INT,
  @ActorId       INT,
  @Reason        NVARCHAR(200),
  @NewCategoryId INT = NULL,
  @NewAmount     DECIMAL(12,0) = NULL,
  @NewReason     NVARCHAR(200) = NULL,
  @Threshold     DECIMAL(12,0) = NULL,
  @NewTxnId      INT OUTPUT,
  @NewStatus     VARCHAR(10) OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  DECLARE @R NVARCHAR(200) = NULLIF(LTRIM(RTRIM(@Reason)), N'');
  IF @R IS NULL THROW 50144, 'REASON_REQUIRED', 1;
  SELECT @NewTxnId = NULL, @NewStatus = NULL;

  BEGIN TRAN;
  DECLARE @Shift INT, @Status VARCHAR(10);
  SELECT @Shift = ShiftId, @Status = Status FROM dbo.CashTransactions WITH (UPDLOCK, HOLDLOCK) WHERE CashTxnId = @CashTxnId;
  IF @Shift IS NULL BEGIN ROLLBACK; THROW 50143, 'CASH_NOT_FOUND', 1; END
  IF @Status <> 'APPROVED' BEGIN ROLLBACK; THROW 50142, 'CASH_NOT_APPROVED', 1; END
  IF NOT EXISTS (SELECT 1 FROM dbo.Shifts WITH (HOLDLOCK) WHERE ShiftId = @Shift AND ClosedAt IS NULL)
  BEGIN ROLLBACK; THROW 50145, 'SHIFT_CLOSED', 1; END

  IF @NewCategoryId IS NOT NULL
  BEGIN
    IF @NewAmount IS NULL OR @NewAmount <= 0 OR NULLIF(LTRIM(RTRIM(@NewReason)), N'') IS NULL
    BEGIN ROLLBACK; THROW 50140, 'CASH_CATEGORY_INVALID', 1; END
    DECLARE @Dir CHAR(3), @Needs BIT;
    SELECT @Dir = Direction, @Needs = RequiresApproval FROM dbo.CashCategories WHERE CategoryId = @NewCategoryId AND IsActive = 1;
    IF @Dir IS NULL BEGIN ROLLBACK; THROW 50140, 'CASH_CATEGORY_INVALID', 1; END
    SET @NewStatus = CASE WHEN @Dir = 'OUT' AND (@NewAmount > @Threshold OR @Needs = 1) THEN 'PENDING' ELSE 'APPROVED' END;
    INSERT dbo.CashTransactions (ShiftId, CategoryId, Direction, Amount, Reason, Status, CreatedBy, ReplacesId)
    VALUES (@Shift, @NewCategoryId, @Dir, @NewAmount,
            LEFT(LTRIM(RTRIM(@NewReason)) + N' (thay khoản #' + CAST(@CashTxnId AS NVARCHAR(10)) + N')', 200), @NewStatus, @ActorId, @CashTxnId);
    SET @NewTxnId = SCOPE_IDENTITY();
  END

  UPDATE dbo.CashTransactions
     SET Status = 'VOIDED', VoidedBy = @UserId, VoidedAt = SYSUTCDATETIME(), VoidReason = @R, ReplacedById = @NewTxnId
   WHERE CashTxnId = @CashTxnId;
  COMMIT;
END
