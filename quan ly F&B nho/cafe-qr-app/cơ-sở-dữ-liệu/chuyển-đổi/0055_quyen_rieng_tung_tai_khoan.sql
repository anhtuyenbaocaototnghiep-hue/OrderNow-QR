-- 0055_quyen_rieng_tung_tai_khoan — FEATURE-079 quyền riêng từng tài khoản + xin quyền / duyệt (ADR-037 D-167…D-172). Chỉ thêm.
-- UserGrants: chủ quán cho phép (ALLOW) / không cho (DENY) một quyền (Capability — khóa trong src/auth/permissions.js CAPABILITIES)
-- với một người, có thể kèm hạn (ExpiresAt, UTC). Không có dòng = theo vai trò. Mỗi người một dòng mỗi quyền.
-- AccessRequests: nhân viên bấm "Xin quyền" khi bị chặn → chủ quán duyệt (tạo UserGrants ALLOW theo thời hạn chọn) hoặc từ chối.
IF OBJECT_ID('dbo.UserGrants') IS NULL
  CREATE TABLE dbo.UserGrants (
    GrantId    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserGrants PRIMARY KEY,
    UserId     INT          NOT NULL CONSTRAINT FK_UserGrants_User REFERENCES dbo.Users(UserId),
    Capability VARCHAR(30)  NOT NULL,
    Effect     VARCHAR(5)   NOT NULL CONSTRAINT CK_UserGrants_Effect CHECK (Effect IN ('ALLOW', 'DENY')),
    ExpiresAt  DATETIME2(0) NULL,
    GrantedBy  INT          NOT NULL CONSTRAINT FK_UserGrants_By REFERENCES dbo.Users(UserId),
    GrantedAt  DATETIME2(0) NOT NULL CONSTRAINT DF_UserGrants_At DEFAULT SYSUTCDATETIME(),
    Note       NVARCHAR(200) NULL,
    CONSTRAINT UQ_UserGrants_UserCap UNIQUE (UserId, Capability)
  );
GO

IF OBJECT_ID('dbo.AccessRequests') IS NULL
  CREATE TABLE dbo.AccessRequests (
    RequestId    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AccessRequests PRIMARY KEY,
    UserId       INT           NOT NULL CONSTRAINT FK_AccessRequests_User REFERENCES dbo.Users(UserId),
    Capability   VARCHAR(30)   NOT NULL,
    Reason       NVARCHAR(200) NULL,
    Status       VARCHAR(10)   NOT NULL CONSTRAINT DF_AccessRequests_Status DEFAULT 'PENDING'
                 CONSTRAINT CK_AccessRequests_Status CHECK (Status IN ('PENDING', 'APPROVED', 'REJECTED')),
    CreatedAt    DATETIME2(0)  NOT NULL CONSTRAINT DF_AccessRequests_At DEFAULT SYSUTCDATETIME(),
    DecidedBy    INT           NULL CONSTRAINT FK_AccessRequests_By REFERENCES dbo.Users(UserId),
    DecidedAt    DATETIME2(0)  NULL,
    Duration     VARCHAR(10)   NULL CONSTRAINT CK_AccessRequests_Duration CHECK (Duration IS NULL OR Duration IN ('TODAY', 'WEEK', 'ALWAYS')),
    DecisionNote NVARCHAR(200) NULL
  );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_AccessRequests_Pending')
  CREATE UNIQUE INDEX UX_AccessRequests_Pending ON dbo.AccessRequests (UserId, Capability) WHERE Status = 'PENDING';
GO

ALTER TABLE dbo.Alerts DROP CONSTRAINT CK_Alerts_Kind;
ALTER TABLE dbo.Alerts ADD CONSTRAINT CK_Alerts_Kind
  CHECK (Kind IN ('CASH_DIFF', 'TRANSFER_SHARE', 'VOIDS', 'REFUNDS', 'MANUAL_DISCOUNT', 'BIG_REFUND', 'CASH_VOID', 'COST_RISE', 'AUTH_LOCK', 'OFFLINE_SALE',
                  'EXPIRY_RISK', 'PRICE_CHANGE', 'ACCESS_GRANT'));
GO
