// F-072 bổ sung (ADR-031 D-135…D-139): quên PIN / đặt PIN ở màn chung, nhắc chấm công ở máy quầy, nhân viên báo quên chấm công. SQL Server thật.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, lead, thuha, baohb, users, flushAudit;
const call = (token, method, path, body, headers = {}) => {
  const req = api[method](path).set(auth(token)).set(headers);
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const fail = (r, status, code) => assert.deepEqual([r.status, r.body.code], [status, code], JSON.stringify(r.body));
const q1 = async (text) => (await pool.request().query(text)).recordset;
const login = async (username, password = 'Pass@123') => ok(await api.post('/api/auth/login').send({ username, password })).accessToken;
const settings = (attendanceMode) => call(admin, 'put', '/api/admin/attendance-settings', { attendanceMode, moneyPin: false });
const punch = (who, pin, action = 'IN') => call(staff, 'post', '/api/attendance/punch', { userId: users[who], pin, action });
const MIN = 60_000;
/** Giờ quán (VN) của một thời điểm: ngày 'YYYY-MM-DD' + 'HH:MM'. */
const vnOf = (ms) => {
  const t = new Date(ms + 7 * 3600e3).toISOString();
  return { date: t.slice(0, 10), hhmm: t.slice(11, 16) };
};
const vn = (date, hhmm) => new Date(`${date}T${hhmm}:00+07:00`).toISOString();
const sqlUtc = (iso) => iso.slice(0, 19).replace('T', ' '); // chuỗi DATETIME2 (UTC) để chèn thẳng bằng SQL
async function rosterAt(user, startMs, endMs) {
  const [s, e] = [vnOf(startMs), vnOf(endMs)];
  await q1(
    `INSERT dbo.Rosters (UserId, WorkDate, StartTime, EndTime, CreatedBy) VALUES (${users[user]}, '${s.date}', '${s.hhmm}', '${e.hhmm}', ${users.admin})`,
  );
}
const pinFailures = async (who) => (await q1(`SELECT COUNT(*) AS n FROM dbo.AuthFailures WHERE Kind = 'PIN' AND Username = '${who}'`))[0].n;
const reminders = async () => ok(await call(staff, 'get', '/api/attendance/reminders')).items;

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  for (const [u, role, name] of [
    ['lead1', 'MANAGER', 'Trưởng ca Minh'],
    ['thuha', 'STAFF', 'Nguyễn Thu Hà'],
    ['baohb', 'STAFF', 'Trần Hoàng Bảo'],
    ['nghiviec', 'STAFF', 'Người Đã Nghỉ'],
    ['tuanlv', 'STAFF', 'Lê Văn Tuấn'],
  ])
    ok(await call(admin, 'post', '/api/admin/users', { username: u, password: 'Pass@123', fullName: name, role }), 201);
  users = Object.fromEntries((await q1('SELECT UserId, Username FROM dbo.Users')).map((u) => [u.Username, u.UserId]));
  staff = await app.login('staff1', 'Staff@123'); // chế độ cũ (LOGIN) lúc này → staff1 có một lần chấm công mở, không có lịch
  ok(await settings('KIOSK'));
  lead = await login('lead1');
  thuha = await login('thuha');
  baohb = await login('baohb');
  ({ flushAudit } = await import('../src/middleware/audit.js'));
});

after(() => app?.close());

describe('Quên PIN (ADR-031 D-135)', () => {
  test('AC-072-08: bị khóa PIN → đặt PIN mới bằng mật khẩu ngay ở màn chung (không phải đăng xuất máy quầy) → hết khóa, chấm công được ngay; quản lý xóa PIN cũng xóa lần sai cũ; sai mật khẩu tính như đăng nhập sai', async () => {
    ok(await call(thuha, 'post', '/api/auth/pin', { password: 'Pass@123', pin: '2580' }));
    for (let i = 0; i < 5; i += 1) fail(await punch('thuha', '9999'), 403, 'PIN_INVALID');
    fail(await punch('thuha', '2580'), 429, 'PIN_LOCKED'); // đúng PIN cũng bị chặn khi đang khóa
    assert.equal(await pinFailures('thuha'), 5);

    // Ở màn chung (máy quầy đang đứng tên staff1): Hà chạm tên mình, nhập mật khẩu đăng nhập + PIN mới
    fail(await call(staff, 'post', '/api/auth/pin/kiosk', { userId: users.thuha, password: 'sai-mat-khau', pin: '8642' }), 403, 'PASSWORD_INVALID');
    fail(await call(staff, 'post', '/api/auth/pin/kiosk', { userId: users.thuha, password: 'Pass@123', pin: '1234' }), 400, 'PIN_WEAK');
    fail(await call(staff, 'post', '/api/auth/pin/kiosk', { userId: users.admin, password: 'Admin@123', pin: '8642' }), 404, 'NOT_FOUND');
    assert.deepEqual(ok(await call(staff, 'post', '/api/auth/pin/kiosk', { userId: users.thuha, password: 'Pass@123', pin: '8642' })), { hasPin: true });
    assert.equal(await pinFailures('thuha'), 0, 'đặt PIN mới xóa lần sai cũ');
    fail(await punch('thuha', '2580'), 403, 'PIN_INVALID'); // PIN cũ hết dùng được
    ok(await punch('thuha', '8642', 'IN'));
    ok(await punch('thuha', '8642', 'OUT'));
    // Sai mật khẩu ở đây được đếm như đăng nhập sai (cùng tên, cùng máy) — không phải lần sai PIN
    const loginFails = await q1(`SELECT COUNT(*) AS n FROM dbo.AuthFailures WHERE Kind = 'LOGIN' AND Username = 'thuha'`);
    assert.equal(loginFails[0].n, 1);

    // Quản lý xóa PIN của người đang bị khóa → hết khóa, báo "chưa đặt PIN" thay vì "đang khóa"
    ok(await call(baohb, 'post', '/api/auth/pin', { password: 'Pass@123', pin: '1397' }));
    for (let i = 0; i < 5; i += 1) await punch('baohb', '0000');
    fail(await punch('baohb', '1397'), 429, 'PIN_LOCKED');
    assert.deepEqual(ok(await call(admin, 'post', `/api/admin/users/${users.baohb}/pin-reset`)), { hasPin: false });
    assert.equal(await pinFailures('baohb'), 0);
    fail(await punch('baohb', '1397'), 403, 'PIN_NOT_SET');
    ok(await call(staff, 'post', '/api/auth/pin/kiosk', { userId: users.baohb, password: 'Pass@123', pin: '1397' }));
    // Tự đổi PIN trong phiên của mình cũng xóa lần sai cũ
    await punch('baohb', '5555');
    assert.equal(await pinFailures('baohb'), 1);
    ok(await call(baohb, 'post', '/api/auth/pin', { password: 'Pass@123', pin: '1397' }));
    assert.equal(await pinFailures('baohb'), 0);
  });
});

describe('Nhắc chấm công ở máy quầy (ADR-031 D-136)', () => {
  test('AC-072-09: có lịch quá 10 phút chưa chấm vào → nhắc; chấm vào rồi thì hết; hết lịch 15 phút vẫn đang làm → nhắc chấm ra; chưa tới mốc, làm ngoài lịch, người nghỉ việc, chế độ đăng nhập → không nhắc', async () => {
    ok(await call(staff, 'post', '/api/auth/pin/kiosk', { userId: users.tuanlv, password: 'Pass@123', pin: '3691' }));
    const now = Date.now();
    await rosterAt('tuanlv', now - 30 * MIN, now + 180 * MIN); // vào ca 30 phút trước, chưa chấm
    await rosterAt('lead1', now - 5 * MIN, now + 240 * MIN); // mới 5 phút: chưa nhắc (kịp chấm trước mốc trễ)
    await rosterAt('baohb', now - 270 * MIN, now - 30 * MIN); // hết lịch 30 phút trước, vẫn đang làm
    await q1(`INSERT dbo.Attendance (UserId, ClockIn, Source) VALUES (${users.baohb}, DATEADD(MINUTE, -275, SYSUTCDATETIME()), 'KIOSK')`);
    await q1(`UPDATE dbo.Users SET IsActive = 0 WHERE UserId = ${users.nghiviec}`);
    await rosterAt('nghiviec', now - 60 * MIN, now + 60 * MIN);

    let items = await reminders();
    assert.deepEqual(
      items.map((r) => [r.kind, r.fullName]),
      [
        ['NOT_IN', 'Lê Văn Tuấn'],
        ['NOT_OUT', 'Trần Hoàng Bảo'],
      ],
      'staff1 làm ngoài lịch, lead1 mới trễ 5 phút, người nghỉ việc: không nhắc',
    );
    assert.equal(items.find((r) => r.kind === 'NOT_IN').rosterStart, vnOf(now - 30 * MIN).hhmm);
    assert.equal(items.find((r) => r.kind === 'NOT_OUT').rosterEnd, vnOf(now - 30 * MIN).hhmm);

    ok(await punch('tuanlv', '3691', 'IN'));
    // DATETIME2(0) làm tròn lên: giờ vào có thể sau "bây giờ" một chút — vẫn phải hết nhắc ngay (lỗi E2E bắt được)
    await q1(`UPDATE dbo.Attendance SET ClockIn = DATEADD(SECOND, 1, SYSUTCDATETIME()) WHERE UserId = ${users.tuanlv} AND ClockOut IS NULL`);
    assert.deepEqual(
      (await reminders()).map((r) => r.fullName),
      ['Trần Hoàng Bảo'],
      'vừa chấm vào (giờ vào làm tròn lên) → hết nhắc ngay',
    );
    // trả giờ vào về quá khứ — để lần chấm ra ở cuối bài không bị sớm hơn giờ vào giả lập (CK_Attendance_Order)
    await q1(`UPDATE dbo.Attendance SET ClockIn = DATEADD(MINUTE, -1, SYSUTCDATETIME()) WHERE UserId = ${users.tuanlv} AND ClockOut IS NULL`);
    ok(await punch('baohb', '1397', 'OUT'));
    items = await reminders();
    assert.deepEqual(items, [], 'chấm vào / ra xong thì hết nhắc');

    ok(await settings('LOGIN'));
    fail(await punch('tuanlv', '3691', 'OUT'), 409, 'KIOSK_OFF');
    assert.deepEqual(await reminders(), [], 'chế độ đăng nhập: không nhắc');
    ok(await settings('KIOSK'));
    ok(await punch('tuanlv', '3691', 'OUT'));
  });
});

describe('Báo quên chấm công (ADR-031 D-136…D-138)', () => {
  const day = vnOf(Date.now() - 3 * 86400e3).date; // 3 ngày trước — trong hạn 7 ngày
  const month = day.slice(0, 7);
  let reqId;

  test('AC-072-10: ngày có lịch mà không chấm công → Giờ công của tôi hiện "báo quên được"; nhân viên gửi giờ thật + lý do → chờ quản lý; chặn gửi trùng, trùng chấm công đã có, quá 7 ngày, giờ tương lai, quản lý tự gửi', async () => {
    await q1(`INSERT dbo.Rosters (UserId, WorkDate, StartTime, EndTime, CreatedBy) VALUES (${users.thuha}, '${day}', '08:00', '14:00', ${users.admin})`);
    let me = ok(await call(thuha, 'get', `/api/me/attendance?month=${month}`));
    assert.deepEqual(me.missingDays, [{ workDate: day, startTime: '08:00', endTime: '14:00', reported: false, canReport: true }]);
    assert.equal(me.missedPunchDays, 7);

    const body = { clockIn: vn(day, '07:55'), clockOut: vn(day, '14:00'), note: 'Vào ca vội, quên bấm Chấm công' };
    fail(await call(thuha, 'post', '/api/me/missed-punches', { ...body, note: 'ab' }), 400, 'VALIDATION_ERROR');
    fail(await call(admin, 'post', '/api/me/missed-punches', body), 403, 'MISSED_PUNCH_ADMIN');
    const created = ok(await call(thuha, 'post', '/api/me/missed-punches', body), 201);
    reqId = created.requestId;
    assert.deepEqual([created.status, created.user.userId, created.note], ['PENDING', users.thuha, body.note]);
    fail(await call(thuha, 'post', '/api/me/missed-punches', { ...body, clockIn: vn(day, '09:00') }), 409, 'MISSED_PUNCH_OPEN');
    const old = vnOf(Date.now() - 9 * 86400e3).date;
    fail(await call(thuha, 'post', '/api/me/missed-punches', { ...body, clockIn: vn(old, '08:00'), clockOut: vn(old, '12:00') }), 400, 'MISSED_PUNCH_TOO_OLD');
    const future = new Date(Date.now() + 3600e3).toISOString();
    fail(
      await call(thuha, 'post', '/api/me/missed-punches', { ...body, clockIn: future, clockOut: new Date(Date.now() + 7200e3).toISOString() }),
      400,
      'VALIDATION_ERROR',
    );
    fail(await call(thuha, 'post', '/api/me/missed-punches', { ...body, clockOut: body.clockIn }), 400, 'VALIDATION_ERROR');
    // Trùng một lần chấm công đã có → dùng "Báo sai" trên lần đó
    const d4 = vnOf(Date.now() - 4 * 86400e3).date;
    ok(await call(admin, 'post', '/api/attendance', { userId: users.thuha, clockIn: vn(d4, '15:00'), clockOut: vn(d4, '18:00'), reason: 'nhập tay' }), 201);
    fail(await call(thuha, 'post', '/api/me/missed-punches', { ...body, clockIn: vn(d4, '16:00'), clockOut: vn(d4, '20:00') }), 409, 'ATTENDANCE_OVERLAP');

    me = ok(await call(thuha, 'get', `/api/me/attendance?month=${month}`));
    assert.deepEqual([me.missingDays[0].reported, me.missingDays[0].canReport], [true, false]);
    assert.deepEqual(
      me.missedPunches.map((m) => m.status),
      ['PENDING'],
    );
    // Việc chờ ở trang Lương của tháng đó
    const pay = ok(await call(admin, 'get', `/api/admin/payroll?month=${month}`));
    const item = pay.pending.find((p) => p.code === 'MISSED_PUNCH');
    assert.deepEqual([item.requestId, item.user.userId, item.note], [reqId, users.thuha, body.note]);
  });

  test('AC-072-11: chỉ quản lý duyệt; duyệt (sửa giờ được) → tạo lần chấm công nguồn MANUAL ghi người duyệt + lý do, hết vắng; không duyệt phải có lý do, không tạo chấm công; không xóa được; báo quên đang chờ chặn chốt lương, tháng đã chốt không duyệt được', async () => {
    fail(await call(lead, 'post', `/api/admin/missed-punches/${reqId}/approve`, {}), 403, 'FORBIDDEN');
    const r = ok(await call(admin, 'post', `/api/admin/missed-punches/${reqId}/approve`, { clockIn: vn(day, '08:00'), note: 'Trưởng ca xác nhận có mặt' }));
    assert.equal(r.status, 'APPROVED');
    const att = r.attendance;
    assert.deepEqual(
      [att.source, att.editedBy.userId, new Date(att.clockIn).toISOString(), new Date(att.clockOut).toISOString()],
      ['MANUAL', users.admin, vn(day, '08:00'), vn(day, '14:00')],
    );
    assert.equal(att.editReason, 'Báo quên chấm công: Vào ca vội, quên bấm Chấm công');
    fail(await call(admin, 'post', `/api/admin/missed-punches/${reqId}/approve`, {}), 404, 'NOT_FOUND');
    const row = (await q1(`SELECT Status, AttId, ResolvedBy, Resolution FROM dbo.MissedPunches WHERE RequestId = ${reqId}`))[0];
    assert.deepEqual(row, { Status: 'APPROVED', AttId: att.attId, ResolvedBy: users.admin, Resolution: 'Trưởng ca xác nhận có mặt' });

    const me = ok(await call(thuha, 'get', `/api/me/attendance?month=${month}`));
    assert.deepEqual(me.missingDays, [], 'đã có chấm công → hết vắng');
    const rec = me.records.find((x) => x.attId === att.attId);
    assert.deepEqual([rec.paidMinutes, rec.late], [360, false]);
    assert.equal(me.missedPunches[0].resolvedBy, 'Quản lý');
    const pay = ok(await call(admin, 'get', `/api/admin/payroll?month=${month}`));
    assert.equal(pay.pending.filter((p) => p.code === 'MISSED_PUNCH').length, 0);
    await flushAudit();
    assert.equal((await q1(`SELECT COUNT(*) AS n FROM dbo.AuditLogs WHERE Action = 'missed-punches.approve' AND EntityId = '${reqId}'`))[0].n, 1);

    // Không duyệt: phải có lý do; không tạo chấm công
    const other = vnOf(Date.now() - 2 * 86400e3).date;
    const b = ok(
      await call(baohb, 'post', '/api/me/missed-punches', { clockIn: vn(other, '17:00'), clockOut: vn(other, '22:00'), note: 'Quên chấm công ca tối' }),
      201,
    );
    fail(await call(admin, 'post', `/api/admin/missed-punches/${b.requestId}/reject`, { reason: '' }), 400, 'VALIDATION_ERROR');
    const before = (await q1('SELECT COUNT(*) AS n FROM dbo.Attendance'))[0].n;
    assert.deepEqual(ok(await call(admin, 'post', `/api/admin/missed-punches/${b.requestId}/reject`, { reason: 'Hôm đó Bảo nghỉ, có người làm thay' })), {
      status: 'REJECTED',
    });
    assert.equal((await q1('SELECT COUNT(*) AS n FROM dbo.Attendance'))[0].n, before);
    const mine = ok(await call(baohb, 'get', `/api/me/attendance?month=${other.slice(0, 7)}`)).missedPunches;
    assert.deepEqual([mine[0].status, mine[0].resolution], ['REJECTED', 'Hôm đó Bảo nghỉ, có người làm thay']);
    await assert.rejects(q1(`DELETE dbo.MissedPunches WHERE RequestId = ${b.requestId}`), /HISTORY_NO_DELETE/);

    // Hai tháng trước (không dính dữ liệu của test khác): báo quên đang chờ chặn chốt; chốt rồi thì không duyệt được
    const prev = (() => {
      const d = new Date(`${vnOf(Date.now()).date.slice(0, 7)}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - 2);
      return d.toISOString().slice(0, 7);
    })();
    const ins = (note) =>
      q1(`INSERT dbo.MissedPunches (UserId, ClockIn, ClockOut, Note) OUTPUT inserted.RequestId
          VALUES (${users.baohb}, '${sqlUtc(vn(`${prev}-10`, '08:00'))}', '${sqlUtc(vn(`${prev}-10`, '12:00'))}', N'${note}')`);
    const [p1] = await ins('Quên chấm công tháng trước');
    fail(await call(admin, 'post', `/api/admin/payroll/${prev}/lock`), 409, 'PAYROLL_PENDING');
    ok(await call(admin, 'post', `/api/admin/missed-punches/${p1.RequestId}/reject`, { reason: 'Không có trong lịch' }));
    ok(await call(admin, 'post', `/api/admin/payroll/${prev}/lock`));
    const [p2] = await ins('Gửi sau khi đã chốt');
    fail(await call(admin, 'post', `/api/admin/missed-punches/${p2.RequestId}/approve`, {}), 409, 'PAYROLL_LOCKED');
  });
});
