// Khởi động một tiến trình: HTTP (API + FE tĩnh) + Socket.io. `npm start` / `npm run dev`.
import http from 'node:http';
import os from 'node:os';
import { createApp } from './app.js';
import { config } from './config.js';
import { closePool, getPool } from './db.js';
import { attachRealtime } from './realtime/io.js';
import { initAvailability } from './services/menuService.js';
import { startScheduler } from './jobs/scheduler.js';

void config.jwtSecret; // kiểm tra sớm biến bắt buộc

const app = createApp();
const server = http.createServer(app);
const io = attachRealtime(server);

try {
  await getPool();
  await initAvailability();
} catch (err) {
  console.error(`Không kết nối được SQL Server (${config.db.server}:${config.db.port}/${config.db.database}): ${err.message}`);
  console.error('Kiểm tra .env và tài-liệu/vận-hành/local-development.md');
  process.exit(1);
}

server.listen(config.port, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => `http://${n.address}:${config.port}`);
  console.log(`cafe-qr-app chạy tại http://localhost:${config.port}`);
  if (lan.length) console.log(`Trong mạng LAN: ${lan.join(', ')}  (đặt PUBLIC_BASE_URL theo địa chỉ này để điện thoại quét QR được)`);
  console.log(`QR bàn trỏ tới: ${config.publicBaseUrl}/t/<qrToken>`);
  if (startScheduler()) console.log('Job nền: đã bật (JOBS_ENABLED=false để tắt)');
});

async function shutdown(signal) {
  console.log(`${signal} — đang dừng…`);
  io.close();
  server.close();
  await closePool().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
