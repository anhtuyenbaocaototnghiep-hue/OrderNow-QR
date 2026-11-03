// F-067 — quà sinh nhật hội viên (ADR-025 D-95…D-100, BR-104). SQL Server thật.
// Ngày sinh đặt theo "hôm nay" (giờ quán) ± N ngày, năm 1996 (năm nhuận — 29/02 luôn hợp lệ).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, domain;

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
const born = (offset = 0) => `1996-${shift(offset).slice(5)}`;
let seq = 0;
/** Hội viên mới (quầy đăng ký); birthDate đặt thẳng trong DB, self = lúc khách tự thêm (null = quản lý nhập). */
async function member(birthDate = null, self = null) {
  seq += 1;
  const phone = `09080670${String(seq).padStart(2, '0')}`;
  const m = ok(await call(staff, 'post', '/api/members', { phone, fullName: `Khách Sinh Nhật ${seq}`, consent: true }), 201);
  if (birthDate) {
    await pool
      .request()
      .query(`UPDATE dbo.Members SET BirthDate = '${birthDate}', BirthDateSelfAt = ${self ? `'${self}'` : 'NULL'} WHERE MemberId = ${m.memberId}`);
  }
  return { ...m, phone };
}
const loyalty = async (m) => ok(await call(staff, 'get', `/api/members/${m.memberId}/loyalty`));
const gifts = async (m) => (await q1(`SELECT COUNT(*) AS n FROM dbo.BirthdayGifts WHERE MemberId = ${m.memberId}`))[0].n;
async function settings(patch = {}) {
  const cur = ok(await call(admin, 'get', '/api/admin/birthday'));
  const { enabled, kind, value, maxDiscount, menuItemId, windowDays } = cur;
  return ok(await call(admin, 'put', '/api/admin/birthday', { enabled, kind, value, maxDiscount, menuItemId, windowDays, ...patch }));
}
const quote = (items, extra = {}) => call(staff, 'post', '/api/orders/takeaway/quote', { items, ...extra });

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  domain = await import('../src/domain/birthday.js');
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 0 }), 201);
});

after(() => app?.close());

describe('Hàm thuần (F-067)', () => {
  test('AC-067-01 (unit): tuần sinh nhật với 29/02, vắt qua năm, ngoài cửa sổ; ngày sinh tự thêm phải trước ≥ 30 ngày', () => {
    assert.equal(domain.birthdayIn('2000-02-29', 2027), '2027-02-28');
    assert.equal(domain.birthdayIn('2000-02-29', 2028), '2028-02-29');
    assert.deepEqual(domain.currentWindow('1990-11-05', '2026-11-03', 3), {
      date: '2026-11-05',
      year: 2026,
      offset: -2,
      from: '2026-11-02',
      to: '2026-11-08',
    });
    assert.deepEqual(
      [domain.currentWindow('1990-01-01', '2026-12-30', 3).date, domain.currentWindow('1990-01-01', '2026-12-30', 3).year],
      ['2027-01-01', 2027],
      'sinh 01/01: 30/12 năm trước đã trong tuần sinh nhật của năm sau',
    );
    assert.equal(domain.currentWindow('1990-12-31', '2027-01-02', 3).offset, 2);
    assert.equal(domain.currentWindow('2000-02-29', '2027-03-01', 3).date, '2027-02-28');
    assert.equal(domain.currentWindow('1990-11-10', '2026-11-03', 3), null);
    assert.equal(domain.currentWindow('1990-11-03', '2026-11-03', 0).offset, 0);
    assert.equal(domain.currentWindow(null, '2026-11-03', 3), null);
    assert.deepEqual(domain.nextBirthday('1990-01-10', '2026-11-03'), { date: '2027-01-10', daysUntil: 68 });
    assert.equal(domain.selfDateCounts(null, '2026-11-05'), true, 'quản lý nhập → luôn tính');
    assert.equal(domain.selfDateCounts('2026-10-06T05:00:00Z', '2026-11-05'), true, 'thêm trước 30 ngày');
    assert.equal(domain.selfDateCounts('2026-10-07T05:00:00Z', '2026-11-05'), false, 'thêm trước 29 ngày');
    assert.equal(domain.giftLabel({ kind: 'PERCENT', value: 20, maxDiscount: 50000 }), 'Giảm 20% (tối đa 50.000đ)');
    assert.equal(domain.giftLabel({ kind: 'AMOUNT', value: 15000 }), 'Giảm 15.000đ');
    assert.equal(domain.giftLabel({ kind: 'FREE_ITEM', menuItemName: 'Bánh croissant' }), 'Tặng 1 Bánh croissant');
    assert.equal(domain.validateSettings({ kind: 'PERCENT', value: 20, windowDays: 3 }), null);
    assert.match(domain.validateSettings({ kind: 'PERCENT', value: 80, windowDays: 3 }), /1 đến 50%/);
    assert.match(domain.validateSettings({ kind: 'AMOUNT', value: 500, windowDays: 3 }), /1.000đ/);
    assert.match(domain.validateSettings({ kind: 'FREE_ITEM', value: 0, windowDays: 3 }), /Chọn món/);
    assert.match(domain.validateSettings({ kind: 'PERCENT', value: 20, windowDays: 16 }), /0 đến 15/);
  });
});

describe('Quà sinh nhật (F-067)', () => {
  test('AC-067-02: bật + trong tuần sinh nhật → quầy thấy quà READY kèm mã; gọi lại / cùng lúc không tạo quà thứ hai; tắt → OFF; ngoài tuần → null', async () => {
    const m = await member(born(0));
    const off = (await loyalty(m)).birthday;
    assert.deepEqual([off.inWindow, off.offset, off.status, off.gift], [true, 0, 'OFF', null], 'mặc định tắt');
    assert.equal(await gifts(m), 0);

    await settings({ enabled: true });
    const all = await Promise.all([loyalty(m), loyalty(m), loyalty(m), loyalty(m)]);
    const codes = new Set(all.map((l) => l.birthday.gift.code));
    assert.equal(codes.size, 1, 'bốn yêu cầu cùng lúc → một mã');
    const [code] = codes;
    assert.match(code, /^SN[0-9A-F]{8}$/);
    assert.equal(all[0].birthday.status, 'READY');
    assert.equal(all[0].birthday.gift.label, 'Giảm 20% (tối đa 50.000đ)');
    assert.equal(await gifts(m), 1);
    const [v] = await q1(`SELECT * FROM dbo.Vouchers WHERE Code = '${code}'`);
    assert.deepEqual([v.Source, v.MemberId, Number(v.DiscountPercent), Number(v.MaxDiscount)], ['BIRTHDAY', m.memberId, 20, 50000]);
    const end = new Date(Date.parse(`${shift(4)}T00:00:00Z`) - 7 * 3_600_000); // hết ngày thứ 3 sau sinh nhật (giờ quán)
    assert.equal(new Date(v.ExpiresAt).getTime(), end.getTime());
    const again = await loyalty(m);
    assert.equal(again.birthday.gift.code, code);
    assert.ok(
      again.vouchers.some((x) => x.code === code && x.source === 'BIRTHDAY'),
      'quà nằm trong danh sách voucher của hội viên',
    );

    assert.equal((await loyalty(await member(born(10)))).birthday, null, 'còn 10 ngày → chưa tới tuần sinh nhật');
    assert.equal((await loyalty(await member(born(-4)))).birthday, null, 'đã qua 4 ngày');
    assert.equal((await loyalty(await member())).birthday, null, 'chưa có ngày sinh');
  });

  test('AC-067-03: thu tiền bàn tự áp quà (đúng %, có trần) → voucher đã dùng, hóa đơn "Quà sinh nhật"; cùng năm không có quà mới; skipBirthday không áp; voucher khác thì dùng voucher đó', async () => {
    const m = await member(born(-1));
    const C = await app.customer();
    const sessionId = await app.seat(C, '02');
    const order = ok(await C.post('/api/orders', { sessionId, items: [{ menuItemId: ids['Cà phê đen'], quantity: 4 }] }), 201);
    ok(await call(staff, 'post', `/api/orders/${order.orderId}/accept`));
    ok(await call(staff, 'post', `/api/sessions/${sessionId}/member`, { memberId: m.memberId }));

    const skip = ok(await call(staff, 'post', `/api/sessions/${sessionId}/settle/preview`, { skipBirthday: true })).totals;
    assert.deepEqual([skip.birthdayApplied, skip.voucherDiscount], [false, 0]);
    const pv = ok(await call(staff, 'post', `/api/sessions/${sessionId}/settle/preview`, {})).totals;
    assert.equal(pv.birthdayApplied, true);
    const afterMember = pv.ordersTotal - pv.memberDiscount;
    assert.equal(pv.voucherDiscount, Math.min(50000, Math.round(afterMember * 0.2)));
    assert.equal(pv.breakdownLines.find((l) => l.key === 'voucher').label, 'Quà sinh nhật');

    const paid = ok(await call(staff, 'post', `/api/sessions/${sessionId}/settle`, { amountReceived: 1_000_000 }));
    assert.ok(paid);
    const [v] = await q1(
      `SELECT v.UsedAt, p.VoucherDiscount FROM dbo.Vouchers v JOIN dbo.Payments p ON p.PaymentId = v.UsedPaymentId WHERE v.MemberId = ${m.memberId} AND v.Source = 'BIRTHDAY'`,
    );
    assert.ok(v?.UsedAt, 'quà đã dùng');
    assert.equal(Number(v.VoucherDiscount), pv.voucherDiscount);
    const receipt = ok(await call(staff, 'get', `/api/sessions/${sessionId}/receipt?mode=final`));
    assert.match(receipt.breakdown.find((l) => l.key === 'voucher').label, /^Quà sinh nhật SN[0-9A-F]{8}$/);

    const used = (await loyalty(m)).birthday;
    assert.equal(used.status, 'USED');
    const later = ok(await quote([{ menuItemId: ids['Cà phê đen'], quantity: 2 }], { memberId: m.memberId })).totals;
    assert.deepEqual([later.birthdayApplied, later.voucherDiscount], [false, 0], 'cùng năm không có quà thứ hai');
    assert.equal(await gifts(m), 1);

    // Chọn voucher khác → dùng voucher đó, quà sinh nhật để dành
    const other = await member(born(0));
    const manual = ok(await call(admin, 'post', '/api/admin/vouchers', { percent: 5, minOrderAmount: 0, days: 30 }), 201);
    const withOther = ok(await quote([{ menuItemId: ids['Cà phê đen'], quantity: 2 }], { memberId: other.memberId, voucherCode: manual.code })).totals;
    assert.equal(withOther.birthdayApplied, false);
    assert.match(withOther.breakdownLines.find((l) => l.key === 'voucher').label, /^Voucher /);
    assert.equal((await loyalty(other)).birthday.status, 'READY');
  });

  test('AC-067-04: quà tặng món — bill chưa có món thì không áp (không lỗi); có món thì giảm đúng đơn giá món; chọn tay khi thiếu món → 409', async () => {
    await settings({ kind: 'FREE_ITEM', menuItemId: ids['Bánh croissant'], value: 0, maxDiscount: null });
    const m = await member(born(2));
    const l = await loyalty(m);
    assert.deepEqual([l.birthday.status, l.birthday.gift.label, l.birthday.gift.kind], ['READY', 'Tặng 1 Bánh croissant', 'FREE_ITEM']);
    const water = [{ menuItemId: ids['Nước suối'], quantity: 2 }];
    const without = ok(await quote(water, { memberId: m.memberId })).totals;
    assert.deepEqual([without.birthdayApplied, without.voucherDiscount], [false, 0]);
    const withItem = ok(await quote([...water, { menuItemId: ids['Bánh croissant'], quantity: 2 }], { memberId: m.memberId }));
    const croissant = withItem.lines.find((x) => x.menuItemId === ids['Bánh croissant']);
    assert.equal(withItem.totals.birthdayApplied, true);
    assert.equal(withItem.totals.voucherDiscount, Math.round(croissant.lineTotal / croissant.quantity));
    assert.equal(withItem.totals.breakdownLines.find((x) => x.key === 'voucher').label, 'Quà sinh nhật — tặng 1 Bánh croissant');
    const forced = await quote(water, { memberId: m.memberId, voucherCode: l.birthday.gift.code });
    assert.deepEqual([forced.status, forced.body.code], [409, 'VOUCHER_ITEM_NOT_IN_BILL']);
    await settings({ kind: 'PERCENT', value: 20, maxDiscount: 50000, menuItemId: null });
  });

  test('AC-067-05: điện thoại khách thấy lời chúc + quà (không mã); tự thêm ngày sinh một lần; thêm sát ngày → WAITING; quản lý lưu hồ sơ → có quà', async () => {
    const m = await member(born(0));
    const C = await app.customer();
    const sessionId = await app.seat(C, '03');
    ok(await C.post(`/api/sessions/${sessionId}/member`, { phone: m.phone }));
    const s = ok(await C.get(`/api/sessions/${sessionId}`));
    const b = s.member.loyalty.birthday;
    assert.deepEqual([b.status, b.gift.label, b.gift.code], ['READY', 'Giảm 20% (tối đa 50.000đ)', undefined], 'khách không thấy mã');
    assert.ok(s.member.loyalty.vouchers.every((v) => v.code === undefined));
    const card = ok(await C.get(`/api/sessions/${sessionId}/member-card`));
    assert.deepEqual([card.birthday.status, card.birthday.gift.code, card.askBirthDate], ['READY', undefined, false]);
    assert.ok(card.vouchers.some((v) => v.sourceLabel === 'Quà sinh nhật'));

    // Khách tự thêm ngày sinh (hội viên chưa có ngày sinh)
    const n = await member();
    const D = await app.customer();
    const sid2 = await app.seat(D, '04');
    ok(await D.post(`/api/sessions/${sid2}/member`, { phone: n.phone }));
    assert.equal(ok(await D.get(`/api/sessions/${sid2}/member-card`)).askBirthDate, true);
    assert.equal((await D.post(`/api/sessions/${sid2}/member/birthday`, { birthDate: shift(1) })).status, 400, 'ngày mai → không hợp lệ');
    const stranger = await app.customer();
    assert.equal((await stranger.post(`/api/sessions/${sid2}/member/birthday`, { birthDate: born(0) })).status, 403);
    const added = ok(await D.post(`/api/sessions/${sid2}/member/birthday`, { birthDate: born(0) }));
    assert.deepEqual([added.birthday.status, added.birthday.gift, added.askBirthDate], ['WAITING', null, false], 'tự thêm hôm nay → chưa tính');
    const twice = await D.post(`/api/sessions/${sid2}/member/birthday`, { birthDate: born(5) });
    assert.deepEqual([twice.status, twice.body.code], [409, 'BIRTHDATE_SET']);
    assert.equal(await gifts(n), 0);

    // Quản lý lưu hồ sơ = xác minh ngày sinh → có quà
    const { member: prof } = ok(await call(admin, 'get', `/api/admin/members/${n.memberId}`));
    ok(
      await call(admin, 'put', `/api/admin/members/${n.memberId}`, {
        fullName: prof.fullName,
        tierCode: prof.tierCode,
        birthDate: prof.birthDate,
        isActive: true,
      }),
    );
    assert.equal((await loyalty(n)).birthday.status, 'READY');
    // Ngày sinh tự thêm từ 40 ngày trước → tính quà
    const early = await member(born(1), new Date(Date.now() - 40 * 86_400_000).toISOString());
    assert.equal((await loyalty(early)).birthday.status, 'READY');
  });

  test('AC-067-06: cài đặt — hợp lệ lưu được, sai → 400, nhân viên → 403; danh sách sinh nhật 14 ngày tới kèm trạng thái quà; thống kê năm nay', async () => {
    assert.equal((await call(staff, 'get', '/api/admin/birthday')).status, 403);
    const cur = ok(await call(admin, 'get', '/api/admin/birthday'));
    const base = {
      enabled: cur.enabled,
      kind: cur.kind,
      value: cur.value,
      maxDiscount: cur.maxDiscount,
      menuItemId: cur.menuItemId,
      windowDays: cur.windowDays,
    };
    for (const bad of [{ kind: 'PERCENT', value: 80 }, { kind: 'AMOUNT', value: 500 }, { kind: 'FREE_ITEM', menuItemId: null }, { windowDays: 20 }]) {
      assert.equal((await call(admin, 'put', '/api/admin/birthday', { ...base, ...bad })).status, 400, JSON.stringify(bad));
    }
    const saved = await settings({ windowDays: 2, kind: 'AMOUNT', value: 15000, maxDiscount: null });
    assert.deepEqual([saved.windowDays, saved.kind, saved.value], [2, 'AMOUNT', 15000]);
    const soon = await member(born(8));
    const far = await member(born(20));
    const view = ok(await call(admin, 'get', '/api/admin/birthday'));
    const row = (m) => view.upcoming.find((x) => x.memberId === m.memberId);
    assert.deepEqual([row(soon).status, row(soon).daysUntil], ['UPCOMING', 8]);
    assert.equal(row(far), undefined, 'ngoài 14 ngày');
    assert.ok(view.upcoming.some((x) => x.status === 'USED'));
    assert.ok(view.upcoming.some((x) => x.status === 'WAITING' || x.status === 'READY'));
    assert.ok(view.stats.issued >= 4 && view.stats.used >= 1, JSON.stringify(view.stats));
    assert.ok(view.stats.withoutBirthDate >= 1);
    await settings({ windowDays: 3, kind: 'PERCENT', value: 20, maxDiscount: 50000 });
  });
});
