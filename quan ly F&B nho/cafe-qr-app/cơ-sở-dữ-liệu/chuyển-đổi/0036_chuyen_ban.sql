-- 0036_chuyen_ban — FEATURE-049 chuyển bàn (ADR-010 D-43): lịch sử chuyển cả nhóm (phiên) sang bàn khác. Chỉ thêm bảng.
IF OBJECT_ID('dbo.SessionTableMoves') IS NULL
BEGIN
  CREATE TABLE dbo.SessionTableMoves (
    MoveId      INT IDENTITY CONSTRAINT PK_SessionTableMoves PRIMARY KEY,
    SessionId   UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Moves_Session REFERENCES dbo.Sessions(SessionId),
    FromTableId INT NOT NULL CONSTRAINT FK_Moves_FromTable REFERENCES dbo.Tables(TableId),
    ToTableId   INT NOT NULL CONSTRAINT FK_Moves_ToTable REFERENCES dbo.Tables(TableId),
    MovedBy     INT NOT NULL CONSTRAINT FK_Moves_User REFERENCES dbo.Users(UserId),
    MovedAt     DATETIME2(0) NOT NULL CONSTRAINT DF_Moves_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Moves_Tables CHECK (FromTableId <> ToTableId)
  );
  CREATE INDEX IX_Moves_Session ON dbo.SessionTableMoves (SessionId, MoveId);
END
GO
