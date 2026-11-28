// F-103 (ADR-074 D-272…D-275): sao lưu CSDL + ảnh — lõi DÙNG CHUNG cho máy chủ app (tự sao lưu sau đóng ca / khi bản gần nhất
// quá 20 giờ, nút "Sao lưu ngay") và `npm run db:backup` (kịch-bản/db-backup.js). Chỉ ĐỌC dữ liệu.
//  - SQL Server tự ghi file .bak bằng tài khoản dịch vụ của nó → BACKUP_DIR phải cho dịch vụ đó quyền ghi. Thư mục chưa có → tạo rồi
//    cấp quyền bằng icacls (người tạo thư mục là chủ nên không cần quyền quản trị — thử thật 28/11/2026). Cấp không được → lỗi ghi lệnh.
//  - Chép ảnh (UPLOADS_DIR) vào BACKUP_DIR\uploads, chép bản .bak + ảnh sang BACKUP_COPY_DIR (nếu có), dọn bản cũ theo luật giữ
//    (kịch-bản/lib/vận-hành.js), ghi last-backup.json (ops-health.js, trang Cài đặt đọc) và một dòng backup.log.
//  - Không sao lưu .env (mật khẩu) — giữ theo tài-liệu/vận-hành/secrets-register.md.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { query, sql } from '../db.js';
import { lastRunOf } from '../jobs/scheduler.js';
import { backupFileName, cleanLabel, positiveInt, selectExpired } from '../../../../kịch-bản/lib/vận-hành.js';

const exec = promisify(execFile);
export const DEFAULT_WINDOWS_DIR = 'C:\\CafeQr-SaoLuu';
export const JOB_NAME = 'db-backup';
const DUE_HOURS = 20; // D-273: bản thành công gần nhất cũ hơn chừng này → sao lưu
const AFTER_CLOSE_MINUTES = 30; // D-273: đóng ca mà bản gần nhất mới hơn chừng này → không sao lưu thêm

/** Lỗi sao lưu có lời giải thích cho chủ quán (route trả 500 BACKUP_FAILED, script in ra). */
export class BackupError extends Error {}

/** Cấu hình đọc lại mỗi lần (test đổi được env). `dir` rỗng = chưa cấu hình (máy không phải Windows, không đặt BACKUP_DIR). */
export function backupConfig(env = process.env) {
  return {
    db: config.db.database,
    dir: env.BACKUP_DIR || (process.platform === 'win32' ? DEFAULT_WINDOWS_DIR : ''),
    copyDir: env.BACKUP_COPY_DIR || '',
    keepDays: positiveInt(env.BACKUP_KEEP_DAYS, 14, 'BACKUP_KEEP_DAYS'),
    keepMonths: positiveInt(env.BACKUP_KEEP_MONTHS, 12, 'BACKUP_KEEP_MONTHS'),
  };
}

/** Tài khoản dịch vụ SQL Server (tài khoản ảo mặc định): instance mặc định → NT Service\MSSQLSERVER, có tên → NT Service\MSSQL$<tên>. */
async function sqlServiceAccount() {
  const name = (await query("SELECT CAST(SERVERPROPERTY('InstanceName') AS NVARCHAR(128)) AS Name")).recordset[0]?.Name;
  return name ? `NT Service\\MSSQL$${name}` : 'NT Service\\MSSQLSERVER';
}

/** D-274: thư mục chưa có → tạo + cấp quyền ghi cho dịch vụ SQL Server (Windows). Lỗi cấp quyền bỏ qua — BACKUP sẽ báo kèm lệnh. */
export async function ensureBackupDir(dir) {
  if (existsSync(dir)) return false;
  await fs.mkdir(dir, { recursive: true });
  if (process.platform === 'win32') {
    const account = await sqlServiceAccount().catch(() => 'NT Service\\MSSQLSERVER');
    await exec('icacls', [dir, '/grant', `${account}:(OI)(CI)M`], { windowsHide: true }).catch(() => {});
  }
  return true;
}

/** Chép thư mục ảnh (chỉ thêm / ghi đè, không xóa file ở đích) → số file đã có ở đích. */
async function mirror(from, to) {
  if (!from || !existsSync(from)) return 0;
  await fs.cp(from, to, { recursive: true, force: true });
  return (await fs.readdir(to, { recursive: true, withFileTypes: true })).filter((e) => e.isFile()).length;
}

async function prune(folder, db, now, keep) {
  const expired = selectExpired(await fs.readdir(folder), { db, now, ...keep, minKeep: 3 });
  for (const name of expired) await fs.rm(path.join(folder, name), { force: true });
  return expired;
}

const appendLog = (dir, line) => fs.appendFile(path.join(dir, 'backup.log'), `${new Date().toISOString()} ${line}\n`).catch(() => {});

/** BACKUP DATABASE … WITH CHECKSUM bằng kết nối riêng (bản lớn có thể quá thời hạn mặc định của mssql); luôn đóng kết nối. */
async function backupTo(file, { db, dir, label }) {
  const pool = new sql.ConnectionPool({ ...config.db, requestTimeout: 60 * 60 * 1000 });
  let error = null;
  try {
    await pool.connect();
    await pool
      .request()
      .input('db', sql.NVarChar(128), db)
      .input('file', sql.NVarChar(400), file)
      .input('name', sql.NVarChar(128), `${db} ${label || 'tự động'}`)
      .query('BACKUP DATABASE @db TO DISK = @file WITH INIT, CHECKSUM, NAME = @name');
  } catch (err) {
    error = err;
  } finally {
    await pool.close().catch(() => {});
  }
  if (!error) return;
  // Nguyên nhân thật (vd. "Operating system error 5 (Access is denied.)") nằm ở lỗi đứng trước "BACKUP DATABASE is terminating abnormally"
  const message = [...(error.precedingErrors ?? []).map((e) => e.message), error.message].join(' ');
  await appendLog(dir, `FAIL ${db} ${message}`);
  if (/operating system error (5|3)\b|access is denied|cannot find the path/i.test(message)) {
    const account = await sqlServiceAccount().catch(() => 'NT Service\\MSSQLSERVER');
    throw new BackupError(
      `SQL Server không ghi được vào ${dir}. Chạy MỘT LẦN trong PowerShell "Run as administrator" (giữ nguyên dấu nháy đơn): ` +
        `icacls '${dir}' /grant '${account}:(OI)(CI)M' — rồi sao lưu lại.`,
    );
  }
  throw new BackupError(message);
}

/**
 * Sao lưu một lần → { db, file, bytes, label, startedAt, finishedAt, seconds, uploads, copyDir, copied, removed, removedCopy }.
 * `dir` / `copyDir` (không bắt buộc) thay cho cấu hình .env — `npm run db:backup -- --dir …`.
 */
export async function runBackup({ label = '', dir: dirArg, copyDir: copyArg } = {}) {
  let cfg;
  try {
    cfg = backupConfig();
  } catch (err) {
    throw new BackupError(`${err.message} — sửa trong .env (để trống = mặc định)`);
  }
  const dir = dirArg || cfg.dir;
  const copyDir = copyArg ?? cfg.copyDir;
  if (!dir) throw new BackupError('chưa đặt BACKUP_DIR trong .env (thư mục lưu bản sao lưu — xem tài-liệu/vận-hành/backup-restore.md)');
  if (!path.isAbsolute(dir)) throw new BackupError(`BACKUP_DIR phải là đường dẫn đầy đủ (ví dụ C:\\CafeQr-SaoLuu), đang là "${dir}"`);
  if (copyDir && !path.isAbsolute(copyDir)) throw new BackupError(`BACKUP_COPY_DIR phải là đường dẫn đầy đủ, đang là "${copyDir}"`);
  if (label && !cleanLabel(label)) throw new BackupError(`nhãn "${label}" không có chữ / số nào — ví dụ đúng: --label truoc-v1.1`);
  const keep = { keepDays: cfg.keepDays, keepMonths: cfg.keepMonths };
  try {
    return await backupOnce({ db: cfg.db, dir, copyDir, label, keep });
  } catch (err) {
    if (!(err instanceof BackupError)) await appendLog(dir, `FAIL ${cfg.db} ${err.message}`); // lỗi bất ngờ (chép ảnh, dọn bản cũ…) cũng vào log
    throw err;
  }
}

async function backupOnce({ db, dir, copyDir, label, keep }) {
  const startedAt = new Date();
  const file = path.join(dir, backupFileName(db, startedAt, label));
  await ensureBackupDir(dir);
  await backupTo(file, { db, dir, label });

  let bytes;
  try {
    ({ size: bytes } = await fs.stat(file));
  } catch (err) {
    await appendLog(dir, `FAIL ${db} không đọc được file vừa sao lưu: ${err.message}`);
    throw new BackupError(`SQL Server đã ghi ${file} nhưng tài khoản Windows chạy app không đọc được (${err.code}). Cấp quyền đọc thư mục cho tài khoản này.`);
  }

  const uploads = await mirror(config.uploadsDir, path.join(dir, 'uploads'));
  let copied = false;
  let removedCopy = [];
  let copyError = null;
  if (copyDir) {
    try {
      await fs.mkdir(copyDir, { recursive: true });
      await fs.copyFile(file, path.join(copyDir, path.basename(file)));
      await mirror(config.uploadsDir, path.join(copyDir, 'uploads'));
      removedCopy = await prune(copyDir, db, startedAt, keep);
      copied = true;
    } catch (err) {
      copyError = err.message; // bản trong BACKUP_DIR vẫn dùng được
    }
  }
  const removed = await prune(dir, db, startedAt, keep);

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
    copyError,
    removed,
    removedCopy,
  };
  await fs.writeFile(path.join(dir, 'last-backup.json'), `${JSON.stringify(result, null, 2)}\n`);
  await appendLog(dir, `OK ${db} ${result.file} ${bytes} bytes ${result.seconds}s uploads=${uploads} copied=${copied} removed=${removed.length}`);
  return result;
}

/** Bản sao lưu thành công gần nhất (last-backup.json trong thư mục) hoặc null. */
export async function lastBackup(dir = backupConfig().dir) {
  if (!dir) return null;
  try {
    const last = JSON.parse(await fs.readFile(path.join(dir, 'last-backup.json'), 'utf8'));
    return last?.finishedAt ? last : null;
  } catch {
    return null;
  }
}

/** D-273: đến hạn sao lưu? Chưa có bản / bản gần nhất cũ hơn `hours` giờ. */
export function isDue(last, now = new Date(), hours = DUE_HOURS) {
  if (!last?.finishedAt) return true;
  return now.getTime() - new Date(last.finishedAt).getTime() >= hours * 3_600_000;
}

/** D-273: vừa đóng ca → sao lưu nếu bản gần nhất cũ hơn 30 phút. */
export const dueAfterShiftClose = (last, now = new Date()) => isDue(last, now, AFTER_CLOSE_MINUTES / 60);

/** D-275: thẻ "Sao lưu dữ liệu" ở Cài đặt. */
export async function status(now = new Date()) {
  let cfg;
  let configError = null;
  try {
    cfg = backupConfig();
  } catch (err) {
    cfg = { db: config.db.database, dir: process.env.BACKUP_DIR || '', copyDir: process.env.BACKUP_COPY_DIR || '', keepDays: 14, keepMonths: 12 };
    configError = err.message;
  }
  const last = await lastBackup(cfg.dir);
  const [failed, okRun] = await Promise.all([lastRunOf(JOB_NAME, 'FAILED'), lastRunOf(JOB_NAME, 'OK')]);
  // Lỗi còn hiệu lực khi xảy ra SAU lần thành công: so thứ tự lần chạy trong app (RunId — JobRuns làm tròn giờ tới giây), và với
  // bản do `npm run db:backup` làm (không có JobRuns) thì so giờ, chừa 1 giây làm tròn
  const stillFailing =
    failed && (!okRun || failed.runId > okRun.runId) && (!last || new Date(failed.startedAt).getTime() > new Date(last.finishedAt).getTime() + 1000);
  const lastError =
    configError || !cfg.dir
      ? { at: null, message: configError ?? 'Chưa đặt BACKUP_DIR trong .env — máy chủ chưa tự sao lưu' }
      : stillFailing
        ? { at: failed.startedAt, message: failed.error }
        : null;
  let freeBytes = null;
  if (cfg.dir) {
    try {
      const s = await fs.statfs(existsSync(cfg.dir) ? cfg.dir : path.parse(cfg.dir).root);
      freeBytes = Number(s.bavail) * Number(s.bsize);
    } catch {
      freeBytes = null;
    }
  }
  return {
    db: cfg.db,
    dir: cfg.dir || null,
    copyDir: cfg.copyDir || null,
    keepDays: cfg.keepDays,
    keepMonths: cfg.keepMonths,
    last: last && {
      file: last.file,
      bytes: last.bytes,
      finishedAt: last.finishedAt,
      seconds: last.seconds,
      uploads: last.uploads,
      copied: Boolean(last.copied),
      copyError: last.copyError ?? null,
    },
    lastError,
    freeBytes,
    due: Boolean(cfg.dir) && isDue(last, now),
  };
}
