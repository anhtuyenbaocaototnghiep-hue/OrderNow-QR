// Cấu hình đọc từ biến môi trường (.env được nạp bằng `node --env-file-if-exists=.env`). Danh sách biến: .env.example
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const env = process.env;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function required(name) {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new Error(`Thiếu biến môi trường ${name} (xem .env.example)`);
  }
  return value;
}

const bool = (value, fallback) => (value === undefined || value === '' ? fallback : value === 'true');

export const config = {
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT || 3000),
  db: {
    server: env.DB_SERVER || '127.0.0.1',
    port: Number(env.DB_PORT || 1433),
    database: env.DB_NAME || 'CafeQrDev',
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: {
      encrypt: bool(env.DB_ENCRYPT, true),
      trustServerCertificate: bool(env.DB_TRUST_SERVER_CERT, false),
      enableArithAbort: true,
    },
    pool: { max: Number(env.DB_POOL_MAX || 20), min: 0, idleTimeoutMillis: 30000 },
  },
  get jwtSecret() {
    return required('JWT_SECRET');
  },
  jwtExpiresIn: env.JWT_EXPIRES_IN || '8h',
  publicBaseUrl: (env.PUBLIC_BASE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  shop: {
    name: env.SHOP_NAME || 'Quán cà phê',
    address: env.SHOP_ADDRESS || '',
  },
  rateLimitEnabled: env.RATE_LIMIT !== 'off',
  trustProxy: bool(env.TRUST_PROXY, false),
  // Ảnh hóa đơn sổ quỹ (F-033): <uploadsDir>/receipts/. Test dùng thư mục tạm, không đụng dữ liệu thật.
  // Kênh Zalo OA cho chiến dịch (F-037, D-29) — không có token → chỉ dùng Xuất danh sách (CSV)
  zaloOa: { token: env.ZALO_OA_TOKEN || '', url: env.ZALO_OA_URL || 'https://openapi.zalo.me/v3.0/oa/message/cs' },
  uploadsDir: env.UPLOADS_DIR || (env.NODE_ENV === 'test' ? path.join(os.tmpdir(), 'cafe-qr-test-uploads') : path.join(repoRoot, 'uploads')),
  repoRoot,
  // Trang Tra cứu API (F-052) ghép request / response / mã lỗi từ file này
  apiContractFile: path.join(repoRoot, 'tài-liệu', 'kiến-trúc', 'api-contract.md'),
};
