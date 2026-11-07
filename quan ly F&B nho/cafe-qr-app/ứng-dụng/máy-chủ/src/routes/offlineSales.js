// F-074 (ADR-032): bán tiếp khi mất mạng — máy quầy gửi bù đơn đã bán; trưởng ca / quản lý nhập đơn từ phiếu bán tay; danh sách theo ca.
import express from 'express';
import { z } from 'zod';
import { requireStaff } from '../middleware/auth.js';
import { parse, zId, zMoney, zText } from '../middleware/validate.js';
import * as offlineSaleService from '../services/offlineSaleService.js';

export const offlineSalesRouter = express.Router();
offlineSalesRouter.use('/offline-sales', requireStaff);

const zInstant = () => z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const saleBody = z
  .object({
    clientRef: z.uuid('Mã lượt thu không hợp lệ'),
    source: z.enum(['OFFLINE', 'PAPER']).default('OFFLINE'),
    localCode: zText(20).optional().nullable(),
    soldAt: zInstant(),
    soldBy: zId().optional().nullable(),
    shiftId: zId().optional().nullable(),
    method: z.enum(['CASH', 'TRANSFER']),
    amountReceived: zMoney().optional().nullable(),
    total: zMoney(),
    memberPhone: z.string().trim().max(20).optional().nullable(),
    device: zText(60).optional().nullable(),
    note: zText(200).optional().nullable(),
    items: z
      .array(
        z.object({
          menuItemId: zId(),
          quantity: z.coerce.number().int().min(1, 'Số lượng tối thiểu 1').max(50, 'Số lượng tối đa 50'),
          note: zText(200).optional().nullable(),
          optionIds: z.array(zId()).max(20).optional(),
          unitPrice: zMoney(), // giá đã thu một món (gồm tùy chọn)
        }),
      )
      .min(1, 'Đơn trống')
      .max(30, 'Tối đa 30 dòng món mỗi đơn'),
  })
  .refine((b) => b.method === 'TRANSFER' || (b.amountReceived ?? -1) >= b.total, {
    message: 'Tiền khách đưa phải từ tổng tiền trở lên',
    path: ['amountReceived'],
  });

offlineSalesRouter.post('/offline-sales', async (req, res) => {
  const r = await offlineSaleService.record(parse(saleBody, req.body), req.user);
  res.status(r.status === 'SYNCED' ? 201 : 200).json(r);
});

offlineSalesRouter.get('/offline-sales', async (req, res) => {
  const { shiftId } = parse(z.object({ shiftId: zId() }), req.query);
  res.json(await offlineSaleService.forShift(shiftId));
});
