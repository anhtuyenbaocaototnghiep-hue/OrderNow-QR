// F-064 (ADR-023): báo động giá vốn — hàm thuần, không chạm CSDL.
// Đơn giá nguyên liệu luôn theo đơn vị gốc (như StockReceiptLines.UnitCost). Giá vốn không tính hao hụt, giống báo cáo giá vốn (stockRepo.cogs).
export const SUSPECT_PCT = 50; // tăng hơn mức này so với cả mốc lẫn phiếu trước → nghi nhập nhầm (D-88)
export const HISTORY_DAYS = 90; // mốc giảm theo phiếu rẻ hơn trong khoảng này (D-85)
export const SUGGEST_STEP = 1000; // giá gợi ý làm tròn lên (D-87)

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Giá mốc của một nguyên liệu (D-85).
 * anchor: lần báo gần nhất { receiptId, unitCost } | null; history: các dòng có giá của phiếu trước, chưa hủy [{ receiptId, unitCost, receivedAt }].
 * → { ref: giá mốc | null, last: giá phiếu gần nhất | null }
 */
export function referencePrice({ anchor = null, history = [], now = new Date() }) {
  const newest = history.reduce((a, h) => (!a || h.receiptId > a.receiptId ? h : a), null);
  const last = newest ? newest.unitCost : null;
  const since = now.getTime() - HISTORY_DAYS * 86_400_000;
  const recent = history.filter((h) => (!anchor || h.receiptId > anchor.receiptId) && new Date(h.receivedAt).getTime() >= since).map((h) => h.unitCost);
  if (anchor) return { ref: Math.min(anchor.unitCost, ...recent), last };
  return { ref: recent.length ? Math.min(...recent) : last, last };
}

/**
 * Phân loại dòng phiếu theo giá mốc. lines: [{ ingredientId, unitCost }]; refs: Map ingredientId → { ref, last }.
 * → [{ ...line, oldCost, newCost, risePct, major, suspect }] (bỏ dòng không có giá hoặc chưa từng có giá)
 */
export function classifyLines(lines, refs, { risePct }) {
  const out = [];
  for (const l of lines) {
    const r = refs.get(l.ingredientId);
    if (l.unitCost === null || l.unitCost === undefined || !r || !(r.ref > 0)) continue;
    const pct = round2(((l.unitCost - r.ref) / r.ref) * 100);
    const suspect = pct > SUSPECT_PCT && r.last > 0 && round2(((l.unitCost - r.last) / r.last) * 100) > SUSPECT_PCT;
    out.push({ ...l, oldCost: r.ref, newCost: l.unitCost, risePct: pct, major: !suspect && pct >= risePct, suspect });
  }
  return out;
}

/** Hai mức giá gợi ý (D-87), đồng nguyên. keepMargin = null khi giá cũ đã lỗ / hòa vốn. */
export function suggestPrices({ price, oldCost, newCost }) {
  const up = (n) => Math.ceil(Math.round(n) / SUGGEST_STEP) * SUGGEST_STEP;
  return {
    keepAmount: up(price + (newCost - oldCost)),
    keepMargin: oldCost > 0 && oldCost < price ? up((newCost * price) / oldCost) : null,
  };
}

const marginPct = (price, cost) => ((price - cost) / price) * 100;

/**
 * Tác động lên thực đơn.
 * snapshot: { ingredients: Map id → { name, lastUnitCost, avgCost }, recipes: Map semiId → { outputQty, lines: [{ ingredientId, qty }] },
 *             bom: Map menuItemId → [{ ingredientId, amount }], combos: Map menuItemId → [{ componentId, quantity }],
 *             items: [{ menuItemId, name, itemType, price }], options: [{ name, group, priceDelta, bom: [{ ingredientId, amount }] }],
 *             sales: Map menuItemId → số bán 30 ngày }
 * changes: kết quả classifyLines. thresholds: { marginDrop, marginMin }.
 * → { items (bị báo, xếp theo tiền mất), unknown (chưa tính được), options, monthlyLoss }
 */
export function menuImpact(snapshot, changes, { marginDrop, marginMin }) {
  const oldPrices = new Map();
  const newPrices = new Map();
  for (const c of changes) {
    oldPrices.set(c.ingredientId, c.oldCost);
    newPrices.set(c.ingredientId, c.suspect ? c.oldCost : c.newCost); // giá nghi nhầm không được tính vào lãi món
  }
  const major = new Set(changes.filter((c) => c.major).map((c) => c.ingredientId));
  const nameOf = (id) => snapshot.ingredients.get(id)?.name ?? `#${id}`;

  /** Đơn giá một nguyên liệu → { cost | null, missing: [tên], uses: Set id } — bán thành phẩm đi qua công thức. */
  function unit(id, prices, seen = new Set()) {
    if (prices.has(id)) return { cost: prices.get(id), missing: [], uses: new Set([id]) };
    const recipe = snapshot.recipes.get(id);
    if (recipe?.lines.length && !seen.has(id)) {
      const parts = recipe.lines.map((l) => ({ qty: l.qty, ...unit(l.ingredientId, prices, new Set([...seen, id])) }));
      return {
        cost: parts.some((p) => p.cost === null) ? null : parts.reduce((s, p) => s + p.cost * p.qty, 0) / recipe.outputQty,
        missing: parts.flatMap((p) => p.missing),
        uses: new Set(parts.flatMap((p) => [...p.uses])),
      };
    }
    const i = snapshot.ingredients.get(id);
    const known = i?.lastUnitCost ?? (i?.avgCost > 0 ? i.avgCost : null);
    return { cost: known, missing: known === null ? [nameOf(id)] : [], uses: new Set() };
  }
  /** Giá vốn một danh sách định lượng [{ ingredientId, amount }]. */
  function cost(bom, prices) {
    const parts = bom.map((b) => ({ amount: b.amount, ...unit(b.ingredientId, prices) }));
    return {
      cost: parts.some((p) => p.cost === null) ? null : parts.reduce((s, p) => s + p.cost * p.amount, 0),
      missing: parts.flatMap((p) => p.missing),
      uses: new Set(parts.flatMap((p) => [...p.uses])),
    };
  }
  /** Giá vốn một món / combo. Combo có thành phần chưa có định lượng → chưa tính được. */
  function itemCost(item, prices) {
    if (item.itemType !== 'COMBO') return cost(snapshot.bom.get(item.menuItemId) ?? [], prices);
    const parts = (snapshot.combos.get(item.menuItemId) ?? []).map((k) => {
      const bom = snapshot.bom.get(k.componentId);
      const c = cost(bom ?? [], prices);
      return { quantity: k.quantity, ...c, ...(bom?.length ? {} : { cost: null, missing: ['định lượng món thành phần'] }) };
    });
    return {
      cost: !parts.length || parts.some((p) => p.cost === null) ? null : parts.reduce((s, p) => s + p.cost * p.quantity, 0),
      missing: parts.flatMap((p) => p.missing),
      uses: new Set(parts.flatMap((p) => [...p.uses])),
    };
  }

  const items = [];
  const unknown = [];
  for (const item of snapshot.items) {
    const before = itemCost(item, oldPrices);
    const causes = [...before.uses].filter((id) => major.has(id));
    if (!causes.length || !(item.price > 0)) continue;
    if (before.cost === null) {
      unknown.push({ menuItemId: item.menuItemId, name: item.name, itemType: item.itemType, missing: [...new Set(before.missing)], causeIds: causes });
      continue;
    }
    const oldCost = Math.round(before.cost);
    const newCost = Math.round(itemCost(item, newPrices).cost);
    if (newCost <= oldCost) continue;
    const oldMargin = round1(marginPct(item.price, oldCost));
    const newMargin = round1(marginPct(item.price, newCost));
    const drop = round1(oldMargin - newMargin);
    if (drop < marginDrop && newMargin >= marginMin) continue;
    const qty30 = snapshot.sales.get(item.menuItemId) ?? 0;
    const prices = suggestPrices({ price: item.price, oldCost, newCost });
    items.push({
      menuItemId: item.menuItemId,
      name: item.name,
      itemType: item.itemType,
      price: item.price,
      oldCost,
      newCost,
      oldMargin,
      newMargin,
      drop,
      qty30,
      monthlyLoss: (newCost - oldCost) * qty30,
      suggestKeepAmount: prices.keepAmount,
      suggestKeepMargin: prices.keepMargin,
      causes: causes.map(nameOf),
      causeIds: causes,
    });
  }
  items.sort((a, b) => b.monthlyLoss - a.monthlyLoss || b.drop - a.drop || a.name.localeCompare(b.name, 'vi'));

  const options = [];
  for (const o of snapshot.options) {
    const before = cost(o.bom, oldPrices);
    if (before.cost === null || ![...before.uses].some((id) => major.has(id))) continue;
    const newCost = Math.round(cost(o.bom, newPrices).cost);
    if (newCost > Math.round(before.cost)) options.push({ name: o.name, group: o.group, priceDelta: o.priceDelta, oldCost: Math.round(before.cost), newCost });
  }

  return { items, unknown, options, monthlyLoss: items.reduce((s, i) => s + i.monthlyLoss, 0) };
}
