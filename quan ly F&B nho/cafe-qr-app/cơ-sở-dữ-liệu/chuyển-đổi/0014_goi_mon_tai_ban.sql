-- 0014_goi_mon_tai_ban — FEATURE-024: nhân viên mở bàn / gọi món giúp khách tại bàn + ghi chú bàn (chỉ nhân viên thấy).
-- OpenedBy NULL = phiên do khách quét QR mở; có giá trị = nhân viên mở bàn.
ALTER TABLE dbo.Sessions ADD
  OpenedBy      INT NULL CONSTRAINT FK_Sessions_OpenedBy REFERENCES dbo.Users(UserId),
  Note          NVARCHAR(200) NULL,
  NoteUpdatedAt DATETIME2(0) NULL,
  NoteUpdatedBy INT NULL CONSTRAINT FK_Sessions_NoteUpdatedBy REFERENCES dbo.Users(UserId);
GO
