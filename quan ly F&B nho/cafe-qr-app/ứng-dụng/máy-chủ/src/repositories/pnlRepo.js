// Lãi/lỗ ước tính (FEATURE-034, ADR-006 D-31): số liệu theo ngày (giờ VN) + chi phí cố định.
import { query, sql } from '../db.js';

const VN_DAY = (col) => `CONVERT(CHAR(10), DATEADD(HOUR, 7, ${col}), 23)`;

/** Mỗi ngày: doanh thu gộp (trước giảm), số phải thu, hoàn tiền, giá vốn, chi quỹ (danh mục chi phí). */
export async function daily(fromUtc, toUtc) {
  const p = { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] };
  const [pay, ref, cogs, cash] = await Promise.all([
    query(
      `SELECT ${VN_DAY('PaidAt')} AS D, SUM(ISNULL(SubtotalAmount, AmountDue)) AS Gross, SUM(AmountDue) AS Due, COUNT(*) AS N
       FROM dbo.Payments WHERE PaidAt >= @f AND PaidAt < @t GROUP BY ${VN_DAY('PaidAt')}`,
      p,
    ),
    query(
      `SELECT ${VN_DAY('CreatedAt')} AS D, SUM(Amount) AS Amount FROM dbo.Refunds WHERE CreatedAt >= @f AND CreatedAt < @t GROUP BY ${VN_DAY('CreatedAt')}`,
      p,
    ),
    // Giá vốn theo ngày hoàn tất đơn: CogsAmount đã chốt (F-031); đơn chưa có (trước F-031 / chưa biết giá lúc hoàn tất)
    // → ước tính Σ định lượng đã giữ × giá vốn bình quân HIỆN TẠI, đếm số dòng ước tính.
    query(
      `WITH o AS (
         SELECT o.OrderId, ${VN_DAY('o.CompletedAt')} AS D, SUM(oi.CogsAmount) AS Known, COUNT(oi.CogsAmount) AS KnownLines, COUNT(*) AS Lines
         FROM dbo.Orders o JOIN dbo.OrderItems oi ON oi.OrderId = o.OrderId AND oi.ParentOrderItemId IS NULL
         WHERE o.Status = 'COMPLETED' AND o.CompletedAt >= @f AND o.CompletedAt < @t
         GROUP BY o.OrderId, o.CompletedAt)
       SELECT o.D,
              SUM(CASE WHEN o.KnownLines > 0 THEN o.Known ELSE ISNULL(e.Est, 0) END) AS Cogs,
              SUM(CASE WHEN o.KnownLines = 0 AND e.Est > 0 THEN o.Lines ELSE 0 END) AS EstRows
       FROM o OUTER APPLY (SELECT SUM(r.Qty * i.AvgCost) AS Est FROM dbo.OrderIngredients r
                           JOIN dbo.Ingredients i ON i.IngredientId = r.IngredientId WHERE r.OrderId = o.OrderId) e
       GROUP BY o.D`,
      p,
    ),
    query(
      `SELECT ${VN_DAY('c.CreatedAt')} AS D, cc.CategoryId, cc.Name, SUM(c.Amount) AS Amount
       FROM dbo.CashTransactions c JOIN dbo.CashCategories cc ON cc.CategoryId = c.CategoryId
       WHERE c.Status = 'APPROVED' AND c.Direction = 'OUT' AND cc.IsExpense = 1 AND c.CreatedAt >= @f AND c.CreatedAt < @t
       GROUP BY ${VN_DAY('c.CreatedAt')}, cc.CategoryId, cc.Name`,
      p,
    ),
  ]);
  return {
    payments: pay.recordset.map((x) => ({ date: x.D, gross: Number(x.Gross), due: Number(x.Due), count: x.N })),
    refunds: ref.recordset.map((x) => ({ date: x.D, amount: Number(x.Amount) })),
    cogs: cogs.recordset.map((x) => ({ date: x.D, amount: Math.round(Number(x.Cogs)), estimatedRows: x.EstRows })),
    expenses: cash.recordset.map((x) => ({ date: x.D, categoryId: x.CategoryId, name: x.Name, amount: Number(x.Amount) })),
  };
}

const d10 = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);
const mapCost = (r) => ({
  costId: r.CostId,
  name: r.Name,
  monthlyAmount: Number(r.MonthlyAmount),
  effectiveFrom: d10(r.EffectiveFrom),
  effectiveTo: r.EffectiveTo ? d10(r.EffectiveTo) : null,
});

export async function fixedCosts() {
  const r = await query('SELECT * FROM dbo.FixedCosts ORDER BY CASE WHEN EffectiveTo IS NULL THEN 0 ELSE 1 END, EffectiveFrom DESC, Name');
  return r.recordset.map(mapCost);
}

export async function saveFixedCost(id, { name, monthlyAmount, effectiveFrom, effectiveTo }) {
  const p = {
    id: [sql.Int, id],
    n: [sql.NVarChar(100), name],
    a: [sql.Decimal(12, 0), monthlyAmount],
    f: [sql.Date, effectiveFrom],
    t: [sql.Date, effectiveTo ?? null],
  };
  const r = id
    ? await query('UPDATE dbo.FixedCosts SET Name = @n, MonthlyAmount = @a, EffectiveFrom = @f, EffectiveTo = @t OUTPUT inserted.* WHERE CostId = @id', p)
    : await query('INSERT dbo.FixedCosts (Name, MonthlyAmount, EffectiveFrom, EffectiveTo) OUTPUT inserted.* VALUES (@n, @a, @f, @t)', p);
  return r.recordset[0] ? mapCost(r.recordset[0]) : null;
}

export async function deleteFixedCost(id) {
  const r = await query('DELETE dbo.FixedCosts WHERE CostId = @id', { id: [sql.Int, id] });
  return r.rowsAffected[0] > 0;
}
