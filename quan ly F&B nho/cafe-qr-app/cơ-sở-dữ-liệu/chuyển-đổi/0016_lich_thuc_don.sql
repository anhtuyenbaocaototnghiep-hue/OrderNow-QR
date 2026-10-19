-- 0016_lich_thuc_don — FEATURE-040 Thực đơn theo mùa / khung giờ (ADR-006).
-- Khái quát Categories.SellFrom/SellTo của F-020: mỗi danh mục có giờ bán → một lịch SHOW (SourceCategoryId); cột cũ giữ nguyên
-- và được đồng bộ khi quản lý sửa danh mục.
IF OBJECT_ID('dbo.MenuSchedules') IS NULL
BEGIN
  CREATE TABLE dbo.MenuSchedules (
    ScheduleId       INT IDENTITY CONSTRAINT PK_MenuSchedules PRIMARY KEY,
    Name             NVARCHAR(100) NOT NULL,
    StartDate        DATE NULL,
    EndDate          DATE NULL,
    DaysOfWeekMask   TINYINT NOT NULL CONSTRAINT DF_MenuSchedules_Days DEFAULT 127,   -- bit0 = Chủ nhật … bit6 = Thứ bảy
    StartTime        TIME(0) NULL,
    EndTime          TIME(0) NULL,                                                     -- StartTime > EndTime = qua nửa đêm
    IsActive         BIT NOT NULL CONSTRAINT DF_MenuSchedules_Active DEFAULT 1,
    SourceCategoryId INT NULL CONSTRAINT FK_MenuSchedules_Category REFERENCES dbo.Categories(CategoryId),
    CreatedAt        DATETIME2(0) NOT NULL CONSTRAINT DF_MenuSchedules_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_MenuSchedules_Days CHECK (DaysOfWeekMask BETWEEN 1 AND 127),
    CONSTRAINT CK_MenuSchedules_Dates CHECK (StartDate IS NULL OR EndDate IS NULL OR StartDate <= EndDate),
    CONSTRAINT CK_MenuSchedules_Times CHECK ((StartTime IS NULL AND EndTime IS NULL) OR (StartTime IS NOT NULL AND EndTime IS NOT NULL AND StartTime <> EndTime))
  );
  CREATE UNIQUE INDEX UX_MenuSchedules_SourceCategory ON dbo.MenuSchedules (SourceCategoryId) WHERE SourceCategoryId IS NOT NULL;

  CREATE TABLE dbo.MenuScheduleItems (
    ScheduleItemId INT IDENTITY CONSTRAINT PK_MenuScheduleItems PRIMARY KEY,
    ScheduleId     INT NOT NULL CONSTRAINT FK_MenuScheduleItems_Schedule REFERENCES dbo.MenuSchedules(ScheduleId),
    MenuItemId     INT NULL CONSTRAINT FK_MenuScheduleItems_Item REFERENCES dbo.MenuItems(MenuItemId),
    CategoryId     INT NULL CONSTRAINT FK_MenuScheduleItems_Category REFERENCES dbo.Categories(CategoryId),
    Mode           VARCHAR(10) NOT NULL CONSTRAINT CK_MenuScheduleItems_Mode CHECK (Mode IN ('SHOW', 'HIDE')),
    CONSTRAINT CK_MenuScheduleItems_Target CHECK ((MenuItemId IS NULL AND CategoryId IS NOT NULL) OR (MenuItemId IS NOT NULL AND CategoryId IS NULL))
  );
  CREATE INDEX IX_MenuScheduleItems_Schedule ON dbo.MenuScheduleItems (ScheduleId);
END
GO
-- Giờ bán danh mục hiện có (F-020) → lịch SHOW tương ứng
INSERT dbo.MenuSchedules (Name, StartTime, EndTime, SourceCategoryId)
SELECT LEFT(N'Giờ bán — ' + c.Name, 100), c.SellFrom, c.SellTo, c.CategoryId
FROM dbo.Categories c
WHERE c.SellFrom IS NOT NULL AND c.SellTo IS NOT NULL AND c.DeletedAt IS NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.MenuSchedules s WHERE s.SourceCategoryId = c.CategoryId);

INSERT dbo.MenuScheduleItems (ScheduleId, CategoryId, Mode)
SELECT s.ScheduleId, s.SourceCategoryId, 'SHOW'
FROM dbo.MenuSchedules s
WHERE s.SourceCategoryId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.MenuScheduleItems i WHERE i.ScheduleId = s.ScheduleId);
GO
