-- 0040_canh_bao_bat_thuong — FEATURE-060 phát hiện bất thường, cảnh báo qua email (ADR-020 D-75…D-78). Chỉ thêm bảng.
-- Alerts: mỗi dấu hiệu bất thường một dòng; DedupeKey duy nhất → chạy lại phát hiện cho cùng ca / cùng lượt hoàn không tạo trùng.
-- AlertOutbox: hàng đợi email (cảnh báo tức thì, báo cáo ca, tổng kết ngày, thư báo đổi người nhận, email thử);
--   job nền nhận dòng PENDING đã tới giờ → SENDING → SENT / thử lại / FAILED. DedupeKey (nếu có) duy nhất → không gửi trùng.
--   Ngưỡng / người nhận nằm trong dbo.Settings (khóa alert.*, mặc định trong code); mật khẩu hộp thư chỉ ở .env.
IF OBJECT_ID('dbo.Alerts') IS NULL
BEGIN
  CREATE TABLE dbo.Alerts (
    AlertId   INT IDENTITY CONSTRAINT PK_Alerts PRIMARY KEY,
    Kind      VARCHAR(20) NOT NULL CONSTRAINT CK_Alerts_Kind
                CHECK (Kind IN ('CASH_DIFF', 'TRANSFER_SHARE', 'VOIDS', 'REFUNDS', 'MANUAL_DISCOUNT', 'BIG_REFUND', 'CASH_VOID')),
    Severity  VARCHAR(10) NOT NULL CONSTRAINT CK_Alerts_Severity CHECK (Severity IN ('MEDIUM', 'HIGH')),
    ShiftId   INT NULL CONSTRAINT FK_Alerts_Shift REFERENCES dbo.Shifts(ShiftId),
    UserId    INT NULL CONSTRAINT FK_Alerts_User REFERENCES dbo.Users(UserId),   -- người liên quan chính (nhiều người → trong Detail)
    Title     NVARCHAR(200) NOT NULL,
    Detail    NVARCHAR(MAX) NULL,                                                  -- JSON: giá trị, ngưỡng, mức bình thường, theo người
    DedupeKey VARCHAR(100) NOT NULL CONSTRAINT UQ_Alerts_Dedupe UNIQUE,
    Status    VARCHAR(10) NOT NULL CONSTRAINT DF_Alerts_Status DEFAULT 'NEW'
                CONSTRAINT CK_Alerts_Status CHECK (Status IN ('NEW', 'SEEN', 'RESOLVED')),
    Note      NVARCHAR(300) NULL,
    HandledBy INT NULL CONSTRAINT FK_Alerts_HandledBy REFERENCES dbo.Users(UserId),
    HandledAt DATETIME2(0) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Alerts_At DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_Alerts_Status_At ON dbo.Alerts (Status, CreatedAt DESC);
  CREATE INDEX IX_Alerts_At ON dbo.Alerts (CreatedAt);
END
GO

IF OBJECT_ID('dbo.AlertOutbox') IS NULL
BEGIN
  CREATE TABLE dbo.AlertOutbox (
    OutboxId      INT IDENTITY CONSTRAINT PK_AlertOutbox PRIMARY KEY,
    Kind          VARCHAR(10) NOT NULL CONSTRAINT CK_Outbox_Kind CHECK (Kind IN ('ALERT', 'SHIFT', 'DIGEST', 'NOTICE', 'TEST')),
    AlertId       INT NULL CONSTRAINT FK_Outbox_Alert REFERENCES dbo.Alerts(AlertId),
    DedupeKey     VARCHAR(120) NULL,
    Recipients    NVARCHAR(600) NOT NULL,                                          -- ảnh chụp danh sách người nhận lúc tạo
    Subject       NVARCHAR(250) NOT NULL,
    BodyText      NVARCHAR(MAX) NOT NULL,
    BodyHtml      NVARCHAR(MAX) NOT NULL,
    Status        VARCHAR(10) NOT NULL CONSTRAINT DF_Outbox_Status DEFAULT 'PENDING'
                    CONSTRAINT CK_Outbox_Status CHECK (Status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
    Attempts      INT NOT NULL CONSTRAINT DF_Outbox_Attempts DEFAULT 0,
    NextAttemptAt DATETIME2(0) NOT NULL CONSTRAINT DF_Outbox_Next DEFAULT SYSUTCDATETIME(),
    LastError     NVARCHAR(400) NULL,
    CreatedAt     DATETIME2(0) NOT NULL CONSTRAINT DF_Outbox_At DEFAULT SYSUTCDATETIME(),
    SentAt        DATETIME2(0) NULL
  );
  CREATE UNIQUE INDEX UX_Outbox_Dedupe ON dbo.AlertOutbox (DedupeKey) WHERE DedupeKey IS NOT NULL;
  CREATE INDEX IX_Outbox_Due ON dbo.AlertOutbox (Status, NextAttemptAt);
END
GO
