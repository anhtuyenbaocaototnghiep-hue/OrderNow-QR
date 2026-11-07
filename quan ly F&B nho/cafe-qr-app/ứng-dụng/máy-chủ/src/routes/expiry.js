// F-075 (ADR-033): hạn dùng nguyên liệu ở máy quầy — rủi ro hết hạn + món nên mời (số tiền chỉ cho quản lý), bỏ phần hộp đã mở quá hạn.
import express from 'express';
import { z } from 'zod';
import { requireStaff } from '../middleware/auth.js';
import { paramId, parse, zText } from '../middleware/validate.js';
import * as expiryService from '../services/expiryService.js';

export const expiryRouter = express.Router();

expiryRouter.get('/expiry/risk', requireStaff, async (req, res) => {
  const r = await expiryService.risk();
  res.json(req.user.role === 'ADMIN' ? r : expiryService.withoutMoney(r));
});

expiryRouter.post('/ingredients/:id/discard-open', requireStaff, async (req, res) => {
  const { note } = parse(z.object({ note: zText(200).optional().nullable() }), req.body ?? {});
  res.json(await expiryService.discardOpenPack(paramId(req), req.user, note));
});
