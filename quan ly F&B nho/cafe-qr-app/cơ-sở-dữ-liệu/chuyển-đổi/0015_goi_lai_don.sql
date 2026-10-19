-- 0015_goi_lai_don — FEATURE-045 (skill F-024): gọi lại đơn lần trước & món yêu thích của hội viên (ADR-006).
-- "Lần trước" đọc từ Orders/OrderItems/OrderItemModifiers qua Payments.MemberId — không cần bảng mới.
IF OBJECT_ID('dbo.MemberFavorites') IS NULL
BEGIN
  CREATE TABLE dbo.MemberFavorites (
    MemberId   INT NOT NULL CONSTRAINT FK_MemberFavorites_Members REFERENCES dbo.Members(MemberId),
    MenuItemId INT NOT NULL CONSTRAINT FK_MemberFavorites_MenuItems REFERENCES dbo.MenuItems(MenuItemId),
    CreatedAt  DATETIME2(0) NOT NULL CONSTRAINT DF_MemberFavorites_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_MemberFavorites PRIMARY KEY (MemberId, MenuItemId)
  );
END
GO
-- Tra đơn đã thu của hội viên (lần trước, món hay gọi)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Payments_Member')
  CREATE INDEX IX_Payments_Member ON dbo.Payments (MemberId, PaidAt) WHERE MemberId IS NOT NULL;
GO
