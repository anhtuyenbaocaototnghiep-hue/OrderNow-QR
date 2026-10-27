// F-060 (ADR-020 D-75, BR-093): so một giá trị với ngưỡng cố định và "mức bình thường" = trung bình + 2 độ lệch chuẩn
// của các ca trước. Hàm thuần — dễ test, dễ giải thích khi phản biện ("bình thường ~X, ca này Y").

/** Cần ít nhất ngần này ca đã đóng trước đó mới so mức bình thường (ít hơn → chỉ dùng ngưỡng cố định). */
export const MIN_SHIFTS = 10;

/** values: số liệu của các ca trước → { n, mean, sd, limit } (độ lệch chuẩn mẫu; limit = mean + 2·sd). */
export function baseline(values) {
  const n = values.length;
  if (n === 0) return { n: 0, mean: 0, sd: 0, limit: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd, limit: mean + 2 * sd };
}

/**
 * Bất thường khi vượt ngưỡng cố định, HOẶC (bật so mức bình thường, đủ MIN_SHIFTS ca) vượt mean + 2·sd, lớn hơn mean
 * và không dưới mức tối thiểu `floor` (tránh báo động vì 1 món hủy khi bình thường là 0).
 * → { anomalous, byFixed, byStats }
 */
export function judge({ value, fixed = null, floor = 0, base = null, useStats = true }) {
  const byFixed = fixed !== null && value > fixed;
  const byStats = Boolean(useStats && base && base.n >= MIN_SHIFTS && value > base.limit && value > base.mean && value >= floor);
  return { anomalous: byFixed || byStats, byFixed, byStats };
}

/**
 * Giờ yên lặng (giờ quán, 'HH:MM'): `minutes` = phút trong ngày lúc này. Trả số phút còn lại tới hết giờ yên lặng,
 * 0 nếu không trong giờ yên lặng / chưa bật. Hỗ trợ khoảng qua nửa đêm (23:00 → 06:00).
 */
export function quietMinutesLeft(minutes, start, end) {
  if (!start || !end || start === end) return 0;
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const s = toMin(start);
  const e = toMin(end);
  const inside = s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
  if (!inside) return 0;
  return (e - minutes + 1440) % 1440;
}
