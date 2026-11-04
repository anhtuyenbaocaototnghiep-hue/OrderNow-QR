// F-068 — thu thập ngày sinh hội viên (ADR-026 D-101…D-106, BR-105). SQL Server thật.
// Ngày sinh không năm: '--MM-DD' ở API, năm 1904 trong CSDL.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let app, api, pool, admin, staff, domain;

const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const q1 = async (text) => (await pool.request().query(text)).recordset;
const today = todayVn();
const shift = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const noYear = (date) => `--${date.slice(5)}`;
let seq = 0;
const nextPhone = () => `09080680${String(++seq).padStart(2, '0')}`;
/** Hội viên mới do quầy đăng ký, chưa có ngày sinh. */
async function member() {
  const phone = nextPhone();
  const m = ok(await call(staff, 'post', '/api/members', { phone, fullName: `Khách Ngày Sinh ${seq}`, consent: true }), 201);
  return { ...m, phone };
}
const loyalty = async (m) => ok(await call(staff, 'get', `/api/members/${m.memberId}/loyalty`));
const dbRow = async (id) =>
  (await q1(`SELECT CONVERT(char(10), BirthDate, 23) AS BirthDate, BirthDateSelfAt, BirthDateDeclinedAt FROM dbo.Members WHERE MemberId = ${id}`))[0];
async function settings(patch = {}) {
  const cur = ok(await call(admin, 'get', '/api/admin/birthday'));
  const { enabled, kind, value, maxDiscount, menuItemId, windowDays } = cur;
  return ok(await call(admin, 'put', '/api/admin/birthday', { enabled, kind, value, maxDiscount, menuItemId, windowDays, ...patch }));
}

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  domain = await import('../src/domain/birthday.js');
});

after(() => app?.close());

describe('Hàm thuần (F-068)', () => {
  test('AC-068-01 (unit): đọc ngày sinh có năm / không năm (29/02, 31/04, ngày mai, trước 1910), đổi dạng CSDL năm 1904, tuần sinh nhật với ngày sinh không năm, nhắc lại sau 365 ngày', () => {
    const p = (s) => domain.parseBirthDate(s, '2026-11-04');
    assert.equal(p('1998-11-05'), '1998-11-05');
    assert.equal(p(' --11-05 '), '--11-05');
    assert.equal(p('--02-29'), '--02-29', '29/02 không năm hợp lệ');
    assert.equal(p('2024-02-29'), '2024-02-29');
    assert.equal(p('2026-11-04'), '2026-11-04', 'hôm nay được');
    for (const bad of [
      '2023-02-29',
      '1998-04-31',
      '--04-31',
      '--02-30',
      '--13-01',
      '--00-10',
      '2026-11-05',
      '1909-12-31',
      '1904-03-01',
      '05/11/1998',
      '1998-1-5',
      '',
      null,
    ]) {
      assert.equal(p(bad), null, String(bad));
    }
    assert.equal(domain.toDbBirthDate('--02-29'), '1904-02-29');
    assert.equal(domain.toDbBirthDate('1998-11-05'), '1998-11-05');
    assert.equal(domain.toDbBirthDate(null), null);
    assert.equal(domain.fromDbBirthDate(new Date('1904-02-29T00:00:00Z')), '--02-29');
    assert.equal(domain.fromDbBirthDate(new Date('1998-11-05T00:00:00Z')), '1998-11-05');
    assert.equal(domain.fromDbBirthDate(null), null);
    assert.equal(domain.birthdayIn('--02-29', 2027), '2027-02-28');
    assert.equal(domain.birthdayIn('--02-29', 2028), '2028-02-29');
    assert.deepEqual(domain.currentWindow('--11-05', '2026-11-04', 3), { date: '2026-11-05', year: 2026, offset: -1, from: '2026-11-02', to: '2026-11-08' });
    assert.equal(domain.currentWindow('--01-01', '2026-12-30', 3).year, 2027, 'vắt qua năm');
    assert.deepEqual(domain.nextBirthday('--01-10', '2026-11-04'), { date: '2027-01-10', daysUntil: 67 });
    const now = new Date('2026-11-04T05:00:00Z');
    assert.equal(domain.staffShouldAsk({ birthDate: null, birthDateDeclinedAt: null }, now), true);
    assert.equal(domain.staffShouldAsk({ birthDate: '--11-05', birthDateDeclinedAt: null }, now), false, 'đã có ngày sinh');
    assert.equal(domain.staffShouldAsk({ birthDate: null, birthDateDeclinedAt: '2026-01-01T00:00:00Z' }, now), false, 'mới từ chối 307 ngày');
    assert.equal(domain.staffShouldAsk({ birthDate: null, birthDateDeclinedAt: '2025-11-04T05:00:00Z' }, now), true, 'đủ 365 ngày → hỏi lại');
  });
});

describe('Thu thập ngày sinh (F-068)', () => {
  test('AC-068-02: tra cứu trả askBirthDate theo bật / tắt; đăng ký (khách, quầy) kèm ngày sinh có / không năm → lưu tự khai (WAITING); không gửi → bình thường; sai → 400, không tạo hội viên', async () => {
    const p1 = nextPhone();
    await settings({ enabled: false });
    let r = ok(await api.post('/api/members/lookup').send({ phone: p1 }));
    assert.deepEqual([r.found, r.askBirthDate], [false, false], 'tắt → form không hỏi ngày sinh');
    await settings({ enabled: true });
    r = ok(await api.post('/api/members/lookup').send({ phone: p1 }));
    assert.deepEqual([r.found, r.askBirthDate], [false, true]);

    // Khách tự đăng ký trên điện thoại, ngày sinh không năm đúng hôm nay → tự khai → chưa có quà năm nay
    const C = await app.customer();
    const m1 = ok(await C.post('/api/members', { phone: p1, fullName: 'Khách Tự Đăng Ký', consent: true, birthDate: noYear(today) }), 201);
    const row1 = await dbRow(m1.memberId);
    assert.equal(row1.BirthDate, `1904-${today.slice(5)}`);
    assert.ok(row1.BirthDateSelfAt, 'đăng ký kèm ngày sinh = tự khai');
    const l1 = await loyalty(m1);
    assert.deepEqual([l1.birthday.status, l1.birthday.gift, l1.askBirthDate], ['WAITING', null, false]);

    // Quầy đăng ký nhanh, ngày sinh có năm
    const m2 = ok(
      await call(staff, 'post', '/api/members', { phone: nextPhone(), fullName: 'Khách Quầy Đăng Ký', consent: true, birthDate: '1995-07-20' }),
      201,
    );
    const { member: prof2 } = ok(await call(admin, 'get', `/api/admin/members/${m2.memberId}`));
    assert.equal(prof2.birthDate, '1995-07-20');
    assert.ok(prof2.birthDateSelfAt);

    // Không gửi ngày sinh → đăng ký như cũ
    const m3 = await member();
    assert.deepEqual(Object.values(await dbRow(m3.memberId)), [null, null, null]);

    // Ngày sinh sai → 400, không tạo hội viên
    for (const bad of ['2023-02-29', shift(1), '--04-31', '1900-05-05', 'abc']) {
      const phone = nextPhone();
      const res = await call(staff, 'post', '/api/members', { phone, fullName: 'Khách Ngày Sai', consent: true, birthDate: bad });
      assert.deepEqual([res.status, res.body.code], [400, 'VALIDATION_ERROR'], bad);
      assert.equal(ok(await call(staff, 'post', '/api/members/lookup', { phone })).found, false, `${bad}: không tạo hội viên`);
    }
  });

  test('AC-068-03: quầy thấy askBirthDate; nhân viên thêm ngày sinh → tự khai, hết nhắc; đã có → 409; khách không muốn cho → hết nhắc ở quầy, Thẻ thành viên vẫn mời; chưa đăng nhập → 401', async () => {
    await settings({ enabled: true });
    const m = await member();
    assert.equal((await loyalty(m)).askBirthDate, true);
    assert.equal((await api.post(`/api/members/${m.memberId}/birth-date`).send({ birthDate: '--05-01' })).status, 401);
    assert.equal((await api.post(`/api/members/${m.memberId}/birth-date/decline`).send({})).status, 401);
    assert.equal((await call(staff, 'post', `/api/members/${m.memberId}/birth-date`, { birthDate: '--02-30' })).status, 400);
    assert.equal((await call(staff, 'post', '/api/members/999999/birth-date', { birthDate: '--05-01' })).status, 404);

    const l = ok(await call(staff, 'post', `/api/members/${m.memberId}/birth-date`, { birthDate: noYear(today) }));
    assert.deepEqual([l.askBirthDate, l.birthday.status], [false, 'WAITING'], 'nhân viên ghi hộ sát ngày = tự khai, chưa có quà');
    assert.ok((await dbRow(m.memberId)).BirthDateSelfAt);
    const again = await call(staff, 'post', `/api/members/${m.memberId}/birth-date`, { birthDate: '1990-01-01' });
    assert.deepEqual([again.status, again.body.code], [409, 'BIRTHDATE_SET'], 'nhân viên không sửa ngày sinh đã có');
    assert.equal((await dbRow(m.memberId)).BirthDate, `1904-${today.slice(5)}`);
    assert.equal((await call(staff, 'post', `/api/members/${m.memberId}/birth-date/decline`, {})).status, 409);

    // Khách không muốn cho → quầy thôi nhắc; Thẻ thành viên của khách vẫn mời tự thêm
    const d = await member();
    const declined = ok(await call(staff, 'post', `/api/members/${d.memberId}/birth-date/decline`, {}));
    assert.equal(declined.askBirthDate, false);
    assert.equal((await loyalty(d)).askBirthDate, false);
    assert.ok((await dbRow(d.memberId)).BirthDateDeclinedAt);
    const C = await app.customer();
    const sid = await app.seat(C, '05');
    ok(await C.post(`/api/sessions/${sid}/member`, { phone: d.phone }));
    assert.equal(ok(await C.get(`/api/sessions/${sid}/member-card`)).askBirthDate, true);
    assert.equal(ok(await C.get(`/api/sessions/${sid}`)).member.loyalty.askBirthDate, undefined, 'khách không nhận cờ của quầy');
    // Sau 365 ngày → nhắc lại; tính năng tắt → không nhắc
    await pool.request().query(`UPDATE dbo.Members SET BirthDateDeclinedAt = DATEADD(DAY, -366, SYSUTCDATETIME()) WHERE MemberId = ${d.memberId}`);
    assert.equal((await loyalty(d)).askBirthDate, true);
    await settings({ enabled: false });
    assert.equal((await loyalty(d)).askBirthDate, false);
    await settings({ enabled: true });
  });

  test('AC-068-04: quản lý lưu / đọc ngày sinh không năm, quà sinh nhật áp được; bộ lọc nobirth (ghé gần đây trước, số đếm); coverage ở tab Quà sinh nhật', async () => {
    await settings({ enabled: true });
    const m = await member();
    const { member: prof } = ok(await call(admin, 'get', `/api/admin/members/${m.memberId}`));
    const body = { fullName: prof.fullName, tierCode: prof.tierCode, isActive: true };
    assert.equal((await call(admin, 'put', `/api/admin/members/${m.memberId}`, { ...body, birthDate: '--02-30' })).status, 400);
    const saved = ok(await call(admin, 'put', `/api/admin/members/${m.memberId}`, { ...body, birthDate: noYear(shift(1)) }));
    assert.deepEqual([saved.birthDate, saved.birthDateSelfAt], [noYear(shift(1)), null], 'quản lý nhập = đã xác minh');
    assert.equal((await dbRow(m.memberId)).BirthDate, `1904-${shift(1).slice(5)}`);
    const l = await loyalty(m);
    assert.deepEqual([l.birthday.status, l.birthday.date], ['READY', shift(1)], 'ngày sinh không năm vẫn có quà');
    const view = ok(await call(admin, 'get', '/api/admin/birthday'));
    assert.equal(view.upcoming.find((u) => u.memberId === m.memberId)?.date, shift(1));

    // "Chưa có ngày sinh": ghé gần đây trước, không gồm người đã có ngày sinh
    const older = await member();
    const recent = await member();
    await pool.request().query(`UPDATE dbo.Members SET LastVisitAt = DATEADD(DAY, -10, SYSUTCDATETIME()) WHERE MemberId = ${older.memberId};
      UPDATE dbo.Members SET LastVisitAt = SYSUTCDATETIME() WHERE MemberId IN (${recent.memberId}, ${m.memberId});`);
    await call(staff, 'post', `/api/members/${older.memberId}/birth-date/decline`, {});
    const list = ok(await call(admin, 'get', '/api/admin/members?view=nobirth'));
    const order = list.items.map((x) => x.memberId);
    assert.ok(order.indexOf(recent.memberId) >= 0 && order.indexOf(recent.memberId) < order.indexOf(older.memberId), JSON.stringify(order));
    assert.ok(!order.includes(m.memberId));
    assert.ok(list.items.find((x) => x.memberId === older.memberId).birthDateDeclinedAt, 'dòng có dấu "khách không muốn cho"');
    const overview = ok(await call(admin, 'get', '/api/admin/members/overview'));
    assert.equal(overview.noBirthDate, list.total);

    const [x] = await q1(`SELECT COUNT(*) AS Total, SUM(CASE WHEN BirthDate IS NOT NULL THEN 1 ELSE 0 END) AS WithBirth
      FROM dbo.Members WHERE IsActive = 1 AND AnonymizedAt IS NULL`);
    const { coverage } = ok(await call(admin, 'get', '/api/admin/birthday'));
    assert.deepEqual([coverage.total, coverage.withBirthDate], [x.Total, x.WithBirth]);
    assert.equal(coverage.total - coverage.withBirthDate, list.total);
    assert.ok(coverage.recentTotal >= 2 && coverage.recentWithBirthDate >= 1, JSON.stringify(coverage));
    assert.equal((await call(staff, 'get', '/api/admin/members?view=nobirth')).status, 403);
  });
});
