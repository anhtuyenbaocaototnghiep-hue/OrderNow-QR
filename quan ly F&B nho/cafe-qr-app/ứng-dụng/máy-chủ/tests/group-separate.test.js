// ADR-065 D-255 (TASK-127): khách tự vào nhóm của bàn (F-097) bấm "Tôi đi riêng — hóa đơn riêng" → rời nhóm, nhóm riêng ở cùng bàn.
// Chỉ khi điện thoại này chưa gửi món trong nhóm (SessionClients.OrderedAt — migration 0063). SQL Server thật.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, staffSock;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const qrOf = async (code) => (await pool.request().query(`SELECT QrToken FROM dbo.Tables WHERE Code = '${code}'`)).recordset[0].QrToken;
const water = () => [{ menuItemId: ids['Nước suối'], quantity: 1 }];

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 0 }), 201); // gửi món cần ca đang mở (F-055)
  staffSock = await app.connect({ auth: { token: staff } });
});

after(() => app?.close());

describe('Đi riêng — hóa đơn riêng (ADR-065, F-097)', () => {
  test('AC-097-05: khách tự vào nhóm của bàn bấm "Tôi đi riêng" → rời nhóm (không còn xem món / hóa đơn của nhóm đó), có nhóm riêng ở cùng bàn; quét lại vào nhóm riêng; quầy thấy bàn có 2 nhóm (session.opened); món gọi sau đó vào hóa đơn riêng', async () => {
    const qr = await qrOf('01');
    const C1 = await app.customer();
    const A = await app.seat(C1, '01');
    ok(await C1.post('/api/orders', { sessionId: A, items: water() }), 201);

    const C2 = await app.customer();
    assert.equal(ok(await C2.post('/api/sessions/scan', { qrToken: qr })).state, 'OCCUPIED');
    ok(await C2.post(`/api/sessions/${A}/join`, { qrToken: qr }));
    assert.equal((await C2.get(`/api/sessions/${A}`)).status, 200, 'đã vào nhóm của bàn');

    const opened = app.waitFor(staffSock, 'session.opened', (p) => p.table?.code === '01' && p.sessionId !== A);
    const r = ok(await C2.post(`/api/sessions/${A}/separate`, { qrToken: qr }));
    const B = r.session.sessionId;
    assert.notEqual(B, A);
    assert.equal(r.session.table.code, '01');
    assert.equal((await opened).sessionId, B);

    assert.equal((await C2.get(`/api/sessions/${A}`)).status, 403, 'không còn xem nhóm cũ');
    assert.equal(ok(await C2.get(`/api/sessions/${B}`)).sessionId, B);
    const again = ok(await C2.post('/api/sessions/scan', { qrToken: qr }));
    assert.deepEqual([again.state, again.session.sessionId], ['MEMBER', B], 'quét lại vào nhóm riêng');
    const groups = ok(await call(staff, 'get', '/api/tables')).find((t) => t.code === '01').sessions;
    assert.deepEqual(groups.map((g) => g.sessionId).sort(), [A, B].sort());

    ok(await C2.post('/api/orders', { sessionId: B, items: water() }), 201);
    assert.equal(ok(await C1.get(`/api/sessions/${A}`)).orders.length, 1, 'nhóm cũ chỉ có món của nhóm');
    assert.equal(ok(await C2.get(`/api/sessions/${B}`)).orders.length, 1, 'nhóm riêng có món của mình');
    assert.equal((await C1.get(`/api/sessions/${B}`)).status, 403, 'người nhóm cũ không xem được nhóm riêng');
  });

  test('AC-097-06: đã gửi món trong nhóm → không đi riêng được (409 ALREADY_ORDERED, vẫn ở nhóm); điện thoại không ở nhóm → 403 NOT_IN_GROUP; mã bàn khác → 404; nhóm đã đóng → 409 SESSION_CLOSED', async () => {
    const qr = await qrOf('02');
    const C1 = await app.customer();
    const A = await app.seat(C1, '02');
    const C2 = await app.customer();
    ok(await C2.post(`/api/sessions/${A}/join`, { qrToken: qr }));
    ok(await C2.post('/api/orders', { sessionId: A, items: water() }), 201);
    const blocked = await C2.post(`/api/sessions/${A}/separate`, { qrToken: qr });
    assert.deepEqual([blocked.status, blocked.body.code], [409, 'ALREADY_ORDERED']);
    assert.equal((await C2.get(`/api/sessions/${A}`)).status, 200, 'vẫn ở nhóm');
    const groups = ok(await call(staff, 'get', '/api/tables')).find((t) => t.code === '02').sessions;
    assert.equal(groups.length, 1, 'không mở thêm nhóm');

    const C3 = await app.customer();
    const stranger = await C3.post(`/api/sessions/${A}/separate`, { qrToken: qr });
    assert.deepEqual([stranger.status, stranger.body.code], [403, 'NOT_IN_GROUP']);
    assert.equal((await C2.post(`/api/sessions/${A}/separate`, { qrToken: await qrOf('03') })).status, 404, 'nhóm không ở bàn này');

    const qr4 = await qrOf('04');
    const C4 = await app.customer();
    const D = await app.seat(C4, '04');
    const C5 = await app.customer();
    ok(await C5.post(`/api/sessions/${D}/join`, { qrToken: qr4 }));
    ok(await call(admin, 'post', `/api/sessions/${D}/cancel`, { reason: 'Khách về sớm' }));
    const closed = await C5.post(`/api/sessions/${D}/separate`, { qrToken: qr4 });
    assert.deepEqual([closed.status, closed.body.code], [409, 'SESSION_CLOSED']);
  });
});
