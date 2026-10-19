// Integration test (SQL Server thật): F-014 Hội viên, F-018 Chốt ca, F-022 Giảm giá tay — mục "Kiểm" của skill extend-features.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import supertest from 'supertest';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, shiftId;

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
});

after(() => app.close());

const member = async (phone) => (await pool.request().query(`SELECT * FROM dbo.Members WHERE Phone = '${phone}'`)).recordset[0];

describe('Chốt ca (F-018)', () => {
  test('chưa mở ca → thu tiền 409 NO_OPEN_SHIFT; mở ca; mở lần 2 → 409', async () => {
    const r = await api
      .post('/api/orders/takeaway')
      .set(auth(staff))
      .send({ items: [{ menuItemId: ids['Nước suối'], quantity: 1 }], amountReceived: 10000 });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'NO_OPEN_SHIFT');
    assert.equal((await api.get('/api/shifts/current').set(auth(staff))).body.shift, null);
    const o = await api.post('/api/shifts/open').set(auth(staff)).send({ openingCash: 500000 });
    assert.equal(o.status, 201);
    shiftId = o.body.shift.shiftId;
    const again = await api.post('/api/shifts/open').set(auth(admin)).send({ openingCash: 0 });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'SHIFT_ALREADY_OPEN');
  });
});

describe('Hội viên (F-014)', () => {
  let A, B, sessionA, staffSock;

  test('SĐT sai định dạng → 400; chưa có → found=false; đăng ký phải đồng ý; trùng → 409', async () => {
    A = await app.customer();
    assert.equal((await A.post('/api/members/lookup', { phone: '12345' })).body.code, 'INVALID_PHONE');
    const none = await A.post('/api/members/lookup', { phone: '0912 345 678' });
    assert.deepEqual(none.body, { found: false, member: null });
    const noConsent = await A.post('/api/members', { phone: '0912345678', fullName: 'Nguyễn Văn An' });
    assert.equal(noConsent.status, 400);
    assert.equal(noConsent.body.code, 'CONSENT_REQUIRED');
    const r = await A.post('/api/members', { phone: '0912.345.678', fullName: 'Nguyễn Văn An', consent: true });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.maskedName, 'Nguyễn V. A.');
    assert.equal(r.body.fullName, undefined, 'khách không thấy tên đầy đủ');
    assert.equal(r.body.firstOrderDiscount, true);
    assert.equal(r.body.firstOrderPercent, 10);
    assert.equal((await member('+84912345678')).TierCode, 'MEMBER');
    const dup = await A.post('/api/members', { phone: '+84912345678', fullName: 'Trần Thị B', consent: true });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.code, 'PHONE_EXISTS');
  });

  test('gắn hội viên vào phiên: khách khác 403; quầy nhận session.member_changed; quầy tra cứu thấy tên đầy đủ', async () => {
    sessionA = await app.seat(A, '01');
    B = await app.customer();
    await app.seat(B, '02');
    staffSock = await app.connect({ auth: { token: staff } });
    assert.equal((await B.post(`/api/sessions/${sessionA}/member`, { phone: '0912345678' })).status, 403);
    const evt = app.waitFor(staffSock, 'session.member_changed', (p) => p.sessionId === sessionA);
    const r = await A.post(`/api/sessions/${sessionA}/member`, { phone: '0912345678' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.member.maskedName, 'Nguyễn V. A.');
    assert.equal((await evt).member.maskedName, 'Nguyễn V. A.');
    const detail = await A.get(`/api/sessions/${sessionA}`);
    assert.equal(detail.body.member.maskedName, 'Nguyễn V. A.');
    assert.equal(detail.body.member.fullName, undefined);
    const s = await api.post('/api/members/lookup').set(auth(staff)).send({ phone: '0912345678' });
    assert.equal(s.body.member.fullName, 'Nguyễn Văn An');
  });

  test('đơn đầu −10% tính lúc thu tiền + làm tròn xuống 500đ; bill có dòng hội viên; cộng TotalSpent/điểm', async () => {
    const o = await A.post('/api/orders', {
      sessionId: sessionA,
      items: [
        { menuItemId: ids['Cà phê sữa'], quantity: 2 },
        { menuItemId: ids['Trà đào'], quantity: 1 },
      ],
    });
    assert.equal(o.status, 201);
    assert.equal(o.body.totalAmount, 93000);
    const est = await A.get(`/api/sessions/${sessionA}`);
    assert.equal(est.body.bill.amountDue, 83500, 'khách thấy ước tính sau ưu đãi');
    await api.post(`/api/orders/${o.body.orderId}/accept`).set(auth(staff));
    const pv = await api.post(`/api/sessions/${sessionA}/settle/preview`).set(auth(staff)).send({});
    assert.equal(pv.status, 200, JSON.stringify(pv.body));
    assert.equal(pv.body.totals.memberDiscount, 9300);
    assert.equal(pv.body.totals.roundingAdj, 200);
    assert.equal(pv.body.totals.amountDue, 83500);
    assert.equal(pv.body.member.fullName, 'Nguyễn Văn An');
    const old = await api.post(`/api/sessions/${sessionA}/settle`).set(auth(staff)).send({ amountReceived: 100000, expectedAmountDue: 93000 });
    assert.equal(old.body.code, 'AMOUNT_CHANGED', 'POS hiển thị số cũ (chưa trừ hội viên) → phải xem lại');
    const r = await api.post(`/api/sessions/${sessionA}/settle`).set(auth(staff)).send({ amountReceived: 100000, expectedAmountDue: 83500 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.payment.amountDue, 83500);
    assert.equal(r.body.payment.changeGiven, 16500);
    assert.equal(r.body.payment.memberDiscount, 9300);
    assert.equal(r.body.payment.shiftId, shiftId);
    const bill = await api.get(`/api/sessions/${sessionA}/receipt?mode=final`).set(auth(staff));
    assert.deepEqual(
      bill.body.breakdown.map((b) => [b.key, b.amount]),
      [
        ['subtotal', 93000],
        ['member', -9300],
        ['rounding', -200],
        ['total', 83500],
        ['points', null], // F-039: dòng thông tin "Tích +8 điểm" cuối bill
      ],
    );
    assert.match(bill.body.breakdown[1].label, /Hội viên Nguyễn Văn An −10%/);
    assert.equal(bill.body.breakdown.at(-1).label, 'Tích +8 điểm');
    const m = await member('+84912345678');
    assert.equal(Number(m.TotalSpent), 83500);
    assert.equal(m.VisitCount, 1);
    assert.equal(m.Points, 8); // ADR-006 D-27: 1 điểm / 10.000đ thực trả (trước 0029: 1 / 1.000đ)
    assert.equal(m.FirstOrderDiscountUsed, true);
  });

  test('lần sau: tra cứu thấy tên che, −3%; mang đi vượt 1.000.000đ lũy kế → lên Thân thiết (5%)', async () => {
    const C = await app.customer();
    const l = await C.post('/api/members/lookup', { phone: '0912345678' });
    assert.equal(l.body.member.maskedName, 'Nguyễn V. A.');
    assert.equal(l.body.member.discountPercent, 3);
    assert.equal(l.body.member.firstOrderDiscount, false);
    const memberId = l.body.member.memberId;
    const items = [
      { menuItemId: ids['Nước suối'], quantity: 50 },
      { menuItemId: ids['Bánh croissant'], quantity: 50 },
    ];
    const q = await api.post('/api/orders/takeaway/quote').set(auth(staff)).send({ items, memberId });
    assert.equal(q.body.totals.memberDiscount, 52500);
    assert.equal(q.body.totals.amountDue, 1697500);
    const r = await api.post('/api/orders/takeaway').set(auth(staff)).send({ items, memberId, amountReceived: 1700000, expectedAmountDue: 1697500 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.payment.member.fullName, 'Nguyễn Văn An');
    const tx = (await pool.request().query(`SELECT TOP 1 * FROM dbo.MemberTransactions WHERE MemberId = ${memberId} ORDER BY TxnId DESC`)).recordset[0];
    assert.equal(tx.TierBefore, 'MEMBER');
    assert.equal(tx.TierAfter, 'LOYAL');
    assert.equal((await C.post('/api/members/lookup', { phone: '0912345678' })).body.member.discountPercent, 5);
    await api.post(`/api/orders/${r.body.order.orderId}/complete`).set(auth(staff));
  });
});

describe('Giảm giá tay (F-022)', () => {
  const items = () => [{ menuItemId: ids['Bánh croissant'], quantity: 4 }]; // 100.000đ

  test('thiếu lý do → 400; trong ngưỡng (≤10% và ≤20.000đ) nhân viên tự giảm, không ghi người duyệt', async () => {
    const noReason = await api
      .post('/api/orders/takeaway')
      .set(auth(staff))
      .send({ items: items(), manualDiscount: { kind: 'AMOUNT', value: 5000 }, amountReceived: 100000 });
    assert.equal(noReason.status, 400);
    const r = await api
      .post('/api/orders/takeaway')
      .set(auth(staff))
      .send({ items: items(), manualDiscount: { kind: 'PERCENT', value: 10 }, manualReason: 'Khách quen', amountReceived: 100000 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.payment.manualDiscount, 10000);
    assert.equal(r.body.payment.amountDue, 90000);
    assert.equal(r.body.payment.approvedBy, null);
    assert.equal(r.body.payment.manualReason, 'Khách quen');
  });

  test('vượt ngưỡng: không có quản lý → 403 ADMIN_APPROVAL_REQUIRED; sai mật khẩu → 403; đúng → ghi người duyệt', async () => {
    const body = { items: items(), manualDiscount: { kind: 'AMOUNT', value: 20000 }, manualReason: 'Đền bù chờ lâu', amountReceived: 100000 };
    const q = await api.post('/api/orders/takeaway/quote').set(auth(staff)).send(body);
    assert.equal(q.body.needsApproval, true);
    const no = await api.post('/api/orders/takeaway').set(auth(staff)).send(body);
    assert.equal(no.status, 403);
    assert.equal(no.body.code, 'ADMIN_APPROVAL_REQUIRED');
    const bad = await api
      .post('/api/orders/takeaway')
      .set(auth(staff))
      .send({ ...body, adminUsername: 'admin', adminPassword: 'sai' });
    assert.equal(bad.body.code, 'ADMIN_APPROVAL_INVALID');
    const staffAsAdmin = await api
      .post('/api/orders/takeaway')
      .set(auth(staff))
      .send({ ...body, adminUsername: 'staff1', adminPassword: 'Staff@123' });
    assert.equal(staffAsAdmin.body.code, 'ADMIN_APPROVAL_INVALID', 'tài khoản nhân viên không duyệt được');
    const ok = await api
      .post('/api/orders/takeaway')
      .set(auth(staff))
      .send({ ...body, adminUsername: 'admin', adminPassword: 'Admin@123' });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.payment.amountDue, 80000);
    assert.equal(ok.body.payment.approvedBy, 'Quản lý');
    const adminSelf = await api.post('/api/orders/takeaway').set(auth(admin)).send(body);
    assert.equal(adminSelf.status, 201, 'quản lý tự duyệt');
  });
});

describe('Đóng ca (F-018)', () => {
  test('đóng ca: tiền dự kiến = đầu ca + Σ đã thu; chênh lệch âm; ca đã đóng không đóng lại; sau đó thu tiền → 409', async () => {
    const cur = (await api.get('/api/shifts/current').set(auth(staff))).body.shift;
    const collected = Number((await pool.request().query(`SELECT SUM(AmountDue) AS s FROM dbo.Payments WHERE ShiftId = ${shiftId}`)).recordset[0].s);
    assert.equal(cur.expectedCash, 500000 + collected);
    const r = await api
      .post(`/api/shifts/${shiftId}/close`)
      .set(auth(staff))
      .send({ countedCash: cur.expectedCash - 2000, note: 'Thiếu 2k' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.shift.difference, -2000);
    assert.equal(r.body.shift.status, 'CLOSED');
    assert.ok(r.body.report.byStaff.length >= 1);
    assert.ok(r.body.report.discounts.member > 0 && r.body.report.discounts.manual > 0);
    assert.equal((await api.post(`/api/shifts/${shiftId}/close`).set(auth(staff)).send({ countedCash: 0 })).body.code, 'SHIFT_NOT_OPEN');
    const t = await api
      .post('/api/orders/takeaway')
      .set(auth(staff))
      .send({ items: [{ menuItemId: ids['Nước suối'], quantity: 1 }], amountReceived: 10000 });
    assert.equal(t.body.code, 'NO_OPEN_SHIFT');
    const list = await api.get(`/api/admin/shifts?from=2026-01-01&to=2099-12-31`).set(auth(admin));
    assert.equal(list.body[0].difference, -2000);
  });
});

describe('Quản lý hội viên + quyền + dữ liệu cá nhân (D-16)', () => {
  test('khách gọi API quản lý → 401, nhân viên → 403; danh sách che số; tìm theo SĐT đầy đủ', async () => {
    assert.equal((await api.get('/api/admin/members')).status, 401);
    assert.equal((await api.get('/api/admin/members').set(auth(staff))).status, 403);
    const l = await api.get('/api/admin/members?q=0912345678').set(auth(admin));
    assert.equal(l.body.total, 1);
    assert.equal(l.body.items[0].phone, '09xx***678');
    assert.equal(l.body.items[0].tierCode, 'LOYAL');
    const byName = await api.get(`/api/admin/members?q=${encodeURIComponent('Văn An')}`).set(auth(admin));
    assert.equal(byName.body.total, 1);
  });

  test('ẩn danh theo yêu cầu: không còn tên/SĐT, tra cứu không thấy, thanh toán vẫn đủ; SĐT đăng ký lại được', async () => {
    const id = (await member('+84912345678')).MemberId;
    const r = await api.post(`/api/admin/members/${id}/anonymize`).set(auth(admin));
    assert.equal(r.status, 200);
    assert.equal(r.body.fullName, '(đã ẩn danh)');
    const row = (await pool.request().query(`SELECT * FROM dbo.Members WHERE MemberId = ${id}`)).recordset[0];
    assert.match(row.Phone, /^anon:[0-9a-f]{64}$/);
    assert.equal(row.IsActive, false);
    const pays = (await pool.request().query(`SELECT COUNT(*) AS n, SUM(AmountDue) AS s FROM dbo.Payments WHERE MemberId = ${id}`)).recordset[0];
    assert.equal(pays.n, 2);
    assert.equal(Number(pays.s), 83500 + 1697500);
    const C = await app.customer();
    assert.equal((await C.post('/api/members/lookup', { phone: '0912345678' })).body.found, false);
    assert.equal((await api.get('/api/admin/members?q=0912345678').set(auth(admin))).body.total, 0);
    assert.equal((await C.post('/api/members', { phone: '0912345678', fullName: 'Nguyễn Văn An', consent: true })).status, 201);
  });

  test('hạng hội viên: sửa % và mức chi tiêu', async () => {
    const tiers = (await api.get('/api/admin/member-tiers').set(auth(admin))).body;
    assert.deepEqual(
      tiers.map((t) => [t.tierCode, t.minSpent, t.discountPercent]),
      [
        ['MEMBER', 0, 3],
        ['LOYAL', 1000000, 5],
        ['VIP', 3000000, 8],
      ],
    );
    const r = await api
      .put('/api/admin/member-tiers')
      .set(auth(admin))
      .send(tiers.map((t) => (t.tierCode === 'VIP' ? { ...t, discountPercent: 10 } : t)));
    assert.equal(r.body.find((t) => t.tierCode === 'VIP').discountPercent, 10);
  });
});

describe('Giới hạn tra cứu hội viên (D-6)', () => {
  test('11 lần/phút từ một IP → 429; nhân viên đăng nhập không bị giới hạn', async () => {
    const { createMemberLimiters } = await import('../src/middleware/rateLimit.js');
    const mini = express();
    mini.use((req, _res, next) => {
      req.clientToken = req.get('x-client') || 'c1';
      req.user = req.get('x-staff') ? { userId: 1 } : null;
      next();
    });
    mini.post('/lookup', ...createMemberLimiters(), (_req, res) => res.json({ ok: true }));
    const t = supertest(mini);
    for (let i = 1; i <= 10; i++) assert.equal((await t.post('/lookup').set('x-client', `c${i}`)).status, 200);
    const blocked = await t.post('/lookup').set('x-client', 'c11');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.code, 'RATE_LIMITED');
    assert.equal((await t.post('/lookup').set('x-staff', '1')).status, 200);
  });
});
