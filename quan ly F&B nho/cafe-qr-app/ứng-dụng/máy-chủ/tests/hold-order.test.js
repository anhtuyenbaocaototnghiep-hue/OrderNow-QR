// F-066 — "Ra món khi bạn bè tới" (ADR-024 D-93, D-94, BR-103). SQL Server thật.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, staff, ids;

const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const minutesFromNow = (d) => (new Date(d).getTime() - Date.now()) / 60000;
const coffee = (q = 1) => [{ menuItemId: ids['Cà phê đen'], quantity: q }];
const reserved = async () =>
  Number((await pool.request().query("SELECT ReservedQty FROM dbo.Ingredients WHERE Name = N'Cà phê cốt'")).recordset[0].ReservedQty);

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  ok(await api.post('/api/shifts/open').set(auth(staff)).send({ openingCash: 0 }), 201);
});

after(() => app?.close());

describe('Ra món khi bạn bè tới (F-066)', () => {
  test('AC-066-01: gửi đơn hẹn 10 phút / chờ bạn tới → PENDING, HoldUntil đúng, giữ kho như đơn thường; hẹn sai → 400; không hẹn như cũ', async () => {
    const C = await app.customer();
    const sessionId = await app.seat(C, '01');
    const r0 = await reserved();
    const timed = ok(await C.post('/api/orders', { sessionId, items: coffee(), hold: { mode: 'TIME', minutes: 10 } }), 201).order;
    assert.deepEqual([timed.status, timed.holdMode, timed.releasedAt], ['PENDING', 'TIME', null]);
    assert.ok(Math.abs(minutesFromNow(timed.holdUntil) - 10) < 1);
    assert.ok((await reserved()) > r0, 'đơn đang giữ vẫn giữ kho');
    const arrival = ok(await C.post('/api/orders', { sessionId, items: coffee(), hold: { mode: 'ARRIVAL' } }), 201).order;
    assert.equal(arrival.holdMode, 'ARRIVAL');
    assert.ok(Math.abs(minutesFromNow(arrival.holdUntil) - 45) < 1, 'chờ bạn tới giữ tối đa 45 phút');
    for (const hold of [{ mode: 'TIME', minutes: 0 }, { mode: 'TIME', minutes: 60 }, { mode: 'LATER' }, { mode: 'TIME' }]) {
      assert.equal((await C.post('/api/orders', { sessionId, items: coffee(), hold })).status, 400, JSON.stringify(hold));
    }
    const plain = ok(await C.post('/api/orders', { sessionId, items: coffee() }), 201).order;
    assert.deepEqual([plain.holdMode, plain.holdUntil], [null, null]);
  });

  test('AC-066-02: "Bạn đã tới" từ điện thoại trong phiên → hết giữ, quầy nhận order.released; điện thoại khác → 403; báo lại → 409 NOT_HELD', async () => {
    const C = await app.customer();
    const sessionId = await app.seat(C, '02');
    const o = ok(await C.post('/api/orders', { sessionId, items: coffee(), hold: { mode: 'ARRIVAL' } }), 201).order;
    const sock = await app.connect({ auth: { token: staff } });
    const heard = app.waitFor(sock, 'order.released', (p) => p.order?.orderId === o.orderId);
    const stranger = await app.customer();
    assert.equal((await stranger.post(`/api/orders/${o.orderId}/release`)).status, 403);
    const released = ok(await C.post(`/api/orders/${o.orderId}/release`)).order;
    assert.ok(released.releasedAt);
    assert.equal(released.status, 'PENDING');
    assert.equal((await heard).order.orderId, o.orderId);
    const again = await C.post(`/api/orders/${o.orderId}/release`);
    assert.deepEqual([again.status, again.body.code], [409, 'NOT_HELD']);
    const plain = ok(await C.post('/api/orders', { sessionId, items: coffee() }), 201).order;
    assert.equal((await C.post(`/api/orders/${plain.orderId}/release`)).status, 409);
  });

  test('AC-066-03: tiếp nhận đơn đang giữ = làm luôn; đơn đang giữ không vào hàng chờ ước tính; thu tiền khi còn đơn đang giữ → 409', async () => {
    const eta = async () => ok(await api.get('/api/queue/eta').set(auth(staff))).queueLength;
    const C = await app.customer();
    const sessionId = await app.seat(C, '03');
    const q0 = await eta();
    const held = ok(await C.post('/api/orders', { sessionId, items: coffee(2), hold: { mode: 'TIME', minutes: 20 } }), 201).order;
    assert.equal(await eta(), q0, 'đơn đang giữ chưa vào hàng chờ');
    const pay = await api.post(`/api/sessions/${sessionId}/settle`).set(auth(staff)).send({ amountReceived: 1_000_000 });
    assert.deepEqual([pay.status, pay.body.code], [409, 'HAS_PENDING_ORDERS']);
    const accepted = ok(await api.post(`/api/orders/${held.orderId}/accept`).set(auth(staff))).order;
    assert.equal(accepted.status, 'PREPARING');
    assert.ok(accepted.releasedAt, 'tiếp nhận ghi lúc hết giữ');
    assert.equal(await eta(), q0 + 2, 'đã làm → vào hàng chờ');
  });
});
