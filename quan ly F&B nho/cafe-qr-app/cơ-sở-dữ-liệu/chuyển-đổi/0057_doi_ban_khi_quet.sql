-- 0057_doi_ban_khi_quet — FEATURE-086 khách đổi bàn khi quét QR (ADR-047 D-206…D-210). Chỉ thêm / nới, không xóa dữ liệu.
-- 1) StaffCalls: loại MOVE = khách xin chuyển nhóm sang bàn khác (quầy bấm "Chuyển"), kèm bàn đích.
IF COL_LENGTH('dbo.StaffCalls', 'ToTableId') IS NULL
  ALTER TABLE dbo.StaffCalls ADD ToTableId INT NULL CONSTRAINT FK_StaffCalls_ToTable REFERENCES dbo.Tables(TableId);
GO
IF OBJECT_ID('dbo.CK_StaffCalls_Type') IS NOT NULL ALTER TABLE dbo.StaffCalls DROP CONSTRAINT CK_StaffCalls_Type;
ALTER TABLE dbo.StaffCalls ADD CONSTRAINT CK_StaffCalls_Type CHECK (Type IN ('STAFF', 'MOVE'));
IF OBJECT_ID('dbo.CK_StaffCalls_MoveTarget') IS NULL
  ALTER TABLE dbo.StaffCalls ADD CONSTRAINT CK_StaffCalls_MoveTarget CHECK ((Type = 'MOVE' AND ToTableId IS NOT NULL) OR (Type <> 'MOVE' AND ToTableId IS NULL));
GO
-- Một yêu cầu chuyển bàn chưa xử lý mỗi phiên (khách đổi ý thì cập nhật bàn đích, không chồng yêu cầu)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_StaffCalls_OpenMove')
  CREATE UNIQUE INDEX UX_StaffCalls_OpenMove ON dbo.StaffCalls (SessionId) WHERE Type = 'MOVE' AND HandledAt IS NULL;
GO
-- 2) SessionTableMoves: khách tự chuyển (nhóm chưa có món, chỉ một người) — không có nhân viên chuyển.
ALTER TABLE dbo.SessionTableMoves ALTER COLUMN MovedBy INT NULL;
IF COL_LENGTH('dbo.SessionTableMoves', 'ByGuest') IS NULL
  ALTER TABLE dbo.SessionTableMoves ADD ByGuest BIT NOT NULL CONSTRAINT DF_Moves_ByGuest DEFAULT 0;
GO
IF OBJECT_ID('dbo.CK_Moves_Actor') IS NULL
  ALTER TABLE dbo.SessionTableMoves ADD CONSTRAINT CK_Moves_Actor CHECK (MovedBy IS NOT NULL OR ByGuest = 1);
GO
-- 3) Sessions.CloseReason: 'IDLE_EMPTY' = hệ thống tự đóng phiên trống quá lâu (D-209); NULL = như cũ.
IF COL_LENGTH('dbo.Sessions', 'CloseReason') IS NULL
  ALTER TABLE dbo.Sessions ADD CloseReason VARCHAR(20) NULL
    CONSTRAINT CK_Sessions_CloseReason CHECK (CloseReason IS NULL OR CloseReason IN ('IDLE_EMPTY'));
GO
