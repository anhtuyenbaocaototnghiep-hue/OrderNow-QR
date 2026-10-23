-- 0038_danh_gia — FEATURE-051 đánh giá sau khi dùng món (ADR-010 D-46…D-48). Chỉ thêm bảng / cài đặt.
-- Mỗi điện thoại (ClientToken) một đánh giá / phiên; sao 1–5 từng món; HasLow = có món ≤ 2 sao (báo quầy, nhân viên bấm Đã xử lý).
IF OBJECT_ID('dbo.Reviews') IS NULL
BEGIN
  CREATE TABLE dbo.Reviews (
    ReviewId    INT IDENTITY CONSTRAINT PK_Reviews PRIMARY KEY,
    SessionId   UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Reviews_Session REFERENCES dbo.Sessions(SessionId),
    ClientToken CHAR(32) NOT NULL,
    Comment     NVARCHAR(300) NULL,
    HasLow      BIT NOT NULL CONSTRAINT DF_Reviews_HasLow DEFAULT 0,
    HandledBy   INT NULL CONSTRAINT FK_Reviews_HandledBy REFERENCES dbo.Users(UserId),
    HandledAt   DATETIME2(0) NULL,
    CreatedAt   DATETIME2(0) NOT NULL CONSTRAINT DF_Reviews_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Reviews_SessionClient UNIQUE (SessionId, ClientToken)
  );
  CREATE INDEX IX_Reviews_At ON dbo.Reviews (CreatedAt);

  CREATE TABLE dbo.ReviewItems (
    ReviewId   INT NOT NULL CONSTRAINT FK_ReviewItems_Review REFERENCES dbo.Reviews(ReviewId),
    MenuItemId INT NOT NULL CONSTRAINT FK_ReviewItems_MenuItem REFERENCES dbo.MenuItems(MenuItemId),
    Stars      TINYINT NOT NULL CONSTRAINT CK_ReviewItems_Stars CHECK (Stars BETWEEN 1 AND 5),
    CONSTRAINT PK_ReviewItems PRIMARY KEY (ReviewId, MenuItemId)
  );
  CREATE INDEX IX_ReviewItems_Item ON dbo.ReviewItems (MenuItemId) INCLUDE (Stars);
END
GO

-- Sao trên menu khách (D-48): món có ≥ N đánh giá trong D ngày gần nhất
INSERT dbo.Settings (SettingKey, SettingValue)
SELECT N'review.menu_min_count', N'5' WHERE NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey = N'review.menu_min_count');
INSERT dbo.Settings (SettingKey, SettingValue)
SELECT N'review.menu_days', N'90' WHERE NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey = N'review.menu_days');
GO
