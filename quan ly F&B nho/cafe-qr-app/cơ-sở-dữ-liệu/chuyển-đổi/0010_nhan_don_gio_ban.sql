-- 0010_nhan_don_gio_ban — FEATURE-020: công tắc nhận đơn QR + giờ bán theo danh mục.
-- Tự "hết món" khi thiếu nguyên liệu đã có sẵn (tính động — ADR-003, ADR-005 D-12).
ALTER TABLE dbo.Categories ADD
  SellFrom TIME(0) NULL,     -- NULL = bán cả ngày; SellFrom > SellTo = qua nửa đêm
  SellTo   TIME(0) NULL;
GO
ALTER TABLE dbo.Categories ADD CONSTRAINT CK_Categories_SellHours
  CHECK ((SellFrom IS NULL AND SellTo IS NULL) OR (SellFrom IS NOT NULL AND SellTo IS NOT NULL AND SellFrom <> SellTo));

INSERT dbo.Settings (SettingKey, SettingValue) VALUES
  (N'store.accepting_orders', N'true'),
  (N'store.closed_message', N'Quán tạm ngưng nhận đơn qua QR, vui lòng gọi món tại quầy.');
GO
