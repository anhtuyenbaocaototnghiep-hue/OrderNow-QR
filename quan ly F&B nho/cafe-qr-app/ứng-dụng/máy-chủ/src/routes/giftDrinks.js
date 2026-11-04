// F-070 ly treo — mua tặng bạn một ly (ADR-028): quầy bán ly tặng; trang quà công khai theo token.
// Nhận ly tặng đi qua ô "Mã voucher" sẵn có (POST /api/vouchers/validate + body thu tiền voucherCode) — không có API dùng riêng.
import express from 'express';
import { z } from 'zod';
import { requireStaff } from '../middleware/auth.js';
import { parse, zId, zText } from '../middleware/validate.js';
import * as giftDrinkService from '../services/giftDrinkService.js';

export const giftDrinksRouter = express.Router();

giftDrinksRouter.get('/gift-drinks/config', requireStaff, async (_req, res) => res.json(await giftDrinkService.posConfig()));
giftDrinksRouter.post('/gift-drinks', requireStaff, async (req, res) => {
  const body = parse(
    z.object({
      menuItemId: zId(),
      giverName: zText(60).optional().nullable(),
      message: zText(150).optional().nullable(),
      method: z.enum(['CASH', 'TRANSFER']).default('CASH'),
    }),
    req.body,
  );
  res.status(201).json(await giftDrinkService.sell(body, req.user));
});
// SCR-50 trang quà (công khai — ai có link là người được tặng)
giftDrinksRouter.get('/gifts/:token', async (req, res) => res.json(await giftDrinkService.publicView(String(req.params.token))));
