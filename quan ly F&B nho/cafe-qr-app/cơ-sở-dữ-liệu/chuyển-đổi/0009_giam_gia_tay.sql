-- 0009_giam_gia_tay — FEATURE-022 Giảm giá tay trên bill (ADR-005 D-14): bắt buộc lý do; vượt ngưỡng cần quản lý duyệt.
ALTER TABLE dbo.Payments ADD
  ManualReason NVARCHAR(200) NULL,
  ApprovedBy   INT NULL CONSTRAINT FK_Payments_ApprovedBy REFERENCES dbo.Users(UserId);
GO
ALTER TABLE dbo.Payments ADD CONSTRAINT CK_Payments_ManualReason CHECK (ManualDiscount = 0 OR ManualReason IS NOT NULL);

INSERT dbo.Settings (SettingKey, SettingValue) VALUES
  (N'discount.staff_max_percent', N'10'),
  (N'discount.staff_max_amount', N'20000');
GO
