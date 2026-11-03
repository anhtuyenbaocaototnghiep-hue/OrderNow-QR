-- 0043_vong_quay_hen_gio_ra_mon — FEATURE-065 vòng quay may mắn, FEATURE-066 ra món khi bạn tới (ADR-024 D-89…D-94). Chỉ thêm.
-- Orders: đơn khách hẹn giờ làm (TIME) hoặc chờ bạn tới (ARRIVAL) — vẫn PENDING, ReleasedAt = lúc khách báo đã tới / nhân viên làm luôn.
IF COL_LENGTH('dbo.Orders', 'HoldMode') IS NULL
  ALTER TABLE dbo.Orders ADD
    HoldMode   VARCHAR(10)  NULL CONSTRAINT CK_Orders_HoldMode CHECK (HoldMode IN ('TIME', 'ARRIVAL')),
    HoldUntil  DATETIME2(0) NULL,
    ReleasedAt DATETIME2(0) NULL;
GO
IF OBJECT_ID('dbo.CK_Orders_Hold') IS NULL
  ALTER TABLE dbo.Orders ADD CONSTRAINT CK_Orders_Hold CHECK ((HoldMode IS NULL AND HoldUntil IS NULL) OR (HoldMode IS NOT NULL AND HoldUntil IS NOT NULL));
GO

-- Voucher trúng từ vòng quay
ALTER TABLE dbo.Vouchers DROP CONSTRAINT CK_Vouchers_Source;
ALTER TABLE dbo.Vouchers ADD CONSTRAINT CK_Vouchers_Source CHECK (Source IN ('REFERRAL', 'CAMPAIGN', 'MANUAL', 'GAME'));
GO

IF OBJECT_ID('dbo.SpinPrizes') IS NULL
BEGIN
  CREATE TABLE dbo.SpinPrizes (
    PrizeId     INT IDENTITY CONSTRAINT PK_SpinPrizes PRIMARY KEY,
    Label       NVARCHAR(40) NOT NULL,
    Kind        VARCHAR(10)  NOT NULL CONSTRAINT CK_SpinPrizes_Kind CHECK (Kind IN ('PERCENT', 'AMOUNT', 'POINTS', 'NONE')),
    Value       DECIMAL(12,0) NOT NULL CONSTRAINT DF_SpinPrizes_Value DEFAULT 0 CONSTRAINT CK_SpinPrizes_Value CHECK (Value >= 0),
    MaxDiscount DECIMAL(12,0) NULL,                  -- trần tiền giảm của voucher %
    Weight      INT NOT NULL CONSTRAINT CK_SpinPrizes_Weight CHECK (Weight >= 0),
    SortOrder   INT NOT NULL CONSTRAINT DF_SpinPrizes_Sort DEFAULT 0,
    IsActive    BIT NOT NULL CONSTRAINT DF_SpinPrizes_Active DEFAULT 1
  );
  -- Ô mặc định (tỷ lệ = trọng số %): chủ quán sửa ở Tích điểm & voucher → Vòng quay; tính năng mặc định tắt (spin.enabled)
  INSERT dbo.SpinPrizes (Label, Kind, Value, MaxDiscount, Weight, SortOrder) VALUES
    (N'Giảm 10%', 'PERCENT', 10, 20000, 10, 1),
    (N'Giảm 5.000đ', 'AMOUNT', 5000, NULL, 20, 2),
    (N'+20 điểm', 'POINTS', 20, NULL, 15, 3),
    (N'Chúc may mắn lần sau', 'NONE', 0, NULL, 55, 4);

  CREATE TABLE dbo.LuckySpins (
    SpinId     INT IDENTITY CONSTRAINT PK_LuckySpins PRIMARY KEY,
    PaymentId  INT NOT NULL CONSTRAINT FK_LuckySpins_Payment REFERENCES dbo.Payments(PaymentId),
    Token      CHAR(32) NOT NULL,
    CreatedAt  DATETIME2(0) NOT NULL CONSTRAINT DF_LuckySpins_At DEFAULT SYSUTCDATETIME(),
    ExpiresAt  DATETIME2(0) NOT NULL,
    SpunAt     DATETIME2(0) NULL,
    PrizeId    INT NULL CONSTRAINT FK_LuckySpins_Prize REFERENCES dbo.SpinPrizes(PrizeId),
    Kind       VARCHAR(10) NULL,                     -- ảnh chụp ô trúng lúc quay (ô có thể bị sửa sau)
    PrizeLabel NVARCHAR(40) NULL,
    VoucherId  INT NULL CONSTRAINT FK_LuckySpins_Voucher REFERENCES dbo.Vouchers(VoucherId),
    Points     INT NULL
  );
  CREATE UNIQUE INDEX UX_LuckySpins_Payment ON dbo.LuckySpins (PaymentId);   -- một lượt quay / lượt thu
  CREATE UNIQUE INDEX UX_LuckySpins_Token ON dbo.LuckySpins (Token);
  CREATE INDEX IX_LuckySpins_SpunAt ON dbo.LuckySpins (SpunAt) WHERE SpunAt IS NOT NULL;
END
