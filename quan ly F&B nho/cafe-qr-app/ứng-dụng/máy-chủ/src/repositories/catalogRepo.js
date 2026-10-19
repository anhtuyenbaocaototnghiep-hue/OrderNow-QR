// Danh mục giá cho bộ tính giá (pricing): món/combo, thành phần combo, nhóm + tùy chọn món. Một round-trip, nhiều recordset.
import { request } from '../db.js';

export async function loadCatalog() {
  const r = await (
    await request()
  ).query(`
    SELECT m.MenuItemId, m.Name, m.Price, m.ItemType, m.CategoryId FROM dbo.MenuItems m WHERE m.DeletedAt IS NULL;
    SELECT cc.ComboMenuItemId, cc.ComponentMenuItemId, c.Name, cc.Quantity
    FROM dbo.ComboComponents cc JOIN dbo.MenuItems c ON c.MenuItemId = cc.ComponentMenuItemId
    ORDER BY cc.ComboMenuItemId, c.Name;
    SELECT mg.MenuItemId, mg.GroupId FROM dbo.MenuItemModifierGroups mg JOIN dbo.ModifierGroups g ON g.GroupId = mg.GroupId
    WHERE g.DeletedAt IS NULL ORDER BY g.SortOrder, g.GroupId;
    SELECT GroupId, Name, MinSelect, MaxSelect, SortOrder FROM dbo.ModifierGroups WHERE DeletedAt IS NULL;
    SELECT OptionId, GroupId, Name, PriceDelta, IsDefault, SortOrder FROM dbo.ModifierOptions WHERE DeletedAt IS NULL AND IsActive = 1;`);
  const [itemsRs, compsRs, itemGroupsRs, groupsRs, optionsRs] = r.recordsets;
  const items = new Map(
    itemsRs.map((x) => [
      x.MenuItemId,
      { id: x.MenuItemId, name: x.Name, price: Number(x.Price), itemType: x.ItemType, categoryId: x.CategoryId, groupIds: [], components: [] },
    ]),
  );
  for (const c of compsRs) items.get(c.ComboMenuItemId)?.components.push({ menuItemId: c.ComponentMenuItemId, name: c.Name, quantity: c.Quantity });
  for (const g of itemGroupsRs) items.get(g.MenuItemId)?.groupIds.push(g.GroupId);
  const groups = new Map(
    groupsRs.map((g) => [g.GroupId, { id: g.GroupId, name: g.Name, minSelect: g.MinSelect, maxSelect: g.MaxSelect, sortOrder: g.SortOrder }]),
  );
  const options = new Map(
    optionsRs.map((o) => [
      o.OptionId,
      { id: o.OptionId, groupId: o.GroupId, name: o.Name, priceDelta: Number(o.PriceDelta), isDefault: Boolean(o.IsDefault), sortOrder: o.SortOrder },
    ]),
  );
  // Giờ bán theo danh mục (F-020) nay đi qua lịch thực đơn (F-040) — scheduleService
  return { items, groups, options };
}
