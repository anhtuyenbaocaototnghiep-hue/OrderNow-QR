-- 0011_goi_nhan_vien — FEATURE-021 Khách gọi nhân viên (xin nước, thêm đá…). Chống spam 60 giây/phiên ở service.
CREATE TABLE dbo.StaffCalls (
  CallId      INT IDENTITY CONSTRAINT PK_StaffCalls PRIMARY KEY,
  SessionId   UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_StaffCalls_Sessions REFERENCES dbo.Sessions(SessionId),
  Type        VARCHAR(20) NOT NULL CONSTRAINT DF_StaffCalls_Type DEFAULT 'STAFF' CONSTRAINT CK_StaffCalls_Type CHECK (Type IN ('STAFF')),
  Message     NVARCHAR(100) NULL,
  RequestedAt DATETIME2(0) NOT NULL CONSTRAINT DF_StaffCalls_RequestedAt DEFAULT SYSUTCDATETIME(),
  HandledBy   INT NULL CONSTRAINT FK_StaffCalls_HandledBy REFERENCES dbo.Users(UserId),
  HandledAt   DATETIME2(0) NULL
);
CREATE INDEX IX_StaffCalls_Open ON dbo.StaffCalls (RequestedAt) WHERE HandledAt IS NULL;
CREATE INDEX IX_StaffCalls_Session ON dbo.StaffCalls (SessionId, RequestedAt);
GO
