-- 0032_tong_hop_ngay — FEATURE-043 Dashboard chủ quán (ADR-006 D-32): số liệu mỗi ngày tính sẵn (job 00:30 cho hôm qua,
-- nút "Tính lại hôm nay") để /admin/today mở nhanh, không chạy truy vấn nặng.
IF OBJECT_ID('dbo.DailySummaries') IS NULL
  CREATE TABLE dbo.DailySummaries (
    SummaryDate      DATE NOT NULL CONSTRAINT PK_DailySummaries PRIMARY KEY,
    RevenueNet       DECIMAL(14,0) NOT NULL,       -- Σ phải thu − Σ hoàn
    PaymentCount     INT NOT NULL,
    OrderCount       INT NOT NULL,
    AvgBill          DECIMAL(12,0) NOT NULL,
    Cogs             DECIMAL(14,0) NOT NULL,
    GrossProfit      DECIMAL(14,0) NOT NULL,       -- chỉ quản lý xem (trưởng ca: bản rút gọn)
    CashVariance     DECIMAL(12,0) NULL,           -- Σ chênh lệch các ca đóng trong ngày (NULL = không có ca đóng)
    ShiftCount       INT NOT NULL,
    NewMembers       INT NOT NULL,
    VouchersUsed     INT NOT NULL,
    TopItemsJson     NVARCHAR(MAX) NULL,           -- [{ menuItemId, name, qty }] 3 món bán nhiều nhất
    LowStockJson     NVARCHAR(MAX) NULL,           -- ảnh chụp lúc tính: nguyên liệu sắp hết
    ExpiringJson     NVARCHAR(MAX) NULL,           -- ảnh chụp lúc tính: lô sắp / đã hết hạn
    PendingApprovals INT NOT NULL CONSTRAINT DF_DailySummaries_Pending DEFAULT 0,
    ComputedAt       DATETIME2(0) NOT NULL CONSTRAINT DF_DailySummaries_At DEFAULT SYSUTCDATETIME()
  );
GO
