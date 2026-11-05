// VietQR (chuẩn EMVCo + NAPAS, công khai, không cần đăng ký): app tự tạo mã có số tài khoản, số tiền, nội dung — miễn phí.
// Mỗi trường = mã 2 số + độ dài 2 số + giá trị; cuối là CRC-16/CCITT-FALSE. Dùng cho trả lương (F-073), về sau cho thu tiền.
export const BANKS = [
  { bin: '970436', name: 'Vietcombank' },
  { bin: '970415', name: 'VietinBank' },
  { bin: '970418', name: 'BIDV' },
  { bin: '970405', name: 'Agribank' },
  { bin: '970407', name: 'Techcombank' },
  { bin: '970422', name: 'MB Bank' },
  { bin: '970416', name: 'ACB' },
  { bin: '970432', name: 'VPBank' },
  { bin: '970423', name: 'TPBank' },
  { bin: '970403', name: 'Sacombank' },
  { bin: '970437', name: 'HDBank' },
  { bin: '970441', name: 'VIB' },
  { bin: '970443', name: 'SHB' },
  { bin: '970448', name: 'OCB' },
  { bin: '970426', name: 'MSB' },
  { bin: '970454', name: 'Bản Việt' },
];
export const bankName = (bin) => BANKS.find((b) => b.bin === bin)?.name ?? null;

const f = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC-16/CCITT-FALSE (đa thức 0x1021, khởi tạo 0xFFFF) — chữ hoa 4 ký tự. */
export function crc16(text) {
  let crc = 0xffff;
  for (const byte of Buffer.from(text, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Nội dung chuyển khoản: bỏ dấu, chữ hoa, chỉ chữ / số / khoảng trắng, tối đa 25 ký tự (app ngân hàng nào cũng nhận). */
export function transferContent(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 25)
    .trim();
}

/** Dòng chữ VietQR. amount > 0 → mã dùng một lần (12), không có → mã cố định (11). */
export function vietQrPayload({ bin, account, amount = 0, content = '' }) {
  if (!/^\d{6}$/.test(bin ?? '') || !/^[0-9A-Za-z]{4,19}$/.test(account ?? '')) throw new Error('VIETQR_ACCOUNT_INVALID');
  const merchant = f('00', 'A000000727') + f('01', f('00', bin) + f('01', account)) + f('02', 'QRIBFTTA');
  const note = transferContent(content);
  const body =
    f('00', '01') +
    f('01', amount > 0 ? '12' : '11') +
    f('38', merchant) +
    f('53', '704') +
    (amount > 0 ? f('54', String(Math.round(amount))) : '') +
    f('58', 'VN') +
    (note ? f('62', f('08', note)) : '') +
    '6304';
  return body + crc16(body);
}
