// Khôi phục / diễn tập khôi phục bản sao lưu (bước 15, ADR-016 D-62). Cần quyền quản trị SQL Server: gọi `sqlcmd` bằng đăng nhập
// Windows (-E) trên máy chủ quán — login của app (cafe_app) không tạo được CSDL. VPS / Docker: đặt RESTORE_SQL_USER + RESTORE_SQL_PASSWORD.
//   npm run db:restore -- --drill [file.bak]                     → khôi phục vào CafeQrRestoreDrill, đếm vài bảng, XÓA CSDL diễn tập
//   npm run db:restore -- --to <TênCSDL> [file.bak]              → khôi phục thành CSDL MỚI (tên đã có thì dừng)
//   npm run db:restore -- --to <TênCSDL> <file.bak> --replace    → ghi đè CSDL có sẵn — PHẢI chỉ rõ file; CSDL đang chạy (DB_NAME) phải dừng app trước
// Không chỉ file (diễn tập / CSDL mới) → bản mới nhất ghi trong BACKUP_DIR/last-backup.json. Tên file trơn → tìm trong BACKUP_DIR.
// Các bước khi có sự cố: tài-liệu/vận-hành/incident-runbook.md.
// Mã thoát: 0 = xong, 1 = lỗi. Không gọi process.exit(): trên Windows, thoát khi kết nối còn đang đóng làm Node crash (mã âm)
// và file .cmd / Task Scheduler hiểu nhầm là "xong".
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../ứng-dụng/máy-chủ/src/config.js';
import { buildMoves, isSafeDbName, parseFileList, parseHeader } from './lib/vận-hành.js';

const DRILL_DB = 'CafeQrRestoreDrill';
const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const drill = args.includes('--drill');
const replace = args.includes('--replace');
const target = drill ? DRILL_DB : argValue('--to');
const fileArg = args.find((a, i) => a.toLowerCase().endsWith('.bak') && args[i - 1] !== '--to');
const backupDir = process.env.BACKUP_DIR || '';
const sqlUser = process.env.RESTORE_SQL_USER || '';
// Đăng nhập Windows chỉ chạy qua kết nối nội bộ "." (qua 127.0.0.1,1433 bị từ chối "untrusted domain")
const server = process.env.RESTORE_SQL_SERVER || (sqlUser ? `${config.db.server},${config.db.port}` : '.');

class Stop extends Error {}
const fail = (message) => {
  throw new Stop(message);
};
const q = (s) => String(s).replace(/'/g, "''"); // chuỗi trong N'…'

/** Chạy một lô T-SQL qua sqlcmd (UTF-8: -f 65001) → các dòng kết quả, cột cách nhau bởi "|". Lỗi SQL → ném lỗi (-b). */
function sqlcmd(query, { timeout = 60 * 60 * 1000 } = {}) {
  const auth = sqlUser ? ['-U', sqlUser] : ['-E'];
  let out;
  try {
    out = execFileSync('sqlcmd', ['-S', server, ...auth, '-C', '-b', '-f', '65001', '-h', '-1', '-W', '-s', '|', '-Q', `SET NOCOUNT ON; ${query}`], {
      encoding: 'utf8',
      timeout,
      env: sqlUser ? { ...process.env, SQLCMDPASSWORD: process.env.RESTORE_SQL_PASSWORD || '' } : process.env,
    });
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('không tìm thấy sqlcmd — cài "sqlcmd" của Microsoft (có sẵn khi cài SQL Server / SSMS)');
    throw new Error(String(err.stderr || err.stdout || err.message).trim());
  }
  // Chỉ giữ dòng dữ liệu; bỏ thông báo như "Changed database context…", "Processed … pages…"
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^(Changed database context|Processed \d+ pages|RESTORE DATABASE successfully|BACKUP DATABASE successfully)/i.test(l));
}

/** File cần khôi phục: đường dẫn đầy đủ; tên trơn → tìm trong BACKUP_DIR rồi thư mục hiện tại; không chỉ → bản mới nhất. */
function resolveFile() {
  if (fileArg) {
    if (path.isAbsolute(fileArg)) return fileArg;
    const inBackupDir = backupDir ? path.join(backupDir, fileArg) : '';
    return inBackupDir && fs.existsSync(inBackupDir) ? inBackupDir : path.resolve(fileArg);
  }
  if (!backupDir) fail('không chỉ file .bak và chưa đặt BACKUP_DIR');
  try {
    const last = JSON.parse(fs.readFileSync(path.join(backupDir, 'last-backup.json'), 'utf8'));
    return path.join(backupDir, last.file);
  } catch {
    return fail(`không đọc được ${path.join(backupDir, 'last-backup.json')} — chỉ rõ file .bak cần khôi phục`);
  }
}

/**
 * App còn chạy không? Có BẤT KỲ phản hồi HTTP nào (kể cả 503 khi CSDL hỏng) hoặc quá giờ chờ → coi là đang chạy.
 * Chỉ "bị từ chối kết nối" mới là đã dừng (review G3: CSDL hỏng là lúc cần khôi phục, health trả 503 / treo).
 */
async function appRunning() {
  try {
    await fetch(`http://127.0.0.1:${config.port}/api/health`, { signal: AbortSignal.timeout(3000) });
    return true;
  } catch (err) {
    return err?.cause?.code !== 'ECONNREFUSED';
  }
}

async function main() {
  if (!target) fail('thiếu --drill hoặc --to <TênCSDL>');
  if (!isSafeDbName(target)) fail(`tên CSDL không hợp lệ: "${target}" (chỉ chữ, số, gạch dưới)`);
  if (replace && !fileArg) fail('ghi đè (--replace) phải chỉ rõ file .bak — không tự lấy bản mới nhất (có thể là bản chụp dữ liệu đang hỏng)');
  const file = resolveFile();
  if (!fs.existsSync(file)) fail(`không thấy file ${file}`);

  const header = parseHeader(sqlcmd(`RESTORE HEADERONLY FROM DISK = N'${q(file)}'`));
  console.log(`Bản sao lưu: ${path.basename(file)} — CSDL gốc ${header.database ?? '?'}, sao lưu xong lúc ${header.finishedAt ?? '?'}`);

  const exists = (name) => sqlcmd(`SELECT CASE WHEN DB_ID(N'${q(name)}') IS NULL THEN 0 ELSE 1 END`)[0] === '1';
  const live = target.toLowerCase() === String(config.db.database).toLowerCase();
  if (drill && exists(DRILL_DB)) {
    console.log(`Xóa CSDL diễn tập còn sót từ lần trước: ${DRILL_DB}`);
    sqlcmd(`ALTER DATABASE [${DRILL_DB}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${DRILL_DB}];`);
  }
  const targetExists = !drill && exists(target);
  if (targetExists && !replace) fail(`CSDL ${target} đã có. Muốn ghi đè thì thêm --replace (mất dữ liệu hiện có của ${target})`);
  if (targetExists && live && (await appRunning())) {
    fail(`app có vẻ đang chạy (cổng ${config.port} còn trả lời). Dừng app trước (dừng tác vụ cafe-qr-app / đóng cửa sổ máy chủ) rồi chạy lại`);
  }

  // File trong bản sao lưu + đích MOVE (CSDL có sẵn → đúng file đang dùng; CSDL mới → thư mục mặc định của SQL Server)
  const files = parseFileList(sqlcmd(`RESTORE FILELISTONLY FROM DISK = N'${q(file)}'`));
  if (!files.some((f) => f.type === 'D') || !files.some((f) => f.type === 'L')) fail(`không đọc được danh sách file trong ${file}`);
  const current = targetExists
    ? sqlcmd(`SELECT type_desc, physical_name FROM sys.master_files WHERE database_id = DB_ID(N'${q(target)}') ORDER BY file_id`)
        .map((l) => l.split('|'))
        .map(([type, p]) => ({ type, path: p }))
    : [];
  const [dataDir, logDir] = sqlcmd(
    "SELECT CAST(SERVERPROPERTY('InstanceDefaultDataPath') AS nvarchar(400)) UNION ALL SELECT CAST(SERVERPROPERTY('InstanceDefaultLogPath') AS nvarchar(400))",
  );
  const moves = buildMoves({ files, current, target, dataDir, logDir });

  const t0 = Date.now();
  console.log(`Khôi phục → CSDL ${target}${targetExists ? ' (ghi đè)' : ''}…`);
  const withMoves = moves.map(([logical, to]) => `MOVE N'${q(logical)}' TO N'${q(to)}'`).join(', ');
  try {
    // Ghi đè: OFFLINE (không phải SINGLE_USER) để job kiểm tra / kết nối của app không chiếm mất chỗ trước lệnh RESTORE
    sqlcmd(
      `${targetExists ? `ALTER DATABASE [${target}] SET OFFLINE WITH ROLLBACK IMMEDIATE; ` : ''}` +
        `RESTORE DATABASE [${target}] FROM DISK = N'${q(file)}' WITH ${withMoves}, RECOVERY${targetExists ? ', REPLACE' : ''};`,
    );
  } catch (err) {
    if (targetExists) {
      try {
        sqlcmd(`ALTER DATABASE [${target}] SET ONLINE;`);
      } catch {
        /* CSDL có thể kẹt RESTORING / OFFLINE — incident-runbook.md S2 */
      }
    }
    fail(err.message);
  }
  const seconds = Math.round((Date.now() - t0) / 100) / 10;

  // Máy mới: user cafe_app trong bản sao lưu chưa gắn với login cùng tên → gắn lại (không đổi quyền)
  if (!drill && config.db.user && isSafeDbName(config.db.user)) {
    sqlcmd(
      `IF SUSER_ID(N'${q(config.db.user)}') IS NOT NULL AND EXISTS (SELECT 1 FROM [${target}].sys.database_principals WHERE name = N'${q(config.db.user)}' AND type = 'S') ` +
        `EXEC(N'USE [${target}]; ALTER USER [${config.db.user}] WITH LOGIN = [${config.db.user}];');`,
    );
  }

  // Kiểm nhanh: CSDL mở được, đọc được các bảng chính
  const counts = sqlcmd(
    `USE [${target}]; SELECT 'Orders', COUNT(*) FROM dbo.Orders UNION ALL SELECT 'Payments', COUNT(*) FROM dbo.Payments ` +
      `UNION ALL SELECT 'MenuItems', COUNT(*) FROM dbo.MenuItems UNION ALL SELECT 'Migration', MAX(LEFT(Filename, 4)) FROM dbo.SchemaMigrations`,
  );
  console.log(
    `Khôi phục xong trong ${seconds} giây. Kiểm nhanh: ${counts
      .filter((l) => l.includes('|'))
      .map((l) => l.replace('|', ' = '))
      .join(' · ')}`,
  );

  if (drill) {
    sqlcmd(`ALTER DATABASE [${DRILL_DB}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${DRILL_DB}];`);
    console.log(`Diễn tập ĐẠT: bản ${path.basename(file)} khôi phục được. Đã xóa CSDL diễn tập ${DRILL_DB}. Ghi kết quả vào backup-restore.md §6.`);
  } else if (live) {
    console.log('Bước tiếp theo: npm run db:migrate (áp migration mới hơn bản sao lưu nếu có), rồi mở lại app và chạy npm run ops:health.');
  }
  return 0;
}

process.exitCode = await main().catch((err) => {
  console.error(`\n*** Khôi phục KHÔNG thành công: ${err.message} ***`);
  if (!(err instanceof Stop)) console.error(err.stack);
  return 1;
});
