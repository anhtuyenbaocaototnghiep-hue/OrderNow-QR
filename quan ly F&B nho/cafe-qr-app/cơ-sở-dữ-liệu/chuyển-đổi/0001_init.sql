-- 0001_init — schema ban đầu (tài-liệu/kiến-trúc/data-model.md, ADR-001, ADR-003).
-- So với DDL đề xuất: thêm OrderIngredients (chụp lượng nguyên liệu giữ cho từng đơn — ADR-001),
-- Orders.CancelReason/CancelledBy (Q-010), Ingredients.IsActive (không xóa cứng), SessionId dùng NEWID().
-- Mọi DATETIME2 lưu UTC.

CREATE TABLE dbo.Users (
  UserId        INT IDENTITY PRIMARY KEY,
  Username      NVARCHAR(50)  NOT NULL,
  PasswordHash  NVARCHAR(255) NOT NULL,
  FullName      NVARCHAR(100) NOT NULL,
  Role          VARCHAR(10)   NOT NULL CONSTRAINT CK_Users_Role CHECK (Role IN ('STAFF','ADMIN')),
  IsActive      BIT           NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT 1,
  CreatedAt     DATETIME2(0)  NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME()
);
-- Database tạo với collation *_CI_* → không phân biệt hoa/thường (BR-004)
CREATE UNIQUE INDEX UX_Users_Username ON dbo.Users (Username);

CREATE TABLE dbo.Tables (
  TableId   INT IDENTITY PRIMARY KEY,
  Code      NVARCHAR(10) NOT NULL CONSTRAINT UQ_Tables_Code UNIQUE,
  Name      NVARCHAR(50) NOT NULL,
  QrToken   CHAR(32)     NOT NULL CONSTRAINT UQ_Tables_QrToken UNIQUE,
  IsActive  BIT          NOT NULL CONSTRAINT DF_Tables_IsActive DEFAULT 1
);

CREATE TABLE dbo.Sessions (
  SessionId          UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Sessions PRIMARY KEY CONSTRAINT DF_Sessions_Id DEFAULT NEWID(),
  TableId            INT NOT NULL CONSTRAINT FK_Sessions_Tables REFERENCES dbo.Tables(TableId),
  Status             VARCHAR(20) NOT NULL CONSTRAINT DF_Sessions_Status DEFAULT 'OPEN'
                       CONSTRAINT CK_Sessions_Status CHECK (Status IN ('OPEN','PAYMENT_REQUESTED','CLOSED')),
  OpenedAt           DATETIME2(0) NOT NULL CONSTRAINT DF_Sessions_OpenedAt DEFAULT SYSUTCDATETIME(),
  PaymentRequestedAt DATETIME2(0) NULL,
  ClosedAt           DATETIME2(0) NULL,
  ClosedBy           INT NULL CONSTRAINT FK_Sessions_ClosedBy REFERENCES dbo.Users(UserId)
);
-- Truy vấn: phiên mở của một bàn (quét QR), danh sách bàn đang phục vụ (POS)
CREATE INDEX IX_Sessions_Table_Status ON dbo.Sessions (TableId, Status);
CREATE INDEX IX_Sessions_Status ON dbo.Sessions (Status) INCLUDE (TableId, OpenedAt, PaymentRequestedAt);

CREATE TABLE dbo.SessionClients (
  SessionId   UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_SessionClients_Sessions REFERENCES dbo.Sessions(SessionId),
  ClientToken CHAR(32) NOT NULL,
  JoinedAt    DATETIME2(0) NOT NULL CONSTRAINT DF_SessionClients_JoinedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_SessionClients PRIMARY KEY (SessionId, ClientToken)
);
-- Truy vấn: client này đang thuộc phiên mở nào trên bàn (vào lại phiên cũ)
CREATE INDEX IX_SessionClients_Client ON dbo.SessionClients (ClientToken);

CREATE TABLE dbo.Categories (
  CategoryId INT IDENTITY PRIMARY KEY,
  Name       NVARCHAR(50) NOT NULL,
  SortOrder  INT NOT NULL CONSTRAINT DF_Categories_SortOrder DEFAULT 0
);

CREATE TABLE dbo.MenuItems (
  MenuItemId  INT IDENTITY PRIMARY KEY,
  CategoryId  INT NOT NULL CONSTRAINT FK_MenuItems_Categories REFERENCES dbo.Categories(CategoryId),
  Name        NVARCHAR(100) NOT NULL,
  Price       DECIMAL(12,0) NOT NULL CONSTRAINT CK_MenuItems_Price CHECK (Price >= 0),   -- VND nguyên
  ImageUrl    NVARCHAR(500) NULL,
  IsAvailable BIT NOT NULL CONSTRAINT DF_MenuItems_IsAvailable DEFAULT 1,           -- "hết món" tạm thời (admin bật/tắt)
  IsActive    BIT NOT NULL CONSTRAINT DF_MenuItems_IsActive DEFAULT 1               -- ẩn khỏi menu
);

CREATE TABLE dbo.Ingredients (
  IngredientId      INT IDENTITY PRIMARY KEY,
  Name              NVARCHAR(100) NOT NULL CONSTRAINT UQ_Ingredients_Name UNIQUE,
  Unit              NVARCHAR(10)  NOT NULL,
  StockQty          DECIMAL(18,3) NOT NULL CONSTRAINT DF_Ingredients_Stock DEFAULT 0,
  ReservedQty       DECIMAL(18,3) NOT NULL CONSTRAINT DF_Ingredients_Reserved DEFAULT 0,
  LowStockThreshold DECIMAL(18,3) NOT NULL CONSTRAINT DF_Ingredients_Low DEFAULT 0,
  IsActive          BIT NOT NULL CONSTRAINT DF_Ingredients_IsActive DEFAULT 1,
  CONSTRAINT CK_Ingredients_Stock     CHECK (StockQty >= 0),                              -- lưới an toàn BR-001
  CONSTRAINT CK_Ingredients_Reserved  CHECK (ReservedQty >= 0 AND ReservedQty <= StockQty),
  CONSTRAINT CK_Ingredients_Threshold CHECK (LowStockThreshold >= 0)
);

CREATE TABLE dbo.BomItems (
  MenuItemId   INT NOT NULL CONSTRAINT FK_BomItems_MenuItems REFERENCES dbo.MenuItems(MenuItemId),
  IngredientId INT NOT NULL CONSTRAINT FK_BomItems_Ingredients REFERENCES dbo.Ingredients(IngredientId),
  Amount       DECIMAL(18,3) NOT NULL CONSTRAINT CK_BomItems_Amount CHECK (Amount > 0),  -- BR-003
  CONSTRAINT PK_BomItems PRIMARY KEY (MenuItemId, IngredientId)
);
-- Truy vấn: món nào dùng nguyên liệu X (cập nhật trạng thái "hết món")
CREATE INDEX IX_BomItems_Ingredient ON dbo.BomItems (IngredientId);

CREATE TABLE dbo.Orders (
  OrderId        INT IDENTITY PRIMARY KEY,
  OrderCode      CHAR(8) NOT NULL CONSTRAINT UQ_Orders_OrderCode UNIQUE,   -- mã ngắn in trên bill/thẻ đơn (bỏ O/0/I/1)
  SessionId      UNIQUEIDENTIFIER NULL CONSTRAINT FK_Orders_Sessions REFERENCES dbo.Sessions(SessionId),
  TableId        INT NULL CONSTRAINT FK_Orders_Tables REFERENCES dbo.Tables(TableId),
  Type           VARCHAR(10) NOT NULL CONSTRAINT CK_Orders_Type CHECK (Type IN ('DINE_IN','TAKE_AWAY')),
  Status         VARCHAR(10) NOT NULL CONSTRAINT DF_Orders_Status DEFAULT 'PENDING'
                   CONSTRAINT CK_Orders_Status CHECK (Status IN ('PENDING','PREPARING','COMPLETED','CANCELLED')),
  PaymentStatus  VARCHAR(6)  NOT NULL CONSTRAINT DF_Orders_PaymentStatus DEFAULT 'UNPAID'
                   CONSTRAINT CK_Orders_PaymentStatus CHECK (PaymentStatus IN ('UNPAID','PAID')),
  PaymentMethod  VARCHAR(10) NULL CONSTRAINT CK_Orders_PaymentMethod CHECK (PaymentMethod IN ('CASH')),  -- mở rộng 'TRANSFER' sau (ADR-000)
  TotalAmount    DECIMAL(12,0) NOT NULL CONSTRAINT CK_Orders_Total CHECK (TotalAmount >= 0),
  Note           NVARCHAR(200) NULL,
  CreatedBy      INT NULL CONSTRAINT FK_Orders_CreatedBy REFERENCES dbo.Users(UserId),   -- NULL = khách
  CreatedAt      DATETIME2(0) NOT NULL CONSTRAINT DF_Orders_CreatedAt DEFAULT SYSUTCDATETIME(),
  AcceptedAt     DATETIME2(0) NULL,
  PaidAt         DATETIME2(0) NULL,
  CompletedAt    DATETIME2(0) NULL,
  CompletedBy    INT NULL CONSTRAINT FK_Orders_CompletedBy REFERENCES dbo.Users(UserId),
  CancelledAt    DATETIME2(0) NULL,
  CancelledBy    INT NULL CONSTRAINT FK_Orders_CancelledBy REFERENCES dbo.Users(UserId),
  CancelReason   NVARCHAR(200) NULL,
  RowVer         ROWVERSION,
  CONSTRAINT CK_Orders_DineInHasSession CHECK (Type = 'TAKE_AWAY' OR SessionId IS NOT NULL),
  CONSTRAINT CK_Orders_PaidHasMethod CHECK (PaymentStatus = 'UNPAID' OR (PaymentMethod IS NOT NULL AND PaidAt IS NOT NULL))
);
-- Truy vấn: dashboard theo trạng thái + mốc thời gian; đơn của phiên; báo cáo theo ngày thanh toán
CREATE INDEX IX_Orders_Status_CreatedAt ON dbo.Orders (Status, CreatedAt);
CREATE INDEX IX_Orders_Session ON dbo.Orders (SessionId);
CREATE INDEX IX_Orders_PaidAt ON dbo.Orders (PaidAt) WHERE PaymentStatus = 'PAID';

CREATE TABLE dbo.OrderItems (
  OrderItemId INT IDENTITY PRIMARY KEY,
  OrderId     INT NOT NULL CONSTRAINT FK_OrderItems_Orders REFERENCES dbo.Orders(OrderId),
  MenuItemId  INT NOT NULL CONSTRAINT FK_OrderItems_MenuItems REFERENCES dbo.MenuItems(MenuItemId),
  Quantity    INT NOT NULL CONSTRAINT CK_OrderItems_Quantity CHECK (Quantity BETWEEN 1 AND 50),  -- BR-015
  UnitPrice   DECIMAL(12,0) NOT NULL,                                                           -- snapshot giá (BR-011)
  Note        NVARCHAR(200) NULL
);
CREATE INDEX IX_OrderItems_Order ON dbo.OrderItems (OrderId);

-- ADR-001: lượng nguyên liệu đã giữ cho từng đơn, chụp lúc gửi đơn; hoàn tất/hủy dùng đúng số này
CREATE TABLE dbo.OrderIngredients (
  OrderId      INT NOT NULL CONSTRAINT FK_OrderIngredients_Orders REFERENCES dbo.Orders(OrderId),
  IngredientId INT NOT NULL CONSTRAINT FK_OrderIngredients_Ingredients REFERENCES dbo.Ingredients(IngredientId),
  Qty          DECIMAL(18,3) NOT NULL CONSTRAINT CK_OrderIngredients_Qty CHECK (Qty > 0),
  CONSTRAINT PK_OrderIngredients PRIMARY KEY (OrderId, IngredientId)
);

CREATE TABLE dbo.Payments (                    -- ADR-000: chỉ tiền mặt; một dòng cho một phiên (dine-in) HOẶC một đơn (mang đi)
  PaymentId      INT IDENTITY PRIMARY KEY,
  SessionId      UNIQUEIDENTIFIER NULL CONSTRAINT FK_Payments_Sessions REFERENCES dbo.Sessions(SessionId),
  OrderId        INT NULL CONSTRAINT FK_Payments_Orders REFERENCES dbo.Orders(OrderId),
  Method         VARCHAR(10) NOT NULL CONSTRAINT DF_Payments_Method DEFAULT 'CASH' CONSTRAINT CK_Payments_Method CHECK (Method IN ('CASH')),
  AmountDue      DECIMAL(12,0) NOT NULL,
  AmountReceived DECIMAL(12,0) NOT NULL,
  ChangeGiven    AS (AmountReceived - AmountDue) PERSISTED,
  ReceivedBy     INT NOT NULL CONSTRAINT FK_Payments_ReceivedBy REFERENCES dbo.Users(UserId),   -- BR-007
  PaidAt         DATETIME2(0) NOT NULL CONSTRAINT DF_Payments_PaidAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_Payments_Target   CHECK ((SessionId IS NOT NULL AND OrderId IS NULL) OR (SessionId IS NULL AND OrderId IS NOT NULL)),
  CONSTRAINT CK_Payments_Received CHECK (AmountReceived >= AmountDue)
);
CREATE UNIQUE INDEX UX_Payments_Session ON dbo.Payments (SessionId) WHERE SessionId IS NOT NULL;  -- BR-019
CREATE UNIQUE INDEX UX_Payments_Order   ON dbo.Payments (OrderId)   WHERE OrderId   IS NOT NULL;
CREATE INDEX IX_Payments_PaidAt ON dbo.Payments (PaidAt);                                        -- đối soát ca/báo cáo

CREATE TABLE dbo.InventoryTransactions (
  TxnId        BIGINT IDENTITY PRIMARY KEY,
  IngredientId INT NOT NULL CONSTRAINT FK_InvTxn_Ingredients REFERENCES dbo.Ingredients(IngredientId),
  OrderId      INT NULL CONSTRAINT FK_InvTxn_Orders REFERENCES dbo.Orders(OrderId),
  Type         VARCHAR(10) NOT NULL CONSTRAINT CK_InvTxn_Type CHECK (Type IN ('DEDUCT','ADJUST','IMPORT')),
  Delta        DECIMAL(18,3) NOT NULL,   -- âm khi trừ
  BalanceAfter DECIMAL(18,3) NOT NULL,
  Reason       NVARCHAR(200) NULL,
  CreatedBy    INT NULL CONSTRAINT FK_InvTxn_CreatedBy REFERENCES dbo.Users(UserId),
  CreatedAt    DATETIME2(0) NOT NULL CONSTRAINT DF_InvTxn_CreatedAt DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_InvTxn_Ingredient ON dbo.InventoryTransactions (IngredientId, CreatedAt);
CREATE UNIQUE INDEX UX_InvTxn_Order_Ingredient ON dbo.InventoryTransactions (OrderId, IngredientId)
  WHERE Type = 'DEDUCT';                 -- lưới an toàn BR-002: không trừ 2 lần cùng đơn
GO

-- Kiểu bảng truyền danh sách món từ app vào sp_SubmitOrder
CREATE TYPE dbo.OrderItemInput AS TABLE (
  MenuItemId INT NOT NULL,
  Quantity   INT NOT NULL,
  Note       NVARCHAR(200) NULL
);
GO
