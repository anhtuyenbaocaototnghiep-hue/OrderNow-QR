// Logic thuần cho script vận hành (bước 15, ADR-016): tên file sao lưu, quy tắc giữ bản cũ, đánh giá kết quả kiểm tra hệ thống.
// Không đụng file / CSDL — test đơn vị ở ứng-dụng/máy-chủ/tests/ops.test.js.

const pad = (n) => String(n).padStart(2, '0');
const VN_OFFSET_MS = 7 * 3600e3; // giờ Việt Nam (UTC+7, không đổi giờ mùa hè)

/** Thời điểm → "20261023-2215" theo giờ Việt Nam: tên file đọc được và xếp đúng thứ tự thời gian. */
export function stamp(date = new Date()) {
  const d = new Date(date.getTime() + VN_OFFSET_MS);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

/** Tên CSDL an toàn để ghép vào lệnh SQL: bắt đầu bằng chữ, chỉ chữ / số / gạch dưới, ≤ 64 ký tự. */
export const isSafeDbName = (name) => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(String(name ?? ''));

/** Nhãn tự do ("Trước v1.1") → "truoc-v1-1": chữ thường không dấu, số, gạch nối, ≤ 30 ký tự. */
export function cleanLabel(label) {
  return String(label ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/, '');
}

/** CafeQr + thời điểm (+ nhãn) → "CafeQr_20261023-2215.bak" / "CafeQr_20261023-2215_truoc-v1-1.bak". */
export function backupFileName(db, date = new Date(), label = '') {
  const tag = cleanLabel(label);
  return `${db}_${stamp(date)}${tag ? `_${tag}` : ''}.bak`;
}

const NAME_RE = /^([A-Za-z][A-Za-z0-9_]*)_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(?:_([a-z0-9-]+))?\.bak$/;

/** Tên file do script tạo → { db, date, month: "202610", label } — file khác trả null (không bao giờ bị dọn). */
export function parseBackupName(name) {
  const m = NAME_RE.exec(String(name));
  if (!m) return null;
  const [, db, y, mo, d, h, mi, label = ''] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi) - VN_OFFSET_MS);
  if (Number.isNaN(date.getTime())) return null;
  return { db, date, month: `${y}${mo}`, label };
}

const monthIndex = (yyyymm) => Number(yyyymm.slice(0, 4)) * 12 + Number(yyyymm.slice(4, 6)) - 1;

/**
 * Chọn file sao lưu cần xóa (D-62). Chỉ xét file đúng mẫu tên của `db`. Giữ:
 * - mọi bản trong `keepDays` ngày gần nhất;
 * - bản sớm nhất của mỗi tháng và mọi bản có nhãn (trước phát hành / migration) trong `keepMonths` tháng gần nhất;
 * - luôn ít nhất `minKeep` bản mới nhất (máy tắt lâu ngày vẫn còn bản để khôi phục).
 */
export function selectExpired(names, { db, now = new Date(), keepDays = 14, keepMonths = 12, minKeep = 3 } = {}) {
  const items = names
    .map((name) => ({ name, info: parseBackupName(name) }))
    .filter((x) => x.info && x.info.db === db)
    .sort((a, b) => b.info.date - a.info.date);
  const keep = new Set(items.slice(0, minKeep).map((x) => x.name));
  const nowMonth = monthIndex(stamp(now).slice(0, 6));
  const firstOfMonth = new Map();
  for (const x of [...items].reverse()) if (!firstOfMonth.has(x.info.month)) firstOfMonth.set(x.info.month, x.name);
  for (const x of items) {
    const recentMonth = nowMonth - monthIndex(x.info.month) < keepMonths;
    if (now - x.info.date <= keepDays * 86400e3) keep.add(x.name);
    if (recentMonth && (firstOfMonth.get(x.info.month) === x.name || x.info.label)) keep.add(x.name);
  }
  return items.filter((x) => !keep.has(x.name)).map((x) => x.name);
}

// ---------- Đánh giá kết quả kiểm tra hệ thống (ops-health.js) ----------
export const LEVEL = { OK: 0, WARN: 1, FAIL: 2 };

/** Mức nặng nhất của các mục → { status, exitCode }: OK = 0, WARN = 1, FAIL = 2. Không có mục nào → FAIL. */
export function overall(checks) {
  if (!checks.length) return { status: 'FAIL', exitCode: 2 };
  const worst = Math.max(...checks.map((c) => LEVEL[c.status] ?? 2));
  const status = Object.keys(LEVEL).find((k) => LEVEL[k] === worst);
  return { status, exitCode: worst };
}

/** Tuổi bản sao lưu gần nhất (RPO ≤ 24 giờ): ≤ 26 giờ ổn, ≤ 50 giờ lỡ một đêm (WARN), lâu hơn / chưa có → FAIL. */
export function backupAgeStatus(lastFinishedAt, now = new Date(), { warnHours = 26, failHours = 50 } = {}) {
  const t = lastFinishedAt ? new Date(lastFinishedAt).getTime() : NaN;
  if (Number.isNaN(t)) return { status: 'FAIL', hours: null };
  const hours = (now.getTime() - t) / 3600e3;
  return { status: hours <= warnHours ? 'OK' : hours <= failHours ? 'WARN' : 'FAIL', hours };
}

/** Dung lượng trống của ổ đĩa: < failGb → FAIL, < warnGb → WARN. */
export function diskStatus(freeBytes, { warnGb = 10, failGb = 2 } = {}) {
  const gb = freeBytes / 1024 ** 3;
  return gb < failGb ? 'FAIL' : gb < warnGb ? 'WARN' : 'OK';
}

export const EXPRESS_LIMIT_MB = 10 * 1024; // SQL Server Express: mỗi CSDL tối đa 10 GB dữ liệu

/** Dung lượng dữ liệu CSDL so với giới hạn bản Express (EngineEdition = 4): ≥ 95 % FAIL, ≥ 80 % WARN; bản khác luôn OK. */
export function dbSizeStatus(dataMb, engineEdition) {
  if (Number(engineEdition) !== 4) return 'OK';
  const ratio = dataMb / EXPRESS_LIMIT_MB;
  return ratio >= 0.95 ? 'FAIL' : ratio >= 0.8 ? 'WARN' : 'OK';
}

// ---------- Cấu hình và khôi phục (db-backup.js, db-restore.js — review G3 TASK-070) ----------

/** Số nguyên dương từ biến môi trường (BACKUP_KEEP_DAYS…). Gõ sai ("14 ngày", 0) → ném lỗi TRƯỚC khi dọn, không xóa nhầm bản sao lưu. */
export function positiveInt(value, fallback, name) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const s = String(value).trim();
  if (!/^\d+$/.test(s) || Number(s) < 1) throw new Error(`${name} phải là số nguyên từ 1 trở lên, đang là "${value}"`);
  return Number(s);
}

/** Dòng kết quả `RESTORE FILELISTONLY` (sqlcmd -s "|"): cột 1 = tên logic, cột 3 = loại → [{ logical, type: 'D' | 'L' }]. */
export function parseFileList(lines) {
  return lines
    .map((l) => l.split('|'))
    .filter((c) => c.length > 2 && (c[2] === 'D' || c[2] === 'L'))
    .map((c) => ({ logical: c[0], type: c[2] }));
}

/** Dòng kết quả `RESTORE HEADERONLY`: cột 10 = DatabaseName, cột 19 = BackupFinishDate (thứ tự cột theo tài liệu SQL Server). */
export function parseHeader(lines) {
  const c = (lines.find((l) => l.includes('|')) ?? '').split('|');
  return { database: c[9] || null, finishedAt: c[18] || null };
}

/**
 * Đích MOVE cho từng file trong bản sao lưu → [[tên logic, đường dẫn]].
 * CSDL đích đang có và cùng số file → ghi đè đúng các file đang dùng (`current`: [{ type: 'ROWS' | 'LOG', path }]);
 * còn lại → thư mục dữ liệu / nhật ký mặc định của SQL Server, tên theo CSDL đích (X.mdf, X_1.ndf, X_log.ldf, X_log_1.ldf).
 */
export function buildMoves({ files, current = [], target, dataDir, logDir }) {
  const data = files.filter((f) => f.type === 'D');
  const log = files.filter((f) => f.type === 'L');
  const rowsNow = current.filter((c) => c.type === 'ROWS');
  const logNow = current.filter((c) => c.type === 'LOG');
  if (current.length && rowsNow.length === data.length && logNow.length === log.length) {
    return [...data.map((f, i) => [f.logical, rowsNow[i].path]), ...log.map((f, i) => [f.logical, logNow[i].path])];
  }
  const join = (d, name) => `${String(d).replace(/[\\/]+$/, '')}${String(d).includes('/') ? '/' : '\\'}${name}`;
  return [
    ...data.map((f, i) => [f.logical, join(dataDir, `${target}${i ? `_${i}.ndf` : '.mdf'}`)]),
    ...log.map((f, i) => [f.logical, join(logDir, `${target}_log${i ? `_${i}` : ''}.ldf`)]),
  ];
}
