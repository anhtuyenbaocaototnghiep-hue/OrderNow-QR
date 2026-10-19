// FEATURE-035 Chấm công, lịch làm, năng suất (ADR-006 D-25).
// Tự động: đăng nhập → vào ca (nhân viên, trưởng ca); đăng xuất / đóng ca (sp_CloseShift) / token hết hạn (job) → ra ca.
// Sửa tay: bắt buộc lý do; trưởng ca chỉ sửa bản ghi TRONG NGÀY (giờ VN), quản lý sửa mọi ngày; mọi lần sửa có nhật ký thao tác.
import { config } from '../config.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import * as attendanceRepo from '../repositories/attendanceRepo.js';
import * as usersRepo from '../repositories/usersRepo.js';
import { addDays, todayVn, vnDayStartUtc } from '../utils/time.js';

export const LATE_MINUTES = 15;
const VN_OFFSET_MS = 7 * 3600 * 1000;
const vnDate = (d) => new Date(new Date(d).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

/** '8h' | '45m' | '3600' (giây) → số giờ (thời hạn token). */
export function ttlHours(spec = config.jwtExpiresIn) {
  const m = /^(\d+(?:\.\d+)?)\s*([smhd]?)$/.exec(String(spec).trim());
  if (!m) return 8;
  const n = Number(m[1]);
  return { s: n / 3600, m: n / 60, h: n, d: n * 24, '': n / 3600 }[m[2]];
}

/** Đăng nhập: chấm công vào cho nhân viên / trưởng ca (quản lý chủ quán không tự chấm — có thể thêm tay). */
export async function onLogin(user) {
  if (user.role === 'ADMIN') return null;
  return attendanceRepo.clockIn(user.userId);
}

export const onLogout = (user) => attendanceRepo.clockOut(user.userId);

/** Job: đóng bản ghi mở quá thời hạn token (quên đăng xuất). */
export const autoClose = async () => ({ closed: await attendanceRepo.autoClose(ttlHours()) });

export const list = (filter) => attendanceRepo.list(filter);
export const mine = (user) => attendanceRepo.openFor(user.userId);

function assertCanEdit(user, clockIns) {
  if (user.role === 'ADMIN') return;
  const today = todayVn();
  if (clockIns.some((d) => vnDate(d) !== today)) {
    throw forbidden('Trưởng ca chỉ sửa chấm công trong ngày hôm nay — ngày khác nhờ quản lý', 'ATTENDANCE_NOT_TODAY');
  }
}

function assertTimes(clockIn, clockOut) {
  if (clockIn > new Date(Date.now() + 60_000)) throw badRequest('VALIDATION_ERROR', 'Giờ vào không được ở tương lai');
  if (clockOut && clockOut < clockIn) throw badRequest('VALIDATION_ERROR', 'Giờ ra phải sau giờ vào');
  if (clockOut && clockOut > new Date(Date.now() + 60_000)) throw badRequest('VALIDATION_ERROR', 'Giờ ra không được ở tương lai');
  if (clockOut && clockOut - clockIn > 24 * 3600_000) throw badRequest('VALIDATION_ERROR', 'Một lần chấm công không quá 24 giờ');
}

export async function update(id, { clockIn, clockOut, reason }, user) {
  const att = await attendanceRepo.getById(id);
  if (!att) throw notFound('Không tìm thấy bản ghi chấm công');
  assertTimes(clockIn, clockOut);
  assertCanEdit(user, [att.clockIn, clockIn]);
  if (await attendanceRepo.overlaps(att.user.userId, clockIn, clockOut, id)) {
    throw conflict('ATTENDANCE_OVERLAP', 'Trùng thời gian với một lần chấm công khác của người này');
  }
  return attendanceRepo.update(id, { clockIn, clockOut, reason, editedBy: user.userId });
}

export async function createManual({ userId, clockIn, clockOut, reason }, user) {
  const target = await usersRepo.findById(userId);
  if (!target) throw notFound('Không tìm thấy tài khoản');
  assertTimes(clockIn, clockOut);
  assertCanEdit(user, [clockIn]);
  if (await attendanceRepo.overlaps(userId, clockIn, clockOut)) {
    throw conflict('ATTENDANCE_OVERLAP', 'Trùng thời gian với một lần chấm công khác của người này');
  }
  return attendanceRepo.createManual({ userId, clockIn, clockOut, reason, editedBy: user.userId });
}

// ---- Lịch làm ----
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Lịch làm trong khoảng ngày + trạng thái đi làm: ON_TIME | LATE (> 15 phút) | ABSENT (đã qua giờ, chưa chấm) | UPCOMING. */
export async function rosters(from, to) {
  const [list, firsts] = await Promise.all([attendanceRepo.rosters(from, to), attendanceRepo.firstClockIns(from, to)]);
  const firstIn = new Map(firsts.map((f) => [`${f.userId}|${f.date}`, new Date(f.firstIn)]));
  const now = Date.now();
  return list.map((r) => {
    const start = vnDayStartUtc(r.workDate).getTime() + minutesOf(r.startTime) * 60_000;
    const inAt = firstIn.get(`${r.user.userId}|${r.workDate}`);
    let status = 'UPCOMING';
    let lateMinutes = 0;
    if (inAt) {
      lateMinutes = Math.max(0, Math.round((inAt.getTime() - start) / 60_000));
      status = lateMinutes > LATE_MINUTES ? 'LATE' : 'ON_TIME';
    } else if (now > start + LATE_MINUTES * 60_000) {
      status = 'ABSENT';
    }
    return { ...r, firstClockIn: inAt ?? null, lateMinutes, status };
  });
}

export async function saveRoster(id, body, user) {
  const target = await usersRepo.findById(body.userId);
  if (!target) throw notFound('Không tìm thấy tài khoản');
  const r = await attendanceRepo.saveRoster(id, { ...body, createdBy: user.userId });
  if (!r) throw notFound('Không tìm thấy ca trong lịch');
  return r;
}

export async function removeRoster(id) {
  if (!(await attendanceRepo.deleteRoster(id))) throw notFound('Không tìm thấy ca trong lịch');
  return 'DELETED';
}

/** Chép lịch tuần (7 ngày từ `fromWeek`) sang tuần bắt đầu `toWeek`; bỏ qua ca đã có (cùng người, ngày, giờ bắt đầu). */
export async function copyWeek(fromWeek, toWeek, user) {
  const src = await attendanceRepo.rosters(fromWeek, addDays(fromWeek, 6));
  const dst = await attendanceRepo.rosters(toWeek, addDays(toWeek, 6));
  const shift = Math.round((Date.parse(toWeek) - Date.parse(fromWeek)) / 86400000);
  const have = new Set(dst.map((r) => `${r.user.userId}|${r.workDate}|${r.startTime}`));
  let created = 0;
  for (const r of src) {
    const workDate = addDays(r.workDate, shift);
    if (have.has(`${r.user.userId}|${workDate}|${r.startTime}`)) continue;
    await attendanceRepo.saveRoster(null, {
      userId: r.user.userId,
      workDate,
      startTime: r.startTime,
      endTime: r.endTime,
      note: r.note,
      createdBy: user.userId,
    });
    created += 1;
  }
  return { created };
}

export const productivity = (fromUtc, toUtc) => attendanceRepo.productivity(fromUtc, toUtc);
