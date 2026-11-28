// F-102 (ADR-073 D-266): mật khẩu dễ đoán — so không phân biệt hoa / thường. Hàm thuần, không đọc CSDL.

// Mật khẩu mẫu có trong mã nguồn / README / hướng dẫn / kết quả `npm run setup` của app — ai đọc tài liệu cũng biết
const SHIPPED = new Set(['admin@123', 'staff@123', 'pass@123']);

// Mật khẩu phổ biến nhất (các danh sách công khai từ những vụ lộ mật khẩu) + kiểu hay đặt ở quán
const COMMON = new Set([
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  '0123456789',
  '111111',
  '000000',
  '123123',
  '112233',
  '121212',
  '123321',
  '654321',
  '666666',
  '888888',
  '999999',
  '147258',
  '147258369',
  '159753',
  '123654',
  'abc123',
  'abcd1234',
  'a123456',
  'aa123456',
  '123qwe',
  'qwe123',
  'qwerty',
  'qwerty123',
  '1q2w3e4r',
  '1qaz2wsx',
  'qazwsx',
  'asdfgh',
  'zxcvbnm',
  'password',
  'password1',
  'passw0rd',
  'p@ssw0rd',
  'admin',
  'admin1',
  'admin123',
  'admin@1',
  'root',
  'iloveyou',
  'matkhau',
  'matkhau123',
  'quanly',
  'quanly123',
  'nhanvien',
  'nhanvien123',
  'staff123',
  'cafe123',
  'caphe123',
  'coffee',
  'coffee123',
]);

/** Dãy chữ số liền nhau tăng (345678) hoặc giảm (987654), mọi độ dài ≥ 6. */
function isRun(s) {
  if (!/^\d{6,}$/.test(s)) return false;
  const step = Number(s[1]) - Number(s[0]);
  if (Math.abs(step) !== 1) return false;
  for (let i = 1; i < s.length; i += 1) if (Number(s[i]) - Number(s[i - 1]) !== step) return false;
  return true;
}

/**
 * Lý do mật khẩu dễ đoán (để hiện cho người dùng), hoặc null nếu không dễ đoán.
 * `username` (không bắt buộc): trùng tên đăng nhập, hoặc tên đăng nhập + chỉ số / ký hiệu ("nhanvien1" + "123") cũng là dễ đoán.
 */
export function weakPasswordReason(password, username = null) {
  const p = String(password ?? '');
  const low = p.toLowerCase();
  if (SHIPPED.has(low)) return 'là mật khẩu mẫu ghi trong hướng dẫn của app';
  if (COMMON.has(low)) return 'là mật khẩu quá phổ biến';
  const user = String(username ?? '').toLowerCase();
  if (user && (low === user || (low.startsWith(user) && /^[^a-z\p{L}]+$/u.test(low.slice(user.length))))) {
    return 'giống tên đăng nhập';
  }
  if (/^(.)\1+$/su.test(p)) return 'chỉ lặp lại một ký tự';
  if (isRun(p)) return 'là dãy số liền nhau';
  return null;
}

export const isWeakPassword = (password, username = null) => weakPasswordReason(password, username) !== null;
