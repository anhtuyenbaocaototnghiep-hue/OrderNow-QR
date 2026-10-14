// Giỏ hàng phía client (FEATURE-002): lưu localStorage theo sessionId để reload vẫn còn (AC-002-04).
// Server không lưu giỏ chưa gửi; giá chỉ để hiển thị — server tính lại từ DB (BR-012).
const key = (scope) => `cf_cart_${scope}`;
export const MAX_QTY = 50; // BR-015

export function loadCart(scope) {
  try {
    const lines = JSON.parse(localStorage.getItem(key(scope)));
    return Array.isArray(lines) ? lines.filter((l) => l && Number.isInteger(l.menuItemId) && l.quantity > 0) : [];
  } catch {
    return [];
  }
}

export function saveCart(scope, lines) {
  try {
    localStorage.setItem(key(scope), JSON.stringify(lines));
  } catch {
    /* chế độ riêng tư / bộ nhớ đầy — giỏ vẫn chạy trong trang */
  }
}

export function clearCart(scope) {
  try {
    localStorage.removeItem(key(scope));
  } catch {
    /* bỏ qua */
  }
}

export function addItem(lines, item) {
  const line = lines.find((l) => l.menuItemId === item.id);
  if (line) line.quantity = Math.min(MAX_QTY, line.quantity + 1);
  else lines.push({ menuItemId: item.id, name: item.name, price: item.price, quantity: 1, note: '' });
  return lines;
}

export function setQuantity(lines, menuItemId, quantity) {
  const q = Math.max(0, Math.min(MAX_QTY, Math.floor(quantity)));
  const idx = lines.findIndex((l) => l.menuItemId === menuItemId);
  if (idx < 0) return lines;
  if (q === 0) lines.splice(idx, 1);
  else lines[idx].quantity = q;
  return lines;
}

export const cartCount = (lines) => lines.reduce((s, l) => s + l.quantity, 0);
export const cartTotal = (lines) => lines.reduce((s, l) => s + l.quantity * l.price, 0);
export const toOrderItems = (lines) => lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, note: l.note?.trim() || null }));

/** Cập nhật tên/giá theo menu mới nhất; trả danh sách món không còn trên menu. */
export function syncWithMenu(lines, itemsById) {
  const gone = [];
  for (const l of lines) {
    const item = itemsById.get(l.menuItemId);
    if (!item) gone.push(l);
    else {
      l.name = item.name;
      l.price = item.price;
    }
  }
  return gone;
}
