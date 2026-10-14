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
  socket.on('disconnect', goOffline);
  socket.on('connect_error', (err) => {
    // Server từ chối ở middleware (token sai / không thuộc phiên) → không tự kết nối lại
    if (!socket.active) onAuthError?.(err.message);
    else goOffline();
  });
  window.addEventListener('beforeunload', () => socket.close());
  return socket;
}
