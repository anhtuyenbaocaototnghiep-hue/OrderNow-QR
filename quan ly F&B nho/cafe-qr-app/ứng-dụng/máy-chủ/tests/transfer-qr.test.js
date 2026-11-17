// F-099 — chuyển khoản bằng VietQR: mã có sẵn số tiền + nội dung riêng của bàn, nhân viên xác nhận đã nhận (ADR-062 D-245…D-248). SQL Server thật.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, mgr, ids, vietqr, staffSock;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const q1 = async (text) => (await pool.request().query(text)).recordset;
const BANK = { transferEnabled: true, bankBin: '970403', bankNumber: '060123456789', bankKind: 'ACCOUNT', bankHolder: 'NGUYEN VAN A' };
const settings = (patch, token = admin) => call(token, 'put', '/api/admin/settings', patch);
const shop = async () => (await api.get('/api/shop')).body;
const codeOf = (sessionId) => sessionId.replace(/-/g, '').slice(0, 6).toUpperCase();
const crcOk = (payload) => vietqr.crc16(payload.slice(0, -4)) === payload.slice(-4);
async function guestOrder(table, items) {
  const C = await app.customer();
  const s = await app.seat(C, table);
  const o = await C.post('/api/orders', { sessionId: s, items });
  assert.equal(o.status, 201, JSON.stringify(o.body));
  return { C, s, order: o.body };
}

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  ok(await call(admin, 'post', '/api/admin/users', { username: 'qlchuyenkhoan', password: 'Pass@123', fullName: 'Quản lý Cửa Hàng', role: 'STORE_MGR' }), 201);
  mgr = await app.login('qlchuyenkhoan', 'Pass@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 0 }), 201);
  staffSock = await app.connect({ auth: { token: staff } });
  vietqr = await import('../src/domain/vietqr.js');
});

after(() => app?.close());

describe('Chuyển khoản bằng VietQR (F-099)', () => {
  test('AC-099-01: chủ quán nhập ngân hàng, số tài khoản / số thẻ, tên chủ và bật nhận chuyển khoản → /api/shop báo transfer.enabled; thiếu số hoặc tắt → không hiện; quản lý cửa hàng không đổi được (403 OWNER_ONLY); ngân hàng ngoài danh sách → 400', async () => {
    assert.equal((await shop()).transfer.enabled, false, 'mặc định tắt');
    ok(await settings(BANK));
    assert.equal((await shop()).transfer.enabled, true);
    const s = ok(await call(admin, 'get', '/api/admin/settings'));
    assert.deepEqual([s.transferEnabled, s.bankBin, s.bankNumber, s.bankKind, s.bankHolder], [true, '970403', '060123456789', 'ACCOUNT', 'NGUYEN VAN A']);

    ok(await settings({ bankNumber: '' }));
    assert.equal((await shop()).transfer.enabled, false, 'thiếu số → khách không thấy');
    ok(await settings({ bankNumber: BANK.bankNumber, transferEnabled: false }));
    assert.equal((await shop()).transfer.enabled, false, 'tắt → khách không thấy');
    ok(await settings(BANK));

    const denied = await settings({ bankNumber: '999999999' }, mgr);
    assert.deepEqual([denied.status, denied.body.code], [403, 'OWNER_ONLY']);
    assert.equal((await settings({ bankBin: '123456' })).status, 400, 'ngân hàng ngoài danh sách');
    assert.equal((await settings({ bankNumber: '12 34' })).status, 400, 'số có khoảng trắng');
    assert.equal(ok(await call(admin, 'get', '/api/admin/settings')).bankNumber, BANK.bankNumber, 'không đổi');
  });

  test('AC-099-02: điện thoại khách lấy mã VietQR của bàn — đúng số tiền tạm tính, nội dung "CF <mã bàn> <mã phiên>", mã chuẩn (CRC đúng, QRIBFTTA cho số tài khoản / QRIBFTTC cho số thẻ); người ngoài nhóm không lấy được; quán chưa bật 409 TRANSFER_OFF', async () => {
    const { C, s } = await guestOrder('04', [{ menuItemId: ids['Nước suối'], quantity: 2 }]);
    const detail = (await C.get(`/api/sessions/${s}`)).body;
    const due = detail.bill?.amountDue ?? detail.amountDue;
    const t = await C.get(`/api/sessions/${s}/transfer`);
    assert.equal(t.status, 200, JSON.stringify(t.body));
    assert.deepEqual(
      [t.body.amount, t.body.content, t.body.bankName, t.body.kind, t.body.number, t.body.holder],
      [due, `CF 04 ${codeOf(s)}`, 'Sacombank', 'ACCOUNT', '060123456789', 'NGUYEN VAN A'],
    );
    const p = t.body.payload;
    assert.ok(crcOk(p), 'CRC đúng');
    assert.ok(p.includes('0208QRIBFTTA'), 'chuyển tới số tài khoản');
    assert.ok(p.includes(`54${String(String(due).length).padStart(2, '0')}${due}`), 'có sẵn số tiền');
    assert.ok(p.includes(`CF 04 ${codeOf(s)}`), 'có sẵn nội dung');
    assert.ok(t.body.qr.startsWith('data:image/png;base64,'));

    const stranger = await app.customer();
    assert.ok([403, 404].includes((await stranger.get(`/api/sessions/${s}/transfer`)).status), 'người ngoài nhóm');

    ok(await settings({ bankKind: 'CARD', bankNumber: '1234567812345678' }));
    const card = (await C.get(`/api/sessions/${s}/transfer`)).body;
    assert.deepEqual([card.kind, card.number, crcOk(card.payload), card.payload.includes('0208QRIBFTTC')], ['CARD', '1234 5678 1234 5678', true, true]);
    ok(await settings({ bankKind: 'ACCOUNT', bankNumber: BANK.bankNumber }));

    ok(await settings({ transferEnabled: false }));
    const off = await C.get(`/api/sessions/${s}/transfer`);
    assert.deepEqual([off.status, off.body.code], [409, 'TRANSFER_OFF']);
    ok(await settings({ transferEnabled: true }));
  });

  test('AC-099-03: khách gọi thanh toán chọn "Chuyển khoản" → quầy nhận sự kiện + danh sách bàn ghi payMethod TRANSFER; quán chưa bật → 409 TRANSFER_OFF; khách không tự ghi đã trả (settle 401); nhân viên "Đã nhận chuyển khoản" mới đóng bàn, lượt thu ghi chuyển khoản', async () => {
    const { C, s, order } = await guestOrder('06', [{ menuItemId: ids['Nước suối'], quantity: 1 }]);
    ok(await call(staff, 'post', `/api/orders/${order.orderId}/accept`, {})); // thu tiền cần đơn đã tiếp nhận
    const event = app.waitFor(staffSock, 'session.payment_requested', (p) => p.sessionId === s);
    const r = await C.post(`/api/sessions/${s}/request-payment`, { method: 'TRANSFER' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.payMethod, 'TRANSFER');
    assert.equal((await event).payMethod, 'TRANSFER');
    const listed = ok(await call(staff, 'get', '/api/sessions')).find((x) => x.sessionId === s);
    assert.deepEqual([listed.status, listed.payMethod], ['PAYMENT_REQUESTED', 'TRANSFER']);
    assert.equal((await C.get(`/api/sessions/${s}`)).body.payMethod, 'TRANSFER', 'điện thoại khách tải lại vẫn biết đã chọn chuyển khoản');

    assert.equal((await C.post(`/api/sessions/${s}/settle`, { method: 'TRANSFER' })).status, 401, 'khách không tự ghi đã trả');
    assert.equal((await q1(`SELECT Status FROM dbo.Sessions WHERE SessionId = '${s}'`))[0].Status, 'PAYMENT_REQUESTED');

    const preview = ok(await call(staff, 'post', `/api/sessions/${s}/settle/preview`, {}));
    ok(await call(staff, 'post', `/api/sessions/${s}/settle`, { method: 'TRANSFER', expectedAmountDue: preview.totals.amountDue }));
    const [pay] = await q1(`SELECT Method FROM dbo.Payments WHERE SessionId = '${s}'`);
    assert.equal(pay.Method, 'TRANSFER');
    assert.equal((await q1(`SELECT Status FROM dbo.Sessions WHERE SessionId = '${s}'`))[0].Status, 'CLOSED');

    ok(await settings({ transferEnabled: false }));
    const g = await guestOrder('01', [{ menuItemId: ids['Nước suối'], quantity: 1 }]);
    const blocked = await g.C.post(`/api/sessions/${g.s}/request-payment`, { method: 'TRANSFER' });
    assert.deepEqual([blocked.status, blocked.body.code], [409, 'TRANSFER_OFF']);
    assert.equal((await g.C.post(`/api/sessions/${g.s}/request-payment`, {})).body.payMethod, 'CASH', 'không chọn → tiền mặt');
    ok(await settings({ transferEnabled: true }));
  });

  test('AC-099-04: màn quầy lấy mã VietQR đúng số phải thu (bàn: cùng nội dung với điện thoại khách; bán mang đi: "CF MANG DI"); phiếu tạm tính có mã; chưa đăng nhập / khách không lấy được (401)', async () => {
    const { C, s } = await guestOrder('05', [{ menuItemId: ids['Nước suối'], quantity: 3 }]);
    const qr = ok(await call(staff, 'post', '/api/payments/transfer-qr', { amount: 30_000, sessionId: s }));
    assert.deepEqual([qr.amount, qr.content, crcOk(qr.payload)], [30_000, `CF 05 ${codeOf(s)}`, true]);
    assert.equal((await C.get(`/api/sessions/${s}/transfer`)).body.content, qr.content, 'cùng nội dung với điện thoại khách');

    const takeaway = ok(await call(staff, 'post', '/api/payments/transfer-qr', { amount: 25_000 }));
    assert.match(takeaway.content, /^CF MANG DI \d{4}$/);
    assert.equal(takeaway.amount, 25_000);

    assert.equal((await api.post('/api/payments/transfer-qr').send({ amount: 1000 })).status, 401, 'chưa đăng nhập');
    assert.equal((await C.post('/api/payments/transfer-qr', { amount: 1000, sessionId: s })).status, 401, 'điện thoại khách');

    const receipt = ok(await call(staff, 'get', `/api/sessions/${s}/receipt?mode=provisional`));
    assert.ok(receipt.transfer?.qr?.startsWith('data:image/png;base64,'), JSON.stringify(receipt.transfer));
    assert.deepEqual([receipt.transfer.amount, receipt.transfer.content], [receipt.amountDue, `CF 05 ${codeOf(s)}`]);
  });
});
