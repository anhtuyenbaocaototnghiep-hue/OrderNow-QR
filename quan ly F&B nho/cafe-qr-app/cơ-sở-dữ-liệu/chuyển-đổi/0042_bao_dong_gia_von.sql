-- 0042_bao_dong_gia_von — FEATURE-064 (ADR-023 D-84…D-88). Chỉ thêm.
-- Alerts: thêm loại COST_RISE.
-- CostAlertMarks: giá đã báo của từng nguyên liệu (mốc so giá lần sau). Sửa / hủy phiếu → xóa dòng của phiếu đó, mốc tự trở về lần báo trước.
ALTER TABLE dbo.Alerts DROP CONSTRAINT CK_Alerts_Kind;
ALTER TABLE dbo.Alerts ADD CONSTRAINT CK_Alerts_Kind
  CHECK (Kind IN ('CASH_DIFF', 'TRANSFER_SHARE', 'VOIDS', 'REFUNDS', 'MANUAL_DISCOUNT', 'BIG_REFUND', 'CASH_VOID', 'COST_RISE'));
GO
IF OBJECT_ID('dbo.CostAlertMarks') IS NULL
BEGIN
  CREATE TABLE dbo.CostAlertMarks (
    AlertId      INT NOT NULL CONSTRAINT FK_CostAlertMarks_Alert REFERENCES dbo.Alerts(AlertId),
    IngredientId INT NOT NULL CONSTRAINT FK_CostAlertMarks_Ingredient REFERENCES dbo.Ingredients(IngredientId),
    ReceiptId    INT NOT NULL CONSTRAINT FK_CostAlertMarks_Receipt REFERENCES dbo.StockReceipts(ReceiptId),
    UnitCost     DECIMAL(18,4) NOT NULL,   -- theo đơn vị gốc, như StockReceiptLines.UnitCost
    CONSTRAINT PK_CostAlertMarks PRIMARY KEY (AlertId, IngredientId)
  );
  CREATE INDEX IX_CostAlertMarks_Ingredient ON dbo.CostAlertMarks (IngredientId, ReceiptId);
  CREATE INDEX IX_CostAlertMarks_Receipt ON dbo.CostAlertMarks (ReceiptId);
END
