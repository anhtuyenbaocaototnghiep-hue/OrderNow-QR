-- Nhân viên bấm "Đã thu tiền" cho một phiên (ADR-000 / D-2; BR-007, BR-019).
-- Khóa Sessions trước tiên → chạy tuần tự với sp_SubmitOrder (Q-013). Một phiên chỉ thu một lần.
-- ADR-005: chiết khấu hội viên + giảm giá tay + làm tròn do service tính bằng bộ pricing (D-7, D-8) rồi truyền vào;
--   SP kiểm Σ đơn không đổi so với lúc tính (@OrdersTotal), AmountDue ≥ 0, AmountReceived ≥ AmountDue, ca còn mở; ghi breakdown + hội viên.
-- @ExpectedDue (tùy chọn): số tiền POS đang hiển thị; nếu khác số thực (có đơn mới/hủy) → 50034 AMOUNT_CHANGED.
-- Lỗi: 50005 SESSION_NOT_FOUND, 50012 INVALID_ORDER, 50020 INSUFFICIENT_AMOUNT, 50030 NO_ORDERS, 50032 ALREADY_SETTLED,
--      50033 HAS_PENDING_ORDERS (message = danh sách OrderId), 50034 AMOUNT_CHANGED, 50070 NO_OPEN_SHIFT, 50080 MEMBER_NOT_FOUND,
--      50113 SESSION_HAS_SPLITS (phiên đã chia bill → thu từng phần bằng sp_SettleSplit hoặc gộp lại trước — F-026).
-- ADR-006 F-038/F-039: @VoucherDiscount, @RewardDiscount (pricing tính) + @LoyaltyJson → sp_ApplyLoyalty trong cùng transaction.
CREATE OR ALTER PROCEDURE dbo.sp_SettleSession
  @SessionId      UNIQUEIDENTIFIER,
  @AmountReceived DECIMAL(12,0),
  @UserId         INT,
  @ExpectedDue    DECIMAL(12,0) = NULL,
  @OrdersTotal    DECIMAL(12,0) = NULL,     -- Σ TotalAmount service dùng để tính chiết khấu
  @MemberId       INT = NULL,
  @MemberPercent  DECIMAL(5,2) = NULL,
  @MemberDiscount DECIMAL(12,0) = 0,
  @ManualDiscount DECIMAL(12,0) = 0,
  @ManualReason   NVARCHAR(200) = NULL,
  @ApprovedBy     INT = NULL,
  @RoundingAdj    DECIMAL(12,0) = 0,
  @ShiftId        INT = NULL,
  @VoucherDiscount DECIMAL(12,0) = 0,
  @RewardDiscount DECIMAL(12,0) = 0,
  @LoyaltyJson    NVARCHAR(MAX) = NULL,
  @PaymentId      INT OUTPUT,
  @AmountDue      DECIMAL(12,0) OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF ISNULL(@MemberDiscount, -1) < 0 OR ISNULL(@ManualDiscount, -1) < 0 OR ISNULL(@RoundingAdj, -1) < 0
     OR ISNULL(@VoucherDiscount, -1) < 0 OR ISNULL(@RewardDiscount, -1) < 0 OR (@RewardDiscount > 0 AND @MemberId IS NULL)
     OR (@MemberDiscount > 0 AND @MemberId IS NULL)
     OR (@ManualDiscount > 0 AND NULLIF(LTRIM(RTRIM(@ManualReason)), '') IS NULL)
    THROW 50012, 'INVALID_ORDER', 1;

  BEGIN TRAN;

  -- 1. Chỉ một client thắng
  UPDATE dbo.Sessions
     SET Status = 'CLOSED', ClosedAt = SYSUTCDATETIME(), ClosedBy = @UserId, MemberId = COALESCE(@MemberId, MemberId)
   WHERE SessionId = @SessionId AND Status IN ('OPEN', 'PAYMENT_REQUESTED');
  IF @@ROWCOUNT = 0
  BEGIN
    ROLLBACK;
    IF NOT EXISTS (SELECT 1 FROM dbo.Sessions WHERE SessionId = @SessionId) THROW 50005, 'SESSION_NOT_FOUND', 1;
    THROW 50032, 'ALREADY_SETTLED', 1;
  END
  IF EXISTS (SELECT 1 FROM dbo.SessionSplits WHERE SessionId = @SessionId) BEGIN ROLLBACK; THROW 50113, 'SESSION_HAS_SPLITS', 1; END

  -- 2. Không còn đơn chưa tiếp nhận
  DECLARE @Pending NVARCHAR(2000) = (
    SELECT STRING_AGG(CAST(OrderId AS NVARCHAR(10)), ',')
    FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK)
    WHERE SessionId = @SessionId AND Status = 'PENDING');
  IF @Pending IS NOT NULL BEGIN ROLLBACK; THROW 50033, @Pending, 1; END

  -- 3. Tổng phải thu = mọi đơn không hủy − chiết khấu cấp thanh toán
  IF NOT EXISTS (SELECT 1 FROM dbo.Orders WHERE SessionId = @SessionId AND Status <> 'CANCELLED')
  BEGIN ROLLBACK; THROW 50030, 'NO_ORDERS', 1; END   -- dùng sp_CloseEmptySession

  DECLARE @Sum DECIMAL(12,0), @Subtotal DECIMAL(12,0), @Promo DECIMAL(12,0);
  SELECT @Sum = SUM(TotalAmount), @Subtotal = SUM(COALESCE(SubtotalAmount, TotalAmount)), @Promo = SUM(CASE WHEN SubtotalAmount IS NULL THEN 0 ELSE PromoDiscount END)
  FROM dbo.Orders WHERE SessionId = @SessionId AND Status <> 'CANCELLED';
  IF @OrdersTotal IS NOT NULL AND @OrdersTotal <> @Sum BEGIN ROLLBACK; THROW 50034, 'AMOUNT_CHANGED', 1; END

  SET @AmountDue = @Sum - @MemberDiscount - @VoucherDiscount - @RewardDiscount - @ManualDiscount - @RoundingAdj;
  IF @AmountDue < 0 BEGIN ROLLBACK; THROW 50012, 'INVALID_ORDER', 1; END
  IF @ExpectedDue IS NOT NULL AND @ExpectedDue <> @AmountDue BEGIN ROLLBACK; THROW 50034, 'AMOUNT_CHANGED', 1; END
  IF @AmountReceived IS NULL OR @AmountReceived < @AmountDue BEGIN ROLLBACK; THROW 50020, 'INSUFFICIENT_AMOUNT', 1; END

  -- Ca còn mở (khóa S tới hết transaction → sp_CloseShift chờ lượt thu này)
  IF @ShiftId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Shifts WITH (HOLDLOCK) WHERE ShiftId = @ShiftId AND ClosedAt IS NULL)
  BEGIN ROLLBACK; THROW 50070, 'NO_OPEN_SHIFT', 1; END

  -- 4. Ghi nhận
  DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();
  UPDATE dbo.Orders
     SET PaymentStatus = 'PAID', PaymentMethod = 'CASH', PaidAt = @Now
   WHERE SessionId = @SessionId AND Status <> 'CANCELLED' AND PaymentStatus = 'UNPAID';

  INSERT dbo.Payments (SessionId, Method, AmountDue, AmountReceived, ReceivedBy, PaidAt, MemberId, MemberPercent, SubtotalAmount, PromoDiscount,
                       MemberDiscount, ManualDiscount, ManualReason, ApprovedBy, RoundingAdj, ShiftId, VoucherDiscount, RewardDiscount, VoucherId)
  VALUES (@SessionId, 'CASH', @AmountDue, @AmountReceived, @UserId, @Now, @MemberId, @MemberPercent, @Subtotal, @Promo,
          @MemberDiscount, @ManualDiscount, NULLIF(LTRIM(RTRIM(@ManualReason)), ''), @ApprovedBy, @RoundingAdj, @ShiftId, @VoucherDiscount, @RewardDiscount,
          TRY_CAST(JSON_VALUE(@LoyaltyJson, '$.voucherId') AS INT));
  SET @PaymentId = SCOPE_IDENTITY();

  UPDATE oi SET PaidAt = @Now, PaymentId = @PaymentId
  FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId
  WHERE o.SessionId = @SessionId AND o.Status <> 'CANCELLED' AND oi.PaidAt IS NULL;

  IF @MemberId IS NOT NULL
    EXEC dbo.sp_ApplyMemberPayment @MemberId = @MemberId, @PaymentId = @PaymentId, @Spent = @AmountDue, @Discount = @MemberDiscount;
  IF @MemberId IS NOT NULL OR @LoyaltyJson IS NOT NULL
    EXEC dbo.sp_ApplyLoyalty @PaymentId = @PaymentId, @MemberId = @MemberId, @LoyaltyJson = @LoyaltyJson;

  COMMIT;
END
