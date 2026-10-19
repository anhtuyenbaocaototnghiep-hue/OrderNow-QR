-- 0028_lai_lo — FEATURE-034 Lãi/lỗ đơn giản & điểm hòa vốn (ADR-006 D-31): chi phí cố định theo tháng, phân bổ theo ngày.
IF OBJECT_ID('dbo.FixedCosts') IS NULL
  CREATE TABLE dbo.FixedCosts (
    CostId        INT IDENTITY CONSTRAINT PK_FixedCosts PRIMARY KEY,
    Name          NVARCHAR(100) NOT NULL,
    MonthlyAmount DECIMAL(12,0) NOT NULL CONSTRAINT CK_FixedCosts_Amount CHECK (MonthlyAmount >= 0),
    EffectiveFrom DATE NOT NULL,
    EffectiveTo   DATE NULL,
    CreatedAt     DATETIME2(0) NOT NULL CONSTRAINT DF_FixedCosts_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_FixedCosts_Range CHECK (EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom)
  );
GO
