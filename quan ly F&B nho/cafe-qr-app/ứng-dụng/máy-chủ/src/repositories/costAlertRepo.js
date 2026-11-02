// F-064 (ADR-023): dữ liệu cho báo động giá vốn — lịch sử giá nhập, mốc đã báo, ảnh chụp định lượng + thực đơn.
import { query, sql } from '../db.js';

const n = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * Giá nhập của các nguyên liệu quanh phiếu `receiptId` (chỉ phiếu chưa hủy, dòng có giá).
 * → { history: Map id → [dòng phiếu trước], anchors: Map id → lần báo gần nhất trước phiếu này, later: Set id đã có phiếu mới hơn }
 */
export async function priceHistory(ingredientIds, receiptId) {
  const p = { ids: [sql.NVarChar(sql.MAX), ingredientIds.join(',')], r: [sql.Int, receiptId] };
  const res = await query(
    `SELECT l.IngredientId, l.ReceiptId, l.UnitCost, sr.ReceivedAt
     FROM dbo.StockReceiptLines l JOIN dbo.StockReceipts sr ON sr.ReceiptId = l.ReceiptId
     WHERE l.UnitCost > 0 AND sr.Status = 'POSTED' AND l.ReceiptId <> @r
       AND l.IngredientId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','));
     SELECT m.IngredientId, m.ReceiptId, m.UnitCost
     FROM dbo.CostAlertMarks m JOIN dbo.StockReceipts sr ON sr.ReceiptId = m.ReceiptId
     WHERE sr.Status = 'POSTED' AND m.ReceiptId < @r
       AND m.IngredientId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
     ORDER BY m.ReceiptId;`,
    p,
  );
  const history = new Map();
  const later = new Set();
  for (const x of res.recordsets[0]) {
    if (x.ReceiptId > receiptId) {
      later.add(x.IngredientId);
      continue;
    }
    if (!history.has(x.IngredientId)) history.set(x.IngredientId, []);
    history.get(x.IngredientId).push({ receiptId: x.ReceiptId, unitCost: Number(x.UnitCost), receivedAt: x.ReceivedAt });
  }
  const anchors = new Map(res.recordsets[1].map((x) => [x.IngredientId, { receiptId: x.ReceiptId, unitCost: Number(x.UnitCost) }])); // ReceiptId tăng dần → giữ lần mới nhất
  return { history, later, anchors };
}

/** Mọi giá nhập + mọi mốc, gom theo nguyên liệu, ReceiptId tăng dần — để biết giá nào còn đang nghi nhầm. */
export async function allPrices() {
  const res = await query(
    `SELECT l.IngredientId, l.ReceiptId, l.UnitCost, sr.ReceivedAt
     FROM dbo.StockReceiptLines l JOIN dbo.StockReceipts sr ON sr.ReceiptId = l.ReceiptId
     WHERE l.UnitCost > 0 AND sr.Status = 'POSTED' ORDER BY l.ReceiptId;
     SELECT m.IngredientId, m.ReceiptId, m.UnitCost
     FROM dbo.CostAlertMarks m JOIN dbo.StockReceipts sr ON sr.ReceiptId = m.ReceiptId
     WHERE sr.Status = 'POSTED' ORDER BY m.ReceiptId;`,
  );
  const collect = (rows) => {
    const m = new Map();
    for (const x of rows) {
      if (!m.has(x.IngredientId)) m.set(x.IngredientId, []);
      m.get(x.IngredientId).push({ receiptId: x.ReceiptId, unitCost: Number(x.UnitCost), receivedAt: x.ReceivedAt });
    }
    return m;
  };
  return { history: collect(res.recordsets[0]), anchors: collect(res.recordsets[1]) };
}

/**
 * Phiếu mới nhất sau `receiptId` của từng nguyên liệu, bỏ nguyên liệu đã có mốc sau phiếu đó — sửa / hủy phiếu cũ thì phiếu này phải được xét lại.
 * → Map receiptId → [ingredientId]
 */
export async function newestLaterReceipts(ingredientIds, receiptId) {
  const r = await query(
    `SELECT l.IngredientId, MAX(l.ReceiptId) AS ReceiptId
     FROM dbo.StockReceiptLines l JOIN dbo.StockReceipts sr ON sr.ReceiptId = l.ReceiptId
     WHERE l.UnitCost > 0 AND sr.Status = 'POSTED' AND l.ReceiptId > @r
       AND l.IngredientId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
       AND NOT EXISTS (SELECT 1 FROM dbo.CostAlertMarks m JOIN dbo.StockReceipts s2 ON s2.ReceiptId = m.ReceiptId
                       WHERE m.IngredientId = l.IngredientId AND m.ReceiptId > @r AND s2.Status = 'POSTED')
     GROUP BY l.IngredientId`,
    { ids: [sql.NVarChar(sql.MAX), ingredientIds.join(',')], r: [sql.Int, receiptId] },
  );
  const out = new Map();
  for (const x of r.recordset) out.set(x.ReceiptId, [...(out.get(x.ReceiptId) ?? []), x.IngredientId]);
  return out;
}

/** Ảnh chụp để tính tác động: nguyên liệu, công thức, định lượng, combo, món đang hiện, tùy chọn, số bán 30 ngày (dòng khách chọn, đơn đã thu). */
export async function snapshot() {
  const r = await query(
    `SELECT IngredientId, Name, StockQty, AvgCost, LastUnitCost FROM dbo.Ingredients;
     SELECT SemiIngredientId, OutputQty FROM dbo.SemiRecipes;
     SELECT SemiIngredientId, InputIngredientId, Qty FROM dbo.SemiRecipeLines;
     SELECT MenuItemId, IngredientId, Amount FROM dbo.BomItems;
     SELECT ComboMenuItemId, ComponentMenuItemId, Quantity FROM dbo.ComboComponents;
     SELECT MenuItemId, Name, ItemType, Price FROM dbo.MenuItems WHERE DeletedAt IS NULL AND IsActive = 1;
     SELECT o.OptionId, o.Name, g.Name AS GroupName, o.PriceDelta, b.IngredientId, b.Amount
     FROM dbo.ModifierOptionBom b JOIN dbo.ModifierOptions o ON o.OptionId = b.OptionId JOIN dbo.ModifierGroups g ON g.GroupId = o.GroupId
     WHERE o.DeletedAt IS NULL AND o.IsActive = 1 AND g.DeletedAt IS NULL;
     SELECT oi.MenuItemId, SUM(oi.Quantity) AS Qty
     FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId
     WHERE o.PaymentStatus = 'PAID' AND o.Status NOT IN ('CANCELLED', 'VOIDED') AND o.PaidAt >= DATEADD(DAY, -30, SYSUTCDATETIME())
       AND oi.ParentOrderItemId IS NULL
     GROUP BY oi.MenuItemId;`,
  );
  const [ings, recipes, recipeLines, bomRows, comboRows, items, optionRows, sales] = r.recordsets;
  const groupBy = (rows, keyOf, valueOf) => {
    const m = new Map();
    for (const x of rows) {
      const k = keyOf(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(valueOf(x));
    }
    return m;
  };
  const lines = groupBy(
    recipeLines,
    (x) => x.SemiIngredientId,
    (x) => ({ ingredientId: x.InputIngredientId, qty: Number(x.Qty) }),
  );
  const options = new Map();
  for (const x of optionRows) {
    if (!options.has(x.OptionId)) options.set(x.OptionId, { name: x.Name, group: x.GroupName, priceDelta: Number(x.PriceDelta), bom: [] });
    options.get(x.OptionId).bom.push({ ingredientId: x.IngredientId, amount: Number(x.Amount) });
  }
  return {
    ingredients: new Map(
      ings.map((x) => [x.IngredientId, { name: x.Name, stockQty: Number(x.StockQty), avgCost: Number(x.AvgCost), lastUnitCost: n(x.LastUnitCost) }]),
    ),
    recipes: new Map(recipes.map((x) => [x.SemiIngredientId, { outputQty: Number(x.OutputQty), lines: lines.get(x.SemiIngredientId) ?? [] }])),
    bom: groupBy(
      bomRows,
      (x) => x.MenuItemId,
      (x) => ({ ingredientId: x.IngredientId, amount: Number(x.Amount) }),
    ),
    combos: groupBy(
      comboRows,
      (x) => x.ComboMenuItemId,
      (x) => ({ componentId: x.ComponentMenuItemId, quantity: x.Quantity }),
    ),
    items: items.map((x) => ({ menuItemId: x.MenuItemId, name: x.Name, itemType: x.ItemType, price: Number(x.Price) })),
    options: [...options.values()],
    sales: new Map(sales.map((x) => [x.MenuItemId, Number(x.Qty)])),
  };
}

/** Ghi mốc đã báo. Chạy lại an toàn. marks: [{ ingredientId, unitCost }] */
export async function addMarks(alertId, receiptId, marks) {
  for (const m of marks) {
    await query(
      `IF NOT EXISTS (SELECT 1 FROM dbo.CostAlertMarks WHERE AlertId = @a AND IngredientId = @i)
         INSERT dbo.CostAlertMarks (AlertId, IngredientId, ReceiptId, UnitCost) VALUES (@a, @i, @r, @c)`,
      { a: [sql.Int, alertId], i: [sql.Int, m.ingredientId], r: [sql.Int, receiptId], c: [sql.Decimal(18, 4), m.unitCost] },
    );
  }
}

/**
 * Phiếu bị sửa giá / hủy: bỏ mốc, chuyển cảnh báo cũ của phiếu sang Đã xử lý, bỏ email của chúng chưa gửi. keepKey: khóa của lần tính hiện tại (không gỡ khi chạy lại do deadlock).
 * Kết quả tính từ dữ liệu, không phải từ việc vừa đổi, nên chạy lại sau lỗi giữa chừng vẫn ra như nhau.
 * → { hadAlerts: phiếu từng có cảnh báo, delivered: đã có email gửi đi → cần thư đính chính }
 */
export async function retireForReceipt(receiptId, { keepKey = null, note, userId }) {
  const r = await query(
    `DECLARE @Old TABLE (AlertId INT PRIMARY KEY);
     INSERT @Old
     SELECT a.AlertId FROM dbo.Alerts a WHERE a.DedupeKey LIKE @like AND (@keep IS NULL OR a.DedupeKey <> @keep);
     DELETE x FROM dbo.AlertOutbox x JOIN @Old o ON o.AlertId = x.AlertId WHERE x.Status = 'PENDING';
     DELETE m FROM dbo.CostAlertMarks m JOIN @Old o ON o.AlertId = m.AlertId;
     UPDATE a SET Status = 'RESOLVED', Note = @note, HandledBy = @u, HandledAt = SYSUTCDATETIME()
     FROM dbo.Alerts a JOIN @Old o ON o.AlertId = a.AlertId WHERE a.Status <> 'RESOLVED';
     SELECT (SELECT COUNT(*) FROM @Old) AS HadAlerts,
            (SELECT COUNT(*) FROM dbo.AlertOutbox x JOIN @Old o ON o.AlertId = x.AlertId WHERE x.Status IN ('SENT', 'SENDING')) AS Delivered;`,
    {
      like: [sql.VarChar(100), `COST:${receiptId}:%`],
      keep: [sql.VarChar(100), keepKey],
      note: [sql.NVarChar(300), note],
      u: [sql.Int, userId],
    },
  );
  return { hadAlerts: r.recordset[0].HadAlerts > 0, delivered: r.recordset[0].Delivered > 0 };
}
