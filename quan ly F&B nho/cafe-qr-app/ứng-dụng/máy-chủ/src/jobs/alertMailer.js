// F-060 (ADR-020 D-77): mỗi phút — tới giờ thì xếp email tổng kết ngày, rồi gửi hàng đợi email cảnh báo.
// Không đăng ký vào bộ lập lịch chung (scheduler.js) vì mỗi lần chạy ở đó ghi một dòng JobRuns (1.440 dòng / ngày);
// hàng đợi tự chống gửi trùng (nhận dòng bằng UPDATE … READPAST); trong một tiến trình, lượt gửi dùng chung với kick() (flushOnce).
// JOBS_ENABLED=false (test, E2E) → không tự chạy; test gọi alertService.runDigests() / mailService.flush() trực tiếp.
import * as alertService from '../services/alertService.js';
import * as mailService from '../services/mailService.js';

const EVERY_MS = 60_000;
let timer = null;
let running = false;

export async function tick(now = new Date()) {
  if (running) return;
  running = true;
  try {
    await alertService.runDigests(now);
    await mailService.flushOnce();
  } catch (err) {
    console.error('alert mailer:', err?.message ?? err);
  } finally {
    running = false;
  }
}

export function startAlertMailer() {
  if (timer || process.env.JOBS_ENABLED === 'false') return false;
  timer = setInterval(() => {
    tick().catch(() => {});
  }, EVERY_MS);
  timer.unref?.();
  return true;
}

export function stopAlertMailer() {
  clearInterval(timer);
  timer = null;
}
