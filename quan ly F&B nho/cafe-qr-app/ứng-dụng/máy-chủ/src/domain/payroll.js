// F-072 / F-073 (ADR-030): luật tính giờ công và tính lương — hàm thuần, giờ trong DB là UTC, giờ quán là VN (UTC+7, không đổi giờ).
//   - Có lịch: trả theo phần giao với lịch (đến sớm / về muộn không tính); dư ngoài lịch > 15 phút → chờ quản lý duyệt làm thêm.
//   - Không có lịch (làm thay, đổi ca): tính giờ thật nhưng chờ quản lý xác nhận.
//   - Tự đóng / người khác chấm ra hộ / bị người đóng ca báo không có mặt / nhân viên báo sai → chờ quản lý.
//   - Quyết định của quản lý: ACTUAL (giờ thật), SCHEDULE (theo lịch), NONE (không tính).
//   - Đi trễ: vào sau giờ bắt đầu lịch quá 15 phút. Vắng: có lịch đã qua mà không chấm công giao với lịch.
//   - Giờ đêm: từ NightStart tới 06:00 sáng hôm sau. Ngày lễ: theo ngày VN của từng phút.
export const VN_OFFSET_MS = 7 * 3600 * 1000;
export const LATE_MINUTES = 15;
export const EXTRA_TOLERANCE_MINUTES = 15;
export const MONTHLY_HOURS = 208; // lương tháng quy ra giờ: 26 ngày × 8 giờ
const MIN = 60_000;

const ms = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());
export const vnDate = (d) => new Date(ms(d) + VN_OFFSET_MS).toISOString().slice(0, 10);
export const monthOf = (d) => vnDate(d).slice(0, 7);
const minutesOfTime = (hhmm) => Number(String(hhmm).slice(0, 2)) * 60 + Number(String(hhmm).slice(3, 5));

/** Lịch (ngày VN + giờ bắt đầu / kết thúc) → khoảng UTC; kết thúc ≤ bắt đầu = ca qua đêm. */
export function rosterWindow({ workDate, startTime, endTime }) {
  const day = Date.parse(`${workDate}T00:00:00Z`) - VN_OFFSET_MS;
  const start = day + minutesOfTime(startTime) * MIN;
  let end = day + minutesOfTime(endTime) * MIN;
  if (end <= start) end += 24 * 60 * MIN;
  return { start, end };
}

const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

/** Lịch của cùng người giao nhiều nhất với lần chấm công (null = làm ngoài lịch). */
export function pickRoster(record, rosters) {
  const start = ms(record.clockIn);
  const end = record.clockOut ? ms(record.clockOut) : start + MIN;
  let best = null;
  let bestOverlap = 0;
  for (const r of rosters) {
    if (r.userId !== record.userId) continue;
    const w = rosterWindow(r);
    const o = overlap(start, end, w.start, w.end);
    if (o > bestOverlap) [best, bestOverlap] = [r, o];
  }
  return best;
}

/**
 * Một lần chấm công → khoảng được trả + các việc còn chờ quản lý.
 * record: { clockIn, clockOut, payDecision, needsReview, checkResult, openDispute }
 */
export function evaluate(record, roster) {
  const actualStart = ms(record.clockIn);
  const actualEnd = record.clockOut ? ms(record.clockOut) : null;
  const w = roster ? rosterWindow(roster) : null;
  const late = Boolean(w && actualStart > w.start + LATE_MINUTES * MIN);
  const base = { roster: roster ?? null, late, lateMinutes: late ? Math.round((actualStart - w.start) / MIN) : 0 };
  if (actualEnd === null) return { ...base, open: true, paid: null, minutes: 0, actualMinutes: 0, extraMinutes: 0, issues: ['OPEN'] };

  const actualMinutes = Math.round((actualEnd - actualStart) / MIN);
  const clipped = w && Math.min(actualEnd, w.end) > Math.max(actualStart, w.start) ? [Math.max(actualStart, w.start), Math.min(actualEnd, w.end)] : null;
  const decision = record.payDecision ?? null;
  let paid;
  if (decision === 'ACTUAL') paid = [actualStart, actualEnd];
  else if (decision === 'NONE') paid = null;
  else if (decision === 'SCHEDULE') paid = clipped;
  else paid = w ? clipped : [actualStart, actualEnd];
  const minutes = paid ? Math.round((paid[1] - paid[0]) / MIN) : 0;
  const extraMinutes = w ? Math.max(0, actualMinutes - (clipped ? Math.round((clipped[1] - clipped[0]) / MIN) : 0)) : 0;

  const issues = [];
  if (!decision) {
    if (w && extraMinutes > EXTRA_TOLERANCE_MINUTES) issues.push('EXTRA');
    if (!w) issues.push('OFF_SCHEDULE');
    if (record.needsReview) issues.push('AUTO_CLOSED');
    if (record.checkResult === 'DISPUTED') issues.push('DISPUTED');
  }
  if (record.openDispute) issues.push('EMPLOYEE_DISPUTE');
  return { ...base, open: false, paid, minutes, actualMinutes, extraMinutes, issues };
}

const isNight = (minuteOfDay, nightStartMin) => minuteOfDay >= nightStartMin || minuteOfDay < 6 * 60;

/** Số phút trong [start, end): tổng, giờ đêm (từ nightStart tới 06:00), ngày lễ (Set 'YYYY-MM-DD'). */
export function splitMinutes(start, end, { nightStart = '18:00', holidays = new Set() } = {}) {
  const total = Math.round((end - start) / MIN);
  const nightStartMin = minutesOfTime(nightStart);
  let night = 0;
  let holiday = 0;
  for (let i = 0; i < total; i += 1) {
    const t = start + i * MIN + VN_OFFSET_MS;
    const d = new Date(t);
    if (isNight(d.getUTCHours() * 60 + d.getUTCMinutes(), nightStartMin)) night += 1;
    if (holidays.has(d.toISOString().slice(0, 10))) holiday += 1;
  }
  return { minutes: total, night, holiday };
}

/** Lương giờ quy đổi (để tính phụ trội ngày lễ, chi phí theo ca). */
export const hourlyEquivalent = (p) => (p.payType === 'MONTHLY' ? p.monthlySalary / MONTHLY_HOURS : p.hourlyRate);

/** Tiền công của một khoảng đã trả (theo giờ: cả lương giờ; theo tháng: chỉ phụ cấp đêm + phụ trội lễ). */
export function intervalPay(profile, start, end, holidays) {
  const s = splitMinutes(start, end, { nightStart: profile.nightStart, holidays });
  return {
    minutes: s.minutes,
    nightMinutes: s.night,
    holidayMinutes: s.holiday,
    basePay: profile.payType === 'HOURLY' ? (s.minutes / 60) * profile.hourlyRate : 0,
    nightPay: (s.night / 60) * profile.nightAllowance,
    holidayPay: (s.holiday / 60) * hourlyEquivalent(profile) * (profile.holidayMultiplier - 1),
  };
}

/**
 * Một dòng bảng lương. evaluations: kết quả evaluate() của các lần chấm công trong tháng; absentCount: số lịch đã qua không đi làm.
 * advances: tổng tạm ứng đã duyệt; adjustments: [{ amount, reason }].
 */
export function payLine({ profile, evaluations, absentCount = 0, holidays = new Set(), advances = 0, adjustments = [] }) {
  const sum = { minutes: 0, nightMinutes: 0, holidayMinutes: 0, basePay: 0, nightPay: 0, holidayPay: 0 };
  for (const e of evaluations) {
    if (!e.paid) continue;
    const p = intervalPay(profile, e.paid[0], e.paid[1], holidays);
    for (const k of Object.keys(sum)) sum[k] += p[k];
  }
  const { minutes, nightMinutes, holidayMinutes } = sum;
  const base = profile.payType === 'MONTHLY' ? profile.monthlySalary : sum.basePay;
  const night = sum.nightPay;
  const holiday = sum.holidayPay;
  const lateCount = evaluations.filter((e) => e.late).length;
  const attendanceBonus = profile.attendanceBonus > 0 && minutes > 0 && lateCount === 0 && absentCount === 0 ? profile.attendanceBonus : 0;
  const adj = adjustments.reduce((s, a) => s + a.amount, 0);
  const r = {
    minutes,
    nightMinutes,
    holidayMinutes,
    basePay: Math.round(base),
    nightPay: Math.round(night),
    holidayPay: Math.round(holiday),
    attendanceBonus,
    adjustments: Math.round(adj),
    advances: Math.round(advances),
    lateCount,
    absentCount,
  };
  r.netPay = r.basePay + r.nightPay + r.holidayPay + r.attendanceBonus + r.adjustments - r.advances;
  return r;
}

/** Chia một khoản (thưởng ca, tip chung) theo số phút được trả của từng người — dư làm tròn dồn cho người làm nhiều nhất. */
export function splitByMinutes(amount, people) {
  const total = people.reduce((s, p) => s + p.minutes, 0);
  if (!total) return people.map((p) => ({ ...p, share: 0 }));
  const out = people.map((p) => ({ ...p, share: Math.floor((amount * p.minutes) / total) }));
  const rest = amount - out.reduce((s, p) => s + p.share, 0);
  out.reduce((a, b) => (b.minutes > a.minutes ? b : a)).share += rest;
  return out;
}

/** PIN 4–6 chữ số, không phải dãy dễ đoán. → null nếu hợp lệ, hoặc câu báo lỗi. */
export function pinProblem(pin) {
  const s = String(pin ?? '');
  if (!/^\d{4,6}$/.test(s)) return 'PIN gồm 4 đến 6 chữ số';
  if (/^(\d)\1+$/.test(s)) return 'PIN không được lặp một chữ số (như 0000)';
  const up = '01234567890';
  const down = '09876543210';
  if (up.includes(s) || down.includes(s)) return 'PIN không được là dãy liên tiếp (như 1234)';
  return null;
}

export const ISSUE_LABEL = {
  OPEN: 'Chưa chấm ra',
  EXTRA: 'Làm ngoài giờ lịch — chờ duyệt làm thêm',
  OFF_SCHEDULE: 'Không có lịch (làm thay / đổi ca) — chờ xác nhận',
  AUTO_CLOSED: 'Quên chấm ra (máy tự đóng / người khác chấm ra hộ)',
  DISPUTED: 'Người đóng ca báo không có mặt',
  EMPLOYEE_DISPUTE: 'Nhân viên báo sai giờ',
};
