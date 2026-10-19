-- Tích điểm / tem / voucher / giới thiệu bạn (FEATURE-039, FEATURE-038, ADR-006 D-27, D-28).
-- sp_ApplyLoyalty: gọi TRONG transaction của sp_SettleSession / sp_SettleSplit / sp_SubmitOrder ngay sau khi ghi Payments
--   (+ sp_ApplyMemberPayment) → dùng voucher, trừ điểm / lượt quà, tích điểm, tích tem, tặng voucher giới thiệu cùng commit với lượt thu.
-- @LoyaltyJson (service tính bằng pricing): { "voucherId": 5, "reward": { "type": "POINTS"|"STAMP", "rewardId": 2, "programId": 1,
--   "menuItemId": 7 } } — menuItemId = món được tặng (không tích tem cho món đó).
-- Lỗi: 50170 VOUCHER_UNAVAILABLE, 50171 REWARD_UNAVAILABLE, 50172 POINTS_INSUFFICIENT, 50173 STAMP_REWARD_UNAVAILABLE.
CREATE OR ALTER PROCEDURE dbo.sp_ApplyLoyalty
  @PaymentId   INT,
  @MemberId    INT = NULL,
  @LoyaltyJson NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();
  DECLARE @AmountDue DECIMAL(12,0) = (SELECT AmountDue FROM dbo.Payments WHERE PaymentId = @PaymentId);
  DECLARE @VoucherId INT = TRY_CAST(JSON_VALUE(@LoyaltyJson, '$.voucherId') AS INT);
  DECLARE @RewardType VARCHAR(10) = JSON_VALUE(@LoyaltyJson, '$.reward.type');
  DECLARE @RewardId INT = TRY_CAST(JSON_VALUE(@LoyaltyJson, '$.reward.rewardId') AS INT);
  DECLARE @ProgramId INT = TRY_CAST(JSON_VALUE(@LoyaltyJson, '$.reward.programId') AS INT);
  DECLARE @FreeItemId INT = TRY_CAST(JSON_VALUE(@LoyaltyJson, '$.reward.menuItemId') AS INT);
  DECLARE @RewardDiscount DECIMAL(12,0) = (SELECT RewardDiscount FROM dbo.Payments WHERE PaymentId = @PaymentId);

  -- 1. Voucher: một lần, còn hạn, đúng chủ (hai quầy dùng cùng mã → một bên thắng)
  IF @VoucherId IS NOT NULL
  BEGIN
    UPDATE dbo.Vouchers SET UsedAt = @Now, UsedPaymentId = @PaymentId
    WHERE VoucherId = @VoucherId AND UsedAt IS NULL AND ExpiresAt > @Now AND (MemberId IS NULL OR MemberId = @MemberId);
    IF @@ROWCOUNT = 0 THROW 50170, 'VOUCHER_UNAVAILABLE', 1;
    UPDATE dbo.Payments SET VoucherId = @VoucherId WHERE PaymentId = @PaymentId;
  END

  IF @MemberId IS NULL RETURN;
  -- Khóa hội viên (sp_ApplyMemberPayment đã giữ U-lock; gọi lẻ vẫn an toàn)
  DECLARE @Points INT = (SELECT Points FROM dbo.Members WITH (UPDLOCK, HOLDLOCK) WHERE MemberId = @MemberId);

  -- 2. Đổi thưởng (một thưởng / lượt thu)
  IF @RewardType = 'POINTS'
  BEGIN
    DECLARE @Cost INT, @RewardName NVARCHAR(100);
    SELECT @Cost = PointsCost, @RewardName = Name FROM dbo.RewardCatalog WHERE RewardId = @RewardId AND IsActive = 1;
    IF @Cost IS NULL THROW 50171, 'REWARD_UNAVAILABLE', 1;
    IF @Points < @Cost THROW 50172, 'POINTS_INSUFFICIENT', 1;
    UPDATE dbo.Members SET Points = Points - @Cost WHERE MemberId = @MemberId;
    INSERT dbo.PointTransactions (MemberId, PaymentId, Delta, Type, Note) VALUES (@MemberId, @PaymentId, -@Cost, 'REDEEM', LEFT(N'Đổi: ' + @RewardName, 200));
    INSERT dbo.RewardRedemptions (MemberId, RewardId, PaymentId, PointsSpent, DiscountAmount) VALUES (@MemberId, @RewardId, @PaymentId, @Cost, @RewardDiscount);
    UPDATE dbo.Payments SET RewardId = @RewardId WHERE PaymentId = @PaymentId;
  END
  ELSE IF @RewardType = 'STAMP'
  BEGIN
    UPDATE dbo.StampCards SET RewardsAvailable = RewardsAvailable - 1, UpdatedAt = @Now
    WHERE MemberId = @MemberId AND ProgramId = @ProgramId AND RewardsAvailable > 0;
    IF @@ROWCOUNT = 0 THROW 50173, 'STAMP_REWARD_UNAVAILABLE', 1;
    INSERT dbo.StampEvents (MemberId, ProgramId, PaymentId, Type, Rewards, Note) VALUES (@MemberId, @ProgramId, @PaymentId, 'REDEEM', -1, N'Dùng lượt món miễn phí');
    UPDATE dbo.Payments SET StampProgramId = @ProgramId WHERE PaymentId = @PaymentId;
  END

  -- 3. Tích điểm (D-27): 1 điểm / loyalty.point_value đồng thực trả (đã trừ mọi khoản giảm, kể cả đổi thưởng)
  DECLARE @Rate INT = ISNULL(TRY_CAST((SELECT SettingValue FROM dbo.Settings WHERE SettingKey = N'loyalty.point_value') AS INT), 10000);
  DECLARE @Earn INT = CASE WHEN @Rate > 0 THEN CAST(FLOOR(@AmountDue / @Rate) AS INT) ELSE 0 END;
  IF @Earn > 0
  BEGIN
    UPDATE dbo.Members SET Points = Points + @Earn WHERE MemberId = @MemberId;
    INSERT dbo.PointTransactions (MemberId, PaymentId, Delta, Type) VALUES (@MemberId, @PaymentId, @Earn, 'EARN');
  END

  -- 4. Tích tem: Σ số lượng món (dòng khách chọn) của lượt thu thuộc chương trình đang chạy, trừ món được tặng
  DECLARE @S TABLE (ProgramId INT PRIMARY KEY, Qty INT, Required INT);
  INSERT @S
  SELECT sp.ProgramId,
         SUM(oi.Quantity) - CASE WHEN @FreeItemId IS NOT NULL
                                  AND EXISTS (SELECT 1 FROM dbo.StampProgramItems x WHERE x.ProgramId = sp.ProgramId AND x.MenuItemId = @FreeItemId)
                                 THEN 1 ELSE 0 END,
         sp.RequiredStamps
  FROM dbo.OrderItems oi
  JOIN dbo.Orders o ON o.OrderId = oi.OrderId AND o.Status NOT IN ('CANCELLED', 'VOIDED')
  JOIN dbo.StampProgramItems spi ON spi.MenuItemId = oi.MenuItemId
  JOIN dbo.StampPrograms sp ON sp.ProgramId = spi.ProgramId AND sp.IsActive = 1
  WHERE oi.PaymentId = @PaymentId AND oi.ParentOrderItemId IS NULL
  GROUP BY sp.ProgramId, sp.RequiredStamps;
  DELETE @S WHERE Qty <= 0;

  IF EXISTS (SELECT 1 FROM @S)
  BEGIN
    INSERT dbo.StampCards (MemberId, ProgramId)
    SELECT @MemberId, s.ProgramId FROM @S s
    WHERE NOT EXISTS (SELECT 1 FROM dbo.StampCards c WITH (UPDLOCK, HOLDLOCK) WHERE c.MemberId = @MemberId AND c.ProgramId = s.ProgramId);

    DECLARE @Done TABLE (ProgramId INT, Cards INT);
    UPDATE c SET Stamps = (c.Stamps + s.Qty) % s.Required,
                 CompletedCards = c.CompletedCards + (c.Stamps + s.Qty) / s.Required,
                 RewardsAvailable = c.RewardsAvailable + (c.Stamps + s.Qty) / s.Required,
                 UpdatedAt = @Now
    OUTPUT inserted.ProgramId, inserted.CompletedCards - deleted.CompletedCards INTO @Done
    FROM dbo.StampCards c JOIN @S s ON s.ProgramId = c.ProgramId
    WHERE c.MemberId = @MemberId;

    INSERT dbo.StampEvents (MemberId, ProgramId, PaymentId, Type, Stamps, Rewards)
    SELECT @MemberId, s.ProgramId, @PaymentId, 'EARN', s.Qty, d.Cards FROM @S s JOIN @Done d ON d.ProgramId = s.ProgramId;
  END
  UPDATE dbo.Payments SET PointsEarned = @Earn, StampsEarned = ISNULL((SELECT SUM(Qty) FROM @S), 0) WHERE PaymentId = @PaymentId;

  -- 5. Giới thiệu bạn (D-28): lần thu ĐẦU TIÊN của người mới (VisitCount = 1 sau sp_ApplyMemberPayment) ≥ ngưỡng → 2 voucher
  DECLARE @Referrer INT, @Visits INT;
  SELECT @Referrer = ReferredByMemberId, @Visits = VisitCount FROM dbo.Members
  WHERE MemberId = @MemberId AND ReferralRewardedAt IS NULL;
  DECLARE @MinFirst DECIMAL(12,0) = ISNULL(TRY_CAST((SELECT SettingValue FROM dbo.Settings WHERE SettingKey = N'referral.min_first_payment') AS DECIMAL(12,0)), 30000);
  IF @Referrer IS NOT NULL AND @Visits = 1 AND @AmountDue >= @MinFirst
  BEGIN
    DECLARE @Pct DECIMAL(5,2) = ISNULL(TRY_CAST((SELECT SettingValue FROM dbo.Settings WHERE SettingKey = N'referral.voucher_percent') AS DECIMAL(5,2)), 10);
    DECLARE @Days INT = ISNULL(TRY_CAST((SELECT SettingValue FROM dbo.Settings WHERE SettingKey = N'referral.voucher_days') AS INT), 30);
    UPDATE dbo.Members SET ReferralRewardedAt = @Now WHERE MemberId = @MemberId;
    INSERT dbo.Vouchers (Code, MemberId, DiscountPercent, ExpiresAt, Source, IssuedForPaymentId)
    SELECT 'GT' + UPPER(LEFT(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''), 8)), m.MemberId, @Pct, DATEADD(DAY, @Days, @Now), 'REFERRAL', @PaymentId
    FROM dbo.Members m
    WHERE m.MemberId IN (@MemberId, @Referrer) AND m.IsActive = 1 AND m.AnonymizedAt IS NULL;
  END
END
GO

-- Hoàn tiền (gọi TRONG transaction của sp_RefundPayment, sau khi ghi Refunds):
--   điểm: giữ lại điểm tương ứng số còn thực trả, trừ phần đã tích dư (không làm điểm âm);
--   tem: trừ tem của các dòng thuộc đơn bị hủy trong lần hoàn này (tối đa số tem lượt thu đã tích);
--   hoàn toàn bộ lượt thu → trả lại điểm đã đổi thưởng / lượt món miễn phí đã dùng (một lần).
CREATE OR ALTER PROCEDURE dbo.sp_ReverseLoyalty
  @PaymentId INT,
  @RefundId  INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  DECLARE @MemberId INT, @Due DECIMAL(12,0), @Earned INT, @StampProgram INT;
  SELECT @MemberId = MemberId, @Due = AmountDue, @Earned = ISNULL(PointsEarned, 0), @StampProgram = StampProgramId
  FROM dbo.Payments WHERE PaymentId = @PaymentId;
  IF @MemberId IS NULL RETURN;

  DECLARE @Points INT = (SELECT Points FROM dbo.Members WITH (UPDLOCK, HOLDLOCK) WHERE MemberId = @MemberId);
  DECLARE @Refunded DECIMAL(12,0) = (SELECT SUM(Amount) FROM dbo.Refunds WHERE PaymentId = @PaymentId);
  DECLARE @Rate INT = ISNULL(TRY_CAST((SELECT SettingValue FROM dbo.Settings WHERE SettingKey = N'loyalty.point_value') AS INT), 10000);
  DECLARE @Note NVARCHAR(200) = N'Hoàn tiền lượt thu #' + CAST(@PaymentId AS NVARCHAR(10));

  -- Điểm tích dư
  DECLARE @Keep INT = CASE WHEN @Rate > 0 AND @Due > @Refunded THEN CAST(FLOOR((@Due - @Refunded) / @Rate) AS INT) ELSE 0 END;
  DECLARE @Reversed INT = ISNULL((SELECT -SUM(Delta) FROM dbo.PointTransactions WHERE PaymentId = @PaymentId AND Type = 'REFUND' AND Delta < 0), 0);
  DECLARE @Back INT = @Earned - @Keep - @Reversed;
  IF @Back > @Points SET @Back = @Points;
  IF @Back > 0
  BEGIN
    UPDATE dbo.Members SET Points = Points - @Back WHERE MemberId = @MemberId;
    INSERT dbo.PointTransactions (MemberId, PaymentId, Delta, Type, Note) VALUES (@MemberId, @PaymentId, -@Back, 'REFUND', @Note);
  END

  -- Hoàn toàn bộ → trả điểm đã đổi / lượt món miễn phí
  IF @Refunded >= @Due
  BEGIN
    DECLARE @Spent INT, @RedId INT;
    SELECT @RedId = RedId, @Spent = PointsSpent FROM dbo.RewardRedemptions WHERE PaymentId = @PaymentId AND ReturnedAt IS NULL;
    IF @RedId IS NOT NULL
    BEGIN
      UPDATE dbo.RewardRedemptions SET ReturnedAt = SYSUTCDATETIME() WHERE RedId = @RedId;
      UPDATE dbo.Members SET Points = Points + @Spent WHERE MemberId = @MemberId;
      INSERT dbo.PointTransactions (MemberId, PaymentId, Delta, Type, Note) VALUES (@MemberId, @PaymentId, @Spent, 'REFUND', N'Trả điểm đổi thưởng — ' + @Note);
    END
    IF @StampProgram IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.StampEvents WHERE PaymentId = @PaymentId AND Type = 'REFUND' AND Rewards > 0)
    BEGIN
      UPDATE dbo.StampCards SET RewardsAvailable = RewardsAvailable + 1, UpdatedAt = SYSUTCDATETIME()
      WHERE MemberId = @MemberId AND ProgramId = @StampProgram;
      INSERT dbo.StampEvents (MemberId, ProgramId, PaymentId, Type, Rewards, Note) VALUES (@MemberId, @StampProgram, @PaymentId, 'REFUND', 1, N'Trả lượt món miễn phí — ' + @Note);
    END
  END

  -- Tem của đơn bị hủy trong lần hoàn này
  DECLARE @Voided NVARCHAR(400) = (SELECT VoidedOrderIds FROM dbo.Refunds WHERE RefundId = @RefundId);
  IF @Voided IS NOT NULL
  BEGIN
    DECLARE @T TABLE (ProgramId INT PRIMARY KEY, Qty INT);
    INSERT @T
    SELECT spi.ProgramId, SUM(oi.Quantity)
    FROM dbo.OrderItems oi
    JOIN STRING_SPLIT(@Voided, ',') v ON TRY_CAST(v.value AS INT) = oi.OrderId
    JOIN dbo.StampProgramItems spi ON spi.MenuItemId = oi.MenuItemId
    WHERE oi.PaymentId = @PaymentId AND oi.ParentOrderItemId IS NULL
    GROUP BY spi.ProgramId;
    -- không trừ quá số tem lượt thu đã tích (trừ phần đã trừ ở lần hoàn trước)
    UPDATE t SET Qty = CASE WHEN t.Qty > e.Net THEN e.Net ELSE t.Qty END
    FROM @T t
    CROSS APPLY (SELECT ISNULL(SUM(Stamps), 0) AS Net FROM dbo.StampEvents x
                 WHERE x.PaymentId = @PaymentId AND x.ProgramId = t.ProgramId AND x.Type IN ('EARN', 'REFUND')) e;
    DELETE @T WHERE Qty <= 0;
    IF EXISTS (SELECT 1 FROM @T)
    BEGIN
      UPDATE c SET Stamps = CASE WHEN c.Stamps > t.Qty THEN c.Stamps - t.Qty ELSE 0 END, UpdatedAt = SYSUTCDATETIME()
      FROM dbo.StampCards c WITH (UPDLOCK, HOLDLOCK) JOIN @T t ON t.ProgramId = c.ProgramId
      WHERE c.MemberId = @MemberId;
      INSERT dbo.StampEvents (MemberId, ProgramId, PaymentId, Type, Stamps, Note)
      SELECT @MemberId, t.ProgramId, @PaymentId, 'REFUND', -t.Qty, @Note FROM @T t;
    END
  END
END
GO

-- Quản lý điều chỉnh điểm có lý do (FEATURE-039): không để điểm âm. Lỗi: 50080 MEMBER_NOT_FOUND, 50172 POINTS_INSUFFICIENT.
CREATE OR ALTER PROCEDURE dbo.sp_AdjustPoints
  @MemberId INT,
  @Delta    INT,
  @Reason   NVARCHAR(200),
  @UserId   INT,
  @Balance  INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF @Delta IS NULL OR @Delta = 0 OR NULLIF(LTRIM(RTRIM(@Reason)), '') IS NULL THROW 50012, 'INVALID_ORDER', 1;
  BEGIN TRAN;
  DECLARE @Points INT = (SELECT Points FROM dbo.Members WITH (UPDLOCK, HOLDLOCK) WHERE MemberId = @MemberId AND AnonymizedAt IS NULL);
  IF @Points IS NULL BEGIN ROLLBACK; THROW 50080, 'MEMBER_NOT_FOUND', 1; END
  IF @Points + @Delta < 0 BEGIN ROLLBACK; THROW 50172, 'POINTS_INSUFFICIENT', 1; END
  UPDATE dbo.Members SET Points = Points + @Delta WHERE MemberId = @MemberId;
  INSERT dbo.PointTransactions (MemberId, Delta, Type, Note, CreatedBy) VALUES (@MemberId, @Delta, 'ADJUST', LTRIM(RTRIM(@Reason)), @UserId);
  SET @Balance = @Points + @Delta;
  COMMIT;
END
