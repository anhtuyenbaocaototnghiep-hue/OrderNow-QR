-- Thu tiền MỘT PHẦN của phiên đã chia bill (FEATURE-026, ADR-006 D-17). Gọi cho phần thường hoặc phần Chung.
-- Dòng của phần = dòng món khách chọn (không gồm dòng con combo) chưa thu, thuộc đơn còn hiệu lực, SplitId = phần
--   (+ dòng Chung khi @IncludeCommon = 1; phần Chung thì SplitId IS NULL).
-- Phần cuối còn mở mà vẫn còn dòng Chung chưa thu → bắt buộc gộp Chung (50111). Thu xong mọi dòng → đóng phiên.
-- Tiền: service tính bằng pricing (khuyến mãi đơn chia theo dòng @OrderPromoAlloc, hội viên, giảm tay, làm tròn);
--   SP kiểm Σ dòng (@LinesTotal) chưa đổi, AmountDue ≥ 0, đủ tiền, ca còn mở. Khóa: Sessions → SessionSplits → Shifts (S) → Orders → Members.
-- Lỗi: 50005 SESSION_NOT_FOUND, 50012 INVALID_ORDER, 50020 INSUFFICIENT_AMOUNT, 50032 ALREADY_SETTLED, 50033 HAS_PENDING_ORDERS,
--      50034 AMOUNT_CHANGED, 50070 NO_OPEN_SHIFT, 50110 SPLIT_PAID, 50111 COMMON_REQUIRED, 50112 SPLIT_EMPTY.
-- ADR-006 F-038/F-039: @VoucherDiscount, @RewardDiscount (pricing tính) + @LoyaltyJson → sp_ApplyLoyalty trong cùng transaction.
CREATE OR ALTER PROCEDURE dbo.sp_SettleSplit
  @SplitId         INT,
  @IncludeCommon   BIT = 0,
  @AmountReceived  DECIMAL(12,0),
  @UserId          INT,
  @LinesTotal      DECIMAL(12,0),            -- Σ Quantity × UnitPrice các dòng service đã tính
  @OrderPromoAlloc DECIMAL(12,0) = 0,        -- phần khuyến mãi đơn phân bổ cho các dòng này
  @ExpectedDue     DECIMAL(12,0) = NULL,
  @MemberId        INT = NULL,
  @MemberPercent   DECIMAL(5,2) = NULL,
  @MemberDiscount  DECIMAL(12,0) = 0,
  @ManualDiscount  DECIMAL(12,0) = 0,
  @ManualReason    NVARCHAR(200) = NULL,
  @ApprovedBy      INT = NULL,
  @RoundingAdj     DECIMAL(12,0) = 0,
  @ShiftId         INT = NULL,
  @VoucherDiscount DECIMAL(12,0) = 0,
  @RewardDiscount  DECIMAL(12,0) = 0,
  @LoyaltyJson     NVARCHAR(MAX) = NULL,
  @PaymentId       INT OUTPUT,
  @AmountDue       DECIMAL(12,0) OUTPUT,
  @SessionClosed   BIT OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  SET @SessionClosed = 0;
  IF ISNULL(@MemberDiscount, -1) < 0 OR ISNULL(@ManualDiscount, -1) < 0 OR ISNULL(@RoundingAdj, -1) < 0 OR ISNULL(@OrderPromoAlloc, -1) < 0
     OR ISNULL(@VoucherDiscount, -1) < 0 OR ISNULL(@RewardDiscount, -1) < 0 OR (@RewardDiscount > 0 AND @MemberId IS NULL)
     OR (@MemberDiscount > 0 AND @MemberId IS NULL)
     OR (@ManualDiscount > 0 AND NULLIF(LTRIM(RTRIM(@ManualReason)), '') IS NULL)
    THROW 50012, 'INVALID_ORDER', 1;

  DECLARE @SessionId UNIQUEIDENTIFIER = (SELECT SessionId FROM dbo.SessionSplits WHERE SplitId = @SplitId);
  IF @SessionId IS NULL THROW 50005, 'SESSION_NOT_FOUND', 1;

  BEGIN TRAN;

  -- 1. Khóa phiên (tuần tự với sp_SubmitOrder / sp_SettleSession)
  DECLARE @SessionStatus VARCHAR(20) = (SELECT Status FROM dbo.Sessions WITH (UPDLOCK, ROWLOCK) WHERE SessionId = @SessionId);
  IF @SessionStatus = 'CLOSED' BEGIN ROLLBACK; THROW 50032, 'ALREADY_SETTLED', 1; END

  -- 2. Khóa phần
  DECLARE @IsCommon BIT, @SplitStatus VARCHAR(10);
  SELECT @IsCommon = IsCommon, @SplitStatus = Status FROM dbo.SessionSplits WITH (UPDLOCK, HOLDLOCK) WHERE SplitId = @SplitId;
  IF @SplitStatus = 'PAID' BEGIN ROLLBACK; THROW 50110, 'SPLIT_PAID', 1; END
  IF @IsCommon = 1 SET @IncludeCommon = 1;

  -- 3. Không còn đơn chưa tiếp nhận (BR-019)
  DECLARE @Pending NVARCHAR(2000) = (
    SELECT STRING_AGG(CAST(OrderId AS NVARCHAR(10)), ',') FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK)
    WHERE SessionId = @SessionId AND Status = 'PENDING');
  IF @Pending IS NOT NULL BEGIN ROLLBACK; THROW 50033, @Pending, 1; END

  -- 4. Dòng của lần thu này
  DECLARE @Lines TABLE (OrderItemId INT PRIMARY KEY, OrderId INT NOT NULL, Qty INT NOT NULL, UnitPrice DECIMAL(12,0) NOT NULL, ListPrice DECIMAL(12,0) NOT NULL);
  INSERT @Lines
  SELECT oi.OrderItemId, oi.OrderId, oi.Quantity, oi.UnitPrice, COALESCE(oi.ListPrice, oi.UnitPrice)
  FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId
  WHERE o.SessionId = @SessionId AND o.Status NOT IN ('CANCELLED', 'VOIDED') AND oi.ParentOrderItemId IS NULL AND oi.PaidAt IS NULL
    AND ((@IsCommon = 0 AND oi.SplitId = @SplitId) OR (@IncludeCommon = 1 AND oi.SplitId IS NULL));
  IF NOT EXISTS (SELECT 1 FROM @Lines) BEGIN ROLLBACK; THROW 50112, 'SPLIT_EMPTY', 1; END

  -- 5. Phần cuối còn mở phải gộp dòng Chung chưa thu (D-17)
  IF @IsCommon = 0 AND @IncludeCommon = 0
     AND NOT EXISTS (SELECT 1 FROM dbo.SessionSplits s WHERE s.SessionId = @SessionId AND s.SplitId <> @SplitId AND s.IsCommon = 0 AND s.Status = 'OPEN'
                       AND EXISTS (SELECT 1 FROM dbo.OrderItems x JOIN dbo.Orders xo ON xo.OrderId = x.OrderId
                                   WHERE x.SplitId = s.SplitId AND x.PaidAt IS NULL AND x.ParentOrderItemId IS NULL AND xo.Status NOT IN ('CANCELLED', 'VOIDED')))
     AND EXISTS (SELECT 1 FROM dbo.OrderItems x JOIN dbo.Orders xo ON xo.OrderId = x.OrderId
                 WHERE xo.SessionId = @SessionId AND xo.Status NOT IN ('CANCELLED', 'VOIDED') AND x.ParentOrderItemId IS NULL AND x.PaidAt IS NULL AND x.SplitId IS NULL)
  BEGIN ROLLBACK; THROW 50111, 'COMMON_REQUIRED', 1; END

  -- 6. Số tiền
  DECLARE @Sum DECIMAL(12,0), @Subtotal DECIMAL(12,0);
  SELECT @Sum = SUM(CAST(Qty AS DECIMAL(12,0)) * UnitPrice), @Subtotal = SUM(CAST(Qty AS DECIMAL(12,0)) * ListPrice) FROM @Lines;
  IF @LinesTotal IS NULL OR @LinesTotal <> @Sum BEGIN ROLLBACK; THROW 50034, 'AMOUNT_CHANGED', 1; END
  IF @OrderPromoAlloc > @Sum BEGIN ROLLBACK; THROW 50012, 'INVALID_ORDER', 1; END

  SET @AmountDue = @Sum - @OrderPromoAlloc - @MemberDiscount - @VoucherDiscount - @RewardDiscount - @ManualDiscount - @RoundingAdj;
  IF @AmountDue < 0 BEGIN ROLLBACK; THROW 50012, 'INVALID_ORDER', 1; END
  IF @ExpectedDue IS NOT NULL AND @ExpectedDue <> @AmountDue BEGIN ROLLBACK; THROW 50034, 'AMOUNT_CHANGED', 1; END
  IF @AmountReceived IS NULL OR @AmountReceived < @AmountDue BEGIN ROLLBACK; THROW 50020, 'INSUFFICIENT_AMOUNT', 1; END

  IF @ShiftId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Shifts WITH (HOLDLOCK) WHERE ShiftId = @ShiftId AND ClosedAt IS NULL)
  BEGIN ROLLBACK; THROW 50070, 'NO_OPEN_SHIFT', 1; END

  -- 7. Ghi lượt thu (SplitId = phần được thu; phần Chung thu riêng thì SplitId = dòng Chung)
  DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();
  INSERT dbo.Payments (SessionId, SplitId, Method, AmountDue, AmountReceived, ReceivedBy, PaidAt, MemberId, MemberPercent, SubtotalAmount, PromoDiscount,
                       MemberDiscount, ManualDiscount, ManualReason, ApprovedBy, RoundingAdj, ShiftId, VoucherDiscount, RewardDiscount, VoucherId)
  VALUES (@SessionId, @SplitId, 'CASH', @AmountDue, @AmountReceived, @UserId, @Now, @MemberId, @MemberPercent, @Subtotal,
          (@Subtotal - @Sum) + @OrderPromoAlloc, @MemberDiscount, @ManualDiscount, NULLIF(LTRIM(RTRIM(@ManualReason)), ''), @ApprovedBy, @RoundingAdj, @ShiftId,
          @VoucherDiscount, @RewardDiscount,
          TRY_CAST(JSON_VALUE(@LoyaltyJson, '$.voucherId') AS INT));
  SET @PaymentId = SCOPE_IDENTITY();

  UPDATE oi SET PaidAt = @Now, PaymentId = @PaymentId
  FROM dbo.OrderItems oi
  WHERE oi.OrderItemId IN (SELECT OrderItemId FROM @Lines) OR oi.ParentOrderItemId IN (SELECT OrderItemId FROM @Lines);

  UPDATE dbo.SessionSplits SET Status = 'PAID', PaymentId = @PaymentId, MemberId = COALESCE(@MemberId, MemberId)
  WHERE SplitId = @SplitId AND IsCommon = 0;

  -- Đơn đã thu đủ mọi dòng → PAID
  UPDATE o SET PaymentStatus = 'PAID', PaymentMethod = 'CASH', PaidAt = @Now
  FROM dbo.Orders o
  WHERE o.SessionId = @SessionId AND o.Status NOT IN ('CANCELLED', 'VOIDED') AND o.PaymentStatus = 'UNPAID'
    AND NOT EXISTS (SELECT 1 FROM dbo.OrderItems x WHERE x.OrderId = o.OrderId AND x.ParentOrderItemId IS NULL AND x.PaidAt IS NULL);

  -- 8. Thu hết → đóng phiên
  IF NOT EXISTS (SELECT 1 FROM dbo.Orders o WHERE o.SessionId = @SessionId AND o.Status NOT IN ('CANCELLED', 'VOIDED') AND o.PaymentStatus = 'UNPAID')
  BEGIN
    UPDATE dbo.Sessions SET Status = 'CLOSED', ClosedAt = @Now, ClosedBy = @UserId WHERE SessionId = @SessionId;
    UPDATE dbo.SessionSplits SET Status = 'PAID' WHERE SessionId = @SessionId;
    SET @SessionClosed = 1;
  END

  IF @MemberId IS NOT NULL
    EXEC dbo.sp_ApplyMemberPayment @MemberId = @MemberId, @PaymentId = @PaymentId, @Spent = @AmountDue, @Discount = @MemberDiscount;
  IF @MemberId IS NOT NULL OR @LoyaltyJson IS NOT NULL
    EXEC dbo.sp_ApplyLoyalty @PaymentId = @PaymentId, @MemberId = @MemberId, @LoyaltyJson = @LoyaltyJson;

  COMMIT;
END
