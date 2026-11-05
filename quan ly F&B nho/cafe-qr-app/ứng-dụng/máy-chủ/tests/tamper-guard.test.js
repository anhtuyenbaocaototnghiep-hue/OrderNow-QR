// F-071 — chống sửa / xóa dữ liệu trái phép (ADR-029 D-119…D-123). SQL Server thật.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, staff9, lead, users, cats;

const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const q1 = async (text) => (await pool.request().query(text)).recordset;
const count = async (table, where = '1 = 1') => (await q1(`SELECT COUNT(*) AS n FROM dbo.${table} WHERE ${where}`))[0].n;
const login = (username, password) => api.post('/api/auth/login').send({ username, password });
const yesterday = () => new Date(Date.now() - 30 * 3600e3);
const LEAD_OK = { adminUsername: 'lead1', adminPassword: 'Pass@123' };

async function createUser(username, role) {
  ok(await call(admin, 'post', '/api/admin/users', { username, password: 'Pass@123', fullName: `TK ${username}`, role }), 201);
}
const bigCash = async () =>
  ok(await call(staff, 'post', '/api/cash-transactions', { categoryId: cats['Lương tạm ứng'], amount: 800_000, reason: 'tạm ứng' }), 201);

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  for (const [u, role] of [
    ['lead1', 'MANAGER'],
    ['lead2', 'MANAGER'],
    ['staff8', 'STAFF'],
    ['staff9', 'STAFF'],
  ])
    await createUser(u, role);
  users = Object.fromEntries((await q1('SELECT UserId, Username FROM dbo.Users')).map((u) => [u.Username, u.UserId]));
  staff = await app.login('staff1', 'Staff@123');
  staff9 = await app.login('staff9', 'Pass@123');
  lead = await app.login('lead1', 'Pass@123');
  cats = Object.fromEntries((await call(staff, 'get', '/api/cash-categories')).body.map((c) => [c.name, c.categoryId]));
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 2_000_000 }), 201);
});

after(() => app?.close());

describe('Chống sửa dữ liệu trái phép (F-071)', () => {
  test('AC-071-01: trưởng ca không tự sửa / tự thêm chấm công của mình (403 ATTENDANCE_SELF_EDIT); sửa của người khác được; quản lý sửa được của trưởng ca và của mình', async () => {
    const [mine] = await q1(`SELECT AttId, ClockIn FROM dbo.Attendance WHERE UserId = ${users.lead1} AND ClockOut IS NULL`);
    const [other] = await q1(`SELECT AttId, ClockIn FROM dbo.Attendance WHERE UserId = ${users.staff1} AND ClockOut IS NULL`);
    const earlier = new Date(new Date(mine.ClockIn).getTime() - 60 * 60e3).toISOString();

    const selfEdit = await call(lead, 'put', `/api/attendance/${mine.AttId}`, { clockIn: earlier, reason: 'quên chấm công' });
    assert.deepEqual([selfEdit.status, selfEdit.body.code], [403, 'ATTENDANCE_SELF_EDIT']);
    const selfAdd = await call(lead, 'post', '/api/attendance', {
      userId: users.lead1,
      clockIn: yesterday().toISOString(),
      clockOut: new Date(yesterday().getTime() + 3 * 3600e3).toISOString(),
      reason: 'làm thêm hôm qua',
    });
    assert.deepEqual([selfAdd.status, selfAdd.body.code], [403, 'ATTENDANCE_SELF_EDIT']);
    assert.equal(
      (await q1(`SELECT ClockIn FROM dbo.Attendance WHERE AttId = ${mine.AttId}`))[0].ClockIn.getTime(),
      mine.ClockIn.getTime(),
      'giờ vào không đổi',
    );

    const peer = await call(lead, 'put', `/api/attendance/${other.AttId}`, { clockIn: new Date(other.ClockIn).toISOString(), reason: 'xác nhận giờ vào' });
    assert.equal(peer.status, 200, JSON.stringify(peer.body));
    const byAdmin = await call(admin, 'put', `/api/attendance/${mine.AttId}`, { clockIn: earlier, reason: 'trưởng ca vào sớm, quản lý xác nhận' });
    assert.equal(byAdmin.status, 200, JSON.stringify(byAdmin.body));
    assert.equal(byAdmin.body.editedBy.userId, users.admin);
    const adminSelf = await call(admin, 'post', '/api/attendance', {
      userId: users.admin,
      clockIn: yesterday().toISOString(),
      clockOut: new Date(yesterday().getTime() + 2 * 3600e3).toISOString(),
      reason: 'chủ quán đứng quầy',
    });
    assert.equal(adminSelf.status, 201, JSON.stringify(adminSelf.body));
  });

  test('AC-071-02: tài khoản duyệt ở quầy sai 5 lần → lần 6 bị 429 APPROVAL_LOCKED kể cả gõ đúng; người đứng quầy khác vẫn nhờ duyệt được; đúng mật khẩu mà không đủ quyền không bị tính; cảnh báo AUTH_LOCK một lần; không lưu mật khẩu', async () => {
    const txn = await bigCash();
    assert.equal(txn.status, 'PENDING');
    const approve = (token, creds) => call(token, 'post', `/api/cash-transactions/${txn.cashTxnId}/approve`, creds);

    for (let i = 0; i < 5; i += 1) {
      const r = await approve(staff, { adminUsername: i % 2 ? 'LEAD1' : 'lead1', adminPassword: `doan-${i}` });
      assert.deepEqual([r.status, r.body.code], [403, 'ADMIN_APPROVAL_INVALID'], `lần ${i + 1}`);
    }
    const locked = await approve(staff, LEAD_OK);
    assert.deepEqual([locked.status, locked.body.code], [429, 'APPROVAL_LOCKED'], 'đang khóa: gõ đúng cũng không qua');
    assert.equal((await q1(`SELECT Status FROM dbo.CashTransactions WHERE CashTxnId = ${txn.cashTxnId}`))[0].Status, 'PENDING');

    const alerts = await q1("SELECT Kind, Severity, UserId, Title, Detail FROM dbo.Alerts WHERE Kind = 'AUTH_LOCK'");
    assert.equal(alerts.length, 1, 'một cảnh báo cho một lần khóa');
    assert.equal(alerts[0].Severity, 'HIGH');
    assert.equal(alerts[0].UserId, users.staff1, 'ghi người đứng quầy đã nhập');
    assert.match(alerts[0].Title, /lead1/);
    assert.equal(JSON.parse(alerts[0].Detail).actor, 'Nhân viên quầy 1');

    const cols = (await q1("SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.AuthFailures')")).map((c) => c.name);
    assert.ok(!cols.some((c) => /pass|hash|secret/i.test(c)), `không có cột mật khẩu: ${cols}`);
    assert.equal(await count('AuthFailures', `Kind = 'APPROVAL' AND Username = N'lead1' AND ActorUserId = ${users.staff1}`), 5);

    const other = await approve(staff9, LEAD_OK);
    assert.equal(other.status, 200, `người đứng quầy khác không bị khóa lây: ${JSON.stringify(other.body)}`);
    assert.equal(other.body.status, 'APPROVED');

    // Đúng mật khẩu nhưng trưởng ca không đủ quyền (giảm 25 % cần quản lý) → 403 nhưng không tính là dò mật khẩu
    const before = await count('AuthFailures');
    const notEnough = await call(staff9, 'post', '/api/orders/takeaway', {
      items: [{ menuItemId: (await app.ids())['Nước suối'], quantity: 10 }],
      amountReceived: 1_000_000,
      manualDiscount: { kind: 'PERCENT', value: 25 },
      manualReason: 'khách quen',
      ...LEAD_OK,
    });
    assert.deepEqual([notEnough.status, notEnough.body.code], [403, 'ADMIN_APPROVAL_INVALID']);
    assert.equal(await count('AuthFailures'), before, 'không đếm khi mật khẩu đúng');
  });

  test('AC-071-03: đăng nhập sai 10 lần cùng tên + cùng máy → lần 11 bị 429 LOGIN_LOCKED kể cả gõ đúng; tên khác, máy khác không bị khóa; cảnh báo AUTH_LOCK', async () => {
    for (let i = 0; i < 10; i += 1) {
      const r = await login(i % 3 ? 'lead2' : ' LEAD2 ', `sai-${i}`);
      assert.equal(r.status, 401, `lần ${i + 1}: ${JSON.stringify(r.body)}`);
    }
    const locked = await login('lead2', 'Pass@123');
    assert.deepEqual([locked.status, locked.body.code], [429, 'LOGIN_LOCKED']);
    assert.equal((await login('staff8', 'Pass@123')).status, 200, 'tài khoản khác vẫn đăng nhập');
    const alert = await q1("SELECT Title, Detail FROM dbo.Alerts WHERE Kind = 'AUTH_LOCK' AND Title LIKE N'Đăng nhập%'");
    assert.equal(alert.length, 1);
    assert.equal(JSON.parse(alert[0].Detail).kind, 'LOGIN');

    // Khóa theo tên + máy: 10 lần sai của staff9 từ một máy khác không chặn staff9 đăng nhập từ máy này
    await pool.request().query(`INSERT dbo.AuthFailures (Kind, Username, Ip) SELECT TOP (10) 'LOGIN', N'staff9', '10.0.0.99' FROM sys.objects`);
    assert.equal((await login('staff9', 'Pass@123')).status, 200);
    // Hết 15 phút → mở khóa
    await pool.request().query("UPDATE dbo.AuthFailures SET At = DATEADD(MINUTE, -16, At) WHERE Username = N'lead2'");
    assert.equal((await login('lead2', 'Pass@123')).status, 200);
  });

  test('AC-071-04: CSDL chặn xóa cứng lịch sử tiền / ca / chấm công / cảnh báo (HISTORY_NO_DELETE); nhật ký thao tác không sửa, không xóa được (trừ dòng quá 12 tháng của job giữ 12 tháng)', async () => {
    const PROTECTED = ['Payments', 'Refunds', 'CashTransactions', 'Shifts', 'Attendance', 'OrderItemVoids', 'GiftDrinks', 'Alerts'];
    const triggers = (await q1("SELECT name FROM sys.triggers WHERE name LIKE 'TR[_]%[_]NoDelete'")).map((t) => t.name);
    for (const t of PROTECTED) assert.ok(triggers.includes(`TR_${t}_NoDelete`), `${t} có trigger chặn xóa`);
    // Xóa thật những dòng không bị khóa ngoại giữ lại → trigger chặn (bảng có dòng con thì khóa ngoại cũng chặn trước)
    for (const [table, where] of [
      ['Attendance', '1 = 1'],
      ['CashTransactions', "Reason = N'tạm ứng'"],
      ['Alerts', "Kind = 'AUTH_LOCK'"],
    ]) {
      const n = await count(table, where);
      assert.ok(n > 0, `${table} có dòng để thử`);
      await assert.rejects(pool.request().query(`DELETE dbo.${table} WHERE ${where}`), /HISTORY_NO_DELETE/, table);
      assert.equal(await count(table, where), n, `${table} còn nguyên`);
    }

    const logs = await count('AuditLogs');
    assert.ok(logs > 0);
    await assert.rejects(pool.request().query('DELETE dbo.AuditLogs'), /AUDIT_NO_DELETE/);
    await assert.rejects(pool.request().query("UPDATE dbo.AuditLogs SET Action = 'x'"), /AUDIT_READONLY/);
    assert.equal(await count('AuditLogs'), logs);

    await pool.request().query("INSERT dbo.AuditLogs (Action, Entity, At) VALUES ('test.old', 'Test', DATEADD(MONTH, -13, SYSUTCDATETIME()))");
    const job = ok(await call(admin, 'post', '/api/admin/jobs/audit-retention/run'));
    assert.deepEqual([job.status, job.info?.deleted], ['OK', 1], JSON.stringify(job));
    assert.equal(await count('AuditLogs', "Action = 'test.old'"), 0);
    assert.ok((await count('AuditLogs')) >= logs, 'dòng trong 12 tháng còn nguyên');
  });
});
