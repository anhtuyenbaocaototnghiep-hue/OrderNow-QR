-- 0035_chi_muc_phieu_kho — FEATURE-048 (review G3, TASK-060): tra giao dịch kho theo phiếu nhập / phiếu kiểm kê khi sửa / hủy phiếu
-- (sp_ReviseStockReceipt lấy giá dòng IMPORT gốc; sp_VoidStocktake lấy các lô đã trừ khi chốt). Chỉ thêm chỉ mục.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InvTxn_Receipt' AND object_id = OBJECT_ID('dbo.InventoryTransactions'))
  CREATE INDEX IX_InvTxn_Receipt ON dbo.InventoryTransactions (StockReceiptId, IngredientId) WHERE StockReceiptId IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InvTxn_Stocktake' AND object_id = OBJECT_ID('dbo.InventoryTransactions'))
  CREATE INDEX IX_InvTxn_Stocktake ON dbo.InventoryTransactions (StocktakeId, IngredientId) WHERE StocktakeId IS NOT NULL;
GO
