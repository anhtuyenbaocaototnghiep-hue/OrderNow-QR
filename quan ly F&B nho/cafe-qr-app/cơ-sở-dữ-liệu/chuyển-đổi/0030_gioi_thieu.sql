-- 0030_gioi_thieu — FEATURE-038 Giới thiệu bạn + voucher (ADR-006 D-28).
-- Người mới (có người giới thiệu) thanh toán lần đầu ≥ 30.000đ → cả hai nhận voucher 10 %, hạn 30 ngày (tạo trong cùng transaction thu tiền).
-- Voucher dùng một lần, một voucher / lượt thu; áp ở thu tiền qua pricing (sau chiết khấu hội viên, trước đổi thưởng / giảm tay).
IF COL_LENGTH('dbo.Members', 'ReferredByMemberId') IS NULL
  ALTER TABLE dbo.Members ADD
    ReferredByMemberId INT NULL CONSTRAINT FK_Members_ReferredBy REFERENCES dbo.Members(MemberId),
    ReferralRewardedAt DATETIME2(0) NULL;
GO

IF OBJECT_ID('dbo.Vouchers') IS NULL
BEGIN
  CREATE TABLE dbo.Vouchers (
    VoucherId          INT IDENTITY CONSTRAINT PK_Vouchers PRIMARY KEY,
    Code               VARCHAR(20) NOT NULL,
    MemberId           INT NULL CONSTRAINT FK_Vouchers_Member REFERENCES dbo.Members(MemberId),      -- NULL = ai cũng dùng được (MANUAL)
    PromotionId        INT NULL CONSTRAINT FK_Vouchers_Promotion REFERENCES dbo.Promotions(PromotionId),
    DiscountPercent    DECIMAL(5,2) NULL CONSTRAINT CK_Vouchers_Percent CHECK (DiscountPercent > 0 AND DiscountPercent <= 100),
    DiscountAmount     DECIMAL(12,0) NULL,
    MaxDiscount        DECIMAL(12,0) NULL,                                   -- trần số tiền giảm của voucher %
    MinOrderAmount     DECIMAL(12,0) NOT NULL CONSTRAINT DF_Vouchers_Min DEFAULT 0,
    StackWithMember    BIT NOT NULL CONSTRAINT DF_Vouchers_Stack DEFAULT 1,  -- 0 → dùng voucher thì không áp % hạng
    ExpiresAt          DATETIME2(0) NOT NULL,
    UsedAt             DATETIME2(0) NULL,
    UsedPaymentId      INT NULL CONSTRAINT FK_Vouchers_UsedPayment REFERENCES dbo.Payments(PaymentId),
    Source             VARCHAR(10) NOT NULL CONSTRAINT CK_Vouchers_Source CHECK (Source IN ('REFERRAL', 'CAMPAIGN', 'MANUAL')),
    CampaignId         INT NULL,                                             -- FK thêm ở 0031
    IssuedForPaymentId INT NULL CONSTRAINT FK_Vouchers_IssuedPayment REFERENCES dbo.Payments(PaymentId),   -- lượt thu sinh ra voucher (giới thiệu)
    CreatedBy          INT NULL CONSTRAINT FK_Vouchers_User REFERENCES dbo.Users(UserId),
    CreatedAt          DATETIME2(0) NOT NULL CONSTRAINT DF_Vouchers_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Vouchers_Value CHECK ((DiscountPercent IS NOT NULL AND DiscountAmount IS NULL) OR (DiscountPercent IS NULL AND DiscountAmount > 0)),
    CONSTRAINT CK_Vouchers_Used CHECK ((UsedAt IS NULL AND UsedPaymentId IS NULL) OR (UsedAt IS NOT NULL AND UsedPaymentId IS NOT NULL))
  );
  CREATE UNIQUE INDEX UX_Vouchers_Code ON dbo.Vouchers (Code);
  CREATE INDEX IX_Vouchers_Member ON dbo.Vouchers (MemberId, ExpiresAt);
  CREATE UNIQUE INDEX UX_Vouchers_UsedPayment ON dbo.Vouchers (UsedPaymentId) WHERE UsedPaymentId IS NOT NULL;   -- một voucher / lượt thu

  ALTER TABLE dbo.Payments ADD
    VoucherId       INT NULL CONSTRAINT FK_Payments_Voucher REFERENCES dbo.Vouchers(VoucherId),
    VoucherDiscount DECIMAL(12,0) NOT NULL CONSTRAINT DF_Payments_Voucher DEFAULT 0;
END
GO

IF OBJECT_ID('dbo.CK_Payments_Voucher') IS NULL
  ALTER TABLE dbo.Payments ADD CONSTRAINT CK_Payments_Voucher CHECK (VoucherDiscount >= 0 AND (VoucherDiscount = 0 OR VoucherId IS NOT NULL));
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Members_ReferredBy')
  CREATE INDEX IX_Members_ReferredBy ON dbo.Members (ReferredByMemberId, CreatedAt) WHERE ReferredByMemberId IS NOT NULL;

INSERT dbo.Settings (SettingKey, SettingValue)
SELECT k, v FROM (VALUES (N'referral.min_first_payment', N'30000'), (N'referral.voucher_percent', N'10'), (N'referral.voucher_days', N'30'),
                         (N'referral.monthly_limit', N'5')) s(k, v)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Settings x WHERE x.SettingKey = s.k);
GO
