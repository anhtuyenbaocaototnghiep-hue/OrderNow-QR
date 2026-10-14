# Data model và stored procedures

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §11.1–11.2 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

> **Cập nhật 14/10/2026 — đã triển khai.** Nguồn sự thật của schema/SP là `cơ-sở-dữ-liệu/chuyển-đổi/0001_init.sql` và `cơ-sở-dữ-liệu/thủ-tục/*.sql` (theo ADR-001…003). Phần DDL/SP dưới đây là **bản đề xuất ban đầu** giữ lại để đối chiếu; khác biệt khi triển khai ghi ở mục "Triển khai thực tế" cuối file.

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

### Bất biến được test tự động (`ứng-dụng/máy-chủ/tests/helpers/testDb.js` → `inventoryViolations`)

`StockQty ≥ 0` và `ReservedQty ≥ 0`; `ReservedQty = Σ OrderIngredients.Qty` của đơn `PENDING/PREPARING`; mỗi `(OrderId, IngredientId)` ≤ 1 dòng `DEDUCT`; không có đơn `UNPAID` (không hủy) trong phiên `CLOSED`.

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
