-- Đóng ca tiền mặt (FEATURE-018): ExpectedCash = OpeningCash + Σ AmountDue thu TIỀN MẶT trong ca − Σ hoàn tiền (của lượt tiền mặt) trong ca
--   (ADR-019 D-72: lượt chuyển khoản và hoàn tiền của lượt chuyển khoản không vào két)
--   + Σ thu khác − Σ chi quỹ ĐÃ DUYỆT (FEATURE-033, ADR-006 D-23). Còn khoản chi chờ duyệt → không đóng được (50072).
-- Khóa dòng ca (X) → các lượt thu tiền/hoàn tiền/sổ quỹ đang chạy (giữ khóa S trên ca) phải xong trước; lượt sau thấy ca đã đóng.
-- Lỗi: 50071 SHIFT_NOT_OPEN, 50072 CASH_PENDING.
CREATE OR ALTER PROCEDURE dbo.sp_CloseShift
  @ShiftId      INT,
  @CountedCash  DECIMAL(12,0),
  @Note         NVARCHAR(200) = NULL,
  @UserId       INT,
  @ExpectedCash DECIMAL(12,0) OUTPUT,
  @Difference   DECIMAL(12,0) OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  DECLARE @Opening DECIMAL(12,0);
  SELECT @Opening = OpeningCash FROM dbo.Shifts WITH (UPDLOCK, HOLDLOCK) WHERE ShiftId = @ShiftId AND ClosedAt IS NULL;
  IF @Opening IS NULL BEGIN ROLLBACK; THROW 50071, 'SHIFT_NOT_OPEN', 1; END

  -- Chặn lượt thu/hoàn/sổ quỹ mới gắn ca này trong lúc tính (đổi khóa U → X)
  UPDATE dbo.Shifts SET Note = Note WHERE ShiftId = @ShiftId;

  IF EXISTS (SELECT 1 FROM dbo.CashTransactions WHERE ShiftId = @ShiftId AND Status = 'PENDING')
  BEGIN ROLLBACK; THROW 50072, 'CASH_PENDING', 1; END

  SET @ExpectedCash = @Opening
    + ISNULL((SELECT SUM(AmountDue) FROM dbo.Payments WHERE ShiftId = @ShiftId AND Method = 'CASH'), 0)
    - ISNULL((SELECT SUM(r.Amount) FROM dbo.Refunds r JOIN dbo.Payments p ON p.PaymentId = r.PaymentId WHERE r.ShiftId = @ShiftId AND p.Method = 'CASH'), 0)
    + ISNULL((SELECT SUM(Amount) FROM dbo.CashTransactions WHERE ShiftId = @ShiftId AND Status = 'APPROVED' AND Direction = 'IN'), 0)
    - ISNULL((SELECT SUM(Amount) FROM dbo.CashTransactions WHERE ShiftId = @ShiftId AND Status = 'APPROVED' AND Direction = 'OUT'), 0);
  SET @Difference = @CountedCash - @ExpectedCash;

  UPDATE dbo.Shifts
     SET ClosedAt = SYSUTCDATETIME(), ClosedBy = @UserId, ExpectedCash = @ExpectedCash, CountedCash = @CountedCash,
         Difference = @Difference, Note = NULLIF(LTRIM(RTRIM(@Note)), '')
   WHERE ShiftId = @ShiftId;

  -- F-035: người đóng ca kết thúc chấm công
  UPDATE dbo.Attendance SET ClockOut = SYSUTCDATETIME() WHERE UserId = @UserId AND ClockOut IS NULL;

  COMMIT;
END
