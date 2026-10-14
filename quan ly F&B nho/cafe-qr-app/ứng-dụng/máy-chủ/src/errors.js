// Lỗi nghiệp vụ có mã → HTTP. Service ném AppError; error handler trả { code, message, details }.
import { sqlErrorNumber } from './db.js';

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Vui lòng đăng nhập') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này', code = 'FORBIDDEN') => new AppError(403, code, message);
export const notFound = (message = 'Không tìm thấy dữ liệu', code = 'NOT_FOUND') => new AppError(404, code, message);
export const conflict = (code, message, details) => new AppError(409, code, message, details);

// Bảng mã lỗi SP → HTTP (tài-liệu/kiến-trúc/data-model.md — "Bảng mã lỗi SP")
const SQL_ERRORS = {
  50001: [409, 'ALREADY_PROCESSED', 'Đơn hàng này đã được nhân viên khác xử lý'],
  50002: [409, 'OUT_OF_STOCK', 'Không đủ nguyên liệu'],
  50003: [409, 'INVALID_STATE', 'Trạng thái đơn hàng không cho phép thao tác này'],
  50004: [404, 'NOT_FOUND', 'Không tìm thấy đơn hàng'],
  50005: [404, 'NOT_FOUND', 'Không tìm thấy phiên'],
  50010: [409, 'ITEM_UNAVAILABLE', 'Có món không còn bán'],
  50011: [400, 'VALIDATION_ERROR', 'Giỏ hàng trống'],
  50012: [400, 'VALIDATION_ERROR', 'Đơn hàng không hợp lệ'],
  50020: [400, 'INSUFFICIENT_AMOUNT', 'Tiền khách đưa chưa đủ'],
  50030: [409, 'NO_ORDERS', 'Phiên chưa có đơn hàng nào'],
  50031: [409, 'SESSION_CLOSED', 'Phiên đã đóng (đã thanh toán)'],
  50032: [409, 'ALREADY_SETTLED', 'Phiên này đã được thu tiền'],
  50033: [409, 'HAS_PENDING_ORDERS', 'Còn đơn chưa tiếp nhận — hãy Tiếp nhận hoặc Hủy trước khi thu tiền'],
  50034: [409, 'AMOUNT_CHANGED', 'Tổng tiền của phiên vừa thay đổi, vui lòng kiểm tra lại'],
  50035: [409, 'HAS_ORDERS', 'Phiên còn đơn hàng, không thể đóng bàn trống'],
  50040: [400, 'INVALID_ADJUSTMENT', 'Điều chỉnh kho không hợp lệ'],
  50041: [404, 'NOT_FOUND', 'Không tìm thấy nguyên liệu'],
  50042: [400, 'NEGATIVE_STOCK', 'Tồn kho không được âm'],
  50043: [409, 'BELOW_RESERVED', 'Không thể đặt tồn kho thấp hơn phần đang giữ cho đơn chưa hoàn tất'],
  // Xóa trong trang Quản lý (ADR-004)
  50050: [404, 'NOT_FOUND', 'Không tìm thấy dữ liệu (có thể đã bị xóa)'],
  50051: [409, 'IN_USE', 'Nguyên liệu đang dùng trong định lượng của món — hãy bỏ khỏi định lượng trước'],
  50052: [409, 'HAS_RESERVED', 'Nguyên liệu đang được giữ cho đơn chưa hoàn tất — hãy hoàn tất hoặc hủy các đơn đó trước'],
  50053: [409, 'TABLE_BUSY', 'Bàn đang có khách (phiên chưa thanh toán) — hãy thu tiền hoặc đóng bàn trước khi xóa'],
  50054: [409, 'HAS_ITEMS', 'Danh mục còn món — hãy xóa hoặc chuyển các món sang danh mục khác trước'],
  50055: [400, 'CANNOT_DELETE_SELF', 'Không thể tự xóa tài khoản của chính mình'],
};

/** Chuyển lỗi THROW 5000x của SP thành AppError; trả null nếu không phải lỗi nghiệp vụ. */
export function fromSqlError(err) {
  const number = sqlErrorNumber(err);
  const entry = SQL_ERRORS[number];
  if (!entry) return null;
  const [status, code, message] = entry;
  const appErr = new AppError(status, code, message);
  appErr.sqlNumber = number;
  appErr.sqlMessage = err.message;
  return appErr;
}

/** Danh sách id dạng "3,7,12" trong message của THROW → mảng số. */
export const idsFromMessage = (msg) =>
  String(msg || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
