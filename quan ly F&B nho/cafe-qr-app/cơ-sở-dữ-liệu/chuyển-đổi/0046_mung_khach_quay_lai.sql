-- 0046_mung_khach_quay_lai — FEATURE-069 mừng khách quay lại (ADR-027 D-107…D-111). Chỉ thêm.
-- Voucher quà quay lại: nguồn WINBACK
ALTER TABLE dbo.Vouchers DROP CONSTRAINT CK_Vouchers_Source;
ALTER TABLE dbo.Vouchers ADD CONSTRAINT CK_Vouchers_Source CHECK (Source IN ('REFERRAL', 'CAMPAIGN', 'MANUAL', 'GAME', 'BIRTHDAY', 'WINBACK'));
GO

-- Một quà mỗi đợt vắng: đợt vắng nhận diện bằng LastVisitAt lúc phát (LastVisitBefore) — hai yêu cầu cùng lúc trùng khóa
IF OBJECT_ID('dbo.WinbackGifts') IS NULL
BEGIN
  CREATE TABLE dbo.WinbackGifts (
    GiftId          INT IDENTITY CONSTRAINT PK_WinbackGifts PRIMARY KEY,
    MemberId        INT          NOT NULL CONSTRAINT FK_WinbackGifts_Member REFERENCES dbo.Members(MemberId),
    LastVisitBefore DATETIME2(0) NOT NULL,      -- Members.LastVisitAt lúc phát (lần thanh toán trước khi quay lại)
    AbsentDays      INT          NOT NULL,      -- số ngày vắng lúc phát (giờ quán)
    VoucherId       INT          NOT NULL CONSTRAINT FK_WinbackGifts_Voucher REFERENCES dbo.Vouchers(VoucherId),
    CreatedAt       DATETIME2(0) NOT NULL CONSTRAINT DF_WinbackGifts_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_WinbackGifts_Episode UNIQUE (MemberId, LastVisitBefore)
  );
  CREATE UNIQUE INDEX UX_WinbackGifts_Voucher ON dbo.WinbackGifts (VoucherId);
  CREATE INDEX IX_WinbackGifts_Member ON dbo.WinbackGifts (MemberId, CreatedAt);
  CREATE INDEX IX_WinbackGifts_Created ON dbo.WinbackGifts (CreatedAt);
END
GO
