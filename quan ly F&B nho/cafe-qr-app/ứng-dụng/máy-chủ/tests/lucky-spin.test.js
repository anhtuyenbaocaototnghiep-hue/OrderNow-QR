// F-065 — vòng quay may mắn sau khi thanh toán (ADR-024 D-89…D-92, BR-102). SQL Server thật.
// Kết quả quay được chọn ngẫu nhiên ở máy chủ → test gọi service với hàm ngẫu nhiên cố định để biết trước ô trúng.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, spinService, domain;

const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const q1 = async (text) => (await pool.request().query(text)).recordset;
/** Bán mang đi `qty` chai nước (10.000đ / chai) → { orderId, paymentId } */
async function sale(qty, extra = {}) {
  const r = ok(
    await call(staff, 'post', '/api/orders/takeaway', { items: [{ menuItemId: ids['Nước suối'], quantity: qty }], amountReceived: 5_000_000, ...extra }),
    201,
  );
  const [p] = await q1(`SELECT PaymentId FROM dbo.Payments WHERE OrderId = ${r.order.orderId}`);
  return { orderId: r.order.orderId, paymentId: p.PaymentId };
}
const receiptSpin = async (orderId) => ok(await call(staff, 'get', `/api/orders/${orderId}/receipt`)).luckySpin;
const tokenOf = (spin) => spin.url.split('/quay/')[1];
async function enable(patch = {}) {
  const cur = ok(await call(admin, 'get', '/api/admin/lucky-spin'));
  return ok(
    await call(admin, 'put', '/api/admin/lucky-spin', {
      enabled: true,
      minAmount: cur.minAmount,
      dailyWinCap: cur.dailyWinCap,
      voucherDays: cur.voucherDays,
      expireHours: cur.expireHours,
      prizes: cur.prizes,
      ...patch,
    }),
  );
}

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  spinService = await import('../src/services/luckySpinService.js');
  domain = await import('../src/domain/luckySpin.js');
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 0 }), 201);
});

after(() => app?.close());

describe('Hàm thuần (F-065)', () => {
  test('AC-065-02 (unit): chọn ô theo trọng số, ô trọng số 0 không trúng; ô điểm ẩn với khách không phải hội viên; kiểm cấu hình ô', () => {
    const slices = [
      { prizeId: 1, kind: 'PERCENT', weight: 10, isActive: true },
      { prizeId: 2, kind: 'POINTS', weight: 30, isActive: true },
      { prizeId: 3, kind: 'AMOUNT', weight: 0, isActive: true },
      { prizeId: 4, kind: 'NONE', weight: 60, isActive: true },
      { prizeId: 5, kind: 'AMOUNT', weight: 50, isActive: false },
    ];
    const shown = domain.visibleSlices(slices, { hasMember: true });
    assert.deepEqual(
      shown.map((p) => p.prizeId),
      [1, 2, 3, 4],
    );
    assert.deepEqual(
      domain.visibleSlices(slices, { hasMember: false }).map((p) => p.prizeId),
      [1, 3, 4],
    );
    assert.deepEqual(
      [0, 0.0999, 0.1, 0.399, 0.4, 0.9999].map((r) => domain.pickSlice(shown, r).prizeId),
      [1, 1, 2, 2, 4, 4],
    );
    assert.equal(domain.pickSlice([{ prizeId: 9, weight: 0 }], 0.5), null);
    const p = (kind, value = 0, weight = 1) => ({ label: kind, kind, value, weight });
    assert.equal(domain.validatePrizes([p('PERCENT', 10), p('NONE')]), null);
    assert.match(domain.validatePrizes([p('PERCENT', 10), p('AMOUNT', 5000)]), /Chúc may mắn/);
    assert.match(domain.validatePrizes([p('NONE')]), /2–8/);
    assert.match(domain.validatePrizes(Array.from({ length: 9 }, () => p('NONE'))), /2–8/);
    assert.match(domain.validatePrizes([p('PERCENT', 10, 0), p('NONE', 0, 0)]), /lớn hơn 0/);
    assert.match(domain.validatePrizes([p('PERCENT', 80), p('NONE')]), /1–50%/);
    assert.match(domain.validatePrizes([p('AMOUNT', 500), p('NONE')]), /1.000đ/);
  });
});

describe('Vòng quay may mắn (F-065)', () => {
  test('AC-065-01: hóa đơn có QR quay khi bật và đủ mức; tắt / dưới mức / đã hoàn tiền → không có; in lại giữ mã; màn cảm ơn của phiên thấy lượt quay', async () => {
    const off = await sale(4);
    assert.equal(await receiptSpin(off.orderId), null, 'mặc định tắt');
    await enable();
    const big = await sale(4);
    const s1 = await receiptSpin(big.orderId);
    assert.match(s1.url, /\/quay\/[0-9a-f]{32}$/);
    assert.match(s1.qr, /^data:image\/png;base64,/);
    assert.equal(tokenOf(await receiptSpin(big.orderId)), tokenOf(s1), 'in lại giữ mã cũ');
    assert.equal(await receiptSpin((await sale(2)).orderId), null, '20.000đ < 30.000đ');
    const refunded = await sale(5);
    ok(await call(admin, 'post', `/api/payments/${refunded.paymentId}/refunds`, { amount: 10000, reason: 'trả lại một chai' }), 201);
    assert.equal(await receiptSpin(refunded.orderId), null, 'đã hoàn tiền');

    // Tại bàn: khách thanh toán xong, điện thoại trong phiên thấy lượt quay; điện thoại khác → 403
    const C = await app.customer();
    const sessionId = await app.seat(C, '01');
    const order = ok(await C.post('/api/orders', { sessionId, items: [{ menuItemId: ids['Nước suối'], quantity: 4 }] }), 201);
    ok(await call(staff, 'post', `/api/orders/${order.orderId}/accept`));
    ok(await call(staff, 'post', `/api/sessions/${sessionId}/settle`, { amountReceived: 1_000_000 }));
    const mine = ok(await C.get(`/api/sessions/${sessionId}/lucky-spins`));
    assert.equal(mine.length, 1);
    assert.equal(mine[0].status, 'NEW');
    const sessionReceipt = ok(await call(staff, 'get', `/api/sessions/${sessionId}/receipt`)).luckySpin;
    assert.equal(tokenOf(sessionReceipt), mine[0].token, 'hóa đơn bàn và màn cảm ơn cùng một mã');
    const other = await app.customer();
    assert.equal((await other.get(`/api/sessions/${sessionId}/lucky-spins`)).status, 403);
  });

  test('AC-065-02: quay ra đúng ô máy chủ chọn — voucher (mã tự do) / điểm (hội viên) được tạo đúng; quay lại trả kết quả cũ, không thêm quà', async () => {
    const guest = await receiptSpin((await sale(4)).orderId);
    const view = ok(await api.get(`/api/lucky-spins/${tokenOf(guest)}`));
    assert.equal(view.status, 'NEW');
    assert.deepEqual(
      view.slices.map((s) => s.kind),
      ['PERCENT', 'AMOUNT', 'NONE'],
      'khách vãng lai không có ô điểm',
    );
    const r = await spinService.spin(tokenOf(guest), () => 0); // ô đầu: Giảm 10%
    assert.deepEqual([r.result.kind, r.result.label], ['PERCENT', 'Giảm 10%']);
    const [v] = await q1(`SELECT * FROM dbo.Vouchers WHERE Code = '${r.result.voucher.code}'`);
    assert.deepEqual([v.Source, Number(v.DiscountPercent), Number(v.MaxDiscount), v.MemberId], ['GAME', 10, 20000, null]);
    const days = (new Date(v.ExpiresAt) - Date.now()) / 86_400_000;
    assert.ok(days > 13.9 && days <= 14.01, `hạn 14 ngày (${days})`);
    const [before] = await q1('SELECT COUNT(*) AS n FROM dbo.Vouchers');
    const again = ok(await api.post(`/api/lucky-spins/${tokenOf(guest)}/spin`));
    assert.equal(again.result.voucher.code, r.result.voucher.code, 'quay lại → kết quả cũ');
    assert.equal((await q1('SELECT COUNT(*) AS n FROM dbo.Vouchers'))[0].n, before.n);
    assert.equal(ok(await api.get(`/api/lucky-spins/${tokenOf(guest)}`)).status, 'SPUN');

    // Hội viên: ô điểm có trên vòng; trúng +20 điểm → số dư + sổ điểm
    const m = ok(await call(staff, 'post', '/api/members', { phone: '0909065065', fullName: 'Khách Quay', consent: true }), 201);
    const memberSale = await sale(4, { memberId: m.memberId });
    const memberSpin = await receiptSpin(memberSale.orderId);
    assert.deepEqual(
      ok(await api.get(`/api/lucky-spins/${tokenOf(memberSpin)}`)).slices.map((s) => s.kind),
      ['PERCENT', 'AMOUNT', 'POINTS', 'NONE'],
    );
    const [{ Points: p0 }] = await q1(`SELECT Points FROM dbo.Members WHERE MemberId = ${m.memberId}`);
    const pr = await spinService.spin(tokenOf(memberSpin), () => 0.35); // 10 + 20 < 35 ≤ 45 → ô điểm
    assert.deepEqual([pr.result.kind, pr.result.points], ['POINTS', 20]);
    const [{ Points: p1 }] = await q1(`SELECT Points FROM dbo.Members WHERE MemberId = ${m.memberId}`);
    assert.equal(p1 - p0, 20);
    const [pt] = await q1(`SELECT Type, Note, Delta FROM dbo.PointTransactions WHERE MemberId = ${m.memberId} AND Note = N'Vòng quay may mắn'`);
    assert.deepEqual([pt.Type, pt.Delta], ['ADJUST', 20]);
  });

  test('AC-065-03: đủ số lượt trúng trong ngày → "Chúc may mắn lần sau"; hai lượt quay cùng lúc không vượt ngân sách', async () => {
    const [{ n: wins }] = await q1("SELECT COUNT(*) AS n FROM dbo.LuckySpins WHERE SpunAt IS NOT NULL AND Kind <> 'NONE'");
    await enable({ dailyWinCap: wins });
    const capped = await spinService.spin(tokenOf(await receiptSpin((await sale(4)).orderId)), () => 0);
    assert.deepEqual([capped.result.kind, capped.result.label], ['NONE', 'Chúc may mắn lần sau']);

    await enable({ dailyWinCap: wins + 1 });
    const a = tokenOf(await receiptSpin((await sale(4)).orderId));
    const b = tokenOf(await receiptSpin((await sale(4)).orderId));
    const both = await Promise.all([spinService.spin(a, () => 0), spinService.spin(b, () => 0)]);
    assert.deepEqual(both.map((x) => x.result.kind).sort(), ['NONE', 'PERCENT']);
    await enable({ dailyWinCap: 20 });
  });

  test('AC-065-04: mã hết hạn → 410; mã không tồn tại → 404; mã sai dạng → 400', async () => {
    const t = tokenOf(await receiptSpin((await sale(4)).orderId));
    await pool.request().query(`UPDATE dbo.LuckySpins SET ExpiresAt = DATEADD(MINUTE, -1, SYSUTCDATETIME()) WHERE Token = '${t}'`);
    assert.equal(ok(await api.get(`/api/lucky-spins/${t}`)).status, 'EXPIRED');
    const r = await api.post(`/api/lucky-spins/${t}/spin`);
    assert.deepEqual([r.status, r.body.code], [410, 'SPIN_EXPIRED']);
    assert.equal((await api.get(`/api/lucky-spins/${'0'.repeat(32)}`)).status, 404);
    assert.equal((await api.post(`/api/lucky-spins/${'0'.repeat(32)}/spin`)).status, 404);
    assert.equal((await api.get('/api/lucky-spins/abc')).status, 400);
  });

  test('AC-065-05: cài đặt — ô hợp lệ lưu được, ô sai → 400, nhân viên → 403; thống kê 7 ngày đếm đúng', async () => {
    const cur = ok(await call(admin, 'get', '/api/admin/lucky-spin'));
    const base = { enabled: true, minAmount: 30000, dailyWinCap: 20, voucherDays: 14, expireHours: 24 };
    const bad = [
      cur.prizes.filter((p) => p.kind !== 'NONE'),
      Array.from({ length: 9 }, (_, i) => ({ label: `Ô ${i}`, kind: 'NONE', value: 0, weight: 1 })),
      cur.prizes.map((p) => ({ ...p, weight: 0 })),
      cur.prizes.map((p, i) => (i === 0 ? { ...p, weight: -1 } : p)),
    ];
    for (const prizes of bad) assert.equal((await call(admin, 'put', '/api/admin/lucky-spin', { ...base, prizes })).status, 400);
    assert.equal((await call(staff, 'get', '/api/admin/lucky-spin')).status, 403);
    const saved = ok(
      await call(admin, 'put', '/api/admin/lucky-spin', {
        ...base,
        prizes: [...cur.prizes.map((p) => (p.kind === 'AMOUNT' ? { ...p, label: 'Tặng topping', value: 7000 } : p))],
      }),
    );
    assert.deepEqual(
      saved.prizes.find((p) => p.kind === 'AMOUNT'),
      { ...cur.prizes.find((p) => p.kind === 'AMOUNT'), label: 'Tặng topping', value: 7000 },
    );
    const [{ spins, wins }] = await q1(
      "SELECT COUNT(*) AS spins, SUM(CASE WHEN Kind <> 'NONE' THEN 1 ELSE 0 END) AS wins FROM dbo.LuckySpins WHERE SpunAt IS NOT NULL",
    );
    assert.deepEqual([saved.stats.spins, saved.stats.wins], [spins, wins]);
  });

  test('AC-065-06: voucher trúng dùng được ở lần thu sau (mã ở khung thu tiền); hết hạn thì không dùng được', async () => {
    const t = tokenOf(await receiptSpin((await sale(4)).orderId));
    const won = await spinService.spin(t, () => 0);
    const code = won.result.voucher.code;
    const next = ok(
      await call(staff, 'post', '/api/orders/takeaway', {
        items: [{ menuItemId: ids['Nước suối'], quantity: 5 }],
        amountReceived: 5_000_000,
        voucherCode: code,
      }),
      201,
    );
    const [p] = await q1(`SELECT VoucherDiscount, AmountDue FROM dbo.Payments WHERE OrderId = ${next.order.orderId}`);
    assert.equal(Number(p.VoucherDiscount), 5000, '10% của 50.000đ');
    const [v] = await q1(`SELECT UsedAt FROM dbo.Vouchers WHERE Code = '${code}'`);
    assert.ok(v.UsedAt);
    assert.ok(ok(await call(admin, 'get', '/api/admin/lucky-spin')).stats.used >= 1);

    const t2 = tokenOf(await receiptSpin((await sale(4)).orderId));
    const code2 = (await spinService.spin(t2, () => 0)).result.voucher.code;
    await pool.request().query(`UPDATE dbo.Vouchers SET ExpiresAt = DATEADD(MINUTE, -1, SYSUTCDATETIME()) WHERE Code = '${code2}'`);
    const check = ok(await call(staff, 'post', '/api/vouchers/validate', { code: code2 }));
    assert.equal(check.valid, false);
  });
});
