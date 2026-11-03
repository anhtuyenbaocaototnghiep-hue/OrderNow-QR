// F-065 vòng quay may mắn (ADR-024): trang quay của khách (theo mã, không cần đăng nhập) + lượt quay trên màn cảm ơn của phiên.
import express from 'express';
import { z } from 'zod';
import { forbidden } from '../errors.js';
import { optionalStaff } from '../middleware/auth.js';
import { orderLimiter } from '../middleware/rateLimit.js';
import { paramGuid, parse } from '../middleware/validate.js';
import * as sessionsRepo from '../repositories/sessionsRepo.js';
import * as luckySpinService from '../services/luckySpinService.js';

export const luckySpinRouter = express.Router();

const token = (req) => parse(z.string().regex(/^[0-9a-f]{32}$/, 'Mã quay không đúng'), req.params.token);

luckySpinRouter.get('/lucky-spins/:token', async (req, res) => res.json(await luckySpinService.view(token(req))));
luckySpinRouter.post('/lucky-spins/:token/spin', orderLimiter, async (req, res) => res.json(await luckySpinService.spin(token(req))));

// Màn cảm ơn: chỉ thiết bị trong phiên (hoặc nhân viên) thấy mã quay của phiên
luckySpinRouter.get('/sessions/:id/lucky-spins', optionalStaff, async (req, res) => {
  const sessionId = paramGuid(req);
  if (!req.user && !(await sessionsRepo.isMember(sessionId, req.clientToken))) throw forbidden('Phiên này không thuộc thiết bị của bạn');
  res.json(await luckySpinService.forSession(sessionId));
});
