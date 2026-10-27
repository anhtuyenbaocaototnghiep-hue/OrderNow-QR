// F-060 (ADR-020 D-75…D-78): phát hiện bất thường → cảnh báo trong app (bảng Alerts, phòng realtime `admin`) + email qua hàng đợi.
//  - Đóng ca: lệch két, % chuyển khoản, món đã pha bị hủy, số lượt hoàn tiền, số lượt giảm giá tay → một email "báo cáo ca".
//  - Tức thì: hoàn tiền lớn, hủy / sửa khoản sổ quỹ đã duyệt.
//  - Đổi cài đặt cảnh báo (email nhận, loại email, giờ, ngưỡng) → thư báo tới cả địa chỉ cũ lẫn mới.
//  - Tổng kết ngày: 24 giờ tính tới giờ gửi đã cài (gửi bù hôm trước nếu lỡ).
// Gọi SAU khi transaction nghiệp vụ đã commit; nơi gọi bắt lỗi — phát hiện / email lỗi không làm hỏng đóng ca / hoàn tiền.
// Chạy lại an toàn (DedupeKey) → bị chọn làm nạn nhân deadlock thì chạy lại cả lượt (withDeadlockRetry).
// Email không chứa thông tin khách: chữ nhân viên gõ (lý do) được che số điện thoại.
import { config } from '../config.js';
import { withDeadlockRetry } from '../db.js';
import { vnClock, toMinutes } from '../pricing/pricing.js';
import * as alertsRepo from '../repositories/alertsRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { baseline, judge, quietMinutesLeft } from '../utils/anomaly.js';
import { addDays, vnDayStartUtc } from '../utils/time.js';
import * as mailService from './mailService.js';
import { getSettings, shopInfo } from './settingsService.js';

const esc = mailService.escapeHtml;
const vnd = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;
const signed = (n) => (n > 0 ? `+${vnd(n)}` : n < 0 ? `−${vnd(-n)}` : vnd(0));
const fmtTime = (d) =>
  d
    ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(
        new Date(d),
      )
    : '';
const fmtDate = (date) => date.split('-').reverse().join('/');
/** Che chuỗi giống số điện thoại trong chữ nhân viên gõ (lý do hoàn tiền / sổ quỹ) — cả dạng có cách / chấm / gạch (0912 345 678, +84 912…). */
export const maskPhones = (s) => String(s ?? '').replace(/(?<![\d.,])(?:\+?84|0)(?:[\s.-]?\d){8,10}(?!\d)/g, '***');
const people = (list) => (list.length ? list.map((p) => `${p.fullName} ${p.count}${p.total !== undefined ? `/${p.total}` : ''}`).join(', ') : '');
const alertsLink = () => `${config.publicBaseUrl}/admin/alerts`;

/** Giờ yên lặng (cảnh báo tức thì + báo cáo ca): hoãn tới hết giờ yên lặng. → Date | null */
function quietUntil(settings, now = new Date()) {
  const left = quietMinutesLeft(vnClock(now).minutes, settings.alertQuietStart, settings.alertQuietEnd);
  return left > 0 ? new Date(now.getTime() + left * 60_000) : null;
}

/** Khung email HTML chung (bảng đơn giản, màu nhẹ — đọc tốt trên điện thoại). */
function htmlMail(shopName, heading, rows, footer) {
  const tr = rows
    .map(
      ([label, value, bad]) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555">${esc(label)}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;${bad ? 'color:#b42318;font-weight:600' : ''}">${esc(value)}</td></tr>`,
    )
    .join('');
  return (
    `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px">` +
    `<p style="color:#7a4a2a;margin:0 0 4px">${esc(shopName)}</p><h2 style="margin:0 0 12px;font-size:18px">${esc(heading)}</h2>` +
    `<table style="border-collapse:collapse;width:100%;font-size:14px">${tr}</table>` +
    `<p style="margin:16px 0"><a href="${esc(alertsLink())}" style="background:#7a4a2a;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Xem trong app</a></p>` +
    `<p style="color:#777;font-size:12px">${esc(footer)}</p></div>`
  );
}
const textMail = (heading, rows, footer) =>
  [heading, '', ...rows.map(([label, value, bad]) => `${label}: ${value}${bad ? '  ⚠️' : ''}`), '', `Xem trong app: ${alertsLink()}`, footer].join('\n');
const DISCLAIMER = 'Cảnh báo là gợi ý để kiểm tra, không kết luận ai sai.';

async function newAlert(a) {
  const alert = await alertsRepo.createAlert(a);
  if (alert) publish([ROOMS.admin], 'alert.created', { alert });
  return alert;
}

// ---------------- Đóng ca ----------------
const SHIFT_CHECKS = [
  { kind: 'CASH_DIFF', label: 'Lệch két', severity: 'HIGH' },
  { kind: 'TRANSFER_SHARE', label: 'Tỉ lệ chuyển khoản', severity: 'MEDIUM', floor: 40, unit: '%' },
  { kind: 'VOIDS', label: 'Món đã pha bị hủy', severity: 'MEDIUM', floor: 2 },
  { kind: 'REFUNDS', label: 'Lượt hoàn tiền', severity: 'MEDIUM', floor: 2 },
  { kind: 'MANUAL_DISCOUNT', label: 'Lượt giảm giá tay', severity: 'MEDIUM', floor: 3 },
];
const MIN_PAYMENTS_FOR_SHARE = 5;
const share = (m) => (m.paymentCount >= MIN_PAYMENTS_FOR_SHARE ? Math.round((m.transferCount * 100) / m.paymentCount) : null);

function metricOf(kind, m) {
  if (kind === 'CASH_DIFF') return m.difference === null ? null : Math.abs(m.difference);
  if (kind === 'TRANSFER_SHARE') return share(m);
  if (kind === 'VOIDS') return m.voidsQty;
  if (kind === 'REFUNDS') return m.refundCount;
  return m.manualCount;
}
function fixedOf(kind, s) {
  return {
    CASH_DIFF: s.alertCashDiffMax,
    TRANSFER_SHARE: s.alertTransferShareMax,
    VOIDS: s.alertVoidsMax,
    REFUNDS: s.alertRefundsMax,
    MANUAL_DISCOUNT: s.alertManualDiscountMax,
  }[kind];
}

/** Kiểm 5 dấu hiệu của ca vừa đóng → cảnh báo + email báo cáo ca. → { alerts, results, email } */
export const onShiftClosed = (shiftId) => withDeadlockRetry(() => checkShift(shiftId));

async function checkShift(shiftId) {
  const s = await getSettings();
  const m = await alertsRepo.shiftMetrics(shiftId);
  if (!m || !m.closedAt) return { alerts: [], results: [], email: null };
  const history = s.alertUseStats ? await alertsRepo.metricsHistory(shiftId, 30) : [];
  const results = [];
  const alerts = [];
  for (const c of SHIFT_CHECKS) {
    const value = metricOf(c.kind, m);
    const fixed = fixedOf(c.kind, s);
    if (value === null) {
      results.push({ ...c, value: null, fixed });
      continue;
    }
    const series = c.kind === 'CASH_DIFF' ? null : history.map((h) => metricOf(c.kind, h)).filter((v) => v !== null);
    const base = series ? baseline(series) : null;
    const verdict = judge({ value, fixed, floor: c.floor ?? 0, base, useStats: Boolean(s.alertUseStats && series) });
    const result = { ...c, value, fixed, base, verdict };
    results.push(result);
    if (!verdict.anomalous) continue;
    const who =
      c.kind === 'CASH_DIFF'
        ? [m.closedBy, m.openedBy].filter((u, i, a) => u && a.findIndex((x) => x?.userId === u.userId) === i).map((u) => ({ ...u, count: 1 }))
        : await alertsRepo.byUser(shiftId, c.kind);
    result.people = who;
    const alert = await newAlert({
      kind: c.kind,
      severity: c.severity,
      shiftId,
      userId: (c.kind === 'CASH_DIFF' ? m.closedBy?.userId : who[0]?.userId) ?? null,
      title: shiftAlertTitle(c, m, result),
      detail: {
        value,
        fixed,
        unit: c.unit ?? null,
        normal: base && base.n ? { shifts: base.n, mean: round1(base.mean), limit: round1(base.limit) } : null,
        byFixed: verdict.byFixed,
        byStats: verdict.byStats,
        difference: c.kind === 'CASH_DIFF' ? m.difference : undefined,
        payments: c.kind === 'TRANSFER_SHARE' ? { transfer: m.transferCount, total: m.paymentCount } : undefined,
        people: who,
        window: { from: m.openedAt, to: m.closedAt },
      },
      dedupeKey: `SHIFT:${shiftId}:${c.kind}`,
    });
    if (alert) alerts.push(alert);
  }
  let email = null;
  if (s.alertShiftReport && s.alertEmails.length) email = await enqueueShiftReport(s, m, results);
  if (email) mailService.kick();
  return { alerts, results, email };
}

const round1 = (n) => Math.round(n * 10) / 10;

function shiftAlertTitle(c, m, r) {
  const normal = r.verdict.byStats && r.base?.n ? `, bình thường ~${round1(r.base.mean)}${c.unit ?? ''}` : '';
  if (c.kind === 'CASH_DIFF') return `Ca #${m.shiftId} đóng ${m.difference < 0 ? 'thiếu' : 'thừa'} ${vnd(Math.abs(m.difference))} (cho phép ${vnd(r.fixed)})`;
  if (c.kind === 'TRANSFER_SHARE') return `Ca #${m.shiftId}: ${r.value}% lượt thu là chuyển khoản (ngưỡng ${r.fixed}%${normal}) — đối chiếu app ngân hàng`;
  if (c.kind === 'VOIDS') return `Ca #${m.shiftId}: hủy ${r.value} món đã pha (ngưỡng ${r.fixed}${normal})`;
  if (c.kind === 'REFUNDS') return `Ca #${m.shiftId}: ${r.value} lượt hoàn tiền (ngưỡng ${r.fixed}${normal})`;
  return `Ca #${m.shiftId}: ${r.value} lượt giảm giá tay (ngưỡng ${r.fixed}${normal})`;
}

function shiftRow(r, m) {
  if (r.kind === 'CASH_DIFF') return [r.label, `${signed(m.difference)} (cho phép ±${vnd(r.fixed)})`, r.verdict?.anomalous];
  if (r.kind === 'TRANSFER_SHARE') {
    if (r.value === null) return [r.label, `${m.transferCount}/${m.paymentCount} lượt (ít lượt thu, không xét)`, false];
    const normal = r.base?.n ? `, bình thường ~${round1(r.base.mean)}%` : '';
    return [r.label, `${m.transferCount}/${m.paymentCount} lượt = ${r.value}% (ngưỡng ${r.fixed}%${normal})`, r.verdict.anomalous];
  }
  const normal = r.base?.n ? `, bình thường ~${round1(r.base.mean)}` : '';
  const who = r.people?.length ? ` — ${people(r.people)}` : '';
  return [r.label, `${r.value} (ngưỡng ${r.fixed}${normal})${who}`, r.verdict.anomalous];
}

async function enqueueShiftReport(s, m, results) {
  const shop = (await shopInfo()).name;
  const bad = results.filter((r) => r.verdict?.anomalous);
  const subject = `[${shop}] Ca #${m.shiftId} đã đóng — ${bad.length ? `⚠️ ${bad.length} dấu hiệu bất thường` : '✔ không có dấu hiệu bất thường'}`;
  const heading = `Ca #${m.shiftId} · mở: ${m.openedBy.fullName} ${fmtTime(m.openedAt)} · đóng: ${m.closedBy?.fullName ?? ''} ${fmtTime(m.closedAt)}`;
  const rows = results.map((r) => shiftRow(r, m));
  return alertsRepo.enqueue({
    kind: 'SHIFT',
    dedupeKey: `SHIFT:${m.shiftId}`,
    recipients: s.alertEmails,
    subject,
    text: textMail(heading, rows, DISCLAIMER),
    html: htmlMail(shop, heading, rows, DISCLAIMER),
    notBefore: quietUntil(s),
  });
}

// ---------------- Tức thì ----------------
async function enqueueImmediate(s, alert, rows) {
  if (!s.alertImmediate || !s.alertEmails.length) return null;
  const shop = (await shopInfo()).name;
  const email = await alertsRepo.enqueue({
    kind: 'ALERT',
    alertId: alert.alertId,
    dedupeKey: `ALERT:${alert.alertId}`,
    recipients: s.alertEmails,
    subject: `[${shop}] ⚠️ ${alert.title}`,
    text: textMail(alert.title, rows, DISCLAIMER),
    html: htmlMail(shop, alert.title, rows, DISCLAIMER),
    notBefore: quietUntil(s),
  });
  if (email) mailService.kick();
  return email;
}

/** Cảnh báo tức thì: tạo mới, hoặc (chạy lại sau lỗi giữa chừng) lấy cảnh báo đã có để vẫn xếp được email — email có khóa ALERT:id nên không trùng. */
async function immediateAlert(a) {
  return (await newAlert(a)) ?? alertsRepo.findAlertByKey(a.dedupeKey);
}

/** Hoàn tiền từ mức "lớn" trở lên → cảnh báo tức thì. refund: bản ghi vừa tạo; user: người thao tác. */
export const onRefund = (refund, opts) => withDeadlockRetry(() => checkRefund(refund, opts));

async function checkRefund(refund, { user, shiftId = null } = {}) {
  const s = await getSettings();
  if (!(refund.amount >= s.alertRefundBig)) return { alert: null, email: null };
  const alert = await immediateAlert({
    kind: 'BIG_REFUND',
    severity: 'HIGH',
    shiftId,
    userId: user?.userId ?? null,
    title: `Hoàn tiền ${vnd(refund.amount)} — lượt thu #${refund.paymentId}`,
    detail: { amount: refund.amount, fixed: s.alertRefundBig, paymentId: refund.paymentId, method: refund.method, reason: maskPhones(refund.reason) },
    dedupeKey: `REFUND:${refund.refundId}`,
  });
  if (!alert) return { alert: null, email: null };
  const rows = [
    ['Số tiền hoàn', `${vnd(refund.amount)} (mức lớn từ ${vnd(s.alertRefundBig)})`, true],
    ['Cách trả của lượt thu', refund.method === 'TRANSFER' ? 'Chuyển khoản' : 'Tiền mặt', false],
    ['Người thao tác', `${user?.fullName ?? ''} · duyệt: ${refund.approvedBy ?? ''}`, false],
    ['Lý do', maskPhones(refund.reason), false],
    ['Lúc', fmtTime(refund.createdAt), false],
  ];
  return { alert, email: await enqueueImmediate(s, alert, rows) };
}

/** Hủy / sửa khoản sổ quỹ đã duyệt (F-050) → cảnh báo tức thì. */
export const onCashVoided = (voided, replacement, user) => withDeadlockRetry(() => checkCashVoid(voided, replacement, user));

async function checkCashVoid(voided, replacement, user) {
  const s = await getSettings();
  const action = replacement ? 'sửa' : 'hủy';
  const alert = await immediateAlert({
    kind: 'CASH_VOID',
    severity: 'MEDIUM',
    shiftId: voided.shiftId,
    userId: user?.userId ?? null,
    title: `Khoản sổ quỹ đã duyệt #${voided.cashTxnId} bị ${action}: ${vnd(voided.amount)}${replacement ? ` → ${vnd(replacement.amount)}` : ''}`,
    detail: {
      cashTxnId: voided.cashTxnId,
      category: voided.category?.name,
      direction: voided.direction,
      amount: voided.amount,
      newAmount: replacement?.amount ?? null,
      createdBy: voided.createdBy?.fullName,
      voidedBy: voided.voidedBy?.fullName,
      reason: maskPhones(voided.voidReason),
    },
    dedupeKey: `CASHVOID:${voided.cashTxnId}`,
  });
  if (!alert) return { alert: null, email: null };
  const rows = [
    ['Khoản', `#${voided.cashTxnId} · ${voided.category?.name ?? ''} · ${voided.direction === 'OUT' ? 'chi' : 'thu'}`, false],
    ['Số tiền', replacement ? `${vnd(voided.amount)} → ${vnd(replacement.amount)}` : `${vnd(voided.amount)} (đã hủy)`, true],
    ['Người ghi khoản', voided.createdBy?.fullName ?? '', false],
    ['Người hủy / sửa', `${user?.fullName ?? ''}${voided.voidedBy ? ` · duyệt: ${voided.voidedBy.fullName}` : ''}`, false],
    ['Lý do', maskPhones(voided.voidReason), false],
  ];
  return { alert, email: await enqueueImmediate(s, alert, rows) };
}

// ---------------- Đổi cài đặt cảnh báo ----------------
const onOff = (v) => (v ? 'bật' : 'tắt');
const clock = (v) => v || 'tắt';
/** Cài đặt cảnh báo cần báo khi đổi: [khóa, nhãn, cách hiện giá trị]. */
const WATCHED = [
  ['alertImmediate', 'Cảnh báo tức thì', onOff],
  ['alertShiftReport', 'Báo cáo khi đóng ca', onOff],
  ['alertDailyDigest', 'Tổng kết cuối ngày', onOff],
  ['alertDigestTime', 'Giờ gửi tổng kết', clock],
  ['alertQuietStart', 'Giờ yên lặng từ', clock],
  ['alertQuietEnd', 'Giờ yên lặng đến', clock],
  ['alertCashDiffMax', 'Lệch két cho phép', vnd],
  ['alertTransferShareMax', 'Tỉ lệ lượt thu chuyển khoản tối đa', (v) => `${v}%`],
  ['alertVoidsMax', 'Món đã pha bị hủy tối đa / ca', String],
  ['alertRefundsMax', 'Lượt hoàn tiền tối đa / ca', String],
  ['alertManualDiscountMax', 'Lượt giảm giá tay tối đa / ca', String],
  ['alertRefundBig', 'Hoàn tiền "lớn" từ', vnd],
  ['alertUseStats', 'So với mức bình thường', onOff],
];
const sameList = (a, b) => [...a].sort().join(',') === [...b].sort().join(',');

/**
 * Đổi cài đặt cảnh báo (email nhận, loại email, giờ, ngưỡng) → thư báo tới CẢ địa chỉ cũ lẫn mới (không hoãn theo giờ yên lặng)
 * — chống lén đổi người nhận / tắt email / nâng ngưỡng để giấu cảnh báo. before / after: cài đặt trước / sau khi lưu.
 */
export async function onAlertSettingsChanged(before, after, user) {
  const emailsChanged = !sameList(before.alertEmails, after.alertEmails);
  const changed = WATCHED.filter(([k]) => before[k] !== after[k]);
  const to = [...new Set([...before.alertEmails, ...after.alertEmails])];
  if ((!emailsChanged && !changed.length) || !to.length) return null;
  const shop = (await shopInfo()).name;
  const heading = emailsChanged ? 'Danh sách email nhận cảnh báo vừa thay đổi' : 'Cài đặt cảnh báo bất thường vừa thay đổi';
  const rows = [
    ...(emailsChanged
      ? [
          ['Trước', before.alertEmails.join(', ') || '(chưa có)', false],
          ['Sau', after.alertEmails.join(', ') || '(đã xóa hết — sẽ không còn email cảnh báo)', !after.alertEmails.length],
        ]
      : []),
    ...changed.map(([k, label, show]) => [label, `${show(before[k])} → ${show(after[k])}`, true]),
    ['Người đổi', user?.fullName ?? '', false],
    ['Lúc', fmtTime(new Date()), false],
  ];
  const footer = 'Nếu không phải bạn đổi, hãy vào Cài đặt kiểm tra ngay và xem Nhật ký thao tác.';
  const email = await alertsRepo.enqueue({
    kind: 'NOTICE',
    recipients: to,
    subject: `[${shop}] ${emailsChanged ? 'Đổi email nhận cảnh báo' : 'Đổi cài đặt cảnh báo'}`,
    text: textMail(heading, rows, footer),
    html: htmlMail(shop, heading, rows, footer),
  });
  if (email) mailService.kick();
  return email;
}

// ---------------- Tổng kết ngày ----------------
const digestMinutes = (s) => toMinutes(s.alertDigestTime) ?? 22 * 60;
/** Mốc gửi tổng kết của ngày `date` (giờ quán) → Date (UTC). */
const digestMark = (date, at) => new Date(vnDayStartUtc(date).getTime() + at * 60_000);

/**
 * Email tổng kết gửi ở mốc của ngày `date` (giờ quán, YYYY-MM-DD) — một lần / mốc (DedupeKey DIGEST:date).
 * Số liệu là 24 giờ TÍNH TỚI mốc gửi (vd 22:00 hôm trước → 22:00 hôm nay): ca đóng / tiền thu sau giờ gửi vào tổng kết hôm sau,
 * không bị bỏ sót. Mốc 00:00 → đúng trọn ngày hôm trước (tiêu đề ghi ngày hôm trước).
 */
export async function dailyDigest(date) {
  const s = await getSettings();
  if (!s.alertDailyDigest || !s.alertEmails.length) return null;
  const key = `DIGEST:${date}`;
  if (await alertsRepo.outboxExists(key)) return null;
  const to = digestMark(date, digestMinutes(s));
  const from = new Date(to.getTime() - 86_400_000);
  const label = vnClock(new Date(to.getTime() - 60_000)).date;
  const d = await alertsRepo.dayStats(from, to);
  const shop = (await shopInfo()).name;
  const total = d.cashIn + d.transferIn;
  const heading = `Tổng kết ngày ${fmtDate(label)} (${fmtTime(from)} → ${fmtTime(to)})`;
  const rows = [
    ['Doanh thu (đã thu)', `${vnd(total)} · ${d.payments} lượt thu`, false],
    ['Tiền mặt / Chuyển khoản', `${vnd(d.cashIn)} / ${vnd(d.transferIn)}`, false],
    ['Hoàn tiền', vnd(d.refunds), d.refunds > 0],
    ['Đánh giá ≤ 2 sao', String(d.lowReviews), d.lowReviews > 0],
    ...d.shifts.map((x) => [`Ca #${x.shiftId} (${x.openedBy})`, `đóng ${fmtTime(x.closedAt)} · lệch két ${signed(x.difference)}`, x.difference !== 0]),
    ['Cảnh báo', d.alerts.length ? String(d.alerts.length) : 'không có', d.alerts.length > 0],
    ...d.alerts.map((a) => ['•', a.title, a.severity === 'HIGH']),
  ];
  const email = await alertsRepo.enqueue({
    kind: 'DIGEST',
    dedupeKey: key,
    recipients: s.alertEmails,
    subject: `[${shop}] Tổng kết ${fmtDate(label)}: ${vnd(total)} · ${d.alerts.length ? `⚠️ ${d.alerts.length} cảnh báo` : 'không có cảnh báo'}`,
    text: textMail(heading, rows, DISCLAIMER),
    html: htmlMail(shop, heading, rows, DISCLAIMER),
  });
  if (email) mailService.kick();
  return email;
}

/**
 * Mỗi phút (jobs/alertMailer.js): tới giờ tổng kết → gửi tổng kết của mốc hôm nay; gửi bù mốc hôm qua nếu lỡ (máy tắt lúc đó)
 * — chỉ khi email nhận đã được cài từ trước giờ tổng kết hôm qua (không gửi tổng kết cũ cho người vừa bật cảnh báo).
 */
export async function runDigests(now = new Date()) {
  const s = await getSettings();
  if (!s.alertDailyDigest || !s.alertEmails.length) return { sent: [] };
  const { date, minutes } = vnClock(now);
  const at = digestMinutes(s);
  const sent = [];
  const yesterday = addDays(date, -1);
  const configuredAt = await alertsRepo.settingUpdatedAt('alert.emails');
  if (configuredAt && configuredAt < digestMark(yesterday, at) && (await dailyDigest(yesterday))) sent.push(yesterday);
  if (minutes >= at && (await dailyDigest(date))) sent.push(date);
  return { sent };
}

// ---------------- Trang Cảnh báo ----------------
export const list = (opts) => alertsRepo.listAlerts(opts);
export const countNew = () => alertsRepo.countNew();
export const setStatus = (id, body, user) => alertsRepo.setAlertStatus(id, { status: body.status, note: body.note ?? null, userId: user.userId });
