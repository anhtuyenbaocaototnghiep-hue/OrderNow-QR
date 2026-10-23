// Sao lưu CSDL chạy thật + ảnh hóa đơn sổ quỹ (bước 15, ADR-016 D-62). Chỉ ĐỌC dữ liệu.
//   npm run db:backup                         → bản hằng ngày (Task Scheduler chạy sau giờ đóng cửa — backup-restore.md)
//   npm run db:backup -- --label truoc-v1.1   → bản trước phát hành / migration (giữ 12 tháng)
//   npm run db:backup -- --dir D:\thu-muc      → thư mục khác BACKUP_DIR (thử script)
// - SQL Server tự ghi file .bak bằng tài khoản dịch vụ của nó → BACKUP_DIR phải cấp quyền ghi cho tài khoản đó (lệnh icacls in ra khi thiếu).
// - Sau đó: chép thư mục ảnh (UPLOADS_DIR) vào BACKUP_DIR/uploads, chép bản .bak + ảnh sang BACKUP_COPY_DIR (nếu có), dọn bản cũ,
//   ghi BACKUP_DIR/last-backup.json (ops-health.js đọc) và một dòng vào BACKUP_DIR/backup.log.
// - Không sao lưu .env (chứa mật khẩu) — giữ theo tài-liệu/vận-hành/secrets-register.md.
// - Mã thoát: 0 = xong, 1 = lỗi. Không gọi process.exit(): trên Windows, thoát khi kết nối còn đang đóng làm Node crash
//   (mã âm) và file .cmd / Task Scheduler hiểu nhầm là "xong".
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import { config } from '../ứng-dụng/máy-chủ/src/config.js';
import { backupFileName, cleanLabel, positiveInt, selectExpired } from './lib/vận-hành.js';

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const env = process.env;
const dir = argValue('--dir') || env.BACKUP_DIR;
const copyDir = argValue('--copy-dir') || env.BACKUP_COPY_DIR || '';
const label = argValue('--label') || '';
const db = config.db.database;
let keep; // đọc trong main(): giá trị sai → dừng trước khi sao lưu / dọn

class Stop extends Error {}
const fail = (message) => {
  throw new Stop(message);
};

/** Chép thư mục ảnh (chỉ thêm / ghi đè, không xóa file ở đích) → số file đã có ở đích. */
async function mirror(from, to) {
  if (!existsSync(from)) return 0;
  await fs.cp(from, to, { recursive: true, force: true });
  return (await fs.readdir(to, { recursive: true, withFileTypes: true })).filter((e) => e.isFile()).length;
}

async function prune(folder, now) {
  const expired = selectExpired(await fs.readdir(folder), { db, now, ...keep });
  for (const name of expired) await fs.rm(path.join(folder, name), { force: true });
  return expired;
}

async function log(line) {
  if (dir) await fs.appendFile(path.join(dir, 'backup.log'), `${new Date().toISOString()} ${line}\n`).catch(() => {});
}

/** BACKUP DATABASE … WITH CHECKSUM; luôn đóng kết nối trước khi báo lỗi. */
async function backupTo(file) {
  // Sao lưu lớn có thể quá 15 giây mặc định của mssql
  const pool = new sql.ConnectionPool({ ...config.db, requestTimeout: 60 * 60 * 1000 });
  let error = null;
  try {
    await pool.connect();
    await pool
      .request()
      .input('db', sql.NVarChar(128), db)
      .input('file', sql.NVarChar(400), file)
      .input('name', sql.NVarChar(128), `${db} ${label || 'hằng ngày'}`)
      .query('BACKUP DATABASE @db TO DISK = @file WITH INIT, CHECKSUM, NAME = @name');
  } catch (err) {
    error = err;
  } finally {
    await pool.close().catch(() => {});
  }
  if (!error) return;
  // Nguyên nhân thật (vd. "Operating system error 5 (Access is denied.)") nằm ở lỗi đứng trước "BACKUP DATABASE is terminating abnormally"
  const message = [...(error.precedingErrors ?? []).map((e) => e.message), error.message].join(' ');
  await log(`FAIL ${db} ${message}`);
  if (/operating system error 5|access is denied/i.test(message)) {
    fail(
      `SQL Server không có quyền ghi vào ${dir}.\n` +
        `Chạy MỘT LẦN trong PowerShell "Run as administrator" (giữ nguyên dấu nháy đơn):\n` +
        `  icacls '${dir}' /grant 'NT Service\\MSSQLSERVER:(OI)(CI)M'\n` +
        `rồi chạy lại. (Cài SQL Server dạng instance có tên, ví dụ SQLEXPRESS: thay MSSQLSERVER bằng MSSQL$SQLEXPRESS.)`,
    );
  }
  fail(message);
}

async function main() {
  if (!dir) fail('chưa đặt BACKUP_DIR trong .env (thư mục lưu bản sao lưu — xem tài-liệu/vận-hành/backup-restore.md)');
  if (!path.isAbsolute(dir)) fail(`BACKUP_DIR phải là đường dẫn đầy đủ (ví dụ D:\\cafe-qr-backup), đang là "${dir}"`);
  if (copyDir && !path.isAbsolute(copyDir)) fail(`BACKUP_COPY_DIR phải là đường dẫn đầy đủ, đang là "${copyDir}"`);
  if (label && !cleanLabel(label)) fail(`nhãn "${label}" không có chữ / số nào — ví dụ đúng: --label truoc-v1.1`);
  try {
    keep = {
      keepDays: positiveInt(env.BACKUP_KEEP_DAYS, 14, 'BACKUP_KEEP_DAYS'),
      keepMonths: positiveInt(env.BACKUP_KEEP_MONTHS, 12, 'BACKUP_KEEP_MONTHS'),
      minKeep: 3,
    };
  } catch (err) {
    fail(`${err.message} — sửa trong .env (để trống = mặc định)`);
  }

  const startedAt = new Date();
  const file = path.join(dir, backupFileName(db, startedAt, label));
  await fs.mkdir(dir, { recursive: true });
  console.log(`Sao lưu CSDL ${db} → ${file}`);
  await backupTo(file);

  let bytes;
  try {
    ({ size: bytes } = await fs.stat(file));
  } catch (err) {
    await log(`FAIL ${db} không đọc được file vừa sao lưu: ${err.message}`);
    fail(`SQL Server đã ghi ${file} nhưng tài khoản Windows đang chạy script không đọc được (${err.code}). Cấp quyền đọc thư mục cho tài khoản này.`);
  }

  const uploads = await mirror(config.uploadsDir, path.join(dir, 'uploads'));
  let copied = false;
  let removedCopy = [];
  if (copyDir) {
    try {
      await fs.mkdir(copyDir, { recursive: true });
      await fs.copyFile(file, path.join(copyDir, path.basename(file)));
      await mirror(config.uploadsDir, path.join(copyDir, 'uploads'));
      removedCopy = await prune(copyDir, startedAt);
      copied = true;
    } catch (err) {
      console.error(`! Không chép được sang BACKUP_COPY_DIR (${copyDir}): ${err.message} — bản trong BACKUP_DIR vẫn dùng được`);
    }
  }
  const removed = await prune(dir, startedAt);

  const finishedAt = new Date();
  const result = {
    db,
    file: path.basename(file),
    bytes,
    label: label || null,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    seconds: Math.round((finishedAt - startedAt) / 100) / 10,
    uploads,
    copyDir: copyDir || null,
    copied,
    removed,
    removedCopy,
  };
  await fs.writeFile(path.join(dir, 'last-backup.json'), `${JSON.stringify(result, null, 2)}\n`);
  await log(`OK ${db} ${result.file} ${bytes} bytes ${result.seconds}s uploads=${uploads} copied=${copied} removed=${removed.length}`);

  console.log(`Xong: ${(bytes / 1024 / 1024).toFixed(1)} MB trong ${result.seconds} giây · ảnh hóa đơn: ${uploads} file`);
  if (copyDir) console.log(copied ? `Đã chép sang ${copyDir}` : `CHƯA chép được sang ${copyDir} (xem lỗi phía trên)`);
  if (removed.length) console.log(`Đã dọn ${removed.length} bản cũ: ${removed.join(', ')}`);
  return copyDir && !copied ? 1 : 0;
}

process.exitCode = await main().catch(async (err) => {
  console.error(`\n*** Sao lưu KHÔNG thành công: ${err.message} ***`);
  if (!(err instanceof Stop)) {
    console.error(err.stack);
    await log(`FAIL ${db} ${err.message}`); // lỗi bất ngờ (chép ảnh, dọn bản cũ…) cũng có trong backup.log
  }
  return 1;
});
