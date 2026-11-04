// F-069 — mừng khách quay lại (ADR-027 D-107…D-111, BR-106). SQL Server thật.
// "Lần cuối ghé" đặt thẳng trong DB (LastVisitAt = bây giờ − N ngày) vì chỉ lượt thu tiền mới ghi cột này.
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
let seq = 0;
/** Hội viên mới (quầy đăng ký); daysAway = số ngày từ lần thanh toán cuối (null = chưa thanh toán lần nào). */
async function member(daysAway = null) {
  seq += 1;
  const phone = `09080690${String(seq).padStart(2, '0')}`;
  const m = ok(await call(staff, 'post', '/api/members', { phone, fullName: `Khách Quay Lại ${seq}`, consent: true }), 201);
  if (daysAway !== null) await setAway(m, daysAway);
  return { ...m, phone };
}
const setAway = (m, days) =>
  pool
    .request()
    .query(
      `UPDATE dbo.Members SET LastVisitAt = DATEADD(DAY, -${days}, SYSUTCDATETIME()), VisitCount = 6, FirstOrderDiscountUsed = 1 WHERE MemberId = ${m.memberId}`,
    );
const loyalty = async (m) => ok(await call(staff, 'get', `/api/members/${m.memberId}/loyalty`));
const gifts = async (m) => (await q1(`SELECT COUNT(*) AS n FROM dbo.WinbackGifts WHERE MemberId = ${m.memberId}`))[0].n;
async function settings(patch = {}) {
  const cur = ok(await call(admin, 'get', '/api/admin/winback'));
  const { enabled, kind, value, maxDiscount, menuItemId, afterDays, holdDays, cooldownDays } = cur;
  return ok(await call(admin, 'put', '/api/admin/winback', { enabled, kind, value, maxDiscount, menuItemId, afterDays, holdDays, cooldownDays, ...patch }));
}
const quote = (items, extra = {}) => call(staff, 'post', '/api/orders/takeaway/quote', { items, ...extra });
const coffee = (quantity = 2) => [{ menuItemId: ids['Cà phê đen'], quantity }];

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  domain = await import('../src/domain/winback.js');
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 0 }), 201);
});

after(() => app?.close());

describe('Hàm thuần (F-069)', () => {
  test('AC-069-01 (unit): số ngày vắng theo giờ quán; kiểm cài đặt (vắng 14–365, giữ 1–60, giữa hai quà ≥ số ngày vắng, quà như F-067)', () => {
    assert.equal(domain.absentDays('2026-09-13T10:00:00Z', '2026-11-04'), 52);
    assert.equal(domain.absentDays('2026-09-12T18:00:00Z', '2026-11-04'), 52, '01:00 ngày 13/09 giờ quán');
    assert.equal(domain.absentDays('2026-09-12T16:00:00Z', '2026-11-04'), 53, '23:00 ngày 12/09 giờ quán');
    assert.equal(domain.absentDays(null, '2026-11-04'), null, 'chưa thanh toán lần nào');
    const base = { kind: 'PERCENT', value: 15, maxDiscount: 30000, afterDays: 45, holdDays: 14, cooldownDays: 180 };
    assert.equal(domain.validateSettings(base), null);
    assert.equal(domain.validateSettings({ ...base, kind: 'FREE_ITEM', menuItemId: 3, value: 0 }), null);
    assert.match(domain.validateSettings({ ...base, afterDays: 10 }), /vắng từ 14/);
    assert.match(domain.validateSettings({ ...base, holdDays: 0 }), /giữ quà/);
    assert.match(domain.validateSettings({ ...base, cooldownDays: 30 }), /giữa hai quà/);
    assert.match(domain.validateSettings({ ...base, value: 80 }), /1 đến 50%/);
    assert.match(domain.validateSettings({ ...base, kind: 'FREE_ITEM', menuItemId: null }), /Chọn món/);
  });
});

describe('Mừng khách quay lại (F-069)', () => {
  test('AC-069-02: bật + vắng ≥ 45 ngày → READY kèm mã; cùng lúc không tạo quà thứ hai; tắt → OFF; vắng ít / chưa thanh toán → null; có quà trong 180 ngày → COOLDOWN', async () => {
    const m = await member(52);
    const off = (await loyalty(m)).winback;
    assert.deepEqual([off.away, off.days, off.status, off.gift, off.visitCount], [true, 52, 'OFF', null, 6], 'mặc định tắt — quầy vẫn thấy khách vắng');
    assert.equal(await gifts(m), 0);

    await settings({ enabled: true });
    const all = await Promise.all([loyalty(m), loyalty(m), loyalty(m), loyalty(m)]);
    const codes = new Set(all.map((l) => l.winback.gift.code));
    assert.equal(codes.size, 1, 'bốn yêu cầu cùng lúc → một mã');
    const [code] = codes;
    assert.match(code, /^QL[0-9A-F]{8}$/);
    assert.deepEqual([all[0].winback.status, all[0].winback.gift.label], ['READY', 'Giảm 15% (tối đa 30.000đ)']);
    assert.equal(await gifts(m), 1);
    const [v] = await q1(`SELECT * FROM dbo.Vouchers WHERE Code = '${code}'`);
    assert.deepEqual([v.Source, v.MemberId, Number(v.DiscountPercent), Number(v.MaxDiscount)], ['WINBACK', m.memberId, 15, 30000]);
    const end = new Date(Date.parse(`${shift(14)}T00:00:00Z`) - 7 * 3_600_000); // hết ngày thứ 14 kể từ hôm nay (giờ quán)
    assert.equal(new Date(v.ExpiresAt).getTime(), end.getTime());
    assert.ok((await loyalty(m)).vouchers.some((x) => x.code === code && x.source === 'WINBACK'));

    assert.equal((await loyalty(await member(20))).winback, null, 'vắng 20 ngày');
    assert.equal((await loyalty(await member())).winback, null, 'chưa thanh toán lần nào');

    // Quà cũ hết hạn, khách lại vắng một đợt mới trong 180 ngày → COOLDOWN; quà cũ quá 180 ngày → quà mới
    await pool.request().query(`UPDATE dbo.Vouchers SET ExpiresAt = DATEADD(DAY, -1, SYSUTCDATETIME()) WHERE Code = '${code}'`);
    await setAway(m, 50);
    const cool = (await loyalty(m)).winback;
    assert.deepEqual([cool.status, cool.gift, Boolean(cool.lastGiftAt)], ['COOLDOWN', null, true]);
    await pool.request().query(`UPDATE dbo.WinbackGifts SET CreatedAt = DATEADD(DAY, -200, CreatedAt) WHERE MemberId = ${m.memberId}`);
    const second = (await loyalty(m)).winback;
    assert.equal(second.status, 'READY');
    assert.notEqual(second.gift.code, code);
    assert.equal(await gifts(m), 2);
  });

  test('AC-069-03: thu tiền tự áp quà quay lại, hóa đơn "Quà quay lại"; skipWinback giữ quà và lần sau vẫn tự áp; đang sinh nhật → quà sinh nhật trước', async () => {
    await settings({ enabled: true });
    const m = await member(60);
    const C = await app.customer();
    const sessionId = await app.seat(C, '02');
    const order = ok(await C.post('/api/orders', { sessionId, items: coffee(4) }), 201);
    ok(await call(staff, 'post', `/api/orders/${order.orderId}/accept`));
    ok(await call(staff, 'post', `/api/sessions/${sessionId}/member`, { memberId: m.memberId }));

    const skip = ok(await call(staff, 'post', `/api/sessions/${sessionId}/settle/preview`, { skipWinback: true })).totals;
    assert.deepEqual([skip.winbackApplied, skip.voucherDiscount], [false, 0]);
    const pv = ok(await call(staff, 'post', `/api/sessions/${sessionId}/settle/preview`, {})).totals;
    assert.equal(pv.winbackApplied, true);
    assert.equal(pv.voucherDiscount, Math.min(30000, Math.round((pv.ordersTotal - pv.memberDiscount) * 0.15)));
    assert.equal(pv.breakdownLines.find((l) => l.key === 'voucher').label, 'Quà quay lại');
    ok(await call(staff, 'post', `/api/sessions/${sessionId}/settle`, { amountReceived: 1_000_000 }));
    const receipt = ok(await call(staff, 'get', `/api/sessions/${sessionId}/receipt?mode=final`));
    assert.match(receipt.breakdown.find((l) => l.key === 'voucher').label, /^Quà quay lại QL[0-9A-F]{8}$/);
    assert.equal((await loyalty(m)).winback, null, 'đã thanh toán → không còn vắng, quà đã dùng');
    const later = ok(await quote(coffee(), { memberId: m.memberId })).totals;
    assert.deepEqual([later.winbackApplied, later.voucherDiscount], [false, 0]);

    // Không dùng quà lần này → quà giữ; lần ghé sau (không còn vắng) vẫn tự áp
    const k = await member(70);
    const held = ok(
      await call(staff, 'post', '/api/orders/takeaway', { items: coffee(), memberId: k.memberId, skipWinback: true, amountReceived: 100000 }),
      201,
    );
    assert.equal(held.totals.voucherDiscount, 0);
    const keep = (await loyalty(k)).winback;
    assert.deepEqual([keep.away, keep.status], [false, 'READY'], 'quà đang giữ từ lần trước');
    const next = ok(await quote(coffee(), { memberId: k.memberId })).totals;
    assert.equal(next.winbackApplied, true);

    // Đang sinh nhật + đang vắng → quà sinh nhật được áp, quà quay lại giữ
    const cur = ok(await call(admin, 'get', '/api/admin/birthday'));
    ok(await call(admin, 'put', '/api/admin/birthday', { ...cur, enabled: true, upcoming: undefined, stats: undefined, coverage: undefined }));
    const b = await member(80);
    await pool.request().query(`UPDATE dbo.Members SET BirthDate = '1990-${today.slice(5)}' WHERE MemberId = ${b.memberId}`);
    const both = ok(await quote(coffee(), { memberId: b.memberId })).totals;
    assert.deepEqual([both.birthdayApplied, both.winbackApplied], [true, false]);
    assert.equal((await loyalty(b)).winback.status, 'READY');
    const skipBirthday = ok(await quote(coffee(), { memberId: b.memberId, skipBirthday: true })).totals;
    assert.deepEqual([skipBirthday.birthdayApplied, skipBirthday.winbackApplied], [false, true], 'bỏ quà sinh nhật → dùng quà quay lại');
  });

  test('AC-069-04: điện thoại khách / Thẻ thành viên thấy lời chào + quà, không có mã', async () => {
    await settings({ enabled: true });
    const m = await member(55);
    const C = await app.customer();
    const sessionId = await app.seat(C, '03');
    ok(await C.post(`/api/sessions/${sessionId}/member`, { phone: m.phone }));
    const w = ok(await C.get(`/api/sessions/${sessionId}`)).member.loyalty.winback;
    assert.deepEqual([w.away, w.days, w.status, w.gift.label, w.gift.code], [true, 55, 'READY', 'Giảm 15% (tối đa 30.000đ)', undefined]);
    const card = ok(await C.get(`/api/sessions/${sessionId}/member-card`));
    assert.deepEqual([card.winback.status, card.winback.gift.code], ['READY', undefined]);
    assert.ok(card.vouchers.some((v) => v.sourceLabel === 'Quà quay lại'));
  });

  test('AC-069-05: cài đặt hợp lệ / sai 400 / nhân viên 403; stats (đã tặng, đã dùng, ghé tiếp), recent; lọc "Lâu chưa quay lại" theo afterDays', async () => {
    assert.equal((await call(staff, 'get', '/api/admin/winback')).status, 403);
    const cur = ok(await call(admin, 'get', '/api/admin/winback'));
    const base = {
      enabled: cur.enabled,
      kind: cur.kind,
      value: cur.value,
      maxDiscount: cur.maxDiscount,
      menuItemId: cur.menuItemId,
      afterDays: cur.afterDays,
      holdDays: cur.holdDays,
      cooldownDays: cur.cooldownDays,
    };
    for (const bad of [{ afterDays: 7 }, { holdDays: 90 }, { cooldownDays: 20 }, { kind: 'PERCENT', value: 70 }, { kind: 'FREE_ITEM', menuItemId: null }]) {
      assert.equal((await call(admin, 'put', '/api/admin/winback', { ...base, ...bad })).status, 400, JSON.stringify(bad));
    }
    const saved = await settings({ kind: 'AMOUNT', value: 10000, maxDiscount: null, afterDays: 30 });
    assert.deepEqual([saved.kind, saved.value, saved.afterDays], ['AMOUNT', 10000, 30]);
    assert.ok(saved.awayNow >= 1);

    // Ghé tiếp: người dùng quà ở AC-069-03 thanh toán thêm một lần nữa
    assert.ok(saved.stats.issued >= 4 && saved.stats.used >= 1, JSON.stringify(saved.stats));
    const used = saved.recent.find((r) => r.status === 'USED');
    assert.ok(used);
    // lượt dùng quà lùi 1 ngày — lượt thu mới chắc chắn "sau" (PaidAt tính tới giây)
    await pool.request().query(`UPDATE p SET PaidAt = DATEADD(DAY, -1, p.PaidAt) FROM dbo.Payments p
      JOIN dbo.Vouchers v ON v.UsedPaymentId = p.PaymentId JOIN dbo.WinbackGifts w ON w.VoucherId = v.VoucherId WHERE w.MemberId = ${used.memberId}`);
    ok(await call(staff, 'post', '/api/orders/takeaway', { items: coffee(), memberId: used.memberId, amountReceived: 100000 }), 201);
    const after = ok(await call(admin, 'get', '/api/admin/winback'));
    assert.ok(after.stats.returnedAgain >= 1, JSON.stringify(after.stats));
    assert.ok(after.recent.length >= 4 && after.recent[0].fullName && after.recent[0].gift.label);

    // "Lâu chưa quay lại" dùng chung số ngày: vắng 35 ngày là vắng khi afterDays = 30, không vắng khi 45
    const m35 = await member(35);
    const lapsed = async () => ok(await call(admin, 'get', '/api/admin/members?view=lapsed')).items.map((x) => x.memberId);
    assert.ok((await lapsed()).includes(m35.memberId));
    assert.equal(ok(await call(admin, 'get', '/api/admin/members/overview')).lapsedDays, 30);
    await settings({ afterDays: 45, kind: 'PERCENT', value: 15, maxDiscount: 30000 });
    assert.ok(!(await lapsed()).includes(m35.memberId));
  });
});
