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
export const tooMany = (code, message, details) => new AppError(429, code, message, details);

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
  50056: [409, 'IN_COMBO', 'Món đang nằm trong combo — hãy bỏ khỏi combo trước'],
  // Mở rộng giai đoạn 2 (ADR-005)
  50060: [409, 'PROMO_EXHAUSTED', 'Khuyến mãi vừa hết lượt hôm nay'],
  50070: [409, 'NO_OPEN_SHIFT', 'Chưa mở ca — hãy mở ca trước khi thu tiền'],
  50071: [409, 'SHIFT_NOT_OPEN', 'Ca này đã được đóng'],
  50080: [404, 'MEMBER_NOT_FOUND', 'Không tìm thấy hội viên'],
  50090: [404, 'NOT_FOUND', 'Không tìm thấy lượt thu tiền'],
  50091: [400, 'REFUND_EXCEEDS', 'Số tiền hoàn vượt số tiền đã thu'],
  50092: [409, 'REFUND_WINDOW_EXPIRED', 'Chỉ hoàn tiền được trong ngày thu tiền'],
  50093: [400, 'INVALID_REFUND', 'Yêu cầu hoàn tiền không hợp lệ'],
  50100: [400, 'INVALID_RECEIPT', 'Phiếu nhập không hợp lệ'],
  50101: [409, 'STOCKTAKE_NOT_DRAFT', 'Phiếu kiểm kê đã chốt'],
  50102: [400, 'STOCKTAKE_INCOMPLETE', 'Còn nguyên liệu chưa nhập số đếm thực tế'],
  50103: [409, 'BELOW_RESERVED', 'Số đếm thấp hơn phần đang giữ cho đơn chưa hoàn tất'],
  50104: [409, 'STOCKTAKE_LOCKED', 'Nguyên liệu đang được kiểm kê — chốt hoặc xóa phiếu kiểm kê trước khi điều chỉnh tay'],
  // Giai đoạn 4–8 (ADR-006)
  50110: [409, 'SPLIT_PAID', 'Phần này đã được thu tiền'],
  50111: [409, 'COMMON_REQUIRED', 'Đây là phần cuối — phải thu kèm các món Chung chưa ai nhận'],
  50112: [409, 'SPLIT_EMPTY', 'Phần này chưa có món nào để thu'],
  50113: [409, 'SESSION_HAS_SPLITS', 'Bàn đã chia bill — hãy thu từng phần hoặc bấm "Thu chung" để gộp lại'],
  50072: [409, 'CASH_PENDING', 'Còn khoản chi quỹ chờ duyệt — duyệt hoặc từ chối trước khi đóng ca'],
  50120: [409, 'PREP_SHORT', 'Không đủ nguyên liệu để sơ chế'],
  50121: [400, 'WASTE_INVALID', 'Phiếu hủy không hợp lệ (số lượng / lô / lý do)'],
  50122: [409, 'LOT_SHORT', 'Số lượng theo lô không khớp tồn kho — liên hệ quản lý'],
  50123: [404, 'NO_RECIPE', 'Bán thành phẩm chưa có công thức sơ chế'],
  50130: [404, 'NOT_FOUND', 'Không tìm thấy đơn đặt hàng'],
  50131: [409, 'OVER_RECEIPT', 'Nhận vượt số lượng đã đặt'],
  50132: [409, 'PO_HAS_RECEIPTS', 'Đơn đặt hàng đã nhận một phần — không hủy được'],
  50133: [409, 'PO_NOT_RECEIVABLE', 'Đơn đặt hàng chưa gửi hoặc đã nhận đủ / đã hủy'],
  50140: [400, 'CASH_CATEGORY_INVALID', 'Danh mục / số tiền / lý do thu chi không hợp lệ'],
  50141: [409, 'CASH_NOT_PENDING', 'Khoản này đã được duyệt / từ chối'],
  50150: [409, 'LAST_ADMIN', 'Phải còn ít nhất một tài khoản Quản lý đang hoạt động'],
  50160: [409, 'AUDIT_READONLY', 'Nhật ký thao tác chỉ đọc'],
  50170: [409, 'VOUCHER_UNAVAILABLE', 'Voucher đã được dùng, hết hạn hoặc không thuộc hội viên này'],
  50171: [409, 'REWARD_UNAVAILABLE', 'Quà đổi điểm này không còn áp dụng'],
  50172: [409, 'POINTS_INSUFFICIENT', 'Hội viên không đủ điểm'],
  50173: [409, 'STAMP_REWARD_UNAVAILABLE', 'Hội viên chưa có lượt món miễn phí của chương trình tem này'],
  50174: [409, 'REFERRAL_LIMIT', 'Người giới thiệu đã đạt giới hạn số lượt giới thiệu trong tháng'],
  // FEATURE-046 sửa / xóa món, hủy bàn (ADR-007)
  50181: [409, 'ITEM_NOT_EDITABLE', 'Món đã thu tiền hoặc đơn / bàn đã đóng — dùng Hoàn tiền nếu cần'],
  50182: [400, 'INVALID_QTY', 'Số lượng mới không hợp lệ (chỉ giảm; muốn thêm dùng Gọi thêm món)'],
  50183: [403, 'ADMIN_APPROVAL_REQUIRED', 'Món đã được tiếp nhận / đã pha — cần trưởng ca hoặc quản lý duyệt'],
  50184: [409, 'SESSION_HAS_PAYMENTS', 'Bàn đã thu một phần (chia bill) — xóa từng món chưa thu thay vì hủy bàn'],
  50185: [404, 'ITEM_NOT_FOUND', 'Không tìm thấy món trong đơn'],
  50186: [400, 'VALIDATION_ERROR', 'Nhập lý do sửa / xóa món'],
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
