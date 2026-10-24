// Integration test (SQL Server thật) F-056 — thu bằng chuyển khoản, két chỉ tính tiền mặt (ADR-019 D-71, D-72).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

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
const currentShift = async () => (await call(staff, 'get', '/api/shifts/current')).body.shift;
async function freshShift(openingCash) {
  const cur = await currentShift();
  if (cur) ok(await call(staff, 'post', `/api/shifts/${cur.shiftId}/close`, { countedCash: cur.expectedCash }));
  return ok(await call(staff, 'post', '/api/shifts/open', { openingCash }), 201).shift;
}

/** Khách bàn `code` gọi món rồi quầy tiếp nhận → { sessionId, amountDue } (số phải thu do server tính). */
async function servedTable(code, items) {
  const C = await app.customer();
  const sessionId = await app.seat(C, code);
  const order = ok(await C.post('/api/orders', { sessionId, items }), 201);
  ok(await call(staff, 'post', `/api/orders/${order.orderId}/accept`));
  const preview = ok(await call(staff, 'post', `/api/sessions/${sessionId}/settle/preview`, {}));
  return { C, sessionId, amountDue: preview.totals.amountDue };
}

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  await freshShift(0);
});

after(() => app.close());

describe('Thu bằng chuyển khoản (F-056)', () => {
  test('AC-056-01: thu tiền bàn bằng TRANSFER không gửi tiền khách đưa → Payments TRANSFER, AmountReceived = AmountDue, tiền thừa 0; thu CASH thiếu tiền khách đưa → 400', async () => {
    const t = await servedTable('01', [{ menuItemId: ids['Cà phê đen'], quantity: 2 }]);
    const r = ok(await call(staff, 'post', `/api/sessions/${t.sessionId}/settle`, { method: 'TRANSFER', expectedAmountDue: t.amountDue }));
    assert.equal(r.payment.method, 'TRANSFER');
    assert.equal(r.payment.amountReceived, t.amountDue);
    assert.equal(r.payment.changeGiven, 0);
    const [p] = await q1(`SELECT Method, AmountDue, AmountReceived, ChangeGiven FROM dbo.Payments WHERE SessionId = '${t.sessionId}'`);
    assert.deepEqual([p.Method, Number(p.AmountReceived), Number(p.ChangeGiven)], ['TRANSFER', Number(p.AmountDue), 0]);
    const orders = await q1(`SELECT DISTINCT PaymentMethod, PaymentStatus FROM dbo.Orders WHERE SessionId = '${t.sessionId}'`);
    assert.deepEqual(orders, [{ PaymentMethod: 'TRANSFER', PaymentStatus: 'PAID' }]);
    assert.equal((await q1(`SELECT Status FROM dbo.Sessions WHERE SessionId = '${t.sessionId}'`))[0].Status, 'CLOSED');

    const t2 = await servedTable('02', [{ menuItemId: ids['Nước suối'], quantity: 1 }]);
    const bad = await call(staff, 'post', `/api/sessions/${t2.sessionId}/settle`, { method: 'CASH' });
    assert.equal(bad.status, 400, JSON.stringify(bad.body));
    assert.equal(bad.body.code, 'VALIDATION_ERROR');
    assert.equal((await q1(`SELECT COUNT(*) AS n FROM dbo.Payments WHERE SessionId = '${t2.sessionId}'`))[0].n, 0);
    // Mặc định (không gửi method) vẫn là tiền mặt như trước
    const cash = ok(await call(staff, 'post', `/api/sessions/${t2.sessionId}/settle`, { amountReceived: t2.amountDue + 5000 }));
    assert.equal(cash.payment.method, 'CASH');
    assert.equal(cash.payment.changeGiven, 5000);
  });

  test('AC-056-02: ca có tiền mặt và chuyển khoản → cashIn chỉ tiền mặt, transferIn riêng, tiền dự kiến = đầu ca + tiền mặt; đóng ca đếm đúng → chênh lệch 0', async () => {
    await freshShift(100000);
    const cashT = await servedTable('03', [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    const transferT = await servedTable('04', [{ menuItemId: ids['Nước suối'], quantity: 3 }]);
    ok(await call(staff, 'post', `/api/sessions/${cashT.sessionId}/settle`, { method: 'CASH', amountReceived: 100000 }));
    ok(await call(staff, 'post', `/api/sessions/${transferT.sessionId}/settle`, { method: 'TRANSFER' }));
    const shift = await currentShift();
    assert.equal(shift.cashIn, cashT.amountDue);
    assert.equal(shift.transferIn, transferT.amountDue);
    assert.equal(shift.transferCount, 1);
    assert.equal(shift.expectedCash, 100000 + cashT.amountDue);
    const report = ok(await call(staff, 'get', `/api/shifts/${shift.shiftId}/report`));
    const methods = Object.fromEntries((report.report?.payments ?? report.payments).map((p) => [p.amountDue, p.method]));
    assert.equal(methods[transferT.amountDue], 'TRANSFER');
    const closed = ok(await call(staff, 'post', `/api/shifts/${shift.shiftId}/close`, { countedCash: 100000 + cashT.amountDue }));
    const [row] = await q1(`SELECT ExpectedCash, Difference FROM dbo.Shifts WHERE ShiftId = ${shift.shiftId}`);
    assert.equal(Number(row.ExpectedCash), 100000 + cashT.amountDue, JSON.stringify(closed));
    assert.equal(Number(row.Difference), 0);
    await freshShift(0);
  });

  test('AC-056-03: hoàn tiền lượt chuyển khoản → tiền dự kiến trong két không đổi, transferRefunds tăng; hoàn lượt tiền mặt → két giảm', async () => {
    await freshShift(50000);
    const tr = await servedTable('05', [{ menuItemId: ids['Cà phê đen'], quantity: 2 }]);
    const ca = await servedTable('06', [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    const pTr = ok(await call(staff, 'post', `/api/sessions/${tr.sessionId}/settle`, { method: 'TRANSFER' })).payment;
    const pCa = ok(await call(staff, 'post', `/api/sessions/${ca.sessionId}/settle`, { method: 'CASH', amountReceived: ca.amountDue })).payment;
    const before = await currentShift();
    ok(await call(admin, 'post', `/api/payments/${pTr.paymentId}/refunds`, { amount: 10000, reason: 'khách trả lại một ly' }), 201);
    const afterTr = await currentShift();
    assert.equal(afterTr.expectedCash, before.expectedCash, 'hoàn chuyển khoản không trừ két');
    assert.equal(afterTr.transferRefunds, 10000);
    ok(await call(admin, 'post', `/api/payments/${pCa.paymentId}/refunds`, { amount: 5000, reason: 'khách trả lại tiền mặt' }), 201);
    const afterCa = await currentShift();
    assert.equal(afterCa.expectedCash, before.expectedCash - 5000);
    assert.equal(afterCa.expectedCash, 50000 + ca.amountDue - 5000);
    // Đóng ca: đếm đúng tiền mặt thật trong két → chênh lệch 0 (SP đóng ca cũng chỉ tính tiền mặt)
    ok(await call(staff, 'post', `/api/shifts/${afterCa.shiftId}/close`, { countedCash: 50000 + ca.amountDue - 5000 }));
    const [row] = await q1(`SELECT ExpectedCash, Difference FROM dbo.Shifts WHERE ShiftId = ${afterCa.shiftId}`);
    assert.deepEqual([Number(row.ExpectedCash), Number(row.Difference)], [50000 + ca.amountDue - 5000, 0]);
    await freshShift(0);
  });

  test('AC-056-04: thu từng phần chia bill bằng chuyển khoản và bán mang đi bằng chuyển khoản → ghi TRANSFER, không cần tiền khách đưa', async () => {
    const C = await app.customer();
    const sessionId = await app.seat(C, '01');
    const order = ok(
      await C.post('/api/orders', {
        sessionId,
        items: [
          { menuItemId: ids['Cà phê đen'], quantity: 1 },
          { menuItemId: ids['Nước suối'], quantity: 1 },
        ],
      }),
      201,
    );
    ok(await call(staff, 'post', `/api/orders/${order.orderId}/accept`));
    const lines = (await q1(`SELECT OrderItemId FROM dbo.OrderItems WHERE OrderId = ${order.orderId} AND ParentOrderItemId IS NULL ORDER BY OrderItemId`)).map(
      (x) => x.OrderItemId,
    );
    const sep = ok(await call(staff, 'post', `/api/sessions/${sessionId}/splits/separate`, { label: 'Anh A', orderItemIds: [lines[0]] }), 201);
    const part = ok(await call(staff, 'post', `/api/splits/${sep.splitId}/settle`, { method: 'TRANSFER' }));
    assert.equal(part.payment.method, 'TRANSFER');
    assert.equal(part.payment.changeGiven, 0);

    const ta = ok(await call(staff, 'post', '/api/orders/takeaway', { method: 'TRANSFER', items: [{ menuItemId: ids['Nước suối'], quantity: 2 }] }), 201);
    assert.equal(ta.payment.method, 'TRANSFER');
    assert.equal(ta.payment.amountReceived, ta.payment.amountDue);
    const [o] = await q1(`SELECT PaymentMethod, PaymentStatus FROM dbo.Orders WHERE OrderId = ${ta.order.orderId}`);
    assert.deepEqual(o, { PaymentMethod: 'TRANSFER', PaymentStatus: 'PAID' });
    const bad = await call(staff, 'post', '/api/orders/takeaway', { items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] });
    assert.equal(bad.status, 400, 'mang đi tiền mặt vẫn bắt buộc tiền khách đưa');
  });

  test('AC-056-05: báo cáo có byMethod đúng từng cách trả, tổng không đổi; bill in ghi cách trả', async () => {
    const day = todayVn();
    const rep = ok(await call(admin, 'get', `/api/admin/reports/revenue?from=${day}&to=${day}`));
    const paid = await q1(
      `SELECT Method, SUM(AmountDue) AS S FROM dbo.Payments WHERE CONVERT(CHAR(10), DATEADD(HOUR, 7, PaidAt), 23) = '${day}' GROUP BY Method`,
    );
    const sum = Object.fromEntries(paid.map((x) => [x.Method, Number(x.S)]));
    assert.equal(rep.byMethod.CASH.collected, sum.CASH ?? 0);
    assert.equal(rep.byMethod.TRANSFER.collected, sum.TRANSFER ?? 0);
    assert.ok(rep.byMethod.TRANSFER.collected > 0);
    assert.equal(rep.byMethod.CASH.revenue + rep.byMethod.TRANSFER.revenue, rep.totalRevenue);
    const list = ok(await call(admin, 'get', `/api/admin/payments?from=${day}&to=${day}`));
    assert.ok((list.payments ?? list).some((p) => p.method === 'TRANSFER'));

    const t = await servedTable('02', [{ menuItemId: ids['Nước suối'], quantity: 1 }]);
    ok(await call(staff, 'post', `/api/sessions/${t.sessionId}/settle`, { method: 'TRANSFER' }));
    const bill = ok(await call(staff, 'get', `/api/sessions/${t.sessionId}/receipt?mode=final`));
    assert.equal(bill.payment.method, 'TRANSFER');
  });
});
