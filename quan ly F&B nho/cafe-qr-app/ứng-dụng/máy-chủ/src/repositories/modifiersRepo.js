// Nhóm tùy chọn món (FEATURE-013): nhóm Min/Max, tùy chọn có phụ thu + BOM cộng thêm; gán nhóm cho món ở menuRepo.
import { inTransaction, query, sql, txQuery } from '../db.js';

export async function listGroups() {
  const r = await query(`
    SELECT g.GroupId, g.Name, g.MinSelect, g.MaxSelect, g.SortOrder,
           (SELECT COUNT(*) FROM dbo.MenuItemModifierGroups mg JOIN dbo.MenuItems m ON m.MenuItemId = mg.MenuItemId AND m.DeletedAt IS NULL
            WHERE mg.GroupId = g.GroupId) AS ItemCount
    FROM dbo.ModifierGroups g WHERE g.DeletedAt IS NULL ORDER BY g.SortOrder, g.Name;
    SELECT o.OptionId, o.GroupId, o.Name, o.PriceDelta, o.IsDefault, o.IsActive, o.SortOrder
    FROM dbo.ModifierOptions o JOIN dbo.ModifierGroups g ON g.GroupId = o.GroupId AND g.DeletedAt IS NULL
    WHERE o.DeletedAt IS NULL ORDER BY o.SortOrder, o.OptionId;
    SELECT ob.OptionId, ob.IngredientId, i.Name, i.Unit, ob.Amount
    FROM dbo.ModifierOptionBom ob JOIN dbo.Ingredients i ON i.IngredientId = ob.IngredientId
    JOIN dbo.ModifierOptions o ON o.OptionId = ob.OptionId AND o.DeletedAt IS NULL ORDER BY i.Name;`);
  const [groups, options, boms] = r.recordsets;
  const byGroup = new Map(
    groups.map((g) => [
      g.GroupId,
      { groupId: g.GroupId, name: g.Name, minSelect: g.MinSelect, maxSelect: g.MaxSelect, sortOrder: g.SortOrder, itemCount: g.ItemCount, options: [] },
    ]),
  );
  const byOption = new Map();
  for (const o of options) {
    const opt = {
      optionId: o.OptionId,
      name: o.Name,
      priceDelta: Number(o.PriceDelta),
      isDefault: Boolean(o.IsDefault),
      isActive: Boolean(o.IsActive),
      sortOrder: o.SortOrder,
      bom: [],
    };
    byOption.set(o.OptionId, opt);
    byGroup.get(o.GroupId)?.options.push(opt);
  }
  for (const b of boms) byOption.get(b.OptionId)?.bom.push({ ingredientId: b.IngredientId, name: b.Name, unit: b.Unit, amount: Number(b.Amount) });
  return [...byGroup.values()];
}

export async function getGroup(id) {
  return (await listGroups()).find((g) => g.groupId === id) ?? null;
}

/**
 * Lưu nhóm + toàn bộ tùy chọn (thêm/sửa; tùy chọn bị bỏ: chưa dùng trong đơn → xóa hẳn, đã dùng → xóa mềm).
 * options: [{ optionId?, name, priceDelta, isDefault, isActive, bom: [{ ingredientId, amount }] }]
 */
export async function saveGroup(id, { name, minSelect, maxSelect, sortOrder, options }) {
  return inTransaction(async (tx) => {
    let groupId = id;
    if (groupId) {
      const r = await txQuery(
        tx,
        'UPDATE dbo.ModifierGroups SET Name = @n, MinSelect = @min, MaxSelect = @max, SortOrder = @s WHERE GroupId = @id AND DeletedAt IS NULL',
        { id: [sql.Int, groupId], n: [sql.NVarChar(50), name], min: [sql.Int, minSelect], max: [sql.Int, maxSelect], s: [sql.Int, sortOrder] },
      );
      if (!r.rowsAffected[0]) return null;
    } else {
      const r = await txQuery(tx, 'INSERT dbo.ModifierGroups (Name, MinSelect, MaxSelect, SortOrder) OUTPUT inserted.GroupId VALUES (@n, @min, @max, @s)', {
        n: [sql.NVarChar(50), name],
        min: [sql.Int, minSelect],
        max: [sql.Int, maxSelect],
        s: [sql.Int, sortOrder],
      });
      groupId = r.recordset[0].GroupId;
    }

    const existing = await txQuery(tx, 'SELECT OptionId FROM dbo.ModifierOptions WHERE GroupId = @g AND DeletedAt IS NULL', { g: [sql.Int, groupId] });
    const keep = new Set(options.filter((o) => o.optionId).map((o) => o.optionId));
    for (const { OptionId } of existing.recordset) {
      if (keep.has(OptionId)) continue;
      const used = await txQuery(tx, 'SELECT COUNT(*) AS n FROM dbo.OrderItemModifiers WHERE OptionId = @o', { o: [sql.Int, OptionId] });
      if (used.recordset[0].n > 0) {
        await txQuery(tx, 'UPDATE dbo.ModifierOptions SET DeletedAt = SYSUTCDATETIME(), IsActive = 0 WHERE OptionId = @o', { o: [sql.Int, OptionId] });
      } else {
        await txQuery(tx, 'DELETE dbo.ModifierOptionBom WHERE OptionId = @o; DELETE dbo.ModifierOptions WHERE OptionId = @o;', { o: [sql.Int, OptionId] });
      }
    }

    for (const [i, o] of options.entries()) {
      const p = {
        g: [sql.Int, groupId],
        n: [sql.NVarChar(50), o.name],
        d: [sql.Decimal(12, 0), o.priceDelta],
        def: [sql.Bit, o.isDefault],
        act: [sql.Bit, o.isActive],
        s: [sql.Int, i + 1],
      };
      let optionId = o.optionId;
      if (optionId) {
        const r = await txQuery(
          tx,
          `UPDATE dbo.ModifierOptions SET Name = @n, PriceDelta = @d, IsDefault = @def, IsActive = @act, SortOrder = @s
           WHERE OptionId = @o AND GroupId = @g AND DeletedAt IS NULL`,
          { ...p, o: [sql.Int, optionId] },
        );
        if (!r.rowsAffected[0]) optionId = null;
      }
      if (!optionId) {
        const r = await txQuery(
          tx,
          'INSERT dbo.ModifierOptions (GroupId, Name, PriceDelta, IsDefault, IsActive, SortOrder) OUTPUT inserted.OptionId VALUES (@g, @n, @d, @def, @act, @s)',
          p,
        );
        optionId = r.recordset[0].OptionId;
      }
      await txQuery(tx, 'DELETE dbo.ModifierOptionBom WHERE OptionId = @o', { o: [sql.Int, optionId] });
      for (const b of o.bom) {
        await txQuery(tx, 'INSERT dbo.ModifierOptionBom (OptionId, IngredientId, Amount) VALUES (@o, @i, @a)', {
          o: [sql.Int, optionId],
          i: [sql.Int, b.ingredientId],
          a: [sql.Decimal(18, 3), b.amount],
        });
      }
    }
    return groupId;
  });
}

/** Xóa nhóm: gỡ khỏi món; đã dùng trong đơn → xóa mềm, chưa dùng → xóa hẳn. */
export async function removeGroup(id) {
  return inTransaction(async (tx) => {
    const f = await txQuery(tx, 'SELECT COUNT(*) AS n FROM dbo.ModifierGroups WITH (UPDLOCK, HOLDLOCK) WHERE GroupId = @g AND DeletedAt IS NULL', {
      g: [sql.Int, id],
    });
    if (!f.recordset[0].n) return null;
    await txQuery(tx, 'DELETE dbo.MenuItemModifierGroups WHERE GroupId = @g', { g: [sql.Int, id] });
    const used = await txQuery(
      tx,
      'SELECT COUNT(*) AS n FROM dbo.OrderItemModifiers im JOIN dbo.ModifierOptions o ON o.OptionId = im.OptionId WHERE o.GroupId = @g',
      { g: [sql.Int, id] },
    );
    if (used.recordset[0].n > 0) {
      await txQuery(
        tx,
        `UPDATE dbo.ModifierOptions SET DeletedAt = SYSUTCDATETIME(), IsActive = 0 WHERE GroupId = @g AND DeletedAt IS NULL;
         UPDATE dbo.ModifierGroups SET DeletedAt = SYSUTCDATETIME() WHERE GroupId = @g;`,
        { g: [sql.Int, id] },
      );
      return 'ARCHIVED';
    }
    await txQuery(
      tx,
      `DELETE ob FROM dbo.ModifierOptionBom ob JOIN dbo.ModifierOptions o ON o.OptionId = ob.OptionId WHERE o.GroupId = @g;
       DELETE dbo.ModifierOptions WHERE GroupId = @g;
       DELETE dbo.ModifierGroups WHERE GroupId = @g;`,
      { g: [sql.Int, id] },
    );
    return 'DELETED';
  });
}

export async function existingGroupIds(ids) {
  if (ids.length === 0) return new Set();
  const r = await query(
    "SELECT GroupId FROM dbo.ModifierGroups WHERE GroupId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ',')) AND DeletedAt IS NULL",
    { ids: [sql.NVarChar(sql.MAX), ids.join(',')] },
  );
  return new Set(r.recordset.map((x) => x.GroupId));
}
