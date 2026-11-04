// F-070 ly treo — mua tặng bạn một ly (ADR-028 D-112…D-118) — hàm thuần, không chạm CSDL.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // bỏ 0 O 1 I L — đọc mã qua điện thoại / Zalo không nhầm
export const CODE_PREFIX = 'TB';

/** D-113: mã ly tặng "TB" + 6 ký tự từ `bytes` (≥ 6 byte ngẫu nhiên). */
export function giftCode(bytes) {
  let out = CODE_PREFIX;
  for (let i = 0; i < 6; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/**
 * D-115: số trừ khi nhận ly = đơn giá món trên bill, không quá max(tiền đã trả, giá món hiện tại)
 * — giá tăng thì quán chịu; lên size / thêm topping thì người nhận trả phần chênh.
 */
export const giftDiscount = ({ unit, paid, currentPrice }) => Math.min(unit, Math.max(paid, currentPrice ?? 0));

/** Trạng thái ly tặng: CANCELLED · USED · EXPIRED · READY. */
export function giftState(g, now = new Date()) {
  if (g.cancelledAt) return 'CANCELLED';
  if (g.usedAt) return 'USED';
  return new Date(g.expiresAt) <= now ? 'EXPIRED' : 'READY';
}

/** Kiểm cài đặt quản lý gửi lên → câu báo lỗi, hoặc null khi hợp lệ. */
export function validateSettings({ validDays }) {
  return validDays >= 1 && validDays <= 365 ? null : 'Số ngày dùng được từ 1 đến 365';
}
