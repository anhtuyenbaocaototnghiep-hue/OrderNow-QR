-- Thiết lập SQL Server local một lần (chạy bằng tài khoản Windows có quyền sysadmin):
--   sqlcmd -S . -E -C -i cơ-sở-dữ-liệu/cài-đặt/local-sql-setup.sql -v DB_NAME="CafeQrDev" APP_LOGIN="cafe_app" APP_PASSWORD="<mật khẩu>"
-- Tạo database (collation không phân biệt hoa/thường — BR-004), login SQL cho ứng dụng và cấp db_owner.
-- Yêu cầu: SQL Server bật Mixed Mode và TCP/IP (ứng dụng Node kết nối qua TCP bằng SQL login).
SET NOCOUNT ON;
IF DB_ID(N'$(DB_NAME)') IS NULL
  EXEC(N'CREATE DATABASE [$(DB_NAME)] COLLATE Vietnamese_CI_AS');
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'$(APP_LOGIN)')
  EXEC(N'CREATE LOGIN [$(APP_LOGIN)] WITH PASSWORD = N''$(APP_PASSWORD)'', CHECK_POLICY = ON, DEFAULT_DATABASE = [$(DB_NAME)]');
GO
USE [$(DB_NAME)];
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'$(APP_LOGIN)')
  CREATE USER [$(APP_LOGIN)] FOR LOGIN [$(APP_LOGIN)];
ALTER ROLE db_owner ADD MEMBER [$(APP_LOGIN)];
PRINT 'OK $(DB_NAME)';
GO
