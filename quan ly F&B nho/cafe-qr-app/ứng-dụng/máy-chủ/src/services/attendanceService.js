// FEATURE-035 Chấm công, lịch làm, năng suất (ADR-006 D-25).
// Chế độ `attendance.mode` (F-072, ADR-030 D-124):
//  - KIOSK (mặc định): ai cũng chấm vào / ra ở màn chấm công chung bằng PIN riêng; đăng nhập / đăng xuất KHÔNG chấm công;
//    người đóng ca chấm ra hộ người quên (cần quản lý xem lại) và đánh dấu có mặt / báo không có mặt; mở quá 14 giờ → tự đóng ở 8 giờ.
//  - LOGIN (cũ): đăng nhập → vào ca (nhân viên, trưởng ca); đăng xuất / đóng ca (sp_CloseShift) / token hết hạn (job) → ra ca.
// Sửa tay: bắt buộc lý do; trưởng ca chỉ sửa bản ghi TRONG NGÀY (giờ VN) và không sửa của chính mình (F-071), quản lý sửa mọi ngày;
// mọi lần sửa có nhật ký thao tác.
import { config } from '../config.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import * as attendanceRepo from '../repositories/attendanceRepo.js';
import * as payrollRepo from '../repositories/payrollRepo.js';
import * as usersRepo from '../repositories/usersRepo.js';
import { addDays, todayVn, vnDayStartUtc } from '../utils/time.js';
import { verifyPin } from './pinService.js';
import { getSettings } from './settingsService.js';

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

const kioskMode = async () => (await getSettings()).attendanceMode === 'KIOSK';

/** Đăng nhập (chế độ LOGIN): chấm công vào cho nhân viên / trưởng ca (quản lý chủ quán không tự chấm — có thể thêm tay). */
export async function onLogin(user) {
  if (user.role === 'ADMIN' || (await kioskMode())) return null;
  return attendanceRepo.clockIn(user.userId);
}

export const onLogout = async (user) => ((await kioskMode()) ? 0 : attendanceRepo.clockOut(user.userId));

/** Job: LOGIN — đóng bản ghi mở quá thời hạn token (quên đăng xuất); KIOSK — mở quá 14 giờ → đóng ở 8 giờ, cần xem lại. */
export const autoClose = async () => ({
  closed: (await kioskMode()) ? await attendanceRepo.autoCloseKiosk(14, 8) : await attendanceRepo.autoClose(ttlHours()),
});

/** F-073: tháng đã chốt lương thì không sửa giờ công của tháng đó (mở lại bảng lương trước). */
async function assertMonthOpen(...dates) {
  for (const d of dates.filter(Boolean)) {
    const month = vnDate(d).slice(0, 7);
    if (await payrollRepo.isLocked(month)) {
      throw conflict('PAYROLL_LOCKED', `Lương tháng ${month.slice(5)}/${month.slice(0, 4)} đã chốt — quản lý mở lại bảng lương trước khi sửa giờ công`);
    }
  }
}

export const list = (filter) => attendanceRepo.list(filter);
export const mine = (user) => attendanceRepo.openFor(user.userId);

function assertCanEdit(user, clockIns) {
  if (user.role === 'ADMIN') return;
  const today = todayVn();
  if (clockIns.some((d) => vnDate(d) !== today)) {
    throw forbidden('Trưởng ca chỉ sửa chấm công trong ngày hôm nay — ngày khác nhờ quản lý', 'ATTENDANCE_NOT_TODAY');
  }
}

/** F-071 (ADR-029 D-119): không ai tự sửa / tự thêm chấm công của chính mình — trưởng ca nhờ quản lý (quản lý chủ quán thì được). */
function assertNotSelf(user, userId) {
  if (user.role !== 'ADMIN' && userId === user.userId) {
    throw forbidden('Không tự sửa chấm công của chính mình — nhờ quản lý sửa giúp', 'ATTENDANCE_SELF_EDIT');
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
  assertNotSelf(user, att.user.userId);
  assertTimes(clockIn, clockOut);
  await assertMonthOpen(att.clockIn, clockIn);
  assertCanEdit(user, [att.clockIn, clockIn]);
  if (await attendanceRepo.overlaps(att.user.userId, clockIn, clockOut, id)) {
    throw conflict('ATTENDANCE_OVERLAP', 'Trùng thời gian với một lần chấm công khác của người này');
  }
  return attendanceRepo.update(id, { clockIn, clockOut, reason, editedBy: user.userId });
}

export async function createManual({ userId, clockIn, clockOut, reason }, user) {
  const target = await usersRepo.findById(userId);
  if (!target) throw notFound('Không tìm thấy tài khoản');
  assertNotSelf(user, userId);
  assertTimes(clockIn, clockOut);
  await assertMonthOpen(clockIn);
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

// ---- F-072 (ADR-030 D-124…D-129): màn chấm công chung, đóng ca, quyết định trả lương, báo sai ----

/** Màn chấm công: người đang hoạt động (trừ quản lý), đã đặt PIN chưa, đang làm từ lúc nào, lịch hôm nay. */
export async function board() {
  const today = todayVn();
  const [users, open, rosters] = await Promise.all([
    usersRepo.list(),
    attendanceRepo.list({ fromUtc: new Date(Date.now() - 36 * 3600e3), toUtc: new Date(Date.now() + 60e3) }),
    attendanceRepo.rosters(today, today),
  ]);
  const since = new Map(open.filter((a) => !a.clockOut).map((a) => [a.user.userId, a.clockIn]));
  return users
    .filter((u) => u.isActive && u.role !== 'ADMIN')
    .map((u) => ({
      userId: u.userId,
      fullName: u.fullName,
      role: u.role,
      hasPin: u.hasPin,
      workingSince: since.get(u.userId) ?? null,
      roster: rosters.filter((r) => r.user.userId === u.userId).map((r) => `${r.startTime}–${r.endTime}`),
    }));
}

/** Chấm vào / ra ở màn chung: người bấm nhập PIN của chính mình (actor = phiên đang mở trên máy quầy). */
export async function punch({ userId, pin, action }, actor) {
  if (!(await kioskMode())) throw conflict('KIOSK_OFF', 'Quán đang chấm công theo đăng nhập — quản lý đổi cách chấm công ở trang Nhân sự');
  const target = await usersRepo.findById(userId);
  if (!target || !target.isActive || target.role === 'ADMIN') throw notFound('Không tìm thấy nhân viên');
  await verifyPin(target, pin, actor);
  if (action === 'IN') {
    const att = await attendanceRepo.punchIn(userId);
    if (!att) throw conflict('ALREADY_IN', `${target.fullName} đang trong ca — bấm Ra ca nếu muốn kết thúc`);
    return att;
  }
  const att = await attendanceRepo.punchOut(userId);
  if (!att) throw conflict('NOT_IN', `${target.fullName} chưa vào ca`);
  return att;
}

/** Danh sách cho hộp đóng ca: các lần chấm công giao với ca (đánh dấu của chính người đóng ca). */
export async function shiftBoard(shiftId, user) {
  const rows = await attendanceRepo.forShift(shiftId);
  return { mode: (await getSettings()).attendanceMode, rows: rows.map((a) => ({ ...a, self: a.user.userId === user.userId })) };
}

/** Sau khi đóng ca: chấm ra hộ người quên + đánh dấu có mặt / báo không có mặt (bỏ qua bản ghi của chính người đóng ca). */
export async function applyShiftClose({ clockOut = [], present = [], absent = [] } = {}, closer) {
  if (!(await kioskMode())) return { closed: 0, checked: 0, disputed: 0 };
  return {
    closed: await attendanceRepo.closeByOther(clockOut, closer.userId),
    checked: await attendanceRepo.check(present, 'OK', closer.userId),
    disputed: await attendanceRepo.check(absent, 'DISPUTED', closer.userId),
  };
}

/** Quản lý quyết định trả lương cho một lần chấm công: ACTUAL (giờ thật) / SCHEDULE (theo lịch) / NONE (không tính) / null (bỏ). */
export async function decide(id, { decision, note }, user) {
  const att = await attendanceRepo.getById(id);
  if (!att) throw notFound('Không tìm thấy bản ghi chấm công');
  if (!att.clockOut) throw conflict('ATTENDANCE_OPEN', 'Người này chưa chấm ra — chấm ra hoặc sửa giờ ra trước');
  await assertMonthOpen(att.clockIn);
  return attendanceRepo.decide(id, { decision, note, by: user.userId });
}

/** Nhân viên báo sai một lần chấm công của chính mình. */
export async function dispute(attId, note, user) {
  const att = await attendanceRepo.getById(attId);
  if (!att || att.user.userId !== user.userId) throw notFound('Không tìm thấy lần chấm công của bạn');
  await assertMonthOpen(att.clockIn);
  const open = await attendanceRepo.disputes({ attIds: [attId], openOnly: true });
  if (open.length) throw conflict('DISPUTE_OPEN', 'Bạn đã báo sai lần chấm công này — chờ quản lý xử lý');
  return { disputeId: await attendanceRepo.addDispute({ attId, userId: user.userId, note }) };
}

export async function resolveDispute(id, resolution, user) {
  if (!(await attendanceRepo.resolveDispute(id, { resolution, by: user.userId }))) throw notFound('Không tìm thấy báo sai đang chờ');
  return { resolved: true };
}
