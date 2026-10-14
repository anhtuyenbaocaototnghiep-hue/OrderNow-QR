// Thời gian: DB lưu UTC; nghiệp vụ theo ngày dùng giờ Việt Nam (UTC+7, không có giờ mùa hè).
const VN_OFFSET_MS = 7 * 3600 * 1000;

export const todayVn = () => new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10);

/** 'YYYY-MM-DD' (giờ VN) → thời điểm UTC của 00:00 ngày đó. */
export const vnDayStartUtc = (date) => new Date(Date.parse(`${date}T00:00:00Z`) - VN_OFFSET_MS);

export const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

export function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const isValidDate = (date) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().startsWith(date);
