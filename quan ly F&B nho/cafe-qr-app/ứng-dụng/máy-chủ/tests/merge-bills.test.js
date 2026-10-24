// Integration test (SQL Server thật) F-057 thu chung nhiều bàn + F-058 tách hóa đơn theo món (ADR-019 D-73, D-74).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, ids;

const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const conflictCode = (r, code) => {
  assert.equal(r.status, 409, `${r.status} ${JSON.stringify(r.body)}`);
  assert.equal(r.body.code, code);
};
const currentShift = async () => (await call(staff, 'get', '/api/shifts/current')).body.shift;

/** Khách bàn `code` gửi đơn; accept = quầy tiếp nhận luôn. → { C, sessionId, orderId } */
async function table(code, items, { accept = true } = {}) {
  const C = await app.customer();
  const sessionId = await app.seat(C, code);
  const order = ok(await C.post('/api/orders', { sessionId, items }), 201);
  if (accept) ok(await call(staff, 'post', `/api/orders/${order.orderId}/accept`));
  return { C, sessionId, orderId: order.orderId };
}
const sessionRow = async (id) => (await q1(`SELECT Status, MergedIntoSessionId FROM dbo.Sessions WHERE SessionId = '${id}'`))[0];
const ordersOf = async (id) => q1(`SELECT OrderId, TableId FROM dbo.Orders WHERE SessionId = '${id}'`);
const paymentsOf = async (id) => (await q1(`SELECT COUNT(*) AS n FROM dbo.Payments WHERE SessionId = '${id}'`))[0].n;
const topLines = async (orderId) =>
  (await q1(`SELECT OrderItemId FROM dbo.OrderItems WHERE OrderId = ${orderId} AND ParentOrderItemId IS NULL ORDER BY OrderItemId`)).map((x) => x.OrderItemId);

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 0 }), 201);
});

after(() => app.close());

describe('Thu chung nhiều bàn (F-057)', () => {
  test('AC-057-01: bàn A + bàn B → xem trước tổng chung; thu chung một lượt ở phiên A; A, B đóng, B trỏ về A; đơn của B sang phiên A nhưng giữ bàn B', async () => {
    const a = await table('01', [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    const b = await table('02', [{ menuItemId: ids['Nước suối'], quantity: 2 }]);
    const own = ok(await call(staff, 'post', `/api/sessions/${a.sessionId}/settle/preview`, {}));
    const other = ok(await call(staff, 'post', `/api/sessions/${b.sessionId}/settle/preview`, {}));
    const both = ok(await call(staff, 'post', `/api/sessions/${a.sessionId}/settle/preview`, { mergeSessionIds: [b.sessionId] }));
    assert.equal(both.totals.ordersTotal, own.totals.ordersTotal + other.totals.ordersTotal);
    assert.equal(both.mergedSessions.length, 1);
    assert.equal(both.mergedSessions[0].table.code, '02');
    const tableB = (await q1("SELECT TableId FROM dbo.Tables WHERE Code = '02'"))[0].TableId;

    const r = ok(
      await call(staff, 'post', `/api/sessions/${a.sessionId}/settle`, {
        mergeSessionIds: [b.sessionId],
        amountReceived: both.totals.amountDue,
        expectedAmountDue: both.totals.amountDue,
      }),
    );
    assert.deepEqual(r.mergedSessionIds, [b.sessionId]);
    assert.equal(r.payment.amountDue, both.totals.amountDue);
    assert.equal(await paymentsOf(a.sessionId), 1);
    assert.equal(await paymentsOf(b.sessionId), 0);
    assert.equal((await sessionRow(a.sessionId)).Status, 'CLOSED');
    const rowB = await sessionRow(b.sessionId);
    assert.equal(rowB.Status, 'CLOSED');
    assert.equal(rowB.MergedIntoSessionId.toLowerCase(), a.sessionId);
    assert.deepEqual(await ordersOf(b.sessionId), []);
    const moved = (await ordersOf(a.sessionId)).find((o) => o.OrderId === b.orderId);
    assert.ok(moved, 'đơn của bàn B nằm ở phiên A');
    assert.equal(moved.TableId, tableB, 'đơn giữ bàn gốc');
  });

  test('AC-057-02: tiền đổi / bàn B còn đơn chờ / bàn B đang chia bill → 409, không gộp, không thu', async () => {
    const a = await table('03', [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    const b = await table('04', [{ menuItemId: ids['Nước suối'], quantity: 1 }], { accept: false }); // còn đơn chờ tiếp nhận
    const both = ok(await call(staff, 'post', `/api/sessions/${a.sessionId}/settle/preview`, { mergeSessionIds: [b.sessionId] }));
    const body = { mergeSessionIds: [b.sessionId], amountReceived: 1_000_000 };
    conflictCode(
      await call(staff, 'post', `/api/sessions/${a.sessionId}/settle`, { ...body, expectedAmountDue: both.totals.amountDue + 1000 }),
      'AMOUNT_CHANGED',
    );
    // Đơn chờ chỉ bị bắt TRONG transaction sau bước gộp → lỗi phải rollback cả phần gộp
    conflictCode(await call(staff, 'post', `/api/sessions/${a.sessionId}/settle`, body), 'HAS_PENDING_ORDERS');
    for (const s of [a, b]) assert.notEqual((await sessionRow(s.sessionId)).Status, 'CLOSED');
    assert.equal((await sessionRow(b.sessionId)).MergedIntoSessionId, null);
    assert.equal((await ordersOf(b.sessionId)).length, 1, 'đơn bàn B vẫn ở phiên B');
    assert.equal(await paymentsOf(a.sessionId), 0);

    ok(await call(staff, 'post', `/api/orders/${b.orderId}/accept`));
    const lines = await topLines(b.orderId);
    ok(await call(staff, 'post', `/api/sessions/${b.sessionId}/splits/separate`, { label: 'Chị B', orderItemIds: lines }), 201);
    conflictCode(await call(staff, 'post', `/api/sessions/${a.sessionId}/settle`, body), 'SESSION_HAS_SPLITS');
    assert.equal(await paymentsOf(a.sessionId), 0);
    assert.equal((await sessionRow(b.sessionId)).MergedIntoSessionId, null);
    const self = await call(staff, 'post', `/api/sessions/${a.sessionId}/settle`, { ...body, mergeSessionIds: [a.sessionId] });
    assert.equal(self.status, 400, 'không thu chung với chính bàn này');
  });

  test('AC-057-03, AC-057-04: điện thoại bàn B nhận session.settled có mergedInto; phiên B có mergedInto; đánh giá được trên phiên A; bill nhóm món theo bàn', async () => {
    const a = await table('05', [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    const b = await table('06', [{ menuItemId: ids['Nước suối'], quantity: 1 }]);
    const sock = await app.connect({ auth: { sessionId: b.sessionId }, extraHeaders: { cookie: b.C.cookie } });
    const settled = app.waitFor(sock, 'session.settled', (p) => p.mergedInto?.sessionId === a.sessionId);
    ok(await call(staff, 'post', `/api/sessions/${a.sessionId}/settle`, { mergeSessionIds: [b.sessionId], method: 'TRANSFER' }));
    const evt = await settled;
    assert.equal(evt.mergedInto.table.code, '05');
    assert.equal(evt.mergedInto.table.qrToken, undefined, 'không gửi mã QR bàn A cho người bàn B (AC-010-04)');

    const detail = ok(await b.C.get(`/api/sessions/${b.sessionId}`));
    assert.equal(detail.mergedInto.sessionId, a.sessionId);
    assert.equal(detail.mergedInto.table.code, '05');
    assert.equal(detail.mergedInto.table.qrToken, undefined);
    const review = ok(await b.C.get(`/api/sessions/${a.sessionId}/review`));
    assert.equal(review.canReview, true, JSON.stringify(review));

    const bill = ok(await call(staff, 'get', `/api/sessions/${a.sessionId}/receipt?mode=final`));
    assert.deepEqual(bill.tables.sort(), ['Bàn 05', 'Bàn 06'].sort());
    assert.ok(bill.lines.some((l) => l.table === 'Bàn 06' && l.name === 'Nước suối'));
    assert.ok(bill.lines.some((l) => l.table === 'Bàn 05' && l.name === 'Cà phê đen'));
    // In bill từ bàn B (đã gộp) → bill chung của bàn A
    const fromB = ok(await call(staff, 'get', `/api/sessions/${b.sessionId}/receipt?mode=final`));
    assert.equal(fromB.session.sessionId, a.sessionId);
  });

  test('thu chung lỗi SAU bước gộp (tổng đơn đổi so với lúc tính) → rollback cả bước gộp: bàn B giữ phiên, đơn, điện thoại; không có lượt thu', async () => {
    const a = await table('01', [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    const b = await table('02', [{ menuItemId: ids['Nước suối'], quantity: 1 }]);
    const both = ok(await call(staff, 'post', `/api/sessions/${a.sessionId}/settle/preview`, { mergeSessionIds: [b.sessionId] }));
    const sessionsRepo = await import('../src/repositories/sessionsRepo.js');
    const [{ UserId }] = await q1("SELECT UserId FROM dbo.Users WHERE Username = 'staff1'");
    const clientsOfA = async () => (await q1(`SELECT COUNT(*) AS n FROM dbo.SessionClients WHERE SessionId = '${a.sessionId}'`))[0].n;
    const clientsBefore = await clientsOfA();
    // sp_MergeSessions chạy xong rồi sp_SettleSession mới phát hiện tổng lệch (vd. đơn mới vừa vào) → 50034
    await assert.rejects(
      sessionsRepo.mergeAndSettle(a.sessionId, [b.sessionId], UserId, {
        amountReceived: both.totals.amountDue,
        userId: UserId,
        shiftId: (await currentShift()).shiftId,
        totals: { ...both.totals, ordersTotal: both.totals.ordersTotal - 1000 },
      }),
      (err) => (err.number ?? err.originalError?.info?.number) === 50034,
    );
    const rowB = await sessionRow(b.sessionId);
    assert.notEqual(rowB.Status, 'CLOSED');
    assert.equal(rowB.MergedIntoSessionId, null);
    assert.deepEqual(
      (await ordersOf(b.sessionId)).map((o) => o.OrderId),
      [b.orderId],
    );
    assert.equal(await clientsOfA(), clientsBefore, 'điện thoại bàn B chưa được chép sang phiên A');
    assert.equal(await paymentsOf(a.sessionId), 0);
    // Thu lại đúng → thành công (dọn bàn cho các test sau)
    ok(await call(staff, 'post', `/api/sessions/${a.sessionId}/settle`, { mergeSessionIds: [b.sessionId], method: 'TRANSFER' }));
  });

  test('thu chung có hội viên → giảm giá hội viên tính trên tổng chung các bàn; số thu khớp xem trước', async () => {
    const reg = ok(await call(staff, 'post', '/api/members', { phone: '0912000573', fullName: 'Khách Thử Gộp', consent: true }), 201);
    const a = await table('05', [{ menuItemId: ids['Cà phê đen'], quantity: 2 }]);
    const b = await table('06', [{ menuItemId: ids['Nước suối'], quantity: 3 }]);
    const own = ok(await call(staff, 'post', `/api/sessions/${a.sessionId}/settle/preview`, { memberId: reg.memberId }));
    const body = { memberId: reg.memberId, mergeSessionIds: [b.sessionId] };
    const both = ok(await call(staff, 'post', `/api/sessions/${a.sessionId}/settle/preview`, body));
    assert.ok(both.totals.memberPercent > 0, JSON.stringify(both.totals));
    assert.equal(both.totals.memberDiscount, Math.round((both.totals.ordersTotal * both.totals.memberPercent) / 100));
    assert.ok(both.totals.memberDiscount > own.totals.memberDiscount, 'giảm cả phần của bàn B');
    const r = ok(await call(staff, 'post', `/api/sessions/${a.sessionId}/settle`, { ...body, method: 'TRANSFER', expectedAmountDue: both.totals.amountDue }));
    assert.equal(r.payment.amountDue, both.totals.amountDue);
    const [p] = await q1(`SELECT MemberId, MemberDiscount FROM dbo.Payments WHERE PaymentId = ${r.payment.paymentId}`);
    assert.deepEqual([p.MemberId, Number(p.MemberDiscount)], [reg.memberId, both.totals.memberDiscount]);
  });

  test('hoàn tiền lượt thu chung kèm hủy đơn của bàn B → đơn B VOIDED (vẫn ở phiên A, giữ bàn B); chi tiết lượt thu liệt kê đơn cả hai bàn', async () => {
    const a = await table('01', [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    const b = await table('02', [{ menuItemId: ids['Nước suối'], quantity: 2 }]);
    const both = ok(await call(staff, 'post', `/api/sessions/${a.sessionId}/settle/preview`, { mergeSessionIds: [b.sessionId] }));
    const r = ok(await call(staff, 'post', `/api/sessions/${a.sessionId}/settle`, { mergeSessionIds: [b.sessionId], amountReceived: both.totals.amountDue }));
    const detail = ok(await call(admin, 'get', `/api/payments/${r.payment.paymentId}`));
    assert.deepEqual(detail.orders.map((o) => o.orderId).sort(), [a.orderId, b.orderId].sort());
    const bTotal = detail.orders.find((o) => o.orderId === b.orderId).totalAmount;
    const ref = ok(
      await call(admin, 'post', `/api/payments/${r.payment.paymentId}/refunds`, { amount: bTotal, reason: 'bàn B trả món', orderIds: [b.orderId] }),
      201,
    );
    assert.deepEqual(ref.refund.voidedOrderIds, [b.orderId]);
    assert.equal(ref.refund.method, 'CASH');
    const [o] = await q1(`SELECT o.Status, o.SessionId, t.Code FROM dbo.Orders o JOIN dbo.Tables t ON t.TableId = o.TableId WHERE o.OrderId = ${b.orderId}`);
    assert.deepEqual([o.Status, o.SessionId.toLowerCase(), o.Code], ['VOIDED', a.sessionId, '02']);
  });

  test('hai nhóm cùng một bàn thu chung → điện thoại nhóm sau nhận mergedInto (không có mã QR), xem bill chung và đánh giá được; bill một bàn', async () => {
    const a = await table('05', [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    const [{ TableId, QrToken }] = await q1("SELECT TableId, QrToken FROM dbo.Tables WHERE Code = '05'");
    const g2 = ok(await call(staff, 'post', `/api/tables/${TableId}/sessions`, { newGroup: true }), 201).session.sessionId;
    assert.notEqual(g2, a.sessionId);
    const C2 = await app.customer();
    ok(await C2.post(`/api/sessions/${g2}/join`, { qrToken: QrToken }));
    const o2 = ok(await C2.post('/api/orders', { sessionId: g2, items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] }), 201);
    ok(await call(staff, 'post', `/api/orders/${o2.orderId}/accept`));
    const sock = await app.connect({ auth: { sessionId: g2 }, extraHeaders: { cookie: C2.cookie } });
    const settled = app.waitFor(sock, 'session.settled', (p) => p.mergedInto?.sessionId === a.sessionId);
    ok(await call(staff, 'post', `/api/sessions/${a.sessionId}/settle`, { mergeSessionIds: [g2], method: 'TRANSFER' }));
    const evt = await settled;
    assert.equal(evt.mergedInto.table.code, '05');
    assert.equal(evt.mergedInto.table.qrToken, undefined);
    const detail = ok(await C2.get(`/api/sessions/${g2}`));
    assert.equal(detail.mergedInto.sessionId, a.sessionId);
    assert.equal(detail.table.qrToken, undefined);
    // Điện thoại nhóm 2 đã là thành viên phiên A
    const shared = ok(await C2.get(`/api/sessions/${a.sessionId}`));
    assert.ok(shared.orders.some((o) => o.orderId === o2.orderId));
    assert.equal(ok(await C2.get(`/api/sessions/${a.sessionId}/review`)).canReview, true);
    const bill = ok(await call(staff, 'get', `/api/sessions/${a.sessionId}/receipt?mode=final`));
    assert.deepEqual(bill.tables, ['Bàn 05']);
  });
});

describe('Tách hóa đơn theo món (F-058)', () => {
  test('AC-058-01: tách 2 trong 3 món ra "Anh A" → "Anh A" + "Phần còn lại" (Chung trống); thu "Anh A" đúng tổng 2 món, bàn còn mở', async () => {
    const t = await table('01', [
      { menuItemId: ids['Cà phê đen'], quantity: 1 },
      { menuItemId: ids['Nước suối'], quantity: 1 },
      { menuItemId: ids['Bánh croissant'], quantity: 1 },
    ]);
    const lines = await topLines(t.orderId);
    const r = ok(await call(staff, 'post', `/api/sessions/${t.sessionId}/splits/separate`, { label: 'Anh A', orderItemIds: lines.slice(0, 2) }), 201);
    assert.equal(r.hasSplits, true);
    const labels = r.splits
      .filter((s) => !s.isCommon)
      .map((s) => s.label)
      .sort();
    assert.deepEqual(labels, ['Anh A', 'Phần còn lại'].sort());
    const rest = r.splits.find((s) => s.label === 'Phần còn lại');
    assert.equal(rest.lines.length, 1);
    const part = r.splits.find((s) => s.splitId === r.splitId);
    assert.equal(part.lines.length, 2);
    const items = await q1(
      `SELECT OrderItemId, SplitId, UnitPrice * Quantity AS LineTotal FROM dbo.OrderItems WHERE OrderId = ${t.orderId} AND ParentOrderItemId IS NULL`,
    );
    const inPart = items.filter((i) => i.SplitId === r.splitId);
    assert.deepEqual(inPart.map((i) => i.OrderItemId).sort(), lines.slice(0, 2).sort());
    const pre = ok(await call(staff, 'post', `/api/splits/${r.splitId}/settle/preview`, {}));
    assert.equal(
      pre.totals.ordersTotal,
      inPart.reduce((s, i) => s + Number(i.LineTotal), 0),
    );
    const paid = ok(await call(staff, 'post', `/api/splits/${r.splitId}/settle`, { amountReceived: pre.totals.amountDue }));
    assert.equal(paid.payment.amountDue, pre.totals.amountDue);
    assert.notEqual((await sessionRow(t.sessionId)).Status, 'CLOSED', 'phần còn lại chưa thu → bàn còn mở');
  });

  test('AC-058-02: dòng đã thu / dòng bàn khác / dòng thành phần combo → 409 LINE_LOCKED, không tạo phần; chưa mở ca → 409 NO_OPEN_SHIFT; khách → 401', async () => {
    const t = await table('02', [
      { menuItemId: ids['Cà phê đen'], quantity: 1 },
      { menuItemId: ids['Nước suối'], quantity: 1 },
    ]);
    const lines = await topLines(t.orderId);
    const first = ok(await call(staff, 'post', `/api/sessions/${t.sessionId}/splits/separate`, { label: 'Phần 1', orderItemIds: [lines[0]] }), 201);
    ok(await call(staff, 'post', `/api/splits/${first.splitId}/settle`, { method: 'TRANSFER' }));
    const restSplit = (await q1(`SELECT SplitId FROM dbo.OrderItems WHERE OrderItemId = ${lines[1]}`))[0].SplitId;
    assert.ok(restSplit, 'món còn lại vào "Phần còn lại"');
    const splitCount = async () => (await q1(`SELECT COUNT(*) AS n FROM dbo.SessionSplits WHERE SessionId = '${t.sessionId}'`))[0].n;
    const before = await splitCount();
    const sep = (orderItemIds) => call(staff, 'post', `/api/sessions/${t.sessionId}/splits/separate`, { label: 'Phần 2', orderItemIds });
    conflictCode(await sep([lines[0]]), 'LINE_LOCKED'); // đã thu
    const other = await table('05', [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    conflictCode(await sep([lines[1], (await topLines(other.orderId))[0]]), 'LINE_LOCKED'); // dòng bàn khác
    const combo = ok(
      await call(admin, 'post', '/api/admin/combos', {
        name: 'Combo tách bill',
        price: 45000,
        components: [
          { menuItemId: ids['Cà phê đen'], quantity: 1 },
          { menuItemId: ids['Bánh croissant'], quantity: 1 },
        ],
      }),
      201,
    );
    const c = await table('06', [{ menuItemId: combo.menuItemId, quantity: 1 }]);
    const child = (await q1(`SELECT TOP 1 OrderItemId FROM dbo.OrderItems WHERE OrderId = ${c.orderId} AND ParentOrderItemId IS NOT NULL`))[0];
    assert.ok(child, 'combo có dòng thành phần');
    const cSplits = async () => (await q1(`SELECT COUNT(*) AS n FROM dbo.SessionSplits WHERE SessionId = '${c.sessionId}'`))[0].n;
    conflictCode(await call(staff, 'post', `/api/sessions/${c.sessionId}/splits/separate`, { label: 'X', orderItemIds: [child.OrderItemId] }), 'LINE_LOCKED');
    assert.equal(await cSplits(), 0, 'lỗi → không để lại phần "Chung" trống');
    assert.equal(await splitCount(), before, 'không tạo phần mới');
    assert.equal((await q1(`SELECT SplitId FROM dbo.OrderItems WHERE OrderItemId = ${lines[1]}`))[0].SplitId, restSplit, 'dòng giữ phần cũ');

    const guest = await t.C.post(`/api/sessions/${t.sessionId}/splits/separate`, { label: 'Tôi', orderItemIds: [lines[1]] });
    assert.equal(guest.status, 401);
    const shift = await currentShift();
    ok(await call(staff, 'post', `/api/shifts/${shift.shiftId}/close`, { countedCash: shift.expectedCash }));
    conflictCode(await sep([lines[1]]), 'NO_OPEN_SHIFT');
    ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 0 }), 201);
  });
});
