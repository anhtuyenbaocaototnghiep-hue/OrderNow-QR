-- 0008_chot_ca — FEATURE-018 Chốt ca tiền mặt. Một thời điểm chỉ một ca mở; thu tiền phải gắn ca đang mở.
CREATE TABLE dbo.Shifts (
  ShiftId      INT IDENTITY CONSTRAINT PK_Shifts PRIMARY KEY,
  OpenFlag     BIT NOT NULL CONSTRAINT DF_Shifts_OpenFlag DEFAULT 1,      -- cột hằng để index lọc "chỉ một ca mở"
  OpenedBy     INT NOT NULL CONSTRAINT FK_Shifts_OpenedBy REFERENCES dbo.Users(UserId),
  OpenedAt     DATETIME2(0) NOT NULL CONSTRAINT DF_Shifts_OpenedAt DEFAULT SYSUTCDATETIME(),
  OpeningCash  DECIMAL(12,0) NOT NULL CONSTRAINT CK_Shifts_Opening CHECK (OpeningCash >= 0),
  ClosedBy     INT NULL CONSTRAINT FK_Shifts_ClosedBy REFERENCES dbo.Users(UserId),
  ClosedAt     DATETIME2(0) NULL,
  ExpectedCash DECIMAL(12,0) NULL,
  CountedCash  DECIMAL(12,0) NULL CONSTRAINT CK_Shifts_Counted CHECK (CountedCash IS NULL OR CountedCash >= 0),
  Difference   DECIMAL(12,0) NULL,
  Note         NVARCHAR(200) NULL,
  CONSTRAINT CK_Shifts_Closed CHECK ((ClosedAt IS NULL AND ClosedBy IS NULL AND CountedCash IS NULL)
                                     OR (ClosedAt IS NOT NULL AND ClosedBy IS NOT NULL AND CountedCash IS NOT NULL AND ExpectedCash IS NOT NULL))
);
CREATE UNIQUE INDEX UX_Shifts_OneOpen ON dbo.Shifts (OpenFlag) WHERE ClosedAt IS NULL;
CREATE INDEX IX_Shifts_OpenedAt ON dbo.Shifts (OpenedAt);

ALTER TABLE dbo.Payments ADD ShiftId INT NULL CONSTRAINT FK_Payments_Shifts REFERENCES dbo.Shifts(ShiftId);
GO
CREATE INDEX IX_Payments_Shift ON dbo.Payments (ShiftId) WHERE ShiftId IS NOT NULL;
GO
