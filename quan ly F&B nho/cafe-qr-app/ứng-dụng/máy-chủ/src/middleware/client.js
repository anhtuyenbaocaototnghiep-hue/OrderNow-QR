// Định danh trình duyệt khách bằng cookie HttpOnly `cf_client` (REQ-002: khách không có tài khoản).
import crypto from 'node:crypto';

export const CLIENT_COOKIE = 'cf_client';
const VALID = /^[0-9a-f]{32}$/;

export const isValidClientToken = (t) => typeof t === 'string' && VALID.test(t);

export function ensureClientToken(req, res, next) {
  let token = req.cookies?.[CLIENT_COOKIE];
  if (!isValidClientToken(token)) {
    token = crypto.randomBytes(16).toString('hex');
    res.cookie(CLIENT_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      maxAge: 365 * 24 * 3600 * 1000,
      path: '/',
    });
  }
  req.clientToken = token;
  next();
}

/** Đọc cookie từ header thô (dùng cho handshake Socket.io). */
export function clientTokenFromCookieHeader(header) {
  for (const part of String(header || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === CLIENT_COOKIE) {
      const value = decodeURIComponent(v.join('='));
      return isValidClientToken(value) ? value : null;
    }
  }
  return null;
}
