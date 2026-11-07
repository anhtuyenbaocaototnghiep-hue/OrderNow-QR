-- 0051_ban_khi_mat_mang — FEATURE-074 bán tiếp khi mất mạng (ADR-032 D-140…D-146). Chỉ thêm.
-- Orders.ClientRef: mã máy quầy tạo cho mỗi lượt thu (cả lúc có mạng) — duy nhất → gửi lại / gửi bù không bao giờ tính hai lần.
-- Orders.SaleSource: 'OFFLINE' (máy quầy bán tạm lúc mất kết nối, tự gửi bù) | 'PAPER' (trưởng ca / quản lý nhập lại từ phiếu bán tay).
-- OfflineSales: chi tiết lần gửi bù (ai bán, giờ bán thật, ai gửi, ca lúc bán / ca được ghi, việc cần kiểm) — không xóa được.
IF COL_LENGTH('dbo.Orders', 'ClientRef') IS NULL
  ALTER TABLE dbo.Orders ADD ClientRef UNIQUEIDENTIFIER NULL,
    SaleSource VARCHAR(10) NULL CONSTRAINT CK_Orders_SaleSource CHECK (SaleSource IN ('OFFLINE', 'PAPER'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Orders_ClientRef')
  CREATE UNIQUE INDEX UX_Orders_ClientRef ON dbo.Orders (ClientRef) WHERE ClientRef IS NOT NULL;
GO

IF OBJECT_ID('dbo.OfflineSales') IS NULL
BEGIN
  CREATE TABLE dbo.OfflineSales (
    OrderId         INT              NOT NULL CONSTRAINT PK_OfflineSales PRIMARY KEY CONSTRAINT FK_OfflineSales_Order REFERENCES dbo.Orders(OrderId),
    ClientRef       UNIQUEIDENTIFIER NOT NULL,
    Source          VARCHAR(10)      NOT NULL CONSTRAINT CK_OfflineSales_Source CHECK (Source IN ('OFFLINE', 'PAPER')),
    LocalCode       NVARCHAR(20)     NULL,          -- mã tạm in trên bill lúc mất mạng (T-0007)
    SoldAt          DATETIME2(0)     NOT NULL,
    SoldBy          INT              NOT NULL CONSTRAINT FK_OfflineSales_SoldBy REFERENCES dbo.Users(UserId),
    SyncedAt        DATETIME2(0)     NOT NULL CONSTRAINT DF_OfflineSales_SyncedAt DEFAULT SYSUTCDATETIME(),
    SyncedBy        INT              NOT NULL CONSTRAINT FK_OfflineSales_SyncedBy REFERENCES dbo.Users(UserId),
    Device          NVARCHAR(60)     NULL,
    ClientTotal     DECIMAL(12,0)    NOT NULL,
    ShiftIdAtSale   INT              NULL,
    ShiftIdRecorded INT              NOT NULL CONSTRAINT FK_OfflineSales_Shift REFERENCES dbo.Shifts(ShiftId),
    IssuesJson      NVARCHAR(2000)   NULL           -- [{ code: PRICE_DIFF | STOCK_SHORT | SHIFT_LATE | TRANSFER_CHECK | MEMBER_NOT_FOUND, … }]
  );
  CREATE INDEX IX_OfflineSales_Shift ON dbo.OfflineSales (ShiftIdRecorded);
  CREATE INDEX IX_OfflineSales_SoldAt ON dbo.OfflineSales (SoldAt);
END
GO

IF OBJECT_ID('dbo.TR_OfflineSales_NoDelete') IS NULL
  EXEC (N'CREATE TRIGGER dbo.TR_OfflineSales_NoDelete ON dbo.OfflineSales AFTER DELETE AS
    BEGIN SET NOCOUNT ON; IF EXISTS (SELECT 1 FROM deleted) THROW 50250, ''HISTORY_NO_DELETE'', 1; END');
GO

ALTER TABLE dbo.Alerts DROP CONSTRAINT CK_Alerts_Kind;
ALTER TABLE dbo.Alerts ADD CONSTRAINT CK_Alerts_Kind
  CHECK (Kind IN ('CASH_DIFF', 'TRANSFER_SHARE', 'VOIDS', 'REFUNDS', 'MANUAL_DISCOUNT', 'BIG_REFUND', 'CASH_VOID', 'COST_RISE', 'AUTH_LOCK', 'OFFLINE_SALE'));
GO
