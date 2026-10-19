// FEATURE-025 Thời gian chờ ước tính (ADR-006 D-18) — logic thuần, test độc lập.
// ETA = base + Σ thời gian chuẩn hàng chờ ÷ parallelism + thời gian chuẩn của giỏ; hiển thị khoảng ±spread %.

/** Thời gian chuẩn một món: quản lý nhập → trung vị thống kê (đủ mẫu) → mặc định. */
export function standardSeconds(item, { defaultSeconds = 180, minSamples = 3 } = {}) {
  if (!item) return defaultSeconds;
  if (item.prepSeconds) return item.prepSeconds;
  if (item.medianSeconds && (item.sampleCount ?? 0) >= minSamples) return item.medianSeconds;
  return defaultSeconds;
}

/**
 * Tổng giây của danh sách dòng [{ menuItemId, quantity }]. Combo tính theo món thành phần.
 * items: Map(menuItemId → { prepSeconds, medianSeconds, sampleCount, itemType, components: [{ menuItemId, quantity }] })
 */
export function linesSeconds(lines, items, opts = {}) {
  let total = 0;
  for (const l of lines) {
    const item = items.get(l.menuItemId);
    if (item?.itemType === 'COMBO' && item.components?.length) {
      total += linesSeconds(
        item.components.map((c) => ({ menuItemId: c.menuItemId, quantity: c.quantity * l.quantity })),
        items,
        opts,
      );
    } else total += standardSeconds(item, opts) * l.quantity;
  }
  return total;
}

/** Khoảng phút hiển thị. */
export function etaRange({ baseSeconds = 120, parallelism = 1, spreadPercent = 25, queueSeconds = 0, cartSeconds = 0 }) {
  const eta = baseSeconds + queueSeconds / Math.max(1, parallelism) + cartSeconds;
  const spread = Math.max(0, spreadPercent) / 100;
  const minMinutes = Math.max(1, Math.floor((eta * (1 - spread)) / 60));
  const maxMinutes = Math.max(minMinutes, Math.ceil((eta * (1 + spread)) / 60));
  return { etaSeconds: Math.round(eta), minMinutes, maxMinutes };
}

/** "12:2,15:1" → [{ menuItemId: 12, quantity: 2 }, …]; bỏ phần sai. Tối đa 30 dòng, mỗi dòng ≤ 50. */
export function parseItemsParam(text) {
  if (!text) return [];
  return String(text)
    .split(',')
    .slice(0, 30)
    .map((p) => p.split(':').map(Number))
    .filter(([id, q]) => Number.isInteger(id) && id > 0 && Number.isInteger(q) && q > 0 && q <= 50)
    .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
}

/** Trung vị (mảng số). */
export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
