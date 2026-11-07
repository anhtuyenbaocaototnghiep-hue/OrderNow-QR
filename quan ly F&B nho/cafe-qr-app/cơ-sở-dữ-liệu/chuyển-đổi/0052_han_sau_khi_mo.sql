-- 0052_han_sau_khi_mo — FEATURE-075 hạn dùng nguyên liệu: hạn sau khi mở, tiền sắp mất, món nên mời (ADR-033 D-147…D-152). Chỉ thêm.
-- Một lô thường gồm nhiều hộp / gói (nhập 10 hộp sữa = một lô 10.000 ml) → không rút hạn cả lô khi mở một hộp. Theo dõi "hộp đang mở"
-- của từng nguyên liệu: dung tích một hộp (PackSize, đơn vị gốc), dùng được bao lâu sau khi mở (OpenShelfHours), mở lúc nào (OpenedAt),
-- còn bao nhiêu trong hộp đang mở (OpenLeft). Tự cập nhật khi bán (hoàn tất đơn) và sơ chế — nhân viên không phải bấm "mở hộp".
IF COL_LENGTH('dbo.Ingredients', 'PackSize') IS NULL
  ALTER TABLE dbo.Ingredients ADD
    PackSize       DECIMAL(18,3) NULL CONSTRAINT CK_Ingredients_PackSize CHECK (PackSize IS NULL OR PackSize > 0),
    OpenShelfHours INT           NULL CONSTRAINT CK_Ingredients_OpenShelf CHECK (OpenShelfHours IS NULL OR OpenShelfHours BETWEEN 1 AND 8760),
    OpenedAt       DATETIME2(0)  NULL,
    OpenLeft       DECIMAL(18,3) NOT NULL CONSTRAINT DF_Ingredients_OpenLeft DEFAULT 0 CONSTRAINT CK_Ingredients_OpenLeft CHECK (OpenLeft >= 0);
GO

ALTER TABLE dbo.Alerts DROP CONSTRAINT CK_Alerts_Kind;
ALTER TABLE dbo.Alerts ADD CONSTRAINT CK_Alerts_Kind
  CHECK (Kind IN ('CASH_DIFF', 'TRANSFER_SHARE', 'VOIDS', 'REFUNDS', 'MANUAL_DISCOUNT', 'BIG_REFUND', 'CASH_VOID', 'COST_RISE', 'AUTH_LOCK', 'OFFLINE_SALE',
                  'EXPIRY_RISK'));
GO
