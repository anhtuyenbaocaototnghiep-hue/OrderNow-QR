-- 0012_hoan_tien — FEATURE-019 Hủy / hoàn tiền sau khi đã thu (ADR-005 D-15).
-- Đơn bị hoàn → VOIDED; hoàn kho món đã làm → InventoryTransactions RESTOCK (mỗi đơn × nguyên liệu tối đa một lần).
ALTER TABLE dbo.Orders DROP CONSTRAINT CK_Orders_Status;
ALTER TABLE dbo.Orders ADD CONSTRAINT CK_Orders_Status CHECK (Status IN ('PENDING', 'PREPARING', 'COMPLETED', 'CANCELLED', 'VOIDED'));
ALTER TABLE dbo.Orders ADD VoidedAt DATETIME2(0) NULL;

ALTER TABLE dbo.InventoryTransactions DROP CONSTRAINT CK_InvTxn_Type;
ALTER TABLE dbo.InventoryTransactions ADD CONSTRAINT CK_InvTxn_Type CHECK (Type IN ('DEDUCT', 'ADJUST', 'IMPORT', 'RESTOCK'));
GO
CREATE UNIQUE INDEX UX_InvTxn_Order_Ingredient_Restock ON dbo.InventoryTransactions (OrderId, IngredientId) WHERE Type = 'RESTOCK';

CREATE TABLE dbo.Refunds (
  RefundId         INT IDENTITY CONSTRAINT PK_Refunds PRIMARY KEY,
  PaymentId        INT NOT NULL CONSTRAINT FK_Refunds_Payments REFERENCES dbo.Payments(PaymentId),
  Amount           DECIMAL(12,0) NOT NULL CONSTRAINT CK_Refunds_Amount CHECK (Amount > 0),
  Reason           NVARCHAR(200) NOT NULL,
  RestockInventory BIT NOT NULL CONSTRAINT DF_Refunds_Restock DEFAULT 0,
  VoidedOrderIds   NVARCHAR(400) NULL,
  ApprovedBy       INT NOT NULL CONSTRAINT FK_Refunds_ApprovedBy REFERENCES dbo.Users(UserId),
  CreatedBy        INT NOT NULL CONSTRAINT FK_Refunds_CreatedBy REFERENCES dbo.Users(UserId),
  ShiftId          INT NULL CONSTRAINT FK_Refunds_Shifts REFERENCES dbo.Shifts(ShiftId),
  CreatedAt        DATETIME2(0) NOT NULL CONSTRAINT DF_Refunds_CreatedAt DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Refunds_Payment ON dbo.Refunds (PaymentId);
CREATE INDEX IX_Refunds_CreatedAt ON dbo.Refunds (CreatedAt);
CREATE INDEX IX_Refunds_Shift ON dbo.Refunds (ShiftId) WHERE ShiftId IS NOT NULL;
GO
