-- 0044_qua_sinh_nhat — FEATURE-067 quà sinh nhật hội viên (ADR-025 D-95…D-100). Chỉ thêm.
-- Members: lúc khách TỰ thêm ngày sinh (Thẻ thành viên) — ngày sinh tự thêm chỉ tính quà khi thêm trước ≥ 30 ngày; quản lý sửa → NULL (đã xác minh).
IF COL_LENGTH('dbo.Members', 'BirthDateSelfAt') IS NULL
  ALTER TABLE dbo.Members ADD BirthDateSelfAt DATETIME2(0) NULL;
GO

-- Voucher quà sinh nhật; "tặng 1 món": MenuItemId + DiscountAmount = giá món lúc tặng (số giảm thật = đơn giá món trên bill lúc thu)
IF COL_LENGTH('dbo.Vouchers', 'MenuItemId') IS NULL
  ALTER TABLE dbo.Vouchers ADD MenuItemId INT NULL CONSTRAINT FK_Vouchers_MenuItem REFERENCES dbo.MenuItems(MenuItemId);
GO
ALTER TABLE dbo.Vouchers DROP CONSTRAINT CK_Vouchers_Source;
ALTER TABLE dbo.Vouchers ADD CONSTRAINT CK_Vouchers_Source CHECK (Source IN ('REFERRAL', 'CAMPAIGN', 'MANUAL', 'GAME', 'BIRTHDAY'));
GO

-- Mỗi hội viên một quà mỗi năm (năm của ngày sinh nhật, không phải năm lúc tặng — tuần sinh nhật có thể vắt qua năm)
IF OBJECT_ID('dbo.BirthdayGifts') IS NULL
BEGIN
  CREATE TABLE dbo.BirthdayGifts (
    MemberId     INT      NOT NULL CONSTRAINT FK_BirthdayGifts_Member REFERENCES dbo.Members(MemberId),
    GiftYear     SMALLINT NOT NULL,
    BirthdayDate DATE     NOT NULL,                 -- ngày sinh nhật của năm đó (29/02 → 28/02 năm không nhuận)
    VoucherId    INT      NOT NULL CONSTRAINT FK_BirthdayGifts_Voucher REFERENCES dbo.Vouchers(VoucherId),
    CreatedAt    DATETIME2(0) NOT NULL CONSTRAINT DF_BirthdayGifts_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_BirthdayGifts PRIMARY KEY (MemberId, GiftYear)
  );
  CREATE UNIQUE INDEX UX_BirthdayGifts_Voucher ON dbo.BirthdayGifts (VoucherId);
  CREATE INDEX IX_BirthdayGifts_Created ON dbo.BirthdayGifts (CreatedAt);
END
GO
