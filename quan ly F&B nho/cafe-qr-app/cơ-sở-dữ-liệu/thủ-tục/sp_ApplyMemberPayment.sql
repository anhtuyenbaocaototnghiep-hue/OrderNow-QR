-- Cập nhật hội viên sau một lần thu tiền (FEATURE-014, ADR-005 D-5). Gọi TRONG transaction của sp_SettleSession / sp_SubmitOrder.
-- Cộng TotalSpent (số thực trả), VisitCount, đánh dấu đã dùng ưu đãi đơn đầu; tự nâng hạng (không tự hạ).
-- Điểm / tem / voucher: sp_ApplyLoyalty (F-039 — từ 0029 điểm có sổ PointTransactions, 1 điểm / 10.000đ).
-- Lỗi: 50080 MEMBER_NOT_FOUND.
CREATE OR ALTER PROCEDURE dbo.sp_ApplyMemberPayment
  @MemberId  INT,
  @PaymentId INT,
  @Spent     DECIMAL(12,0),
  @Discount  DECIMAL(12,0)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;

  DECLARE @TierBefore VARCHAR(20), @Total DECIMAL(12,0);
  SELECT @TierBefore = TierCode, @Total = TotalSpent + @Spent
  FROM dbo.Members WITH (UPDLOCK, HOLDLOCK)
  WHERE MemberId = @MemberId AND IsActive = 1;
  IF @TierBefore IS NULL THROW 50080, 'MEMBER_NOT_FOUND', 1;

  DECLARE @TierAfter VARCHAR(20) = (
    SELECT TOP 1 t.TierCode FROM dbo.MemberTiers t
    WHERE t.MinSpent <= @Total
      AND t.MinSpent >= (SELECT MinSpent FROM dbo.MemberTiers WHERE TierCode = @TierBefore)
    ORDER BY t.MinSpent DESC, t.SortOrder DESC);
  SET @TierAfter = COALESCE(@TierAfter, @TierBefore);

  UPDATE dbo.Members
     SET TotalSpent = @Total, VisitCount = VisitCount + 1,
         FirstOrderDiscountUsed = 1, LastVisitAt = SYSUTCDATETIME(), TierCode = @TierAfter
   WHERE MemberId = @MemberId;

  INSERT dbo.MemberTransactions (MemberId, PaymentId, SpentAmount, DiscountAmount, TierBefore, TierAfter)
  VALUES (@MemberId, @PaymentId, @Spent, @Discount, @TierBefore, @TierAfter);
END
