// Kết nối realtime Socket.io (client nạp từ /socket.io/socket.io.js do server phát).
// Realtime chỉ là "gợi ý cập nhật": mỗi lần kết nối lại, trang PHẢI tải lại ảnh chụp (REQ-017).

/**
 * connectRealtime({ token, sessionId, onOnline(reconnected), onOffline(), onAuthError(code) })
 * - onOnline(false) lần đầu, onOnline(true) mỗi lần kết nối lại sau khi mất.
 */
export function connectRealtime({ token, sessionId, onOnline, onOffline, onAuthError } = {}) {
  if (!window.io) {
    onOffline?.();
    return null;
  }
  const socket = window.io({ auth: { token, sessionId }, transports: ['websocket', 'polling'] });
  let connectedOnce = false;
  let offline = false;

  socket.on('ready', () => {
    const reconnected = connectedOnce;
    connectedOnce = true;
    offline = false;
    onOnline?.(reconnected);
  });
  const goOffline = () => {
    if (!offline) {
      offline = true;
      onOffline?.();
    }
  };
  socket.on('disconnect', (reason) => {
    // 'io client disconnect' = chính trang gọi socket.close() khi rời trang → không báo "Mất kết nối" (DEF-011)
    if (reason !== 'io client disconnect') goOffline();
  });
  socket.on('connect_error', (err) => {
    // Server từ chối ở middleware (token sai / không thuộc phiên) → không tự kết nối lại
    if (!socket.active) onAuthError?.(err.message);
    else goOffline();
  });
  // Rời trang (chuyển mục / tải lại): tự đóng kết nối. Dùng pagehide — chỉ phát khi trang thật sự rời đi
  // (beforeunload phát ngay lúc bấm, trang cũ còn hiện trong lúc chờ trang mới, và có thể bị hủy ngang).
  let closedOnHide = false;
  window.addEventListener('pagehide', () => {
    closedOnHide = true;
    socket.close();
  });
  // Bấm Back mà trình duyệt khôi phục trang từ bộ nhớ đệm (bfcache): kết nối đã bị đóng → mở lại,
  // 'ready' → onOnline(true) → trang tải lại ảnh chụp (REQ-017). Không mở lại thì trang báo "Đã kết nối" mà không nhận đơn.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted || !closedOnHide) return;
    closedOnHide = false;
    socket.connect();
  });
  return socket;
}
