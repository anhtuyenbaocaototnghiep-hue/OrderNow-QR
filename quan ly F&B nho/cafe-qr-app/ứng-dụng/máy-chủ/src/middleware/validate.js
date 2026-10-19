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

/** Một dòng giỏ hàng (BR-015: 1..50; ghi chú ≤ 200; tùy chọn món F-013). */
export const zOrderItems = () =>
  z
    .array(
      z.object({
        menuItemId: zId(),
        quantity: z.coerce.number().int().min(1, 'Số lượng tối thiểu 1').max(50, 'Số lượng tối đa 50'),
        note: zText(200).optional().nullable(),
        optionIds: z.array(zId()).max(20, 'Tối đa 20 tùy chọn mỗi món').optional(), // F-013
      }),
    )
    .min(1, 'Giỏ hàng trống')
    .max(30, 'Tối đa 30 dòng món mỗi đơn');

export const paramId = (req, name = 'id') => parse(zId(), req.params[name]);
export const paramGuid = (req, name = 'id') => parse(zGuid(), req.params[name]);

/** 'HH:MM' (giờ quán) hoặc null. */
export const zTime = () =>
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải có dạng HH:MM')
    .nullable()
    .optional()
    .transform((v) => v || null);

/** Giảm giá tay (F-022): số tiền hoặc %. */
export const zManualDiscount = () =>
  z
    .object({ kind: z.enum(['AMOUNT', 'PERCENT']), value: z.coerce.number().min(0).max(1_000_000_000) })
    .refine((d) => d.kind !== 'PERCENT' || d.value <= 100, 'Phần trăm tối đa 100')
    .optional()
    .nullable();

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD (ngày giờ VN, có thật). Kiểm thứ tự/tương lai ở service (BR-005). */
export function parseRange(query) {
  const q = parse(z.object({ from: zDate(), to: zDate() }).passthrough(), query);
  const real = (d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);
  if (!real(q.from) || !real(q.to) || q.from > q.to) throw badRequest('INVALID_RANGE', 'Khoảng thời gian không hợp lệ');
  return { from: q.from, to: q.to };
}

/** ?from&to (ngày quán) → khoảng UTC [00:00 from, 00:00 to+1). */
export function parseUtcRange(query) {
  const { from, to } = parseRange(query);
  const start = (d) => new Date(Date.parse(`${d}T00:00:00Z`) - 7 * 3600 * 1000);
  return { from, to, fromUtc: start(from), toUtc: new Date(start(to).getTime() + 86400000) };
}
