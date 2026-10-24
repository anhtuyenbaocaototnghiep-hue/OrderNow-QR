// Chuẩn bị DB test thật (SQL Server, không mock): reset schema + migrate + seed nền.
// Dùng TEST_DB_NAME (mặc định CafeQrTest). Phải gọi useTestDatabase() TRƯỚC khi import module app (config đọc env lúc import).
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

export function useTestDatabase() {
  const name = process.env.TEST_DB_NAME || 'CafeQrTest';
  if (!/test$/i.test(name)) throw new Error('TEST_DB_NAME phải kết thúc bằng "Test"');
  process.env.DB_NAME = name;
  process.env.RATE_LIMIT = 'off';
  process.env.JOBS_ENABLED = 'false';
  process.env.JWT_SECRET ||= 'test-secret-only-for-local-tests';
  process.env.ADMIN_SEED_USERNAME = 'admin';
  process.env.ADMIN_SEED_PASSWORD = 'Admin@123';
  process.env.UPLOADS_DIR = path.join(os.tmpdir(), 'cafe-qr-test-uploads'); // ảnh hóa đơn test không vào uploads/ thật
  return name;
}

export async function resetTestDatabase() {
  const name = useTestDatabase();
  execFileSync(process.execPath, [path.join(root, 'kịch-bản/db-migrate.js'), '--db', name, '--reset', '--quiet'], {
    stdio: 'inherit',
    env: process.env,
  });
  const { config } = await import('../../src/config.js');
  const { seedBase } = await import('../../../../kịch-bản/seed-data.js');
  const pool = await new sql.ConnectionPool({ ...config.db, database: name }).connect();
  const seeded = await seedBase(pool, { adminUsername: 'admin', adminPassword: 'Admin@123' });
  return { pool, ...seeded };
}

export async function scalar(pool, query, inputs = {}) {
  const req = pool.request();
  for (const [k, [type, v]] of Object.entries(inputs)) req.input(k, type, v);
  const r = await req.query(query);
  return Object.values(r.recordset[0] ?? {})[0];
}

/** Bất biến kho + tiền sau mọi test (BR-001, BR-002, ADR-001, ADR-005). Trả về danh sách vi phạm (rỗng = OK). */
export async function inventoryViolations(pool) {
  const r = await pool.request().query(`
    SELECT 'NEGATIVE_STOCK' AS v, IngredientId FROM dbo.Ingredients WHERE StockQty < 0 OR ReservedQty < 0
    UNION ALL
    SELECT 'RESERVED_MISMATCH', ing.IngredientId
    FROM dbo.Ingredients ing
    OUTER APPLY (SELECT ISNULL(SUM(oi.Qty), 0) AS q FROM dbo.OrderIngredients oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId
                 WHERE oi.IngredientId = ing.IngredientId AND o.Status IN ('PENDING','PREPARING')) x
    WHERE ing.ReservedQty <> x.q
    UNION ALL
    SELECT 'DOUBLE_DEDUCT', IngredientId FROM dbo.InventoryTransactions WHERE Type = 'DEDUCT'
    GROUP BY OrderId, IngredientId, LotId HAVING COUNT(*) > 1
    -- Kho nâng cao (ADR-006): Σ lô mở = tồn (nguyên liệu theo lô); trừ theo lô đúng tổng đã giữ cho đơn; mẻ sơ chế cân bằng giá trị
    UNION ALL
    SELECT 'LOTS_MISMATCH', i.IngredientId FROM dbo.Ingredients i
    WHERE i.TrackLots = 1 AND i.StockQty <> ISNULL((SELECT SUM(l.Qty) FROM dbo.IngredientLots l WHERE l.IngredientId = i.IngredientId AND l.IsClosed = 0), 0)
    -- Sửa / hủy phiếu (F-048): Σ IMPORT của phiếu = Σ dòng (0 nếu đã hủy); Σ giao dịch của phiếu kiểm kê = Σ chênh lệch (0 nếu đã hủy);
    -- số đã nhận của dòng PO = Σ dòng phiếu nhập còn hiệu lực trỏ vào dòng đó
    -- Sổ quỹ (F-050): khoản thay thế ↔ khoản bị thay nối hai chiều, khoản bị thay đã hủy
    UNION ALL
    SELECT 'CASH_REPLACE_LINK', n.CashTxnId FROM dbo.CashTransactions n
    LEFT JOIN dbo.CashTransactions o ON o.CashTxnId = n.ReplacesId
    WHERE n.ReplacesId IS NOT NULL AND (o.Status <> 'VOIDED' OR ISNULL(o.ReplacedById, 0) <> n.CashTxnId)
    UNION ALL
    SELECT 'CASH_REPLACE_LINK', o.CashTxnId FROM dbo.CashTransactions o
    LEFT JOIN dbo.CashTransactions n ON n.CashTxnId = o.ReplacedById
    WHERE o.ReplacedById IS NOT NULL AND (o.Status <> 'VOIDED' OR ISNULL(n.ReplacesId, 0) <> o.CashTxnId)
    -- Chuyển bàn (F-049): đơn của phiên luôn ở đúng bàn hiện tại của phiên —
    -- trừ đơn được thu chung từ bàn khác (F-057): giữ bàn gốc = bàn của một phiên đã gộp vào phiên này
    UNION ALL
    SELECT 'ORDER_TABLE_MISMATCH', o.OrderId FROM dbo.Orders o JOIN dbo.Sessions s ON s.SessionId = o.SessionId
    WHERE ISNULL(o.TableId, -1) <> s.TableId
      AND NOT EXISTS (SELECT 1 FROM dbo.Sessions m WHERE m.MergedIntoSessionId = o.SessionId AND m.TableId = o.TableId)
    -- Thu chung (F-057): phiên đã gộp thì đóng, không còn đơn, phiên đích đã đóng và có lượt thu
    UNION ALL
    SELECT 'MERGED_SESSION_STATE', 0 FROM dbo.Sessions m JOIN dbo.Sessions t ON t.SessionId = m.MergedIntoSessionId
    WHERE m.Status <> 'CLOSED' OR t.Status <> 'CLOSED' OR t.MergedIntoSessionId IS NOT NULL
       OR EXISTS (SELECT 1 FROM dbo.Orders o WHERE o.SessionId = m.SessionId)
       OR NOT EXISTS (SELECT 1 FROM dbo.Payments p WHERE p.SessionId = t.SessionId)
    -- Chuyển khoản (F-056): không có tiền thừa
    UNION ALL
    SELECT 'TRANSFER_WITH_CHANGE', p.PaymentId FROM dbo.Payments p WHERE p.Method = 'TRANSFER' AND p.AmountReceived <> p.AmountDue
    UNION ALL
    SELECT 'RECEIPT_LEDGER_MISMATCH', sr.ReceiptId FROM dbo.StockReceipts sr
    WHERE ISNULL((SELECT SUM(t.Delta) FROM dbo.InventoryTransactions t WHERE t.StockReceiptId = sr.ReceiptId AND t.Type = 'IMPORT'), 0)
          <> CASE WHEN sr.Status = 'VOIDED' THEN 0 ELSE ISNULL((SELECT SUM(l.Qty) FROM dbo.StockReceiptLines l WHERE l.ReceiptId = sr.ReceiptId), 0) END
    UNION ALL
    SELECT 'STOCKTAKE_LEDGER_MISMATCH', s.StocktakeId FROM dbo.Stocktakes s
    WHERE s.Status <> 'DRAFT'
      AND ISNULL((SELECT SUM(t.Delta) FROM dbo.InventoryTransactions t WHERE t.StocktakeId = s.StocktakeId), 0)
          <> CASE WHEN s.Status = 'VOIDED' THEN 0 ELSE ISNULL((SELECT SUM(l.Diff) FROM dbo.StocktakeLines l WHERE l.StocktakeId = s.StocktakeId), 0) END
    UNION ALL
    SELECT 'PO_RECEIVED_MISMATCH', pl.PoLineId FROM dbo.PurchaseOrderLines pl
    WHERE pl.ReceivedBaseQty <> ISNULL((SELECT SUM(l.Qty) FROM dbo.StockReceiptLines l JOIN dbo.StockReceipts sr ON sr.ReceiptId = l.ReceiptId
                                       WHERE l.PoLineId = pl.PoLineId AND sr.Status = 'POSTED'), 0)
    UNION ALL
    SELECT 'CLOSED_LOT_HAS_QTY', LotId FROM dbo.IngredientLots l
    WHERE l.IsClosed = 1 AND l.Qty > 0 AND EXISTS (SELECT 1 FROM dbo.Ingredients i WHERE i.IngredientId = l.IngredientId AND i.TrackLots = 1)
    UNION ALL
    SELECT 'DEDUCT_QTY_MISMATCH', d.OrderId FROM (SELECT OrderId, IngredientId, SUM(-Delta) AS Q FROM dbo.InventoryTransactions WHERE Type = 'DEDUCT' GROUP BY OrderId, IngredientId) d
    JOIN dbo.OrderIngredients r ON r.OrderId = d.OrderId AND r.IngredientId = d.IngredientId WHERE r.Qty <> d.Q
    UNION ALL
    SELECT 'PREP_UNBALANCED', b.BatchId FROM dbo.PrepBatches b
    WHERE ABS(ISNULL((SELECT SUM(CostAmount) FROM dbo.InventoryTransactions WHERE PrepBatchId = b.BatchId AND Type = 'PREP_OUT'), 0)
            - ISNULL((SELECT SUM(CostAmount) FROM dbo.InventoryTransactions WHERE PrepBatchId = b.BatchId AND Type = 'PREP_IN'), 0)) > 0.01
    UNION ALL
    SELECT 'COGS_MISMATCH', o.OrderId FROM dbo.Orders o
    WHERE EXISTS (SELECT 1 FROM dbo.OrderItems x WHERE x.OrderId = o.OrderId AND x.CogsAmount IS NOT NULL)
      AND (SELECT SUM(CogsAmount) FROM dbo.OrderItems x WHERE x.OrderId = o.OrderId)
          <> ROUND((SELECT SUM(CostAmount) FROM dbo.InventoryTransactions t WHERE t.OrderId = o.OrderId AND t.Type = 'DEDUCT'), 0)
             - ISNULL((SELECT SUM(v.CogsReduction) FROM dbo.OrderItemVoids v WHERE v.OrderId = o.OrderId), 0)   -- F-046: giá vốn đã bỏ khi xóa món
    UNION ALL
    SELECT 'UNPAID_IN_CLOSED_SESSION', o.OrderId FROM dbo.Orders o JOIN dbo.Sessions s ON s.SessionId = o.SessionId
    WHERE s.Status = 'CLOSED' AND o.Status <> 'CANCELLED' AND o.PaymentStatus = 'UNPAID'
    -- Bất biến tiền (ADR-005): breakdown khớp số phải thu; Σ đơn của phiên = tạm tính − khuyến mãi; Σ hoàn ≤ đã thu; hoàn kho 1 lần
    UNION ALL
    SELECT 'PAYMENT_BREAKDOWN', PaymentId FROM dbo.Payments
    WHERE SubtotalAmount IS NOT NULL AND AmountDue <> SubtotalAmount - PromoDiscount - MemberDiscount - VoucherDiscount - RewardDiscount - ManualDiscount - RoundingAdj
    UNION ALL
    SELECT 'PAYMENT_ORDERS_MISMATCH', p.PaymentId FROM dbo.Payments p
    WHERE p.SubtotalAmount IS NOT NULL AND p.SplitId IS NULL AND p.SubtotalAmount - p.PromoDiscount <> (
      SELECT ISNULL(SUM(o.TotalAmount), 0) FROM dbo.Orders o
      WHERE o.Status <> 'CANCELLED' AND ((p.SessionId IS NOT NULL AND o.SessionId = p.SessionId) OR o.OrderId = p.OrderId))
    -- Chia bill (F-026): phiên đã đóng → Σ (tạm tính − khuyến mãi) các phần = Σ đơn; mọi dòng đã thu; dòng thu bởi lượt thu cùng phiên
    UNION ALL
    SELECT 'SPLIT_SESSION_MISMATCH', 0 FROM dbo.Sessions s
    WHERE s.Status = 'CLOSED' AND EXISTS (SELECT 1 FROM dbo.Payments p WHERE p.SessionId = s.SessionId AND p.SplitId IS NOT NULL)
      AND (SELECT SUM(p.SubtotalAmount - p.PromoDiscount) FROM dbo.Payments p WHERE p.SessionId = s.SessionId)
          <> (SELECT ISNULL(SUM(o.TotalAmount), 0) FROM dbo.Orders o WHERE o.SessionId = s.SessionId AND o.Status <> 'CANCELLED')
    UNION ALL
    SELECT 'SPLIT_UNPAID_LINE', oi.OrderItemId FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId JOIN dbo.Sessions s ON s.SessionId = o.SessionId
    WHERE s.Status = 'CLOSED' AND o.Status NOT IN ('CANCELLED', 'VOIDED') AND oi.PaidAt IS NULL
      AND EXISTS (SELECT 1 FROM dbo.SessionSplits sp WHERE sp.SessionId = s.SessionId)
    UNION ALL
    SELECT 'LINE_PAYMENT_OTHER_SESSION', oi.OrderItemId FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId
    JOIN dbo.Payments p ON p.PaymentId = oi.PaymentId
    WHERE (p.SessionId IS NOT NULL AND (o.SessionId IS NULL OR p.SessionId <> o.SessionId)) OR (p.OrderId IS NOT NULL AND p.OrderId <> o.OrderId)
    UNION ALL
    SELECT 'SPLIT_PAID_NO_PAYMENT', sp.SplitId FROM dbo.SessionSplits sp WHERE sp.Status = 'PAID' AND sp.IsCommon = 0 AND sp.PaymentId IS NULL
      AND EXISTS (SELECT 1 FROM dbo.OrderItems x WHERE x.SplitId = sp.SplitId)
    UNION ALL
    SELECT 'REFUND_EXCEEDS', p.PaymentId FROM dbo.Payments p
    WHERE (SELECT ISNULL(SUM(r.Amount), 0) FROM dbo.Refunds r WHERE r.PaymentId = p.PaymentId) > p.AmountDue
    UNION ALL
    SELECT 'DOUBLE_RESTOCK', IngredientId FROM dbo.InventoryTransactions WHERE Type = 'RESTOCK'
    GROUP BY OrderId, IngredientId HAVING COUNT(*) > 1
    UNION ALL
    SELECT 'MANY_OPEN_SHIFTS', COUNT(*) FROM dbo.Shifts WHERE ClosedAt IS NULL HAVING COUNT(*) > 1
    -- Sổ quỹ + chấm công (ADR-006 F-033, F-035): tiền dự kiến chốt ca đúng công thức có sổ quỹ; ca đã đóng không còn khoản chờ duyệt;
    -- mỗi người tối đa một lần chấm công đang mở
    UNION ALL
    -- F-056 (ADR-019 D-72): két chỉ tính lượt thu tiền mặt và hoàn tiền của lượt tiền mặt
    SELECT 'SHIFT_EXPECTED_CASH', s.ShiftId FROM dbo.Shifts s
    WHERE s.ClosedAt IS NOT NULL AND s.ExpectedCash <> s.OpeningCash
      + ISNULL((SELECT SUM(p.AmountDue) FROM dbo.Payments p WHERE p.ShiftId = s.ShiftId AND p.Method = 'CASH'), 0)
      - ISNULL((SELECT SUM(r.Amount) FROM dbo.Refunds r JOIN dbo.Payments rp ON rp.PaymentId = r.PaymentId
                WHERE r.ShiftId = s.ShiftId AND rp.Method = 'CASH'), 0)
      + ISNULL((SELECT SUM(c.Amount) FROM dbo.CashTransactions c WHERE c.ShiftId = s.ShiftId AND c.Status = 'APPROVED' AND c.Direction = 'IN'), 0)
      - ISNULL((SELECT SUM(c.Amount) FROM dbo.CashTransactions c WHERE c.ShiftId = s.ShiftId AND c.Status = 'APPROVED' AND c.Direction = 'OUT'), 0)
    UNION ALL
    SELECT 'CLOSED_SHIFT_CASH_PENDING', c.CashTxnId FROM dbo.CashTransactions c JOIN dbo.Shifts s ON s.ShiftId = c.ShiftId
    WHERE s.ClosedAt IS NOT NULL AND c.Status = 'PENDING'
    UNION ALL
    SELECT 'MANY_OPEN_ATTENDANCE', UserId FROM dbo.Attendance WHERE ClockOut IS NULL GROUP BY UserId HAVING COUNT(*) > 1
    -- Điểm / tem / voucher (ADR-006 F-039, F-038): sổ điểm khớp số dư; điểm tích của lượt thu = dòng EARN; voucher đã dùng gắn đúng lượt thu
    UNION ALL
    SELECT 'POINTS_LEDGER_MISMATCH', m.MemberId FROM dbo.Members m
    WHERE m.Points <> ISNULL((SELECT SUM(Delta) FROM dbo.PointTransactions pt WHERE pt.MemberId = m.MemberId), 0)
    UNION ALL
    SELECT 'EARN_MISMATCH', p.PaymentId FROM dbo.Payments p
    WHERE ISNULL(p.PointsEarned, 0) <> ISNULL((SELECT SUM(Delta) FROM dbo.PointTransactions pt WHERE pt.PaymentId = p.PaymentId AND pt.Type = 'EARN'), 0)
    UNION ALL
    SELECT 'VOUCHER_PAYMENT_MISMATCH', v.VoucherId FROM dbo.Vouchers v
    WHERE v.UsedPaymentId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Payments p WHERE p.PaymentId = v.UsedPaymentId AND p.VoucherId = v.VoucherId)
    UNION ALL
    SELECT 'STAMP_CARD_OVERFLOW', c.MemberId FROM dbo.StampCards c JOIN dbo.StampPrograms sp ON sp.ProgramId = c.ProgramId WHERE c.Stamps >= sp.RequiredStamps
    -- Sửa / xóa món (F-046): không hoàn kho quá lượng đơn đã trừ; tổng đơn còn hiệu lực khớp các dòng + khuyến mãi đơn
    UNION ALL
    SELECT 'OVER_RESTOCK', x.OrderId FROM (
      SELECT OrderId, IngredientId,
             SUM(CASE WHEN Type = 'DEDUCT' THEN -Delta ELSE 0 END) AS Deducted,
             SUM(CASE WHEN Type IN ('RESTOCK', 'VOID_BACK') THEN Delta ELSE 0 END) AS Back
      FROM dbo.InventoryTransactions WHERE OrderId IS NOT NULL GROUP BY OrderId, IngredientId) x
    WHERE x.Back + ISNULL((SELECT SUM(w.Qty) FROM dbo.WasteLogs w JOIN dbo.OrderItemVoids v ON v.VoidId = w.VoidId
                           WHERE v.OrderId = x.OrderId AND w.IngredientId = x.IngredientId), 0) > x.Deducted + 0.001   -- ghi hủy khi xóa món: đã bỏ đi
    UNION ALL
    SELECT 'ORDER_LINES_MISMATCH', o.OrderId FROM dbo.Orders o
    WHERE o.Status <> 'CANCELLED' AND o.SubtotalAmount IS NOT NULL
      AND (o.SubtotalAmount <> (SELECT SUM(oi.Quantity * oi.ListPrice) FROM dbo.OrderItems oi WHERE oi.OrderId = o.OrderId AND oi.ParentOrderItemId IS NULL)
           OR o.TotalAmount <> (SELECT SUM(oi.Quantity * oi.UnitPrice) FROM dbo.OrderItems oi WHERE oi.OrderId = o.OrderId AND oi.ParentOrderItemId IS NULL)
                               - ISNULL((SELECT SUM(pu.DiscountAmount) FROM dbo.PromotionUsages pu WHERE pu.OrderId = o.OrderId AND pu.OrderItemId IS NULL), 0))`);
  return r.recordset;
}

export { sql };
