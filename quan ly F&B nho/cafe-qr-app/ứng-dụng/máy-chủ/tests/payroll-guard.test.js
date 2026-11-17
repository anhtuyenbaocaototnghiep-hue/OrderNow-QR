// F-098 — lương: không tự làm cho mình, sửa giờ đã duyệt phải duyệt lại, giữ dấu vết lịch sử lương (ADR-061 D-241…D-244). SQL Server thật.
// Tháng dùng: CUR (nháp) · M = tháng trước (chốt, trả, mở lại, chốt lại) · M2 (tạm ứng chờ duyệt chặn chốt) · M3 (duyệt lại khi sửa giờ — không chốt).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let app, api, pool, admin, staff, qlch, minh, lan, users, banks, cats;
const call = (token, method, path, body, headers = {}) => {
  const req = api[method](path).set(auth(token)).set(headers);
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const self = (r) => assert.deepEqual([r.status, r.body.code], [403, 'PAYROLL_SELF'], JSON.stringify(r.body));
const q1 = async (text) => (await pool.request().query(text)).recordset;
const login = async (username, password = 'Pass@123') => ok(await api.post('/api/auth/login').send({ username, password })).accessToken;
const monthOf = (offset) => {
  const d = new Date(`${todayVn().slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 7);
};
const [CUR, M, M2, M3] = [monthOf(0), monthOf(-1), monthOf(-2), monthOf(-3)];
const day = (offset) => new Date(Date.parse(`${todayVn()}T00:00:00Z`) + offset * 86400e3).toISOString().slice(0, 10);
const vn = (date, hhmm) => new Date(`${date}T${hhmm}:00+07:00`).toISOString();
const roster = async (u, date, s, e) =>
  ok(await call(admin, 'post', '/api/admin/rosters', { userId: users[u], workDate: date, startTime: s, endTime: e }), 201);
const manual = async (u, date, from, to) =>
  ok(await call(admin, 'post', '/api/attendance', { userId: users[u], clockIn: vn(date, from), clockOut: vn(date, to), reason: 'nhập để thử' }), 201).attId;
const payroll = async (month) => ok(await call(admin, 'get', `/api/admin/payroll?month=${month}`));
const lineOf = (p, u) => p.lines.find((l) => l.userId === users[u]);
const profile = (token, u, body) => call(token, 'put', `/api/admin/pay-profiles/${users[u]}`, { payType: 'HOURLY', hourlyRate: 25_000, ...body });
const payrollAlerts = async () =>
  (await q1("SELECT AlertId, Detail FROM dbo.Alerts WHERE Kind = 'PAYROLL_CHANGE' ORDER BY AlertId")).map((a) => JSON.parse(a.Detail));

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  ok(await call(admin, 'put', '/api/admin/attendance-settings', { attendanceMode: 'KIOSK', moneyPin: false }));
  for (const [u, role, name] of [
    ['qlcuahang', 'STORE_MGR', 'Quản lý Hạnh'],
    ['nvminh', 'STAFF', 'Nhân viên Minh'],
    ['nvlan', 'STAFF', 'Nhân viên Lan'],
  ])
    ok(await call(admin, 'post', '/api/admin/users', { username: u, password: 'Pass@123', fullName: name, role }), 201);
  const ids = Object.fromEntries((await q1('SELECT UserId, Username FROM dbo.Users')).map((u) => [u.Username, u.UserId]));
  users = { admin: ids.admin, staff1: ids.staff1, qlch: ids.qlcuahang, minh: ids.nvminh, lan: ids.nvlan };
  // Chủ quán giao quyền Lương cho quản lý cửa hàng (F-079)
  ok(await call(admin, 'put', `/api/admin/users/${users.qlch}/grants`, { grants: [{ capability: 'admin.payroll', effect: 'ALLOW' }] }));
  staff = await app.login('staff1', 'Staff@123');
  [qlch, minh, lan] = [await login('qlcuahang'), await login('nvminh'), await login('nvlan')];
  ({ banks } = ok(await call(admin, 'get', '/api/admin/pay-profiles')));
  for (const [u, rate] of [
    ['qlch', 35_000],
    ['minh', 25_000],
    ['lan', 25_000],
  ])
    ok(await profile(admin, u, { hourlyRate: rate }));
  cats = Object.fromEntries(ok(await call(staff, 'get', '/api/cash-categories')).map((c) => [c.name, c.categoryId]));
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 1_000_000 }), 201);
});

after(() => app?.close());

describe('Lương không tự làm cho mình, duyệt lại khi sửa giờ, giữ lịch sử (F-098)', () => {
  test('AC-098-01: người được giao quyền Lương không làm cho chính mình (403 PAYROLL_SELF) — hồ sơ lương, cộng / trừ, quyết định giờ công, duyệt báo quên, xử lý báo sai, đã trả, thưởng chung ca có mình, ngày lễ ngày mình làm; làm cho người khác được; chủ quán làm cho mình được', async () => {
    // 1) Hồ sơ lương
    self(await profile(qlch, 'qlch', { hourlyRate: 100_000 }));
    assert.equal(ok(await call(admin, 'get', '/api/admin/pay-profiles')).profiles.find((p) => p.userId === users.qlch).hourlyRate, 35_000);
    ok(await profile(qlch, 'minh', { hourlyRate: 26_000 }));

    // 2) Thưởng / khấu trừ: thêm cho mình, xóa khoản của mình
    self(await call(qlch, 'post', `/api/admin/payroll/${CUR}/adjustments`, { userId: users.qlch, amount: 2_000_000, reason: 'thưởng doanh số' }));
    const forMinh = ok(
      await call(qlch, 'post', `/api/admin/payroll/${CUR}/adjustments`, { userId: users.minh, amount: 50_000, reason: 'thưởng chăm chỉ' }),
      201,
    );
    const minus = ok(await call(admin, 'post', `/api/admin/payroll/${CUR}/adjustments`, { userId: users.qlch, amount: -100_000, reason: 'làm vỡ ly' }), 201);
    self(await call(qlch, 'delete', `/api/admin/payroll/adjustments/${minus.adjId}`));
    ok(await call(qlch, 'delete', `/api/admin/payroll/adjustments/${forMinh.adjId}`));
    assert.deepEqual(
      (await payroll(CUR)).adjustments.map((a) => [a.userId, a.amount]),
      [[users.qlch, -100_000]],
    );

    // 3) Quyết định giờ công (lịch 8–12, ra 12:40 → chờ duyệt làm thêm)
    const d = day(-2);
    await roster('qlch', d, '08:00', '12:00');
    await roster('minh', d, '08:00', '12:00');
    const qAtt = await manual('qlch', d, '08:00', '12:40');
    const mAtt = await manual('minh', d, '08:00', '12:40');
    self(await call(qlch, 'post', `/api/admin/attendance/${qAtt}/decision`, { decision: 'ACTUAL' }));
    ok(await call(qlch, 'post', `/api/admin/attendance/${mAtt}/decision`, { decision: 'ACTUAL' }));

    // 4) Báo quên chấm công
    const d1 = day(-1);
    await roster('minh', d1, '08:00', '12:00');
    const mine = ok(
      await call(qlch, 'post', '/api/me/missed-punches', { clockIn: vn(d1, '08:00'), clockOut: vn(d1, '16:00'), note: 'Quên chấm công cả ca' }),
      201,
    );
    self(await call(qlch, 'post', `/api/admin/missed-punches/${mine.requestId}/approve`, {}));
    self(await call(qlch, 'post', `/api/admin/missed-punches/${mine.requestId}/reject`, { reason: 'tự từ chối' }));
    const theirs = ok(
      await call(minh, 'post', '/api/me/missed-punches', { clockIn: vn(d1, '08:00'), clockOut: vn(d1, '12:00'), note: 'Quên chấm công ca sáng' }),
      201,
    );
    ok(await call(qlch, 'post', `/api/admin/missed-punches/${theirs.requestId}/approve`, {}));

    // 5) Báo sai giờ công
    const myDispute = ok(await call(qlch, 'post', `/api/me/attendance/${qAtt}/dispute`, { note: 'em ra 13:00' }), 201);
    self(await call(qlch, 'post', `/api/admin/attendance-disputes/${myDispute.disputeId}/resolve`, { resolution: 'tự xử lý' }));
    const minhDispute = ok(await call(minh, 'post', `/api/me/attendance/${mAtt}/dispute`, { note: 'em ra 12:45' }), 201);
    ok(await call(qlch, 'post', `/api/admin/attendance-disputes/${minhDispute.disputeId}/resolve`, { resolution: 'giữ 12:40 theo camera' }));

    // 6) Thưởng chung cho ca có mình: quản lý chấm vào ở màn chung trong ca đang mở
    ok(await call(qlch, 'post', '/api/auth/pin', { password: 'Pass@123', pin: '6043' }));
    ok(await call(staff, 'post', '/api/attendance/punch', { userId: users.qlch, pin: '6043', action: 'IN' }));
    const shift = ok(await call(staff, 'get', '/api/shifts/current')).shift;
    self(await call(qlch, 'post', '/api/admin/payroll/team-bonus', { shiftId: shift.shiftId, amount: 100_000, reason: 'tip ca tối' }));
    assert.notEqual(
      (await call(admin, 'post', '/api/admin/payroll/team-bonus', { shiftId: shift.shiftId, amount: 100_000, reason: 'tip ca tối' })).body.code,
      'PAYROLL_SELF',
    );

    // 7) Ngày lễ vào ngày mình có chấm công; ngày mình không làm thì được
    self(await call(qlch, 'put', `/api/admin/holidays/${d}`, { name: 'Lễ tự đặt' }));
    ok(await call(qlch, 'put', `/api/admin/holidays/${M2}-05`, { name: 'Ngày lễ thử' }));
    ok(await call(qlch, 'delete', `/api/admin/holidays/${M2}-05`));

    // Chủ quán làm cho mình được (D-119)
    const own = ok(await call(admin, 'post', `/api/admin/payroll/${CUR}/adjustments`, { userId: users.admin, amount: 10_000, reason: 'chủ quán tự ghi' }), 201);
    ok(await call(admin, 'delete', `/api/admin/payroll/adjustments/${own.adjId}`));

    // Chủ quán xử lý phần của quản lý (để tháng nào cũng hết việc chờ)
    ok(await call(admin, 'post', `/api/admin/attendance-disputes/${myDispute.disputeId}/resolve`, { resolution: 'giữ 12:40' }));
    ok(await call(admin, 'post', `/api/admin/attendance/${qAtt}/decision`, { decision: 'ACTUAL' }));
    ok(await call(admin, 'post', `/api/admin/missed-punches/${mine.requestId}/reject`, { reason: 'Không có trong lịch' }));

    // 8) Đánh dấu đã trả lương cho mình (tháng trước, đã chốt)
    const pd = `${M}-10`;
    for (const u of ['qlch', 'minh']) {
      await roster(u, pd, '08:00', '12:00');
      await manual(u, pd, '08:00', '12:00');
    }
    ok(await call(admin, 'post', `/api/admin/payroll/${M}/lock`));
    self(await call(qlch, 'post', `/api/admin/payroll/${M}/lines/${users.qlch}/paid`, { method: 'CASH' }));
    assert.equal(lineOf(await payroll(M), 'qlch').paidAt, null);
    ok(await call(qlch, 'post', `/api/admin/payroll/${M}/lines/${users.minh}/paid`, { method: 'CASH' }));
    // Nhân viên / quản lý bấm "Đã xem" phiếu lương (dùng ở AC-098-06)
    ok(await call(minh, 'post', `/api/me/payslips/${M}/ack`));
    ok(await call(qlch, 'post', `/api/me/payslips/${M}/ack`));
  });

  test('AC-098-02: người không phải chủ quán đổi lương / số tài khoản của người khác hoặc mở lại bảng lương đã chốt → cảnh báo PAYROLL_CHANGE (chỉ chủ quán thấy, ghi cũ → mới, lý do); chủ quán tự làm thì không báo', async () => {
    const before = (await payrollAlerts()).length;
    const bin = banks[0].bin;
    ok(await profile(qlch, 'minh', { hourlyRate: 27_000, bankBin: bin, bankAccount: '0123456789', bankAccountName: 'NGUYEN VAN MINH' }));
    let list = await payrollAlerts();
    assert.equal(list.length, before + 1);
    const changed = list.at(-1);
    assert.deepEqual([changed.kind, changed.to, changed.by], ['PROFILE', 'Nhân viên Minh', 'Quản lý Hạnh']);
    assert.deepEqual(
      changed.changes.find((c) => c.key === 'hourlyRate'),
      { key: 'hourlyRate', label: 'Lương giờ', from: '26.000đ', to: '27.000đ', bank: false },
    );
    assert.deepEqual([changed.changes.find((c) => c.key === 'bankAccount').to, changed.changes.find((c) => c.key === 'bankAccount').bank], ['••••6789', true]);

    ok(await call(qlch, 'post', `/api/admin/payroll/${M}/reopen`, { reason: 'tính thiếu thưởng' }));
    list = await payrollAlerts();
    assert.deepEqual([list.length, list.at(-1).kind, list.at(-1).reason, list.at(-1).month], [before + 2, 'REOPEN', 'tính thiếu thưởng', M]);

    const seenByManager = ok(await call(qlch, 'get', '/api/admin/alerts?status=ALL')).alerts;
    assert.ok(!seenByManager.some((a) => a.kind === 'PAYROLL_CHANGE'), 'quản lý cửa hàng không thấy cảnh báo lương');
    assert.ok(ok(await call(admin, 'get', '/api/admin/alerts?status=ALL')).alerts.some((a) => a.kind === 'PAYROLL_CHANGE'));

    ok(await profile(admin, 'minh', { hourlyRate: 28_000, bankBin: bin, bankAccount: '0123456789', bankAccountName: 'NGUYEN VAN MINH' }));
    assert.equal((await payrollAlerts()).length, before + 2, 'chủ quán tự đổi thì không báo');
  });

  test('AC-098-03: chủ quán đã duyệt "Tính giờ thật" → người khác sửa giờ ra → bỏ quyết định, lại chờ duyệt làm thêm; "Không tính" giữ nguyên; chủ quán tự sửa thì giữ quyết định', async () => {
    const days = [`${M3}-10`, `${M3}-11`, `${M3}-12`];
    for (const d of days) await roster('lan', d, '08:00', '12:00');
    const a1 = await manual('lan', days[0], '08:00', '12:20');
    const a2 = await manual('lan', days[1], '08:00', '12:30');
    const a3 = await manual('lan', days[2], '08:00', '12:20');
    const rec = async (id) => ok(await call(lan, 'get', `/api/me/attendance?month=${M3}`)).records.find((r) => r.attId === id);
    const pendingOf = async (id) => (await payroll(M3)).pending.filter((p) => p.attId === id).map((p) => p.code);

    assert.deepEqual(await pendingOf(a1), ['EXTRA']);
    ok(await call(admin, 'post', `/api/admin/attendance/${a1}/decision`, { decision: 'ACTUAL', note: 'đồng ý 20 phút' }));
    assert.deepEqual([(await rec(a1)).paidMinutes, await pendingOf(a1)], [260, []]);
    ok(await call(qlch, 'put', `/api/attendance/${a1}`, { clockIn: vn(days[0], '08:00'), clockOut: vn(days[0], '16:00'), reason: 'ra muộn' }));
    const r1 = await rec(a1);
    assert.deepEqual([r1.decision, r1.paidMinutes, await pendingOf(a1)], [null, 240, ['EXTRA']], 'giờ đổi → phải duyệt lại');

    ok(await call(admin, 'post', `/api/admin/attendance/${a2}/decision`, { decision: 'NONE', note: 'không tính' }));
    ok(await call(qlch, 'put', `/api/attendance/${a2}`, { clockIn: vn(days[1], '08:00'), clockOut: vn(days[1], '13:00'), reason: 'sửa giờ ra' }));
    const r2 = await rec(a2);
    assert.deepEqual([r2.decision, r2.paidMinutes], ['NONE', 0], '"Không tính" giữ nguyên');

    ok(await call(admin, 'post', `/api/admin/attendance/${a3}/decision`, { decision: 'ACTUAL' }));
    ok(await call(admin, 'put', `/api/attendance/${a3}`, { clockIn: vn(days[2], '08:00'), clockOut: vn(days[2], '12:40'), reason: 'chủ quán sửa' }));
    const r3 = await rec(a3);
    assert.deepEqual([r3.decision, r3.paidMinutes], ['ACTUAL', 280], 'chủ quán tự sửa thì giữ quyết định');
  });

  test('AC-098-04: xóa khoản cộng / trừ = ẩn (người xóa, lúc xóa), bảng lương không tính nữa; CSDL chặn xóa cứng (HISTORY_NO_DELETE)', async () => {
    const before = lineOf(await payroll(CUR), 'minh').adjustments;
    const adj = ok(await call(admin, 'post', `/api/admin/payroll/${CUR}/adjustments`, { userId: users.minh, amount: 30_000, reason: 'thưởng nhỏ' }), 201);
    assert.equal(lineOf(await payroll(CUR), 'minh').adjustments, before + 30_000);
    ok(await call(admin, 'delete', `/api/admin/payroll/adjustments/${adj.adjId}`));
    const p = await payroll(CUR);
    assert.equal(lineOf(p, 'minh').adjustments, before);
    assert.ok(!p.adjustments.some((a) => a.adjId === adj.adjId));
    const gone = p.deletedAdjustments.find((a) => a.adjId === adj.adjId);
    assert.ok(gone?.deletedAt && gone.deletedBy && gone.amount === 30_000, JSON.stringify(gone));
    assert.equal((await call(admin, 'delete', `/api/admin/payroll/adjustments/${adj.adjId}`)).status, 404, 'đã ẩn thì không ẩn lại');
    await assert.rejects(pool.request().query(`DELETE FROM dbo.PayrollAdjustments WHERE AdjId = ${adj.adjId}`), /HISTORY_NO_DELETE/);
  });

  test('AC-098-05: tạm ứng lương còn chờ duyệt trong tháng → việc chờ ADVANCE_PENDING, chốt 409 PAYROLL_PENDING; duyệt xong thì chốt được và trừ tạm ứng', async () => {
    const adv = ok(
      await call(staff, 'post', '/api/cash-transactions', { categoryId: cats['Lương tạm ứng'], amount: 300_000, reason: 'ứng lương', employeeId: users.lan }),
      201,
    );
    assert.equal(adv.status, 'PENDING');
    await q1(`UPDATE dbo.CashTransactions SET CreatedAt = '${M2}-15T03:00:00' WHERE CashTxnId = ${adv.cashTxnId}`); // ghi trong tháng M2
    const p = await payroll(M2);
    assert.deepEqual(
      p.pending.map((x) => [x.code, x.cashTxnId, x.amount, x.user.userId]),
      [['ADVANCE_PENDING', adv.cashTxnId, 300_000, users.lan]],
    );
    const blocked = await call(admin, 'post', `/api/admin/payroll/${M2}/lock`);
    assert.deepEqual([blocked.status, blocked.body.code], [409, 'PAYROLL_PENDING']);
    ok(await call(admin, 'post', `/api/cash-transactions/${adv.cashTxnId}/approve`, {}));
    const locked = ok(await call(admin, 'post', `/api/admin/payroll/${M2}/lock`));
    assert.equal(lineOf(locked, 'lan').advances, 300_000);
  });

  test('AC-098-06: mở lại rồi chốt lại → bản chốt trước vào lịch sử chốt (CSDL chặn xóa); thực nhận đổi thì bỏ "Đã xem", không đổi thì giữ; "Đã trả" giữ kèm số đã trả và phần chênh', async () => {
    // AC-098-01: tháng M đã chốt, Minh đã trả, Minh và quản lý đã xem phiếu; AC-098-02: quản lý mở lại tháng M
    ok(await call(admin, 'post', `/api/admin/payroll/${M}/adjustments`, { userId: users.minh, amount: 50_000, reason: 'thưởng bổ sung' }), 201);
    const relocked = ok(await call(admin, 'post', `/api/admin/payroll/${M}/lock`));
    assert.equal(relocked.versions.length, 1);
    const v = relocked.versions[0];
    const oldMinh = v.lines.find((l) => l.userId === users.minh);
    assert.deepEqual(
      [v.reopenReason, Boolean(v.lockedAt), v.reopenedBy, v.totalNet],
      ['tính thiếu thưởng', true, 'Quản lý Hạnh', v.lines.reduce((s, l) => s + l.netPay, 0)],
    );
    assert.deepEqual([Boolean(oldMinh.paidAt), oldMinh.paidAmount, Boolean(oldMinh.ackAt)], [true, oldMinh.netPay, true]);

    // Minh: 4 giờ × 26.000đ lúc chốt lần đầu; chốt lại theo hồ sơ hiện tại 28.000đ (AC-098-02) + thưởng 50.000đ → còn thiếu 58.000đ
    const m = lineOf(relocked, 'minh');
    assert.deepEqual(
      [oldMinh.netPay, m.netPay, Boolean(m.paidAt), m.paidAmount, Boolean(m.ackAt)],
      [104_000, 162_000, true, 104_000, false],
      'thực nhận đổi → bỏ "Đã xem"; giữ "Đã trả" kèm số đã trả',
    );
    assert.ok(lineOf(relocked, 'qlch').ackAt, 'thực nhận không đổi → giữ "Đã xem"');
    await assert.rejects(pool.request().query(`DELETE FROM dbo.PayrollRunVersions WHERE VersionId = ${v.versionId}`), /HISTORY_NO_DELETE/);
  });
});
