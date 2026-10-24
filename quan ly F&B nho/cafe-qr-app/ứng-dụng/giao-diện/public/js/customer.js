// Trạng thái phía khách: qrToken lấy từ URL /t/{qrToken}/…, sessionId lưu theo từng bàn.
export const qrToken = () => location.pathname.split('/')[2] || '';

const sessionKey = (qr) => `cf_session_${qr}`;
let leaving = false; // đang chuyển trang (theo nhóm sang bàn mới / quét lại) — các điều hướng khác không chen vào
export const isLeaving = () => leaving;
const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const getSessionId = (qr) => safe(() => localStorage.getItem(sessionKey(qr)));
export const setSessionId = (qr, id) => safe(() => localStorage.setItem(sessionKey(qr), id));
export const clearSessionId = (qr) => safe(() => localStorage.removeItem(sessionKey(qr)));

/** Thông báo một lần, hiển thị ở trang kế tiếp. */
export const setFlash = (message, type = 'info') => safe(() => sessionStorage.setItem('cf_flash', JSON.stringify({ message, type })));
export function takeFlash() {
  const f = safe(() => JSON.parse(sessionStorage.getItem('cf_flash')));
  safe(() => sessionStorage.removeItem('cf_flash'));
  return f;
}

/**
 * F-049: nhóm được chuyển sang bàn khác → chuyển phiên sang khóa của bàn mới rồi mở lại CÙNG trang ở /t/{qr mới}/….
 * toTable = { name, qrToken } (sự kiện session.table_changed, hoặc bàn hiện tại của phiên khi tải lại). → true nếu đang chuyển trang.
 */
export function followTable(qr, sessionId, toTable) {
  if (!sessionId || !toTable?.qrToken || toTable.qrToken === qr) return false;
  leaving = true;
  setSessionId(toTable.qrToken, sessionId);
  clearSessionId(qr);
  setFlash(`Nhóm của bạn đã chuyển sang ${toTable.name}`, 'info');
  const path = toTable.path ? `/t/${toTable.qrToken}${toTable.path}` : location.pathname.replace(`/t/${qr}`, `/t/${toTable.qrToken}`) + location.search;
  location.replace(path);
  return true;
}

/**
 * F-057: nhóm này đã được thu chung vào nhóm khác (cùng bàn hoặc bàn khác) — điện thoại đã là thành viên nhóm đó →
 * lưu phiên đó cho URL bàn hiện tại rồi mở trang theo dõi (bill chung, đánh giá món). Không cần mã QR bàn kia. → true nếu đang chuyển trang.
 */
export function followMerged(qr, mergedInto) {
  if (!mergedInto?.sessionId || getSessionId(qr) === mergedInto.sessionId) return false;
  leaving = true;
  setSessionId(qr, mergedInto.sessionId);
  setFlash(`Nhóm của bạn đã được thanh toán chung với ${mergedInto.table?.name ?? 'bàn khác'}`, 'info');
  location.replace(`/t/${qr}/track`);
  return true;
}

export function goEntry(qr, flash) {
  leaving = true;
  clearSessionId(qr);
  if (flash) setFlash(flash, 'warning');
  location.replace(`/t/${qr}`);
}

/** Nhãn trạng thái đơn phía khách (FEATURE-004). */
export const CUSTOMER_STATUS = {
  PENDING: 'Chờ xác nhận',
  PREPARING: 'Đang chuẩn bị',
  COMPLETED: 'Đã xong, vui lòng nhận tại quầy',
  CANCELLED: 'Đã hủy',
};
