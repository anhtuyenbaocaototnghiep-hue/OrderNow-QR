/**
 * ADR-070 D-262: số điện thoại quán in trên hóa đơn, màn chào, thẻ QR bàn, phiếu đặt hàng.
 * Giữ cách viết của chủ quán (khoảng trắng, dấu chấm, gạch ngang) để in đẹp; chỉ kiểm số chữ số:
 * - di động / bàn: 0 + 9–10 số (0909 123 456, 028 3822 1234);
 * - viết kiểu quốc tế: +84 + 9–10 số;
 * - tổng đài: 1800 / 1900 + 4–6 số.
 */
export function isShopPhone(s) {
  if (!/^\+?[\d .\-()]+$/.test(s)) return false;
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return /^84\d{9,10}$/.test(digits);
  return /^0\d{9,10}$/.test(digits) || /^1[89]00\d{4,6}$/.test(digits);
}
