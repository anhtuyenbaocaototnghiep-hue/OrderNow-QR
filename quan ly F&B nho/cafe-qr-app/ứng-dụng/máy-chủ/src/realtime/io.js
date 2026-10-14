// Socket.io hub gắn vào cùng HTTP server. Xác thực lúc handshake:
//  - auth.token (JWT nhân viên) → room `staff`
//  - auth.sessionId + cookie cf_client thuộc phiên → room `session:{id}`
//  - mọi kết nối → room `public` (menu.availability_changed)
import { Server } from 'socket.io';
import { userFromToken } from '../middleware/auth.js';
import { clientTokenFromCookieHeader } from '../middleware/client.js';
import * as sessionsRepo from '../repositories/sessionsRepo.js';
import { ROOMS, setIo } from './publisher.js';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function attachRealtime(httpServer) {
  const io = new Server(httpServer, { serveClient: true, pingInterval: 10000, pingTimeout: 8000 });

  io.use(async (socket, next) => {
    try {
      const { token, sessionId } = socket.handshake.auth || {};
      const rooms = [ROOMS.public];
      if (token) {
        const user = await userFromToken(token);
        socket.data.user = user;
        rooms.push(ROOMS.staff);
      }
      if (sessionId) {
        if (!GUID.test(sessionId)) return next(new Error('FORBIDDEN'));
        const clientToken = clientTokenFromCookieHeader(socket.handshake.headers.cookie);
        if (!(await sessionsRepo.isMember(sessionId, clientToken))) return next(new Error('FORBIDDEN'));
        rooms.push(ROOMS.session(sessionId));
      }
      socket.data.rooms = rooms;
      next();
    } catch (err) {
      next(new Error(err.code || 'UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(socket.data.rooms);
    socket.emit('ready', { rooms: socket.data.rooms.map((r) => (r.startsWith('session:') ? 'session' : r)) });
  });

  setIo(io);
  return io;
}
