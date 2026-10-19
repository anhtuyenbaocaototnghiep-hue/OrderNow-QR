-- 0006_khuyen_mai — FEATURE-016 Khuyến mãi (ADR-005 D-8, D-10). Khuyến mãi dòng và đơn khóa lúc gửi đơn.
CREATE TABLE dbo.Promotions (
  PromotionId     INT IDENTITY CONSTRAINT PK_Promotions PRIMARY KEY,
  Name            NVARCHAR(100) NOT NULL,
  Type            VARCHAR(20)   NOT NULL CONSTRAINT CK_Promotions_Type CHECK (Type IN ('ITEM_PRICE', 'ORDER_PERCENT', 'ORDER_AMOUNT')),
  Value           DECIMAL(12,2) NOT NULL,     -- ITEM_PRICE: giá mới; ORDER_PERCENT: %; ORDER_AMOUNT: số tiền
  MinOrderAmount  DECIMAL(12,0) NOT NULL CONSTRAINT DF_Promotions_Min DEFAULT 0,
  StartDate       DATE NOT NULL,
  EndDate         DATE NOT NULL,
  DaysOfWeekMask  TINYINT NOT NULL CONSTRAINT DF_Promotions_Days DEFAULT 127,   -- bit0 = CN … bit6 = T7
  StartTime       TIME(0) NULL,                -- NULL = cả ngày (giờ quán, Asia/Ho_Chi_Minh)
  EndTime         TIME(0) NULL,
  MaxUsesPerDay   INT NULL,
  StackWithMember BIT NOT NULL CONSTRAINT DF_Promotions_Stack DEFAULT 0,
  BadgeText       NVARCHAR(30) NULL,
  IsActive        BIT NOT NULL CONSTRAINT DF_Promotions_IsActive DEFAULT 1,
  SortOrder       INT NOT NULL CONSTRAINT DF_Promotions_Sort DEFAULT 0,
  DeletedAt       DATETIME2(0) NULL,
  CreatedAt       DATETIME2(0) NOT NULL CONSTRAINT DF_Promotions_CreatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_Promotions_Dates CHECK (StartDate <= EndDate),
  CONSTRAINT CK_Promotions_Value CHECK (Value >= 0 AND (Type <> 'ORDER_PERCENT' OR Value <= 100)),
  CONSTRAINT CK_Promotions_Times CHECK ((StartTime IS NULL AND EndTime IS NULL) OR (StartTime IS NOT NULL AND EndTime IS NOT NULL AND StartTime <> EndTime)),
  CONSTRAINT CK_Promotions_MaxUses CHECK (MaxUsesPerDay IS NULL OR MaxUsesPerDay > 0)
);

CREATE TABLE dbo.PromotionTargets (
  TargetId    INT IDENTITY CONSTRAINT PK_PromotionTargets PRIMARY KEY,
  PromotionId INT NOT NULL CONSTRAINT FK_PromoTargets_Promotions REFERENCES dbo.Promotions(PromotionId),
  MenuItemId  INT NULL CONSTRAINT FK_PromoTargets_MenuItems REFERENCES dbo.MenuItems(MenuItemId),
  CategoryId  INT NULL CONSTRAINT FK_PromoTargets_Categories REFERENCES dbo.Categories(CategoryId),
  CONSTRAINT CK_PromoTargets_One CHECK ((MenuItemId IS NULL AND CategoryId IS NOT NULL) OR (MenuItemId IS NOT NULL AND CategoryId IS NULL))
);
CREATE INDEX IX_PromoTargets_Promotion ON dbo.PromotionTargets (PromotionId);

ALTER TABLE dbo.OrderItems ADD
  PromotionId      INT NULL CONSTRAINT FK_OrderItems_Promotions REFERENCES dbo.Promotions(PromotionId),
  LineDiscount     DECIMAL(12,0) NOT NULL CONSTRAINT DF_OrderItems_LineDiscount DEFAULT 0,
  AllowMemberStack BIT NOT NULL CONSTRAINT DF_OrderItems_AllowMember DEFAULT 1;

ALTER TABLE dbo.Orders ADD
  SubtotalAmount   DECIMAL(12,0) NULL,         -- Σ giá niêm yết; NULL = đơn trước 0006 (= TotalAmount)
  PromoDiscount    DECIMAL(12,0) NOT NULL CONSTRAINT DF_Orders_PromoDiscount DEFAULT 0,   -- khuyến mãi dòng + đơn
  OrderPromotionId INT NULL CONSTRAINT FK_Orders_Promotions REFERENCES dbo.Promotions(PromotionId);
GO

ALTER TABLE dbo.Orders ADD CONSTRAINT CK_Orders_Promo
  CHECK (PromoDiscount >= 0 AND (SubtotalAmount IS NULL OR TotalAmount = SubtotalAmount - PromoDiscount));

CREATE TABLE dbo.PromotionUsages (
  UsageId        BIGINT IDENTITY CONSTRAINT PK_PromotionUsages PRIMARY KEY,
  PromotionId    INT NOT NULL CONSTRAINT FK_PromoUsages_Promotions REFERENCES dbo.Promotions(PromotionId),
  OrderId        INT NOT NULL CONSTRAINT FK_PromoUsages_Orders REFERENCES dbo.Orders(OrderId),
  OrderItemId    INT NULL CONSTRAINT FK_PromoUsages_OrderItems REFERENCES dbo.OrderItems(OrderItemId),
  DiscountAmount DECIMAL(12,0) NOT NULL,
  UsedAt         DATETIME2(0) NOT NULL CONSTRAINT DF_PromoUsages_UsedAt DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_PromoUsages_Promotion ON dbo.PromotionUsages (PromotionId, UsedAt) INCLUDE (OrderId, DiscountAmount);
CREATE INDEX IX_PromoUsages_Order ON dbo.PromotionUsages (OrderId);
GO
