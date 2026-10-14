// Menu, danh mục, BOM. "Hết món" tính động (ADR-003): IsAvailable = 0 HOẶC thiếu nguyên liệu khả dụng cho 1 suất.
import { inTransaction, query, request, sql, txQuery } from '../db.js';

const SOLD_OUT = `CAST(CASE WHEN EXISTS (
    SELECT 1 FROM dbo.BomItems b JOIN dbo.Ingredients i ON i.IngredientId = b.IngredientId
    WHERE b.MenuItemId = m.MenuItemId AND i.StockQty - i.ReservedQty < b.Amount) THEN 1 ELSE 0 END AS BIT)`;

export async function publicMenu() {
  const r = await query(`
    SELECT c.CategoryId, c.Name AS CategoryName, m.MenuItemId, m.Name, m.Price, m.ImageUrl, m.IsAvailable, ${SOLD_OUT} AS SoldOut
    FROM dbo.Categories c JOIN dbo.MenuItems m ON m.CategoryId = c.CategoryId AND m.IsActive = 1 AND m.DeletedAt IS NULL
    WHERE c.DeletedAt IS NULL
    ORDER BY c.SortOrder, c.Name, m.Name`);
  const categories = [];
  const byId = new Map();
  for (const row of r.recordset) {
    if (!byId.has(row.CategoryId)) {
      const cat = { id: row.CategoryId, name: row.CategoryName, items: [] };
      byId.set(row.CategoryId, cat);
      categories.push(cat);
    }
    byId.get(row.CategoryId).items.push({
      id: row.MenuItemId,
      name: row.Name,
      price: row.Price,
      imageUrl: row.ImageUrl,
      isAvailable: Boolean(row.IsAvailable) && !row.SoldOut,
      soldOut: Boolean(row.SoldOut),
    });
  }
  return categories;
}

/** Trạng thái "đặt được" của mọi món (để phát menu.availability_changed khi đổi). */
export async function orderableStates() {
  const r = await query(`SELECT m.MenuItemId, m.IsActive, m.IsAvailable, ${SOLD_OUT} AS SoldOut FROM dbo.MenuItems m`);
  return new Map(r.recordset.map((x) => [x.MenuItemId, Boolean(x.IsActive && x.IsAvailable && !x.SoldOut)]));
}

// ---- Danh mục ----
const mapCategory = (r) => r && { categoryId: r.CategoryId, name: r.Name, sortOrder: r.SortOrder, itemCount: r.ItemCount ?? 0 };

export async function listCategories() {
  const r = await query(`SELECT c.*, (SELECT COUNT(*) FROM dbo.MenuItems m WHERE m.CategoryId = c.CategoryId AND m.DeletedAt IS NULL) AS ItemCount
                         FROM dbo.Categories c WHERE c.DeletedAt IS NULL ORDER BY c.SortOrder, c.Name`);
  return r.recordset.map(mapCategory);
}

export async function createCategory({ name, sortOrder }) {
  const r = await query('INSERT dbo.Categories (Name, SortOrder) OUTPUT inserted.* VALUES (@n, @s)', {
    n: [sql.NVarChar(50), name],
    s: [sql.Int, sortOrder],
  });
  return mapCategory(r.recordset[0]);
}

export async function updateCategory(id, { name, sortOrder }) {
  const r = await query('UPDATE dbo.Categories SET Name = @n, SortOrder = @s OUTPUT inserted.* WHERE CategoryId = @id AND DeletedAt IS NULL', {
    id: [sql.Int, id],
    n: [sql.NVarChar(50), name],
    s: [sql.Int, sortOrder],
  });
  return mapCategory(r.recordset[0]);
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
    categoryId: r.CategoryId,
    categoryName: r.CategoryName,
    name: r.Name,
    price: r.Price,
    imageUrl: r.ImageUrl,
    isAvailable: Boolean(r.IsAvailable),
    isActive: Boolean(r.IsActive),
    soldOut: Boolean(r.SoldOut),
    bomCount: r.BomCount ?? 0,
  };

const ITEM_SELECT = `
  SELECT m.*, c.Name AS CategoryName, ${SOLD_OUT} AS SoldOut,
         (SELECT COUNT(*) FROM dbo.BomItems b WHERE b.MenuItemId = m.MenuItemId) AS BomCount
  FROM dbo.MenuItems m JOIN dbo.Categories c ON c.CategoryId = m.CategoryId`;

export async function listItems() {
  const r = await query(`${ITEM_SELECT} WHERE m.DeletedAt IS NULL ORDER BY c.SortOrder, c.Name, m.Name`);
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
});

export async function createItem(d) {
  const r = await query(
    `INSERT dbo.MenuItems (CategoryId, Name, Price, ImageUrl, IsAvailable, IsActive) OUTPUT inserted.MenuItemId
     VALUES (@c, @n, @p, @img, @av, @ac)`,
    itemParams(d),
  );
  return getItem(r.recordset[0].MenuItemId);
}

export async function updateItem(id, d) {
  const r = await query(
    `UPDATE dbo.MenuItems SET CategoryId = @c, Name = @n, Price = @p, ImageUrl = @img, IsAvailable = @av, IsActive = @ac
     WHERE MenuItemId = @id AND DeletedAt IS NULL`,
    { id: [sql.Int, id], ...itemParams(d) },
  );
  return r.rowsAffected[0] ? getItem(id) : null;
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
