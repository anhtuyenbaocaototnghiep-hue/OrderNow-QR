-- 0058_man_quay_mot_man_hinh — FEATURE-088 màn quầy một màn hình (ADR-049 D-214…D-219). Chỉ thêm cột, không xóa dữ liệu.
-- 1) MenuItems.Station: trạm làm món — 'BAR' pha chế (mặc định, món cũ giữ nguyên hành vi), 'COUNTER' quầy lấy (bánh, nước chai) (D-216).
IF COL_LENGTH('dbo.MenuItems', 'Station') IS NULL
  ALTER TABLE dbo.MenuItems ADD Station VARCHAR(10) NOT NULL CONSTRAINT DF_MenuItems_Station DEFAULT 'BAR';
GO
IF OBJECT_ID('dbo.CK_MenuItems_Station') IS NULL
  ALTER TABLE dbo.MenuItems ADD CONSTRAINT CK_MenuItems_Station CHECK (Station IN ('BAR', 'COUNTER'));
GO
-- 2) Orders.ServedAt / ServedBy: đơn tại bàn đã được nhân viên mang ra (D-217). NULL = chưa mang / không áp dụng (mang đi, chế độ COUNTER).
IF COL_LENGTH('dbo.Orders', 'ServedAt') IS NULL
  ALTER TABLE dbo.Orders ADD ServedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH('dbo.Orders', 'ServedBy') IS NULL
  ALTER TABLE dbo.Orders ADD ServedBy INT NULL CONSTRAINT FK_Orders_ServedBy REFERENCES dbo.Users(UserId);
GO
-- Chỉ đơn đã hoàn tất mới có giờ mang ra, và phải biết ai mang. Không so ServedAt với CompletedAt: đơn bán lúc mất mạng
-- (F-074) mang giờ hoàn tất theo đồng hồ máy quầy, có thể nhanh hơn giờ máy chủ.
IF OBJECT_ID('dbo.CK_Orders_Served') IS NULL
  ALTER TABLE dbo.Orders ADD CONSTRAINT CK_Orders_Served CHECK (ServedAt IS NULL OR (ServedBy IS NOT NULL AND CompletedAt IS NOT NULL));
GO
