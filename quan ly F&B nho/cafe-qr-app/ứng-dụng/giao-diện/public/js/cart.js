// Giỏ hàng phía client (FEATURE-002): lưu localStorage theo sessionId để reload vẫn còn (AC-002-04).
// Server không lưu giỏ chưa gửi; giá ở đây chỉ để hiển thị tạm — tổng chính thức lấy từ báo giá server (ADR-005, BR-012).
// Một dòng = món + bộ tùy chọn (F-013): cùng món khác tùy chọn là hai dòng (khóa `key`).
const storageKey = (scope) => `cf_cart_${scope}`;
export const MAX_QTY = 50; // BR-015

export const lineKey = (menuItemId, optionIds = []) =>
  optionIds.length ? `${menuItemId}:${[...optionIds].sort((a, b) => a - b).join('.')}` : String(menuItemId);

export function loadCart(scope) {
  try {
    const lines = JSON.parse(localStorage.getItem(storageKey(scope)));
    if (!Array.isArray(lines)) return [];
    return lines
      .filter((l) => l && Number.isInteger(l.menuItemId) && l.quantity > 0)
      .map((l) => ({ optionIds: [], optionLabels: [], optionDelta: 0, ...l, key: l.key || lineKey(l.menuItemId, l.optionIds) }));
  } catch {
    return [];
  }
}

export function saveCart(scope, lines) {
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(lines));
  } catch {
    /* chế độ riêng tư / bộ nhớ đầy — giỏ vẫn chạy trong trang */
  }
}

export function clearCart(scope) {
  try {
    localStorage.removeItem(storageKey(scope));
  } catch {
    /* bỏ qua */
  }
}

/**
 * Thêm `quantity` phần (mặc định 1). `choice` = { optionIds, optionLabels, optionDelta } khi món có tùy chọn.
 * F-081: có truyền `note` (bảng chọn món của khách) → cùng món + cùng tùy chọn + cùng ghi chú mới cộng dồn, ghi chú khác → dòng
 * riêng (khóa `key~n`); không truyền (quầy, nút "+" nhanh) → cộng vào dòng cùng món + tùy chọn như trước.
 */
export function addItem(lines, item, choice = {}, { quantity = 1, note } = {}) {
  const optionIds = choice.optionIds ?? [];
  const base = lineKey(item.id, optionIds);
  const clean = (s) => (s ?? '').trim();
  const add = Math.max(1, Math.floor(quantity));
  const line =
    note === undefined
      ? lines.find((l) => l.key === base)
      : lines.find((l) => (l.key === base || l.key.startsWith(`${base}~`)) && clean(l.note) === clean(note));
  if (line) line.quantity = Math.min(MAX_QTY, line.quantity + add);
  else {
    let key = base;
    for (let i = 1; lines.some((l) => l.key === key); i++) key = `${base}~${i}`;
    lines.push({
      key,
      menuItemId: item.id,
      name: item.name,
      price: item.price + (choice.optionDelta ?? 0),
      quantity: Math.min(MAX_QTY, add),
      note: clean(note).slice(0, 200),
      optionIds,
      optionLabels: choice.optionLabels ?? [],
      optionDelta: choice.optionDelta ?? 0,
      isCombo: item.itemType === 'COMBO',
    });
  }
  return lines;
}

export function setQuantity(lines, key, quantity) {
  const q = Math.max(0, Math.min(MAX_QTY, Math.floor(quantity)));
  const idx = lines.findIndex((l) => l.key === key);
  if (idx < 0) return lines;
  if (q === 0) lines.splice(idx, 1);
  else lines[idx].quantity = q;
  return lines;
}

/** Bỏ mọi dòng của một món (món vừa hết). */
export const removeItem = (lines, menuItemId) => lines.filter((l) => l.menuItemId !== menuItemId);

export const itemQuantity = (lines, menuItemId) => lines.filter((l) => l.menuItemId === menuItemId).reduce((s, l) => s + l.quantity, 0);
export const cartCount = (lines) => lines.reduce((s, l) => s + l.quantity, 0);
export const cartTotal = (lines) => lines.reduce((s, l) => s + l.quantity * l.price, 0);
export const toOrderItems = (lines) =>
  lines.map((l) => ({
    menuItemId: l.menuItemId,
    quantity: l.quantity,
    note: l.note?.trim() || null,
    ...(l.optionIds?.length ? { optionIds: l.optionIds } : {}),
  }));

/** Cập nhật tên/giá theo menu mới nhất; trả danh sách dòng không còn trên menu. */
export function syncWithMenu(lines, itemsById) {
  const gone = [];
  for (const l of lines) {
    const item = itemsById.get(l.menuItemId);
    if (!item) gone.push(l);
    else {
      l.name = item.name;
      l.price = item.price + (l.optionDelta ?? 0);
      l.isCombo = item.itemType === 'COMBO';
    }
  }
  return gone;
}
