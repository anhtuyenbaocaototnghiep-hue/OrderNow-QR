-- Xóa tài khoản nhân viên (ADR-004): không tự xóa mình; đã có thao tác (đơn, thu tiền, đóng phiên, kho) → xóa mềm
-- (không đăng nhập được, token cũ hết hiệu lực); chưa có → xóa hẳn.
-- ADR-006: không xóa quản lý (ADMIN) đang hoạt động cuối cùng (50150 LAST_ADMIN); lịch sử mới (sổ quỹ, chấm công, sơ chế, hủy hàng, PO)
-- cũng tính là đã có thao tác. F-046: lịch sử sửa / xóa món (người làm, người duyệt) và hủy bàn cũng vậy.
-- Lỗi: 50050 NOT_FOUND, 50055 CANNOT_DELETE_SELF, 50150 LAST_ADMIN. @Result: 'DELETED' | 'ARCHIVED'.
CREATE OR ALTER PROCEDURE dbo.sp_DeleteUser
  @UserId  INT,
  @ActorId INT,
  @Result  VARCHAR(10) OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF @UserId = @ActorId THROW 50055, 'CANNOT_DELETE_SELF', 1;

  BEGIN TRAN;

  IF NOT EXISTS (SELECT 1 FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE UserId = @UserId AND DeletedAt IS NULL)
  BEGIN ROLLBACK; THROW 50050, 'NOT_FOUND', 1; END
  IF EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @UserId AND Role = 'ADMIN' AND IsActive = 1)
     AND NOT EXISTS (SELECT 1 FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE UserId <> @UserId AND Role = 'ADMIN' AND IsActive = 1 AND DeletedAt IS NULL)
  BEGIN ROLLBACK; THROW 50150, 'LAST_ADMIN', 1; END

  IF EXISTS (SELECT 1 FROM dbo.Orders WHERE CreatedBy = @UserId OR CompletedBy = @UserId OR CancelledBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.Sessions WHERE ClosedBy = @UserId OR OpenedBy = @UserId OR NoteUpdatedBy = @UserId OR CancelledBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.OrderItemVoids WHERE CreatedBy = @UserId OR ApprovedBy = @UserId)   -- F-046: sửa / xóa món, người duyệt
     OR EXISTS (SELECT 1 FROM dbo.Payments WHERE ReceivedBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.InventoryTransactions WHERE CreatedBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.Payments WHERE ApprovedBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.Shifts WHERE OpenedBy = @UserId OR ClosedBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.Refunds WHERE CreatedBy = @UserId OR ApprovedBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.StaffCalls WHERE HandledBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.StockReceipts WHERE ReceivedBy = @UserId OR VoidedBy = @UserId OR EditedBy = @UserId)   -- F-048: sửa / hủy phiếu nhập
     OR EXISTS (SELECT 1 FROM dbo.SessionTableMoves WHERE MovedBy = @UserId)                                         -- F-049: chuyển bàn
     OR EXISTS (SELECT 1 FROM dbo.Stocktakes WHERE CountedBy = @UserId OR PostedBy = @UserId OR VoidedBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.CashTransactions WHERE CreatedBy = @UserId OR ApprovedBy = @UserId OR VoidedBy = @UserId)   -- F-050: hủy khoản
     OR EXISTS (SELECT 1 FROM dbo.Attendance WHERE UserId = @UserId OR EditedBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.PrepBatches WHERE PreparedBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.WasteLogs WHERE CreatedBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.PurchaseOrders WHERE CreatedBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.Rosters WHERE CreatedBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.PointTransactions WHERE CreatedBy = @UserId)          -- F-039
     OR EXISTS (SELECT 1 FROM dbo.StampEvents WHERE CreatedBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.Vouchers WHERE CreatedBy = @UserId)                   -- F-038
     OR EXISTS (SELECT 1 FROM dbo.Segments WHERE CreatedBy = @UserId)                   -- F-037
     OR EXISTS (SELECT 1 FROM dbo.Campaigns WHERE CreatedBy = @UserId)
     OR EXISTS (SELECT 1 FROM dbo.Reviews WHERE HandledBy = @UserId)                     -- F-051: xử lý đánh giá thấp
     OR EXISTS (SELECT 1 FROM dbo.Alerts WHERE UserId = @UserId OR HandledBy = @UserId)  -- F-060: cảnh báo bất thường (người liên quan / người xử lý)
  BEGIN
    UPDATE dbo.Users SET DeletedAt = SYSUTCDATETIME(), IsActive = 0 WHERE UserId = @UserId;
    SET @Result = 'ARCHIVED';
  END
  ELSE
  BEGIN
    DELETE dbo.Rosters WHERE UserId = @UserId;   -- lịch phân ca chưa làm (không phải lịch sử)
    DELETE dbo.Users WHERE UserId = @UserId;
    SET @Result = 'DELETED';
  END

  COMMIT;
END
