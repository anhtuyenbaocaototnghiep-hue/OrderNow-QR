// Phát sự kiện realtime (tài-liệu/kiến-trúc/realtime-events.md). Service chỉ gọi SAU KHI transaction đã commit.
// Realtime không phải nguồn sự thật: client luôn tải lại ảnh chụp khi kết nối lại.
let io = null;

export function setIo(server) {
  io = server;
}

export const ROOMS = {
  staff: 'staff',
  public: 'public',
  session: (sessionId) => `session:${String(sessionId).toLowerCase()}`,
};

export function publish(rooms, event, payload) {
  if (!io) return;
  io.to(rooms).emit(event, { ...payload, emittedAt: new Date().toISOString() });
}

/** Sự kiện của một đơn tới quầy + phiên khách (nếu dine-in). */
export function publishOrderEvent(event, order, payload) {
  const rooms = [ROOMS.staff];
  if (order.sessionId) rooms.push(ROOMS.session(order.sessionId));
  publish(rooms, event, payload);
}
