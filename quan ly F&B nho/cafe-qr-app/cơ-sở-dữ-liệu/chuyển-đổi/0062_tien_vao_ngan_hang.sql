-- 0062_tien_vao_ngan_hang — FEATURE-100 (ADR-063 D-249…D-252): tiền chuyển khoản vào tài khoản quán (SePay hoặc giả lập).
-- Mỗi giao dịch ngân hàng lưu một dòng, khóa duy nhất (Provider, ProviderTxnId) → không xử lý hai lần. Không xóa được (lịch sử tiền).
-- Tài khoản hệ thống "Tự động (ngân hàng)": người ghi lượt thu khi tiền vào khớp bàn — đã lưu trữ (DeletedAt) nên không đăng nhập,
-- không hiện ở danh sách nhân viên / chấm công / lương.
IF OBJECT_ID('dbo.BankTransactions') IS NULL
  CREATE TABLE dbo.BankTransactions (
    BankTxnId       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_BankTransactions PRIMARY KEY,
    Provider        VARCHAR(10)      NOT NULL CONSTRAINT CK_BankTransactions_Provider CHECK (Provider IN ('SEPAY', 'SIMULATED')),
    ProviderTxnId   NVARCHAR(64)     NOT NULL,
    AccountNumber   VARCHAR(30)      NULL,
    Amount          DECIMAL(12,0)    NOT NULL CONSTRAINT CK_BankTransactions_Amount CHECK (Amount > 0),
    Content         NVARCHAR(500)    NULL,
    ReferenceNumber NVARCHAR(100)    NULL,
    TransactionAt   DATETIME2(0)     NOT NULL,
    ReceivedAt      DATETIME2(0)     NOT NULL CONSTRAINT DF_BankTransactions_ReceivedAt DEFAULT SYSUTCDATETIME(),
    Status          VARCHAR(10)      NOT NULL CONSTRAINT DF_BankTransactions_Status DEFAULT 'NEW'
                                     CONSTRAINT CK_BankTransactions_Status CHECK (Status IN ('NEW', 'MATCHED', 'UNMATCHED', 'HANDLED')),
    SessionId       UNIQUEIDENTIFIER NULL CONSTRAINT FK_BankTransactions_Session REFERENCES dbo.Sessions(SessionId),
    PaymentId       INT              NULL CONSTRAINT FK_BankTransactions_Payment REFERENCES dbo.Payments(PaymentId),
    Note            NVARCHAR(200)    NULL,
    HandledBy       INT              NULL CONSTRAINT FK_BankTransactions_HandledBy REFERENCES dbo.Users(UserId),
    HandledAt       DATETIME2(0)     NULL,
    CONSTRAINT UQ_BankTransactions_Provider UNIQUE (Provider, ProviderTxnId)
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BankTransactions_Status' AND object_id = OBJECT_ID('dbo.BankTransactions'))
  CREATE INDEX IX_BankTransactions_Status ON dbo.BankTransactions (Status, ReceivedAt);
GO
IF OBJECT_ID('dbo.TR_BankTransactions_NoDelete') IS NULL
  EXEC (N'CREATE TRIGGER dbo.TR_BankTransactions_NoDelete ON dbo.BankTransactions AFTER DELETE AS
    BEGIN SET NOCOUNT ON; IF EXISTS (SELECT 1 FROM deleted) THROW 50250, ''HISTORY_NO_DELETE'', 1; END');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Username = N'he-thong-ngan-hang')
  INSERT dbo.Users (Username, PasswordHash, FullName, Role, IsActive, DeletedAt)
  VALUES (N'he-thong-ngan-hang', N'!khong-dang-nhap', N'Tự động (ngân hàng)', 'STAFF', 0, SYSUTCDATETIME());
GO
