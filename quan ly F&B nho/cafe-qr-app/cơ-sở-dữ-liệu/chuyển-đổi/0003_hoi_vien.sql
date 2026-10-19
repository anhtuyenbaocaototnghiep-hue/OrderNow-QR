-- 0003_hoi_vien — FEATURE-014 Hội viên SĐT + họ tên (ADR-005 D-5, D-6, D-16) và bảng cấu hình Settings dùng chung.
-- Thanh toán lưu đủ breakdown: AmountDue = SubtotalAmount − PromoDiscount − MemberDiscount − ManualDiscount − RoundingAdj.

IF OBJECT_ID('dbo.Settings') IS NULL
  CREATE TABLE dbo.Settings (
    SettingKey   NVARCHAR(50)  NOT NULL CONSTRAINT PK_Settings PRIMARY KEY,
    SettingValue NVARCHAR(200) NOT NULL,
    UpdatedAt    DATETIME2(0)  NOT NULL CONSTRAINT DF_Settings_UpdatedAt DEFAULT SYSUTCDATETIME()
  );

CREATE TABLE dbo.MemberTiers (
  TierCode        VARCHAR(20)   NOT NULL CONSTRAINT PK_MemberTiers PRIMARY KEY,
  Name            NVARCHAR(50)  NOT NULL,
  MinSpent        DECIMAL(12,0) NOT NULL CONSTRAINT CK_MemberTiers_MinSpent CHECK (MinSpent >= 0),
  DiscountPercent DECIMAL(5,2)  NOT NULL CONSTRAINT CK_MemberTiers_Discount CHECK (DiscountPercent BETWEEN 0 AND 100),
  SortOrder       INT           NOT NULL
);

CREATE TABLE dbo.Members (
  MemberId               INT IDENTITY CONSTRAINT PK_Members PRIMARY KEY,
  Phone                  VARCHAR(80)   NOT NULL,          -- +84xxxxxxxxx; ẩn danh → 'anon:' + SHA-256
  FullName               NVARCHAR(100) NOT NULL,
  TierCode               VARCHAR(20)   NOT NULL CONSTRAINT FK_Members_Tiers REFERENCES dbo.MemberTiers(TierCode),
  TotalSpent             DECIMAL(12,0) NOT NULL CONSTRAINT DF_Members_TotalSpent DEFAULT 0 CONSTRAINT CK_Members_TotalSpent CHECK (TotalSpent >= 0),
  VisitCount             INT           NOT NULL CONSTRAINT DF_Members_VisitCount DEFAULT 0,
  Points                 INT           NOT NULL CONSTRAINT DF_Members_Points DEFAULT 0,
  FirstOrderDiscountUsed BIT           NOT NULL CONSTRAINT DF_Members_FirstOrder DEFAULT 0,
  BirthDate              DATE          NULL,
  Note                   NVARCHAR(200) NULL,
  ConsentAt              DATETIME2(0)  NOT NULL,          -- D-16: đồng ý cho quán lưu SĐT + tên
  IsActive               BIT           NOT NULL CONSTRAINT DF_Members_IsActive DEFAULT 1,
  AnonymizedAt           DATETIME2(0)  NULL,
  CreatedAt              DATETIME2(0)  NOT NULL CONSTRAINT DF_Members_CreatedAt DEFAULT SYSUTCDATETIME(),
  LastVisitAt            DATETIME2(0)  NULL
);
CREATE UNIQUE INDEX UX_Members_Phone ON dbo.Members (Phone);
CREATE INDEX IX_Members_CreatedAt ON dbo.Members (CreatedAt);   -- báo cáo hội viên mới theo ngày

ALTER TABLE dbo.Sessions ADD MemberId INT NULL CONSTRAINT FK_Sessions_Members REFERENCES dbo.Members(MemberId);
ALTER TABLE dbo.Orders   ADD MemberId INT NULL CONSTRAINT FK_Orders_Members REFERENCES dbo.Members(MemberId);   -- mang đi
ALTER TABLE dbo.Payments ADD
  MemberId        INT NULL CONSTRAINT FK_Payments_Members REFERENCES dbo.Members(MemberId),
  MemberPercent   DECIMAL(5,2)  NULL,
  SubtotalAmount  DECIMAL(12,0) NULL,                                                      -- NULL = thanh toán trước 0003
  PromoDiscount   DECIMAL(12,0) NOT NULL CONSTRAINT DF_Payments_Promo DEFAULT 0,
  MemberDiscount  DECIMAL(12,0) NOT NULL CONSTRAINT DF_Payments_Member DEFAULT 0,
  ManualDiscount  DECIMAL(12,0) NOT NULL CONSTRAINT DF_Payments_Manual DEFAULT 0,
  RoundingAdj     DECIMAL(12,0) NOT NULL CONSTRAINT DF_Payments_Rounding DEFAULT 0;
GO

ALTER TABLE dbo.Payments ADD CONSTRAINT CK_Payments_Discounts
  CHECK (PromoDiscount >= 0 AND MemberDiscount >= 0 AND ManualDiscount >= 0 AND RoundingAdj >= 0 AND AmountDue >= 0
         AND (MemberDiscount = 0 OR MemberId IS NOT NULL));
CREATE INDEX IX_Payments_Member ON dbo.Payments (MemberId) WHERE MemberId IS NOT NULL;

CREATE TABLE dbo.MemberTransactions (
  TxnId          BIGINT IDENTITY CONSTRAINT PK_MemberTransactions PRIMARY KEY,
  MemberId       INT NOT NULL CONSTRAINT FK_MemberTxn_Members REFERENCES dbo.Members(MemberId),
  PaymentId      INT NOT NULL CONSTRAINT FK_MemberTxn_Payments REFERENCES dbo.Payments(PaymentId),
  SpentAmount    DECIMAL(12,0) NOT NULL,            -- âm khi hoàn tiền (F-019)
  DiscountAmount DECIMAL(12,0) NOT NULL,
  TierBefore     VARCHAR(20) NOT NULL,
  TierAfter      VARCHAR(20) NOT NULL,
  CreatedAt      DATETIME2(0) NOT NULL CONSTRAINT DF_MemberTxn_CreatedAt DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_MemberTxn_Member ON dbo.MemberTransactions (MemberId, CreatedAt);

INSERT dbo.MemberTiers (TierCode, Name, MinSpent, DiscountPercent, SortOrder) VALUES
  ('MEMBER', N'Thành viên', 0, 3.00, 1),
  ('LOYAL', N'Thân thiết', 1000000, 5.00, 2),
  ('VIP', N'VIP', 3000000, 8.00, 3);

INSERT dbo.Settings (SettingKey, SettingValue) VALUES
  (N'member.first_order_percent', N'10'),
  (N'pricing.round_down_to', N'500');
GO
