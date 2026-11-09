-- 0056_anh_nguyen_lieu — FEATURE-085 ảnh nguyên liệu ở kho (ADR-046 D-203…D-205). Chỉ thêm.
-- Giống ảnh món (MenuItems.ImageUrl, 0001): lưu đường dẫn ảnh (URL http(s) hoặc "/img/…"), không lưu tệp trong DB. NULL = chưa có ảnh.
IF COL_LENGTH('dbo.Ingredients', 'ImageUrl') IS NULL
  ALTER TABLE dbo.Ingredients ADD ImageUrl NVARCHAR(500) NULL;
GO
