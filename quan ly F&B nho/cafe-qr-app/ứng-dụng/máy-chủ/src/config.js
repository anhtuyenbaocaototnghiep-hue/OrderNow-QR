// Cấu hình đọc từ biến môi trường (.env được nạp bằng `node --env-file-if-exists=.env`). Danh sách biến: .env.example
const env = process.env;

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
};
