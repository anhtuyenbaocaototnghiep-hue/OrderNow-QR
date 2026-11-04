// F-069 mừng khách quay lại (ADR-027 D-107…D-111) — hàm thuần, không chạm CSDL. Ngày dạng 'YYYY-MM-DD' theo giờ quán.
import { validateGift } from './birthday.js';

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;
const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const vnDate = (at) => new Date(new Date(at).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

/** D-107: số ngày (giờ quán) từ lần thanh toán gần nhất `lastVisitAt` (UTC) tới `today`; null khi chưa thanh toán lần nào. */
export function absentDays(lastVisitAt, today) {
  return lastVisitAt ? dayNumber(today) - dayNumber(vnDate(lastVisitAt)) : null;
}

/** Kiểm cài đặt quản lý gửi lên → câu báo lỗi đầu tiên, hoặc null khi hợp lệ. */
export function validateSettings(s) {
  const gift = validateGift(s);
  if (gift) return gift;
  if (!(s.afterDays >= 14 && s.afterDays <= 365)) return 'Số ngày vắng từ 14 đến 365';
  if (!(s.holdDays >= 1 && s.holdDays <= 60)) return 'Số ngày giữ quà từ 1 đến 60';
  if (!(s.cooldownDays >= s.afterDays && s.cooldownDays <= 730)) return 'Số ngày giữa hai quà phải từ số ngày vắng tới 730';
  return null;
}
