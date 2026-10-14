// Trạng thái phía khách: qrToken lấy từ URL /t/{qrToken}/…, sessionId lưu theo từng bàn.
export const qrToken = () => location.pathname.split('/')[2] || '';

const sessionKey = (qr) => `cf_session_${qr}`;
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

export function goEntry(qr, flash) {
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
