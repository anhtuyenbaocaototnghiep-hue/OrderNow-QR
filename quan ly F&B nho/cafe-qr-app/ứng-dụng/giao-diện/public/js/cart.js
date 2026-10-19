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

/** Thêm 1 phần. `choice` = { optionIds, optionLabels, optionDelta } khi món có tùy chọn. */
export function addItem(lines, item, choice = {}) {
  const optionIds = choice.optionIds ?? [];
  const key = lineKey(item.id, optionIds);
  const line = lines.find((l) => l.key === key);
  if (line) line.quantity = Math.min(MAX_QTY, line.quantity + 1);
  else {
    lines.push({
      key,
      menuItemId: item.id,
      name: item.name,
      price: item.price + (choice.optionDelta ?? 0),
      quantity: 1,
      note: '',
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
