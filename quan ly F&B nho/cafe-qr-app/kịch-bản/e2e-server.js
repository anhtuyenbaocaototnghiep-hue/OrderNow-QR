// Server cho E2E (Playwright): reset DB test + seed, rồi chạy app ở cổng E2E_PORT (mặc định 3100).
// Không bao giờ chạm DB dev: tên DB phải kết thúc bằng "Test".
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbName = process.env.TEST_DB_NAME || 'CafeQrTest';
if (!/test$/i.test(dbName)) throw new Error('TEST_DB_NAME phải kết thúc bằng "Test"');
const port = process.env.E2E_PORT || '3100';

Object.assign(process.env, {
  DB_NAME: dbName,
  PORT: port,
  RATE_LIMIT: 'off',
  JOBS_ENABLED: 'false',
  MAIL_TRANSPORT: 'json', // F-060: dựng email cảnh báo nhưng không gửi ra ngoài (kể cả khi .env có SMTP thật)
  PUBLIC_BASE_URL: `http://localhost:${port}`,
  ADMIN_SEED_USERNAME: 'admin',
  ADMIN_SEED_PASSWORD: 'Admin@123',
});
process.env.JWT_SECRET ||= 'e2e-secret-only-for-local-tests';

execFileSync(process.execPath, [path.join(root, 'kịch-bản/db-migrate.js'), '--db', dbName, '--reset', '--quiet'], { stdio: 'inherit', env: process.env });
const { config } = await import('../ứng-dụng/máy-chủ/src/config.js');
const { seedBase, seedDemo } = await import('./seed-data.js');
const pool = await new sql.ConnectionPool(config.db).connect();
const seeded = await seedBase(pool, { adminUsername: 'admin', adminPassword: 'Admin@123' });
await seedDemo(pool, seeded.adminId);
await pool.close();

await import('../ứng-dụng/máy-chủ/src/server.js');
