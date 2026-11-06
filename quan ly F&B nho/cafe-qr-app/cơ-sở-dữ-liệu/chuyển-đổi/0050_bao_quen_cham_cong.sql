-- 0050_bao_quen_cham_cong — F-072 bổ sung (ADR-031 D-135…D-139): nhân viên báo quên chấm công. Chỉ thêm.
-- Ngày quên hẳn chấm công (không có lần chấm nào để "Báo sai"), nhân viên tự ghi giờ vào / ra thật + lý do → chờ quản lý.
-- Quản lý duyệt (có thể sửa giờ) → app tạo một lần chấm công nguồn MANUAL, ghi người duyệt; từ chối phải ghi lý do.
-- Không xóa được (lịch sử): trigger AFTER DELETE như các bảng lịch sử khác (F-071).
IF OBJECT_ID('dbo.MissedPunches') IS NULL
BEGIN
  CREATE TABLE dbo.MissedPunches (
    RequestId  INT IDENTITY  CONSTRAINT PK_MissedPunches PRIMARY KEY,
    UserId     INT           NOT NULL CONSTRAINT FK_MissedPunch_User REFERENCES dbo.Users(UserId),
    ClockIn    DATETIME2(0)  NOT NULL,
    ClockOut   DATETIME2(0)  NOT NULL,
    Note       NVARCHAR(300) NOT NULL,
    CreatedAt  DATETIME2(0)  NOT NULL CONSTRAINT DF_MissedPunch_At DEFAULT SYSUTCDATETIME(),
    Status     VARCHAR(10)   NOT NULL CONSTRAINT DF_MissedPunch_Status DEFAULT 'PENDING'
                             CONSTRAINT CK_MissedPunch_Status CHECK (Status IN ('PENDING', 'APPROVED', 'REJECTED')),
    ResolvedBy INT           NULL CONSTRAINT FK_MissedPunch_ResolvedBy REFERENCES dbo.Users(UserId),
    ResolvedAt DATETIME2(0)  NULL,
    Resolution NVARCHAR(200) NULL,
    AttId      INT           NULL CONSTRAINT FK_MissedPunch_Att REFERENCES dbo.Attendance(AttId),
    CONSTRAINT CK_MissedPunch_Times CHECK (ClockOut > ClockIn)
  );
  CREATE INDEX IX_MissedPunch_User ON dbo.MissedPunches (UserId, ClockIn);
  CREATE INDEX IX_MissedPunch_Pending ON dbo.MissedPunches (ClockIn) WHERE Status = 'PENDING';
END
GO

IF OBJECT_ID('dbo.TR_MissedPunches_NoDelete') IS NULL
  EXEC (N'CREATE TRIGGER dbo.TR_MissedPunches_NoDelete ON dbo.MissedPunches AFTER DELETE AS
    BEGIN SET NOCOUNT ON; IF EXISTS (SELECT 1 FROM deleted) THROW 50250, ''HISTORY_NO_DELETE'', 1; END');
GO
