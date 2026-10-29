# Data model và stored procedures

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §11.1–11.2 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

> **Cập nhật 14/10/2026 — đã triển khai.** Nguồn sự thật của schema/SP là `cơ-sở-dữ-liệu/chuyển-đổi/0001_init.sql` và `cơ-sở-dữ-liệu/thủ-tục/*.sql` (theo ADR-001…003). Phần DDL/SP dưới đây là **bản đề xuất ban đầu** giữ lại để đối chiếu; khác biệt khi triển khai ghi ở mục "Triển khai thực tế" cuối file.

> **Cập nhật 18/10/2026:** schema giai đoạn 4–8 (migration `0015`…`0032`), SP mới, mã lỗi và bất biến mới nằm ở mục "Mở rộng giai đoạn 4–8 (ADR-006)" cuối file.

> **Cập nhật 18/10/2026 (ADR-007):** migration `0033_sua_xoa_mon.sql`, SP sửa / xóa món / hủy bàn, mã lỗi `50181`…`50186` và bất biến mới nằm ở mục "Sửa / xóa món, hủy bàn (FEATURE-046, ADR-007)" cuối file. Migration mới nhất: `0033`; số kế tiếp: **`0034`**.
>
> **Cập nhật 21/10/2026 (ADR-009):** migration `0034_sua_huy_phieu_kho.sql`, SP `sp_ReviseStockReceipt` / `sp_VoidStocktake`, mã lỗi `50190`…`50199` và bất biến mới — mục "Sửa / hủy phiếu kho" cuối file.
>
> **Cập nhật 21/10/2026 (ADR-010):** migration `0036_chuyen_ban.sql` (`SessionTableMoves`), SP `sp_MoveSession`, mã lỗi `50200`…`50204`, bất biến `ORDER_TABLE_MISMATCH` — mục "Chuyển bàn" cuối file; `0037_huy_khoan_so_quy.sql`, SP `sp_VoidCashTxn`, mã lỗi `50142`…`50145`, bất biến `CASH_REPLACE_LINK` — mục "Hủy / sửa khoản sổ quỹ"; `0038_danh_gia.sql` (`Reviews`, `ReviewItems`) — mục "Đánh giá món".

> **Cập nhật 20/10/2026 (TASK-057, bước 10):** sơ đồ 11.1 chỉ vẽ 13 bảng của `0001_init.sql`. ERD đầy đủ 70 bảng (thêm 57 bảng của `0003`…`0033`) và các quan hệ `0001` còn thiếu nằm ở mục [ERD mở rộng (giai đoạn 2–F-047)](#erd-mo-rong) cuối file.

## 11.1. Data model (data-model) — PROPOSED, SQL Server

Sơ đồ quan hệ:

```mermaid
erDiagram
  Users ||--o{ Orders : "CreatedBy/CompletedBy"
  Tables ||--o{ Sessions : has
  Sessions ||--o{ SessionClients : has
  Sessions ||--o{ Orders : contains
  Orders ||--|{ OrderItems : has
  Orders ||--o{ Payments : "take-away"
  Sessions ||--o{ Payments : "dine-in"
  Orders ||--o{ InventoryTransactions : causes
  Categories ||--o{ MenuItems : groups
  MenuItems ||--o{ OrderItems : "snapshot price"
  MenuItems ||--o{ BomItems : recipe
  Ingredients ||--o{ BomItems : used_in
  Ingredients ||--o{ InventoryTransactions : logs
```

> Sơ đồ trên là bản ban đầu (chỉ bảng của `0001`). Toàn bộ bảng và khóa ngoại hiện tại: [ERD mở rộng (giai đoạn 2–F-047)](#erd-mo-rong).

DDL cốt lõi (chạy được trên SQL Server 2019+; `ReservedQty` chỉ cần nếu Q-001 = A):

```sql
CREATE TABLE Users (
  UserId        INT IDENTITY PRIMARY KEY,
  Username      NVARCHAR(50)  NOT NULL,
  PasswordHash  NVARCHAR(255) NOT NULL,
  FullName      NVARCHAR(100) NOT NULL,
  Role          VARCHAR(10)   NOT NULL CHECK (Role IN ('STAFF','ADMIN')),
  IsActive      BIT           NOT NULL DEFAULT 1,
  CreatedAt     DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE UNIQUE INDEX UX_Users_Username ON Users (Username);  -- collation DB mặc định CI → không phân biệt hoa/thường (BR-004)

CREATE TABLE Tables (
  TableId   INT IDENTITY PRIMARY KEY,
  Code      NVARCHAR(10) NOT NULL UNIQUE,
  Name      NVARCHAR(50) NOT NULL,
  QrToken   CHAR(32)     NOT NULL UNIQUE,
  IsActive  BIT          NOT NULL DEFAULT 1
);

CREATE TABLE Sessions (
  SessionId  UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  TableId    INT NOT NULL REFERENCES Tables(TableId),
  Status     VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (Status IN ('OPEN','PAYMENT_REQUESTED','CLOSED')),  -- D-2
  OpenedAt   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  PaymentRequestedAt DATETIME2(0) NULL,                       -- lần gọi thanh toán gần nhất
  ClosedAt   DATETIME2(0) NULL,
  ClosedBy   INT NULL REFERENCES Users(UserId)
);
CREATE INDEX IX_Sessions_Table_Status ON Sessions (TableId, Status);

CREATE TABLE SessionClients (
  SessionId   UNIQUEIDENTIFIER NOT NULL REFERENCES Sessions(SessionId),
  ClientToken CHAR(32) NOT NULL,
  JoinedAt    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY (SessionId, ClientToken)
);

CREATE TABLE Categories (
  CategoryId INT IDENTITY PRIMARY KEY,
  Name       NVARCHAR(50) NOT NULL,
  SortOrder  INT NOT NULL DEFAULT 0
);

CREATE TABLE MenuItems (
  MenuItemId  INT IDENTITY PRIMARY KEY,
  CategoryId  INT NOT NULL REFERENCES Categories(CategoryId),
  Name        NVARCHAR(100) NOT NULL,
  Price       DECIMAL(12,0) NOT NULL CHECK (Price >= 0),      -- VND nguyên
  ImageUrl    NVARCHAR(500) NULL,
  IsAvailable BIT NOT NULL DEFAULT 1,                           -- "hết món" tạm thời
  IsActive    BIT NOT NULL DEFAULT 1                            -- ẩn khỏi menu
);

CREATE TABLE Ingredients (
  IngredientId      INT IDENTITY PRIMARY KEY,
  Name              NVARCHAR(100) NOT NULL UNIQUE,
  Unit              NVARCHAR(10)  NOT NULL,                     -- ml, g, cai...
  StockQty          DECIMAL(18,3) NOT NULL DEFAULT 0,
  ReservedQty       DECIMAL(18,3) NOT NULL DEFAULT 0,           -- chỉ dùng nếu Q-001 = A
  LowStockThreshold DECIMAL(18,3) NOT NULL DEFAULT 0,
  CONSTRAINT CK_Ingredients_Stock    CHECK (StockQty >= 0),     -- lưới an toàn cuối cùng cho BR-001
  CONSTRAINT CK_Ingredients_Reserved CHECK (ReservedQty >= 0 AND ReservedQty <= StockQty)
);

CREATE TABLE BomItems (
  MenuItemId   INT NOT NULL REFERENCES MenuItems(MenuItemId),
  IngredientId INT NOT NULL REFERENCES Ingredients(IngredientId),
  Amount       DECIMAL(18,3) NOT NULL CHECK (Amount > 0),       -- BR-003
  PRIMARY KEY (MenuItemId, IngredientId)
);

CREATE TABLE Orders (
  OrderId        INT IDENTITY PRIMARY KEY,
  OrderCode      CHAR(8) NOT NULL UNIQUE,                       -- dùng trong nội dung chuyển khoản, ví dụ 'A7K3M2QX'
  SessionId      UNIQUEIDENTIFIER NULL REFERENCES Sessions(SessionId),
  TableId        INT NULL REFERENCES Tables(TableId),
  Type           VARCHAR(10) NOT NULL CHECK (Type IN ('DINE_IN','TAKE_AWAY')),
  Status         VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                   CHECK (Status IN ('PENDING','PREPARING','COMPLETED','CANCELLED')),
  PaymentStatus  VARCHAR(6)  NOT NULL DEFAULT 'UNPAID' CHECK (PaymentStatus IN ('UNPAID','PAID')),
  PaymentMethod  VARCHAR(10) NULL CHECK (PaymentMethod IN ('CASH')),             -- mở rộng 'TRANSFER' sau (D-1)
  TotalAmount    DECIMAL(12,0) NOT NULL,
  Note           NVARCHAR(200) NULL,
  CreatedBy      INT NULL REFERENCES Users(UserId),             -- NULL = khách
  CreatedAt      DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  PaidAt         DATETIME2(0) NULL,
  CompletedAt    DATETIME2(0) NULL,
  CompletedBy    INT NULL REFERENCES Users(UserId),
  CancelledAt    DATETIME2(0) NULL,
  RowVer         ROWVERSION,
  CONSTRAINT CK_Orders_DineInHasSession CHECK (Type = 'TAKE_AWAY' OR SessionId IS NOT NULL)
);
CREATE INDEX IX_Orders_Status_CreatedAt ON Orders (Status, CreatedAt);
CREATE INDEX IX_Orders_Session ON Orders (SessionId);
CREATE INDEX IX_Orders_PaidAt ON Orders (PaidAt) WHERE PaymentStatus = 'PAID';   -- báo cáo

CREATE TABLE OrderItems (
  OrderItemId INT IDENTITY PRIMARY KEY,
  OrderId     INT NOT NULL REFERENCES Orders(OrderId),
  MenuItemId  INT NOT NULL REFERENCES MenuItems(MenuItemId),
  Quantity    INT NOT NULL CHECK (Quantity BETWEEN 1 AND 50),  -- BR-015
  UnitPrice   DECIMAL(12,0) NOT NULL,                          -- snapshot giá (BR-011)
  Note        NVARCHAR(200) NULL
);
CREATE INDEX IX_OrderItems_Order ON OrderItems (OrderId);

CREATE TABLE Payments (                                        -- D-1: chỉ tiền mặt; một dòng cho một phiên (dine-in) HOẶC một đơn (mang đi)
  PaymentId      INT IDENTITY PRIMARY KEY,
  SessionId      UNIQUEIDENTIFIER NULL REFERENCES Sessions(SessionId),
  OrderId        INT NULL REFERENCES Orders(OrderId),
  Method         VARCHAR(10) NOT NULL DEFAULT 'CASH' CHECK (Method IN ('CASH')),   -- mở rộng 'TRANSFER' sau
  AmountDue      DECIMAL(12,0) NOT NULL,
  AmountReceived DECIMAL(12,0) NOT NULL,
  ChangeGiven    AS (AmountReceived - AmountDue) PERSISTED,
  ReceivedBy     INT NOT NULL REFERENCES Users(UserId),        -- BR-007: luôn là nhân viên
  PaidAt         DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_Payments_Target   CHECK ((SessionId IS NOT NULL AND OrderId IS NULL) OR (SessionId IS NULL AND OrderId IS NOT NULL)),
  CONSTRAINT CK_Payments_Received CHECK (AmountReceived >= AmountDue)
);
CREATE UNIQUE INDEX UX_Payments_Session ON Payments (SessionId) WHERE SessionId IS NOT NULL;  -- BR-019: một phiên thu một lần
CREATE UNIQUE INDEX UX_Payments_Order   ON Payments (OrderId)   WHERE OrderId   IS NOT NULL;  -- mang đi thu một lần
CREATE INDEX IX_Payments_PaidAt ON Payments (PaidAt);                                         -- đối soát ca

CREATE TABLE InventoryTransactions (
  TxnId        BIGINT IDENTITY PRIMARY KEY,
  IngredientId INT NOT NULL REFERENCES Ingredients(IngredientId),
  OrderId      INT NULL REFERENCES Orders(OrderId),
  Type         VARCHAR(10) NOT NULL CHECK (Type IN ('DEDUCT','ADJUST','IMPORT')),
  Delta        DECIMAL(18,3) NOT NULL,   -- âm khi trừ
  BalanceAfter DECIMAL(18,3) NOT NULL,
  Reason       NVARCHAR(200) NULL,
  CreatedBy    INT NULL REFERENCES Users(UserId),
  CreatedAt    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_InvTxn_Ingredient ON InventoryTransactions (IngredientId, CreatedAt);
CREATE UNIQUE INDEX UX_InvTxn_Order_Ingredient ON InventoryTransactions (OrderId, IngredientId)
  WHERE Type = 'DEDUCT';                 -- lưới an toàn cho BR-002: không trừ 2 lần cùng đơn
```

Ghi chú thiết kế:
- Mọi `DATETIME2` lưu **UTC**; hiển thị theo `Asia/Ho_Chi_Minh` ở client; báo cáo theo ngày quy đổi múi giờ quán.
- `OrderCode` 8 ký tự chữ-số không nhầm lẫn (bỏ O/0, I/1) để ghi vào nội dung chuyển khoản.
- Không xóa cứng `Users`, `MenuItems`, `Ingredients` (dùng `IsActive`) vì có FK từ lịch sử.
- Index chỉ thêm theo truy vấn đã biết (dashboard theo trạng thái; báo cáo theo `PaidAt`; đơn theo phiên). Không thêm index hàng loạt.

## 11.2. Stored procedures giữ invariant kho — PROPOSED (phương án Q-001 = A)

Nguyên tắc chống race condition trên SQL Server: trong **một transaction**, **khóa các dòng `Ingredients` liên quan bằng `UPDLOCK, HOLDLOCK`** (theo thứ tự `IngredientId` để tránh deadlock), kiểm tra, rồi cập nhật. `CHECK` constraint là lưới an toàn cuối: nếu logic sai, DB vẫn ném lỗi thay vì âm kho.

```sql
-- Kiểu bảng truyền danh sách món từ app
CREATE TYPE dbo.OrderItemInput AS TABLE (
  MenuItemId INT NOT NULL, Quantity INT NOT NULL, Note NVARCHAR(200) NULL
);
GO

CREATE OR ALTER PROCEDURE dbo.sp_SubmitOrder
  @Type         VARCHAR(10),            -- 'DINE_IN' | 'TAKE_AWAY'
  @SessionId    UNIQUEIDENTIFIER = NULL,
  @TableId      INT = NULL,
  @CreatedBy    INT = NULL,
  @PaymentMethod VARCHAR(10) = NULL,    -- mang đi: 'CASH' → PAID ngay (D-3); dine-in: NULL
  @AmountReceived DECIMAL(12,0) = NULL, -- mang đi: tiền khách đưa (BR-006)
  @Items        dbo.OrderItemInput READONLY,
  @OrderId      INT OUTPUT,
  @OrderCode    CHAR(8) OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  -- 1. Món còn bán?
  IF EXISTS (SELECT 1 FROM @Items i JOIN MenuItems m ON m.MenuItemId = i.MenuItemId
             WHERE m.IsActive = 0 OR m.IsAvailable = 0)
  BEGIN ROLLBACK; THROW 50010, 'ITEM_UNAVAILABLE', 1; END

  -- 2. Nhu cầu nguyên liệu
  DECLARE @Need TABLE (IngredientId INT PRIMARY KEY, Qty DECIMAL(18,3));
  INSERT @Need SELECT b.IngredientId, SUM(i.Quantity * b.Amount)
  FROM @Items i JOIN BomItems b ON b.MenuItemId = i.MenuItemId
  GROUP BY b.IngredientId;

  -- 3. Khóa và kiểm khả dụng (StockQty - ReservedQty)
  DECLARE @Short NVARCHAR(MAX) = (
    SELECT STRING_AGG(CAST(ing.IngredientId AS NVARCHAR(10)), ',')
    FROM Ingredients ing WITH (UPDLOCK, HOLDLOCK)
    JOIN @Need n ON n.IngredientId = ing.IngredientId
    WHERE ing.StockQty - ing.ReservedQty < n.Qty);
  IF @Short IS NOT NULL
  BEGIN ROLLBACK; THROW 50002, @Short, 1; END   -- app map IngredientId → tên món thiếu (OUT_OF_STOCK)

  -- 4. Giữ chỗ
  UPDATE ing SET ReservedQty = ing.ReservedQty + n.Qty
  FROM Ingredients ing JOIN @Need n ON n.IngredientId = ing.IngredientId;

  -- 5. Ghi đơn
  SET @OrderCode = dbo.fn_NewOrderCode();   -- hàm cần tạo ở TASK-003: 8 ký tự A-Z/2-9 (bỏ O,0,I,1); app retry nếu trùng (hiếm)
  INSERT Orders (OrderCode, SessionId, TableId, Type, TotalAmount, CreatedBy, PaymentMethod,
                 PaymentStatus, Status, PaidAt)
  SELECT @OrderCode, @SessionId, @TableId, @Type,
         SUM(i.Quantity * m.Price), @CreatedBy, @PaymentMethod,
         CASE WHEN @PaymentMethod = 'CASH' THEN 'PAID' ELSE 'UNPAID' END,
         CASE WHEN @PaymentMethod = 'CASH' THEN 'PREPARING' ELSE 'PENDING' END,
         CASE WHEN @PaymentMethod = 'CASH' THEN SYSUTCDATETIME() END
  FROM @Items i JOIN MenuItems m ON m.MenuItemId = i.MenuItemId;
  SET @OrderId = SCOPE_IDENTITY();

  INSERT OrderItems (OrderId, MenuItemId, Quantity, UnitPrice, Note)
  SELECT @OrderId, i.MenuItemId, i.Quantity, m.Price, i.Note
  FROM @Items i JOIN MenuItems m ON m.MenuItemId = i.MenuItemId;

  IF @PaymentMethod = 'CASH'                     -- mang đi: thu tiền ngay tại quầy
  BEGIN
    IF @AmountReceived IS NULL OR @AmountReceived < (SELECT TotalAmount FROM Orders WHERE OrderId = @OrderId)
    BEGIN ROLLBACK; THROW 50020, 'INSUFFICIENT_AMOUNT', 1; END
    INSERT Payments (OrderId, Method, AmountDue, AmountReceived, ReceivedBy)
    SELECT @OrderId, 'CASH', TotalAmount, @AmountReceived, @CreatedBy FROM Orders WHERE OrderId = @OrderId;
  END

  COMMIT;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_RequestPayment      -- D-2: khách bấm Gọi thanh toán
  @SessionId UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM Orders WHERE SessionId = @SessionId AND Status <> 'CANCELLED')
    THROW 50030, 'NO_ORDERS', 1;                                        -- BR-018
  UPDATE Sessions SET Status = 'PAYMENT_REQUESTED', PaymentRequestedAt = SYSUTCDATETIME()
  WHERE SessionId = @SessionId AND Status IN ('OPEN','PAYMENT_REQUESTED');  -- idempotent
  IF @@ROWCOUNT = 0 THROW 50031, 'SESSION_CLOSED', 1;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_SettleSession       -- D-2: nhân viên bấm "Đã thu tiền"
  @SessionId UNIQUEIDENTIFIER, @AmountReceived DECIMAL(12,0), @UserId INT,
  @PaymentId INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  -- 1. Chỉ một client thắng (BR-019)
  UPDATE Sessions SET Status = 'CLOSED', ClosedAt = SYSUTCDATETIME(), ClosedBy = @UserId
  WHERE SessionId = @SessionId AND Status IN ('OPEN','PAYMENT_REQUESTED');
  IF @@ROWCOUNT = 0 BEGIN ROLLBACK; THROW 50032, 'ALREADY_SETTLED', 1; END

  -- 2. Không còn đơn chưa tiếp nhận
  IF EXISTS (SELECT 1 FROM Orders WITH (UPDLOCK, HOLDLOCK) WHERE SessionId = @SessionId AND Status = 'PENDING')
  BEGIN ROLLBACK; THROW 50033, 'HAS_PENDING_ORDERS', 1; END

  -- 3. Tổng phải thu = mọi đơn không hủy
  DECLARE @Due DECIMAL(12,0) = (SELECT ISNULL(SUM(TotalAmount),0) FROM Orders WHERE SessionId = @SessionId AND Status <> 'CANCELLED');
  IF @Due = 0 BEGIN ROLLBACK; THROW 50030, 'NO_ORDERS', 1; END          -- dùng sp_CloseEmptySession thay thế
  IF @AmountReceived < @Due BEGIN ROLLBACK; THROW 50020, 'INSUFFICIENT_AMOUNT', 1; END

  -- 4. Ghi nhận
  UPDATE Orders SET PaymentStatus = 'PAID', PaymentMethod = 'CASH', PaidAt = SYSUTCDATETIME()
  WHERE SessionId = @SessionId AND Status <> 'CANCELLED' AND PaymentStatus = 'UNPAID';
  INSERT Payments (SessionId, Method, AmountDue, AmountReceived, ReceivedBy)
  VALUES (@SessionId, 'CASH', @Due, @AmountReceived, @UserId);
  SET @PaymentId = SCOPE_IDENTITY();

  COMMIT;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_CompleteOrder
  @OrderId INT, @UserId INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;

  -- 1. Đổi trạng thái có điều kiện: chỉ một client thắng (BR-002, BR-013)
  UPDATE Orders SET Status = 'COMPLETED', CompletedAt = SYSUTCDATETIME(), CompletedBy = @UserId
  WHERE OrderId = @OrderId AND Status = 'PREPARING';
  IF @@ROWCOUNT = 0
  BEGIN
    ROLLBACK;
    IF EXISTS (SELECT 1 FROM Orders WHERE OrderId = @OrderId AND Status = 'COMPLETED')
      THROW 50001, 'ALREADY_PROCESSED', 1;
    THROW 50003, 'INVALID_STATE', 1;
  END

  -- 2. Nhu cầu
  DECLARE @Need TABLE (IngredientId INT PRIMARY KEY, Qty DECIMAL(18,3));
  INSERT @Need SELECT b.IngredientId, SUM(oi.Quantity * b.Amount)
  FROM OrderItems oi JOIN BomItems b ON b.MenuItemId = oi.MenuItemId
  WHERE oi.OrderId = @OrderId GROUP BY b.IngredientId;

  -- 3. Khóa, kiểm (BR-001) — với phương án A điều kiện này luôn đúng trừ khi kho bị điều chỉnh tay
  IF EXISTS (SELECT 1 FROM Ingredients ing WITH (UPDLOCK, HOLDLOCK)
             JOIN @Need n ON n.IngredientId = ing.IngredientId WHERE ing.StockQty < n.Qty)
  BEGIN ROLLBACK; THROW 50002, 'OUT_OF_STOCK', 1; END

  -- 4. Trừ thật + trả giữ chỗ
  UPDATE ing SET StockQty = ing.StockQty - n.Qty, ReservedQty = ing.ReservedQty - n.Qty
  FROM Ingredients ing JOIN @Need n ON n.IngredientId = ing.IngredientId;

  -- 5. Nhật ký (unique index chặn trừ 2 lần)
  INSERT InventoryTransactions (IngredientId, OrderId, Type, Delta, BalanceAfter, CreatedBy)
  SELECT n.IngredientId, @OrderId, 'DEDUCT', -n.Qty, ing.StockQty, @UserId
  FROM @Need n JOIN Ingredients ing ON ing.IngredientId = n.IngredientId;

  COMMIT;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_CancelOrder @OrderId INT, @UserId INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;
  UPDATE Orders SET Status = 'CANCELLED', CancelledAt = SYSUTCDATETIME()
  WHERE OrderId = @OrderId AND Status = 'PENDING';
  IF @@ROWCOUNT = 0 BEGIN ROLLBACK; THROW 50003, 'INVALID_STATE', 1; END

  UPDATE ing SET ReservedQty = ing.ReservedQty - n.Qty
  FROM Ingredients ing JOIN (
    SELECT b.IngredientId, SUM(oi.Quantity * b.Amount) Qty
    FROM OrderItems oi JOIN BomItems b ON b.MenuItemId = oi.MenuItemId
    WHERE oi.OrderId = @OrderId GROUP BY b.IngredientId) n ON n.IngredientId = ing.IngredientId;
  COMMIT;
END
GO
```

Nếu nhóm chọn **Q-001 = B** (không giữ): bỏ bước 3–4 trong `sp_SubmitOrder` (chỉ kiểm `StockQty ≥ cần`), bỏ `ReservedQty` ở mọi nơi; `sp_CompleteOrder` giữ nguyên và sẽ là nơi duy nhất từ chối. Nếu chọn **C** (trừ ngay khi gửi): chuyển bước 3–5 của `sp_CompleteOrder` sang `sp_SubmitOrder`; `sp_CancelOrder` phải **cộng lại** kho.

Ứng dụng xử lý lỗi SP: `50001 → 409 ALREADY_PROCESSED`, `50002 → 409 OUT_OF_STOCK` (map ID nguyên liệu → tên món bị ảnh hưởng), `50003 → 409 INVALID_STATE`, `50010 → 409 ITEM_UNAVAILABLE`, `50020 → 400 INSUFFICIENT_AMOUNT`, `50030 → 409 NO_ORDERS`, `50031 → 409 SESSION_CLOSED`, `50032 → 409 ALREADY_SETTLED`, `50033 → 409 HAS_PENDING_ORDERS`, deadlock `1205` → retry tối đa 3 lần với backoff ngắn. Tiếp nhận đơn (`PENDING → PREPARING`) và đóng bàn trống không chạm kho nên có thể là `UPDATE … WHERE Status = …` có điều kiện trong service, không cần SP.

## Ghi chú đối chiếu khi tách docs (13/10/2026)

Phần DDL/SP ở trên được giữ **nguyên văn** từ tài liệu nguồn (PROPOSED). Các điểm dưới đây cần xử lý khi viết migration/SP thật ở TASK-003/TASK-004. Agent không tự sửa phần thiết kế khi nhóm chưa chốt.

**Trạng thái 14/10/2026:** cả 7 điểm đã xử lý trong `cơ-sở-dữ-liệu/` — #1 comment đã sửa; #2 `sp_CloseEmptySession` đã viết (Q-018); #3 sinh mã bằng `CRYPT_GEN_RANDOM` trong thân `sp_SubmitOrder`; #4 khóa `Sessions` (Q-013); #5 kiểm `MenuItemId` không tồn tại → 50010; #6 đủ 7 SP; #7 DB tạo với `Vietnamese_CI_AS`.

| # | Điểm | Đề xuất | Theo dõi |
| --- | --- | --- | --- |
| 1 | Comment của `Orders.OrderCode` và dòng "Ghi chú thiết kế" vẫn ghi "dùng trong nội dung chuyển khoản". Ý này có từ thời VietQR; theo ADR-000 (D-1) không còn chuyển khoản | Giữ `OrderCode` làm mã ngắn in trên bill/thẻ đơn POS và sửa lại comment khi viết `0001_init.sql` | TASK-003 |
| 2 | Comment trong `sp_SettleSession` trỏ tới `sp_CloseEmptySession`, nhưng SP này không được định nghĩa ở đâu (đoạn cuối mục SP nói đóng bàn trống là `UPDATE` có điều kiện trong service) | Xem Q-018 | Q-018, TASK-015 |
| 3 | `dbo.fn_NewOrderCode()`: hàm scalar của SQL Server **không** được gọi `NEWID()`/`RAND()` (toán tử có side-effect) | Sinh mã ngay trong thân SP (ví dụ từ `CRYPT_GEN_RANDOM`), hoặc dùng view trung gian `SELECT NEWID()`, hoặc để app sinh rồi truyền vào. Chọn một cách ở TASK-004, giữ nguyên việc retry khi trùng | TASK-004 |
| 4 | `sp_SubmitOrder` (dine-in) không khóa/kiểm `Sessions` trong transaction, nên đơn có thể rơi vào phiên vừa `CLOSED` | Xem Q-013 | Q-013, TASK-004 |
| 5 | `sp_SubmitOrder` dùng `JOIN MenuItems`, nên dòng có `MenuItemId` không tồn tại sẽ **bị bỏ qua âm thầm** thay vì bị từ chối | Ngoài DTO validation, thêm kiểm tra trong SP: `LEFT JOIN … WHERE m.MenuItemId IS NULL` → `THROW 50010` (đây là chi tiết kỹ thuật nhỏ, đảo ngược được) | TASK-004 |
| 6 | Thư mục `cơ-sở-dữ-liệu/thủ-tục/` theo cây repo của tài liệu nguồn chỉ liệt kê 3 SP | Danh sách đầy đủ: `sp_SubmitOrder`, `sp_CompleteOrder`, `sp_CancelOrder`, `sp_RequestPayment`, `sp_SettleSession` (cộng thêm hàm/view sinh mã đơn nếu có) | TASK-004, TASK-015 |
| 7 | BR-004 (username không phân biệt hoa/thường) phụ thuộc vào collation **CI**. SQL Server trên máy dev đã kiểm có collation `SQL_Latin1_General_CP1_CI_AS` | Nên chỉ định collation CI rõ ràng khi tạo DB/cột `Username` thay vì dựa vào mặc định của server | TASK-003 |

**Bảng mã lỗi SP → HTTP** (danh sách chuẩn, skills và api-contract tham chiếu về đây): `50001 → 409 ALREADY_PROCESSED`, `50002 → 409 OUT_OF_STOCK`, `50003 → 409 INVALID_STATE`, `50010 → 409 ITEM_UNAVAILABLE`, `50020 → 400 INSUFFICIENT_AMOUNT`, `50030 → 409 NO_ORDERS`, `50031 → 409 SESSION_CLOSED`, `50032 → 409 ALREADY_SETTLED`, `50033 → 409 HAS_PENDING_ORDERS`; deadlock `1205` → retry ≤ 3.

## Triển khai thực tế (14/10/2026)

### Khác biệt so với bản đề xuất

| Hạng mục | Triển khai | Lý do |
| --- | --- | --- |
| `OrderIngredients (OrderId, IngredientId, Qty)` | **Bảng mới** — chụp lượng nguyên liệu giữ cho từng đơn lúc gửi; `sp_CompleteOrder` / `sp_CancelOrder` dùng đúng số này | ADR-001: tránh lệch `ReservedQty` khi admin sửa BOM lúc đơn đang chờ |
| `Orders` | Thêm `AcceptedAt`, `CancelledBy`, `CancelReason`; CHECK `CK_Orders_PaidHasMethod` (PAID ⇒ có `PaymentMethod` và `PaidAt`) | Q-010; toàn vẹn thanh toán |
| `Sessions.SessionId` | `DEFAULT NEWID()` (thay `NEWSEQUENTIALID()`) | Mã phiên khó đoán hơn |
| `Ingredients` | Thêm `IsActive`, CHECK `LowStockThreshold >= 0` | Không xóa cứng nguyên liệu |
| Index | Thêm `IX_Sessions_Status` (POS: bàn đang phục vụ), `IX_SessionClients_Client` (vào lại phiên cũ), `IX_BomItems_Ingredient` (tính "hết món") | Theo truy vấn thật |
| Collation | Database `Vietnamese_CI_AS` | BR-004 (username không phân biệt hoa/thường) + sắp xếp tiếng Việt |
| `dbo.SchemaMigrations` | Bảng ghi migration đã chạy (do `kịch-bản/db-migrate.js` tạo) | Không chạy lại migration cũ |

### Stored procedures (`cơ-sở-dữ-liệu/thủ-tục/`)

| SP | Việc | Khóa (thứ tự) |
| --- | --- | --- |
| `sp_SubmitOrder` | Gửi đơn dine-in / tạo đơn mang đi đã thu tiền; giữ kho có điều kiện; phiên `PAYMENT_REQUESTED` → `OPEN` khi gọi thêm | `Sessions` (UPDLOCK) → `Ingredients` (UPDATE có điều kiện) → insert `Orders` |
| `sp_CompleteOrder` | `PREPARING → COMPLETED`, trừ `StockQty` + `ReservedQty` theo `OrderIngredients`, ghi `DEDUCT`; trả result set nguyên liệu đã trừ | `Orders` → `Ingredients` |
| `sp_CancelOrder` | Hủy `PENDING` kèm lý do, trả phần giữ | `Orders` → `Ingredients` |
| `sp_RequestPayment` | Gọi thanh toán (idempotent) | `Sessions` |
| `sp_SettleSession` | Thu tiền phiên một lần; `@ExpectedDue` chống thu sai khi tổng vừa đổi | `Sessions` → `Orders` |
| `sp_CloseEmptySession` | Đóng bàn trống (không có đơn nào khác `CANCELLED`) | `Sessions` |
| `sp_AdjustInventory` | Điều chỉnh tay (số mới hoặc ±), không âm, không dưới phần giữ | `Ingredients` |

### Bảng mã lỗi SP đầy đủ (app map trong `ứng-dụng/máy-chủ/src/errors.js`)

| Số | Mã | HTTP | Số | Mã | HTTP |
| --- | --- | --- | --- | --- | --- |
| 50001 | ALREADY_PROCESSED | 409 | 50030 | NO_ORDERS | 409 |
| 50002 | OUT_OF_STOCK (message = danh sách MenuItemId) | 409 | 50031 | SESSION_CLOSED | 409 |
| 50003 | INVALID_STATE | 409 | 50032 | ALREADY_SETTLED | 409 |
| 50004 | NOT_FOUND (đơn) | 404 | 50033 | HAS_PENDING_ORDERS (message = danh sách OrderId) | 409 |
| 50005 | NOT_FOUND (phiên) | 404 | 50034 | AMOUNT_CHANGED | 409 |
| 50010 | ITEM_UNAVAILABLE (danh sách MenuItemId) | 409 | 50035 | HAS_ORDERS | 409 |
| 50011 | VALIDATION_ERROR (giỏ trống) | 400 | 50040 | INVALID_ADJUSTMENT | 400 |
| 50012 | VALIDATION_ERROR (đơn sai loại) | 400 | 50041 | NOT_FOUND (nguyên liệu) | 404 |
| 50020 | INSUFFICIENT_AMOUNT | 400 | 50042 | NEGATIVE_STOCK | 400 |
| 1205 | deadlock → app retry ≤ 3 | — | 50043 | BELOW_RESERVED | 409 |
| 50072 | CASH_PENDING | 409 | 50132 | PO_HAS_RECEIPTS | 409 |
| 50110 | SPLIT_PAID | 409 | 50133 | PO_NOT_RECEIVABLE | 409 |
| 50111 | COMMON_REQUIRED | 409 | 50140 | CASH_CATEGORY_INVALID | 400 |
| 50112 | SPLIT_EMPTY | 409 | 50141 | CASH_NOT_PENDING | 409 |
| 50113 | SESSION_HAS_SPLITS | 409 | 50150 | LAST_ADMIN | 409 |
| 50120 | PREP_SHORT (message = tên nguyên liệu thiếu) | 409 | 50160 | AUDIT_READONLY | 409 |
| 50121 | WASTE_INVALID | 400 | 50170 | VOUCHER_UNAVAILABLE | 409 |
| 50122 | LOT_SHORT | 409 | 50171 | REWARD_UNAVAILABLE | 409 |
| 50123 | NO_RECIPE | 404 | 50172 | POINTS_INSUFFICIENT | 409 |
| 50130 | NOT_FOUND (đơn đặt hàng) | 404 | 50173 | STAMP_REWARD_UNAVAILABLE | 409 |
| 50131 | OVER_RECEIPT (message = tên nguyên liệu) | 409 | 50174 | REFERRAL_LIMIT | 409 |
| 50181 | ITEM_NOT_EDITABLE | 409 | 50184 | SESSION_HAS_PAYMENTS | 409 |
| 50182 | INVALID_QTY | 400 | 50185 | ITEM_NOT_FOUND | 404 |
| 50183 | ADMIN_APPROVAL_REQUIRED (SP ném `APPROVAL_REQUIRED`) | 403 | 50186 | VALIDATION_ERROR (SP ném `REASON_REQUIRED`) | 400 |
| 50190 | NOT_FOUND (phiếu nhập) | 404 | 50195 | NOT_FOUND (phiếu kiểm kê) | 404 |
| 50191 | RECEIPT_VOIDED | 409 | 50196 | STOCKTAKE_NOT_POSTED | 409 |
| 50192 | RECEIPT_AFTER_STOCKTAKE (message = tên nguyên liệu) | 409 | 50197 | STOCKTAKE_NOT_LATEST (message = tên nguyên liệu) | 409 |
| 50193 | RECEIPT_STOCK_USED (message = tên nguyên liệu) | 409 | 50198 | STOCKTAKE_SURPLUS_USED (message = tên nguyên liệu) | 409 |
| 50194 | RECEIPT_LOT_USED (message = tên nguyên liệu) | 409 | 50199 | VALIDATION_ERROR (SP ném `REASON_REQUIRED`) | 400 |
| 50200 | NOT_FOUND (phiên) | 404 | 50203 | TABLE_INACTIVE | 409 |
| 50201 | SESSION_CLOSED | 409 | 50204 | SAME_TABLE | 400 |
| 50202 | TABLE_NOT_FOUND | 404 | 50205 | SESSION_MOVED | 409 |
| 50142 | CASH_NOT_APPROVED | 409 | 50144 | VALIDATION_ERROR (SP ném `REASON_REQUIRED`) | 400 |
| 50143 | NOT_FOUND (khoản thu chi) | 404 | 50145 | SHIFT_CLOSED | 409 |

> **Cập nhật 18/10/2026 (ADR-006):** các dòng từ `50072` trở xuống là mã giai đoạn 4–8. Ngữ cảnh của từng mã nằm ở mục "Mở rộng giai đoạn 4–8" cuối file. Một số mã không phát ra từ SP: `50150` ném từ `sp_DeleteUser` và từ SQL nội tuyến của `usersRepo` (khi hạ vai trò hoặc khóa tài khoản); `50160` do trigger `TR_AuditLogs_ReadOnly` ném; `50174` ném từ SQL nội tuyến của `membersRepo`. `50132` mới chỉ được map sẵn, còn hiện tại service ném thẳng `409 PO_HAS_RECEIPTS`. Mã giai đoạn 2 (`50056`, `50060`–`50104`) xem mục ADR-005.

> **Cập nhật 18/10/2026 (ADR-007):** `50181`…`50186` là mã của F-046 (`sp_VoidOrderItem`, `sp_CancelOrders`), ngữ cảnh ở mục "Sửa / xóa món, hủy bàn" cuối file.

### Bất biến được test tự động (`ứng-dụng/máy-chủ/tests/helpers/testDb.js` → `inventoryViolations`)

`StockQty ≥ 0` và `ReservedQty ≥ 0`; `ReservedQty = Σ OrderIngredients.Qty` của đơn `PENDING/PREPARING`; mỗi `(OrderId, IngredientId)` ≤ 1 dòng `DEDUCT`; không có đơn `UNPAID` (không hủy) trong phiên `CLOSED`.

> Từ 0022, khóa `DEDUCT` là `(OrderId, IngredientId, LotId)`. Các bất biến bổ sung của ADR-006 xem mục "Mở rộng giai đoạn 4–8".

### Cập nhật ADR-004 — xóa trong Quản lý (migration `0002_xoa_mem.sql`)

- Cột `DeletedAt DATETIME2(0) NULL` trên `Users`, `Tables`, `Categories`, `MenuItems`, `Ingredients`. Bản ghi có `DeletedAt` = **đã xóa mềm**: không hiện ở danh sách/menu/QR/đăng nhập, nhưng báo cáo và lịch sử vẫn join được.
- Ràng buộc duy nhất đổi thành index có lọc để dùng lại tên/mã đã xóa: `UX_Users_Username`, `UX_Tables_Code`, `UX_Ingredients_Name` (`WHERE DeletedAt IS NULL`).
- Ghi chú thiết kế cũ "Không xóa cứng `Users`, `MenuItems`, `Ingredients`" được thay bằng: **xóa hẳn khi chưa có lịch sử, xóa mềm khi đã có** (ADR-004).

| SP | Xóa hẳn khi | Xóa mềm khi | Lỗi |
| --- | --- | --- | --- |
| `sp_DeleteMenuItem` | Chưa có trong `OrderItems` (xóa kèm `BomItems`) | Đã bán (đặt `IsActive = 0`, `IsAvailable = 0`) | 50050 |
| `sp_DeleteCategory` | Không còn món nào | Chỉ còn món đã xóa mềm | 50050, 50054 HAS_ITEMS |
| `sp_DeleteTable` | Chưa có phiên/đơn | Đã có (đổi `QrToken` → QR cũ chết) | 50050, 50053 TABLE_BUSY |
| `sp_DeleteIngredient` | Chưa có giao dịch kho / đơn / BOM | Đã có lịch sử | 50050, 50051 IN_USE (message = tên món), 50052 HAS_RESERVED |
| `sp_DeleteUser` | Chưa có thao tác nào | Đã tạo/hoàn tất/hủy đơn, thu tiền, đóng phiên hoặc điều chỉnh kho | 50050, 50055 CANNOT_DELETE_SELF |

Mã lỗi mới: `50050 → 404 NOT_FOUND`, `50051 → 409 IN_USE`, `50052 → 409 HAS_RESERVED`, `50053 → 409 TABLE_BUSY`, `50054 → 409 HAS_ITEMS`, `50055 → 400 CANNOT_DELETE_SELF`. `sp_SubmitOrder` từ chối món đã xóa (`ITEM_UNAVAILABLE`); `sp_AdjustInventory` coi nguyên liệu đã xóa là không tồn tại.

## Mở rộng giai đoạn 2 (ADR-005, 16/10/2026)

| Migration | Bảng / cột |
| --- | --- |
| `0003_hoi_vien.sql` | `Settings(SettingKey, SettingValue)`; `MemberTiers`; `Members` (Phone unique, `ConsentAt`, `AnonymizedAt`); `MemberTransactions`; `MemberId` trên `Sessions`, `Orders`, `Payments`; breakdown `Payments.SubtotalAmount/PromoDiscount/MemberDiscount/MemberPercent/ManualDiscount/RoundingAdj` + CHECK |
| `0004_goi_y.sql` | `MenuItems.IsPinned/PinLabel/PinOrder/HideFromSuggestions`; settings `suggestion.*` |
| `0005_combo.sql` | `MenuItems.ItemType` (SINGLE/COMBO), `CategoryId` NULL cho combo; `ComboComponents`; `OrderItems.ParentOrderItemId/ListPrice`; CHECK SL dòng con ≤ 500; TVP `OrderLineInput` |
| `0006_khuyen_mai.sql` | `Promotions`, `PromotionTargets`, `PromotionUsages`; `OrderItems.PromotionId/LineDiscount/AllowMemberStack`; `Orders.SubtotalAmount/PromoDiscount/OrderPromotionId` + CHECK `TotalAmount = SubtotalAmount − PromoDiscount` |
| `0007_tuy_chon_mon.sql` | `ModifierGroups`, `ModifierOptions`, `ModifierOptionBom`, `MenuItemModifierGroups`, `OrderItemModifiers`; TVP `OrderLineOptionInput` |
| `0008_chot_ca.sql` | `Shifts` (unique lọc "một ca mở"); `Payments.ShiftId` |
| `0009_giam_gia_tay.sql` | `Payments.ManualReason/ApprovedBy` + CHECK có giảm phải có lý do; settings `discount.*` |
| `0010_nhan_don_gio_ban.sql` | `Categories.SellFrom/SellTo`; settings `store.*` |
| `0011_goi_nhan_vien.sql` | `StaffCalls` |
| `0012_hoan_tien.sql` | `Orders.Status` + `VOIDED`, `Orders.VoidedAt`; `InventoryTransactions.Type` + `RESTOCK` (unique đơn × nguyên liệu); `Refunds` |
| `0013_nhap_kho_kiem_ke.sql` | `Ingredients.LastUnitCost`; `StockReceipts(+Lines)`, `Stocktakes(+Lines)`; `InventoryTransactions.StockReceiptId/StocktakeId`; TVP `StockLineInput` |

**SP mới/sửa:**

- `sp_SubmitOrder`: nhận `@Lines/@LineOptions` đã tính giá (vẫn chạy với `@Items` cũ); combo cha + con; BOM tùy chọn; khóa `Promotions` kiểm `MaxUsesPerDay` (50060); mang đi ghi breakdown + ca (50070) + hội viên.
- `sp_SettleSession`: `@OrdersTotal` (lệch → 50034), hội viên, giảm tay, làm tròn, ca.
- `sp_ApplyMemberPayment` (mới).
- `sp_CloseShift` (mới).
- `sp_RefundPayment` (mới; 50090–50093).
- `sp_ReceiveStock` (mới; 50100).
- `sp_PostStocktake` (mới; 50101–50103).
- `sp_AdjustInventory`: khóa khi đang kiểm kê (50104).
- `sp_Delete*`: thành phần combo (50056 `IN_COMBO`), mục tiêu khuyến mãi, BOM tùy chọn, lịch sử mới.

**Thứ tự khóa:** Sessions → Shifts (S) → Promotions → Ingredients → Orders → Members. Bất biến tiền được test tự động (`inventoryViolations`).

## Gọi món tại bàn + ghi chú bàn (FEATURE-024, 16/10/2026)

| Migration | Nội dung |
| --- | --- |
| `0014_goi_mon_tai_ban.sql` | `Sessions.OpenedBy` (FK Users; NULL = khách quét QR mở), `Sessions.Note` NVARCHAR(200), `NoteUpdatedAt`, `NoteUpdatedBy` (FK Users) |

- `sp_SubmitOrder @AcceptNow BIT = 0`: chỉ hợp lệ với `DINE_IN` + `@CreatedBy` (50012 nếu sai). Đơn vào `PREPARING`, `AcceptedAt` = lúc gửi; giữ kho như cũ.
- `sp_DeleteUser`: người đã mở bàn / sửa ghi chú → xóa mềm (giữ lịch sử).
- Mở bàn (`sessionsRepo.openByStaff`): transaction `UPDLOCK, HOLDLOCK` trên dòng `Tables` → đếm phiên chưa đóng → `INSERT Sessions`. Hai máy quầy mở cùng bàn trống chạy tuần tự.

## Mở rộng giai đoạn 4–8 (ADR-006, cập nhật 18/10/2026)

Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) (D-17…D-32). Kế hoạch và bảng map: [TASK-035…054](../kế-hoạch/TASK-035-054-plan.md). Hệ thống vẫn một chi nhánh, một kho, và mọi bất biến kho/tiền cũ giữ nguyên. F-041 và F-042 không đổi schema (số liệu tính khi xem).

### Migration 0015–0032

| Migration | Feature | Bảng / cột | Ràng buộc / index chính |
| --- | --- | --- | --- |
| `0015_goi_lai_don.sql` | F-045 | `MemberFavorites(MemberId, MenuItemId, CreatedAt)` | PK `(MemberId, MenuItemId)`; `IX_Payments_Member (MemberId, PaidAt) WHERE MemberId IS NOT NULL` |
| `0016_lich_thuc_don.sql` | F-040 | `MenuSchedules(Name, StartDate, EndDate, DaysOfWeekMask, StartTime, EndTime, IsActive, SourceCategoryId)`; `MenuScheduleItems(ScheduleId, MenuItemId \| CategoryId, Mode)` | `DaysOfWeekMask` 1–127 (bit0 = CN); `StartDate ≤ EndDate`; giờ cùng NULL hoặc cùng có và khác nhau (`StartTime > EndTime` = qua nửa đêm); `Mode IN (SHOW, HIDE)`; mỗi dòng trỏ đúng một món **hoặc** một danh mục; `UX_MenuSchedules_SourceCategory` (lọc). Giờ bán danh mục F-020 được chuyển thành lịch SHOW "Giờ bán — <danh mục>" |
| `0017_thoi_gian_cho.sql` | F-025 | `MenuItems.PrepSeconds`; `ItemPrepStats(MenuItemId PK, MedianSeconds, SampleCount, ComputedAt)`; **`JobRuns(RunId, Name, StartedAt, FinishedAt, Status, Info, Error)`** dùng chung cho mọi job | `PrepSeconds` NULL hoặc 10–3600; `JobRuns.Status IN (RUNNING, OK, FAILED, SKIPPED)`, `IX_JobRuns_Name (Name, StartedAt DESC)`; settings `kitchen.base_seconds=120`, `kitchen.parallelism=1`, `eta.spread_percent=25`, `eta.default_item_seconds=180` |
| `0018_chia_bill.sql` | F-026 | `SessionSplits(SessionId, Label, ClientToken, MemberId, IsCommon, Status, PaymentId)`; `OrderItems.SplitId` (NULL = phần Chung), `PaidAt`, `PaymentId`; `Payments.SplitId` | `Status IN (OPEN, PAID)`; `UX_SessionSplits_Common` (mỗi phiên một phần Chung); `UX_Payments_Session` đổi thành lọc `SessionId IS NOT NULL AND SplitId IS NULL` (phiên không chia); `UX_Payments_Split` (mỗi phần một lượt thu) |
| `0019_don_vi_gia_von.sql` | F-031 | `Units(UnitCode NVARCHAR(10) PK, Name, BaseUnitCode, Factor)`; `Ingredients.BaseUnitCode`, `AvgCost`; `StockReceiptLines.PackUnitCode/PackQty/PackPrice`; `InventoryTransactions.UnitCost/CostAmount`; `OrderItems.CogsAmount` | `CK_Units_Factor` (đơn vị gốc: không có hệ số; đơn vị quy đổi: `Factor > 0`, khác chính nó); `AvgCost ≥ 0`. Seed ml, g, cái, miếng, l, kg, lon, thùng và mọi đơn vị nguyên liệu đang dùng; `AvgCost` khởi tạo bằng `LastUnitCost`; setting `cost.method=AVG` |
| `0020_ban_thanh_pham.sql` | F-027 | `Ingredients.Kind`, `ShelfLifeHours`; `SemiRecipes(SemiIngredientId PK, OutputQty, Instructions)`; `SemiRecipeLines(SemiIngredientId, InputIngredientId, Qty)`; `PrepBatches(SemiIngredientId, Multiplier, OutputQty, TotalCost, UnitCost, PreparedBy, PreparedAt, ExpiresAt, Note)`; `InventoryTransactions.PrepBatchId` | `Kind IN (RAW, SEMI)`; `ShelfLifeHours` 1–8760; `OutputQty > 0`, `Qty > 0`; `CK_SemiRecipeLines_Self` (không dùng chính nó). Vòng lặp và độ sâu > 3 cấp do app kiểm. `CK_InvTxn_Type` thêm `PREP_OUT`, `PREP_IN` |
| `0021_hao_hut.sql` | F-032 | `Ingredients.WastePercent`; `WasteLogs(IngredientId, Qty, Reason, Note, CostAmount, CreatedBy, CreatedAt)`; `InventoryTransactions.WasteId` | `WastePercent` 0–100; `Qty > 0`; `Reason IN (SPILL, EXPIRED, QUALITY, OTHER)` |
| `0022_lo_han_dung.sql` | F-028 | `Ingredients.TrackLots`; `IngredientLots(IngredientId, LotCode, Qty, ExpiryDate, UnitCost, Source, SourceId, ReceivedAt, IsClosed)`; `InventoryTransactions.LotId`; `WasteLogs.LotId` | `Qty ≥ 0`; `Source IN (RECEIPT, PREP, ADJUST, RESTOCK)`; `IX_Lots_FEFO (IngredientId, IsClosed, ExpiryDate, ReceivedAt)`; `UX_InvTxn_Order_Ingredient` đổi thành `(OrderId, IngredientId, LotId) WHERE Type='DEDUCT'` (một lần trừ có thể tách theo lô) |
| `0023_nha_cung_cap.sql` | F-030 | `Suppliers(Name, Phone, Email, LeadTimeDays, DeliveryDaysMask, Note, IsActive)`; `SupplierIngredients(SupplierId, IngredientId, PackUnitCode, PackSize, LastPrice, IsPreferred)`; `PurchaseOrders(SupplierId, Status, ExpectedDate, CreatedBy, SentAt, ReceivedAt, Note)`; `PurchaseOrderLines(PoId, IngredientId, PackUnitCode, PackSize, OrderedPacks, OrderedBaseQty, ReceivedBaseQty, UnitPrice)`; `SupplierPriceHistory(SupplierId, IngredientId, PackUnitCode, PackPrice, UnitCost, ReceiptId, RecordedAt)`; `StockReceipts.PoId/SupplierId`; `StockReceiptLines.PoLineId/ExpiryDate/LotId` | `LeadTimeDays` 0–60; `UX_SupIng_Preferred` (mỗi nguyên liệu tối đa một nhà cung cấp ưu tiên); PO `Status IN (DRAFT, SENT, PARTIAL, RECEIVED, CANCELLED)`; `UQ_POL_Ingredient (PoId, IngredientId)`; `ReceivedBaseQty ≥ 0` |
| `0024_du_bao_nhap.sql` | F-029 | `DemandForecasts(IngredientId, ForecastDate, ForecastQty, Samples, ComputedAt)` | PK `(IngredientId, ForecastDate)` (job MERGE); `ForecastQty ≥ 0`; `Samples = 0` nghĩa là không đủ dữ liệu; settings `forecast.safety_percent=20`, `forecast.weeks=4` |
| `0025_truong_ca.sql` | F-036 | `CK_Users_Role` thêm `MANAGER` | settings `manager.discount_max_percent=20`, `manager.discount_max_amount=50000`, `manager.refund_same_shift_only=true`, `manager.cash_out_approve_max=2000000` |
| `0026_so_quy.sql` | F-033 | `CashCategories(Name, Direction, IsExpense, RequiresApproval, IsActive, SortOrder)`; `CashTransactions(ShiftId, CategoryId, Direction, Amount, Reason, ReceiptImagePath, Status, CreatedBy, CreatedAt, ApprovedBy, ApprovedAt, RejectReason)` | `Direction IN (IN, OUT)`; `Amount > 0`; `Reason NOT NULL`; `Status IN (PENDING, APPROVED, REJECTED)`; `IX_CashTxn_Shift (ShiftId, Status)`. Seed 7 danh mục chi và 2 danh mục thu: "Khác (chi)" luôn chờ duyệt, "Nộp tiền về két tổng" không tính là chi phí. Setting `cash.approve_threshold=500000` |
| `0027_cham_cong_audit.sql` | F-035 | `Attendance(UserId, ClockIn, ClockOut, ShiftId, Source, EditedBy, EditReason, EditedAt)`; `Rosters(UserId, WorkDate, StartTime, EndTime, Note, CreatedBy)`; `AuditLogs(AuditId BIGINT, UserId, UserName, Role, Action, Entity, EntityId, BeforeJson, AfterJson, Ip, UserAgent, At)` | `Source IN (LOGIN, MANUAL)`; `ClockOut ≥ ClockIn`; `IX_Attendance_Open (UserId) WHERE ClockOut IS NULL`; `Rosters`: `StartTime <> EndTime` (kết thúc < bắt đầu = qua nửa đêm); `AuditLogs.UserId` **không có FK** để giữ nhật ký khi tài khoản bị xóa hẳn; index `At`, `(Entity, EntityId)`, `(UserId, At)`; trigger `TR_AuditLogs_ReadOnly` (INSTEAD OF UPDATE → 50160) |
| `0028_lai_lo.sql` | F-034 | `FixedCosts(Name, MonthlyAmount, EffectiveFrom, EffectiveTo)` | `MonthlyAmount ≥ 0`; `EffectiveTo IS NULL OR EffectiveTo ≥ EffectiveFrom` |
| `0029_tich_diem.sql` | F-039 | `PointTransactions(MemberId, PaymentId, Delta, Type, Note, CreatedBy)`; `RewardCatalog(Name, PointsCost, RewardType, DiscountAmount, MenuItemId, IsActive, SortOrder)`; `RewardRedemptions(MemberId, RewardId, PaymentId, PointsSpent, DiscountAmount, ReturnedAt)`; `StampPrograms(Name, RequiredStamps, RewardMenuItemId, IsActive)`; `StampProgramItems(ProgramId, MenuItemId)`; `StampCards(MemberId, ProgramId, Stamps, CompletedCards, RewardsAvailable)`; `StampEvents(MemberId, ProgramId, PaymentId, Type, Stamps, Rewards…)`; `Payments.RewardDiscount/RewardId/StampProgramId/PointsEarned/StampsEarned` | `Delta <> 0`; `Type IN (EARN, REDEEM, ADJUST, EXPIRE, REFUND)`; **`UX_PointTxn_Earn (PaymentId) WHERE Type='EARN'`**; `CK_Reward_Kind` (DISCOUNT có số tiền, FREE_ITEM có món); `RequiredStamps` 2–50; `Stamps ≥ 0`, `RewardsAvailable ≥ 0`; `CK_Payments_Reward` (có giảm đổi thưởng thì phải có hội viên); `CK_Members_Points (Points ≥ 0)`. Số dư điểm cũ (D-5) ghi thành một dòng `ADJUST` "Số dư trước F-039"; setting `loyalty.point_value=10000` |
| `0030_gioi_thieu.sql` | F-038 | `Members.ReferredByMemberId`, `ReferralRewardedAt`; `Vouchers(Code, MemberId, PromotionId, DiscountPercent, DiscountAmount, MaxDiscount, MinOrderAmount, StackWithMember, ExpiresAt, UsedAt, UsedPaymentId, Source, CampaignId, IssuedForPaymentId, CreatedBy)`; `Payments.VoucherId`, `VoucherDiscount` | `UX_Vouchers_Code`; **`UX_Vouchers_UsedPayment`** (một voucher / lượt thu); `CK_Vouchers_Value` (theo % **hoặc** theo số tiền); `CK_Vouchers_Used` (`UsedAt` ⇔ `UsedPaymentId`); `Source IN (REFERRAL, CAMPAIGN, MANUAL)`; `CK_Payments_Voucher` (có giảm thì phải có `VoucherId`); `IX_Members_ReferredBy`. Settings `referral.min_first_payment=30000`, `referral.voucher_percent=10`, `referral.voucher_days=30`, `referral.monthly_limit=5` |
| `0031_chien_dich.sql` | F-037 | `Members.OptOut`, `LastContactedAt`; `Segments(Name, RuleJson)`; `Campaigns(Name, SegmentId, Channel, MessageTemplate, VoucherPercent, VoucherDays, VoucherMinOrder, ScheduledAt, Status, StartedAt, FinishedAt, Error)`; `CampaignDeliveries(CampaignId, MemberId, VoucherId, Status, SentAt, Error)`; FK `Vouchers.CampaignId` | `CK_Segments_Json (ISJSON)`; `Channel IN (EXPORT, ZALO_OA, SMS)`; `Status IN (DRAFT, SCHEDULED, RUNNING, DONE, FAILED)`; `CK_Campaigns_Voucher` (`VoucherPercent` và `VoucherDays` đi cùng nhau); `IX_Campaigns_Due (Status, ScheduledAt)`; **`UQ_Deliveries (CampaignId, MemberId)`** (chạy lại không gửi trùng); delivery `Status IN (SENT, EXPORTED, SKIPPED, FAILED)`; setting `campaign.min_days_between=7` |
| `0032_tong_hop_ngay.sql` | F-043 | `DailySummaries(SummaryDate PK, RevenueNet, PaymentCount, OrderCount, AvgBill, Cogs, GrossProfit, CashVariance, ShiftCount, NewMembers, VouchersUsed, TopItemsJson, LowStockJson, ExpiringJson, PendingApprovals, ComputedAt)` | PK theo ngày quán; job `MERGE` nên chạy lại không nhân đôi. `CashVariance` NULL khi trong ngày không có ca nào đóng |

Khóa `Settings.shop.name`, `Settings.shop.address` (F-053) cũng không có migration riêng: chỉ được ghi khi quản lý bấm Lưu ở Cài đặt; chưa có dòng → dùng `SHOP_NAME` / `SHOP_ADDRESS` của `.env`.

Khóa job `Settings.job.<name>.running` không có migration riêng: bộ lập lịch tự tạo dòng này khi chạy lần đầu (xem [system-overview](system-overview.md)).

### Breakdown lượt thu (`Payments`)

`AmountDue = SubtotalAmount − PromoDiscount − MemberDiscount − VoucherDiscount − RewardDiscount − ManualDiscount − RoundingAdj`.

- `pricing.settleTotals` áp các khoản giảm theo thứ tự: khuyến mãi (đã có trên đơn) → hội viên (bỏ qua nếu voucher có `StackWithMember = 0`) → voucher (giới hạn bởi `MaxDiscount`) → đổi thưởng → giảm tay → làm tròn. Đổi thưởng **không** dùng cùng giảm tay trên một lượt thu.
- Sau khi tính, các SP thu tiền (`sp_SettleSession`, `sp_SettleSplit`, và `sp_SubmitOrder` cho đơn mang đi) tự tính lại `AmountDue` theo đúng công thức trên. Test kiểm bằng bất biến `PAYMENT_BREAKDOWN`.
- Lượt thu còn ghi `VoucherId`, `RewardId` / `StampProgramId`, `PointsEarned`, `StampsEarned` và `SplitId` (khi thu một phần chia bill).

### Stored procedures mới / sửa

| SP / hàm | Việc | Khóa / bảo đảm | Lỗi chính |
| --- | --- | --- | --- |
| `sp_SettleSplit` (mới, F-026) | Thu **một phần** của phiên đã chia (phần thường hoặc phần Chung): ghi một `Payments(SplitId)`, đánh dấu `OrderItems.PaidAt/PaymentId`, đơn đủ dòng → `PAID`. Phần cuối còn mở bắt buộc gộp các dòng Chung chưa thu. Hết dòng chưa thu → đóng phiên. Gọi `sp_ApplyMemberPayment` và `sp_ApplyLoyalty` trong cùng transaction | Sessions (UPDLOCK) → SessionSplits (UPDLOCK, HOLDLOCK) → Shifts (S) → Orders → Members; `UX_Payments_Split` chặn thu trùng một phần. Kiểm Σ dòng (`@LinesTotal`) chưa đổi | 50110, 50111, 50112, 50033, 50034, 50070 |
| `sp_SettleSession` (sửa) | Từ chối phiên đã chia; ghi `PaidAt/PaymentId` lên từng dòng; nhận `@VoucherDiscount`, `@RewardDiscount`, `@LoyaltyJson` → `sp_ApplyLoyalty` | Như cũ (Sessions trước tiên) | 50113 |
| `sp_SubmitOrder` (sửa) | Khả dụng = tồn − đang giữ − lô hết hạn (`tvf_ExpiredLotQty`); đơn mang đi nhận voucher/đổi thưởng → `sp_ApplyLoyalty` | Như cũ | — |
| `sp_CompleteOrder` (sửa) | Nguyên liệu theo lô trừ FEFO, mỗi lô một dòng `DEDUCT`; mỗi dòng ghi `UnitCost/CostAmount` (AVG, hoặc giá lô khi `cost.method=FIFO`); phân bổ giá vốn vào `OrderItems.CogsAmount` (Σ dòng = Σ `CostAmount`; chưa biết giá → NULL) | Orders → Ingredients → IngredientLots | 50122 |
| `sp_ReceiveStock` (sửa) | Nhận dòng qua `@LinesJson` (đơn vị đóng gói; TVP cũ vẫn chạy). Tính lại `AvgCost` bình quân; nguyên liệu theo lô → mỗi dòng một lô. Nhận theo PO (`@PoId`, `@SupplierId`, `@ConfirmOver`): cộng `ReceivedBaseQty`, chuyển PO sang `PARTIAL` / `RECEIVED`, ghi lịch sử giá và `LastPrice` | PurchaseOrders (UPDLOCK, HOLDLOCK) → PurchaseOrderLines (UPDLOCK) → Ingredients (UPDLOCK, HOLDLOCK) | 50130, 50131, 50133 |
| `sp_PostPrepBatch` (mới, F-027) | Một mẻ sơ chế là một transaction: trừ đầu vào (`PREP_OUT`) và cộng bán thành phẩm (`PREP_IN`). Giá vốn mẻ = Σ giá vốn đầu vào; bình quân lại `AvgCost` bán thành phẩm; bán thành phẩm theo lô → tạo lô `PREP` với hạn = lúc pha + `ShelfLifeHours` | Ingredients theo `IngredientId` tăng dần (UPDLOCK, HOLDLOCK). Đầu vào phải đủ khả dụng (đã trừ lô hết hạn); thiếu thì không đổi gì | 50120, 50123, 50104, 50122 |
| `sp_LogWaste` (mới, F-032/F-028) | Phiếu hủy: trừ tồn, ghi `InventoryTransactions(ADJUST, Reason 'WASTE:…', WasteId)` có giá vốn và `WasteLogs`. Có `@LotId` → hủy đúng lô đó (mặc định toàn bộ phần còn lại, lý do `EXPIRED`) | Dòng lô (khi có `@LotId`) và dòng Ingredients (UPDLOCK, HOLDLOCK). Không được hủy vào phần đang giữ; bị khóa khi đang kiểm kê | 50041, 50043, 50104, 50121, 50122 |
| `sp_LotConsume` (mới, F-028) | Trừ một lượng theo FEFO; ghi phần đã lấy vào bảng tạm `#LotUse` của SP gọi | Chỉ gọi **trong** transaction của SP khác, sau khi đã khóa Ingredients; IngredientLots (UPDLOCK, HOLDLOCK) | 50122 (Σ lô < số cần) |
| `sp_SetTrackLots` (mới, F-028) | Bật: tồn hiện có thành một lô mở (Source `ADJUST`, không hạn, giá = `AvgCost`). Tắt: đóng mọi lô | Ingredients (UPDLOCK, HOLDLOCK) | 50041 |
| `tvf_ExpiredLotQty()` (mới, F-028) | Lượng còn trong các lô **đã hết hạn** của từng nguyên liệu (theo giờ quán); dùng để trừ khỏi khả dụng | — | — |
| `sp_AdjustInventory`, `sp_PostStocktake` (sửa) | Dòng `ADJUST` ghi giá vốn. Với nguyên liệu theo lô: giảm → trừ FEFO, tăng → tạo lô `ADJUST` | Như cũ | 50122 |
| `sp_RefundPayment` (sửa) | Hoàn kho ghi giá vốn đã trừ, nguyên liệu theo lô → lô `RESTOCK`. Lượt thu của một phần chia bill chỉ được hoàn tiền, không hủy đơn (`@OrderIds` → 50093). Gọi `sp_ReverseLoyalty` | Payments → Shifts (S) → Orders → Ingredients → Members | 50093 |
| `sp_CreateCashTxn` (mới, F-033) | Ghi khoản thu/chi vào **ca đang mở**: chi > `cash.approve_threshold` hoặc danh mục `RequiresApproval` → `PENDING`, còn lại → `APPROVED` | Shifts (S, HOLDLOCK) nên chạy tuần tự với `sp_CloseShift` | 50070, 50140 |
| `sp_ReviewCashTxn` (mới, F-033) | Duyệt / từ chối khoản `PENDING` (ca còn mở) | CashTransactions (UPDLOCK, HOLDLOCK) → Shifts (S); hai người cùng duyệt thì chỉ một người thắng | 50141, 50070 |
| `sp_CloseShift` (viết lại) | `ExpectedCash = OpeningCash + Σ AmountDue − Σ hoàn + Σ thu khác APPROVED − Σ chi APPROVED`; ca còn khoản `PENDING` thì không đóng được; chấm công ra cho người đóng ca | Shifts (UPDLOCK, HOLDLOCK) nên các lượt thu/hoàn/sổ quỹ đang giữ S phải xong trước | 50071, 50072 |
| `sp_ClockIn` (mới, F-035) | Đăng nhập → `ClockIn` nếu chưa có bản ghi mở; bản ghi mở quá `@StaleHours` (12) giờ được đóng tại `ClockIn + 12 giờ` | Attendance theo `UserId` (UPDLOCK, HOLDLOCK): đăng nhập đồng thời chỉ tạo một bản ghi mở | — |
| `sp_ApplyLoyalty` (mới, F-038/F-039) | Gọi **trong** transaction của `sp_SettleSession` / `sp_SettleSplit` / `sp_SubmitOrder`, ngay sau khi ghi `Payments`. Lần lượt: dùng voucher (`UPDATE … WHERE UsedAt IS NULL AND ExpiresAt > now`); trừ điểm hoặc lượt quà tem; tích điểm (1 điểm / `loyalty.point_value` đồng thực trả, một dòng `EARN`); tích tem (đủ thẻ → `RewardsAvailable` +1); tặng 2 voucher giới thiệu ở lượt thu đầu ≥ `referral.min_first_payment` | Members (UPDLOCK, HOLDLOCK) → StampCards; hai quầy dùng cùng voucher hoặc cùng đổi điểm thì chỉ một bên thắng | 50170–50173 |
| `sp_ReverseLoyalty` (mới) | Gọi trong `sp_RefundPayment`: trừ điểm đã tích dư so với số còn thực trả (không để điểm âm); hoàn toàn bộ lượt thu → trả lại điểm/lượt quà đã đổi; đơn bị hủy → trừ tem | Members (UPDLOCK, HOLDLOCK) → StampCards | — |
| `sp_AdjustPoints` (mới) | Quản lý cộng/trừ điểm, bắt buộc lý do, ghi dòng `ADJUST` | Members (UPDLOCK, HOLDLOCK) | 50080, 50172 |
| `sp_ApplyMemberPayment` (sửa) | Thôi cộng điểm trực tiếp vì việc này đã chuyển sang `sp_ApplyLoyalty` | Như cũ | — |
| `sp_DeleteUser` (sửa) | Không xóa quản lý đang hoạt động cuối cùng. Lịch sử mới (sổ quỹ, chấm công, lịch làm do người đó tạo, sơ chế, hủy hàng, PO, điểm/tem, voucher, phân khúc, chiến dịch) tính là "đã có lịch sử" → xóa mềm. Lịch phân ca chưa làm của chính người đó bị xóa cùng khi xóa hẳn | Như cũ | 50150 |

Khóa ngoài SP (SQL nội tuyến trong repository):

- **`LAST_ADMIN`** (`usersRepo`): khóa U toàn bộ dòng ADMIN đang hoạt động rồi mới đếm. Vì vậy hai quản lý hạ quyền hoặc khóa nhau cùng lúc sẽ chạy tuần tự, và người sau nhận 50150.
- **`REFERRAL_LIMIT`** (`membersRepo.create`): khóa dòng người giới thiệu rồi đếm số người được giới thiệu trong tháng (giờ VN), nên đăng ký đồng thời không vượt `referral.monthly_limit`.
- **Chiến dịch**: chuyển `DRAFT/SCHEDULED → RUNNING` bằng một `UPDATE` có điều kiện, nên chỉ một tiến trình chạy được. Mỗi người nhận có đúng một dòng nhờ `UQ_Deliveries`.

**Thứ tự khóa chung (ADR-006):** Sessions → SessionSplits → Shifts (S) → Promotions → Ingredients (tăng dần `IngredientId`) → IngredientLots → Orders → Members → Vouchers. Transaction giữ ngắn; deadlock `1205` được retry tối đa 3 lần.

### Bất biến được test tự động (bổ sung vào `inventoryViolations`)

Bộ kiểm chạy sau mọi bộ test (`ứng-dụng/máy-chủ/tests/helpers/testDb.js`); kết quả mong đợi là rỗng.

| Mã vi phạm | Điều kiện phải đúng | Feature |
| --- | --- | --- |
| `LOTS_MISMATCH` | Nguyên liệu `TrackLots = 1`: `StockQty = Σ Qty` các lô mở | F-028 |
| `CLOSED_LOT_HAS_QTY` | Lô đã đóng (của nguyên liệu theo lô) không còn `Qty > 0` | F-028 |
| `DEDUCT_QTY_MISMATCH` | Σ `DEDUCT` (gộp các lô) của mỗi đơn × nguyên liệu = `OrderIngredients.Qty` | F-028 |
| `DOUBLE_DEDUCT` (sửa) | Không trùng `(OrderId, IngredientId, LotId)` trên dòng `DEDUCT` | F-028 |
| `PREP_UNBALANCED` | Mỗi mẻ: Σ `CostAmount` của `PREP_OUT` = Σ của `PREP_IN` (lệch ≤ 0,01) | F-027 |
| `COGS_MISMATCH` | Đơn có giá vốn: Σ `OrderItems.CogsAmount` = làm tròn Σ `CostAmount` các dòng `DEDUCT` | F-031 |
| `PAYMENT_BREAKDOWN` (mở rộng) | `AmountDue = Subtotal − Promo − Member − Voucher − Reward − Manual − Rounding` | F-038, F-039 |
| `PAYMENT_ORDERS_MISMATCH` (sửa) | Chỉ kiểm lượt thu không thuộc phần chia (`SplitId IS NULL`): `Subtotal − Promo` = Σ đơn | F-026 |
| `SPLIT_SESSION_MISMATCH` | Phiên đã đóng có chia bill: Σ (`Subtotal − Promo`) các lượt thu = Σ `TotalAmount` đơn không hủy | F-026 |
| `SPLIT_UNPAID_LINE` | Phiên đã đóng có chia bill: mọi dòng của đơn còn hiệu lực có `PaidAt` | F-026 |
| `SPLIT_PAID_NO_PAYMENT` | Phần thường `PAID` có dòng món thì phải có `PaymentId` | F-026 |
| `LINE_PAYMENT_OTHER_SESSION` | `OrderItems.PaymentId` chỉ trỏ tới lượt thu của đúng phiên (hoặc đúng đơn mang đi) | F-026 |
| `SHIFT_EXPECTED_CASH` | Ca đã đóng: `ExpectedCash = OpeningCash + Σ AmountDue − Σ hoàn + Σ thu khác APPROVED − Σ chi APPROVED` | F-033 |
| `CLOSED_SHIFT_CASH_PENDING` | Ca đã đóng không còn khoản sổ quỹ `PENDING` | F-033 |
| `MANY_OPEN_ATTENDANCE` | Mỗi người tối đa một bản ghi chấm công đang mở | F-035 |
| `POINTS_LEDGER_MISMATCH` | `Members.Points = Σ PointTransactions.Delta` | F-039 |
| `EARN_MISMATCH` | `Payments.PointsEarned` = Σ dòng `EARN` của lượt thu | F-039 |
| `VOUCHER_PAYMENT_MISMATCH` | Voucher đã dùng: lượt thu `UsedPaymentId` có `VoucherId` = voucher đó | F-038 |
| `STAMP_CARD_OVERFLOW` | `StampCards.Stamps < RequiredStamps` (đủ tem phải chuyển thành lượt quà) | F-039 |

Ngoài bộ kiểm trên, các CHECK sau cũng chặn ngay ở DB: điểm không âm (`CK_Members_Points`), tem / lượt quà không âm, lô không âm, `Amount > 0` ở sổ quỹ. Riêng `AuditLogs` không sửa được do trigger chặn UPDATE.

## Sửa / xóa món, hủy bàn (FEATURE-046, ADR-007, 18/10/2026)

Quyết định: [ADR-007](../quyết-định/ADR-007-sua-xoa-mon-huy-ban.md) (D-33…D-35). Rule: BR-066…BR-070. Mọi bất biến kho / tiền cũ giữ nguyên. **Migration kế tiếp: `0034`.**

### Migration 0033

| Migration | Feature | Bảng / cột | Ràng buộc / index chính |
| --- | --- | --- | --- |
| `0033_sua_xoa_mon.sql` | F-046 | `OrderItemVoids(VoidId PK, OrderId, OrderItemId, SessionId, MenuItemId, ItemName, Qty, UnitPrice, Amount, OrderStatus, StockMode, CogsReduction, Reason, ApprovedBy, CreatedBy, CreatedAt)`; `InventoryTransactions.VoidId`; `WasteLogs.VoidId`; `Sessions.CancelledBy`, `Sessions.CancelReason NVARCHAR(200)` | FK `OrderId` → Orders, `SessionId` → Sessions, `MenuItemId` → MenuItems, `ApprovedBy` (NULL) / `CreatedBy` → Users; **`OrderItemId` không có FK** (dòng có thể đã bị xóa hẳn); `CK_Voids_Qty (Qty > 0)`; `Amount` = `Qty × UnitPrice` trước khuyến mãi đơn; `OrderStatus` = trạng thái đơn lúc bỏ món; `CK_Voids_Stock (StockMode IN (RELEASE, RESTOCK, WASTE))`; `CogsReduction` mặc định 0; index `IX_Voids_Order (OrderId)`, `IX_Voids_At (CreatedAt)`. `CK_InvTxn_Type` thêm `VOID_BACK` (`Type` là `VARCHAR(10)`); FK `InventoryTransactions.VoidId`, `WasteLogs.VoidId` → OrderItemVoids; FK `Sessions.CancelledBy` → Users |

DB dev `CafeQrDev` đã áp `0033` ngày 18/10/2026 (chỉ thêm bảng / cột, dữ liệu cũ giữ nguyên).

### Stored procedures mới / sửa

| SP / hàm | Việc | Khóa / bảo đảm | Lỗi chính |
| --- | --- | --- | --- |
| `sp_VoidLineCore` (mới, trong `sp_VoidOrderItem.sql`) | Lõi bỏ `@RemoveQty` của **một** dòng khách chọn, gọi trong transaction của SP khác. Nhu cầu nguyên liệu = BOM món × SL bỏ + thành phần combo theo tỉ lệ + BOM tùy chọn; chặn trên bởi phần đơn **còn giữ** (chưa pha xong) hoặc `DEDUCT − VOID_BACK − lượng đã ghi hủy ở lần xóa trước` (đã pha xong). Kho: `RELEASE` (trả `ReservedQty` + `OrderIngredients`), `WASTE` (dòng `WasteLogs` lý do `OTHER` gắn `VoidId`, không trừ tồn), `RESTOCK` (dòng `VOID_BACK` theo giá vốn đã trừ, tính lại `AvgCost` bình quân; lô mới nguồn `RESTOCK` mã "Xóa món #…" nếu nguyên liệu theo lô). Ghi `OrderItemVoids`. Bỏ hết dòng → xóa dòng + dòng con + tùy chọn + lượt dùng khuyến mãi dòng; bỏ một phần → cập nhật `Quantity`, `LineDiscount`, `CogsAmount`, SL dòng con, lượt dùng khuyến mãi dòng. `@Delete = 0` giữ dòng (hủy cả đơn) và chuyển `CogsAmount` sang `CogsReduction` | Đơn đã khóa bởi SP gọi; Ingredients (UPDLOCK, HOLDLOCK) → IngredientLots | 50182, 50185 |
| `sp_RecalcOrder` (mới) | Tính lại `SubtotalAmount` / `TotalAmount` từ dòng cấp trên còn lại. Khuyến mãi đơn đã áp tính lại theo `Promotions.Type` / `Value` / `MinOrderAmount`; dưới tối thiểu → xóa lượt dùng, `OrderPromotionId = NULL`. Hết dòng → đơn `CANCELLED`, trả nốt phần còn giữ | Ingredients (UPDLOCK, HOLDLOCK) | — |
| `sp_CloseIfSettled` (mới) | Phiên **đã có lượt thu** (chia bill): đơn còn toàn dòng đã thu → `PAID`; không còn đơn chưa thu nào → phiên `CLOSED` như lượt thu phần cuối, các phần chia bill → `PAID`. Phiên chưa có lượt thu thì giữ mở (dùng Đóng bàn trống / Hủy bàn) | Trong transaction của SP gọi (phiên đã khóa) | — |
| `sp_VoidOrderItem` (mới) | `@OrderItemId, @NewQty, @UserId, @ApprovedBy, @Reason, @StockMode, OUT @OrderId, OUT @OrderStatus, OUT @SessionClosed`. Chỉ dòng chưa thu của đơn tại bàn `PENDING` / `PREPARING` / `COMPLETED`, phiên chưa đóng; `@NewQty` 0…SL hiện tại − 1; đơn khác `PENDING` mà `@ApprovedBy` NULL → 50183 (kiểm **sau khi khóa**, nên đơn vừa được tiếp nhận cũng bị chặn). Gọi `sp_VoidLineCore` → `sp_RecalcOrder` → `sp_CloseIfSettled` | Sessions (UPDLOCK, HOLDLOCK) → Orders (UPDLOCK, HOLDLOCK) → Ingredients (+ lô) | 50181, 50182, 50183, 50185, 50186 |
| `sp_CancelOrders` (mới) | `@SessionId, @OrderId NULL, @UserId, @ApprovedBy, @Reason, @StockMode, OUT @Cancelled, OUT @SessionClosed`. `@OrderId` có giá trị = **xóa cả đơn** (đơn có dòng đã thu → 50181); `@OrderId NULL` = **hủy bàn**: mọi đơn chưa thu → `CANCELLED`, đóng phiên không tạo lượt thu, ghi `CancelledBy` / `CancelReason` (phiên đã có `Payments` → 50184). Mỗi dòng gọi `sp_VoidLineCore @Delete = 0` (giữ dòng làm lịch sử) | Sessions → Orders → Ingredients (+ lô) | 50004, 50005, 50031, 50181, 50183, 50184, 50186 |
| `sp_RefundPayment` (sửa) | Khi hoàn kho, lượng đã `VOID_BACK` và lượng đã ghi hủy hàng khi xóa món (`WasteLogs` gắn `VoidId`) **không** được hoàn lần nữa | Như cũ | — |

**Thứ tự khóa:** Sessions → Orders → Ingredients → IngredientLots — cùng thứ tự với gửi đơn, thu tiền, hoàn tất. Deadlock `1205` được app retry (`withDeadlockRetry`).

### Bất biến được test tự động (bổ sung vào `inventoryViolations`)

| Mã vi phạm | Điều kiện phải đúng | Feature |
| --- | --- | --- |
| `COGS_MISMATCH` (sửa) | Đơn có giá vốn: Σ `OrderItems.CogsAmount` = làm tròn Σ `CostAmount` các dòng `DEDUCT` − Σ `OrderItemVoids.CogsReduction` của đơn | F-031, F-046 |
| `OVER_RESTOCK` | Mỗi đơn × nguyên liệu: `RESTOCK` + `VOID_BACK` + lượng ghi hủy khi xóa món (`WasteLogs` gắn `VoidId`) ≤ lượng `DEDUCT` | F-046 |
| `ORDER_LINES_MISMATCH` | Đơn không hủy: `SubtotalAmount` = Σ `Quantity × ListPrice` dòng cấp trên; `TotalAmount` = Σ `Quantity × UnitPrice` dòng cấp trên − lượt dùng khuyến mãi đơn | F-046 |

<a id="erd-mo-rong"></a>

## ERD mở rộng (giai đoạn 2–F-047) — cập nhật 20/10/2026

> **Nguồn:** sinh từ các câu `CREATE TABLE` và `REFERENCES` / `FOREIGN KEY` trong `cơ-sở-dữ-liệu/chuyển-đổi/0001_init.sql` … `0033_sua_xoa_mon.sql` (đọc ngày 20/10/2026, TASK-057 bước 10). **Trạng thái:** mô tả schema **đã triển khai** (DB dev `CafeQrDev` đã áp tới `0033`); không đổi schema. Không xóa nội dung cũ ở trên.

**Quy mô:** 70 bảng = 13 bảng của `0001` + 57 bảng thêm ở `0003`…`0033` (`0002`, `0004`, `0009`, `0010`, `0014`, `0025` chỉ thêm cột / ràng buộc, không tạo bảng). 159 cột khóa ngoại: 14 cột đã có trong sơ đồ 11.1 (13 đường, `Users → Orders` gộp `CreatedBy` / `CompletedBy`) + 145 quan hệ trong bốn sơ đồ dưới. Migration khai báo 160 lần vì `0005` xóa rồi tạo lại FK `MenuItems.CategoryId`.

**Quy ước:**

- Mỗi bảng chỉ liệt kê cột PK / FK; cột nghiệp vụ xem bảng migration ở các mục trên.
- `||--o{` = khóa ngoại **NOT NULL**; `|o--o{` = khóa ngoại **cho phép NULL**; `||--o|` = khóa ngoại đồng thời là PK (quan hệ 1–0..1).
- Nhãn quan hệ = tên cột khóa ngoại ở bảng con; "(00xx)" = cột / FK được thêm vào bảng **có sẵn** ở migration đó.
- Bảng của `0001` (`Users`, `Tables`, `Sessions`, `Orders`, `OrderItems`, `Payments`, `MenuItems`, `Categories`, `Ingredients`, `InventoryTransactions`…) xuất hiện trong sơ đồ dưới chỉ để nối quan hệ, không vẽ lại cột.

**Cột cố ý không có khóa ngoại:** `AuditLogs.UserId` (giữ nhật ký khi tài khoản bị xóa hẳn); `OrderItemVoids.OrderItemId` (dòng món có thể đã bị xóa); `IngredientLots.SourceId` (trỏ theo `Source`: phiếu nhập / mẻ sơ chế / điều chỉnh / hoàn kho); `SessionClients.ClientToken`, `SessionSplits.ClientToken` (cookie thiết bị, không phải bảng). Bảng không có khóa ngoại nào: `Settings`, `JobRuns`, `AuditLogs`, `FixedCosts`, `DailySummaries`.

### 1. Bán hàng, thực đơn, thu tiền (`0005`–`0008`, `0011`, `0012`, `0016`–`0018`, `0033`) và quan hệ `0001` chưa vẽ ở 11.1

Ghi chú: `0005` đổi `MenuItems.CategoryId` thành cho phép NULL (combo không thuộc danh mục; `CK_MenuItems_Category` buộc món `SINGLE` phải có danh mục). `Payments.SessionId` / `Payments.OrderId` đều cho phép NULL (lượt thu bàn hoặc mang đi).

```mermaid
erDiagram
  Users |o--o{ Sessions : "ClosedBy"
  Tables |o--o{ Orders : "TableId"
  Users |o--o{ Orders : "CancelledBy"
  Orders ||--o{ OrderIngredients : "OrderId"
  Ingredients ||--o{ OrderIngredients : "IngredientId"
  Users ||--o{ Payments : "ReceivedBy"
  Users |o--o{ InventoryTransactions : "CreatedBy"
  MenuItems ||--o{ ComboComponents : "ComboMenuItemId"
  MenuItems ||--o{ ComboComponents : "ComponentMenuItemId"
  OrderItems |o--o{ OrderItems : "ParentOrderItemId (0005)"
  Promotions ||--o{ PromotionTargets : "PromotionId"
  MenuItems |o--o{ PromotionTargets : "MenuItemId"
  Categories |o--o{ PromotionTargets : "CategoryId"
  Promotions |o--o{ OrderItems : "PromotionId (0006)"
  Promotions |o--o{ Orders : "OrderPromotionId (0006)"
  Promotions ||--o{ PromotionUsages : "PromotionId"
  Orders ||--o{ PromotionUsages : "OrderId"
  OrderItems |o--o{ PromotionUsages : "OrderItemId"
  ModifierGroups ||--o{ ModifierOptions : "GroupId"
  ModifierOptions ||--o{ ModifierOptionBom : "OptionId"
  Ingredients ||--o{ ModifierOptionBom : "IngredientId"
  MenuItems ||--o{ MenuItemModifierGroups : "MenuItemId"
  ModifierGroups ||--o{ MenuItemModifierGroups : "GroupId"
  OrderItems ||--o{ OrderItemModifiers : "OrderItemId"
  ModifierOptions ||--o{ OrderItemModifiers : "OptionId"
  Users |o--o{ Payments : "ApprovedBy (0009)"
  Sessions ||--o{ StaffCalls : "SessionId"
  Users |o--o{ StaffCalls : "HandledBy"
  Payments ||--o{ Refunds : "PaymentId"
  Users ||--o{ Refunds : "ApprovedBy"
  Users ||--o{ Refunds : "CreatedBy"
  Shifts |o--o{ Refunds : "ShiftId"
  Users |o--o{ Sessions : "OpenedBy (0014)"
  Users |o--o{ Sessions : "NoteUpdatedBy (0014)"
  Categories |o--o{ MenuSchedules : "SourceCategoryId"
  MenuSchedules ||--o{ MenuScheduleItems : "ScheduleId"
  MenuItems |o--o{ MenuScheduleItems : "MenuItemId"
  Categories |o--o{ MenuScheduleItems : "CategoryId"
  MenuItems ||--o| ItemPrepStats : "MenuItemId"
  Sessions ||--o{ SessionSplits : "SessionId"
  Members |o--o{ SessionSplits : "MemberId"
  Payments |o--o{ SessionSplits : "PaymentId"
  SessionSplits |o--o{ OrderItems : "SplitId (0018)"
  Payments |o--o{ OrderItems : "PaymentId (0018)"
  SessionSplits |o--o{ Payments : "SplitId (0018)"
  Orders ||--o{ OrderItemVoids : "OrderId"
  Sessions |o--o{ OrderItemVoids : "SessionId"
  MenuItems ||--o{ OrderItemVoids : "MenuItemId"
  Users |o--o{ OrderItemVoids : "ApprovedBy"
  Users ||--o{ OrderItemVoids : "CreatedBy"
  OrderItemVoids |o--o{ InventoryTransactions : "VoidId (0033)"
  Users |o--o{ Sessions : "CancelledBy (0033)"
  ComboComponents {
    int ComboMenuItemId PK, FK
    int ComponentMenuItemId PK, FK
  }
  ModifierGroups {
    int GroupId PK
  }
  ModifierOptions {
    int OptionId PK
    int GroupId FK
  }
  ModifierOptionBom {
    int OptionId PK, FK
    int IngredientId PK, FK
  }
  MenuItemModifierGroups {
    int MenuItemId PK, FK
    int GroupId PK, FK
  }
  OrderItemModifiers {
    int OrderItemId PK, FK
    int OptionId PK, FK
  }
  Promotions {
    int PromotionId PK
  }
  PromotionTargets {
    int TargetId PK
    int PromotionId FK
    int MenuItemId FK
    int CategoryId FK
  }
  PromotionUsages {
    bigint UsageId PK
    int PromotionId FK
    int OrderId FK
    int OrderItemId FK
  }
  MenuSchedules {
    int ScheduleId PK
    int SourceCategoryId FK
  }
  MenuScheduleItems {
    int ScheduleItemId PK
    int ScheduleId FK
    int MenuItemId FK
    int CategoryId FK
  }
  ItemPrepStats {
    int MenuItemId PK, FK
  }
  StaffCalls {
    int CallId PK
    uniqueidentifier SessionId FK
    int HandledBy FK
  }
  SessionSplits {
    int SplitId PK
    uniqueidentifier SessionId FK
    int MemberId FK
    int PaymentId FK
  }
  Refunds {
    int RefundId PK
    int PaymentId FK
    int ApprovedBy FK
    int CreatedBy FK
    int ShiftId FK
  }
  OrderItemVoids {
    int VoidId PK
    int OrderId FK
    uniqueidentifier SessionId FK
    int MenuItemId FK
    int ApprovedBy FK
    int CreatedBy FK
  }
```

### 2. Kho (`0013`, `0019`–`0024`, `0033`)

```mermaid
erDiagram
  Users ||--o{ StockReceipts : "ReceivedBy"
  StockReceipts ||--o{ StockReceiptLines : "ReceiptId"
  Ingredients ||--o{ StockReceiptLines : "IngredientId"
  Users ||--o{ Stocktakes : "CountedBy"
  Users |o--o{ Stocktakes : "PostedBy"
  Stocktakes ||--o{ StocktakeLines : "StocktakeId"
  Ingredients ||--o{ StocktakeLines : "IngredientId"
  StockReceipts |o--o{ InventoryTransactions : "StockReceiptId (0013)"
  Stocktakes |o--o{ InventoryTransactions : "StocktakeId (0013)"
  Units |o--o{ Units : "BaseUnitCode"
  Units |o--o{ Ingredients : "BaseUnitCode (0019)"
  Units |o--o{ StockReceiptLines : "PackUnitCode"
  Ingredients ||--o| SemiRecipes : "SemiIngredientId"
  SemiRecipes ||--o{ SemiRecipeLines : "SemiIngredientId"
  Ingredients ||--o{ SemiRecipeLines : "InputIngredientId"
  Ingredients ||--o{ PrepBatches : "SemiIngredientId"
  Users ||--o{ PrepBatches : "PreparedBy"
  PrepBatches |o--o{ InventoryTransactions : "PrepBatchId (0020)"
  Ingredients ||--o{ WasteLogs : "IngredientId"
  Users ||--o{ WasteLogs : "CreatedBy"
  WasteLogs |o--o{ InventoryTransactions : "WasteId (0021)"
  Ingredients ||--o{ IngredientLots : "IngredientId"
  IngredientLots |o--o{ InventoryTransactions : "LotId (0022)"
  IngredientLots |o--o{ WasteLogs : "LotId"
  Suppliers ||--o{ SupplierIngredients : "SupplierId"
  Ingredients ||--o{ SupplierIngredients : "IngredientId"
  Units ||--o{ SupplierIngredients : "PackUnitCode"
  Suppliers ||--o{ PurchaseOrders : "SupplierId"
  Users ||--o{ PurchaseOrders : "CreatedBy"
  PurchaseOrders ||--o{ PurchaseOrderLines : "PoId"
  Ingredients ||--o{ PurchaseOrderLines : "IngredientId"
  Units ||--o{ PurchaseOrderLines : "PackUnitCode"
  Suppliers ||--o{ SupplierPriceHistory : "SupplierId"
  Ingredients ||--o{ SupplierPriceHistory : "IngredientId"
  StockReceipts |o--o{ SupplierPriceHistory : "ReceiptId"
  PurchaseOrders |o--o{ StockReceipts : "PoId"
  Suppliers |o--o{ StockReceipts : "SupplierId"
  PurchaseOrderLines |o--o{ StockReceiptLines : "PoLineId"
  IngredientLots |o--o{ StockReceiptLines : "LotId"
  Ingredients ||--o{ DemandForecasts : "IngredientId"
  OrderItemVoids |o--o{ WasteLogs : "VoidId"
  StockReceipts {
    int ReceiptId PK
    int ReceivedBy FK
    int PoId FK
    int SupplierId FK
  }
  StockReceiptLines {
    int ReceiptId PK, FK
    int IngredientId PK, FK
    nvarchar PackUnitCode FK
    int PoLineId FK
    int LotId FK
  }
  Stocktakes {
    int StocktakeId PK
    int CountedBy FK
    int PostedBy FK
  }
  StocktakeLines {
    int StocktakeId PK, FK
    int IngredientId PK, FK
  }
  Units {
    nvarchar UnitCode PK
    nvarchar BaseUnitCode FK
  }
  SemiRecipes {
    int SemiIngredientId PK, FK
  }
  SemiRecipeLines {
    int SemiIngredientId PK, FK
    int InputIngredientId PK, FK
  }
  PrepBatches {
    int BatchId PK
    int SemiIngredientId FK
    int PreparedBy FK
  }
  WasteLogs {
    int WasteId PK
    int IngredientId FK
    int CreatedBy FK
    int LotId FK
    int VoidId FK
  }
  IngredientLots {
    int LotId PK
    int IngredientId FK
  }
  Suppliers {
    int SupplierId PK
  }
  SupplierIngredients {
    int SupplierId PK, FK
    int IngredientId PK, FK
    nvarchar PackUnitCode FK
  }
  PurchaseOrders {
    int PoId PK
    int SupplierId FK
    int CreatedBy FK
  }
  PurchaseOrderLines {
    int PoLineId PK
    int PoId FK
    int IngredientId FK
    nvarchar PackUnitCode FK
  }
  SupplierPriceHistory {
    int PriceId PK
    int SupplierId FK
    int IngredientId FK
    int ReceiptId FK
  }
  DemandForecasts {
    int IngredientId PK, FK
    date ForecastDate PK
  }
```

### 3. Hội viên, tích lũy, marketing (`0003`, `0015`, `0029`–`0031`)

```mermaid
erDiagram
  MemberTiers ||--o{ Members : "TierCode"
  Members |o--o{ Sessions : "MemberId (0003)"
  Members |o--o{ Orders : "MemberId (0003)"
  Members |o--o{ Payments : "MemberId (0003)"
  Members ||--o{ MemberTransactions : "MemberId"
  Payments ||--o{ MemberTransactions : "PaymentId"
  Members ||--o{ MemberFavorites : "MemberId"
  MenuItems ||--o{ MemberFavorites : "MenuItemId"
  Members ||--o{ PointTransactions : "MemberId"
  Payments |o--o{ PointTransactions : "PaymentId"
  Users |o--o{ PointTransactions : "CreatedBy"
  MenuItems |o--o{ RewardCatalog : "MenuItemId"
  Members ||--o{ RewardRedemptions : "MemberId"
  RewardCatalog ||--o{ RewardRedemptions : "RewardId"
  Payments ||--o{ RewardRedemptions : "PaymentId"
  MenuItems |o--o{ StampPrograms : "RewardMenuItemId"
  StampPrograms ||--o{ StampProgramItems : "ProgramId"
  MenuItems ||--o{ StampProgramItems : "MenuItemId"
  Members ||--o{ StampCards : "MemberId"
  StampPrograms ||--o{ StampCards : "ProgramId"
  Members ||--o{ StampEvents : "MemberId"
  StampPrograms ||--o{ StampEvents : "ProgramId"
  Payments |o--o{ StampEvents : "PaymentId"
  Users |o--o{ StampEvents : "CreatedBy"
  RewardCatalog |o--o{ Payments : "RewardId (0029)"
  StampPrograms |o--o{ Payments : "StampProgramId (0029)"
  Members |o--o{ Members : "ReferredByMemberId"
  Members |o--o{ Vouchers : "MemberId"
  Promotions |o--o{ Vouchers : "PromotionId"
  Payments |o--o{ Vouchers : "UsedPaymentId"
  Payments |o--o{ Vouchers : "IssuedForPaymentId"
  Users |o--o{ Vouchers : "CreatedBy"
  Vouchers |o--o{ Payments : "VoucherId (0030)"
  Users |o--o{ Segments : "CreatedBy"
  Segments ||--o{ Campaigns : "SegmentId"
  Users |o--o{ Campaigns : "CreatedBy"
  Campaigns ||--o{ CampaignDeliveries : "CampaignId"
  Members ||--o{ CampaignDeliveries : "MemberId"
  Vouchers |o--o{ CampaignDeliveries : "VoucherId"
  Campaigns |o--o{ Vouchers : "CampaignId"
  MemberTiers {
    varchar TierCode PK
  }
  Members {
    int MemberId PK
    varchar TierCode FK
    int ReferredByMemberId FK
  }
  MemberTransactions {
    bigint TxnId PK
    int MemberId FK
    int PaymentId FK
  }
  MemberFavorites {
    int MemberId PK, FK
    int MenuItemId PK, FK
  }
  PointTransactions {
    bigint PtId PK
    int MemberId FK
    int PaymentId FK
    int CreatedBy FK
  }
  RewardCatalog {
    int RewardId PK
    int MenuItemId FK
  }
  RewardRedemptions {
    int RedId PK
    int MemberId FK
    int RewardId FK
    int PaymentId FK
  }
  StampPrograms {
    int ProgramId PK
    int RewardMenuItemId FK
  }
  StampProgramItems {
    int ProgramId PK, FK
    int MenuItemId PK, FK
  }
  StampCards {
    int MemberId PK, FK
    int ProgramId PK, FK
  }
  StampEvents {
    bigint EventId PK
    int MemberId FK
    int ProgramId FK
    int PaymentId FK
    int CreatedBy FK
  }
  Vouchers {
    int VoucherId PK
    int MemberId FK
    int PromotionId FK
    int UsedPaymentId FK
    int CampaignId FK
    int IssuedForPaymentId FK
    int CreatedBy FK
  }
  Segments {
    int SegmentId PK
    int CreatedBy FK
  }
  Campaigns {
    int CampaignId PK
    int SegmentId FK
    int CreatedBy FK
  }
  CampaignDeliveries {
    int DeliveryId PK
    int CampaignId FK
    int MemberId FK
    int VoucherId FK
  }
```

### 4. Ca, sổ quỹ, nhân sự, hệ thống (`0003` `Settings`, `0008`, `0017` `JobRuns`, `0026`–`0028`, `0032`)

```mermaid
erDiagram
  Users ||--o{ Shifts : "OpenedBy"
  Users |o--o{ Shifts : "ClosedBy"
  Shifts |o--o{ Payments : "ShiftId (0008)"
  Shifts ||--o{ CashTransactions : "ShiftId"
  CashCategories ||--o{ CashTransactions : "CategoryId"
  Users ||--o{ CashTransactions : "CreatedBy"
  Users |o--o{ CashTransactions : "ApprovedBy"
  Users ||--o{ Attendance : "UserId"
  Shifts |o--o{ Attendance : "ShiftId"
  Users |o--o{ Attendance : "EditedBy"
  Users ||--o{ Rosters : "UserId"
  Users ||--o{ Rosters : "CreatedBy"
  Settings {
    nvarchar SettingKey PK
  }
  Shifts {
    int ShiftId PK
    int OpenedBy FK
    int ClosedBy FK
  }
  CashCategories {
    int CategoryId PK
  }
  CashTransactions {
    int CashTxnId PK
    int ShiftId FK
    int CategoryId FK
    int CreatedBy FK
    int ApprovedBy FK
  }
  Attendance {
    int AttId PK
    int UserId FK
    int ShiftId FK
    int EditedBy FK
  }
  Rosters {
    int RosterId PK
    int UserId FK
    int CreatedBy FK
  }
  AuditLogs {
    bigint AuditId PK
  }
  FixedCosts {
    int CostId PK
  }
  DailySummaries {
    date SummaryDate PK
  }
  JobRuns {
    bigint RunId PK
  }
```

## Sửa / hủy phiếu kho (FEATURE-048, ADR-009, 21/10/2026)

### Migration 0034

| File | Feature | Thay đổi |
| --- | --- | --- |
| `0034_sua_huy_phieu_kho.sql` | F-048 | `StockReceipts` + `Status` (`POSTED` / `VOIDED`, mặc định `POSTED`), `VoidedBy / VoidedAt / VoidReason`, `EditedBy / EditedAt / EditReason`; `Stocktakes`: `CK_Stocktakes_Status` thêm `VOIDED`, + `VoidedBy / VoidedAt / VoidReason`; chỉ mục `IX_ReceiptLines_Ingredient` |

Chỉ thêm cột / mở rộng CHECK — phiếu cũ thành `POSTED`, dữ liệu không đổi. `0035_chi_muc_phieu_kho.sql` (review G3): chỉ mục lọc `IX_InvTxn_Receipt (StockReceiptId, IngredientId)`, `IX_InvTxn_Stocktake (StocktakeId, IngredientId)`. Migration kế tiếp: `0036`.

### SP

| SP | Mô tả |
| --- | --- |
| `sp_ReviseStockReceipt` (mới) | `@ReceiptId, @UserId, @Mode ('EDIT' / 'VOID'), @Reason, @Supplier, @Note, @LinesJson, @ConfirmOver`. Một transaction, khóa phiếu + nguyên liệu (`UPDLOCK, HOLDLOCK`). Dòng đổi = bỏ dòng cũ + nhập dòng mới; `IMPORT` "+ mới" trước, "− cũ" sau. Giá vốn bình quân tính ngược: phần còn lại = tồn × `AvgCost` − SL cũ × giá trên dòng `IMPORT` gốc; còn hàng và giá trị > 0 → bình quân với dòng mới, không thì giá dòng mới hoặc giữ nguyên. Giá nhập gần nhất tính lại khi phiếu là lần nhập có giá mới nhất. Lô: đóng lô dòng cũ (phải còn nguyên), dòng mới → lô `RECEIPT`. PO: `ReceivedBaseQty` −cũ +mới, trạng thái `SENT` / `PARTIAL` / `RECEIVED`. Lịch sử giá NCC: bỏ giá của phiếu, sửa → ghi lại (`RecordedAt` = lúc nhập gốc), `LastPrice` = lần ghi mới nhất còn lại |
| `sp_VoidStocktake` (mới) | `@StocktakeId, @UserId, @Reason`. Phiếu `POSTED`, là lần chốt gần nhất của mọi nguyên liệu trong phiếu, không có phiếu nháp chứa nguyên liệu, phần thừa còn đủ. `ADJUST` = −chênh lệch (cùng `StocktakeId`); lô: thiếu → trả đúng lô đã trừ (phần không có lô → lô `ADJUST` mới), thừa → trừ lô `ADJUST` của phiếu trước rồi FEFO. Phiếu → `VOIDED` |
| `sp_DeleteUser` (sửa) | Thêm lịch sử: `StockReceipts.VoidedBy / EditedBy`, `Stocktakes.VoidedBy` |

### Bất biến mới (kiểm sau mọi bộ test — `tests/helpers/testDb.js`)

| Mã | Bất biến | Feature |
| --- | --- | --- |
| `RECEIPT_LEDGER_MISMATCH` | Σ `IMPORT.Delta` của phiếu nhập = Σ `StockReceiptLines.Qty` (phiếu `POSTED`) hoặc 0 (phiếu `VOIDED`) | F-023, F-048 |
| `STOCKTAKE_LEDGER_MISMATCH` | Σ `Delta` giao dịch của phiếu kiểm kê = Σ `Diff` (phiếu `POSTED`) hoặc 0 (phiếu `VOIDED`) | F-023, F-048 |
| `PO_RECEIVED_MISMATCH` | `PurchaseOrderLines.ReceivedBaseQty` = Σ dòng phiếu nhập `POSTED` trỏ vào dòng PO | F-030, F-048 |

Báo cáo: hao hụt (`shrinkage`) vốn chỉ lấy phiếu `POSTED`; thất thoát (`lossReport`) chỉ tính giao dịch của phiếu `POSTED` (nối `Stocktakes`); "lần kiểm kê gần nhất" (`dashboardRepo.todos`) chỉ `POSTED`; hủy PO chỉ tính phiếu nhập `POSTED`.

## Chuyển bàn (FEATURE-049, ADR-010, 21/10/2026)

| Thành phần | Nội dung |
| --- | --- |
| Migration `0036_chuyen_ban.sql` | `SessionTableMoves (MoveId PK, SessionId FK, FromTableId FK, ToTableId FK, MovedBy FK Users, MovedAt)`, `CK_Moves_Tables (FromTableId <> ToTableId)`, chỉ mục `(SessionId, MoveId)` |
| SP `sp_MoveSession` | `@SessionId, @ToTableId, @UserId, OUT @FromTableId`. Khóa phiên (`UPDLOCK, HOLDLOCK` — chạy tuần tự với `sp_SubmitOrder` vốn khóa phiên trước khi đọc bàn) + bàn đích; đổi `Sessions.TableId`, `Orders.TableId` mọi đơn của phiên; ghi lịch sử |
| Bất biến `ORDER_TABLE_MISMATCH` | Đơn có `SessionId` luôn có `TableId` = bàn hiện tại của phiên (kiểm sau mọi bộ test) |
| `sp_DeleteTable`, `sp_DeleteUser` (sửa — review G3) | Bàn từng là bàn cũ / mới, tài khoản từng chuyển bàn → xóa mềm (lịch sử `SessionTableMoves` giữ khóa ngoại) |
| `sp_MoveSession @ExpectedFromTableId` | Bàn máy quầy đang thấy; khác bàn hiện tại → `50205 SESSION_MOVED` |

## Hủy / sửa khoản sổ quỹ (FEATURE-050, ADR-010, 21/10/2026)

| Thành phần | Nội dung |
| --- | --- |
| Migration `0037_huy_khoan_so_quy.sql` | `CK_CashTxn_Status` thêm `VOIDED`; `CashTransactions` + `VoidedBy` (FK Users), `VoidedAt`, `VoidReason`, `ReplacedById`, `ReplacesId` (FK tự tham chiếu); `CK_CashTxn_Voided` (khoản `VOIDED` phải có người / lúc / lý do); `UX_CashTxn_Replaces` (duy nhất, lọc `ReplacesId IS NOT NULL`) |
| SP `sp_VoidCashTxn` | `@CashTxnId, @UserId (người duyệt), @ActorId (người đứng máy), @Reason, @NewCategoryId?, @NewAmount?, @NewReason?, @Threshold, OUT @NewTxnId, OUT @NewStatus`. Khóa khoản (`UPDLOCK, HOLDLOCK`) + ca (`HOLDLOCK`, như `sp_CreateCashTxn` → tuần tự với `sp_CloseShift`); chỉ `APPROVED` của ca mở; khoản thay thế theo quy tắc ghi khoản |
| `sp_DeleteUser` (sửa) | `CashTransactions.VoidedBy` là lịch sử |
| Bất biến `CASH_REPLACE_LINK` | Hai chiều: khoản có `ReplacesId` → khoản bị thay `VOIDED` và `ReplacedById` trỏ ngược lại; khoản có `ReplacedById` → đã `VOIDED` và khoản thay thế trỏ ngược lại |

Tiền dự kiến (`sp_CloseShift`), ca (`shiftsRepo`), sổ quỹ (`cashService.book`), lãi / lỗ (`pnlRepo`) vốn chỉ tính `APPROVED` → không phải sửa. 

## Đánh giá món (FEATURE-051, ADR-010, 21/10/2026)

| Thành phần | Nội dung |
| --- | --- |
| Migration `0038_danh_gia.sql` | `Reviews (ReviewId PK, SessionId FK, ClientToken CHAR(32), Comment NVARCHAR(300), HasLow, HandledBy FK Users, HandledAt, CreatedAt)`, `UQ_Reviews_SessionClient (SessionId, ClientToken)`; `ReviewItems (ReviewId FK, MenuItemId FK, Stars TINYINT CHECK 1–5, PK (ReviewId, MenuItemId))`; Settings `review.menu_min_count = 5`, `review.menu_days = 90` |
| Ghi | `reviewsRepo.create`: một transaction (đánh giá + các dòng sao); trùng điện thoại / phiên → lỗi khóa duy nhất 2627 / 2601 → `409 ALREADY_REVIEWED` |
| Sao trên menu | `reviewsRepo.ratingsSince`: trung bình theo (phiên, món) rồi theo món, số lượt = số phiên; lọc ngưỡng ở `reviewService.menuRatings` (cache 60 giây, xóa khi có đánh giá mới / đổi ngưỡng) |
| `sp_DeleteUser` (sửa) | `Reviews.HandledBy` là lịch sử |

Không có SP mới. Migration kế tiếp: `0039`.

## Chuyển khoản, thu chung nhiều bàn, tách hóa đơn (FEATURE-056…058, ADR-019, 24/10/2026)

| Thành phần | Nội dung |
| --- | --- |
| Migration `0039_chuyen_khoan_gop_hoa_don.sql` | `CK_Payments_Method` và `CK_Orders_PaymentMethod` nới thành `('CASH','TRANSFER')`; `Sessions.MergedIntoSessionId UNIQUEIDENTIFIER NULL` FK tự tham chiếu + `IX_Sessions_MergedInto` (lọc khác NULL). Không đổi dữ liệu cũ |
| `sp_SettleSession`, `sp_SettleSplit` (sửa) | Tham số `@Method` (`CASH` mặc định / `TRANSFER`); chuyển khoản → `AmountReceived = AmountDue`; ghi `Payments.Method`, `Orders.PaymentMethod` |
| `sp_SubmitOrder` (sửa) | Mang đi nhận `@PaymentMethod` `CASH` / `TRANSFER` (chuyển khoản: `AmountReceived = AmountDue`) |
| `sp_CloseShift` (sửa) | `ExpectedCash` chỉ cộng lượt `CASH`, chỉ trừ hoàn tiền của lượt `CASH` (BR-089) |
| `sp_MergeSessions` (mới) | `@TargetSessionId, @SourceIds (CSV ≤ 10), @UserId`. Khóa phiên đích rồi phiên nguồn (UPDLOCK); kiểm còn mở, không chia bill; `Orders.SessionId` → phiên đích (**giữ `Orders.TableId`**); chép `SessionClients`; đóng phiên nguồn + `MergedIntoSessionId`. Service gọi rồi `sp_SettleSession` **trong cùng transaction** (`sessionsRepo.mergeAndSettle`) |
| Tách hóa đơn | `splitsRepo.separate`: một transaction — (bàn chưa chia: phần "Chung") + phần mới + chuyển dòng; còn món chưa chọn → phần "Phần còn lại" |
| Bất biến (test) | `ORDER_TABLE_MISMATCH` cho phép đơn giữ bàn của phiên đã gộp vào; mới `MERGED_SESSION_STATE`, `TRANSFER_WITH_CHANGE`; `SHIFT_EXPECTED_CASH` theo công thức tiền mặt |

Migration kế tiếp: `0040` (đã dùng cho F-060 — xem mục dưới).

## Phát hiện bất thường, cảnh báo qua email (FEATURE-060, ADR-020, 27/10/2026)

| Thành phần | Nội dung |
| --- | --- |
| Migration `0040_canh_bao_bat_thuong.sql` | `Alerts (AlertId PK, Kind CHECK ('CASH_DIFF','TRANSFER_SHARE','VOIDS','REFUNDS','MANUAL_DISCOUNT','BIG_REFUND','CASH_VOID'), Severity 'MEDIUM' / 'HIGH', ShiftId FK Shifts NULL, UserId FK Users NULL (người liên quan chính), Title NVARCHAR(200), Detail NVARCHAR(MAX) JSON, DedupeKey VARCHAR(100) UNIQUE, Status 'NEW' / 'SEEN' / 'RESOLVED', Note NVARCHAR(300), HandledBy FK Users, HandledAt, CreatedAt)`, chỉ mục `IX_Alerts_Status_At`, `IX_Alerts_At`. `AlertOutbox (OutboxId PK, Kind 'ALERT' / 'SHIFT' / 'DIGEST' / 'NOTICE' / 'TEST', AlertId FK NULL, DedupeKey VARCHAR(120) NULL — duy nhất khi khác NULL (`UX_Outbox_Dedupe`), Recipients NVARCHAR(600) (ảnh chụp người nhận lúc tạo), Subject, BodyText, BodyHtml, Status 'PENDING' / 'SENDING' / 'SENT' / 'FAILED', Attempts, NextAttemptAt DATETIME2(0), LastError NVARCHAR(400), CreatedAt, SentAt)`, chỉ mục `IX_Outbox_Due (Status, NextAttemptAt)`. Chỉ thêm bảng, không đổi bảng cũ |
| Khóa chống trùng | Cảnh báo: `SHIFT:{shiftId}:{KIND}`, `REFUND:{refundId}`, `CASHVOID:{cashTxnId}`. Email: `SHIFT:{shiftId}`, `ALERT:{alertId}`, `DIGEST:{yyyy-mm-dd}` (ngày của mốc gửi); thư báo đổi cài đặt / email thử không có khóa. Email thử gửi thẳng rồi ghi một dòng `Kind = 'TEST'`, `Status = 'SENT'` để tính vào giới hạn mỗi giờ; "Gửi lại email lỗi" đưa `FAILED` về `PENDING`, `Attempts = 0`. Trùng (lỗi 2601 / 2627) → bỏ qua, không lỗi |
| Nhận việc gửi | `alertsRepo.claimDue`: `UPDATE TOP (n) … WITH (ROWLOCK, READPAST, UPDLOCK) OUTPUT inserted.*` → `SENDING` (hai tiến trình không nhận trùng); dòng `SENDING` quá 10 phút được nhận lại. `NextAttemptAt` là `DATETIME2(0)` — SQL Server làm tròn **lên** tới giây, nên so `<= DATEADD(SECOND, 1, SYSUTCDATETIME())` |
| Số liệu ca | Một truy vấn cho ca + 30 ca đã đóng trước: số lượt thu / lượt chuyển khoản (`Payments.Method`), món đã pha bị hủy (`OrderItemVoids.StockMode = 'WASTE'`, gán ca theo giờ mở–đóng vì bảng không có `ShiftId`), lượt hoàn (`Refunds.ShiftId`), lượt giảm tay (`Payments.ManualDiscount > 0`) |
| `sp_DeleteUser` (sửa) | `Alerts.UserId` / `Alerts.HandledBy` là lịch sử → tài khoản chỉ xóa mềm (`ARCHIVED`) |
| Cài đặt | Khóa `alert.emails` (CSV), `alert.immediate`, `alert.shift_report`, `alert.daily_digest`, `alert.digest_time`, `alert.quiet_start`, `alert.quiet_end`, `alert.cash_diff_max`, `alert.transfer_share_max`, `alert.voids_max`, `alert.refunds_max`, `alert.refund_big`, `alert.manual_discount_max`, `alert.use_stats` trong `Settings` — mặc định trong code (`settingsService`), không cần dữ liệu khởi tạo. `Settings.UpdatedAt` của `alert.emails` là mốc để quyết định gửi bù tổng kết hôm qua |

Không có SP mới. Migration kế tiếp: `0041` (đã dùng cho F-061 — xem mục dưới).

## Chế độ cơ bản, hướng dẫn quầy, cảnh báo QR (FEATURE-061, FEATURE-063, ADR-021, 29/10/2026)

| Thành phần | Nội dung |
| --- | --- |
| Migration `0041_che_do_co_ban_huong_dan.sql` | `Users.TourSeenAt DATETIME2(0) NULL` — lúc xem xong / bỏ qua hướng dẫn 5 bước (`COALESCE` giữ lần đầu). Cùng lúc thêm cột: mọi tài khoản có sẵn đặt `TourSeenAt` = giờ chạy migration; CSDL đã có đơn và chưa có `ui.modules` → ghi `ui.modules` = cả 5 nhóm. Chỉ thêm |
| Cài đặt | `ui.modules` (CSV nhóm menu nâng cao đang bật; chưa có = chế độ cơ bản), `qr.printed_base_url`, `qr.printed_at` (địa chỉ máy chủ + giờ lúc quản lý in QR bàn gần nhất) trong `Settings` |
| Seed | `seedBase` tạo tài khoản với `TourSeenAt` = lúc tạo (chủ quán / nhân viên mẫu không thấy hướng dẫn); `seedDemo` ghi `ui.modules` đủ 5 nhóm |

Không có SP mới, không đổi bảng `Members` (đồng ý `ConsentAt` + ẩn danh đã có từ F-014). Migration kế tiếp: `0042`.
