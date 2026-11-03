-- Vòng quay may mắn (FEATURE-065, ADR-024 D-89…D-91): quay một lượt trong một transaction.
-- @PrizeId: ô máy chủ đã chọn (service — ngẫu nhiên an toàn theo trọng số); @NoneId: ô "không trúng" dùng khi hết ngân sách.
-- Khóa ứng dụng 'LuckySpinBudget' cho mọi lượt quay → đếm lượt trúng hôm nay (từ @DayStart, giờ quán) rồi ghi không bị hai lượt cùng vượt
-- @DailyWinCap (D-90). Trúng voucher → Vouchers nguồn GAME, gắn hội viên của lượt thu (nếu có); trúng điểm → Members.Points + sổ điểm (ADJUST).
-- Đã quay → không đổi gì (service đọc lại kết quả cũ).
-- Lỗi: 50240 SPIN_NOT_FOUND, 50241 SPIN_EXPIRED, 50242 SPIN_REFUNDED (lượt thu đã hoàn tiền), 50243 PRIZE_INVALID.
CREATE OR ALTER PROCEDURE dbo.sp_SpinLucky
  @Token       CHAR(32),
  @PrizeId     INT,
  @NoneId      INT,
  @DailyWinCap INT,
  @VoucherDays INT,
  @DayStart    DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;
  EXEC sp_getapplock @Resource = 'LuckySpinBudget', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;

  DECLARE @SpinId INT, @PaymentId INT, @ExpiresAt DATETIME2(0), @SpunAt DATETIME2(0), @MemberId INT;
  SELECT @SpinId = s.SpinId, @PaymentId = s.PaymentId, @ExpiresAt = s.ExpiresAt, @SpunAt = s.SpunAt, @MemberId = p.MemberId
  FROM dbo.LuckySpins s WITH (UPDLOCK, HOLDLOCK) JOIN dbo.Payments p ON p.PaymentId = s.PaymentId
  WHERE s.Token = @Token;
  IF @SpinId IS NULL BEGIN ROLLBACK; THROW 50240, 'SPIN_NOT_FOUND', 1; END
  IF @SpunAt IS NOT NULL BEGIN COMMIT; RETURN; END
  IF @ExpiresAt < SYSUTCDATETIME() BEGIN ROLLBACK; THROW 50241, 'SPIN_EXPIRED', 1; END
  IF EXISTS (SELECT 1 FROM dbo.Refunds WHERE PaymentId = @PaymentId) BEGIN ROLLBACK; THROW 50242, 'SPIN_REFUNDED', 1; END

  DECLARE @Kind VARCHAR(10), @Value DECIMAL(12,0), @Label NVARCHAR(40), @MaxDiscount DECIMAL(12,0);
  SELECT @Kind = Kind, @Value = Value, @Label = Label, @MaxDiscount = MaxDiscount FROM dbo.SpinPrizes WHERE PrizeId = @PrizeId AND IsActive = 1;
  IF @Kind IS NULL OR (@Kind = 'POINTS' AND @MemberId IS NULL) BEGIN ROLLBACK; THROW 50243, 'PRIZE_INVALID', 1; END

  -- D-90: hết ngân sách quà trong ngày → ô "không trúng"
  IF @Kind <> 'NONE' AND (SELECT COUNT(*) FROM dbo.LuckySpins WHERE SpunAt >= @DayStart AND Kind <> 'NONE') >= @DailyWinCap
  BEGIN
    SELECT @PrizeId = PrizeId, @Kind = Kind, @Value = Value, @Label = Label, @MaxDiscount = MaxDiscount
    FROM dbo.SpinPrizes WHERE PrizeId = @NoneId AND Kind = 'NONE';
    IF @Kind <> 'NONE' BEGIN ROLLBACK; THROW 50243, 'PRIZE_INVALID', 1; END
  END

  DECLARE @VoucherId INT = NULL, @Points INT = NULL;
  IF @Kind IN ('PERCENT', 'AMOUNT')
  BEGIN
    INSERT dbo.Vouchers (Code, MemberId, DiscountPercent, DiscountAmount, MaxDiscount, ExpiresAt, Source, IssuedForPaymentId)
    VALUES ('QM' + UPPER(LEFT(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''), 8)), @MemberId,
            CASE WHEN @Kind = 'PERCENT' THEN @Value END, CASE WHEN @Kind = 'AMOUNT' THEN @Value END,
            CASE WHEN @Kind = 'PERCENT' THEN @MaxDiscount END,
            DATEADD(DAY, @VoucherDays, SYSUTCDATETIME()), 'GAME', @PaymentId);
    SET @VoucherId = SCOPE_IDENTITY();
  END
  ELSE IF @Kind = 'POINTS'
  BEGIN
    SET @Points = CAST(@Value AS INT);
    UPDATE dbo.Members SET Points = Points + @Points WHERE MemberId = @MemberId;
    INSERT dbo.PointTransactions (MemberId, PaymentId, Delta, Type, Note) VALUES (@MemberId, @PaymentId, @Points, 'ADJUST', N'Vòng quay may mắn');
  END

  UPDATE dbo.LuckySpins
     SET SpunAt = SYSUTCDATETIME(), PrizeId = @PrizeId, Kind = @Kind, PrizeLabel = @Label, VoucherId = @VoucherId, Points = @Points
   WHERE SpinId = @SpinId;
  COMMIT;
END
