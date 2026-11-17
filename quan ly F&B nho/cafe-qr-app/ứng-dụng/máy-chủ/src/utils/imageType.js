// Nhận dạng ảnh theo chữ ký tệp (không tin Content-Type / đuôi tệp người dùng gửi): jpg, png, webp. Dùng chung cho ảnh hóa đơn
// sổ quỹ (F-033) và logo quán (F-095, ADR-057). Không nhận SVG (có thể chứa mã chạy trong trình duyệt), gif hay tệp khác.
const TYPES = [
  ['jpg', 'image/jpeg', (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['png', 'image/png', (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['webp', 'image/webp', (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP'],
];

/** Buffer → { ext, contentType } nếu là jpg / png / webp, không thì null. */
export function imageType(buf) {
  if (!Buffer.isBuffer(buf)) return null;
  const t = TYPES.find(([, , ok]) => ok(buf));
  return t ? { ext: t[0], contentType: t[1] } : null;
}

/** Đuôi tệp đã lưu ('jpg' | 'png' | 'webp') → Content-Type khi trả tệp; đuôi lạ → null. */
export const contentTypeOf = (ext) => TYPES.find(([e]) => e === ext)?.[1] ?? null;
