-- 0060_luong_khong_tu_duyet — FEATURE-098 (ADR-061 D-242, D-244): giữ dấu vết lịch sử lương. Chỉ thêm cột / bảng / trigger.
-- 1) Xóa khoản cộng / trừ = ẩn (người xóa, lúc xóa) — CSDL chặn xóa cứng.
-- 2) PayrollLines.PaidAmount: số tiền lúc đánh dấu đã trả. Dòng đã trả trước bản này điền bằng NetPay hiện tại (số gần đúng nhất có được).
-- 3) PayrollRunVersions: bản chốt trước mỗi lần chốt lại (từng dòng dạng JSON) — không xóa được.
-- 4) Cảnh báo PAYROLL_CHANGE (đổi lương / tài khoản của người khác, mở lại bảng lương — chỉ chủ quán xem).
IF COL_LENGTH('dbo.PayrollAdjustments', 'DeletedAt') IS NULL
  ALTER TABLE dbo.PayrollAdjustments ADD
    DeletedAt DATETIME2(0) NULL,
    DeletedBy INT NULL CONSTRAINT FK_PayrollAdj_DeletedBy REFERENCES dbo.Users(UserId);
GO

IF COL_LENGTH('dbo.PayrollLines', 'PaidAmount') IS NULL
  ALTER TABLE dbo.PayrollLines ADD PaidAmount DECIMAL(12,0) NULL;
GO
UPDATE dbo.PayrollLines SET PaidAmount = NetPay WHERE PaidAt IS NOT NULL AND PaidAmount IS NULL;
GO

IF OBJECT_ID('dbo.PayrollRunVersions') IS NULL
  CREATE TABLE dbo.PayrollRunVersions (
    VersionId    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PayrollRunVersions PRIMARY KEY,
    Month        CHAR(7)       NOT NULL,
    LockedAt     DATETIME2(0)  NULL,
    LockedBy     INT           NULL CONSTRAINT FK_PayrollRunVersions_LockedBy REFERENCES dbo.Users(UserId),
    ReopenedAt   DATETIME2(0)  NULL,
    ReopenedBy   INT           NULL CONSTRAINT FK_PayrollRunVersions_ReopenedBy REFERENCES dbo.Users(UserId),
    ReopenReason NVARCHAR(200) NULL,
    SupersededAt DATETIME2(0)  NOT NULL CONSTRAINT DF_PayrollRunVersions_SupersededAt DEFAULT SYSUTCDATETIME(),
    SupersededBy INT           NOT NULL CONSTRAINT FK_PayrollRunVersions_SupersededBy REFERENCES dbo.Users(UserId),
    TotalNet     DECIMAL(14,0) NOT NULL,
    LinesJson    NVARCHAR(MAX) NOT NULL
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PayrollRunVersions_Month' AND object_id = OBJECT_ID('dbo.PayrollRunVersions'))
  CREATE INDEX IX_PayrollRunVersions_Month ON dbo.PayrollRunVersions (Month, VersionId);
GO

-- Không xóa cứng (như 0048 / 0049)
DECLARE @t SYSNAME, @sql NVARCHAR(MAX);
DECLARE c CURSOR LOCAL FAST_FORWARD FOR
  SELECT v.t FROM (VALUES ('PayrollAdjustments'), ('PayrollRunVersions')) v(t)
  WHERE OBJECT_ID('dbo.TR_' + v.t + '_NoDelete') IS NULL;
OPEN c;
FETCH NEXT FROM c INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
  SET @sql = N'CREATE TRIGGER dbo.' + QUOTENAME('TR_' + @t + '_NoDelete') + N' ON dbo.' + QUOTENAME(@t) + N' AFTER DELETE AS
    BEGIN SET NOCOUNT ON; IF EXISTS (SELECT 1 FROM deleted) THROW 50250, ''HISTORY_NO_DELETE'', 1; END';
  EXEC (@sql);
  FETCH NEXT FROM c INTO @t;
END
CLOSE c;
DEALLOCATE c;
GO

ALTER TABLE dbo.Alerts DROP CONSTRAINT CK_Alerts_Kind;
GO
ALTER TABLE dbo.Alerts ADD CONSTRAINT CK_Alerts_Kind
  CHECK (Kind IN ('CASH_DIFF', 'TRANSFER_SHARE', 'VOIDS', 'REFUNDS', 'MANUAL_DISCOUNT', 'BIG_REFUND', 'CASH_VOID', 'COST_RISE', 'AUTH_LOCK', 'OFFLINE_SALE',
                  'EXPIRY_RISK', 'PRICE_CHANGE', 'ACCESS_GRANT', 'PAYROLL_CHANGE'));
GO
