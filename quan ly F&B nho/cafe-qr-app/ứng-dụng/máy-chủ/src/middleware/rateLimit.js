// Rate limit (local-development.md: POST /api/orders 10/phút/clientToken; POST /api/auth/login 5/phút/IP).
// Tắt bằng RATE_LIMIT=off (test).
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

const passThrough = (_req, _res, next) => next();
const message = (text) => ({ code: 'RATE_LIMITED', message: text });

export const loginLimiter = config.rateLimitEnabled
  ? rateLimit({
      windowMs: 60_000,
      limit: 5,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: message('Bạn đăng nhập sai quá nhiều lần, vui lòng thử lại sau 1 phút'),
      skipSuccessfulRequests: true,
    })
  : passThrough;

export const orderLimiter = config.rateLimitEnabled
  ? rateLimit({
      windowMs: 60_000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: (req) => req.clientToken,
      message: message('Bạn gửi đơn quá nhanh, vui lòng thử lại sau ít phút'),
    })
  : passThrough;
