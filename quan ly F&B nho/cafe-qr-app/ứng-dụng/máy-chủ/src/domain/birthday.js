// F-067 quà sinh nhật hội viên (ADR-025 D-95…D-99) — hàm thuần, không chạm CSDL. Ngày dạng 'YYYY-MM-DD' theo giờ quán.
export const KINDS = ['PERCENT', 'AMOUNT', 'FREE_ITEM'];
export const SELF_WAIT_DAYS = 30; // D-99: ngày sinh khách tự thêm chỉ tính quà khi thêm trước ngày sinh nhật ≥ 30 ngày
const DAY_MS = 86_400_000;

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

/** Ngày sinh nhật trong năm `year`; 29/02 → 28/02 năm không nhuận. */
export function birthdayIn(birthDate, year) {
  const [, m, d] = birthDate.split('-');
  const day = m === '02' && d === '29' && !isLeap(year) ? '28' : d;
  return `${year}-${m}-${day}`;
}

/**
 * Tuần sinh nhật chứa `today` (± windowDays ngày quanh ngày sinh nhật, D-95) — xét cả năm trước / năm sau vì cửa sổ vắt qua năm.
 * → { date, year, offset (today − ngày sinh nhật, ngày), from, to } | null
 */
export function currentWindow(birthDate, today, windowDays) {
  if (!birthDate) return null;
  const year = Number(today.slice(0, 4));
  for (const y of [year - 1, year, year + 1]) {
    const date = birthdayIn(birthDate, y);
    const offset = dayNumber(today) - dayNumber(date);
    if (Math.abs(offset) <= windowDays) {
      const shift = (n) => new Date((dayNumber(date) + n) * DAY_MS).toISOString().slice(0, 10);
      return { date, year: y, offset, from: shift(-windowDays), to: shift(windowDays) };
    }
  }
  return null;
}

/** Lần sinh nhật kế tiếp tính từ `today` (kể cả hôm nay) — dùng cho danh sách "sinh nhật sắp tới". */
export function nextBirthday(birthDate, today) {
  const year = Number(today.slice(0, 4));
  const date = birthdayIn(birthDate, year);
  const target = date >= today ? date : birthdayIn(birthDate, year + 1);
  return { date: target, daysUntil: dayNumber(target) - dayNumber(today) };
}

/**
 * D-99: ngày sinh tự thêm (selfAt: thời điểm, UTC) chỉ tính khi thêm trước ngày sinh nhật ≥ SELF_WAIT_DAYS ngày.
 * Ngày sinh do quản lý nhập / xác minh (selfAt = null) luôn tính.
 */
export function selfDateCounts(selfAt, birthdayDate) {
  if (!selfAt) return true;
  const added = new Date(selfAt).toISOString().slice(0, 10); // so theo ngày là đủ — sai lệch múi giờ vài giờ không đổi kết quả 30 ngày
  return dayNumber(birthdayDate) - dayNumber(added) >= SELF_WAIT_DAYS;
}

/** Nhãn quà cho quầy / khách / hóa đơn. */
export function giftLabel({ kind, value, maxDiscount, menuItemName }) {
  const vnd = (n) => `${Math.round(Number(n)).toLocaleString('vi-VN')}đ`;
  if (kind === 'FREE_ITEM') return `Tặng 1 ${menuItemName ?? 'món'}`;
  if (kind === 'AMOUNT') return `Giảm ${vnd(value)}`;
  return `Giảm ${value}%${maxDiscount ? ` (tối đa ${vnd(maxDiscount)})` : ''}`;
}

/** Kiểm cài đặt quản lý gửi lên → câu báo lỗi đầu tiên, hoặc null khi hợp lệ. */
export function validateSettings(s) {
  if (!KINDS.includes(s.kind)) return 'Loại quà không hợp lệ';
  if (s.kind === 'PERCENT' && !(s.value >= 1 && s.value <= 50)) return 'Quà giảm % phải từ 1 đến 50%';
  if (s.kind === 'AMOUNT' && !(s.value >= 1000)) return 'Quà giảm tiền từ 1.000đ';
  if (s.kind === 'FREE_ITEM' && !s.menuItemId) return 'Chọn món được tặng';
  if (!(s.windowDays >= 0 && s.windowDays <= 15)) return 'Số ngày trước / sau sinh nhật từ 0 đến 15';
  return null;
}
