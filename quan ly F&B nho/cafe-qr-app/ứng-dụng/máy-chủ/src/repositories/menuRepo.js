// Menu, danh mục, BOM, combo (F-015), gán nhóm tùy chọn (F-013), ghim gợi ý (F-017).
// "Hết món" tính động (ADR-003, ADR-005 D-12): IsAvailable = 0 HOẶC thiếu nguyên liệu khả dụng cho 1 suất
// (combo: thiếu cho 1 combo = Σ BOM thành phần, hoặc có thành phần đã tắt/xóa).
import { inTransaction, query, request, sql, txQuery } from '../db.js';
import { syncCategorySchedule } from './scheduleRepo.js';

// F-028: lô đã hết hạn không tính vào khả dụng (tvf_ExpiredLotQty)
const AVAILABLE = 'i.StockQty - i.ReservedQty - ISNULL((SELECT ex.ExpiredQty FROM dbo.tvf_ExpiredLotQty() ex WHERE ex.IngredientId = i.IngredientId), 0)';
const SINGLE_SOLD_OUT = `EXISTS (
    SELECT 1 FROM dbo.BomItems b JOIN dbo.Ingredients i ON i.IngredientId = b.IngredientId
    WHERE b.MenuItemId = m.MenuItemId AND ${AVAILABLE} < b.Amount)`;
const COMBO_SOLD_OUT = `(NOT EXISTS (SELECT 1 FROM dbo.ComboComponents cc WHERE cc.ComboMenuItemId = m.MenuItemId)
    OR EXISTS (SELECT 1 FROM dbo.ComboComponents cc JOIN dbo.MenuItems c ON c.MenuItemId = cc.ComponentMenuItemId
               WHERE cc.ComboMenuItemId = m.MenuItemId AND (c.IsAvailable = 0 OR c.DeletedAt IS NOT NULL))
    OR EXISTS (SELECT 1 FROM (SELECT b.IngredientId, SUM(cc.Quantity * b.Amount) AS Need
                              FROM dbo.ComboComponents cc JOIN dbo.BomItems b ON b.MenuItemId = cc.ComponentMenuItemId
                              WHERE cc.ComboMenuItemId = m.MenuItemId GROUP BY b.IngredientId) n
               JOIN dbo.Ingredients i ON i.IngredientId = n.IngredientId WHERE ${AVAILABLE} < n.Need))`;
const SOLD_OUT = `CAST(CASE WHEN (m.ItemType = 'COMBO' AND ${COMBO_SOLD_OUT}) OR (m.ItemType = 'SINGLE' AND ${SINGLE_SOLD_OUT}) THEN 1 ELSE 0 END AS BIT)`;

const hhmm = (t) => (t ? String(t).slice(0, 5) : null);

/** Dữ liệu thô cho menu khách: món SINGLE theo danh mục (kèm giờ bán), combo + thành phần, nhóm tùy chọn đang gán. */
export async function publicMenuRows() {
  const r = await (
    await request()
  ).query(`
    SELECT c.CategoryId, c.Name AS CategoryName, CONVERT(CHAR(5), c.SellFrom, 108) AS SellFrom, CONVERT(CHAR(5), c.SellTo, 108) AS SellTo,
           m.MenuItemId, m.Name, m.Price, m.ImageUrl, m.IsAvailable, m.IsPinned, m.PinLabel, m.PinOrder, m.HideFromSuggestions, ${SOLD_OUT} AS SoldOut
    FROM dbo.Categories c JOIN dbo.MenuItems m ON m.CategoryId = c.CategoryId AND m.IsActive = 1 AND m.DeletedAt IS NULL AND m.ItemType = 'SINGLE'
    WHERE c.DeletedAt IS NULL
    ORDER BY c.SortOrder, c.Name, m.Name;
    SELECT m.MenuItemId, m.Name, m.Price, m.ImageUrl, m.IsAvailable, m.IsPinned, m.PinLabel, m.PinOrder, m.HideFromSuggestions, ${SOLD_OUT} AS SoldOut
    FROM dbo.MenuItems m WHERE m.ItemType = 'COMBO' AND m.IsActive = 1 AND m.DeletedAt IS NULL ORDER BY m.Name;
    SELECT cc.ComboMenuItemId, cc.ComponentMenuItemId, c.Name, c.Price, cc.Quantity
    FROM dbo.ComboComponents cc JOIN dbo.MenuItems c ON c.MenuItemId = cc.ComponentMenuItemId
    JOIN dbo.MenuItems m ON m.MenuItemId = cc.ComboMenuItemId AND m.DeletedAt IS NULL
    ORDER BY cc.ComboMenuItemId, c.Name;`);
  const [itemRows, comboRows, compRows] = r.recordsets;
  return { itemRows, comboRows, compRows };
}

/** Trạng thái "đặt được" của mọi món/combo (để phát menu.availability_changed khi đổi). */
export async function orderableStates() {
  const r = await query(`SELECT m.MenuItemId, m.IsActive, m.IsAvailable, ${SOLD_OUT} AS SoldOut FROM dbo.MenuItems m`);
  return new Map(r.recordset.map((x) => [x.MenuItemId, Boolean(x.IsActive && x.IsAvailable && !x.SoldOut)]));
}

// ---- Danh mục ----
const mapCategory = (r) =>
  r && {
    categoryId: r.CategoryId,
    name: r.Name,
    sortOrder: r.SortOrder,
    itemCount: r.ItemCount ?? 0,
    sellFrom: hhmm(r.SellFromText),
    sellTo: hhmm(r.SellToText),
  };

const CATEGORY_SELECT = `SELECT c.*, CONVERT(CHAR(5), c.SellFrom, 108) AS SellFromText, CONVERT(CHAR(5), c.SellTo, 108) AS SellToText,
         (SELECT COUNT(*) FROM dbo.MenuItems m WHERE m.CategoryId = c.CategoryId AND m.DeletedAt IS NULL) AS ItemCount
  FROM dbo.Categories c`;

export async function listCategories() {
  const r = await query(`${CATEGORY_SELECT} WHERE c.DeletedAt IS NULL ORDER BY c.SortOrder, c.Name`);
  return r.recordset.map(mapCategory);
}

async function getCategory(id) {
  const r = await query(`${CATEGORY_SELECT} WHERE c.CategoryId = @id AND c.DeletedAt IS NULL`, { id: [sql.Int, id] });
  return mapCategory(r.recordset[0]);
}

const categoryParams = ({ name, sortOrder, sellFrom = null, sellTo = null }) => ({
  n: [sql.NVarChar(50), name],
  s: [sql.Int, sortOrder],
  sf: [sql.VarChar(8), sellFrom || null],
  st: [sql.VarChar(8), sellTo || null],
});

export async function createCategory(d) {
  const r = await query(
    'INSERT dbo.Categories (Name, SortOrder, SellFrom, SellTo) OUTPUT inserted.CategoryId VALUES (@n, @s, CAST(@sf AS TIME(0)), CAST(@st AS TIME(0)))',
    categoryParams(d),
  );
  const id = r.recordset[0].CategoryId;
  await syncCategorySchedule(id, d.name, d.sellFrom, d.sellTo); // F-040: giờ bán = lịch SHOW
  return getCategory(id);
}

export async function updateCategory(id, d) {
  const r = await query(
    `UPDATE dbo.Categories SET Name = @n, SortOrder = @s, SellFrom = CAST(@sf AS TIME(0)), SellTo = CAST(@st AS TIME(0))
     WHERE CategoryId = @id AND DeletedAt IS NULL`,
    { id: [sql.Int, id], ...categoryParams(d) },
  );
  if (!r.rowsAffected[0]) return null;
  await syncCategorySchedule(id, d.name, d.sellFrom, d.sellTo); // F-040
  return getCategory(id);
}

/** Xóa danh mục (ADR-004, sp_DeleteCategory): 'DELETED' | 'ARCHIVED'; còn món → lỗi 50054 HAS_ITEMS. */
export async function deleteCategory(id) {
  const r = await (await request()).input('CategoryId', sql.Int, id).output('Result', sql.VarChar(10)).execute('dbo.sp_DeleteCategory');
  return r.output.Result;
}

export async function categoryExists(id) {
  const r = await query('SELECT 1 AS ok FROM dbo.Categories WHERE CategoryId = @id AND DeletedAt IS NULL', { id: [sql.Int, id] });
  return r.recordset.length > 0;
}

// ---- Món ----
const mapItem = (r) =>
  r && {
    menuItemId: r.MenuItemId,
    itemType: r.ItemType,
    categoryId: r.CategoryId,
    categoryName: r.CategoryName,
    name: r.Name,
    price: r.Price,
    imageUrl: r.ImageUrl,
    isAvailable: Boolean(r.IsAvailable),
    isActive: Boolean(r.IsActive),
    soldOut: Boolean(r.SoldOut),
    bomCount: r.BomCount ?? 0,
    isPinned: Boolean(r.IsPinned),
    pinLabel: r.PinLabel,
    pinOrder: r.PinOrder,
    hideFromSuggestions: Boolean(r.HideFromSuggestions),
    groupIds: r.GroupIds ? String(r.GroupIds).split(',').map(Number) : [],
    prepSeconds: r.PrepSeconds ?? null, // F-025
  };

const ITEM_SELECT = `
  SELECT m.*, c.Name AS CategoryName, ${SOLD_OUT} AS SoldOut,
         (SELECT COUNT(*) FROM dbo.BomItems b WHERE b.MenuItemId = m.MenuItemId) AS BomCount,
         (SELECT STRING_AGG(CAST(mg.GroupId AS NVARCHAR(10)), ',') FROM dbo.MenuItemModifierGroups mg
          JOIN dbo.ModifierGroups g ON g.GroupId = mg.GroupId AND g.DeletedAt IS NULL WHERE mg.MenuItemId = m.MenuItemId) AS GroupIds
  FROM dbo.MenuItems m LEFT JOIN dbo.Categories c ON c.CategoryId = m.CategoryId`;

export async function listItems() {
  const r = await query(`${ITEM_SELECT} WHERE m.DeletedAt IS NULL AND m.ItemType = 'SINGLE' ORDER BY c.SortOrder, c.Name, m.Name`);
  return r.recordset.map(mapItem);
}

/** Món + combo đang dùng (trang Gợi ý & ghim). */
export async function listAllSellable() {
  const r = await query(`${ITEM_SELECT} WHERE m.DeletedAt IS NULL ORDER BY m.ItemType DESC, c.SortOrder, m.Name`);
  return r.recordset.map(mapItem);
}

export async function getItem(id) {
  const r = await query(`${ITEM_SELECT} WHERE m.MenuItemId = @id AND m.DeletedAt IS NULL`, { id: [sql.Int, id] });
  return mapItem(r.recordset[0]);
}

const itemParams = (d) => ({
  c: [sql.Int, d.categoryId],
  n: [sql.NVarChar(100), d.name],
  p: [sql.Decimal(12, 0), d.price],
  img: [sql.NVarChar(500), d.imageUrl || null],
  av: [sql.Bit, d.isAvailable],
  ac: [sql.Bit, d.isActive],
  keepPrep: [sql.Bit, d.prepSeconds === undefined],
  prep: [sql.Int, d.prepSeconds ?? null],
});

async function replaceGroups(tx, id, groupIds) {
  await txQuery(tx, 'DELETE dbo.MenuItemModifierGroups WHERE MenuItemId = @id', { id: [sql.Int, id] });
  for (const g of groupIds) {
    await txQuery(tx, 'INSERT dbo.MenuItemModifierGroups (MenuItemId, GroupId) VALUES (@id, @g)', { id: [sql.Int, id], g: [sql.Int, g] });
  }
}

export async function createItem(d) {
  const id = await inTransaction(async (tx) => {
    const r = await txQuery(
      tx,
      `INSERT dbo.MenuItems (CategoryId, Name, Price, ImageUrl, IsAvailable, IsActive, PrepSeconds) OUTPUT inserted.MenuItemId
       VALUES (@c, @n, @p, @img, @av, @ac, @prep)`,
      itemParams(d),
    );
    const newId = r.recordset[0].MenuItemId;
    if (d.groupIds) await replaceGroups(tx, newId, d.groupIds);
    return newId;
  });
  return getItem(id);
}

export async function updateItem(id, d) {
  const ok = await inTransaction(async (tx) => {
    const r = await txQuery(
      tx,
      `UPDATE dbo.MenuItems SET CategoryId = @c, Name = @n, Price = @p, ImageUrl = @img, IsAvailable = @av, IsActive = @ac,
              PrepSeconds = CASE WHEN @keepPrep = 1 THEN PrepSeconds ELSE @prep END
       WHERE MenuItemId = @id AND DeletedAt IS NULL AND ItemType = 'SINGLE'`,
      { id: [sql.Int, id], ...itemParams(d) },
    );
    if (!r.rowsAffected[0]) return false;
    if (d.groupIds) await replaceGroups(tx, id, d.groupIds);
    return true;
  });
  return ok ? getItem(id) : null;
}

export async function setAvailability(id, isAvailable) {
  const r = await query('UPDATE dbo.MenuItems SET IsAvailable = @a WHERE MenuItemId = @id AND DeletedAt IS NULL', {
    id: [sql.Int, id],
    a: [sql.Bit, isAvailable],
  });
  return r.rowsAffected[0] ? getItem(id) : null;
}

// ---- BOM ----
export async function getBom(menuItemId) {
  const r = await query(
    `SELECT b.IngredientId, i.Name, i.Unit, b.Amount FROM dbo.BomItems b JOIN dbo.Ingredients i ON i.IngredientId = b.IngredientId
     WHERE b.MenuItemId = @m ORDER BY i.Name`,
    { m: [sql.Int, menuItemId] },
  );
  return r.recordset.map((x) => ({ ingredientId: x.IngredientId, name: x.Name, unit: x.Unit, amount: x.Amount }));
}

/** Thay toàn bộ BOM của món trong một transaction (FEATURE-011). */
export async function replaceBom(menuItemId, rows) {
  await inTransaction(async (tx) => {
    await txQuery(tx, 'DELETE dbo.BomItems WHERE MenuItemId = @m', { m: [sql.Int, menuItemId] });
    for (const row of rows) {
      await txQuery(tx, 'INSERT dbo.BomItems (MenuItemId, IngredientId, Amount) VALUES (@m, @i, @a)', {
        m: [sql.Int, menuItemId],
        i: [sql.Int, row.ingredientId],
        a: [sql.Decimal(18, 3), row.amount],
      });
    }
  });
  return getBom(menuItemId);
}

/** Xóa (ADR-004): 'DELETED' (xóa hẳn) | 'ARCHIVED' (xóa mềm vì đã có lịch sử). */
export async function removeItem(id) {
  const r = await (await request()).input('MenuItemId', sql.Int, id).output('Result', sql.VarChar(10)).execute('dbo.sp_DeleteMenuItem');
  return r.output.Result;
}

// ---- Combo (F-015) ----
export async function listCombos() {
  const r = await query(`${ITEM_SELECT} WHERE m.DeletedAt IS NULL AND m.ItemType = 'COMBO' ORDER BY m.Name`);
  const combos = r.recordset.map(mapItem);
  if (combos.length === 0) return combos;
  const c = await query(
    `SELECT cc.ComboMenuItemId, cc.ComponentMenuItemId, m.Name, m.Price, cc.Quantity
     FROM dbo.ComboComponents cc JOIN dbo.MenuItems m ON m.MenuItemId = cc.ComponentMenuItemId
     WHERE cc.ComboMenuItemId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ',')) ORDER BY m.Name`,
    { ids: [sql.NVarChar(sql.MAX), combos.map((x) => x.menuItemId).join(',')] },
  );
  const byId = new Map(combos.map((x) => [x.menuItemId, { ...x, components: [] }]));
  for (const row of c.recordset) {
    byId.get(row.ComboMenuItemId).components.push({ menuItemId: row.ComponentMenuItemId, name: row.Name, price: row.Price, quantity: row.Quantity });
  }
  return [...byId.values()].map((x) => ({ ...x, listTotal: x.components.reduce((s, k) => s + k.price * k.quantity, 0) }));
}

export async function getCombo(id) {
  return (await listCombos()).find((c) => c.menuItemId === id) ?? null;
}

async function replaceComponents(tx, id, components) {
  await txQuery(tx, 'DELETE dbo.ComboComponents WHERE ComboMenuItemId = @id', { id: [sql.Int, id] });
  for (const k of components) {
    await txQuery(tx, 'INSERT dbo.ComboComponents (ComboMenuItemId, ComponentMenuItemId, Quantity) VALUES (@id, @c, @q)', {
      id: [sql.Int, id],
      c: [sql.Int, k.menuItemId],
      q: [sql.Int, k.quantity],
    });
  }
}

export async function createCombo(d) {
  const id = await inTransaction(async (tx) => {
    const r = await txQuery(
      tx,
      `INSERT dbo.MenuItems (CategoryId, Name, Price, ImageUrl, IsAvailable, IsActive, ItemType) OUTPUT inserted.MenuItemId
       VALUES (NULL, @n, @p, @img, @av, @ac, 'COMBO')`,
      itemParams({ ...d, categoryId: null }),
    );
    const newId = r.recordset[0].MenuItemId;
    await replaceComponents(tx, newId, d.components);
    return newId;
  });
  return getCombo(id);
}

/** Sửa combo = thay toàn bộ thành phần (đơn cũ giữ nguyên dòng con đã lưu). */
export async function updateCombo(id, d) {
  const ok = await inTransaction(async (tx) => {
    const r = await txQuery(
      tx,
      `UPDATE dbo.MenuItems SET Name = @n, Price = @p, ImageUrl = @img, IsAvailable = @av, IsActive = @ac
       WHERE MenuItemId = @id AND DeletedAt IS NULL AND ItemType = 'COMBO'`,
      { id: [sql.Int, id], ...itemParams({ ...d, categoryId: null }) },
    );
    if (!r.rowsAffected[0]) return false;
    await replaceComponents(tx, id, d.components);
    return true;
  });
  return ok ? getCombo(id) : null;
}

/** Món SINGLE còn dùng (chọn làm thành phần combo). */
export async function singleItemsByIds(ids) {
  if (ids.length === 0) return [];
  const r = await query(
    `SELECT MenuItemId, ItemType FROM dbo.MenuItems
     WHERE MenuItemId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ',')) AND DeletedAt IS NULL`,
    { ids: [sql.NVarChar(sql.MAX), ids.join(',')] },
  );
  return r.recordset.map((x) => ({ menuItemId: x.MenuItemId, itemType: x.ItemType }));
}

// ---- Ghim gợi ý (F-017) ----
export async function savePins({ pins, hidden }) {
  await inTransaction(async (tx) => {
    await txQuery(tx, 'UPDATE dbo.MenuItems SET IsPinned = 0, PinLabel = NULL, PinOrder = NULL, HideFromSuggestions = 0 WHERE DeletedAt IS NULL');
    for (const [i, p] of pins.entries()) {
      await txQuery(tx, 'UPDATE dbo.MenuItems SET IsPinned = 1, PinLabel = @l, PinOrder = @o WHERE MenuItemId = @id AND DeletedAt IS NULL', {
        id: [sql.Int, p.menuItemId],
        l: [sql.NVarChar(30), p.label || null],
        o: [sql.Int, i + 1],
      });
    }
    for (const id of hidden) {
      await txQuery(tx, 'UPDATE dbo.MenuItems SET HideFromSuggestions = 1 WHERE MenuItemId = @id AND DeletedAt IS NULL', { id: [sql.Int, id] });
    }
  });
}

/** Top bán chạy: Σ số lượng dòng khách chọn (không tính dòng con combo) của đơn đã thu, không hủy/hoàn, trong N ngày. */
export async function topSelling(sinceUtc, limit) {
  const r = await query(
    `SELECT TOP (@lim) oi.MenuItemId, m.Name, SUM(oi.Quantity) AS Qty
     FROM dbo.OrderItems oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId JOIN dbo.MenuItems m ON m.MenuItemId = oi.MenuItemId
     WHERE o.PaymentStatus = 'PAID' AND o.Status NOT IN ('CANCELLED', 'VOIDED') AND o.PaidAt >= @since AND oi.ParentOrderItemId IS NULL
     GROUP BY oi.MenuItemId, m.Name ORDER BY Qty DESC, m.Name`,
    { since: [sql.DateTime2(0), sinceUtc], lim: [sql.Int, limit] },
  );
  return r.recordset.map((x) => ({ menuItemId: x.MenuItemId, name: x.Name, qty: x.Qty }));
}
