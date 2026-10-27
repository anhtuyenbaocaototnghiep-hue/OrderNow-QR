// F-060 (ADR-020 D-76, D-77): gửi email cảnh báo qua SMTP (nodemailer) từ HÀNG ĐỢI AlertOutbox.
// Đóng ca / hoàn tiền / sổ quỹ chỉ THÊM vào hàng đợi — không bao giờ chờ hay lỗi vì email.
// Lỗi gửi → thử lại sau 1 → 5 → 15 → 60 → 240 phút (6 lần gửi), vẫn lỗi → FAILED (quản lý bấm "Gửi lại email lỗi");
// tối đa MAIL_HOURLY_MAX (20) email / giờ, tính cả email thử.
// Hộp thư gửi (SMTP_*) chỉ ở .env; chưa cấu hình → email nằm chờ (không mất lượt thử), cấu hình xong tự gửi.
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import * as alertsRepo from '../repositories/alertsRepo.js';

const RETRY_MINUTES = [1, 5, 15, 60, 240];
/** Lần gửi đầu + một lần thử lại cho mỗi khoảng chờ. */
export const MAX_ATTEMPTS = RETRY_MINUTES.length + 1;

const BATCH = 10;

let transport = null;
let overridden = false;

/** Test: thay bộ gửi (vd bộ giả ghi lại email / ép lỗi). null → dùng lại cấu hình .env. */
export function _setTransport(t) {
  transport = t;
  overridden = Boolean(t);
}

export const configured = () => overridden || config.mail.transport === 'json' || Boolean(config.mail.host && config.mail.user && config.mail.pass);

function getTransport() {
  if (transport) return transport;
  if (config.mail.transport === 'json') {
    transport = nodemailer.createTransport({ jsonTransport: true });
  } else if (configured()) {
    transport = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: { user: config.mail.user, pass: config.mail.pass },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    });
  }
  return transport;
}

const fromAddress = () => config.mail.from || 'cafe-qr-app <no-reply@localhost>';
const errorText = (err) => String(err?.response || err?.message || err).slice(0, 400);

/**
 * Gửi HẾT các email đã tới giờ trong hàng đợi (từng đợt BATCH, cũ trước), dừng khi hết email tới giờ hoặc chạm giới hạn mỗi giờ.
 * Email gửi lỗi được hẹn giờ thử lại trong tương lai nên không bị nhận lại trong cùng lần gửi. → { sent, failed, skipped? }
 */
export async function flush() {
  const t = getTransport();
  if (!t) return { sent: 0, failed: 0, skipped: 'NOT_CONFIGURED' };
  let sent = 0;
  let failed = 0;
  for (;;) {
    const room = config.mail.hourlyMax - (await alertsRepo.sentLastHour());
    if (room <= 0) return { sent, failed, skipped: 'RATE_LIMIT' };
    const want = Math.min(room, BATCH);
    const rows = await alertsRepo.claimDue(want);
    for (const m of rows) {
      try {
        await t.sendMail({ from: fromAddress(), to: m.recipients, subject: m.subject, text: m.text, html: m.html });
        await alertsRepo.markSent(m.outboxId);
        sent += 1;
      } catch (err) {
        const attempts = m.attempts + 1;
        const nextAt = attempts >= MAX_ATTEMPTS ? null : new Date(Date.now() + RETRY_MINUTES[attempts - 1] * 60_000);
        await alertsRepo.markFailed(m.outboxId, { error: errorText(err), attempts, nextAt });
        failed += 1;
      }
    }
    if (rows.length < want) return { sent, failed };
  }
}

let flushing = null;
/**
 * Một lượt gửi tại một thời điểm trong tiến trình (kick() và bộ gửi nền mỗi phút dùng chung): hai lượt chồng nhau sẽ tính
 * giới hạn mỗi giờ riêng rẽ (vượt giới hạn) và có thể nhận lại dòng SENDING của nhau. Đang có lượt chạy → chờ lượt đó.
 */
export function flushOnce() {
  flushing ??= flush().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Gửi ngay trong nền (không chờ, không ném lỗi) — sau khi thêm email vào hàng đợi. Tắt khi JOBS_ENABLED=false (test). */
export function kick() {
  if (process.env.JOBS_ENABLED === 'false') return;
  flushOnce().catch((err) => console.error('mail flush:', err?.message ?? err));
}

/**
 * Nút "Gửi email thử": gửi thẳng (không qua hàng đợi) để biết ngay cấu hình đúng chưa. → { ok, error? }
 * Tính vào giới hạn mỗi giờ (ghi một dòng SENT) — token quản lý bị lộ cũng không dùng được hộp thư của quán để gửi hàng loạt.
 */
export async function sendTest(emails, shopName) {
  const t = getTransport();
  if (!t) {
    return { ok: false, error: 'Chưa cấu hình hộp thư gửi (SMTP_HOST, SMTP_USER, SMTP_PASS trong file .env của máy chủ)' };
  }
  if ((await alertsRepo.sentLastHour()) >= config.mail.hourlyMax) {
    return { ok: false, error: `Đã gửi ${config.mail.hourlyMax} email trong một giờ qua (giới hạn chống gửi hàng loạt) — thử lại sau` };
  }
  const mail = {
    subject: `[${shopName}] Email thử — cảnh báo bất thường`,
    text: `Đây là email thử từ ${shopName}. Nhận được email này nghĩa là cảnh báo bất thường sẽ gửi tới địa chỉ này.`,
    html: `<p>Đây là email thử từ <b>${escapeHtml(shopName)}</b>.</p><p>Nhận được email này nghĩa là cảnh báo bất thường sẽ gửi tới địa chỉ này.</p>`,
  };
  try {
    await t.sendMail({ from: fromAddress(), to: emails.join(', '), ...mail });
    await alertsRepo.logSent({ kind: 'TEST', recipients: emails, ...mail });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

/** "Gửi lại email lỗi" (sau khi sửa SMTP_* trong .env): email FAILED xếp lại, gửi ngay. → số email xếp lại */
export async function retryFailed() {
  const n = await alertsRepo.retryFailed();
  if (n) kick();
  return n;
}

/** Trạng thái hộp thư gửi + hàng đợi cho trang Cài đặt — KHÔNG có mật khẩu. */
export async function status() {
  return {
    configured: configured(),
    transport: overridden ? 'test' : config.mail.transport,
    from: configured() ? fromAddress() : null,
    ...(await alertsRepo.outboxStatus()),
  };
}

export const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
