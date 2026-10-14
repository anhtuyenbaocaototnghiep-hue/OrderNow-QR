import { AppError, fromSqlError } from '../errors.js';
import { config } from '../config.js';

export function notFoundApi(_req, res) {
  res.status(404).json({ code: 'NOT_FOUND', message: 'Không tìm thấy endpoint' });
}

// Express nhận diện error handler qua đủ 4 tham số
export function errorHandler(err, req, res, _next) {
  const appErr = err instanceof AppError ? err : fromSqlError(err);
  if (appErr) {
    return res.status(appErr.status).json({ code: appErr.code, message: appErr.message, details: appErr.details });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'JSON không hợp lệ' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'Dữ liệu gửi lên quá lớn' });
  }
  if (config.env !== 'test') console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống, vui lòng thử lại' });
}
