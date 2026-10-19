// Rate limit (local-development.md: POST /api/orders 10/phút/clientToken; POST /api/auth/login 5/phút/IP;
// tra cứu/đăng ký hội viên của khách 10/phút/IP + 20/phút/thiết bị — ADR-005 D-6).
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

/**
 * Tra cứu hội viên (D-6): khách bị giới hạn 10 lần/phút/IP và 20 lần/phút/clientToken; nhân viên đăng nhập (req.user) không bị giới hạn.
 * Tách hàm tạo để test bật riêng (RATE_LIMIT=off chỉ tắt bản dùng trong app).
 */
export function createMemberLimiters({ perIp = 10, perClient = 20 } = {}) {
  const common = {
    windowMs: 60_000,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => Boolean(req.user),
    message: message('Bạn tra cứu quá nhiều lần, vui lòng thử lại sau 1 phút'),
  };
  return [rateLimit({ ...common, limit: perIp }), rateLimit({ ...common, limit: perClient, keyGenerator: (req) => req.clientToken })];
}

export const memberLimiters = config.rateLimitEnabled ? createMemberLimiters() : [passThrough];
