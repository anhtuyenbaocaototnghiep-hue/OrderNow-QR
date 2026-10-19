// Integration test (SQL Server thật) F-047 — hội viên khi gọi món tại bàn, Thẻ thành viên cho khách, quyền lợi trên bill (ADR-008 D-36…D-38).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, staffSock;
let member, sessionA, sessionB, C, points;
const PHONE = '0901234567';

const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const tableId = async (code) => (await q1(`SELECT TableId FROM dbo.Tables WHERE Code = '${code}'`))[0].TableId;
const pointsOf = async (memberId) => (await q1(`SELECT Points FROM dbo.Members WHERE MemberId = ${memberId}`))[0].Points;
async function settle(sessionId) {
  const r = await call(staff, 'post', `/api/sessions/${sessionId}/settle`, { amountReceived: 1_000_000 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.payment;
}

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  assert.equal((await call(staff, 'post', '/api/shifts/open', { openingCash: 0 })).status, 201);
  const p = await call(admin, 'post', '/api/admin/stamp-programs', { name: 'Thẻ cà phê', requiredStamps: 10, menuItemIds: [ids['Cà phê đen']] });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  const r = await call(admin, 'post', '/api/admin/rewards', { name: 'Tặng nước suối', pointsCost: 50, rewardType: 'FREE_ITEM', menuItemId: ids['Nước suối'] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  staffSock = await app.connect({ auth: { token: staff } });
});

after(() => app.close());

describe('Hội viên ở Gọi món tại bàn (F-047, D-36)', () => {
  test('AC-047-01/02: nhân viên mở bàn trống, đăng ký nhanh (bắt buộc khách đồng ý) rồi gắn → phiên có hội viên, quầy nhận session.member_changed', async () => {
    const opened = await call(staff, 'post', `/api/tables/${await tableId('01')}/sessions`, {});
    assert.equal(opened.status, 201, JSON.stringify(opened.body));
    sessionA = opened.body.session.sessionId;

    const lookup = await call(staff, 'post', '/api/members/lookup', { phone: PHONE });
    assert.deepEqual([lookup.status, lookup.body.found], [200, false]);
    const noConsent = await call(staff, 'post', '/api/members', { phone: PHONE, fullName: 'Nguyễn Văn An' });
    assert.deepEqual([noConsent.status, noConsent.body.code], [400, 'CONSENT_REQUIRED']);
    const reg = await call(staff, 'post', '/api/members', { phone: PHONE, fullName: 'Nguyễn Văn An', consent: true });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    member = reg.body;

    const changed = app.waitFor(staffSock, 'session.member_changed', (x) => x.sessionId === sessionA);
    const att = await call(staff, 'post', `/api/sessions/${sessionA}/member`, { memberId: member.memberId });
    assert.equal(att.status, 200, JSON.stringify(att.body));
    assert.equal(att.body.member.fullName, 'Nguyễn Văn An', 'quầy thấy tên đầy đủ');
    assert.equal((await changed).member.maskedName, 'Nguyễn V. A.', 'sự kiện tới bàn chỉ có tên che');
    const t01 = (await call(staff, 'get', '/api/tables')).body.find((t) => t.code === '01');
    assert.equal(t01.sessions[0].member.fullName, 'Nguyễn Văn An');
    const again = await call(staff, 'post', '/api/members/lookup', { phone: PHONE });
    assert.deepEqual([again.body.found, again.body.member.fullName, again.body.member.phone], [true, 'Nguyễn Văn An', PHONE]);

    // Gọi món + thu tiền → tích điểm / tem (tính lúc thu như cũ)
    const o = await call(staff, 'post', `/api/sessions/${sessionA}/orders`, {
      items: [
        { menuItemId: ids['Cà phê đen'], quantity: 2 },
        { menuItemId: ids['Nước suối'], quantity: 1 },
      ],
    });
    assert.equal(o.status, 201, JSON.stringify(o.body));
    const pay = await settle(sessionA);
    assert.equal(pay.member.memberId, member.memberId);
    points = await pointsOf(member.memberId);
    assert.ok(points > 0, 'đã tích điểm');
  });
});

describe('Thẻ thành viên (F-047, D-37)', () => {
  test('chuẩn bị: chiến dịch tặng voucher cho mọi hội viên', async () => {
    const seg = await call(admin, 'post', '/api/admin/segments', { name: 'Mọi hội viên', rule: {} });
    assert.equal(seg.status, 201, JSON.stringify(seg.body));
    const c = await call(admin, 'post', '/api/admin/campaigns', {
      name: 'Tri ân tháng 10',
      segmentId: seg.body.segmentId,
      channel: 'EXPORT',
      messageTemplate: 'Chào {name}, mã {voucher}, hạn {expires}.',
      voucherPercent: 15,
      voucherDays: 7,
    });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    const run = await call(admin, 'post', `/api/admin/campaigns/${c.body.campaignId}/run`);
    assert.equal(run.status, 200, JSON.stringify(run.body));
  });

  test('AC-047-03: khách trong phiên mở Thẻ thành viên → điểm, lịch sử, tem, quà, voucher kèm hạn + tên chiến dịch; không có mã voucher', async () => {
    C = await app.customer();
    sessionB = await app.seat(C, '02');
    assert.equal((await C.post(`/api/sessions/${sessionB}/member`, { phone: PHONE })).status, 200);
    const r = await C.get(`/api/sessions/${sessionB}/member-card`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const card = r.body;
    assert.deepEqual([card.member.maskedName, card.member.maskedPhone], ['Nguyễn V. A.', '09xx***567']);
    assert.equal(card.member.fullName, undefined);
    assert.equal(card.points, points);
    assert.deepEqual([card.pointHistory[0].type, card.pointHistory[0].delta, card.pointHistory[0].label], ['EARN', points, 'Tích điểm']);
    assert.ok(
      card.pointHistory.every((h) => h.createdBy === undefined),
      'không lộ tên nhân viên',
    );
    assert.equal(card.stampCards[0].stamps, 2);
    assert.match(card.stampCards[0].text, /2\/10 tem/);
    const water = card.rewards.find((x) => x.name === 'Tặng nước suối');
    assert.equal(water.missing, Math.max(0, 50 - points));
    assert.equal(card.vouchers.length, 1);
    assert.deepEqual([card.vouchers[0].percent, card.vouchers[0].source, card.vouchers[0].sourceLabel], [15, 'CAMPAIGN', 'Chiến dịch "Tri ân tháng 10"']);
    assert.ok(card.vouchers[0].expiresAt);
    const [{ Code }] = await q1(`SELECT Code FROM dbo.Vouchers WHERE MemberId = ${member.memberId}`);
    assert.ok(!JSON.stringify(card).includes(Code), 'không trả mã voucher');
    assert.ok(card.vouchers.every((v) => v.code === undefined));
    // Quầy (Bearer) cũng xem được
    assert.equal((await call(staff, 'get', `/api/sessions/${sessionB}/member-card`)).status, 200);
  });

  test('AC-047-04: thiết bị không thuộc phiên → 403; phiên chưa gắn hội viên → 404 NO_MEMBER; phiên đã đóng → 409', async () => {
    const D = await app.customer();
    assert.equal((await D.get(`/api/sessions/${sessionB}/member-card`)).status, 403);
    const sD = await app.seat(D, '03');
    const none = await D.get(`/api/sessions/${sD}/member-card`);
    assert.deepEqual([none.status, none.body.code], [404, 'NO_MEMBER']);
    const closed = await call(staff, 'get', `/api/sessions/${sessionA}/member-card`);
    assert.deepEqual([closed.status, closed.body.code], [409, 'SESSION_CLOSED']);
    assert.equal((await D.get('/api/sessions/00000000-0000-0000-0000-000000000000/member-card')).status, 404);
  });
});

describe('Quyền lợi trên bill (F-047, D-38)', () => {
  test('AC-047-05: bill thanh toán có hội viên in điểm hiện có, tem, voucher còn hạn; phiếu tạm tính và bill không hội viên thì không', async () => {
    const final = await call(staff, 'get', `/api/sessions/${sessionA}/receipt?mode=final`);
    assert.equal(final.status, 200, JSON.stringify(final.body));
    assert.equal(final.body.memberCard.points, points);
    assert.match(final.body.memberCard.stampCards[0], /2\/10 tem/);
    assert.deepEqual(
      final.body.memberCard.vouchers.map((v) => [v.percent, v.sourceLabel]),
      [[15, 'Chiến dịch "Tri ân tháng 10"']],
    );
    assert.ok(!JSON.stringify(final.body.memberCard).includes('"code"'));

    // Phiên B (khách tự gắn SĐT): tạm tính chưa in khối; thu xong thì có
    const o = await C.post('/api/orders', { sessionId: sessionB, items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] });
    assert.equal(o.status, 201, JSON.stringify(o.body));
    const prov = await call(staff, 'get', `/api/sessions/${sessionB}/receipt?mode=provisional`);
    assert.equal(prov.status, 200);
    assert.equal(prov.body.memberCard, null);
    assert.equal((await call(staff, 'post', `/api/orders/${o.body.orderId}/accept`)).status, 200);
    await settle(sessionB);
    const finalB = await call(staff, 'get', `/api/sessions/${sessionB}/receipt?mode=final`);
    assert.equal(finalB.body.memberCard.points, await pointsOf(member.memberId));

    // Không có hội viên → không in khối
    const D = await app.customer();
    const sD = await app.seat(D, '04');
    const od = await D.post('/api/orders', { sessionId: sD, items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] });
    await call(staff, 'post', `/api/orders/${od.body.orderId}/accept`);
    await settle(sD);
    assert.equal((await call(staff, 'get', `/api/sessions/${sD}/receipt?mode=final`)).body.memberCard, null);

    // Mang đi có hội viên → bill mang đi cũng có khối
    const tk = await call(staff, 'post', '/api/orders/takeaway', {
      items: [{ menuItemId: ids['Nước suối'], quantity: 1 }],
      amountReceived: 100_000,
      memberId: member.memberId,
    });
    assert.equal(tk.status, 201, JSON.stringify(tk.body));
    const tr = await call(staff, 'get', `/api/orders/${tk.body.order.orderId}/receipt`);
    assert.equal(tr.status, 200, JSON.stringify(tr.body));
    assert.equal(tr.body.memberCard.points, await pointsOf(member.memberId));
  });
});
