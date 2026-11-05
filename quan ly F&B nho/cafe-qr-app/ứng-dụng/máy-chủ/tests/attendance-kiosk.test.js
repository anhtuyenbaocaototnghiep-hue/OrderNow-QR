// F-072 — chấm công nhiều người: màn chấm công chung + PIN riêng, đổi người, PIN cho thao tác tiền, đóng ca (ADR-030). SQL Server thật.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, lead, users, ids, cats, domain;
const PIN = { staff1: '7531', thuha: '2580', baohb: '1397', lead1: '4826' };

const call = (token, method, path, body, headers = {}) => {
  const req = api[method](path).set(auth(token)).set(headers);
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const q1 = async (text) => (await pool.request().query(text)).recordset;
const count = async (table, where = '1 = 1') => (await q1(`SELECT COUNT(*) AS n FROM dbo.${table} WHERE ${where}`))[0].n;
const login = async (username, password = 'Pass@123') => ok(await api.post('/api/auth/login').send({ username, password })).accessToken;
const settings = (patch) => call(admin, 'put', '/api/admin/attendance-settings', { attendanceMode: 'KIOSK', moneyPin: true, ...patch });
const punch = (token, who, pin, action) => call(token, 'post', '/api/attendance/punch', { userId: users[who], pin, action });
const pinHdr = (who) => ({ 'X-Actor-Pin': PIN[who] });
const openOf = async (who) => (await q1(`SELECT * FROM dbo.Attendance WHERE UserId = ${users[who]} AND ClockOut IS NULL`))[0];

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  for (const [u, role, name] of [
    ['lead1', 'MANAGER', 'Trưởng ca Minh'],
    ['thuha', 'STAFF', 'Nguyễn Thu Hà'],
    ['baohb', 'STAFF', 'Trần Hoàng Bảo'],
  ])
    ok(await call(admin, 'post', '/api/admin/users', { username: u, password: 'Pass@123', fullName: name, role }), 201);
  users = Object.fromEntries((await q1('SELECT UserId, Username FROM dbo.Users')).map((u) => [u.Username, u.UserId]));
  ids = await app.ids();
  staff = await app.login('staff1', 'Staff@123'); // chế độ cũ (LOGIN) lúc này → staff1 có một lần chấm công mở
  ok(await settings());
  lead = await login('lead1');
  cats = Object.fromEntries((await call(staff, 'get', '/api/cash-categories')).body.map((c) => [c.name, c.categoryId]));
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 1_000_000 }), 201);
  domain = await import('../src/domain/payroll.js');
});

after(() => app?.close());

describe('Hàm thuần (F-072)', () => {
  test('AC-072-01 (unit): PIN 4–6 số không dễ đoán; luật tính giờ (theo lịch, đến sớm / về muộn, làm thêm chờ duyệt, ngoài lịch, quyết định, đi trễ); chia thưởng theo phút', () => {
    const { pinProblem, evaluate, splitByMinutes, splitMinutes } = domain;
    assert.equal(pinProblem('2580'), null);
    for (const bad of ['123', '1234567', 'abcd', '0000', '1234', '4321', '56789']) assert.ok(pinProblem(bad), bad);

    const roster = { userId: 1, workDate: '2026-10-10', startTime: '08:00', endTime: '14:00' };
    const at = (hhmm) => new Date(`2026-10-10T${hhmm}:00+07:00`);
    const early = evaluate({ clockIn: at('07:50'), clockOut: at('14:05') }, roster);
    assert.deepEqual([early.minutes, early.extraMinutes, early.late, early.issues], [360, 15, false, []], 'sớm 10 + muộn 5 phút: không tính, không phải duyệt');
    const extra = evaluate({ clockIn: at('08:20'), clockOut: at('15:00') }, roster);
    assert.deepEqual([extra.minutes, extra.late, extra.lateMinutes, extra.issues], [340, true, 20, ['EXTRA']], 'trễ 20 phút + về muộn 60 phút');
    assert.equal(evaluate({ clockIn: at('08:20'), clockOut: at('15:00'), payDecision: 'ACTUAL' }, roster).minutes, 400);
    assert.equal(evaluate({ clockIn: at('08:20'), clockOut: at('15:00'), payDecision: 'SCHEDULE' }, roster).minutes, 340);
    assert.equal(evaluate({ clockIn: at('08:20'), clockOut: at('15:00'), payDecision: 'NONE' }, roster).minutes, 0);
    const off = evaluate({ clockIn: at('09:00'), clockOut: at('11:00') }, null);
    assert.deepEqual([off.minutes, off.issues], [120, ['OFF_SCHEDULE']]);
    assert.deepEqual(evaluate({ clockIn: at('08:00'), clockOut: at('14:00'), needsReview: true, checkResult: 'DISPUTED' }, roster).issues, [
      'AUTO_CLOSED',
      'DISPUTED',
    ]);
    assert.deepEqual(evaluate({ clockIn: at('08:00'), clockOut: null }, roster).issues, ['OPEN']);
    const night = new Date('2026-11-01T22:00:00+07:00');
    const late = new Date('2026-10-31T17:00:00+07:00');
    assert.deepEqual(splitMinutes(late.getTime(), night.getTime(), { nightStart: '18:00', holidays: new Set(['2026-11-01']) }), {
      minutes: 29 * 60,
      night: 12 * 60 + 4 * 60, // 18:00–06:00 đêm 31/10 + 18:00–22:00 ngày 1/11
      holiday: 22 * 60,
    });
    const shares = splitByMinutes(50_000, [
      { userId: 1, minutes: 180 },
      { userId: 2, minutes: 120 },
      { userId: 3, minutes: 1 },
    ]);
    // 50.000 × 180/301 = 29.900,3 · × 120/301 = 19.933,5 · × 1/301 = 166,1 → làm tròn xuống, dư 1đ cho người làm nhiều nhất
    assert.deepEqual(
      shares.map((s) => s.share),
      [29_901, 19_933, 166],
    );
  });
});

describe('Chấm công nhiều người (F-072)', () => {
  test('AC-072-02: tự đặt PIN (cần mật khẩu, không dễ đoán); /auth/me báo cách chấm công + đã có PIN; quản lý chỉ xóa được PIN', async () => {
    const thuha = await login('thuha');
    const me = ok(await call(thuha, 'get', '/api/auth/me'));
    assert.deepEqual([me.attendance, me.user.hasPin], [{ mode: 'KIOSK', moneyPin: true }, false]);
    assert.equal(await count('Attendance', `UserId = ${users.thuha}`), 0, 'chế độ màn chung: đăng nhập không chấm công');
    const wrong = await call(thuha, 'post', '/api/auth/pin', { password: 'sai-roi', pin: PIN.thuha });
    assert.deepEqual([wrong.status, wrong.body.code], [403, 'PASSWORD_INVALID']);
    for (const weak of ['1234', '0000', '12'])
      assert.deepEqual([(await call(thuha, 'post', '/api/auth/pin', { password: 'Pass@123', pin: weak })).body.code], ['PIN_WEAK'], weak);
    ok(await call(thuha, 'post', '/api/auth/pin', { password: 'Pass@123', pin: PIN.thuha }));
    assert.equal(ok(await call(thuha, 'get', '/api/auth/me')).user.hasPin, true);
    const cols = (await q1("SELECT PinHash FROM dbo.Users WHERE Username = 'thuha'"))[0].PinHash;
    assert.ok(cols.startsWith('$2') && !cols.includes(PIN.thuha), 'lưu mã băm, không lưu PIN');
    for (const [u, pw] of [
      ['baohb', 'Pass@123'],
      ['lead1', 'Pass@123'],
      ['staff1', 'Staff@123'],
    ])
      ok(await call(await login(u, pw), 'post', '/api/auth/pin', { password: pw, pin: PIN[u] }));
    ok(await call(admin, 'post', `/api/admin/users/${users.baohb}/pin-reset`));
    assert.equal((await q1("SELECT PinHash FROM dbo.Users WHERE Username = 'baohb'"))[0].PinHash, null);
    assert.equal((await call(staff, 'post', `/api/admin/users/${users.baohb}/pin-reset`)).status, 403, 'nhân viên không xóa PIN người khác');
    ok(await call(await login('baohb'), 'post', '/api/auth/pin', { password: 'Pass@123', pin: PIN.baohb }));
  });

  test('AC-072-03: màn chấm công — danh sách người (không có quản lý); vào / ra bằng PIN riêng; vào hai lần 409; đăng xuất không chấm ra; sai PIN 5 lần → 429 PIN_LOCKED + cảnh báo (người đứng quầy khác vẫn chấm được); chế độ đăng nhập → 409 KIOSK_OFF', async () => {
    const board = ok(await call(staff, 'get', '/api/attendance/board'));
    assert.equal(board.mode, 'KIOSK');
    const names = board.people.map((p) => p.userId);
    assert.ok(names.includes(users.thuha) && names.includes(users.lead1) && !names.includes(users.admin));
    assert.equal(board.people.find((p) => p.userId === users.thuha).hasPin, true);

    assert.deepEqual([(await punch(staff, 'thuha', '9999', 'IN')).body.code], ['PIN_INVALID']);
    const inn = ok(await punch(staff, 'thuha', PIN.thuha, 'IN'));
    assert.deepEqual([inn.source, inn.clockOut, inn.user.userId], ['KIOSK', null, users.thuha]);
    assert.deepEqual([(await punch(staff, 'thuha', PIN.thuha, 'IN')).body.code], ['ALREADY_IN']);
    const thuha = await login('thuha');
    ok(await call(thuha, 'post', '/api/auth/logout'));
    assert.ok(await openOf('thuha'), 'đăng xuất máy quầy không chấm ra ở chế độ màn chung');
    const out = ok(await punch(staff, 'thuha', PIN.thuha, 'OUT'));
    assert.ok(out.clockOut);
    assert.deepEqual([(await punch(staff, 'thuha', PIN.thuha, 'OUT')).body.code], ['NOT_IN']);

    for (let i = 0; i < 5; i += 1) assert.equal((await punch(staff, 'baohb', `86${i}0`, 'IN')).body.code, 'PIN_INVALID');
    const locked = await punch(staff, 'baohb', PIN.baohb, 'IN');
    assert.deepEqual([locked.status, locked.body.code], [429, 'PIN_LOCKED']);
    const alert = (await q1("SELECT Detail FROM dbo.Alerts WHERE Kind = 'AUTH_LOCK'")).map((a) => JSON.parse(a.Detail));
    assert.deepEqual([alert.length, alert[0].kind, alert[0].username], [1, 'PIN', 'baohb']);
    ok(await punch(lead, 'baohb', PIN.baohb, 'IN'), 200);

    ok(await settings({ attendanceMode: 'LOGIN' }));
    assert.deepEqual([(await punch(staff, 'thuha', PIN.thuha, 'IN')).body.code], ['KIOSK_OFF']);
    ok(await settings());
  });

  test('AC-072-04: Đổi người — PIN đúng → phiên mới đứng tên người đó (thao tác ghi đúng người, không tạo chấm công); PIN sai 403; quản lý không đổi sang được', async () => {
    const before = await count('Attendance', `UserId = ${users.thuha}`);
    const bad = await call(staff, 'post', '/api/auth/switch', { userId: users.thuha, pin: '1111' });
    assert.deepEqual([bad.status, bad.body.code], [403, 'PIN_INVALID']);
    assert.equal((await call(staff, 'post', '/api/auth/switch', { userId: users.admin, pin: '1111' })).status, 404);
    const sw = ok(await call(staff, 'post', '/api/auth/switch', { userId: users.thuha, pin: PIN.thuha }));
    assert.equal(sw.user.userId, users.thuha);
    assert.equal(ok(await call(sw.accessToken, 'get', '/api/auth/me')).user.username, 'thuha');
    const txn = ok(
      await call(sw.accessToken, 'post', '/api/cash-transactions', { categoryId: cats['Bổ sung tiền lẻ'], amount: 50_000, reason: 'đổi tiền lẻ' }),
      201,
    );
    assert.equal(txn.createdBy.userId, users.thuha, 'thu thêm (không cần PIN) ghi đúng người đứng máy');
    assert.equal(await count('Attendance', `UserId = ${users.thuha}`), before, 'đổi người không chấm công');
  });

  test('AC-072-05: PIN cho thao tác tiền — giảm giá tay, hoàn tiền, chi sổ quỹ, hủy khoản sổ quỹ: thiếu PIN 403 PIN_REQUIRED, sai 403 PIN_INVALID, đúng thì làm; thu thêm không cần; quản lý miễn; tắt cài đặt thì không hỏi', async () => {
    const sale = (token, headers = {}) =>
      call(
        token,
        'post',
        '/api/orders/takeaway',
        {
          items: [{ menuItemId: ids['Nước suối'], quantity: 2 }],
          amountReceived: 100_000,
          manualDiscount: { kind: 'PERCENT', value: 5 },
          manualReason: 'khách quen',
        },
        headers,
      );
    assert.deepEqual([(await sale(staff)).body.code], ['PIN_REQUIRED']);
    assert.deepEqual([(await sale(staff, { 'X-Actor-Pin': '9998' })).body.code], ['PIN_INVALID']);
    const paid = ok(await sale(staff, pinHdr('staff1')), 201);
    ok(await sale(admin), 201);

    const refund = (headers) =>
      call(lead, 'post', `/api/payments/${paid.payment.paymentId}/refunds`, { amount: 1000, reason: 'khách trả lại', restockInventory: false }, headers);
    assert.deepEqual([(await refund({})).body.code], ['PIN_REQUIRED']);
    ok(await refund(pinHdr('lead1')), 201);

    const cash = (cat, headers = {}) => call(staff, 'post', '/api/cash-transactions', { categoryId: cats[cat], amount: 30_000, reason: 'test' }, headers);
    assert.deepEqual([(await cash('Mua đá')).body.code], ['PIN_REQUIRED']);
    const ice = ok(await cash('Mua đá', pinHdr('staff1')), 201);
    ok(await cash('Bổ sung tiền lẻ'), 201);
    const voidTxn = (headers) => call(lead, 'post', `/api/cash-transactions/${ice.cashTxnId}/void`, { reason: 'ghi nhầm' }, headers);
    assert.deepEqual([(await voidTxn({})).body.code], ['PIN_REQUIRED']);
    ok(await voidTxn(pinHdr('lead1')));

    ok(await settings({ moneyPin: false }));
    ok(await sale(staff), 201);
    ok(await settings());
  });

  test('AC-072-06: đóng ca — chấm ra hộ người quên (cần quản lý xem lại), báo không có mặt; không đánh dấu được bản ghi của chính người đóng ca; mở quá 14 giờ → tự đóng ở 8 giờ, cần xem lại', async () => {
    ok(await punch(staff, 'thuha', PIN.thuha, 'IN'));
    const shift = ok(await call(staff, 'get', '/api/shifts/current')).shift;
    const board = ok(await call(staff, 'get', `/api/attendance/shift/${shift.shiftId}`));
    const thuha = board.rows.find((r) => r.user.userId === users.thuha && !r.clockOut);
    const baohb = board.rows.find((r) => r.user.userId === users.baohb);
    const mine = board.rows.find((r) => r.self);
    assert.ok(thuha && baohb && mine, JSON.stringify(board.rows.map((r) => [r.user.fullName, r.self])));
    const closed = ok(
      await call(staff, 'post', `/api/shifts/${shift.shiftId}/close`, {
        countedCash: shift.expectedCash,
        attendance: { clockOut: [thuha.attId, mine.attId], present: [thuha.attId], absent: [baohb.attId, mine.attId] },
      }),
    );
    assert.deepEqual([closed.attendance.closed, closed.attendance.disputed], [1, 1], 'bản ghi của chính mình bị bỏ qua');
    const [h] = await q1(`SELECT ClockOut, NeedsReview, ClosedBy, CheckResult FROM dbo.Attendance WHERE AttId = ${thuha.attId}`);
    assert.deepEqual([Boolean(h.ClockOut), h.NeedsReview, h.ClosedBy, h.CheckResult], [true, true, users.staff1, 'OK']);
    assert.equal((await q1(`SELECT CheckResult FROM dbo.Attendance WHERE AttId = ${baohb.attId}`))[0].CheckResult, 'DISPUTED');
    assert.equal((await q1(`SELECT CheckResult FROM dbo.Attendance WHERE AttId = ${mine.attId}`))[0].CheckResult, null);

    await pool.request().query(`INSERT dbo.Attendance (UserId, ClockIn, Source) VALUES (${users.lead1}, DATEADD(HOUR, -15, SYSUTCDATETIME()), 'KIOSK')`);
    ok(await call(admin, 'post', '/api/admin/jobs/attendance-autoclose/run'));
    const [auto] = await q1(
      `SELECT DATEDIFF(MINUTE, ClockIn, ClockOut) AS M, NeedsReview FROM dbo.Attendance WHERE UserId = ${users.lead1} ORDER BY AttId DESC`,
    );
    assert.deepEqual([auto.M, auto.NeedsReview], [480, true]);
  });
});
