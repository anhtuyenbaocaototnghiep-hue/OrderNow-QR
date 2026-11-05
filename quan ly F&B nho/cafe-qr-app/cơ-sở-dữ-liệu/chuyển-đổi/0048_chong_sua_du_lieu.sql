-- 0048_chong_sua_du_lieu — FEATURE-071 chống sửa / xóa dữ liệu trái phép (ADR-029 D-119…D-123). Chỉ thêm bảng / trigger / ràng buộc.
-- AuthFailures: mỗi lần nhập sai mật khẩu (đăng nhập, hoặc tài khoản duyệt ở quầy) một dòng → đếm theo cửa sổ 15 phút để khóa tạm.
--   Không lưu mật khẩu đã gõ. Dòng quá 1 ngày bị dọn ngay khi ghi lần sai mới.
-- Bảng lịch sử tiền / ca / chấm công: không xóa cứng được (app chưa bao giờ xóa — chỉ hủy / đánh dấu); nhật ký thao tác: chỉ job giữ 12 tháng xóa được.
IF OBJECT_ID('dbo.AuthFailures') IS NULL
BEGIN
  CREATE TABLE dbo.AuthFailures (
    FailId      BIGINT IDENTITY CONSTRAINT PK_AuthFailures PRIMARY KEY,
    Kind        VARCHAR(10)   NOT NULL CONSTRAINT CK_AuthFailures_Kind CHECK (Kind IN ('LOGIN', 'APPROVAL')),
    Username    NVARCHAR(50)  NOT NULL,                 -- tên đăng nhập bị thử (đã chuẩn hóa chữ thường)
    ActorUserId INT           NULL,                     -- APPROVAL: người đang đứng quầy nhập tài khoản duyệt
    Ip          VARCHAR(45)   NULL,                     -- LOGIN: máy gửi yêu cầu
    At          DATETIME2(0)  NOT NULL CONSTRAINT DF_AuthFailures_At DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_AuthFailures_Key ON dbo.AuthFailures (Kind, Username, At);
  CREATE INDEX IX_AuthFailures_At ON dbo.AuthFailures (At);
END
GO

ALTER TABLE dbo.Alerts DROP CONSTRAINT CK_Alerts_Kind;
ALTER TABLE dbo.Alerts ADD CONSTRAINT CK_Alerts_Kind
  CHECK (Kind IN ('CASH_DIFF', 'TRANSFER_SHARE', 'VOIDS', 'REFUNDS', 'MANUAL_DISCOUNT', 'BIG_REFUND', 'CASH_VOID', 'COST_RISE', 'AUTH_LOCK'));
GO

-- D-122: nhật ký thao tác — đã có trigger chặn sửa (0027); thêm chặn xóa, trừ dòng quá 12 tháng (job audit-retention)
IF OBJECT_ID('dbo.TR_AuditLogs_NoDelete') IS NULL
  EXEC ('CREATE TRIGGER dbo.TR_AuditLogs_NoDelete ON dbo.AuditLogs AFTER DELETE AS
         BEGIN SET NOCOUNT ON;
           IF EXISTS (SELECT 1 FROM deleted WHERE At >= DATEADD(MONTH, -12, SYSUTCDATETIME())) THROW 50251, ''AUDIT_NO_DELETE'', 1;
         END');
GO

-- D-122: lịch sử tiền / ca / chấm công / cảnh báo — không xóa cứng (sửa sai bằng hủy / điều chỉnh có lý do, có nhật ký)
DECLARE @t SYSNAME, @sql NVARCHAR(MAX);
DECLARE c CURSOR LOCAL FAST_FORWARD FOR
  SELECT v.t FROM (VALUES ('Payments'), ('Refunds'), ('CashTransactions'), ('Shifts'), ('Attendance'),
                          ('OrderItemVoids'), ('GiftDrinks'), ('Alerts')) v(t)
  WHERE OBJECT_ID('dbo.' + v.t) IS NOT NULL AND OBJECT_ID('dbo.TR_' + v.t + '_NoDelete') IS NULL;
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
