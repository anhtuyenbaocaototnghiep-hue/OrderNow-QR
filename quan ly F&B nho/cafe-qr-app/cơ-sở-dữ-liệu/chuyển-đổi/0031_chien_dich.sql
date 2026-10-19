-- 0031_chien_dich — FEATURE-037 Chiến dịch theo phân khúc (ADR-006 D-29).
-- Kênh EXPORT (CSV) mặc định, ZALO_OA khi có ZALO_OA_TOKEN; tôn trọng OptOut; tối đa 1 tin / 7 ngày / hội viên (campaign.min_days_between).
-- Mỗi người nhận một voucher riêng (Source CAMPAIGN); CampaignDeliveries ghi kết quả từng người (bỏ qua có lý do).
IF COL_LENGTH('dbo.Members', 'OptOut') IS NULL
  ALTER TABLE dbo.Members ADD
    OptOut          BIT NOT NULL CONSTRAINT DF_Members_OptOut DEFAULT 0,
    LastContactedAt DATETIME2(0) NULL;
GO

IF OBJECT_ID('dbo.Segments') IS NULL
BEGIN
  CREATE TABLE dbo.Segments (
    SegmentId INT IDENTITY CONSTRAINT PK_Segments PRIMARY KEY,
    Name      NVARCHAR(100) NOT NULL,
    RuleJson  NVARCHAR(1000) NOT NULL,      -- AND các điều kiện: tierIn, lastVisitDaysGte/Lte, visitCountGte/Lte, totalSpentGte, birthdayMonth, hasPointsGte
    CreatedBy INT NULL CONSTRAINT FK_Segments_User REFERENCES dbo.Users(UserId),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Segments_At DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NULL,
    CONSTRAINT CK_Segments_Json CHECK (ISJSON(RuleJson) = 1)
  );

  CREATE TABLE dbo.Campaigns (
    CampaignId      INT IDENTITY CONSTRAINT PK_Campaigns PRIMARY KEY,
    Name            NVARCHAR(100) NOT NULL,
    SegmentId       INT NOT NULL CONSTRAINT FK_Campaigns_Segment REFERENCES dbo.Segments(SegmentId),
    Channel         VARCHAR(10) NOT NULL CONSTRAINT CK_Campaigns_Channel CHECK (Channel IN ('EXPORT', 'ZALO_OA', 'SMS')),
    MessageTemplate NVARCHAR(500) NOT NULL,  -- {name} {voucher} {expires}
    VoucherPercent  DECIMAL(5,2) NULL CONSTRAINT CK_Campaigns_Percent CHECK (VoucherPercent > 0 AND VoucherPercent <= 100),
    VoucherDays     INT NULL CONSTRAINT CK_Campaigns_Days CHECK (VoucherDays BETWEEN 1 AND 365),
    VoucherMinOrder DECIMAL(12,0) NOT NULL CONSTRAINT DF_Campaigns_Min DEFAULT 0,
    ScheduledAt     DATETIME2(0) NULL,
    Status          VARCHAR(10) NOT NULL CONSTRAINT DF_Campaigns_Status DEFAULT 'DRAFT'
                      CONSTRAINT CK_Campaigns_Status CHECK (Status IN ('DRAFT', 'SCHEDULED', 'RUNNING', 'DONE', 'FAILED')),
    StartedAt       DATETIME2(0) NULL,
    FinishedAt      DATETIME2(0) NULL,
    Error           NVARCHAR(400) NULL,
    CreatedBy       INT NULL CONSTRAINT FK_Campaigns_User REFERENCES dbo.Users(UserId),
    CreatedAt       DATETIME2(0) NOT NULL CONSTRAINT DF_Campaigns_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Campaigns_Voucher CHECK ((VoucherPercent IS NULL AND VoucherDays IS NULL) OR (VoucherPercent IS NOT NULL AND VoucherDays IS NOT NULL))
  );
  CREATE INDEX IX_Campaigns_Due ON dbo.Campaigns (Status, ScheduledAt);

  CREATE TABLE dbo.CampaignDeliveries (
    DeliveryId INT IDENTITY CONSTRAINT PK_CampaignDeliveries PRIMARY KEY,
    CampaignId INT NOT NULL CONSTRAINT FK_Deliveries_Campaign REFERENCES dbo.Campaigns(CampaignId),
    MemberId   INT NOT NULL CONSTRAINT FK_Deliveries_Member REFERENCES dbo.Members(MemberId),
    VoucherId  INT NULL CONSTRAINT FK_Deliveries_Voucher REFERENCES dbo.Vouchers(VoucherId),
    Status     VARCHAR(10) NOT NULL CONSTRAINT CK_Deliveries_Status CHECK (Status IN ('SENT', 'EXPORTED', 'SKIPPED', 'FAILED')),
    SentAt     DATETIME2(0) NULL,
    Error      NVARCHAR(200) NULL,
    CreatedAt  DATETIME2(0) NOT NULL CONSTRAINT DF_Deliveries_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Deliveries UNIQUE (CampaignId, MemberId)
  );

  ALTER TABLE dbo.Vouchers ADD CONSTRAINT FK_Vouchers_Campaign FOREIGN KEY (CampaignId) REFERENCES dbo.Campaigns(CampaignId);
END
GO

INSERT dbo.Settings (SettingKey, SettingValue)
SELECT N'campaign.min_days_between', N'7' WHERE NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey = N'campaign.min_days_between');
GO
