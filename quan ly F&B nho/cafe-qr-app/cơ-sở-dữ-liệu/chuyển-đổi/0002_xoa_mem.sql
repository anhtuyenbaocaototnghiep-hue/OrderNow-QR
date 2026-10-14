-- 0002_xoa_mem — ADR-004: xóa trong trang Quản lý.
-- Bản ghi đã có lịch sử được xóa mềm (DeletedAt) để báo cáo/lịch sử cũ vẫn đúng; tên/mã của nó được dùng lại
-- nên các ràng buộc duy nhất chuyển thành index có lọc WHERE DeletedAt IS NULL.
ALTER TABLE dbo.Users       ADD DeletedAt DATETIME2(0) NULL;
ALTER TABLE dbo.Tables      ADD DeletedAt DATETIME2(0) NULL;
ALTER TABLE dbo.Categories  ADD DeletedAt DATETIME2(0) NULL;
ALTER TABLE dbo.MenuItems   ADD DeletedAt DATETIME2(0) NULL;
ALTER TABLE dbo.Ingredients ADD DeletedAt DATETIME2(0) NULL;
GO

DROP INDEX UX_Users_Username ON dbo.Users;
CREATE UNIQUE INDEX UX_Users_Username ON dbo.Users (Username) WHERE DeletedAt IS NULL;          -- BR-004 (collation CI)

ALTER TABLE dbo.Tables DROP CONSTRAINT UQ_Tables_Code;
CREATE UNIQUE INDEX UX_Tables_Code ON dbo.Tables (Code) WHERE DeletedAt IS NULL;

ALTER TABLE dbo.Ingredients DROP CONSTRAINT UQ_Ingredients_Name;
CREATE UNIQUE INDEX UX_Ingredients_Name ON dbo.Ingredients (Name) WHERE DeletedAt IS NULL;
GO
