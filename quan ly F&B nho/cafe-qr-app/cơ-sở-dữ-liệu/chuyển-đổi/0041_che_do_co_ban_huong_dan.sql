-- 0041_che_do_co_ban_huong_dan — FEATURE-061 (ADR-021 D-79, D-80). Chỉ thêm.
-- Users.TourSeenAt: lúc tài khoản xem xong / bỏ qua hướng dẫn 5 bước ở màn quầy. Tài khoản có sẵn lúc nâng cấp coi như đã xem.
-- ui.modules: quán đã dùng thật lúc nâng cấp (có đơn, hội viên hoặc phiếu nhập kho) → bật đủ 5 nhóm menu nâng cao
--   (không ai tự dưng mất mục quen dùng); quán mới chưa dùng gì → không ghi → mặc định chế độ cơ bản.
IF COL_LENGTH('dbo.Users', 'TourSeenAt') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD TourSeenAt DATETIME2(0) NULL;
  EXEC (N'UPDATE dbo.Users SET TourSeenAt = SYSUTCDATETIME();');
  IF (EXISTS (SELECT 1 FROM dbo.Orders) OR EXISTS (SELECT 1 FROM dbo.Members) OR EXISTS (SELECT 1 FROM dbo.StockReceipts))
     AND NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey = 'ui.modules')
    INSERT dbo.Settings (SettingKey, SettingValue) VALUES ('ui.modules', 'inventory,customers,finance,analytics,advanced');
END
GO
