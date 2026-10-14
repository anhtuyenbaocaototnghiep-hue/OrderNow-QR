// Validate input bằng zod; lỗi → 400 VALIDATION_ERROR kèm danh sách trường sai.
import { z } from 'zod';
import { badRequest } from '../errors.js';

export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { fields });
  }
  return result.data;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const zGuid = () =>
  z
    .string()
    .regex(GUID, 'Mã phiên không hợp lệ')
    .transform((s) => s.toLowerCase());
export const zId = () => z.coerce.number().int().positive();
export const zQrToken = () => z.string().regex(/^[0-9a-f]{32}$/i, 'Mã bàn không hợp lệ');
export const zMoney = () => z.coerce.number().int().min(0).max(1_000_000_000);
export const zDate = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD');
export const zText = (max) => z.string().trim().max(max);

/** Một dòng giỏ hàng (BR-015: 1..50; ghi chú ≤ 200). */
export const zOrderItems = () =>
  z
    .array(
      z.object({
        menuItemId: zId(),
        quantity: z.coerce.number().int().min(1, 'Số lượng tối thiểu 1').max(50, 'Số lượng tối đa 50'),
        note: zText(200).optional().nullable(),
      }),
    )
    .min(1, 'Giỏ hàng trống')
    .max(30, 'Tối đa 30 dòng món mỗi đơn');

export const paramId = (req, name = 'id') => parse(zId(), req.params[name]);
export const paramGuid = (req, name = 'id') => parse(zGuid(), req.params[name]);
