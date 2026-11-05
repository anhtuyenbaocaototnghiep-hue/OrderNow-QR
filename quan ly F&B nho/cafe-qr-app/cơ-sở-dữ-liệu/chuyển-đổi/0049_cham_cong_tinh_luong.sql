-- 0049_cham_cong_tinh_luong — FEATURE-072 chấm công nhiều người + FEATURE-073 tính lương (ADR-030 D-124…D-134). Chỉ thêm.
-- PIN: mỗi người tự đặt (bcrypt), dùng chấm công ở màn chung, "Đổi người" và xác nhận thao tác tiền.
-- Chấm công: nguồn KIOSK; cờ cần xem lại (tự đóng / người khác chấm ra hộ); người đóng ca đánh dấu có mặt / báo không có mặt;
--   quyết định trả lương của quản lý (theo giờ thật / theo lịch / không tính).
-- Lương: hồ sơ lương, ngày lễ, khoản cộng / trừ theo tháng, bảng lương đã chốt (ảnh chụp từng dòng), báo sai giờ công;
--   tạm ứng lương ở sổ quỹ ghi người nhận (EmployeeId) và luôn chờ duyệt.
IF COL_LENGTH('dbo.Users', 'PinHash') IS NULL
  ALTER TABLE dbo.Users ADD PinHash NVARCHAR(100) NULL, PinSetAt DATETIME2(0) NULL;
GO

ALTER TABLE dbo.Attendance DROP CONSTRAINT CK_Attendance_Source;
ALTER TABLE dbo.Attendance ADD CONSTRAINT CK_Attendance_Source CHECK (Source IN ('LOGIN', 'MANUAL', 'KIOSK'));
GO
IF COL_LENGTH('dbo.Attendance', 'NeedsReview') IS NULL
  ALTER TABLE dbo.Attendance ADD
    NeedsReview   BIT NOT NULL CONSTRAINT DF_Attendance_NeedsReview DEFAULT 0,   -- tự đóng / người khác chấm ra hộ
    ClosedBy      INT NULL CONSTRAINT FK_Attendance_ClosedBy REFERENCES dbo.Users(UserId),
    CheckResult   VARCHAR(10) NULL CONSTRAINT CK_Attendance_Check CHECK (CheckResult IN ('OK', 'DISPUTED')),
    CheckedBy     INT NULL CONSTRAINT FK_Attendance_CheckedBy REFERENCES dbo.Users(UserId),
    CheckedAt     DATETIME2(0) NULL,
    PayDecision   VARCHAR(10) NULL CONSTRAINT CK_Attendance_PayDecision CHECK (PayDecision IN ('ACTUAL', 'SCHEDULE', 'NONE')),
    DecidedBy     INT NULL CONSTRAINT FK_Attendance_DecidedBy REFERENCES dbo.Users(UserId),
    DecidedAt     DATETIME2(0) NULL,
    DecisionNote  NVARCHAR(200) NULL;
GO

ALTER TABLE dbo.AuthFailures DROP CONSTRAINT CK_AuthFailures_Kind;
ALTER TABLE dbo.AuthFailures ADD CONSTRAINT CK_AuthFailures_Kind CHECK (Kind IN ('LOGIN', 'APPROVAL', 'PIN'));
GO

IF OBJECT_ID('dbo.PayProfiles') IS NULL
  CREATE TABLE dbo.PayProfiles (
    UserId            INT           NOT NULL CONSTRAINT PK_PayProfiles PRIMARY KEY CONSTRAINT FK_PayProfiles_User REFERENCES dbo.Users(UserId),
    PayType           VARCHAR(10)   NOT NULL CONSTRAINT CK_PayProfiles_Type CHECK (PayType IN ('HOURLY', 'MONTHLY')),
    HourlyRate        DECIMAL(12,0) NOT NULL CONSTRAINT DF_PayProfiles_Hourly DEFAULT 0,
    MonthlySalary     DECIMAL(12,0) NOT NULL CONSTRAINT DF_PayProfiles_Monthly DEFAULT 0,
    NightAllowance    DECIMAL(12,0) NOT NULL CONSTRAINT DF_PayProfiles_Night DEFAULT 0,    -- mỗi giờ làm sau NightStart
    NightStart        TIME(0)       NOT NULL CONSTRAINT DF_PayProfiles_NightStart DEFAULT '18:00',
    HolidayMultiplier DECIMAL(4,2)  NOT NULL CONSTRAINT DF_PayProfiles_Holiday DEFAULT 3,  -- lương giờ ngày lễ (hỏi kế toán)
    AttendanceBonus   DECIMAL(12,0) NOT NULL CONSTRAINT DF_PayProfiles_Bonus DEFAULT 0,    -- cả tháng không trễ, không vắng
    BankBin           CHAR(6)       NULL,
    BankAccount       VARCHAR(30)   NULL,
    BankAccountName   NVARCHAR(100) NULL,
    UpdatedBy         INT           NULL CONSTRAINT FK_PayProfiles_UpdatedBy REFERENCES dbo.Users(UserId),
    UpdatedAt         DATETIME2(0)  NOT NULL CONSTRAINT DF_PayProfiles_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_PayProfiles_Amounts CHECK (HourlyRate >= 0 AND MonthlySalary >= 0 AND NightAllowance >= 0 AND AttendanceBonus >= 0
                                             AND HolidayMultiplier >= 1 AND HolidayMultiplier <= 5)
  );
GO

IF OBJECT_ID('dbo.Holidays') IS NULL
  CREATE TABLE dbo.Holidays (
    HolidayDate DATE          NOT NULL CONSTRAINT PK_Holidays PRIMARY KEY,
    Name        NVARCHAR(100) NOT NULL
  );
GO

IF OBJECT_ID('dbo.PayrollAdjustments') IS NULL
BEGIN
  CREATE TABLE dbo.PayrollAdjustments (
    AdjId     INT IDENTITY  CONSTRAINT PK_PayrollAdjustments PRIMARY KEY,
    Month     CHAR(7)       NOT NULL,                                     -- YYYY-MM
    UserId    INT           NOT NULL CONSTRAINT FK_PayrollAdj_User REFERENCES dbo.Users(UserId),
    Amount    DECIMAL(12,0) NOT NULL CONSTRAINT CK_PayrollAdj_Amount CHECK (Amount <> 0),   -- > 0 thưởng, < 0 khấu trừ
    Reason    NVARCHAR(200) NOT NULL,
    CreatedBy INT           NOT NULL CONSTRAINT FK_PayrollAdj_CreatedBy REFERENCES dbo.Users(UserId),
    CreatedAt DATETIME2(0)  NOT NULL CONSTRAINT DF_PayrollAdj_At DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_PayrollAdj_Month ON dbo.PayrollAdjustments (Month, UserId);
END
GO

IF OBJECT_ID('dbo.PayrollRuns') IS NULL
  CREATE TABLE dbo.PayrollRuns (
    Month        CHAR(7)       NOT NULL CONSTRAINT PK_PayrollRuns PRIMARY KEY,
    Status       VARCHAR(10)   NOT NULL CONSTRAINT CK_PayrollRuns_Status CHECK (Status IN ('LOCKED', 'REOPENED')),
    LockedBy     INT           NULL CONSTRAINT FK_PayrollRuns_LockedBy REFERENCES dbo.Users(UserId),
    LockedAt     DATETIME2(0)  NULL,
    ReopenedBy   INT           NULL CONSTRAINT FK_PayrollRuns_ReopenedBy REFERENCES dbo.Users(UserId),
    ReopenedAt   DATETIME2(0)  NULL,
    ReopenReason NVARCHAR(200) NULL
  );
GO

IF OBJECT_ID('dbo.PayrollLines') IS NULL
  CREATE TABLE dbo.PayrollLines (
    Month           CHAR(7)       NOT NULL CONSTRAINT FK_PayrollLines_Run REFERENCES dbo.PayrollRuns(Month),
    UserId          INT           NOT NULL CONSTRAINT FK_PayrollLines_User REFERENCES dbo.Users(UserId),
    Minutes         INT           NOT NULL,
    NightMinutes    INT           NOT NULL,
    HolidayMinutes  INT           NOT NULL,
    BasePay         DECIMAL(12,0) NOT NULL,
    NightPay        DECIMAL(12,0) NOT NULL,
    HolidayPay      DECIMAL(12,0) NOT NULL,
    AttendanceBonus DECIMAL(12,0) NOT NULL,
    Adjustments     DECIMAL(12,0) NOT NULL,
    Advances        DECIMAL(12,0) NOT NULL,
    NetPay          DECIMAL(12,0) NOT NULL,
    LateCount       INT           NOT NULL,
    AbsentCount     INT           NOT NULL,
    DetailJson      NVARCHAR(MAX) NULL,
    PaidAt          DATETIME2(0)  NULL,
    PaidBy          INT           NULL CONSTRAINT FK_PayrollLines_PaidBy REFERENCES dbo.Users(UserId),
    PaidMethod      VARCHAR(10)   NULL CONSTRAINT CK_PayrollLines_Method CHECK (PaidMethod IN ('CASH', 'TRANSFER')),
    AckAt           DATETIME2(0)  NULL,                                   -- nhân viên bấm "Đã xem"
    CONSTRAINT PK_PayrollLines PRIMARY KEY (Month, UserId)
  );
GO

IF OBJECT_ID('dbo.AttendanceDisputes') IS NULL
BEGIN
  CREATE TABLE dbo.AttendanceDisputes (
    DisputeId  INT IDENTITY  CONSTRAINT PK_AttendanceDisputes PRIMARY KEY,
    AttId      INT           NOT NULL CONSTRAINT FK_AttDispute_Att REFERENCES dbo.Attendance(AttId),
    UserId     INT           NOT NULL CONSTRAINT FK_AttDispute_User REFERENCES dbo.Users(UserId),
    Note       NVARCHAR(300) NOT NULL,
    CreatedAt  DATETIME2(0)  NOT NULL CONSTRAINT DF_AttDispute_At DEFAULT SYSUTCDATETIME(),
    ResolvedBy INT           NULL CONSTRAINT FK_AttDispute_ResolvedBy REFERENCES dbo.Users(UserId),
    ResolvedAt DATETIME2(0)  NULL,
    Resolution NVARCHAR(200) NULL
  );
  CREATE INDEX IX_AttDispute_Open ON dbo.AttendanceDisputes (AttId) WHERE ResolvedAt IS NULL;
END
GO

-- Tạm ứng lương: ghi người nhận, luôn chờ duyệt (không ai tự duyệt khoản ứng của mình — kiểm ở máy chủ)
IF COL_LENGTH('dbo.CashTransactions', 'EmployeeId') IS NULL
  ALTER TABLE dbo.CashTransactions ADD EmployeeId INT NULL CONSTRAINT FK_CashTxn_Employee REFERENCES dbo.Users(UserId);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.CashCategories WHERE SystemCode = 'SALARY_ADVANCE')
BEGIN
  DECLARE @adv INT = (SELECT TOP 1 CategoryId FROM dbo.CashCategories WHERE Name = N'Lương tạm ứng' AND Direction = 'OUT' AND SystemCode IS NULL ORDER BY CategoryId);
  IF @adv IS NOT NULL
    UPDATE dbo.CashCategories SET SystemCode = 'SALARY_ADVANCE', RequiresApproval = 1 WHERE CategoryId = @adv;
  ELSE
    INSERT dbo.CashCategories (Name, Direction, IsExpense, RequiresApproval, IsActive, SortOrder, SystemCode)
    VALUES (N'Lương tạm ứng', 'OUT', 1, 1, 1, 4, 'SALARY_ADVANCE');
END
GO

-- Lịch sử chấm công / bảng lương đã chốt / báo sai: không xóa cứng (như 0048)
DECLARE @t SYSNAME, @sql NVARCHAR(MAX);
DECLARE c CURSOR LOCAL FAST_FORWARD FOR
  SELECT v.t FROM (VALUES ('PayrollRuns'), ('AttendanceDisputes')) v(t)
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
