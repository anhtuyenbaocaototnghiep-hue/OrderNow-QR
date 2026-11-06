// F-072 chấm công nhiều người + F-073 tính lương (ADR-030); nhắc chấm công, báo quên chấm công, đặt PIN ở màn chung (ADR-031).
//  - payrollRouter (gắn thẳng /api, nhân viên): PIN của mình, Đổi người, màn chấm công, nhắc chấm công, danh sách đóng ca, Giờ công của tôi.
//  - payrollAdminRouter (gắn dưới /api/admin, chỉ quản lý): cách chấm công, bảng lương, hồ sơ lương, ngày lễ, quyết định, báo sai,
//    báo quên chấm công, báo cáo tuần.
import express from 'express';
import { z } from 'zod';
import { BANKS } from '../domain/vietqr.js';
import { requireStaff } from '../middleware/auth.js';
import { paramId, parse, zId, zMoney, zText } from '../middleware/validate.js';
import * as attendanceService from '../services/attendanceService.js';
import * as payrollService from '../services/payrollService.js';
import * as pinService from '../services/pinService.js';
import { getSettings, updateSettings } from '../services/settingsService.js';
import * as userService from '../services/userService.js';
import { isValidDate } from '../utils/time.js';

export const payrollRouter = express.Router();
export const payrollAdminRouter = express.Router();

const zMonth = () => z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng phải có dạng YYYY-MM');
const zIsoDate = () =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
    .refine(isValidDate, 'Ngày không hợp lệ');
const monthParam = (req) => parse(z.object({ month: zMonth() }), req.params).month;
const zInstant = () => z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const zPassword = () => z.string().min(1, 'Nhập mật khẩu đăng nhập').max(100);

// ---- Nhân viên ----
payrollRouter.post('/auth/pin', requireStaff, async (req, res) => {
  const body = parse(z.object({ password: zPassword(), pin: z.string().max(10) }), req.body);
  res.json(await pinService.setOwnPin(req.user, body));
});
// ADR-031 D-135: ở màn chấm công chung — người chưa có / quên PIN đặt PIN bằng mật khẩu đăng nhập của mình
payrollRouter.post('/auth/pin/kiosk', requireStaff, async (req, res) => {
  const { userId, ...body } = parse(z.object({ userId: zId(), password: zPassword(), pin: z.string().max(10) }), req.body);
  res.json(await pinService.setPinAtKiosk(userId, body, { ip: req.ip }));
});
payrollRouter.post('/auth/switch', requireStaff, async (req, res) => {
  const body = parse(z.object({ userId: zId(), pin: z.string().max(10) }), req.body);
  res.json(await userService.switchTo(body.userId, body.pin, req.user));
});
payrollRouter.get('/attendance/board', requireStaff, async (_req, res) =>
  res.json({ mode: (await getSettings()).attendanceMode, people: await attendanceService.board() }),
);
payrollRouter.post('/attendance/punch', requireStaff, async (req, res) => {
  const body = parse(z.object({ userId: zId(), pin: z.string().max(10), action: z.enum(['IN', 'OUT']) }), req.body);
  res.json(await attendanceService.punch(body, req.user));
});
payrollRouter.get('/attendance/shift/:id', requireStaff, async (req, res) => res.json(await attendanceService.shiftBoard(paramId(req), req.user)));
payrollRouter.get('/attendance/reminders', requireStaff, async (_req, res) => res.json({ items: await attendanceService.reminders() }));

payrollRouter.get('/me/attendance', requireStaff, async (req, res) => {
  const { month } = parse(z.object({ month: zMonth().optional() }), req.query);
  res.json(await payrollService.mine(req.user, month));
});
payrollRouter.post('/me/attendance/:id/dispute', requireStaff, async (req, res) => {
  const { note } = parse(z.object({ note: zText(300).min(3, 'Ghi rõ sai ở đâu (giờ vào / giờ ra đúng là mấy giờ)') }), req.body);
  res.status(201).json(await attendanceService.dispute(paramId(req), note, req.user));
});
payrollRouter.post('/me/missed-punches', requireStaff, async (req, res) => {
  const body = parse(
    z.object({
      clockIn: zInstant(),
      clockOut: zInstant(),
      note: zText(300).min(3, 'Ghi lý do quên (ví dụ: vào ca vội, quên bấm Chấm công)'),
    }),
    req.body,
  );
  res.status(201).json(await attendanceService.reportMissed(body, req.user));
});
payrollRouter.post('/me/payslips/:month/ack', requireStaff, async (req, res) => res.json(await payrollService.ackPayslip(req.user, monthParam(req))));

// ---- Quản lý ----
payrollAdminRouter.get('/attendance-settings', async (_req, res) => {
  const s = await getSettings();
  res.json({ attendanceMode: s.attendanceMode, moneyPin: s.moneyPin });
});
payrollAdminRouter.put('/attendance-settings', async (req, res) => {
  const body = parse(z.object({ attendanceMode: z.enum(['KIOSK', 'LOGIN']), moneyPin: z.boolean() }), req.body);
  await updateSettings(body);
  res.json(body);
});
payrollAdminRouter.post('/users/:id/pin-reset', async (req, res) => res.json(await pinService.resetPin(paramId(req))));

payrollAdminRouter.get('/payroll', async (req, res) => {
  const { month } = parse(z.object({ month: zMonth() }), req.query);
  res.json(await payrollService.get(month));
});
payrollAdminRouter.post('/payroll/:month/lock', async (req, res) => res.json(await payrollService.lock(monthParam(req), req.user)));
payrollAdminRouter.post('/payroll/:month/reopen', async (req, res) => {
  const { reason } = parse(z.object({ reason: zText(200).min(3, 'Nhập lý do mở lại') }), req.body);
  res.json(await payrollService.reopen(monthParam(req), reason, req.user));
});
payrollAdminRouter.post('/payroll/:month/adjustments', async (req, res) => {
  const body = parse(
    z.object({
      userId: zId(),
      amount: z
        .number()
        .int()
        .refine((v) => v !== 0 && Math.abs(v) <= 100_000_000, 'Số tiền khác 0, tối đa 100 triệu'),
      reason: zText(200).min(3, 'Nhập lý do'),
    }),
    req.body,
  );
  res.status(201).json(await payrollService.addAdjustment({ month: monthParam(req), ...body }, req.user));
});
payrollAdminRouter.delete('/payroll/adjustments/:id', async (req, res) => res.json({ result: await payrollService.removeAdjustment(paramId(req)) }));
payrollAdminRouter.post('/payroll/team-bonus', async (req, res) => {
  const body = parse(z.object({ shiftId: zId(), amount: zMoney().min(1000, 'Tối thiểu 1.000đ'), reason: zText(150).min(3, 'Nhập lý do') }), req.body);
  res.status(201).json(await payrollService.teamBonus(body, req.user));
});
payrollAdminRouter.get('/payroll/:month/lines/:userId/qr', async (req, res) => {
  const { userId } = parse(z.object({ userId: zId() }), req.params);
  res.json(await payrollService.payQr(monthParam(req), userId));
});
payrollAdminRouter.post('/payroll/:month/lines/:userId/paid', async (req, res) => {
  const { userId } = parse(z.object({ userId: zId() }), req.params);
  const { method } = parse(z.object({ method: z.enum(['CASH', 'TRANSFER']) }), req.body);
  res.json(await payrollService.markPaid(monthParam(req), userId, method, req.user));
});
payrollAdminRouter.get('/payroll-week', async (req, res) => {
  const { from } = parse(z.object({ from: zIsoDate() }), req.query);
  res.json(await payrollService.weekReport(from));
});

payrollAdminRouter.get('/pay-profiles', async (_req, res) => res.json({ profiles: await payrollService.profiles(), banks: BANKS }));
payrollAdminRouter.put('/pay-profiles/:id', async (req, res) => {
  const money = () => zMoney().max(100_000_000);
  const body = parse(
    z.object({
      payType: z.enum(['HOURLY', 'MONTHLY']),
      hourlyRate: money().default(0),
      monthlySalary: money().default(0),
      nightAllowance: money().default(0),
      nightStart: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải có dạng HH:MM')
        .default('18:00'),
      holidayMultiplier: z.number().min(1, 'Hệ số từ 1').max(5, 'Hệ số tối đa 5').default(3),
      attendanceBonus: money().default(0),
      bankBin: z
        .string()
        .regex(/^\d{6}$/)
        .nullable()
        .optional(),
      bankAccount: z
        .string()
        .regex(/^[0-9A-Za-z]{4,19}$/, 'Số tài khoản 4–19 ký tự chữ / số')
        .nullable()
        .optional(),
      bankAccountName: zText(100).nullable().optional(),
    }),
    req.body,
  );
  res.json(await payrollService.saveProfile(paramId(req), body, req.user));
});

payrollAdminRouter.get('/holidays', async (req, res) => {
  const { year } = parse(z.object({ year: z.coerce.number().int().min(2020).max(2100) }), req.query);
  res.json(await payrollService.holidays(year));
});
payrollAdminRouter.put('/holidays/:date', async (req, res) => {
  const { date } = parse(z.object({ date: zIsoDate() }), req.params);
  const { name } = parse(z.object({ name: zText(100).min(1, 'Nhập tên ngày lễ') }), req.body);
  await payrollService.saveHoliday(date, name);
  res.json({ date, name });
});
payrollAdminRouter.delete('/holidays/:date', async (req, res) => {
  const { date } = parse(z.object({ date: zIsoDate() }), req.params);
  res.json({ result: await payrollService.removeHoliday(date) });
});

payrollAdminRouter.post('/attendance/:id/decision', async (req, res) => {
  const body = parse(z.object({ decision: z.enum(['ACTUAL', 'SCHEDULE', 'NONE']).nullable(), note: zText(200).optional().nullable() }), req.body);
  res.json(await attendanceService.decide(paramId(req), body, req.user));
});
payrollAdminRouter.get('/attendance-disputes', async (req, res) => {
  const { month } = parse(z.object({ month: zMonth() }), req.query);
  res.json(await payrollService.disputesForMonth(month));
});
payrollAdminRouter.post('/attendance-disputes/:id/resolve', async (req, res) => {
  const { resolution } = parse(z.object({ resolution: zText(200).min(3, 'Ghi cách xử lý') }), req.body);
  res.json(await attendanceService.resolveDispute(paramId(req), resolution, req.user));
});

// ADR-031 D-137: duyệt (có thể sửa giờ) → tạo lần chấm công ghi người duyệt; từ chối phải có lý do
payrollAdminRouter.post('/missed-punches/:id/approve', async (req, res) => {
  const body = parse(z.object({ clockIn: zInstant().optional(), clockOut: zInstant().optional(), note: zText(200).optional().nullable() }), req.body ?? {});
  res.json(await attendanceService.resolveMissed(paramId(req), { approve: true, ...body }, req.user));
});
payrollAdminRouter.post('/missed-punches/:id/reject', async (req, res) => {
  const { reason } = parse(z.object({ reason: zText(200).min(3, 'Ghi lý do từ chối — nhân viên thấy dòng này') }), req.body);
  res.json(await attendanceService.resolveMissed(paramId(req), { approve: false, note: reason }, req.user));
});
