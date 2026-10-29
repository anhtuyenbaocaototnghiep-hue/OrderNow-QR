// Khởi động một tiến trình: HTTP (API + FE tĩnh) + Socket.io. `npm start` / `npm run dev`.
import http from 'node:http';
import os from 'node:os';
import { createApp } from './app.js';
import { config } from './config.js';
import { closePool, getPool } from './db.js';
import { attachRealtime } from './realtime/io.js';
import { initAvailability } from './services/menuService.js';
import { startScheduler } from './jobs/scheduler.js';
import { startAlertMailer } from './jobs/alertMailer.js';
import * as qrCheckService from './services/qrCheckService.js';

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
  // F-063 (ADR-021 D-82): QR trỏ localhost / QR đã in ở địa chỉ khác
  qrCheckService
    .check()
    .then((q) => {
      if (q.localhost) console.warn('CẢNH BÁO: QR bàn đang trỏ localhost — điện thoại không quét được. Đặt PUBLIC_BASE_URL = IP của máy trong mạng LAN.');
      if (q.unreachable)
        console.warn(
          `CẢNH BÁO: PUBLIC_BASE_URL = ${q.baseUrl} nhưng máy này không có IP đó (hiện: ${q.machineIps.join(', ') || 'không có mạng'}) — sửa .env rồi in lại QR.`,
        );
      if (q.mismatch)
        console.warn(`CẢNH BÁO: QR đang dán trên bàn được in cho ${q.printedBaseUrl} — khác địa chỉ hiện tại. In lại QR hoặc đặt IP cố định cho máy chủ.`);
    })
    .catch(() => {});
  if (startScheduler()) console.log('Job nền: đã bật (JOBS_ENABLED=false để tắt)');
  // F-060: gửi email cảnh báo + tổng kết ngày (cùng công tắc JOBS_ENABLED)
  if (startAlertMailer())
    console.log(
      `Email cảnh báo: ${config.mail.transport === 'json' ? 'chế độ thử (không gửi thật)' : config.mail.host ? `qua ${config.mail.host}` : 'chưa cấu hình SMTP trong .env'}`,
    );
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
