// F-073 — tính lương từ chấm công (ADR-030 D-130…D-134). SQL Server thật.
// Kịch bản tháng trước (M) cho "Nguyễn Thu Hà", lương 25.000đ/giờ, phụ cấp tối 5.000đ/giờ từ 18:00, lễ ×3, chuyên cần 200.000đ:
//   D1 lịch 08–14, chấm 07:50–14:05 → tính 08:00–14:00 = 360 phút (sớm 10 + muộn 5 phút: không tính, không phải duyệt)
//   D2 lịch 17–22, chấm 17:20–22:40 → đi trễ; dư 40 phút → chờ duyệt làm thêm → quản lý "tính giờ thật" = 320 phút (đêm 280)
//   D3 (ngày lễ) lịch 08–12, chấm 08–12 = 240 phút lễ
//   D4 lịch 08–12, không đi → vắng
//   D5 không lịch, chấm 09–11 → chờ xác nhận → quản lý "không tính"
//   Cộng: 920 phút → lương 383.333 + đêm 23.333 + lễ 200.000 + thưởng 100.000 − khấu trừ 20.000 = 686.666 (trễ + vắng → không chuyên cần)
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let app, api, pool, admin, staff, lead, thuha, users, cats, vietqr, flushAudit;
const call = (token, method, path, body, headers = {}) => {
  const req = api[method](path).set(auth(token)).set(headers);
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const q1 = async (text) => (await pool.request().query(text)).recordset;
const login = async (username, password = 'Pass@123') => ok(await api.post('/api/auth/login').send({ username, password })).accessToken;
const prevMonth = (() => {
  const d = new Date(`${todayVn().slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
})();
const M = prevMonth;
const day = (n) => `${M}-${String(n).padStart(2, '0')}`;
const vn = (date, hhmm) => new Date(`${date}T${hhmm}:00+07:00`).toISOString();
const att = {};
const HA_PROFILE = { payType: 'HOURLY', hourlyRate: 25_000, nightAllowance: 5_000, nightStart: '18:00', holidayMultiplier: 3, attendanceBonus: 200_000 };

async function manual(user, date, from, to, reason = 'nhập công tháng trước') {
  return ok(await call(admin, 'post', '/api/attendance', { userId: users[user], clockIn: vn(date, from), clockOut: vn(date, to), reason }), 201).attId;
}
const roster = async (user, date, startTime, endTime) =>
  ok(await call(admin, 'post', '/api/admin/rosters', { userId: users[user], workDate: date, startTime, endTime }), 201);
const payroll = async (month = M) => ok(await call(admin, 'get', `/api/admin/payroll?month=${month}`));
const lineOf = (p, user) => p.lines.find((l) => l.userId === users[user]);

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  for (const [u, role, name] of [
    ['thuha', 'STAFF', 'Nguyễn Thu Hà'],
    ['baohb', 'STAFF', 'Trần Hoàng Bảo'],
    ['lead1', 'MANAGER', 'Trưởng ca Minh'],
    ['lead2', 'MANAGER', 'Trưởng ca Lan'],
  ])
    ok(await call(admin, 'post', '/api/admin/users', { username: u, password: 'Pass@123', fullName: name, role }), 201);
  users = Object.fromEntries((await q1('SELECT UserId, Username FROM dbo.Users')).map((u) => [u.Username, u.UserId]));
  staff = await app.login('staff1', 'Staff@123');
  lead = await login('lead1');
  thuha = await login('thuha');
  cats = Object.fromEntries((await call(staff, 'get', '/api/cash-categories')).body.map((c) => [c.name, c.categoryId]));
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 1_000_000 }), 201);
  vietqr = await import('../src/domain/vietqr.js');
  ({ flushAudit } = await import('../src/middleware/audit.js'));
});

after(() => app?.close());

describe('Hàm thuần (F-073)', () => {
  test('AC-073-01 (unit): VietQR đúng chuẩn (trường, CRC-16), nội dung chuyển khoản không dấu ≤ 25 ký tự; tiền công đêm / lễ; dòng lương theo giờ / theo tháng', async () => {
    const { crc16, transferContent, vietQrPayload } = vietqr;
    assert.equal(crc16('123456789'), '29B1', 'giá trị kiểm chuẩn CRC-16/CCITT-FALSE');
    assert.equal(transferContent('Lương tháng 10 — Nguyễn Thu Hà!'), 'LUONG THANG 10 NGUYEN THU');
    const p = vietQrPayload({ bin: '970422', account: '0123456789', amount: 65000, content: 'BAN 5' });
    assert.equal(p, '00020101021238540010A00000072701240006970422011001234567890208QRIBFTTA53037045405650005802VN62090805BAN 563042C12');
    assert.ok(vietQrPayload({ bin: '970436', account: '1234', amount: 0 }).startsWith('000201010211'), 'không số tiền → mã cố định');
    assert.throws(() => vietQrPayload({ bin: '12', account: '1234' }), /VIETQR_ACCOUNT_INVALID/);

    const { payLine, evaluate } = await import('../src/domain/payroll.js');
    const ev = (d, a, b, decision = null) => evaluate({ clockIn: vn(d, a), clockOut: vn(d, b), payDecision: decision }, null);
    const hourly = payLine({
      profile: HA_PROFILE,
      evaluations: [ev('2026-09-02', '17:00', '23:00', 'ACTUAL'), ev('2026-09-02', '08:00', '12:00', 'ACTUAL')],
      holidays: new Set(['2026-09-02']),
      advances: 50_000,
      adjustments: [{ amount: 30_000 }],
    });
    // 600 phút: lương 250.000; đêm 18–23 = 300 phút → 25.000; lễ cả 600 phút × 25.000 × 2 = 500.000; trễ / vắng 0 → chuyên cần
    assert.deepEqual(
      [hourly.minutes, hourly.basePay, hourly.nightPay, hourly.holidayPay, hourly.attendanceBonus, hourly.netPay],
      [600, 250_000, 25_000, 500_000, 200_000, 250_000 + 25_000 + 500_000 + 200_000 + 30_000 - 50_000],
    );
    const monthly = payLine({
      profile: { ...HA_PROFILE, payType: 'MONTHLY', monthlySalary: 6_240_000, hourlyRate: 0 },
      evaluations: [ev('2026-09-03', '08:00', '12:00', 'ACTUAL')],
      absentCount: 1,
    });
    assert.deepEqual([monthly.basePay, monthly.attendanceBonus], [6_240_000, 0], 'lương tháng giữ nguyên; vắng → không chuyên cần');
  });
});

describe('Tính lương từ chấm công (F-073)', () => {
  test('AC-073-02: hồ sơ lương (kiểm số liệu, ngân hàng trong danh sách), ngày lễ; nhân viên / trưởng ca không vào được bảng lương', async () => {
    const put = (user, body) => call(admin, 'put', `/api/admin/pay-profiles/${users[user]}`, body);
    assert.equal((await put('thuha', { payType: 'HOURLY', hourlyRate: 0 })).status, 400);
    assert.equal((await put('thuha', { ...HA_PROFILE, bankAccount: '0123456789' })).status, 400, 'có số tài khoản phải chọn ngân hàng');
    assert.equal((await put('thuha', { ...HA_PROFILE, bankBin: '999999', bankAccount: '0123456789' })).status, 400);
    const saved = ok(await put('thuha', HA_PROFILE));
    assert.deepEqual([saved.payType, saved.hourlyRate, saved.holidayMultiplier, saved.nightStart], ['HOURLY', 25_000, 3, '18:00']);
    const list = ok(await call(admin, 'get', '/api/admin/pay-profiles'));
    assert.ok(list.banks.some((b) => b.bin === '970422' && b.name === 'MB Bank'));
    ok(await call(admin, 'put', `/api/admin/holidays/${day(12)}`, { name: 'Ngày lễ thử' }));
    assert.deepEqual(ok(await call(admin, 'get', `/api/admin/holidays?year=${M.slice(0, 4)}`)), [{ date: day(12), name: 'Ngày lễ thử' }]);
    for (const t of [staff, lead]) {
      assert.equal((await call(t, 'get', `/api/admin/payroll?month=${M}`)).status, 403);
      assert.equal((await call(t, 'put', `/api/admin/pay-profiles/${users.thuha}`, HA_PROFILE)).status, 403);
    }
  });

  test('AC-073-03: bảng lương nháp — theo lịch, đến sớm không tính, đi trễ, làm thêm / ngoài lịch chờ quản lý, vắng; quyết định của quản lý; chưa xử lý hết thì không chốt (409)', async () => {
    await roster('thuha', day(10), '08:00', '14:00');
    await roster('thuha', day(11), '17:00', '22:00');
    await roster('thuha', day(12), '08:00', '12:00');
    await roster('thuha', day(13), '08:00', '12:00');
    att.d1 = await manual('thuha', day(10), '07:50', '14:05');
    att.d2 = await manual('thuha', day(11), '17:20', '22:40');
    att.d3 = await manual('thuha', day(12), '08:00', '12:00');
    att.d5 = await manual('thuha', day(14), '09:00', '11:00');

    let p = await payroll();
    assert.equal(p.status, 'DRAFT');
    assert.equal(p.monthEnded, true);
    assert.deepEqual(p.pending.map((x) => [x.code, x.attId]).sort(), [
      ['EXTRA', att.d2],
      ['OFF_SCHEDULE', att.d5],
    ]);
    const lock409 = await call(admin, 'post', `/api/admin/payroll/${M}/lock`);
    assert.deepEqual([lock409.status, lock409.body.code], [409, 'PAYROLL_PENDING']);
    assert.equal((await call(admin, 'post', `/api/admin/payroll/${todayVn().slice(0, 7)}/lock`)).body.code, 'MONTH_NOT_ENDED');

    ok(await call(admin, 'post', `/api/admin/attendance/${att.d2}/decision`, { decision: 'ACTUAL', note: 'ở lại dọn quầy' }));
    ok(await call(admin, 'post', `/api/admin/attendance/${att.d5}/decision`, { decision: 'NONE', note: 'không phải ca làm' }));
    assert.equal(
      (await call(lead, 'post', `/api/admin/attendance/${att.d5}/decision`, { decision: 'ACTUAL' })).status,
      403,
      'trưởng ca không quyết định trả lương',
    );
    ok(await call(admin, 'post', `/api/admin/payroll/${M}/adjustments`, { userId: users.thuha, amount: 100_000, reason: 'thưởng doanh số' }), 201);
    ok(await call(admin, 'post', `/api/admin/payroll/${M}/adjustments`, { userId: users.thuha, amount: -20_000, reason: 'làm vỡ ly' }), 201);

    p = await payroll();
    assert.deepEqual(p.pending, []);
    const l = lineOf(p, 'thuha');
    assert.deepEqual(
      [
        l.minutes,
        l.nightMinutes,
        l.holidayMinutes,
        l.basePay,
        l.nightPay,
        l.holidayPay,
        l.lateCount,
        l.absentCount,
        l.attendanceBonus,
        l.adjustments,
        l.netPay,
      ],
      [920, 280, 240, 383_333, 23_333, 200_000, 1, 1, 0, 80_000, 686_666],
    );
  });

  test('AC-073-04: nhân viên tự xem giờ công của mình (giờ được tính, ai sửa vì sao, quyết định), báo sai → việc chờ của quản lý → xử lý; không xem được của người khác', async () => {
    ok(
      await call(admin, 'put', `/api/attendance/${att.d3}`, { clockIn: vn(day(12), '08:00'), clockOut: vn(day(12), '12:00'), reason: 'xác nhận giờ ngày lễ' }),
    );
    await flushAudit(); // nhật ký thao tác ghi sau khi trả response
    const mine = ok(await call(thuha, 'get', `/api/me/attendance?month=${M}`));
    assert.deepEqual(mine.records.map((r) => r.attId).sort(), [att.d1, att.d2, att.d3, att.d5].sort());
    const r2 = mine.records.find((r) => r.attId === att.d2);
    assert.deepEqual([r2.paidMinutes, r2.late, r2.decision, r2.roster], [320, true, 'ACTUAL', '17:00–22:00']);
    assert.ok(
      mine.records.find((r) => r.attId === att.d3).edits.some((e) => e.reason === 'xác nhận giờ ngày lễ'),
      JSON.stringify(mine.records.find((r) => r.attId === att.d3).edits),
    );
    assert.equal(mine.pay.status, 'DRAFT');
    assert.equal(mine.pay.netPay, 686_666);
    const other = ok(await call(staff, 'get', `/api/me/attendance?month=${M}`));
    assert.deepEqual([other.records.length, other.pay], [0, null], 'chỉ thấy của chính mình');

    ok(await call(thuha, 'post', `/api/me/attendance/${att.d1}/dispute`, { note: 'hôm đó em ra 14:30' }), 201);
    assert.equal((await call(thuha, 'post', `/api/me/attendance/${att.d1}/dispute`, { note: 'gửi lại lần nữa' })).body.code, 'DISPUTE_OPEN');
    assert.equal((await call(staff, 'post', `/api/me/attendance/${att.d1}/dispute`, { note: 'không phải của tôi' })).status, 404);
    const p = await payroll();
    assert.deepEqual(
      p.pending.map((x) => x.code),
      ['EMPLOYEE_DISPUTE'],
    );
    const [d] = ok(await call(admin, 'get', `/api/admin/attendance-disputes?month=${M}`));
    ok(await call(admin, 'post', `/api/admin/attendance-disputes/${d.disputeId}/resolve`, { resolution: 'xem camera: ra 14:05, giữ nguyên' }));
    assert.deepEqual((await payroll()).pending, []);
  });

  test('AC-073-05: chốt lương → lưu từng dòng, khóa sửa giờ công / quyết định / cộng trừ của tháng (409 PAYROLL_LOCKED); nhân viên bấm "Đã xem"; mở lại phải có lý do; chốt lại giữ trạng thái đã trả', async () => {
    const locked = ok(await call(admin, 'post', `/api/admin/payroll/${M}/lock`));
    assert.equal(locked.status, 'LOCKED');
    assert.equal(lineOf(locked, 'thuha').netPay, 686_666);
    const edit = await call(admin, 'put', `/api/attendance/${att.d1}`, { clockIn: vn(day(10), '08:00'), clockOut: vn(day(10), '14:00'), reason: 'sửa' });
    assert.deepEqual([edit.status, edit.body.code], [409, 'PAYROLL_LOCKED']);
    assert.equal((await call(admin, 'post', `/api/admin/attendance/${att.d5}/decision`, { decision: 'ACTUAL' })).body.code, 'PAYROLL_LOCKED');
    assert.equal(
      (await call(admin, 'post', `/api/admin/payroll/${M}/adjustments`, { userId: users.thuha, amount: 1000, reason: 'thêm' })).body.code,
      'PAYROLL_LOCKED',
    );
    assert.equal((await call(thuha, 'post', `/api/me/attendance/${att.d2}/dispute`, { note: 'sai giờ' })).body.code, 'PAYROLL_LOCKED');

    ok(await call(thuha, 'post', `/api/me/payslips/${M}/ack`));
    const mine = ok(await call(thuha, 'get', `/api/me/attendance?month=${M}`));
    assert.deepEqual([mine.pay.status, Boolean(mine.pay.ackAt), mine.payslipMonths], ['LOCKED', true, [M]]);

    ok(await call(admin, 'post', `/api/admin/payroll/${M}/lines/${users.thuha}/paid`, { method: 'CASH' }));
    assert.equal((await call(admin, 'post', `/api/admin/payroll/${M}/lines/${users.thuha}/paid`, { method: 'CASH' })).body.code, 'PAY_NOT_ALLOWED');
    assert.equal((await call(admin, 'post', `/api/admin/payroll/${M}/reopen`, {})).status, 400, 'mở lại phải có lý do');
    const reopened = ok(await call(admin, 'post', `/api/admin/payroll/${M}/reopen`, { reason: 'tính thiếu thưởng' }));
    assert.deepEqual([reopened.status, reopened.run.status, reopened.run.reopenReason], ['DRAFT', 'REOPENED', 'tính thiếu thưởng']);
    ok(await call(admin, 'post', `/api/admin/payroll/${M}/adjustments`, { userId: users.thuha, amount: 50_000, reason: 'thưởng bổ sung' }), 201);
    const relocked = ok(await call(admin, 'post', `/api/admin/payroll/${M}/lock`));
    const l = lineOf(relocked, 'thuha');
    assert.deepEqual(
      [l.netPay, l.paidMethod, Boolean(l.paidAt), Boolean(l.ackAt)],
      [736_666, 'CASH', true, true],
      'giữ "đã trả" / "đã xem" của lần chốt trước',
    );
  });

  test('AC-073-06: trả lương bằng VietQR tới tài khoản người nhận (thiếu tài khoản 409); đánh dấu đã chuyển khoản', async () => {
    ok(await call(admin, 'put', `/api/admin/pay-profiles/${users.baohb}`, { payType: 'MONTHLY', monthlySalary: 5_000_000 }));
    ok(await call(admin, 'post', `/api/admin/payroll/${M}/reopen`, { reason: 'thêm người' }));
    await manual('baohb', day(15), '08:00', '12:00');
    const p = await payroll();
    ok(await call(admin, 'post', `/api/admin/attendance/${p.pending.find((x) => x.user.userId === users.baohb).attId}/decision`, { decision: 'ACTUAL' }));
    ok(await call(admin, 'post', `/api/admin/payroll/${M}/lock`));
    const noBank = await call(admin, 'get', `/api/admin/payroll/${M}/lines/${users.baohb}/qr`);
    assert.deepEqual([noBank.status, noBank.body.code], [409, 'NO_BANK_ACCOUNT']);
    ok(
      await call(admin, 'put', `/api/admin/pay-profiles/${users.baohb}`, {
        payType: 'MONTHLY',
        monthlySalary: 5_000_000,
        bankBin: '970422',
        bankAccount: '0123456789',
        bankAccountName: 'TRAN HOANG BAO',
      }),
    );
    const qr = ok(await call(admin, 'get', `/api/admin/payroll/${M}/lines/${users.baohb}/qr`));
    assert.deepEqual([qr.amount, qr.bankName, qr.accountName], [5_000_000, 'MB Bank', 'TRAN HOANG BAO']);
    assert.ok(qr.payload.startsWith('00020101021238540010A0000007270124000697042201100123456789'), qr.payload);
    assert.ok(qr.payload.includes('54075000000'), 'số tiền');
    assert.ok(qr.content.startsWith('LUONG'));
    assert.equal(qr.payload.slice(-4), vietqr.crc16(qr.payload.slice(0, -4)));
    assert.match(qr.qr, /^data:image\/png;base64,/);
    const paid = ok(await call(admin, 'post', `/api/admin/payroll/${M}/lines/${users.baohb}/paid`, { method: 'TRANSFER' }));
    assert.equal(paid.paidMethod, 'TRANSFER');
  });

  test('AC-073-07: tạm ứng lương ở sổ quỹ — phải chọn người nhận, luôn chờ duyệt, không ai tự duyệt khoản ứng của mình; đã duyệt thì trừ vào bảng lương tháng đó', async () => {
    const cur = todayVn().slice(0, 7);
    ok(await call(admin, 'put', `/api/admin/pay-profiles/${users.lead1}`, { payType: 'MONTHLY', monthlySalary: 6_000_000 }));
    const create = (body) =>
      call(staff, 'post', '/api/cash-transactions', { categoryId: cats['Lương tạm ứng'], amount: 300_000, reason: 'ứng lương', ...body });
    assert.equal((await create({})).status, 400, 'thiếu người nhận');
    const adv = ok(await create({ employeeId: users.lead1 }), 201);
    assert.deepEqual([adv.status, adv.employee.userId], ['PENDING', users.lead1], 'luôn chờ duyệt (kể cả dưới ngưỡng)');
    const self = await call(lead, 'post', `/api/cash-transactions/${adv.cashTxnId}/approve`, {});
    assert.deepEqual([self.status, self.body.code], [403, 'SELF_APPROVAL']);
    const lead2 = await login('lead2');
    assert.equal(ok(await call(lead2, 'post', `/api/cash-transactions/${adv.cashTxnId}/approve`, {})).status, 'APPROVED');
    const line = lineOf(await payroll(cur), 'lead1');
    assert.deepEqual([line.basePay, line.advances, line.netPay], [6_000_000, 300_000, 5_700_000]);
  });

  test('AC-073-08: chia thưởng chung theo phút trong ca; báo cáo tuần (lịch vs giờ được tính, sửa tay, % lương / doanh thu theo ca); Lãi/lỗ trừ lương theo chấm công, không tính tạm ứng thêm lần nữa', async () => {
    const shift = ok(await call(staff, 'get', '/api/shifts/current')).shift;
    await pool.request().query(`UPDATE dbo.Shifts SET OpenedAt = DATEADD(HOUR, -5, SYSUTCDATETIME()) WHERE ShiftId = ${shift.shiftId}`);
    const iso = (h) => new Date(Date.now() - h * 3600e3).toISOString();
    ok(await call(admin, 'post', '/api/attendance', { userId: users.thuha, clockIn: iso(4), clockOut: iso(1), reason: 'ca hôm nay' }), 201);
    ok(await call(admin, 'post', '/api/attendance', { userId: users.baohb, clockIn: iso(4), clockOut: iso(2), reason: 'ca hôm nay' }), 201);
    const bonus = ok(await call(admin, 'post', '/api/admin/payroll/team-bonus', { shiftId: shift.shiftId, amount: 50_000, reason: 'Tip ca' }), 201);
    const share = Object.fromEntries(bonus.shares.map((s) => [s.userId, s.share]));
    assert.deepEqual([share[users.thuha], share[users.baohb]], [30_000, 20_000], '180 / 120 phút');
    const adj = await q1(`SELECT UserId, Amount FROM dbo.PayrollAdjustments WHERE Month = '${bonus.month}' AND Reason LIKE N'Tip ca%' ORDER BY UserId`);
    assert.equal(
      adj.reduce((s, a) => s + Number(a.Amount), 0),
      50_000,
    );

    const monday = (() => {
      const d = new Date(`${day(10)}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    })();
    const week = ok(await call(admin, 'get', `/api/admin/payroll-week?from=${monday}`));
    const ha = week.people.find((p) => p.userId === users.thuha);
    assert.ok(ha && ha.scheduledMinutes >= 360 && ha.paidMinutes >= 360, JSON.stringify(week.people));
    const today = ok(await call(admin, 'get', `/api/admin/payroll-week?from=${todayVn()}`));
    assert.ok(
      today.edits.some((e) => e.userId === users.admin && e.count >= 2),
      'sửa / thêm tay tính theo ngày sửa',
    );
    const s = today.shifts.find((x) => x.shiftId === shift.shiftId);
    assert.ok(s && s.staff >= 2 && s.laborCost > 0, JSON.stringify(today.shifts));

    const lastDay = new Date(Date.UTC(Number(M.slice(0, 4)), Number(M.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const pnl = ok(await call(admin, 'get', `/api/admin/reports/pnl?from=${M}-01&to=${lastDay}`));
    assert.equal(pnl.payrollActive, true);
    // 920 phút của Hà (383.333 + 23.333 + 200.000) + Bảo 4 giờ (lương tháng: 5.000.000 + 6.000.000 của trưởng ca chia theo ngày cả tháng)
    assert.ok(pnl.laborCosts > 600_000 + 11_000_000 - 1000, String(pnl.laborCosts));
    const now = ok(await call(admin, 'get', `/api/admin/reports/pnl?from=${todayVn()}&to=${todayVn()}`));
    assert.ok(!now.expensesByCategory.some((c) => c.name === 'Lương tạm ứng'), 'tạm ứng không còn là chi phí khi đã tính lương');
  });
});
