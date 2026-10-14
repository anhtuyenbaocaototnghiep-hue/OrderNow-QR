-- Gửi đơn (dine-in của khách) hoặc tạo đơn mang đi đã thu tiền mặt (quầy).
-- BR-001, BR-009, BR-010 (ADR-001: giữ kho khi gửi), BR-011/012 (giá lấy từ DB), BR-020 + Q-013 (khóa phiên), BR-006 (mang đi).
-- Thứ tự khóa: Sessions → Ingredients → (insert) Orders. Lỗi: 50002 OUT_OF_STOCK (message = danh sách MenuItemId),
-- 50010 ITEM_UNAVAILABLE (danh sách MenuItemId), 50011 EMPTY_ORDER, 50012 INVALID_ORDER, 50020 INSUFFICIENT_AMOUNT, 50031 SESSION_CLOSED.
CREATE OR ALTER PROCEDURE dbo.sp_SubmitOrder
  @Type            VARCHAR(10),               -- 'DINE_IN' | 'TAKE_AWAY'
  @SessionId       UNIQUEIDENTIFIER = NULL,   -- dine-in
  @CreatedBy       INT = NULL,                -- mang đi: nhân viên tạo đơn và nhận tiền
  @PaymentMethod   VARCHAR(10) = NULL,        -- mang đi: 'CASH'; dine-in: NULL (trả sau — ADR-000)
  @AmountReceived  DECIMAL(12,0) = NULL,      -- mang đi: tiền khách đưa
  @Note            NVARCHAR(200) = NULL,
  @Items           dbo.OrderItemInput READONLY,
  @OrderId         INT OUTPUT,
  @OrderCode       CHAR(8) OUTPUT,
  @SessionReopened BIT OUTPUT                 -- 1 nếu phiên đang PAYMENT_REQUESTED được đưa về OPEN (gọi thêm món)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  SET @SessionReopened = 0;

  IF NOT EXISTS (SELECT 1 FROM @Items) THROW 50011, 'EMPTY_ORDER', 1;
  IF @Type = 'DINE_IN' AND (@SessionId IS NULL OR @PaymentMethod IS NOT NULL) THROW 50012, 'INVALID_ORDER', 1;
  IF @Type = 'TAKE_AWAY' AND (@PaymentMethod IS NULL OR @CreatedBy IS NULL OR @SessionId IS NOT NULL) THROW 50012, 'INVALID_ORDER', 1;
  IF @Type NOT IN ('DINE_IN', 'TAKE_AWAY') THROW 50012, 'INVALID_ORDER', 1;

  DECLARE @TableId INT = NULL, @SessionStatus VARCHAR(20) = NULL;
  DECLARE @IsCash BIT = CASE WHEN @PaymentMethod = 'CASH' THEN 1 ELSE 0 END;

  BEGIN TRAN;

  -- 1. Khóa phiên trước (Q-013): chạy tuần tự với sp_SettleSession / sp_CloseEmptySession / sp_RequestPayment
  IF @Type = 'DINE_IN'
  BEGIN
    SELECT @SessionStatus = Status, @TableId = TableId
    FROM dbo.Sessions WITH (UPDLOCK, ROWLOCK)
    WHERE SessionId = @SessionId;

    IF @SessionStatus IS NULL OR @SessionStatus = 'CLOSED'
    BEGIN ROLLBACK; THROW 50031, 'SESSION_CLOSED', 1; END

    IF @SessionStatus = 'PAYMENT_REQUESTED'   -- gọi thêm món sau khi đã gọi thanh toán → phiên về OPEN (ADR-003)
    BEGIN
      UPDATE dbo.Sessions SET Status = 'OPEN', PaymentRequestedAt = NULL WHERE SessionId = @SessionId;
      SET @SessionReopened = 1;
    END
  END

  -- 2. Món còn bán? (tồn tại, IsActive, IsAvailable)
  DECLARE @Unavailable NVARCHAR(2000) = (
    SELECT STRING_AGG(CAST(x.MenuItemId AS NVARCHAR(10)), ',')
    FROM (SELECT DISTINCT i.MenuItemId
          FROM @Items i LEFT JOIN dbo.MenuItems m ON m.MenuItemId = i.MenuItemId
          WHERE m.MenuItemId IS NULL OR m.IsActive = 0 OR m.IsAvailable = 0 OR m.DeletedAt IS NOT NULL) x);
  IF @Unavailable IS NOT NULL
  BEGIN ROLLBACK; THROW 50010, @Unavailable, 1; END

  -- 3. Tổng tiền tính từ giá DB (BR-011, BR-012)
  DECLARE @Total DECIMAL(12,0) = (
    SELECT SUM(CAST(i.Quantity AS DECIMAL(12,0)) * m.Price)
    FROM @Items i JOIN dbo.MenuItems m ON m.MenuItemId = i.MenuItemId);

  IF @IsCash = 1 AND (@AmountReceived IS NULL OR @AmountReceived < @Total)
  BEGIN ROLLBACK; THROW 50020, 'INSUFFICIENT_AMOUNT', 1; END

  -- 4. Nhu cầu nguyên liệu = Σ(qty × BOM)
  DECLARE @Need TABLE (IngredientId INT PRIMARY KEY, Qty DECIMAL(18,3) NOT NULL);
  INSERT @Need (IngredientId, Qty)
  SELECT b.IngredientId, SUM(i.Quantity * b.Amount)
  FROM @Items i JOIN dbo.BomItems b ON b.MenuItemId = i.MenuItemId
  GROUP BY b.IngredientId;

  -- 5. Giữ chỗ có điều kiện: UPDATE đọc dòng bằng khóa U rồi mới kiểm điều kiện → hai đơn đồng thời không cùng lấy một phần kho
  DECLARE @NeedCount INT = (SELECT COUNT(*) FROM @Need);
  IF @NeedCount > 0
  BEGIN
    DECLARE @Reserved TABLE (IngredientId INT PRIMARY KEY);
    UPDATE ing
       SET ReservedQty = ing.ReservedQty + n.Qty
    OUTPUT inserted.IngredientId INTO @Reserved (IngredientId)
    FROM dbo.Ingredients ing WITH (UPDLOCK, HOLDLOCK)
    JOIN @Need n ON n.IngredientId = ing.IngredientId
    WHERE ing.StockQty - ing.ReservedQty >= n.Qty;

    IF (SELECT COUNT(*) FROM @Reserved) <> @NeedCount
    BEGIN
      DECLARE @Short NVARCHAR(2000) = (
        SELECT STRING_AGG(CAST(x.MenuItemId AS NVARCHAR(10)), ',')
        FROM (SELECT DISTINCT i.MenuItemId
              FROM @Items i JOIN dbo.BomItems b ON b.MenuItemId = i.MenuItemId
              WHERE b.IngredientId NOT IN (SELECT IngredientId FROM @Reserved)) x);
      ROLLBACK;
      THROW 50002, @Short, 1;
    END
  END

  -- 6. Mã đơn 8 ký tự A-Z/2-9 bỏ O,0,I,1 (32 ký tự → byte % 32 không lệch). Hàm scalar không gọi được CRYPT_GEN_RANDOM nên sinh tại đây.
  DECLARE @Alphabet CHAR(32) = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  DECLARE @Rnd VARBINARY(8) = CRYPT_GEN_RANDOM(8), @Code VARCHAR(8) = '', @k INT = 1;
  WHILE @k <= 8
  BEGIN
    SET @Code = @Code + SUBSTRING(@Alphabet, (CAST(SUBSTRING(@Rnd, @k, 1) AS INT) % 32) + 1, 1);
    SET @k += 1;
  END
  SET @OrderCode = @Code;   -- trùng (rất hiếm) → lỗi unique 2627, app thử lại

  -- 7. Ghi đơn
  INSERT dbo.Orders (OrderCode, SessionId, TableId, Type, Status, PaymentStatus, PaymentMethod, TotalAmount, Note,
                     CreatedBy, AcceptedAt, PaidAt)
  VALUES (@OrderCode, @SessionId, @TableId, @Type,
          CASE WHEN @IsCash = 1 THEN 'PREPARING' ELSE 'PENDING' END,
          CASE WHEN @IsCash = 1 THEN 'PAID' ELSE 'UNPAID' END,
          CASE WHEN @IsCash = 1 THEN 'CASH' END,
          @Total, NULLIF(LTRIM(RTRIM(@Note)), ''), @CreatedBy,
          CASE WHEN @IsCash = 1 THEN SYSUTCDATETIME() END,
          CASE WHEN @IsCash = 1 THEN SYSUTCDATETIME() END);
  SET @OrderId = SCOPE_IDENTITY();

  INSERT dbo.OrderItems (OrderId, MenuItemId, Quantity, UnitPrice, Note)
  SELECT @OrderId, i.MenuItemId, i.Quantity, m.Price, NULLIF(LTRIM(RTRIM(i.Note)), '')
  FROM @Items i JOIN dbo.MenuItems m ON m.MenuItemId = i.MenuItemId;

  INSERT dbo.OrderIngredients (OrderId, IngredientId, Qty)
  SELECT @OrderId, IngredientId, Qty FROM @Need;

  IF @IsCash = 1   -- mang đi: thu tiền ngay tại quầy (D-3, BR-006)
    INSERT dbo.Payments (OrderId, Method, AmountDue, AmountReceived, ReceivedBy)
    VALUES (@OrderId, 'CASH', @Total, @AmountReceived, @CreatedBy);

  COMMIT;
END
