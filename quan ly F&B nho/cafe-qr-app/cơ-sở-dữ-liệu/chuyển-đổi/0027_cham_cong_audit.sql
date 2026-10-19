-- 0027_cham_cong_audit — FEATURE-035 Chấm công, phân ca, năng suất, nhật ký thao tác (audit) (ADR-006 D-25, D-26).
IF OBJECT_ID('dbo.Attendance') IS NULL
BEGIN
  CREATE TABLE dbo.Attendance (
    AttId      INT IDENTITY CONSTRAINT PK_Attendance PRIMARY KEY,
    UserId     INT NOT NULL CONSTRAINT FK_Attendance_User REFERENCES dbo.Users(UserId),
    ClockIn    DATETIME2(0) NOT NULL,
    ClockOut   DATETIME2(0) NULL,
    ShiftId    INT NULL CONSTRAINT FK_Attendance_Shift REFERENCES dbo.Shifts(ShiftId),
    Source     VARCHAR(10) NOT NULL CONSTRAINT CK_Attendance_Source CHECK (Source IN ('LOGIN', 'MANUAL')),
    EditedBy   INT NULL CONSTRAINT FK_Attendance_EditedBy REFERENCES dbo.Users(UserId),
    EditReason NVARCHAR(200) NULL,
    EditedAt   DATETIME2(0) NULL,
    CONSTRAINT CK_Attendance_Order CHECK (ClockOut IS NULL OR ClockOut >= ClockIn)
  );
  CREATE INDEX IX_Attendance_User ON dbo.Attendance (UserId, ClockIn);
  CREATE INDEX IX_Attendance_Open ON dbo.Attendance (UserId) WHERE ClockOut IS NULL;

  CREATE TABLE dbo.Rosters (
    RosterId  INT IDENTITY CONSTRAINT PK_Rosters PRIMARY KEY,
    UserId    INT NOT NULL CONSTRAINT FK_Rosters_User REFERENCES dbo.Users(UserId),
    WorkDate  DATE NOT NULL,
    StartTime TIME(0) NOT NULL,
    EndTime   TIME(0) NOT NULL,
    Note      NVARCHAR(100) NULL,
    CreatedBy INT NOT NULL CONSTRAINT FK_Rosters_CreatedBy REFERENCES dbo.Users(UserId),
    CONSTRAINT CK_Rosters_Time CHECK (StartTime <> EndTime)
  );
  CREATE INDEX IX_Rosters_Date ON dbo.Rosters (WorkDate, UserId);

  CREATE TABLE dbo.AuditLogs (
    AuditId    BIGINT IDENTITY CONSTRAINT PK_AuditLogs PRIMARY KEY,
    UserId     INT NULL,                   -- không FK: giữ nhật ký kể cả khi tài khoản bị xóa hẳn
    UserName   NVARCHAR(100) NULL,
    Role       VARCHAR(10) NULL,
    Action     VARCHAR(60) NOT NULL,
    Entity     VARCHAR(40) NOT NULL,
    EntityId   NVARCHAR(60) NULL,
    BeforeJson NVARCHAR(MAX) NULL,
    AfterJson  NVARCHAR(MAX) NULL,
    Ip         VARCHAR(45) NULL,
    UserAgent  NVARCHAR(200) NULL,
    At         DATETIME2(0) NOT NULL CONSTRAINT DF_AuditLogs_At DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_AuditLogs_At ON dbo.AuditLogs (At);
  CREATE INDEX IX_AuditLogs_Entity ON dbo.AuditLogs (Entity, EntityId);
  CREATE INDEX IX_AuditLogs_User ON dbo.AuditLogs (UserId, At);
END
GO

-- D-26: nhật ký chỉ đọc — không ai sửa được (kể cả qua SQL của ứng dụng); xóa chỉ do job giữ 12 tháng.
IF OBJECT_ID('dbo.TR_AuditLogs_ReadOnly') IS NULL
  EXEC ('CREATE TRIGGER dbo.TR_AuditLogs_ReadOnly ON dbo.AuditLogs INSTEAD OF UPDATE AS
         BEGIN SET NOCOUNT ON; THROW 50160, ''AUDIT_READONLY'', 1; END');
GO
