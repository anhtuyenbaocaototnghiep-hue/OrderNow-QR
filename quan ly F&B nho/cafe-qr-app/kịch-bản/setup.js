// Cài đặt lần đầu: .env → (tạo DB + login SQL nếu cần) → migrate → seed → (tùy chọn) Chromium cho test giao diện.
// Chạy: npm run setup   (hoặc bấm đúp hướng-dẫn/1-cài-đặt-lần-đầu.cmd). Chạy lại nhiều lần không sao.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, process.env.SETUP_ENV_FILE || '.env'); // SETUP_ENV_FILE chỉ dùng khi thử script
const setupSql = path.join(root, 'cơ-sở-dữ-liệu', 'cài-đặt', 'local-sql-setup.sql');
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;

const ask = async (question, fallback = '') => {
  if (!rl) return fallback;
  const answer = (await rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim();
  return answer || fallback;
};
const yes = async (question, fallback = true) => /^[cy]/i.test(await ask(`${question} (c = có / k = không)`, fallback ? 'c' : 'k'));
const step = (n, title) => console.log(`\n=== [${n}/5] ${title} ===`);
const runNode = (args) => spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env: process.env }).status === 0;

function fail(message) {
  console.error(`\n*** ${message} ***`);
  rl?.close();
  process.exit(1);
}

function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function setEnvValue(text, key, value) {
  const rx = new RegExp(`^${key}=.*$`, 'm');
  return rx.test(text) ? text.replace(rx, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
}

const strongPassword = () => `Cf${crypto.randomBytes(12).toString('base64url').replace(/[-_]/g, 'x')}9!`;

function findSqlcmd() {
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['sqlcmd'], { encoding: 'utf8' });
  if (which.status === 0) return which.stdout.split(/\r?\n/)[0].trim();
  for (const v of ['180', '170', '130']) {
    const p = `C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\${v}\\Tools\\Binn\\SQLCMD.EXE`;
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function chromiumInstalled() {
  const base =
    process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
      : path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  return fs.existsSync(base) && fs.readdirSync(base).some((d) => d.startsWith('chromium'));
}

// ---------- 1. Node.js ----------
step(1, 'Kiểm tra Node.js');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 9)) fail(`Cần Node.js 22.9 trở lên (máy đang có ${process.versions.node}). Tải bản LTS tại https://nodejs.org`);
if (!fs.existsSync(path.join(root, 'node_modules', 'mssql')))
  fail('Chưa cài thư viện — chạy "npm install" trước (file 1-cài-đặt-lần-đầu.cmd làm việc này tự động)');
console.log(`Node.js ${process.versions.node} — OK`);

// ---------- 2. .env ----------
step(2, 'File cấu hình .env');
if (!fs.existsSync(envPath)) {
  let text = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  console.log('Chưa có .env — tạo mới từ .env.example.');
  let dbPassword = await ask('Mật khẩu cho tài khoản SQL "cafe_app" (Enter = tự tạo mật khẩu mạnh)');
  while (dbPassword && /['"\s]/.test(dbPassword)) dbPassword = await ask('Mật khẩu không được chứa dấu nháy hoặc khoảng trắng, nhập lại (Enter = tự tạo)');
  const adminPassword = await ask('Mật khẩu ban đầu cho tài khoản quản lý "admin"', 'Admin@123');
  text = setEnvValue(text, 'DB_PASSWORD', dbPassword || strongPassword());
  text = setEnvValue(text, 'JWT_SECRET', crypto.randomBytes(32).toString('hex'));
  text = setEnvValue(text, 'ADMIN_SEED_PASSWORD', adminPassword);
  fs.writeFileSync(envPath, text);
  console.log(`Đã tạo ${path.basename(envPath)} (mật khẩu SQL và khóa JWT được lưu trong file này — không gửi file này cho ai).`);
} else {
  console.log('Đã có .env — giữ nguyên.');
}
const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
for (const key of ['DB_PASSWORD', 'JWT_SECRET', 'ADMIN_SEED_PASSWORD']) {
  if (!env[key]) fail(`Biến ${key} trong .env đang trống — mở .env điền vào rồi chạy lại`);
}
Object.assign(process.env, env);

// ---------- 3. SQL Server ----------
step(3, 'Kết nối SQL Server');
const sql = (await import('mssql')).default;
const { config } = await import('../ứng-dụng/máy-chủ/src/config.js');
const testDb = env.TEST_DB_NAME || 'CafeQrTest';

async function tryConnect(database) {
  try {
    const pool = await new sql.ConnectionPool({ ...config.db, database }).connect();
    await pool.close();
    return null;
  } catch (err) {
    return err;
  }
}

let err = await tryConnect(config.db.database);
if (err) {
  console.log(`Chưa vào được database "${config.db.database}": ${err.message}`);
  const isNetwork = err.code === 'ESOCKET' || /ECONNREFUSED|ETIMEOUT|getaddrinfo|Could not connect/i.test(err.message);
  if (isNetwork) {
    fail(
      `Không kết nối được SQL Server tại ${config.db.server}:${config.db.port}. Hãy bật TCP/IP cho SQL Server (SQL Server Configuration Manager → ` +
        'Protocols → TCP/IP → Enabled, rồi khởi động lại dịch vụ SQL Server) hoặc chạy "docker compose up -d mssql". Xem hướng-dẫn/README.md mục "Xử lý lỗi"',
    );
  }
  const sqlcmd = findSqlcmd();
  if (!sqlcmd) fail('Không tìm thấy sqlcmd để tạo database. Cài "sqlcmd" hoặc tạo database theo hướng-dẫn/README.md rồi chạy lại');
  if (!(await yes(`Tạo database "${config.db.database}", "${testDb}" và tài khoản SQL "${config.db.user}" bằng quyền Windows của bạn?`))) {
    fail('Đã bỏ qua bước tạo database');
  }
  const server = ['127.0.0.1', 'localhost'].includes(config.db.server) ? '.' : config.db.server;
  for (const db of [config.db.database, testDb]) {
    const r = spawnSync(
      sqlcmd,
      ['-S', server, '-E', '-C', '-b', '-i', setupSql, '-v', `DB_NAME=${db}`, `APP_LOGIN=${config.db.user}`, `APP_PASSWORD=${config.db.password}`],
      {
        stdio: 'inherit',
      },
    );
    if (r.status !== 0) fail(`sqlcmd lỗi khi tạo "${db}" — cần chạy bằng tài khoản Windows có quyền sysadmin trên SQL Server`);
  }
  err = await tryConnect(config.db.database);
  if (err) {
    fail(
      `Vẫn chưa đăng nhập được: ${err.message.replace(/\.$/, '')}. Nếu tài khoản "${config.db.user}" đã tồn tại với mật khẩu khác, hãy sửa DB_PASSWORD trong .env cho đúng ` +
        `(hoặc trong SSMS chạy: ALTER LOGIN [${config.db.user}] WITH PASSWORD = '<mật khẩu trong .env>')`,
    );
  }
}
console.log(`Kết nối SQL Server OK (${config.db.server}:${config.db.port}/${config.db.database})`);

// ---------- 4. Migrate + seed ----------
step(4, 'Tạo bảng, thủ tục và dữ liệu mẫu');
if (!runNode([path.join(root, 'kịch-bản', 'db-migrate.js')])) fail('Migrate lỗi — xem thông báo phía trên');
if (!runNode([path.join(root, 'kịch-bản', 'db-seed.js')])) fail('Seed lỗi — xem thông báo phía trên');

// ---------- 5. Chromium cho test giao diện ----------
step(5, 'Trình duyệt cho test giao diện (tùy chọn)');
if (chromiumInstalled()) {
  console.log('Đã có Chromium cho Playwright — bỏ qua.');
} else if (await yes('Cài Chromium (~150 MB) để chạy "test giao diện"? Có thể cài sau', false)) {
  runNode([path.join(root, 'node_modules', '@playwright', 'test', 'cli.js'), 'install', 'chromium']);
} else {
  console.log('Bỏ qua. Khi cần: node node_modules/@playwright/test/cli.js install chromium');
}

rl?.close();
console.log(`
Cài đặt xong!
  • Mở app:     bấm đúp hướng-dẫn/2-mở-app.cmd   (hoặc: npm start)
  • Địa chỉ:    ${config.publicBaseUrl}
  • Quầy:       staff1 / Staff@123
  • Quản lý:    admin / mật khẩu ADMIN_SEED_PASSWORD trong .env
`);
