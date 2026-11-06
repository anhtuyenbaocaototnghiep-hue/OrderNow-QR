// F-073 (ADR-030 D-130…D-134): tính lương từ chấm công.
//  - Bảng lương tháng (tháng theo giờ VN của giờ vào): nháp tính trực tiếp từ chấm công + lịch + quyết định của quản lý;
//    còn việc chờ (làm thêm, ngoài lịch, quên chấm ra, bị báo vắng, nhân viên báo sai, chưa có hồ sơ lương) thì chưa chốt được.
//  - Chốt (chỉ tháng đã hết): lưu ảnh chụp từng dòng, khóa sửa giờ công tháng đó; mở lại phải có lý do (nhật ký thao tác).
//  - Tạm ứng = khoản sổ quỹ "Lương tạm ứng" đã duyệt, ghi người nhận; khoản cộng / trừ khác do quản lý nhập.
//  - Trả lương: VietQR tới tài khoản từng người (app ngân hàng hiện tên chủ tài khoản để đối chiếu) hoặc tiền mặt; đánh dấu đã trả.
//  - ADR-031 D-137: báo quên chấm công đang chờ (theo tháng của giờ vào) cũng là việc chờ — chưa duyệt / từ chối thì chưa chốt được.
import QRCode from 'qrcode';
import { evaluate, hourlyEquivalent, intervalPay, ISSUE_LABEL, payLine, pickRoster, rosterWindow, splitByMinutes, vnDate } from '../domain/payroll.js';
import { bankName, vietQrPayload } from '../domain/vietqr.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import * as attendanceRepo from '../repositories/attendanceRepo.js';
import * as payrollRepo from '../repositories/payrollRepo.js';
import * as shiftsRepo from '../repositories/shiftsRepo.js';
import * as usersRepo from '../repositories/usersRepo.js';
import { addDays, eachDay, todayVn, vnDayStartUtc } from '../utils/time.js';
import { MISSED_PUNCH_DAYS } from './attendanceService.js';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const currentMonth = () => todayVn().slice(0, 7);

export function monthRange(month) {
  if (!MONTH_RE.test(month ?? '')) throw badRequest('VALIDATION_ERROR', 'Tháng phải có dạng YYYY-MM');
  const from = `${month}-01`;
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10);
  return { from, to: addDays(next, -1), fromUtc: vnDayStartUtc(from), toUtc: vnDayStartUtc(next) };
}

const issueRows = (user, att, issues) =>
  issues.map((code) => ({
    code,
    label: ISSUE_LABEL[code],
    attId: att?.attId ?? null,
    clockIn: att?.clockIn ?? null,
    clockOut: att?.clockOut ?? null,
    user: { userId: user.userId, fullName: user.fullName },
  }));

/** Dữ liệu thô cho [from, to] (ngày VN): chấm công (giờ vào trong khoảng), lịch, ngày lễ, hồ sơ. */
async function load(from, to) {
  const fromUtc = vnDayStartUtc(from);
  const toUtc = vnDayStartUtc(addDays(to, 1));
  const [records, rosters, holidays, profiles] = await Promise.all([
    attendanceRepo.startedIn({ fromUtc, toUtc }),
    payrollRepo.rosters(addDays(from, -1), to),
    payrollRepo.holidays(from, addDays(to, 1)),
    payrollRepo.profiles(),
  ]);
  return { fromUtc, toUtc, records, rosters, holidays: new Set(holidays.map((h) => h.date)), profiles: new Map(profiles.map((p) => [p.userId, p])) };
}

const evalRecord = (a, rosters) => ({ att: a, ev: evaluate(a, pickRoster({ ...a, userId: a.user.userId }, rosters)) });

/** Lịch đã qua (kết thúc trước bây giờ) trong tháng mà không có lần chấm công nào giao với lịch → vắng. */
function absentRosters(userId, rosters, records, from, to) {
  const now = Date.now();
  return rosters.filter((r) => {
    if (r.userId !== userId || r.workDate < from || r.workDate > to) return false;
    const w = rosterWindow(r);
    if (w.end > now) return false;
    return !records.some(
      (a) => a.user.userId === userId && new Date(a.clockIn).getTime() < w.end && (a.clockOut ? new Date(a.clockOut).getTime() : now) > w.start,
    );
  });
}
const absences = (...args) => absentRosters(...args).length;

const missedRows = (list) =>
  list.map((m) => ({
    code: 'MISSED_PUNCH',
    label: ISSUE_LABEL.MISSED_PUNCH,
    attId: null,
    requestId: m.requestId,
    clockIn: m.clockIn,
    clockOut: m.clockOut,
    note: m.note,
    user: m.user,
  }));

/** Bảng lương nháp của tháng (tính trực tiếp). */
export async function compute(month) {
  const { from, to, fromUtc, toUtc } = monthRange(month);
  const data = await load(from, to);
  const [advances, adjustments, users, missed] = await Promise.all([
    payrollRepo.advances(fromUtc, toUtc),
    payrollRepo.adjustments(month),
    usersRepo.list(),
    attendanceRepo.missedIn({ fromUtc, toUtc, pendingOnly: true }),
  ]);
  const ids = new Set([
    ...data.profiles.keys(),
    ...data.records.map((a) => a.user.userId),
    ...advances.map((a) => a.userId),
    ...adjustments.map((a) => a.userId),
  ]);
  const lines = [];
  const pending = missedRows(missed);
  for (const userId of ids) {
    const user = users.find((u) => u.userId === userId) ?? { userId, fullName: `#${userId}`, role: '' };
    const evs = data.records.filter((a) => a.user.userId === userId).map((a) => evalRecord(a, data.rosters));
    for (const { att, ev } of evs) pending.push(...issueRows(user, att, ev.issues));
    const profile = data.profiles.get(userId);
    if (!profile && user.role === 'ADMIN') continue; // chủ quán không có hồ sơ lương thì không vào bảng lương
    if (!profile) {
      pending.push(...issueRows(user, null, ['NO_PROFILE']).map((p) => ({ ...p, label: 'Chưa có hồ sơ lương — thêm lương giờ / lương tháng' })));
      continue;
    }
    const line = payLine({
      profile,
      evaluations: evs.map((e) => e.ev),
      absentCount: absences(userId, data.rosters, data.records, from, to),
      holidays: data.holidays,
      advances: advances.filter((a) => a.userId === userId).reduce((s, a) => s + a.amount, 0),
      adjustments: adjustments.filter((a) => a.userId === userId),
    });
    lines.push({
      userId,
      fullName: user.fullName,
      role: user.role,
      payType: profile.payType,
      ...line,
      detail: {
        records: evs.map(({ att, ev }) => ({
          attId: att.attId,
          clockIn: att.clockIn,
          clockOut: att.clockOut,
          paidMinutes: ev.minutes,
          late: ev.late,
          issues: ev.issues,
          decision: att.payDecision,
        })),
        advances: advances.filter((a) => a.userId === userId),
        adjustments: adjustments.filter((a) => a.userId === userId).map((a) => ({ amount: a.amount, reason: a.reason })),
      },
    });
  }
  lines.sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
  const totals = lines.reduce((t, l) => ({ netPay: t.netPay + l.netPay, minutes: t.minutes + l.minutes, advances: t.advances + l.advances }), {
    netPay: 0,
    minutes: 0,
    advances: 0,
  });
  return { month, lines, pending, totals, adjustments };
}

/** Bảng lương: đã chốt → các dòng đã lưu; chưa → nháp. */
export async function get(month) {
  const run = await payrollRepo.run(month);
  if (run?.status === 'LOCKED') {
    const lines = await payrollRepo.lines(month);
    const totals = lines.reduce((t, l) => ({ netPay: t.netPay + l.netPay, minutes: t.minutes + l.minutes, advances: t.advances + l.advances }), {
      netPay: 0,
      minutes: 0,
      advances: 0,
    });
    return { month, status: 'LOCKED', run, lines, pending: [], totals, adjustments: await payrollRepo.adjustments(month) };
  }
  return { ...(await compute(month)), status: 'DRAFT', run, monthEnded: month < currentMonth() };
}

export async function lock(month, user) {
  if (!(month < currentMonth())) throw conflict('MONTH_NOT_ENDED', 'Chỉ chốt được tháng đã kết thúc');
  if (await payrollRepo.isLocked(month)) throw conflict('PAYROLL_LOCKED', 'Bảng lương tháng này đã chốt');
  const draft = await compute(month);
  if (draft.pending.length) {
    throw conflict('PAYROLL_PENDING', `Còn ${draft.pending.length} việc chờ xử lý (làm thêm, ngoài lịch, quên chấm ra…) — xử lý hết rồi chốt`, {
      pending: draft.pending.length,
    });
  }
  await payrollRepo.lock(month, draft.lines, user.userId);
  return get(month);
}

export async function reopen(month, reason, user) {
  monthRange(month);
  if (!(await payrollRepo.reopen(month, reason, user.userId))) throw conflict('PAYROLL_NOT_LOCKED', 'Bảng lương tháng này chưa chốt');
  return get(month);
}

async function assertDraft(month) {
  if (await payrollRepo.isLocked(month)) throw conflict('PAYROLL_LOCKED', 'Bảng lương tháng này đã chốt — mở lại trước khi sửa');
}

export async function addAdjustment({ month, userId, amount, reason }, user) {
  monthRange(month);
  await assertDraft(month);
  if (!(await usersRepo.findById(userId))) throw notFound('Không tìm thấy nhân viên');
  return { adjId: await payrollRepo.addAdjustment({ month, userId, amount, reason, by: user.userId }) };
}

export async function removeAdjustment(id) {
  const adj = await payrollRepo.adjustment(id);
  if (!adj) throw notFound('Không tìm thấy khoản cộng / trừ');
  await assertDraft(adj.month);
  await payrollRepo.removeAdjustment(id);
  return 'DELETED';
}

/** Chia thưởng chung / tip của một ca thu ngân theo số phút được trả của từng người trong ca → khoản cộng tháng đó. */
export async function teamBonus({ shiftId, amount, reason }, user) {
  const rows = await attendanceRepo.forShift(shiftId);
  if (!rows.length) throw notFound('Ca này chưa có ai chấm công');
  const month = vnDate(rows[0].clockIn).slice(0, 7);
  await assertDraft(month);
  const { rosters } = await load(addDays(vnDate(rows[0].clockIn), -1), vnDate(rows[0].clockIn));
  const shift = await shiftsRepo.findById(shiftId);
  const [s1, s2] = [new Date(shift.openedAt).getTime(), new Date(shift.closedAt ?? Date.now()).getTime()];
  const people = new Map();
  for (const a of rows) {
    const ev = evaluate(a, pickRoster({ ...a, userId: a.user.userId }, rosters));
    if (!ev.paid) continue;
    const m = Math.max(0, Math.round((Math.min(ev.paid[1], s2) - Math.max(ev.paid[0], s1)) / 60_000));
    const cur = people.get(a.user.userId) ?? { userId: a.user.userId, fullName: a.user.fullName, minutes: 0 };
    cur.minutes += m;
    people.set(a.user.userId, cur);
  }
  const shares = splitByMinutes(
    amount,
    [...people.values()].filter((p) => p.minutes > 0),
  );
  if (!shares.length) throw conflict('NO_PAID_MINUTES', 'Ca này chưa có giờ được tính lương');
  for (const sh of shares.filter((x) => x.share > 0)) {
    await payrollRepo.addAdjustment({ month, userId: sh.userId, amount: sh.share, reason: `${reason} (ca #${shiftId}, ${sh.minutes} phút)`, by: user.userId });
  }
  return { month, shares };
}

/** VietQR trả lương cho một người (bảng đã chốt): số tiền thực nhận, nội dung "LUONG MM YYYY TÊN". */
export async function payQr(month, userId) {
  const [line] = await payrollRepo.lines(month, userId);
  if (!line) throw notFound('Chưa có dòng lương đã chốt của người này');
  const profile = await payrollRepo.profile(userId);
  if (!profile?.bankBin || !profile.bankAccount) throw conflict('NO_BANK_ACCOUNT', 'Chưa nhập ngân hàng / số tài khoản trong hồ sơ lương');
  if (line.netPay <= 0) throw conflict('NOTHING_TO_PAY', 'Thực nhận không lớn hơn 0');
  const content = `LUONG ${month.slice(5)} ${month.slice(0, 4)} ${line.fullName}`;
  const payload = vietQrPayload({ bin: profile.bankBin, account: profile.bankAccount, amount: line.netPay, content });
  return {
    amount: line.netPay,
    bankName: bankName(profile.bankBin),
    bankAccount: profile.bankAccount,
    accountName: profile.bankAccountName,
    content,
    payload,
    qr: await QRCode.toDataURL(payload, { width: 260, margin: 1, errorCorrectionLevel: 'M' }),
  };
}

export async function markPaid(month, userId, method, user) {
  if (!(await payrollRepo.markPaid(month, userId, method, user.userId))) throw conflict('PAY_NOT_ALLOWED', 'Chưa chốt bảng lương hoặc đã đánh dấu trả');
  return (await payrollRepo.lines(month, userId))[0];
}

// ---- Hồ sơ lương, ngày lễ ----
export const profiles = () => payrollRepo.profiles();

export async function saveProfile(userId, body, user) {
  const target = await usersRepo.findById(userId);
  if (!target) throw notFound('Không tìm thấy tài khoản');
  if (body.payType === 'HOURLY' && !(body.hourlyRate > 0)) throw badRequest('VALIDATION_ERROR', 'Nhập lương theo giờ');
  if (body.payType === 'MONTHLY' && !(body.monthlySalary > 0)) throw badRequest('VALIDATION_ERROR', 'Nhập lương tháng');
  if (body.bankAccount && !body.bankBin) throw badRequest('VALIDATION_ERROR', 'Chọn ngân hàng của số tài khoản');
  if (body.bankBin && !bankName(body.bankBin)) throw badRequest('VALIDATION_ERROR', 'Ngân hàng không có trong danh sách');
  return payrollRepo.saveProfile(userId, body, user.userId);
}

export const holidays = (year) => payrollRepo.holidays(`${year}-01-01`, `${year}-12-31`);
export const saveHoliday = (date, name) => payrollRepo.saveHoliday(date, name);
export async function removeHoliday(date) {
  if (!(await payrollRepo.removeHoliday(date))) throw notFound('Không có ngày lễ này');
  return 'DELETED';
}

// ---- Nhân viên tự xem (F-072 D-129): chỉ của chính mình ----
export async function mine(user, month = currentMonth()) {
  const { from, to } = monthRange(month);
  const data = await load(from, to);
  const records = data.records.filter((a) => a.user.userId === user.userId);
  const evs = records.map((a) => evalRecord(a, data.rosters));
  const history = await attendanceRepo.editHistory(records.map((a) => a.attId));
  const run = await payrollRepo.run(month);
  let pay = null;
  if (run?.status === 'LOCKED') pay = { status: 'LOCKED', ...((await payrollRepo.lines(month, user.userId))[0] ?? {}) };
  else if (data.profiles.has(user.userId)) pay = { status: 'DRAFT', ...(await compute(month)).lines.find((l) => l.userId === user.userId) };
  return {
    month,
    records: evs.map(({ att, ev }) => ({
      attId: att.attId,
      clockIn: att.clockIn,
      clockOut: att.clockOut,
      source: att.source,
      paidMinutes: ev.minutes,
      actualMinutes: ev.actualMinutes,
      late: ev.late,
      roster: ev.roster ? `${ev.roster.startTime}–${ev.roster.endTime}` : null,
      issues: ev.issues.map((c) => ISSUE_LABEL[c]),
      decision: att.payDecision,
      decidedBy: att.decidedBy,
      edits: history.filter((h) => h.attId === att.attId).map(({ by, at, after }) => ({ by, at, reason: safeReason(after) })),
      openDispute: att.openDispute,
    })),
    pay,
    disputes: await attendanceRepo.disputes({ userId: user.userId }),
    payslipMonths: await payrollRepo.lockedMonthsFor(user.userId),
    ...(await missedFor(user, data, from, to, records, run)),
  };
}

/** ADR-031 D-136: ngày có lịch đã qua mà không chấm công (kèm có còn báo quên được không) + các lần đã báo quên của tháng. */
async function missedFor(user, data, from, to, records, run) {
  const missedPunches = await attendanceRepo.missedIn({ fromUtc: data.fromUtc, toUtc: data.toUtc, userId: user.userId });
  const oldest = Date.now() - MISSED_PUNCH_DAYS * 86400e3;
  const missingDays = absentRosters(user.userId, data.rosters, records, from, to).map((r) => {
    const w = rosterWindow(r);
    const reported = missedPunches.some((m) => m.status !== 'REJECTED' && new Date(m.clockIn).getTime() < w.end && new Date(m.clockOut).getTime() > w.start);
    return {
      workDate: r.workDate,
      startTime: r.startTime,
      endTime: r.endTime,
      reported,
      canReport: !reported && run?.status !== 'LOCKED' && w.start >= oldest,
    };
  });
  return { missedPunches, missingDays, missedPunchDays: MISSED_PUNCH_DAYS };
}

/** Lý do trong nhật ký thao tác: AfterJson = { input: thân request, result } — sửa giờ có `reason`, quyết định của quản lý có `note`. */
function safeReason(json) {
  try {
    const input = JSON.parse(json)?.input ?? {};
    return input.reason ?? input.note ?? null;
  } catch {
    return null;
  }
}

export async function ackPayslip(user, month) {
  monthRange(month);
  if (!(await payrollRepo.ack(month, user.userId))) throw notFound('Chưa có phiếu lương tháng này');
  return { ack: true };
}

export async function disputesForMonth(month) {
  const { fromUtc, toUtc } = monthRange(month);
  const records = await attendanceRepo.startedIn({ fromUtc, toUtc });
  return records.length ? attendanceRepo.disputes({ attIds: records.map((r) => r.attId) }) : [];
}

// ---- Báo cáo tuần cho chủ quán (F-072 D-129) ----
export async function weekReport(from) {
  const to = addDays(from, 6);
  const data = await load(from, to);
  const [users, edits, shifts, missed] = await Promise.all([
    usersRepo.list(),
    payrollRepo.manualEdits(data.fromUtc, data.toUtc),
    payrollRepo.shiftsWithRevenue(data.fromUtc, data.toUtc),
    attendanceRepo.missedIn({ fromUtc: data.fromUtc, toUtc: data.toUtc, pendingOnly: true }),
  ]);
  const evs = data.records.map((a) => evalRecord(a, data.rosters));
  const people = users
    .filter((u) => u.role !== 'ADMIN' && (data.rosters.some((r) => r.userId === u.userId) || evs.some((e) => e.att.user.userId === u.userId)))
    .map((u) => {
      const mine = evs.filter((e) => e.att.user.userId === u.userId);
      const scheduled = data.rosters
        .filter((r) => r.userId === u.userId && r.workDate >= from && r.workDate <= to)
        .reduce((s, r) => s + (rosterWindow(r).end - rosterWindow(r).start) / 60_000, 0);
      return {
        userId: u.userId,
        fullName: u.fullName,
        scheduledMinutes: Math.round(scheduled),
        paidMinutes: mine.reduce((s, e) => s + e.ev.minutes, 0),
        actualMinutes: mine.reduce((s, e) => s + e.ev.actualMinutes, 0),
        lateCount: mine.filter((e) => e.ev.late).length,
        absentCount: absences(u.userId, data.rosters, data.records, from, to),
        pending: mine.reduce((s, e) => s + e.ev.issues.length, 0) + missed.filter((m) => m.user.userId === u.userId).length,
      };
    });
  const shiftRows = shifts.map((s) => {
    const [s1, s2] = [new Date(s.openedAt).getTime(), new Date(s.closedAt ?? Date.now()).getTime()];
    let labor = 0;
    let staff = 0;
    for (const { att, ev } of evs) {
      const profile = data.profiles.get(att.user.userId);
      if (!ev.paid || !profile) continue;
      const a = Math.max(ev.paid[0], s1);
      const b = Math.min(ev.paid[1], s2);
      if (b <= a) continue;
      staff += 1;
      const p = intervalPay({ ...profile, payType: 'HOURLY', hourlyRate: hourlyEquivalent(profile) }, a, b, data.holidays);
      labor += p.basePay + p.nightPay + p.holidayPay;
    }
    return {
      shiftId: s.shiftId,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      revenue: s.revenue,
      staff,
      laborCost: Math.round(labor),
      laborPct: s.revenue > 0 ? Math.round((labor / s.revenue) * 1000) / 10 : null,
    };
  });
  return { from, to, people, edits, shifts: shiftRows };
}

// ---- Lãi/lỗ (F-034): chi phí lương theo ngày khi đã có hồ sơ lương ----
export async function laborByDay(from, to) {
  if (!(await payrollRepo.hasProfiles())) return null;
  const data = await load(from, to);
  const days = new Map(eachDay(from, to).map((d) => [d, 0]));
  for (const a of data.records) {
    const profile = data.profiles.get(a.user.userId);
    if (!profile) continue;
    const { ev } = evalRecord(a, data.rosters);
    if (!ev.paid) continue;
    const p = intervalPay(profile, ev.paid[0], ev.paid[1], data.holidays);
    const d = vnDate(ev.paid[0]);
    if (days.has(d)) days.set(d, days.get(d) + p.basePay + p.nightPay + p.holidayPay);
  }
  for (const p of data.profiles.values()) {
    if (p.payType !== 'MONTHLY') continue;
    for (const d of days.keys()) {
      const dim = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).getUTCDate();
      days.set(d, days.get(d) + p.monthlySalary / dim);
    }
  }
  return days;
}

/** Quyền xem phiếu lương: quản lý xem mọi người; người khác chỉ của mình. */
export function assertCanSee(user, userId) {
  if (user.role !== 'ADMIN' && user.userId !== userId) throw forbidden('Chỉ xem được phiếu lương của chính mình');
}
