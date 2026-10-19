// Integration test (SQL Server thật) giai đoạn 7 — ADR-006: tích điểm đổi quà & tem (F-039), giới thiệu bạn + voucher (F-038),
// chiến dịch theo phân khúc (F-037). Bất biến thêm (helpers/testDb.js): sổ điểm khớp số dư; điểm tích = dòng EARN; voucher đã dùng
// gắn đúng lượt thu; thẻ tem không vượt số tem yêu cầu; breakdown lượt thu gồm voucher + đổi thưởng.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, program, rewards, zaloOa, config;
const q1 = async (s) => (await pool.request().query(s)).recordset;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
let phoneSeq = 900000;
async function register(name, extra = {}) {
  phoneSeq += 1;
  const phone = `0909${phoneSeq}`;
  const r = await call(staff, 'post', '/api/members', { phone, fullName: name, consent: true, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { ...r.body, phone };
}
async function takeaway(memberId, items, extra = {}) {
  const r = await call(staff, 'post', '/api/orders/takeaway', { items, amountReceived: 5_000_000, memberId, ...extra });
  return r;
}
const coffee = (quantity) => [{ menuItemId: ids['Cà phê đen'], quantity }];
const memberRow = async (id) => (await q1(`SELECT * FROM dbo.Members WHERE MemberId = ${id}`))[0];
const card = async (memberId) => (await q1(`SELECT * FROM dbo.StampCards WHERE MemberId = ${memberId} AND ProgramId = ${program.programId}`))[0];

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  zaloOa = await import('../src/channels/zaloOa.js');
  ({ config } = await import('../src/config.js'));
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  assert.equal((await call(staff, 'post', '/api/shifts/open', { openingCash: 0 })).status, 201);
  const p = await call(admin, 'post', '/api/admin/stamp-programs', {
    name: 'Thẻ cà phê',
    requiredStamps: 10,
    menuItemIds: [ids['Cà phê đen'], ids['Bạc xỉu']],
  });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  program = p.body;
  const r1 = await call(admin, 'post', '/api/admin/rewards', { name: 'Giảm 20.000đ', pointsCost: 100, rewardType: 'DISCOUNT', discountAmount: 20000 });
  const r2 = await call(admin, 'post', '/api/admin/rewards', { name: 'Tặng nước suối', pointsCost: 50, rewardType: 'FREE_ITEM', menuItemId: ids['Nước suối'] });
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  assert.equal(r2.status, 201, JSON.stringify(r2.body));
  rewards = { discount: r1.body, freeWater: r2.body };
});

after(() => app.close());

// ===================== F-039 =====================
describe('Tích điểm đổi quà & tem (F-039)', () => {
  test('điểm = ⌊thực trả / 10.000⌋, ghi sổ EARN; mua 2 ly thuộc chương trình → +2 tem; bill có dòng "Tích +N điểm"', async () => {
    const m = await register('Khách Điểm');
    const r = await takeaway(m.memberId, coffee(2));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const due = r.body.payment.amountDue;
    assert.equal(r.body.payment.pointsEarned, Math.floor(due / 10000));
    assert.equal(r.body.payment.stampsEarned, 2);
    assert.equal((await memberRow(m.memberId)).Points, Math.floor(due / 10000));
    const c = await card(m.memberId);
    assert.deepEqual([c.Stamps, c.CompletedCards, c.RewardsAvailable], [2, 0, 0]);
    const bill = await call(staff, 'get', `/api/orders/${r.body.order.orderId}/receipt`);
    assert.ok(bill.body.breakdown.some((b) => b.key === 'points' && b.label === `Tích +${Math.floor(due / 10000)} điểm`));
    const pricing = await import('../src/pricing/pricing.js');
    assert.equal(pricing.pointsFor(125_000), 12); // AC: trả 125.000 → +12 điểm
  });

  test('đủ 10 tem → thẻ hoàn thành, tem về 0, có 1 lượt món miễn phí; dùng lượt → giảm đúng giá 1 ly, món tặng không tích tem', async () => {
    const m = await register('Khách Tem');
    assert.equal((await takeaway(m.memberId, coffee(4))).status, 201);
    assert.equal((await takeaway(m.memberId, [{ menuItemId: ids['Bạc xỉu'], quantity: 6 }])).status, 201);
    let c = await card(m.memberId);
    assert.deepEqual([c.Stamps, c.CompletedCards, c.RewardsAvailable], [0, 1, 1]);
    const summary = await call(staff, 'get', `/api/members/${m.memberId}/loyalty`);
    assert.match(summary.body.stampCards[0].text, /có 1 lượt món miễn phí/);
    const q = await call(staff, 'post', '/api/orders/takeaway/quote', {
      items: coffee(2),
      memberId: m.memberId,
      reward: { type: 'STAMP', programId: program.programId },
    });
    assert.equal(q.status, 200, JSON.stringify(q.body));
    assert.equal(q.body.totals.rewardDiscount, 25000);
    assert.deepEqual(q.body.totals.stampsEarned, [{ programId: program.programId, name: 'Thẻ cà phê', stamps: 1 }]);
    const r = await takeaway(m.memberId, coffee(2), { reward: { type: 'STAMP', programId: program.programId } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.payment.rewardDiscount, 25000);
    c = await card(m.memberId);
    assert.deepEqual([c.Stamps, c.RewardsAvailable], [1, 0]);
    const again = await takeaway(m.memberId, coffee(1), { reward: { type: 'STAMP', programId: program.programId } });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'STAMP_REWARD_UNAVAILABLE');
  });

  test('đổi quà 100 điểm khi có 80 → 409; đủ điểm → giảm 20.000đ, trừ 100 điểm; quà tặng món phải có món trên bill; không dùng cùng giảm tay', async () => {
    const m = await register('Khách Đổi Quà');
    assert.equal((await call(admin, 'post', `/api/admin/members/${m.memberId}/points`, { delta: 80, reason: 'Tặng khai trương' })).status, 200);
    const short = await call(staff, 'post', '/api/orders/takeaway/quote', {
      items: coffee(2),
      memberId: m.memberId,
      reward: { type: 'POINTS', rewardId: rewards.discount.rewardId },
    });
    assert.equal(short.status, 409);
    assert.equal(short.body.code, 'POINTS_INSUFFICIENT');
    await call(admin, 'post', `/api/admin/members/${m.memberId}/points`, { delta: 40, reason: 'Bù điểm' });
    const withManual = await call(staff, 'post', '/api/orders/takeaway/quote', {
      items: coffee(2),
      memberId: m.memberId,
      reward: { type: 'POINTS', rewardId: rewards.discount.rewardId },
      manualDiscount: { kind: 'AMOUNT', value: 1000 },
      manualReason: 'x',
    });
    assert.equal(withManual.status, 400);
    assert.equal(withManual.body.code, 'REWARD_WITH_MANUAL');
    const noWater = await call(staff, 'post', '/api/orders/takeaway/quote', {
      items: coffee(1),
      memberId: m.memberId,
      reward: { type: 'POINTS', rewardId: rewards.freeWater.rewardId },
    });
    assert.equal(noWater.status, 409);
    assert.equal(noWater.body.code, 'REWARD_ITEM_NOT_IN_BILL');
    const r = await takeaway(m.memberId, coffee(4), { reward: { type: 'POINTS', rewardId: rewards.discount.rewardId } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.payment.rewardDiscount, 20000);
    assert.equal((await memberRow(m.memberId)).Points, 120 - 100 + r.body.payment.pointsEarned);
    assert.equal((await q1(`SELECT COUNT(*) AS N FROM dbo.RewardRedemptions WHERE MemberId = ${m.memberId}`))[0].N, 1);
  });

  test('hai quầy cùng đổi 100 điểm khi chỉ có 150 → đúng một lượt thành công', async () => {
    const m = await register('Khách Tranh Điểm');
    await call(admin, 'post', `/api/admin/members/${m.memberId}/points`, { delta: 150, reason: 'Test đồng thời' });
    const results = await Promise.all([1, 2].map(() => takeaway(m.memberId, coffee(2), { reward: { type: 'POINTS', rewardId: rewards.discount.rewardId } })));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409], JSON.stringify(results.map((r) => r.body)));
    const ok = results.find((r) => r.status === 201);
    assert.equal((await memberRow(m.memberId)).Points, 50 + ok.body.payment.pointsEarned);
  });

  test('hoàn tiền toàn bộ → trừ lại điểm đã tích, trả điểm đã đổi, trừ tem của đơn bị hủy', async () => {
    const m = await register('Khách Hoàn');
    await call(admin, 'post', `/api/admin/members/${m.memberId}/points`, { delta: 100, reason: 'Test hoàn' });
    const r = await takeaway(m.memberId, coffee(8), { reward: { type: 'POINTS', rewardId: rewards.discount.rewardId } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const earned = r.body.payment.pointsEarned;
    assert.ok(earned > 0);
    assert.equal((await memberRow(m.memberId)).Points, earned);
    assert.equal((await card(m.memberId)).Stamps, 8);
    const refund = await call(admin, 'post', `/api/payments/${r.body.payment.paymentId}/refunds`, {
      amount: r.body.payment.amountDue,
      reason: 'Khách trả lại cả đơn',
      restockInventory: false,
      orderIds: [],
    });
    assert.equal(refund.status, 201, JSON.stringify(refund.body));
    assert.equal((await memberRow(m.memberId)).Points, 100); // trả lại 100 điểm đã đổi, trừ điểm vừa tích
    assert.equal((await card(m.memberId)).Stamps, 0);
    const types = (await q1(`SELECT Type, Delta FROM dbo.PointTransactions WHERE PaymentId = ${r.body.payment.paymentId} ORDER BY PtId`)).map((x) => [
      x.Type,
      x.Delta,
    ]);
    assert.deepEqual(types, [
      ['REDEEM', -100],
      ['EARN', earned],
      ['REFUND', -earned],
      ['REFUND', 100],
    ]);
  });

  test('quản lý điều chỉnh điểm: thiếu lý do → 400; trừ quá số dư → 409; có nhật ký; trưởng ca không gọi được', async () => {
    const m = await register('Khách Điều Chỉnh');
    assert.equal((await call(admin, 'post', `/api/admin/members/${m.memberId}/points`, { delta: 10 })).status, 400);
    const over = await call(admin, 'post', `/api/admin/members/${m.memberId}/points`, { delta: -5, reason: 'nhầm' });
    assert.equal(over.status, 409);
    assert.equal(over.body.code, 'POINTS_INSUFFICIENT');
    const ok = await call(admin, 'post', `/api/admin/members/${m.memberId}/points`, { delta: 30, reason: 'Khách quen' });
    assert.deepEqual(ok.body, { points: 30 });
    const detail = await call(admin, 'get', `/api/admin/members/${m.memberId}/loyalty`);
    assert.equal(detail.body.pointHistory[0].note, 'Khách quen');
    const { flushAudit } = await import('../src/middleware/audit.js');
    await flushAudit();
    assert.ok((await q1(`SELECT COUNT(*) AS N FROM dbo.AuditLogs WHERE Action = 'members.points' AND EntityId = '${m.memberId}'`))[0].N >= 1);
  });

  test('khách gắn hội viên vào bàn → màn theo dõi thấy điểm + "còn N ly nữa được tặng", không thấy mã voucher', async () => {
    const m = await register('Khách Bàn');
    await takeaway(m.memberId, coffee(3));
    const C = await app.customer();
    const sessionId = await app.seat(C, '02');
    assert.equal((await C.post(`/api/sessions/${sessionId}/member`, { phone: m.phone })).status, 200);
    const d = await C.get(`/api/sessions/${sessionId}`);
    assert.equal(d.status, 200, JSON.stringify(d.body));
    const loyalty = d.body.member.loyalty;
    assert.ok(loyalty.points >= 0);
    assert.match(loyalty.stampCards[0].text, /3\/10 tem — còn 7 ly nữa được tặng/);
    assert.ok(loyalty.vouchers.every((v) => !('code' in v)));
  });
});

// ===================== F-038 =====================
describe('Giới thiệu bạn + voucher (F-038)', () => {
  let referrer, newbie, newbieVoucher;

  test('tự giới thiệu → 400; SĐT người giới thiệu không có → 404', async () => {
    referrer = await register('Người Giới Thiệu');
    const self = await call(staff, 'post', '/api/members', { phone: '0911222333', fullName: 'Tự Mình', consent: true, referrerPhone: '0911 222 333' });
    assert.equal(self.status, 400);
    assert.equal(self.body.code, 'SELF_REFERRAL');
    const none = await call(staff, 'post', '/api/members', { phone: '0911222334', fullName: 'Ai Đó', consent: true, referrerPhone: '0999999999' });
    assert.equal(none.status, 404);
    assert.equal(none.body.code, 'REFERRER_NOT_FOUND');
  });

  test('người mới thanh toán lần đầu ≥ 30.000đ → cả hai nhận voucher 10 %, hạn 30 ngày; quầy nhận realtime', async () => {
    newbie = await register('Bạn Mới', { referrerPhone: referrer.phone });
    assert.equal(newbie.referred, true);
    const sock = await app.connect({ auth: { token: staff } });
    const evt = app.waitFor(sock, 'member.vouchers_issued');
    const r = await takeaway(newbie.memberId, coffee(2)); // 50.000 − 10 % đơn đầu = 45.000
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const payload = await evt;
    assert.equal(payload.vouchers.length, 2);
    const vs = await q1(
      `SELECT MemberId, DiscountPercent, DATEDIFF(DAY, CreatedAt, ExpiresAt) AS Days, Source FROM dbo.Vouchers WHERE IssuedForPaymentId = ${r.body.payment.paymentId}`,
    );
    assert.deepEqual(vs.map((v) => v.MemberId).sort(), [referrer.memberId, newbie.memberId].sort());
    assert.ok(vs.every((v) => Number(v.DiscountPercent) === 10 && v.Days === 30 && v.Source === 'REFERRAL'));
    // lần thu sau không tặng thêm
    const r2 = await takeaway(newbie.memberId, coffee(2));
    assert.equal((await q1(`SELECT COUNT(*) AS N FROM dbo.Vouchers WHERE IssuedForPaymentId = ${r2.body.payment.paymentId}`))[0].N, 0);
    newbieVoucher = (await call(staff, 'get', `/api/members/${newbie.memberId}/vouchers`)).body[0];
    assert.equal(newbieVoucher.source, 'REFERRAL');
  });

  test('lần thu đầu < 30.000đ → không tặng voucher (D-28: lần đầu)', async () => {
    const small = await register('Bạn Mua Ít', { referrerPhone: referrer.phone });
    const r = await takeaway(small.memberId, [{ menuItemId: ids['Nước suối'], quantity: 1 }]);
    assert.equal(r.status, 201);
    const r2 = await takeaway(small.memberId, coffee(4));
    assert.equal(r2.status, 201);
    assert.equal((await q1(`SELECT COUNT(*) AS N FROM dbo.Vouchers WHERE MemberId = ${small.memberId}`))[0].N, 0);
  });

  test('dùng voucher: giảm 10 % sau hội viên; dùng lần 2 → 409; voucher người khác → 409; hết hạn → 409; mã sai → 404', async () => {
    const vq = await call(staff, 'post', '/api/vouchers/validate', { code: newbieVoucher.code.toLowerCase(), memberId: newbie.memberId });
    assert.equal(vq.body.valid, true);
    const wrongOwner = await call(staff, 'post', '/api/vouchers/validate', { code: newbieVoucher.code, memberId: referrer.memberId });
    assert.deepEqual([wrongOwner.body.valid, wrongOwner.body.code], [false, 'VOUCHER_NOT_OWNER']);
    const items = [{ menuItemId: ids['Bạc xỉu'], quantity: 2 }];
    const r = await takeaway(newbie.memberId, items, { voucherCode: newbieVoucher.code });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const t = r.body.totals;
    assert.equal(t.voucherDiscount, Math.round(((t.ordersTotal - t.memberDiscount) * 10) / 100));
    assert.equal(r.body.payment.voucherCode, newbieVoucher.code);
    const reuse = await takeaway(newbie.memberId, items, { voucherCode: newbieVoucher.code });
    assert.equal(reuse.status, 409);
    assert.equal(reuse.body.code, 'VOUCHER_USED');
    const refV = (await call(staff, 'get', `/api/members/${referrer.memberId}/vouchers`)).body[0];
    const notOwner = await takeaway(newbie.memberId, items, { voucherCode: refV.code });
    assert.equal(notOwner.status, 409);
    assert.equal(notOwner.body.code, 'VOUCHER_NOT_OWNER');
    await pool.request().query(`UPDATE dbo.Vouchers SET ExpiresAt = DATEADD(MINUTE, -1, SYSUTCDATETIME()) WHERE Code = '${refV.code}'`);
    const expired = await takeaway(referrer.memberId, items, { voucherCode: refV.code });
    assert.equal(expired.status, 409);
    assert.equal(expired.body.code, 'VOUCHER_EXPIRED');
    assert.equal((await takeaway(null, items, { voucherCode: 'KHONGCO' })).status, 404);
  });

  test('voucher tay của quản lý (không gắn hội viên): ai cũng dùng được; hai quầy dùng cùng lúc → một bên thắng', async () => {
    const v = await call(admin, 'post', '/api/admin/vouchers', { amount: 10000, days: 7, minOrderAmount: 20000 });
    assert.equal(v.status, 201, JSON.stringify(v.body));
    const small = await takeaway(null, [{ menuItemId: ids['Nước suối'], quantity: 1 }], { voucherCode: v.body.code });
    assert.equal(small.status, 409);
    assert.equal(small.body.code, 'VOUCHER_MIN_ORDER');
    const both = await Promise.all([1, 2].map(() => takeaway(null, coffee(1), { voucherCode: v.body.code })));
    assert.deepEqual(both.map((r) => r.status).sort(), [201, 409], JSON.stringify(both.map((r) => r.body)));
    assert.equal(both.find((r) => r.status === 201).body.payment.voucherDiscount, 10000);
  });

  test('tối đa 5 lượt giới thiệu / tháng / người: đăng ký đồng thời không vượt giới hạn', async () => {
    const host = await register('Người Giới Thiệu Nhiều');
    for (let i = 0; i < 3; i += 1) await register(`Bạn ${i}`, { referrerPhone: host.phone });
    const burst = await Promise.all(
      [0, 1, 2, 3].map((i) =>
        call(staff, 'post', '/api/members', { phone: `090877766${i}`, fullName: `Bạn đồng thời ${i}`, consent: true, referrerPhone: host.phone }),
      ),
    );
    assert.deepEqual(burst.map((r) => r.status).sort(), [201, 201, 409, 409], JSON.stringify(burst.map((r) => r.body)));
    assert.ok(burst.filter((r) => r.status === 409).every((r) => r.body.code === 'REFERRAL_LIMIT'));
    assert.equal((await q1(`SELECT COUNT(*) AS N FROM dbo.Members WHERE ReferredByMemberId = ${host.memberId}`))[0].N, 5);
  });
});

// ===================== F-037 =====================
describe('Chiến dịch theo phân khúc (F-037)', () => {
  const seeded = {};
  let segmentId, campaignId;
  const rule = { tierIn: ['LOYAL'], lastVisitDaysGte: 30 };

  before(async () => {
    for (const [key, tier, daysAgo, optOut] of [
      ['a', 'LOYAL', 40, 0],
      ['b', 'LOYAL', 45, 0],
      ['recent', 'LOYAL', 5, 0],
      ['member', 'MEMBER', 40, 0],
      ['opt', 'LOYAL', 40, 1],
    ]) {
      const m = await register(`Phân khúc ${key}`);
      seeded[key] = m;
      await pool
        .request()
        .query(
          `UPDATE dbo.Members SET TierCode = '${tier}', LastVisitAt = DATEADD(DAY, -${daysAgo}, SYSUTCDATETIME()), CreatedAt = DATEADD(DAY, -60, SYSUTCDATETIME()), OptOut = ${optOut} WHERE MemberId = ${m.memberId}`,
        );
    }
  });

  test('phân khúc "Thân thiết, 30 ngày chưa ghé" trả đúng tập; người từ chối nhận tin bị loại (đếm riêng)', async () => {
    const pv = await call(admin, 'post', '/api/admin/segments/preview', { rule });
    assert.equal(pv.status, 200, JSON.stringify(pv.body));
    assert.deepEqual(pv.body.sample.map((s) => s.memberId).sort(), [seeded.a.memberId, seeded.b.memberId].sort());
    assert.equal(pv.body.count, 2);
    assert.equal(pv.body.optedOut, 1);
    assert.ok(pv.body.sample.every((s) => s.phone.includes('*')));
    const bad = await call(admin, 'post', '/api/admin/segments/preview', { rule: { lạ: 1 } });
    assert.equal(bad.status, 400);
    const s = await call(admin, 'post', '/api/admin/segments', { name: 'Thân thiết lâu chưa ghé', rule });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    segmentId = s.body.segmentId;
  });

  test('chạy chiến dịch EXPORT: mỗi người một voucher riêng; CSV đúng số dòng, SĐT đầy đủ + nhật ký; chạy lại → 409', async () => {
    const c = await call(admin, 'post', '/api/admin/campaigns', {
      name: 'Nhớ bạn',
      segmentId,
      channel: 'EXPORT',
      messageTemplate: 'Chào {name}, quán tặng bạn mã {voucher}, hạn {expires}.',
      voucherPercent: 15,
      voucherDays: 7,
    });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    campaignId = c.body.campaignId;
    assert.equal(c.body.status, 'DRAFT');
    const run = await call(admin, 'post', `/api/admin/campaigns/${campaignId}/run`);
    assert.equal(run.status, 200, JSON.stringify(run.body));
    assert.deepEqual(run.body.result, { delivered: 2, skipped: 0, failed: 0 });
    assert.equal(run.body.status, 'DONE');
    const vs = await q1(`SELECT MemberId, DiscountPercent FROM dbo.Vouchers WHERE CampaignId = ${campaignId}`);
    assert.deepEqual(vs.map((v) => v.MemberId).sort(), [seeded.a.memberId, seeded.b.memberId].sort());
    const csv = await call(admin, 'get', `/api/admin/campaigns/${campaignId}/export.csv`);
    assert.equal(csv.status, 200);
    const lines = csv.text.trim().split('\r\n');
    assert.equal(lines.length, 3);
    assert.ok(lines.some((l) => l.includes(seeded.a.phone)));
    assert.ok(lines[1].includes('giảm 15%'));
    const [{ N }] = await q1(`SELECT COUNT(*) AS N FROM dbo.AuditLogs WHERE Action = 'campaigns.export' AND EntityId = '${campaignId}'`);
    assert.equal(N, 1);
    const again = await call(admin, 'post', `/api/admin/campaigns/${campaignId}/run`);
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'CAMPAIGN_NOT_RUNNABLE');
  });

  test('chiến dịch thứ hai trong 7 ngày → mọi người bị bỏ qua có lý do, không tạo voucher', async () => {
    const c = await call(admin, 'post', '/api/admin/campaigns', {
      name: 'Gửi lại',
      segmentId,
      channel: 'EXPORT',
      messageTemplate: 'Chào {name}',
      voucherPercent: 10,
      voucherDays: 3,
    });
    const run = await call(admin, 'post', `/api/admin/campaigns/${c.body.campaignId}/run`);
    assert.deepEqual(run.body.result, { delivered: 0, skipped: 2, failed: 0 });
    const d = await call(admin, 'get', `/api/admin/campaigns/${c.body.campaignId}`);
    assert.ok(d.body.deliveries.every((x) => x.status === 'SKIPPED' && /7 ngày/.test(x.error)));
    assert.equal((await q1(`SELECT COUNT(*) AS N FROM dbo.Vouchers WHERE CampaignId = ${c.body.campaignId}`))[0].N, 0);
  });

  test('Zalo OA: chưa có token → 400; có token (kênh giả) → gửi từng người, lỗi ghi FAILED; SMS chưa hỗ trợ', async () => {
    const base = { name: 'Zalo', segmentId, messageTemplate: 'Chào {name}' };
    assert.equal((await call(admin, 'post', '/api/admin/campaigns', { ...base, channel: 'ZALO_OA' })).body.code, 'CHANNEL_NOT_CONFIGURED');
    assert.equal((await call(admin, 'post', '/api/admin/campaigns', { ...base, channel: 'SMS' })).body.code, 'CHANNEL_NOT_SUPPORTED');
    await pool.request().query(`UPDATE dbo.Members SET LastContactedAt = NULL WHERE MemberId IN (${seeded.a.memberId}, ${seeded.b.memberId})`);
    config.zaloOa.token = 'test-token';
    const sent = [];
    zaloOa.setSender(async ({ phone, text }) => {
      sent.push({ phone, text });
      return phone === seeded.b.phone ? { ok: false, error: 'User chưa quan tâm OA' } : { ok: true };
    });
    try {
      const c = await call(admin, 'post', '/api/admin/campaigns', { ...base, channel: 'ZALO_OA' });
      assert.equal(c.status, 201, JSON.stringify(c.body));
      const run = await call(admin, 'post', `/api/admin/campaigns/${c.body.campaignId}/run`);
      assert.deepEqual(run.body.result, { delivered: 1, skipped: 0, failed: 1 });
      assert.equal(sent.length, 2);
      assert.ok(sent.some((s) => s.text === 'Chào Phân khúc a'));
    } finally {
      config.zaloOa.token = '';
      zaloOa.setSender(null);
    }
  });

  test('hẹn giờ → job chạy khi đến giờ; hiệu quả: voucher đã dùng, doanh thu, khách quay lại trong 14 ngày', async () => {
    await pool.request().query(`UPDATE dbo.Members SET LastContactedAt = NULL WHERE MemberId IN (${seeded.a.memberId}, ${seeded.b.memberId})`);
    const c = await call(admin, 'post', '/api/admin/campaigns', {
      name: 'Hẹn giờ',
      segmentId,
      channel: 'EXPORT',
      messageTemplate: '{name}: {voucher}',
      voucherPercent: 20,
      voucherDays: 5,
      scheduledAt: new Date(Date.now() + 3600e3).toISOString(),
    });
    assert.equal(c.body.status, 'SCHEDULED');
    await pool.request().query(`UPDATE dbo.Campaigns SET ScheduledAt = DATEADD(MINUTE, -1, SYSUTCDATETIME()) WHERE CampaignId = ${c.body.campaignId}`);
    const job = await call(admin, 'post', '/api/admin/jobs/campaigns-due/run');
    assert.equal(job.status, 200, JSON.stringify(job.body));
    const code = (await q1(`SELECT Code FROM dbo.Vouchers WHERE CampaignId = ${c.body.campaignId} AND MemberId = ${seeded.a.memberId}`))[0].Code;
    const pay = await takeaway(seeded.a.memberId, coffee(2), { voucherCode: code });
    assert.equal(pay.status, 201, JSON.stringify(pay.body));
    const d = await call(admin, 'get', `/api/admin/campaigns/${c.body.campaignId}`);
    assert.equal(d.body.status, 'DONE');
    assert.deepEqual(d.body.effectiveness, { vouchersUsed: 1, revenue: pay.body.payment.amountDue, returned14d: 1 });
    assert.ok(d.body.deliveries.every((x) => x.phone.includes('*')));
  });

  test('từ chối nhận tin (opt-out) → không còn trong phân khúc', async () => {
    assert.equal((await call(admin, 'patch', `/api/admin/members/${seeded.b.memberId}/opt-out`, { optOut: true })).status, 200);
    const pv = await call(admin, 'post', '/api/admin/segments/preview', { rule });
    assert.deepEqual(pv.body.sample, []); // a vừa ghé (không còn "30 ngày chưa ghé"), b từ chối nhận tin
    assert.equal(pv.body.optedOut, 2);
  });
});
