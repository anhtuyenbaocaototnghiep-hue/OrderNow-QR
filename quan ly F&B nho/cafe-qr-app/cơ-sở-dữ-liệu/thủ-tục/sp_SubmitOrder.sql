-- Gửi đơn (dine-in của khách, hoặc nhân viên gọi món giúp tại bàn — F-024) hoặc tạo đơn mang đi đã thu tiền mặt (quầy).
-- BR-001, BR-009, BR-010 (ADR-001: giữ kho khi gửi), BR-011/012, BR-020 + Q-013 (khóa phiên), BR-006 (mang đi).
-- ADR-005: dòng đơn đã tính giá ở service (bộ pricing) truyền qua @Lines (+ @LineOptions); khuyến mãi khóa lúc gửi (D-8);
--   combo = dòng cha + dòng con (BOM chỉ lấy từ dòng SINGLE); tùy chọn món cộng BOM riêng; mang đi ghi đủ breakdown thanh toán.
--   Không có @Lines → chế độ cũ: @Items, giá lấy từ DB (tương thích test/caller cũ).
-- Thứ tự khóa: Sessions → Shifts (S) → Promotions → Ingredients → (insert) Orders → Members.
-- Lỗi: 50002 OUT_OF_STOCK (message = danh sách MenuItemId), 50010 ITEM_UNAVAILABLE (danh sách MenuItemId), 50011 EMPTY_ORDER,
--      50012 INVALID_ORDER, 50020 INSUFFICIENT_AMOUNT, 50031 SESSION_CLOSED, 50034 AMOUNT_CHANGED,
--      50060 PROMO_EXHAUSTED (message = PromotionId), 50070 NO_OPEN_SHIFT, 50080 MEMBER_NOT_FOUND.
CREATE OR ALTER PROCEDURE dbo.sp_SubmitOrder
  @Type             VARCHAR(10),               -- 'DINE_IN' | 'TAKE_AWAY'
  @SessionId        UNIQUEIDENTIFIER = NULL,   -- dine-in
  @CreatedBy        INT = NULL,                -- mang đi: nhân viên tạo đơn và nhận tiền
  @PaymentMethod    VARCHAR(10) = NULL,        -- mang đi: 'CASH' | 'TRANSFER' (ADR-019 F-056); dine-in: NULL (trả sau — ADR-000)
  @AmountReceived   DECIMAL(12,0) = NULL,      -- mang đi: tiền khách đưa
  @Note             NVARCHAR(200) = NULL,
  @Items            dbo.OrderItemInput READONLY,        -- chế độ cũ
  @Lines            dbo.OrderLineInput READONLY,        -- chế độ pricing
  @LineOptions      dbo.OrderLineOptionInput READONLY,
  @OrderPromoDiscount DECIMAL(12,0) = 0,       -- khuyến mãi theo đơn (không gồm khuyến mãi dòng)
  @OrderPromotionId INT = NULL,
  -- Mang đi (thu tiền ngay): chiết khấu tính ở service theo D-7
  @MemberId         INT = NULL,
  @MemberPercent    DECIMAL(5,2) = NULL,
  @MemberDiscount   DECIMAL(12,0) = 0,
  @ManualDiscount   DECIMAL(12,0) = 0,
  @ManualReason     NVARCHAR(200) = NULL,
  @ApprovedBy       INT = NULL,
  @RoundingAdj      DECIMAL(12,0) = 0,
  @ExpectedDue      DECIMAL(12,0) = NULL,      -- số tiền POS đang hiển thị
  @ShiftId          INT = NULL,
  @VoucherDiscount  DECIMAL(12,0) = 0,        -- F-038 voucher / F-039 đổi thưởng (mang đi)
  @RewardDiscount   DECIMAL(12,0) = 0,
  @LoyaltyJson      NVARCHAR(MAX) = NULL,
  @AcceptNow        BIT = 0,                  -- F-024: nhân viên nhập đơn tại bàn → vào thẳng PREPARING (đã tiếp nhận)
  @OrderId          INT OUTPUT,
  @OrderCode        CHAR(8) OUTPUT,
  @SessionReopened  BIT OUTPUT                 -- 1 nếu phiên đang PAYMENT_REQUESTED được đưa về OPEN (gọi thêm món)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  SET @SessionReopened = 0;

  IF @Type NOT IN ('DINE_IN', 'TAKE_AWAY') THROW 50012, 'INVALID_ORDER', 1;
  IF @Type = 'DINE_IN' AND (@SessionId IS NULL OR @PaymentMethod IS NOT NULL) THROW 50012, 'INVALID_ORDER', 1;
  IF @Type = 'TAKE_AWAY' AND (ISNULL(@PaymentMethod, '') NOT IN ('CASH', 'TRANSFER') OR @CreatedBy IS NULL OR @SessionId IS NOT NULL) THROW 50012, 'INVALID_ORDER', 1;
  IF @Type = 'DINE_IN' AND (@MemberId IS NOT NULL OR @MemberDiscount <> 0 OR @ManualDiscount <> 0 OR @RoundingAdj <> 0) THROW 50012, 'INVALID_ORDER', 1;
  IF ISNULL(@AcceptNow, 0) = 1 AND (@Type <> 'DINE_IN' OR @CreatedBy IS NULL) THROW 50012, 'INVALID_ORDER', 1;
  IF ISNULL(@OrderPromoDiscount, -1) < 0 OR ISNULL(@MemberDiscount, -1) < 0 OR ISNULL(@ManualDiscount, -1) < 0 OR ISNULL(@RoundingAdj, -1) < 0
     OR ISNULL(@VoucherDiscount, -1) < 0 OR ISNULL(@RewardDiscount, -1) < 0 OR (@RewardDiscount > 0 AND @MemberId IS NULL)
    THROW 50012, 'INVALID_ORDER', 1;
  IF @MemberDiscount > 0 AND @MemberId IS NULL THROW 50012, 'INVALID_ORDER', 1;
  IF @ManualDiscount > 0 AND NULLIF(LTRIM(RTRIM(@ManualReason)), '') IS NULL THROW 50012, 'INVALID_ORDER', 1;
  IF (@OrderPromoDiscount > 0 AND @OrderPromotionId IS NULL) OR (@OrderPromoDiscount = 0 AND @OrderPromotionId IS NOT NULL) THROW 50012, 'INVALID_ORDER', 1;

  -- 0. Gom dòng về một dạng (@L)
  DECLARE @L TABLE (
    LineNum INT PRIMARY KEY, ParentLineNum INT NULL, MenuItemId INT NOT NULL, Quantity INT NOT NULL, Note NVARCHAR(200) NULL,
    ListPrice DECIMAL(12,0) NULL, UnitPrice DECIMAL(12,0) NULL, PromotionId INT NULL, AllowMemberStack BIT NOT NULL);
  DECLARE @LO TABLE (LineNum INT NOT NULL, OptionId INT NOT NULL, PRIMARY KEY (LineNum, OptionId));

  IF EXISTS (SELECT 1 FROM @Lines)
  BEGIN
    INSERT @L SELECT LineNum, ParentLineNum, MenuItemId, Quantity, Note, ListPrice, UnitPrice, PromotionId, AllowMemberStack FROM @Lines;
    INSERT @LO SELECT LineNum, OptionId FROM @LineOptions;
  END
  ELSE
    INSERT @L (LineNum, ParentLineNum, MenuItemId, Quantity, Note, ListPrice, UnitPrice, PromotionId, AllowMemberStack)
    SELECT ROW_NUMBER() OVER (ORDER BY (SELECT NULL)), NULL, i.MenuItemId, i.Quantity, i.Note, m.Price, m.Price, NULL, 1
    FROM @Items i LEFT JOIN dbo.MenuItems m ON m.MenuItemId = i.MenuItemId;

  IF NOT EXISTS (SELECT 1 FROM @L) THROW 50011, 'EMPTY_ORDER', 1;
  -- Dòng con phải trỏ tới dòng cha có thật; dòng tùy chọn phải thuộc dòng có thật; giá không âm, khuyến mãi không làm tăng giá
  IF EXISTS (SELECT 1 FROM @L c WHERE c.ParentLineNum IS NOT NULL AND NOT EXISTS (SELECT 1 FROM @L p WHERE p.LineNum = c.ParentLineNum AND p.ParentLineNum IS NULL))
     OR EXISTS (SELECT 1 FROM @LO o WHERE NOT EXISTS (SELECT 1 FROM @L l WHERE l.LineNum = o.LineNum))
     OR EXISTS (SELECT 1 FROM @L WHERE Quantity < 1 OR (ParentLineNum IS NULL AND Quantity > 50) OR Quantity > 500
                                     OR (ListPrice IS NOT NULL AND (UnitPrice < 0 OR UnitPrice > ListPrice)))
    THROW 50012, 'INVALID_ORDER', 1;

  -- MenuItemId báo lỗi: dòng con báo theo combo cha
  DECLARE @Report TABLE (LineNum INT PRIMARY KEY, ReportId INT NOT NULL);
  INSERT @Report SELECT l.LineNum, COALESCE(p.MenuItemId, l.MenuItemId) FROM @L l LEFT JOIN @L p ON p.LineNum = l.ParentLineNum;

  DECLARE @TableId INT = NULL, @SessionStatus VARCHAR(20) = NULL;
  DECLARE @IsCash BIT = CASE WHEN @PaymentMethod IN ('CASH', 'TRANSFER') THEN 1 ELSE 0 END;   -- trả ngay (mang đi), tên giữ từ ADR-000

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

  -- 2. Món còn bán? Dòng khách chọn: tồn tại, IsActive, IsAvailable, chưa xóa; dòng con combo: IsAvailable, chưa xóa.
  --    Tùy chọn đã chọn phải còn dùng được.
  DECLARE @Unavailable NVARCHAR(2000) = (
    SELECT STRING_AGG(CAST(x.ReportId AS NVARCHAR(10)), ',')
    FROM (SELECT DISTINCT r.ReportId
          FROM @L l JOIN @Report r ON r.LineNum = l.LineNum
          LEFT JOIN dbo.MenuItems m ON m.MenuItemId = l.MenuItemId
          WHERE m.MenuItemId IS NULL OR m.IsAvailable = 0 OR m.DeletedAt IS NOT NULL OR (l.ParentLineNum IS NULL AND m.IsActive = 0)
             OR l.ListPrice IS NULL
          UNION
          SELECT r.ReportId
          FROM @LO o JOIN @Report r ON r.LineNum = o.LineNum
          LEFT JOIN dbo.ModifierOptions mo ON mo.OptionId = o.OptionId
          LEFT JOIN dbo.ModifierGroups g ON g.GroupId = mo.GroupId
          WHERE mo.OptionId IS NULL OR mo.IsActive = 0 OR mo.DeletedAt IS NOT NULL OR g.DeletedAt IS NOT NULL) x);
  IF @Unavailable IS NOT NULL
  BEGIN ROLLBACK; THROW 50010, @Unavailable, 1; END

  -- Combo: dòng combo phải có dòng con; dòng con phải là món SINGLE (không combo lồng combo — D-9)
  IF EXISTS (SELECT 1 FROM @L c JOIN dbo.MenuItems m ON m.MenuItemId = c.MenuItemId WHERE c.ParentLineNum IS NOT NULL AND m.ItemType <> 'SINGLE')
     OR EXISTS (SELECT 1 FROM @L p JOIN dbo.MenuItems m ON m.MenuItemId = p.MenuItemId
                WHERE p.ParentLineNum IS NULL AND m.ItemType = 'COMBO' AND NOT EXISTS (SELECT 1 FROM @L c WHERE c.ParentLineNum = p.LineNum))
     OR EXISTS (SELECT 1 FROM @L p JOIN @L c ON c.ParentLineNum = p.LineNum JOIN dbo.MenuItems m ON m.MenuItemId = p.MenuItemId WHERE m.ItemType <> 'COMBO')
  BEGIN ROLLBACK; THROW 50012, 'INVALID_ORDER', 1; END

  -- 3. Tổng tiền: niêm yết, sau khuyến mãi dòng, sau khuyến mãi đơn (chỉ dòng khách chọn — dòng con combo giá 0)
  DECLARE @Subtotal DECIMAL(12,0), @AfterLine DECIMAL(12,0);
  SELECT @Subtotal = SUM(CAST(Quantity AS DECIMAL(12,0)) * ListPrice), @AfterLine = SUM(CAST(Quantity AS DECIMAL(12,0)) * UnitPrice)
  FROM @L WHERE ParentLineNum IS NULL;
  IF @OrderPromoDiscount > @AfterLine BEGIN ROLLBACK; THROW 50012, 'INVALID_ORDER', 1; END
  DECLARE @Total DECIMAL(12,0) = @AfterLine - @OrderPromoDiscount;

  DECLARE @AmountDue DECIMAL(12,0) = NULL;
  IF @IsCash = 1
  BEGIN
    SET @AmountDue = @Total - @MemberDiscount - @VoucherDiscount - @RewardDiscount - @ManualDiscount - @RoundingAdj;
    IF @AmountDue < 0 BEGIN ROLLBACK; THROW 50012, 'INVALID_ORDER', 1; END
    IF @ExpectedDue IS NOT NULL AND @ExpectedDue <> @AmountDue BEGIN ROLLBACK; THROW 50034, 'AMOUNT_CHANGED', 1; END
    IF @PaymentMethod = 'TRANSFER' SET @AmountReceived = @AmountDue;   -- chuyển khoản: không có tiền thừa
    IF @AmountReceived IS NULL OR @AmountReceived < @AmountDue BEGIN ROLLBACK; THROW 50020, 'INSUFFICIENT_AMOUNT', 1; END
    -- Ca còn mở (khóa S tới hết transaction → sp_CloseShift chờ lượt thu này xong mới tính tiền ca)
    IF @ShiftId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Shifts WITH (HOLDLOCK) WHERE ShiftId = @ShiftId AND ClosedAt IS NULL)
    BEGIN ROLLBACK; THROW 50070, 'NO_OPEN_SHIFT', 1; END
  END
  ELSE IF @AmountReceived IS NOT NULL OR @ExpectedDue IS NOT NULL OR @ShiftId IS NOT NULL
  BEGIN ROLLBACK; THROW 50012, 'INVALID_ORDER', 1; END

  -- 4. Khuyến mãi còn hiệu lực + giới hạn lượt/ngày quán (đếm theo đơn chưa hủy). Khóa dòng Promotions → hai đơn tranh lượt cuối chạy tuần tự.
  DECLARE @Promos TABLE (PromotionId INT PRIMARY KEY);
  INSERT @Promos SELECT DISTINCT PromotionId FROM @L WHERE PromotionId IS NOT NULL
                 UNION SELECT @OrderPromotionId WHERE @OrderPromotionId IS NOT NULL;
  IF EXISTS (SELECT 1 FROM @Promos)
  BEGIN
    DECLARE @DayStart DATETIME2(0) = DATEADD(HOUR, -7, CAST(CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE) AS DATETIME2(0)));
    DECLARE @Exhausted NVARCHAR(400) = (
      SELECT STRING_AGG(CAST(pr.PromotionId AS NVARCHAR(10)), ',')
      FROM @Promos x
      LEFT JOIN dbo.Promotions pr WITH (UPDLOCK, HOLDLOCK) ON pr.PromotionId = x.PromotionId
      WHERE pr.PromotionId IS NULL OR pr.IsActive = 0 OR pr.DeletedAt IS NOT NULL
         OR (pr.MaxUsesPerDay IS NOT NULL AND pr.MaxUsesPerDay <= (
               SELECT COUNT(DISTINCT u.OrderId) FROM dbo.PromotionUsages u JOIN dbo.Orders o ON o.OrderId = u.OrderId
               WHERE u.PromotionId = pr.PromotionId AND u.UsedAt >= @DayStart AND o.Status <> 'CANCELLED')));
    IF @Exhausted IS NOT NULL BEGIN ROLLBACK; THROW 50060, @Exhausted, 1; END
  END

  -- 5. Nhu cầu nguyên liệu = Σ qty × (BOM món SINGLE + BOM tùy chọn đã chọn)
  DECLARE @NeedRows TABLE (LineNum INT NOT NULL, IngredientId INT NOT NULL, Qty DECIMAL(18,3) NOT NULL);
  INSERT @NeedRows (LineNum, IngredientId, Qty)
  SELECT l.LineNum, b.IngredientId, l.Quantity * b.Amount
  FROM @L l JOIN dbo.MenuItems m ON m.MenuItemId = l.MenuItemId AND m.ItemType = 'SINGLE'
  JOIN dbo.BomItems b ON b.MenuItemId = l.MenuItemId
  UNION ALL
  SELECT l.LineNum, ob.IngredientId, l.Quantity * ob.Amount
  FROM @LO o JOIN @L l ON l.LineNum = o.LineNum JOIN dbo.ModifierOptionBom ob ON ob.OptionId = o.OptionId;

  DECLARE @Need TABLE (IngredientId INT PRIMARY KEY, Qty DECIMAL(18,3) NOT NULL);
  INSERT @Need (IngredientId, Qty) SELECT IngredientId, SUM(Qty) FROM @NeedRows GROUP BY IngredientId;

  -- 6. Giữ chỗ có điều kiện: UPDATE đọc dòng bằng khóa U rồi mới kiểm điều kiện → hai đơn đồng thời không cùng lấy một phần kho
  DECLARE @NeedCount INT = (SELECT COUNT(*) FROM @Need);
  IF @NeedCount > 0
  BEGIN
    DECLARE @Reserved TABLE (IngredientId INT PRIMARY KEY);
    UPDATE ing
       SET ReservedQty = ing.ReservedQty + n.Qty
    OUTPUT inserted.IngredientId INTO @Reserved (IngredientId)
    FROM dbo.Ingredients ing WITH (UPDLOCK, HOLDLOCK)
    JOIN @Need n ON n.IngredientId = ing.IngredientId
    LEFT JOIN dbo.tvf_ExpiredLotQty() ex ON ex.IngredientId = ing.IngredientId   -- F-028: lô hết hạn không bán
    WHERE ing.StockQty - ing.ReservedQty - ISNULL(ex.ExpiredQty, 0) >= n.Qty;

    IF (SELECT COUNT(*) FROM @Reserved) <> @NeedCount
    BEGIN
      DECLARE @Short NVARCHAR(2000) = (
        SELECT STRING_AGG(CAST(x.ReportId AS NVARCHAR(10)), ',')
        FROM (SELECT DISTINCT r.ReportId
              FROM @NeedRows nr JOIN @Report r ON r.LineNum = nr.LineNum
              WHERE nr.IngredientId NOT IN (SELECT IngredientId FROM @Reserved)) x);
      ROLLBACK;
      THROW 50002, @Short, 1;
    END
  END

  -- 7. Mã đơn 8 ký tự A-Z/2-9 bỏ O,0,I,1 (32 ký tự → byte % 32 không lệch). Hàm scalar không gọi được CRYPT_GEN_RANDOM nên sinh tại đây.
  DECLARE @Alphabet CHAR(32) = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  DECLARE @Rnd VARBINARY(8) = CRYPT_GEN_RANDOM(8), @Code VARCHAR(8) = '', @k INT = 1;
  WHILE @k <= 8
  BEGIN
    SET @Code = @Code + SUBSTRING(@Alphabet, (CAST(SUBSTRING(@Rnd, @k, 1) AS INT) % 32) + 1, 1);
    SET @k += 1;
  END
  SET @OrderCode = @Code;   -- trùng (rất hiếm) → lỗi unique 2627, app thử lại

  -- 8. Ghi đơn
  INSERT dbo.Orders (OrderCode, SessionId, TableId, Type, Status, PaymentStatus, PaymentMethod, TotalAmount, SubtotalAmount, PromoDiscount,
                     OrderPromotionId, MemberId, Note, CreatedBy, AcceptedAt, PaidAt)
  VALUES (@OrderCode, @SessionId, @TableId, @Type,
          CASE WHEN @IsCash = 1 OR @AcceptNow = 1 THEN 'PREPARING' ELSE 'PENDING' END,
          CASE WHEN @IsCash = 1 THEN 'PAID' ELSE 'UNPAID' END,
          CASE WHEN @IsCash = 1 THEN @PaymentMethod END,
          @Total, @Subtotal, @Subtotal - @Total, @OrderPromotionId, @MemberId,
          NULLIF(LTRIM(RTRIM(@Note)), ''), @CreatedBy,
          CASE WHEN @IsCash = 1 OR @AcceptNow = 1 THEN SYSUTCDATETIME() END,
          CASE WHEN @IsCash = 1 THEN SYSUTCDATETIME() END);
  SET @OrderId = SCOPE_IDENTITY();

  -- Dòng khách chọn trước (theo LineNum), rồi dòng con combo. INSERT…SELECT…ORDER BY bảo đảm thứ tự cấp identity → ghép LineNum ↔ OrderItemId.
  DECLARE @Ids TABLE (OrderItemId INT PRIMARY KEY);
  DECLARE @Map TABLE (LineNum INT PRIMARY KEY, OrderItemId INT NOT NULL);

  INSERT dbo.OrderItems (OrderId, MenuItemId, Quantity, UnitPrice, ListPrice, LineDiscount, PromotionId, AllowMemberStack, Note)
  OUTPUT inserted.OrderItemId INTO @Ids (OrderItemId)
  SELECT @OrderId, MenuItemId, Quantity, UnitPrice, ListPrice, (ListPrice - UnitPrice) * Quantity, PromotionId, AllowMemberStack, NULLIF(LTRIM(RTRIM(Note)), '')
  FROM @L WHERE ParentLineNum IS NULL ORDER BY LineNum;
  INSERT @Map (LineNum, OrderItemId)
  SELECT l.LineNum, i.OrderItemId
  FROM (SELECT LineNum, ROW_NUMBER() OVER (ORDER BY LineNum) AS rn FROM @L WHERE ParentLineNum IS NULL) l
  JOIN (SELECT OrderItemId, ROW_NUMBER() OVER (ORDER BY OrderItemId) AS rn FROM @Ids) i ON i.rn = l.rn;

  IF EXISTS (SELECT 1 FROM @L WHERE ParentLineNum IS NOT NULL)
  BEGIN
    DELETE @Ids;
    INSERT dbo.OrderItems (OrderId, MenuItemId, Quantity, UnitPrice, ListPrice, LineDiscount, PromotionId, AllowMemberStack, Note, ParentOrderItemId)
    OUTPUT inserted.OrderItemId INTO @Ids (OrderItemId)
    SELECT @OrderId, c.MenuItemId, c.Quantity, 0, 0, 0, NULL, c.AllowMemberStack, NULLIF(LTRIM(RTRIM(c.Note)), ''), pm.OrderItemId
    FROM @L c JOIN @Map pm ON pm.LineNum = c.ParentLineNum
    WHERE c.ParentLineNum IS NOT NULL ORDER BY c.LineNum;
    INSERT @Map (LineNum, OrderItemId)
    SELECT l.LineNum, i.OrderItemId
    FROM (SELECT LineNum, ROW_NUMBER() OVER (ORDER BY LineNum) AS rn FROM @L WHERE ParentLineNum IS NOT NULL) l
    JOIN (SELECT OrderItemId, ROW_NUMBER() OVER (ORDER BY OrderItemId) AS rn FROM @Ids) i ON i.rn = l.rn;
  END

  INSERT dbo.OrderItemModifiers (OrderItemId, OptionId, OptionName, PriceDelta)
  SELECT m.OrderItemId, o.OptionId, mo.Name, mo.PriceDelta
  FROM @LO o JOIN @Map m ON m.LineNum = o.LineNum JOIN dbo.ModifierOptions mo ON mo.OptionId = o.OptionId;

  INSERT dbo.OrderIngredients (OrderId, IngredientId, Qty)
  SELECT @OrderId, IngredientId, Qty FROM @Need;

  -- 9. Lượt khuyến mãi (đếm MaxUsesPerDay)
  INSERT dbo.PromotionUsages (PromotionId, OrderId, OrderItemId, DiscountAmount)
  SELECT l.PromotionId, @OrderId, m.OrderItemId, (l.ListPrice - l.UnitPrice) * l.Quantity
  FROM @L l JOIN @Map m ON m.LineNum = l.LineNum
  WHERE l.PromotionId IS NOT NULL AND l.ParentLineNum IS NULL;
  IF @OrderPromotionId IS NOT NULL
    INSERT dbo.PromotionUsages (PromotionId, OrderId, OrderItemId, DiscountAmount) VALUES (@OrderPromotionId, @OrderId, NULL, @OrderPromoDiscount);

  -- 10. Mang đi: thu tiền ngay tại quầy (D-3, BR-006) + cập nhật hội viên trong cùng transaction
  IF @IsCash = 1
  BEGIN
    DECLARE @PaymentId INT;
    INSERT dbo.Payments (OrderId, Method, AmountDue, AmountReceived, ReceivedBy, MemberId, MemberPercent, SubtotalAmount, PromoDiscount,
                         MemberDiscount, ManualDiscount, ManualReason, ApprovedBy, RoundingAdj, ShiftId, VoucherDiscount, RewardDiscount, VoucherId)
    VALUES (@OrderId, @PaymentMethod, @AmountDue, @AmountReceived, @CreatedBy, @MemberId, @MemberPercent, @Subtotal, @Subtotal - @Total,
            @MemberDiscount, @ManualDiscount, NULLIF(LTRIM(RTRIM(@ManualReason)), ''), @ApprovedBy, @RoundingAdj, @ShiftId, @VoucherDiscount, @RewardDiscount,
          TRY_CAST(JSON_VALUE(@LoyaltyJson, '$.voucherId') AS INT));
    SET @PaymentId = SCOPE_IDENTITY();
    UPDATE dbo.OrderItems SET PaidAt = SYSUTCDATETIME(), PaymentId = @PaymentId WHERE OrderId = @OrderId;
    IF @MemberId IS NOT NULL
      EXEC dbo.sp_ApplyMemberPayment @MemberId = @MemberId, @PaymentId = @PaymentId, @Spent = @AmountDue, @Discount = @MemberDiscount;
    IF @MemberId IS NOT NULL OR @LoyaltyJson IS NOT NULL
      EXEC dbo.sp_ApplyLoyalty @PaymentId = @PaymentId, @MemberId = @MemberId, @LoyaltyJson = @LoyaltyJson;
  END

  COMMIT;
END
