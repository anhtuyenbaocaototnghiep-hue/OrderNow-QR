-- Chấm công tự động (FEATURE-035, ADR-006 D-25): đăng nhập → ClockIn nếu chưa có bản ghi mở trong @StaleHours giờ.
-- Bản ghi mở cũ hơn (quên đăng xuất) được đóng tại ClockIn + @StaleHours (không vượt quá hiện tại). Khóa theo người dùng
-- (UPDLOCK, HOLDLOCK trên dải UserId) → hai lần đăng nhập cùng lúc không tạo hai bản ghi mở.
CREATE OR ALTER PROCEDURE dbo.sp_ClockIn
  @UserId     INT,
  @StaleHours INT = 12,
  @AttId      INT OUTPUT,
  @Created    BIT OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();
  BEGIN TRAN;
  UPDATE dbo.Attendance WITH (UPDLOCK, HOLDLOCK)
     SET ClockOut = CASE WHEN DATEADD(HOUR, @StaleHours, ClockIn) < @Now THEN DATEADD(HOUR, @StaleHours, ClockIn) ELSE @Now END
   WHERE UserId = @UserId AND ClockOut IS NULL AND ClockIn < DATEADD(HOUR, -@StaleHours, @Now);

  SELECT @AttId = AttId FROM dbo.Attendance WITH (UPDLOCK, HOLDLOCK) WHERE UserId = @UserId AND ClockOut IS NULL;
  SET @Created = 0;
  IF @AttId IS NULL
  BEGIN
    INSERT dbo.Attendance (UserId, ClockIn, ShiftId, Source)
    VALUES (@UserId, @Now, (SELECT ShiftId FROM dbo.Shifts WHERE ClosedAt IS NULL), 'LOGIN');
    SET @AttId = SCOPE_IDENTITY();
    SET @Created = 1;
  END
  COMMIT;
END
GO
