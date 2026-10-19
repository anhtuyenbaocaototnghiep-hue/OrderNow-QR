-- 0017_thoi_gian_cho — FEATURE-025 Thời gian chờ ước tính (ADR-006 D-18) + nhật ký job nền dùng chung (JobRuns).
IF COL_LENGTH('dbo.MenuItems', 'PrepSeconds') IS NULL
  ALTER TABLE dbo.MenuItems ADD PrepSeconds INT NULL
    CONSTRAINT CK_MenuItems_PrepSeconds CHECK (PrepSeconds IS NULL OR PrepSeconds BETWEEN 10 AND 3600);   -- quản lý nhập; NULL = dùng thống kê
GO
IF OBJECT_ID('dbo.ItemPrepStats') IS NULL
  CREATE TABLE dbo.ItemPrepStats (                 -- job 02:00: trung vị 30 ngày (AcceptedAt → CompletedAt chia đều số dòng)
    MenuItemId    INT NOT NULL CONSTRAINT PK_ItemPrepStats PRIMARY KEY CONSTRAINT FK_ItemPrepStats_Item REFERENCES dbo.MenuItems(MenuItemId),
    MedianSeconds INT NOT NULL,
    SampleCount   INT NOT NULL,
    ComputedAt    DATETIME2(0) NOT NULL
  );

IF OBJECT_ID('dbo.JobRuns') IS NULL
BEGIN
  CREATE TABLE dbo.JobRuns (
    RunId      BIGINT IDENTITY CONSTRAINT PK_JobRuns PRIMARY KEY,
    Name       VARCHAR(50) NOT NULL,
    StartedAt  DATETIME2(0) NOT NULL CONSTRAINT DF_JobRuns_Started DEFAULT SYSUTCDATETIME(),
    FinishedAt DATETIME2(0) NULL,
    Status     VARCHAR(10) NOT NULL CONSTRAINT CK_JobRuns_Status CHECK (Status IN ('RUNNING', 'OK', 'FAILED', 'SKIPPED')),
    Info       NVARCHAR(400) NULL,
    Error      NVARCHAR(1000) NULL
  );
  CREATE INDEX IX_JobRuns_Name ON dbo.JobRuns (Name, StartedAt DESC);
END

INSERT dbo.Settings (SettingKey, SettingValue)
SELECT k, v FROM (VALUES (N'kitchen.base_seconds', N'120'), (N'kitchen.parallelism', N'1'), (N'eta.spread_percent', N'25'),
                         (N'eta.default_item_seconds', N'180')) x(k, v)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Settings s WHERE s.SettingKey = x.k);
GO
