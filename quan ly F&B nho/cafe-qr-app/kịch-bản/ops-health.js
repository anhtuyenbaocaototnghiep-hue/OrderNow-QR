// Kiểm tra hệ thống chạy thật (bước 15, ADR-016 D-63): API + CSDL, ổ đĩa trống, bản sao lưu gần nhất, job nền lỗi, dung lượng CSDL.
// Chạy: npm run ops:health (Task Scheduler chạy mỗi 15 phút — tài-liệu/vận-hành/monitoring.md). Chỉ đọc.
// Mã thoát: 0 = ổn, 1 = cần để ý (WARN), 2 = có lỗi (FAIL). Ghi kết quả mới nhất vào LOG_DIR/health-latest.json
// và một dòng mỗi lần vào LOG_DIR/health-YYYYMM.log (mặc định LOG_DIR = <repo>/nhật-ký).
import fs from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { config } from '../ứng-dụng/máy-chủ/src/config.js';
import { backupAgeStatus, dbSizeStatus, diskStatus, EXPRESS_LIMIT_MB, overall, stamp } from './lib/vận-hành.js';

const env = process.env;
const logDir = env.LOG_DIR || path.join(config.repoRoot, 'nhật-ký');
const backupDir = env.BACKUP_DIR || '';
const checks = [];
const add = (name, status, detail) => checks.push({ name, status, detail });
const gb = (bytes) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

// 1. API + CSDL qua chính app đang chạy
try {
  const t0 = Date.now();
  const r = await fetch(`http://127.0.0.1:${config.port}/api/health`, { signal: AbortSignal.timeout(5000) });
  const body = await r.json().catch(() => ({}));
  const ms = Date.now() - t0;
  if (r.ok && body.db === 'up') add('API + CSDL', ms > 2000 ? 'WARN' : 'OK', `trả lời trong ${ms} ms`);
  else add('API + CSDL', 'FAIL', `HTTP ${r.status}, CSDL: ${body.db ?? 'không rõ'}`);
} catch (err) {
  add('API + CSDL', 'FAIL', `app không trả lời ở cổng ${config.port} (${err.name === 'TimeoutError' ? 'quá 5 giây' : 'chưa chạy?'})`);
}

// 2. Ổ đĩa: ổ chứa app và ổ chứa bản sao lưu
for (const [label, where] of [
  ['Ổ đĩa app', config.repoRoot],
  ['Ổ đĩa sao lưu', backupDir],
]) {
  if (!where) continue;
  try {
    const s = await fs.statfs(where);
    const free = s.bavail * s.bsize;
    add(label, diskStatus(free), `còn trống ${gb(free)}`);
  } catch (err) {
    add(label, 'FAIL', `không đọc được ${where} (${err.code})`);
  }
}

// 3. Bản sao lưu gần nhất (RPO ≤ 24 giờ — D-62)
if (!backupDir) add('Sao lưu', 'WARN', 'chưa đặt BACKUP_DIR trong .env — chưa có sao lưu tự động');
else {
  let last = null;
  try {
    last = JSON.parse(await fs.readFile(path.join(backupDir, 'last-backup.json'), 'utf8'));
  } catch {
    add('Sao lưu', 'FAIL', `chưa có bản sao lưu nào trong ${backupDir} (thiếu hoặc hỏng last-backup.json)`);
  }
  if (last) {
    const { status, hours } = backupAgeStatus(last.finishedAt);
    const age = hours === null ? 'không rõ thời điểm (last-backup.json thiếu finishedAt)' : `cách đây ${hours.toFixed(1)} giờ`;
    const notCopied = last.copyDir && !last.copied;
    add('Sao lưu', notCopied ? 'FAIL' : status, `bản gần nhất ${last.file} ${age}${notCopied ? ' — CHƯA chép được ra ngoài máy' : ''}`);
  }
}

// 4–5. Job nền lỗi trong 24 giờ, dung lượng CSDL (đọc thẳng CSDL, không qua app)
let pool = null;
try {
  pool = await new sql.ConnectionPool({ ...config.db, connectionTimeout: 5000, requestTimeout: 10000 }).connect();
  const failed = (
    await pool.request().query(`SELECT Name, MAX(StartedAt) AS LastAt, COUNT(*) AS N FROM dbo.JobRuns
      WHERE Status = 'FAILED' AND StartedAt > DATEADD(HOUR, -24, SYSUTCDATETIME()) GROUP BY Name`)
  ).recordset;
  add(
    'Job nền',
    failed.length ? 'WARN' : 'OK',
    failed.length ? `lỗi trong 24 giờ: ${failed.map((j) => `${j.Name} (${j.N})`).join(', ')}` : 'không có job lỗi trong 24 giờ',
  );
  const { dataMb, edition } = (
    await pool.request().query(`SELECT CAST(SUM(CAST(size AS bigint)) * 8 / 1024 AS int) AS dataMb,
      CAST(SERVERPROPERTY('EngineEdition') AS int) AS edition FROM sys.database_files WHERE type = 0`)
  ).recordset[0];
  const express = edition === 4;
  add('Dung lượng CSDL', dbSizeStatus(dataMb, edition), `${dataMb} MB${express ? ` / giới hạn ${EXPRESS_LIMIT_MB} MB của bản Express` : ''}`);
} catch (err) {
  add('Kết nối CSDL', 'FAIL', `không đọc được CSDL ${config.db.database}: ${err.message}`);
} finally {
  await pool?.close().catch(() => {}); // đóng lỗi không làm mất kết quả kiểm tra
}

const result = { at: new Date().toISOString(), ...overall(checks), checks };
const mark = { OK: '[ OK ]', WARN: '[CHÚ Ý]', FAIL: '[ LỖI ]' };
for (const c of checks) console.log(`${mark[c.status]} ${c.name}: ${c.detail}`);
console.log(result.status === 'OK' ? 'Tổng: ỔN' : `Tổng: ${result.status === 'WARN' ? 'CẦN ĐỂ Ý' : 'CÓ LỖI'} — xem tài-liệu/vận-hành/incident-runbook.md`);

try {
  await fs.mkdir(logDir, { recursive: true });
  await fs.writeFile(path.join(logDir, 'health-latest.json'), `${JSON.stringify(result, null, 2)}\n`);
  await fs.appendFile(path.join(logDir, `health-${stamp().slice(0, 6)}.log`), `${JSON.stringify(result)}\n`);
} catch (err) {
  console.error(`! Không ghi được nhật ký vào ${logDir}: ${err.message}`);
}
// Không gọi process.exit(): trên Windows, thoát khi kết nối còn đang đóng làm Node crash (mã âm) và file .cmd hiểu nhầm là "ổn"
process.exitCode = result.exitCode;
