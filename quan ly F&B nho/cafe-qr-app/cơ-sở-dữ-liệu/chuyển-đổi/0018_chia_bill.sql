-- 0018_chia_bill — FEATURE-026 Chia bill theo người trong phiên gộp (ADR-006 D-17).
-- Mỗi phần = một nhóm dòng món; dòng SplitId NULL thuộc phần "Chung" (một dòng IsCommon cho mỗi phiên có chia).
-- Mỗi phần một Payments (UX_Payments_Split); phiên KHÔNG chia vẫn một Payments (UX_Payments_Session lọc SplitId IS NULL).
IF OBJECT_ID('dbo.SessionSplits') IS NULL
BEGIN
  CREATE TABLE dbo.SessionSplits (
    SplitId     INT IDENTITY CONSTRAINT PK_SessionSplits PRIMARY KEY,
    SessionId   UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_SessionSplits_Sessions REFERENCES dbo.Sessions(SessionId),
    Label       NVARCHAR(50) NOT NULL,
    ClientToken CHAR(32) NULL,                                                         -- điện thoại tạo phần (khách)
    MemberId    INT NULL CONSTRAINT FK_SessionSplits_Members REFERENCES dbo.Members(MemberId),
    IsCommon    BIT NOT NULL CONSTRAINT DF_SessionSplits_Common DEFAULT 0,
    Status      VARCHAR(10) NOT NULL CONSTRAINT DF_SessionSplits_Status DEFAULT 'OPEN' CONSTRAINT CK_SessionSplits_Status CHECK (Status IN ('OPEN', 'PAID')),
    PaymentId   INT NULL CONSTRAINT FK_SessionSplits_Payments REFERENCES dbo.Payments(PaymentId),
    CreatedAt   DATETIME2(0) NOT NULL CONSTRAINT DF_SessionSplits_At DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_SessionSplits_Session ON dbo.SessionSplits (SessionId);
  CREATE UNIQUE INDEX UX_SessionSplits_Common ON dbo.SessionSplits (SessionId) WHERE IsCommon = 1;
END
GO
IF COL_LENGTH('dbo.OrderItems', 'SplitId') IS NULL
  ALTER TABLE dbo.OrderItems ADD
    SplitId   INT NULL CONSTRAINT FK_OrderItems_Splits REFERENCES dbo.SessionSplits(SplitId),   -- NULL = phần Chung
    PaidAt    DATETIME2(0) NULL,                                                               -- dòng đã thu (theo phần)
    PaymentId INT NULL CONSTRAINT FK_OrderItems_Payments REFERENCES dbo.Payments(PaymentId);    -- lượt thu đã trả dòng này
IF COL_LENGTH('dbo.Payments', 'SplitId') IS NULL
  ALTER TABLE dbo.Payments ADD SplitId INT NULL CONSTRAINT FK_Payments_Splits REFERENCES dbo.SessionSplits(SplitId);
GO
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Payments_Session' AND object_id = OBJECT_ID('dbo.Payments'))
  DROP INDEX UX_Payments_Session ON dbo.Payments;
CREATE UNIQUE INDEX UX_Payments_Session ON dbo.Payments (SessionId) WHERE SessionId IS NOT NULL AND SplitId IS NULL;   -- BR-019 phiên không chia
CREATE UNIQUE INDEX UX_Payments_Split ON dbo.Payments (SplitId) WHERE SplitId IS NOT NULL;                              -- mỗi phần một lượt thu
CREATE INDEX IX_OrderItems_Split ON dbo.OrderItems (SplitId) WHERE SplitId IS NOT NULL;
CREATE INDEX IX_OrderItems_Payment ON dbo.OrderItems (PaymentId) WHERE PaymentId IS NOT NULL;
GO
