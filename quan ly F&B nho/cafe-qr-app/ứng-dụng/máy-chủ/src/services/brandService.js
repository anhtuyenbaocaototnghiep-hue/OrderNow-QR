// F-095 (ADR-057 D-234): logo quán — chủ quán tải ảnh jpg / png / webp ≤ 1 MB (kiểm chữ ký tệp, không SVG), lưu
// uploads/brand/logo-<ngẫu nhiên>.<đuôi>, cài đặt shop.logo = đường dẫn tương đối; ảnh mới thay → xóa tệp cũ. Cách nhận ảnh như ảnh
// hóa đơn sổ quỹ (F-033): thân request là ảnh, tên tệp do máy chủ tạo, chỉ đọc tệp nằm trong uploads/brand/.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { badRequest, notFound } from '../errors.js';
import * as settingsRepo from '../repositories/settingsRepo.js';
import { contentTypeOf, imageType } from '../utils/imageType.js';
import { getSettings, invalidateSettings, logoUrlOf } from './settingsService.js';

export const MAX_LOGO_BYTES = 1024 * 1024;
const KEY = 'shop.logo';
const brandDir = () => path.join(config.uploadsDir, 'brand');
/** Đường dẫn tương đối (trong uploads/) → tệp tuyệt đối, chỉ khi nằm trong uploads/brand/ (chống thoát thư mục). */
const inBrandDir = (rel) => {
  const file = path.resolve(config.uploadsDir, rel);
  return file.startsWith(path.resolve(brandDir()) + path.sep) ? file : null;
};
const removeFile = async (rel) => {
  const file = rel && inBrandDir(rel);
  if (file) await fs.rm(file, { force: true }).catch(() => {});
};

/** Lưu logo mới (Buffer từ thân request) → { logoUrl }. */
export async function setLogo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw badRequest('LOGO_INVALID', 'Chọn ảnh logo (jpg, png hoặc webp)');
  if (buf.length > MAX_LOGO_BYTES) throw badRequest('LOGO_TOO_LARGE', 'Ảnh logo tối đa 1 MB');
  const type = imageType(buf);
  if (!type) throw badRequest('LOGO_INVALID', 'Logo phải là ảnh jpg, png hoặc webp');
  const old = (await getSettings()).shopLogo;
  await fs.mkdir(brandDir(), { recursive: true });
  const rel = `brand/logo-${crypto.randomBytes(8).toString('hex')}.${type.ext}`;
  await fs.writeFile(path.join(config.uploadsDir, rel), buf, { flag: 'wx' });
  await settingsRepo.setMany([[KEY, rel]]);
  invalidateSettings();
  if (old && old !== rel) await removeFile(old);
  return { logoUrl: logoUrlOf(rel) };
}

/** Bỏ logo → các màn về biểu tượng ly cà phê. */
export async function removeLogo() {
  const old = (await getSettings()).shopLogo;
  await settingsRepo.setMany([[KEY, '']]);
  invalidateSettings();
  await removeFile(old);
  return { logoUrl: null };
}

/** Tệp logo đang dùng → { file, contentType }; chưa có / tệp mất → 404. */
export async function logoFile() {
  const rel = (await getSettings()).shopLogo;
  const file = rel ? inBrandDir(rel) : null;
  const contentType = file ? contentTypeOf(path.extname(file).slice(1)) : null;
  if (!file || !contentType) throw notFound('Quán chưa có logo');
  try {
    await fs.access(file);
  } catch {
    throw notFound('Quán chưa có logo');
  }
  return { file, contentType };
}
