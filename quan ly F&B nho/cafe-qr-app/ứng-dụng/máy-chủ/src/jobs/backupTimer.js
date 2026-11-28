// F-103 (ADR-074 D-273): tự sao lưu. 2 phút sau khi mở app, rồi mỗi 10 phút: bản thành công gần nhất cũ hơn 20 giờ (hoặc chưa có)
// → chạy job `db-backup` (khóa chống chạy trùng + JobRuns như mọi job). Đóng ca → afterShiftClose(). Lỗi → 60 phút sau mới tự thử lại.
// Không đăng ký chu kỳ vào scheduler.js (mỗi lần kiểm sẽ ghi một dòng JobRuns — 144 dòng / ngày), giống alertMailer.js.
// JOBS_ENABLED=false (test, E2E) → không tự chạy; nút "Sao lưu ngay" (runJob) vẫn chạy được.
import * as backupService from '../services/backupService.js';
import { runJob } from './scheduler.js';

const FIRST_CHECK_MS = 2 * 60_000;
const EVERY_MS = 10 * 60_000;
const RETRY_AFTER_FAIL_MS = 60 * 60_000;
let timer = null;
let firstTimer = null;
let running = false;
let lastFailAt = 0;

const enabled = () => process.env.JOBS_ENABLED !== 'false';
const configured = () => {
  try {
    return Boolean(backupService.backupConfig().dir);
  } catch {
    return true; // cấu hình sai (BACKUP_KEEP_DAYS…) → cứ chạy để lỗi hiện ở Cài đặt / JobRuns
  }
};

async function run() {
  running = true;
  try {
    const r = await runJob(backupService.JOB_NAME);
    if (r.status === 'FAILED') lastFailAt = Date.now();
    return r;
  } finally {
    running = false;
  }
}

/** Một lần kiểm: đến hạn (D-273) thì sao lưu. → kết quả runJob hoặc null (chưa đến hạn / đang chạy / vừa lỗi). */
export async function tick(now = new Date()) {
  if (running || now.getTime() - lastFailAt < RETRY_AFTER_FAIL_MS || !configured()) return null;
  if (!backupService.isDue(await backupService.lastBackup(), now)) return null;
  return run();
}

/** Đóng ca xong → sao lưu nếu bản gần nhất cũ hơn 30 phút. Không chờ; lỗi không làm hỏng việc đóng ca. */
export function afterShiftClose(now = new Date()) {
  if (!enabled() || running || now.getTime() - lastFailAt < RETRY_AFTER_FAIL_MS || !configured()) return;
  backupService
    .lastBackup()
    .then((last) => (backupService.dueAfterShiftClose(last, now) ? run() : null))
    .catch((err) => console.error('sao lưu sau đóng ca:', err?.message ?? err));
}

export function startBackupTimer() {
  if (timer || !enabled()) return false;
  const check = () => tick().catch((err) => console.error('sao lưu tự động:', err?.message ?? err));
  firstTimer = setTimeout(check, FIRST_CHECK_MS);
  timer = setInterval(check, EVERY_MS);
  firstTimer.unref?.();
  timer.unref?.();
  return true;
}

export function stopBackupTimer() {
  clearTimeout(firstTimer);
  clearInterval(timer);
  firstTimer = null;
  timer = null;
}
