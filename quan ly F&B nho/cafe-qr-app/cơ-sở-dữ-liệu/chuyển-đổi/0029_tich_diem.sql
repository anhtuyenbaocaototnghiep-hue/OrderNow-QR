-- 0029_tich_diem — FEATURE-039 Tích điểm đổi quà & tem (ADR-006 D-27).
-- Điểm: 1 điểm / 10.000đ thực trả (loyalty.point_value), không hết hạn; trước đây 1 / 1.000đ cộng thẳng vào Members.Points (D-5)
--   → số dư cũ ghi một dòng ADJUST "Số dư trước F-039" để sổ điểm (PointTransactions) khớp Members.Points.
-- Tem: mỗi món thuộc chương trình = 1 tem; đủ RequiredStamps (mặc định 10) → 1 lượt món miễn phí (RewardsAvailable).
-- Lượt thu ghi RewardDiscount (đổi thưởng — không cộng dồn với giảm tay), điểm / tem đã tích.
IF OBJECT_ID('dbo.PointTransactions') IS NULL
BEGIN
  CREATE TABLE dbo.PointTransactions (
    PtId      BIGINT IDENTITY CONSTRAINT PK_PointTransactions PRIMARY KEY,
    MemberId  INT NOT NULL CONSTRAINT FK_PointTxn_Member REFERENCES dbo.Members(MemberId),
    PaymentId INT NULL CONSTRAINT FK_PointTxn_Payment REFERENCES dbo.Payments(PaymentId),
    Delta     INT NOT NULL CONSTRAINT CK_PointTxn_Delta CHECK (Delta <> 0),
    Type      VARCHAR(10) NOT NULL CONSTRAINT CK_PointTxn_Type CHECK (Type IN ('EARN', 'REDEEM', 'ADJUST', 'EXPIRE', 'REFUND')),
    Note      NVARCHAR(200) NULL,
    CreatedBy INT NULL CONSTRAINT FK_PointTxn_User REFERENCES dbo.Users(UserId),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_PointTxn_At DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_PointTxn_Member ON dbo.PointTransactions (MemberId, CreatedAt);
  CREATE UNIQUE INDEX UX_PointTxn_Earn ON dbo.PointTransactions (PaymentId) WHERE Type = 'EARN';   -- mỗi lượt thu tối đa một EARN

  CREATE TABLE dbo.RewardCatalog (
    RewardId       INT IDENTITY CONSTRAINT PK_RewardCatalog PRIMARY KEY,
    Name           NVARCHAR(100) NOT NULL,
    PointsCost     INT NOT NULL CONSTRAINT CK_Reward_Cost CHECK (PointsCost > 0),
    RewardType     VARCHAR(10) NOT NULL CONSTRAINT CK_Reward_Type CHECK (RewardType IN ('DISCOUNT', 'FREE_ITEM')),
    DiscountAmount DECIMAL(12,0) NULL,
    MenuItemId     INT NULL CONSTRAINT FK_Reward_MenuItem REFERENCES dbo.MenuItems(MenuItemId),
    IsActive       BIT NOT NULL CONSTRAINT DF_Reward_Active DEFAULT 1,
    SortOrder      INT NOT NULL CONSTRAINT DF_Reward_Sort DEFAULT 0,
    CONSTRAINT CK_Reward_Kind CHECK ((RewardType = 'DISCOUNT' AND DiscountAmount > 0 AND MenuItemId IS NULL)
                                  OR (RewardType = 'FREE_ITEM' AND MenuItemId IS NOT NULL AND DiscountAmount IS NULL))
  );

  CREATE TABLE dbo.RewardRedemptions (
    RedId          INT IDENTITY CONSTRAINT PK_RewardRedemptions PRIMARY KEY,
    MemberId       INT NOT NULL CONSTRAINT FK_Redemption_Member REFERENCES dbo.Members(MemberId),
    RewardId       INT NOT NULL CONSTRAINT FK_Redemption_Reward REFERENCES dbo.RewardCatalog(RewardId),
    PaymentId      INT NOT NULL CONSTRAINT FK_Redemption_Payment REFERENCES dbo.Payments(PaymentId),
    PointsSpent    INT NOT NULL,
    DiscountAmount DECIMAL(12,0) NOT NULL,
    CreatedAt      DATETIME2(0) NOT NULL CONSTRAINT DF_Redemption_At DEFAULT SYSUTCDATETIME(),
    ReturnedAt     DATETIME2(0) NULL                                     -- hoàn tiền toàn bộ lượt thu → trả lại điểm
  );
  CREATE INDEX IX_Redemption_Member ON dbo.RewardRedemptions (MemberId, CreatedAt);

  CREATE TABLE dbo.StampPrograms (
    ProgramId        INT IDENTITY CONSTRAINT PK_StampPrograms PRIMARY KEY,
    Name             NVARCHAR(100) NOT NULL,
    RequiredStamps   INT NOT NULL CONSTRAINT DF_StampPrograms_Required DEFAULT 10 CONSTRAINT CK_StampPrograms_Required CHECK (RequiredStamps BETWEEN 2 AND 50),
    RewardMenuItemId INT NULL CONSTRAINT FK_StampPrograms_Reward REFERENCES dbo.MenuItems(MenuItemId),   -- NULL = món rẻ nhất của chương trình trên bill
    IsActive         BIT NOT NULL CONSTRAINT DF_StampPrograms_Active DEFAULT 1,
    CreatedAt        DATETIME2(0) NOT NULL CONSTRAINT DF_StampPrograms_At DEFAULT SYSUTCDATETIME()
  );
  CREATE TABLE dbo.StampProgramItems (
    ProgramId  INT NOT NULL CONSTRAINT FK_StampItems_Program REFERENCES dbo.StampPrograms(ProgramId),
    MenuItemId INT NOT NULL CONSTRAINT FK_StampItems_MenuItem REFERENCES dbo.MenuItems(MenuItemId),
    CONSTRAINT PK_StampProgramItems PRIMARY KEY (ProgramId, MenuItemId)
  );
  CREATE TABLE dbo.StampCards (
    MemberId         INT NOT NULL CONSTRAINT FK_StampCards_Member REFERENCES dbo.Members(MemberId),
    ProgramId        INT NOT NULL CONSTRAINT FK_StampCards_Program REFERENCES dbo.StampPrograms(ProgramId),
    Stamps           INT NOT NULL CONSTRAINT DF_StampCards_Stamps DEFAULT 0 CONSTRAINT CK_StampCards_Stamps CHECK (Stamps >= 0),
    CompletedCards   INT NOT NULL CONSTRAINT DF_StampCards_Done DEFAULT 0,
    RewardsAvailable INT NOT NULL CONSTRAINT DF_StampCards_Rewards DEFAULT 0 CONSTRAINT CK_StampCards_Rewards CHECK (RewardsAvailable >= 0),
    UpdatedAt        DATETIME2(0) NOT NULL CONSTRAINT DF_StampCards_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_StampCards PRIMARY KEY (MemberId, ProgramId)
  );
  CREATE TABLE dbo.StampEvents (
    EventId   BIGINT IDENTITY CONSTRAINT PK_StampEvents PRIMARY KEY,
    MemberId  INT NOT NULL CONSTRAINT FK_StampEvents_Member REFERENCES dbo.Members(MemberId),
    ProgramId INT NOT NULL CONSTRAINT FK_StampEvents_Program REFERENCES dbo.StampPrograms(ProgramId),
    PaymentId INT NULL CONSTRAINT FK_StampEvents_Payment REFERENCES dbo.Payments(PaymentId),
    Type      VARCHAR(10) NOT NULL CONSTRAINT CK_StampEvents_Type CHECK (Type IN ('EARN', 'REDEEM', 'REFUND', 'ADJUST')),
    Stamps    INT NOT NULL CONSTRAINT DF_StampEvents_Stamps DEFAULT 0,      -- số tem cộng (+) / trừ (−)
    Rewards   INT NOT NULL CONSTRAINT DF_StampEvents_Rewards DEFAULT 0,     -- số lượt quà cộng (+) / dùng (−)
    Note      NVARCHAR(200) NULL,
    CreatedBy INT NULL CONSTRAINT FK_StampEvents_User REFERENCES dbo.Users(UserId),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_StampEvents_At DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_StampEvents_Member ON dbo.StampEvents (MemberId, CreatedAt);

  ALTER TABLE dbo.Payments ADD
    RewardDiscount DECIMAL(12,0) NOT NULL CONSTRAINT DF_Payments_Reward DEFAULT 0,
    RewardId       INT NULL CONSTRAINT FK_Payments_Reward REFERENCES dbo.RewardCatalog(RewardId),
    StampProgramId INT NULL CONSTRAINT FK_Payments_StampProgram REFERENCES dbo.StampPrograms(ProgramId),
    PointsEarned   INT NULL,
    StampsEarned   INT NULL;
END
GO

IF OBJECT_ID('dbo.CK_Payments_Reward') IS NULL
  ALTER TABLE dbo.Payments ADD CONSTRAINT CK_Payments_Reward CHECK (RewardDiscount >= 0 AND (RewardDiscount = 0 OR MemberId IS NOT NULL));
IF OBJECT_ID('dbo.CK_Members_Points') IS NULL
  ALTER TABLE dbo.Members ADD CONSTRAINT CK_Members_Points CHECK (Points >= 0);

-- Số dư cũ (D-5) → một dòng ADJUST
INSERT dbo.PointTransactions (MemberId, Delta, Type, Note)
SELECT m.MemberId, m.Points, 'ADJUST', N'Số dư trước F-039'
FROM dbo.Members m
WHERE m.Points <> 0 AND NOT EXISTS (SELECT 1 FROM dbo.PointTransactions pt WHERE pt.MemberId = m.MemberId);

INSERT dbo.Settings (SettingKey, SettingValue)
SELECT N'loyalty.point_value', N'10000' WHERE NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey = N'loyalty.point_value');
GO
