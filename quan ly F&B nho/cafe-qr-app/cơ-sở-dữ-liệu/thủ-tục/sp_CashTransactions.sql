-- Sổ quỹ (FEATURE-033, ADR-006 D-23): ghi khoản thu / chi tiền mặt ngoài bán hàng vào ca ĐANG MỞ (khóa S trên ca → chạy tuần tự
-- với sp_CloseShift). Chi > ngưỡng hoặc danh mục cần duyệt → PENDING (chờ MANAGER/ADMIN); còn lại → APPROVED ngay.
-- Lỗi: 50070 NO_OPEN_SHIFT, 50140 CASH_CATEGORY_INVALID.
CREATE OR ALTER PROCEDURE dbo.sp_CreateCashTxn
  @ShiftId    INT,
  @CategoryId INT,
  @Amount     DECIMAL(12,0),
  @Reason     NVARCHAR(200),
  @UserId     INT,
  @Threshold  DECIMAL(12,0),
  @CashTxnId  INT OUTPUT,
  @Status     VARCHAR(10) OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF @Amount IS NULL OR @Amount <= 0 OR NULLIF(LTRIM(RTRIM(@Reason)), '') IS NULL THROW 50140, 'CASH_CATEGORY_INVALID', 1;
  BEGIN TRAN;
  IF NOT EXISTS (SELECT 1 FROM dbo.Shifts WITH (HOLDLOCK) WHERE ShiftId = @ShiftId AND ClosedAt IS NULL)
  BEGIN ROLLBACK; THROW 50070, 'NO_OPEN_SHIFT', 1; END

  DECLARE @Dir CHAR(3), @Needs BIT;
  SELECT @Dir = Direction, @Needs = RequiresApproval FROM dbo.CashCategories WHERE CategoryId = @CategoryId AND IsActive = 1;
  IF @Dir IS NULL BEGIN ROLLBACK; THROW 50140, 'CASH_CATEGORY_INVALID', 1; END

  SET @Status = CASE WHEN @Dir = 'OUT' AND (@Amount > @Threshold OR @Needs = 1) THEN 'PENDING' ELSE 'APPROVED' END;
  INSERT dbo.CashTransactions (ShiftId, CategoryId, Direction, Amount, Reason, Status, CreatedBy)
  VALUES (@ShiftId, @CategoryId, @Dir, @Amount, LTRIM(RTRIM(@Reason)), @Status, @UserId);
  SET @CashTxnId = SCOPE_IDENTITY();
  COMMIT;
END
GO

-- Duyệt / từ chối khoản chi đang chờ (ca phải còn mở). Hai người cùng duyệt → một người thắng (50141).
-- Lỗi: 50141 CASH_NOT_PENDING, 50070 NO_OPEN_SHIFT.
CREATE OR ALTER PROCEDURE dbo.sp_ReviewCashTxn
  @CashTxnId    INT,
  @Approve      BIT,
  @UserId       INT,
  @RejectReason NVARCHAR(200) = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;
  DECLARE @Shift INT = (SELECT ShiftId FROM dbo.CashTransactions WITH (UPDLOCK, HOLDLOCK) WHERE CashTxnId = @CashTxnId AND Status = 'PENDING');
  IF @Shift IS NULL BEGIN ROLLBACK; THROW 50141, 'CASH_NOT_PENDING', 1; END
  IF NOT EXISTS (SELECT 1 FROM dbo.Shifts WITH (HOLDLOCK) WHERE ShiftId = @Shift AND ClosedAt IS NULL)
  BEGIN ROLLBACK; THROW 50070, 'NO_OPEN_SHIFT', 1; END
  UPDATE dbo.CashTransactions
     SET Status = CASE WHEN @Approve = 1 THEN 'APPROVED' ELSE 'REJECTED' END, ApprovedBy = @UserId, ApprovedAt = SYSUTCDATETIME(),
         RejectReason = CASE WHEN @Approve = 1 THEN NULL ELSE NULLIF(LTRIM(RTRIM(@RejectReason)), '') END
   WHERE CashTxnId = @CashTxnId;
  COMMIT;
END
