// F-100 — tự xác nhận chuyển khoản qua SePay: tiền vào khớp bàn thì tự đóng bill (ADR-063 D-249…D-252). SQL Server thật + máy chủ
// SePay giả (node:http) để kiểm cách hỏi API (Bearer, tài khoản, mốc thời gian, giao dịch cuối, lỗi 401 / 429).
import http from 'node:http';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, mgr, ids, staffSock, cfg, bankFeed;
let pendingTable, paidQr, shortTable; // dùng lại giữa các bài (chạy tuần tự)
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
const simulate = (body, token = admin) => call(token, 'post', '/api/admin/bank-feed/simulate', body);
const feedStatus = (token = admin) => call(token, 'get', '/api/admin/bank-feed');
const sessionStatus = async (s) => (await q1(`SELECT Status FROM dbo.Sessions WHERE SessionId = '${s}'`))[0].Status;
const paymentsOf = (s) =>
  q1(`SELECT p.Method, p.AmountDue, u.Username FROM dbo.Payments p JOIN dbo.Users u ON u.UserId = p.ReceivedBy WHERE p.SessionId = '${s}'`);
const countTxn = async (where = '1 = 1') => (await q1(`SELECT COUNT(*) AS n FROM dbo.BankTransactions WHERE ${where}`))[0].n;
/** Giờ Việt Nam dạng SePay trả về ("2026-11-17 21:05:00"). */
const vnTime = (ms) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');

async function guestOrder(table, items, { accept = true } = {}) {
  const C = await app.customer();
  const s = await app.seat(C, table);
  const o = await C.post('/api/orders', { sessionId: s, items });
  assert.equal(o.status, 201, JSON.stringify(o.body));
  if (accept) ok(await call(staff, 'post', `/api/orders/${o.body.orderId}/accept`, {}));
  return { C, s, orderId: o.body.orderId };
}
/** Số tiền + nội dung trên mã QR của điện thoại khách. */
const qrOf = async ({ C, s }) => ok(await C.get(`/api/sessions/${s}/transfer`));

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  ok(await call(admin, 'post', '/api/admin/users', { username: 'qltienvao', password: 'Pass@123', fullName: 'Quản lý Cửa Hàng', role: 'STORE_MGR' }), 201);
  mgr = await app.login('qltienvao', 'Pass@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 0 }), 201);
  staffSock = await app.connect({ auth: { token: staff } });
  ({ config: cfg } = await import('../src/config.js'));
  bankFeed = await import('../src/services/bankFeedService.js');
  ok(await settings(BANK));
});

after(() => {
  if (cfg) cfg.sepay.token = '';
  return app?.close();
});

describe('Tự xác nhận chuyển khoản qua SePay (F-100)', () => {
  test('AC-100-01: chủ quán bật "Tự xác nhận khi tiền vào" (quản lý cửa hàng không đổi được — 403 OWNER_ONLY); trạng thái báo đã có khóa SePay chưa, lần hỏi cuối, lỗi cuối, số khoản chưa khớp — chỉ chủ quán xem; giả lập chỉ chủ quán, chưa bật → 409 AUTO_CONFIRM_OFF; mã QR của khách báo "quán tự xác nhận" khi đã bật và có khóa', async () => {
    const st0 = ok(await feedStatus());
    assert.deepEqual([st0.configured, st0.enabled, st0.lastSyncAt, st0.lastError, st0.unmatched], [false, false, null, null, 0]);
    const off = await simulate({ amount: 10000, content: 'CF 01 ABCDEF' });
    assert.deepEqual([off.status, off.body.code], [409, 'AUTO_CONFIRM_OFF']);

    const denied = await settings({ autoConfirm: true }, mgr);
    assert.deepEqual([denied.status, denied.body.code], [403, 'OWNER_ONLY']);
    for (const r of [await feedStatus(mgr), await simulate({ amount: 1000, content: 'CF 01 ABCDEF' }, mgr)]) {
      assert.deepEqual([r.status, r.body.code], [403, 'OWNER_ONLY']);
    }
    assert.equal((await feedStatus(staff)).status, 403, 'nhân viên không vào trang quản lý');

    const t0 = Date.now();
    const s = ok(await settings({ autoConfirm: true }));
    assert.equal(s.autoConfirm, true);
    assert.ok(new Date(s.autoConfirmSince).getTime() >= t0 - 1000, 'mốc bắt đầu = lúc bật (không xét tiền vào cũ)');
    assert.equal(s.sepaySinceId, null);
    assert.deepEqual(Object.keys(ok(await api.get('/api/shop')).transfer), ['enabled'], '/api/shop không lộ thêm gì');

    // Có khóa trong .env → "đã cấu hình"; điện thoại khách ghi "quán tự xác nhận" chỉ khi đã bật + có khóa
    pendingTable = await guestOrder('06', [{ menuItemId: ids['Nước suối'], quantity: 1 }], { accept: false });
    assert.equal((await qrOf(pendingTable)).auto, false, 'chưa có khóa SePay');
    cfg.sepay.token = 'khoa-thu';
    try {
      const st1 = ok(await feedStatus());
      assert.deepEqual([st1.configured, st1.enabled], [true, true]);
      assert.equal((await qrOf(pendingTable)).auto, true);
    } finally {
      cfg.sepay.token = '';
    }
  });

  test('AC-100-02: tiền vào có mã "CF <bàn> <mã phiên>" đúng số phải thu (ca đang mở) → tự thu chuyển khoản cho bàn, người ghi "Tự động (ngân hàng)", quầy nhận bank.received MATCHED, điện thoại khách nhận session.settled; cùng giao dịch gửi lại không xử lý lần hai', async () => {
    const one = await guestOrder('01', [{ menuItemId: ids['Nước suối'], quantity: 2 }]);
    ok(await one.C.post(`/api/sessions/${one.s}/request-payment`, { method: 'TRANSFER' }));
    paidQr = await qrOf(one);
    const phone = await app.connect({ auth: { sessionId: one.s }, extraHeaders: { cookie: one.C.cookie } });
    const settled = app.waitFor(phone, 'session.settled', (p) => p.sessionId === one.s);
    const received = app.waitFor(staffSock, 'bank.received', (p) => p.table?.code === '01');
    // Ngân hàng hay thêm tiền tố và bỏ khoảng trắng trong nội dung
    const content = `MBVCB.1234567.${paidQr.content.replace(/ /g, '')}.CT tu 0123456789`;
    const row = ok(await simulate({ amount: paidQr.amount, content }));
    assert.deepEqual([row.status, row.sessionId, row.table?.code, row.handledBy], ['MATCHED', one.s, '01', 'Tự động (ngân hàng)']);
    assert.ok(row.paymentId, 'gắn lượt thu');
    assert.equal(await sessionStatus(one.s), 'CLOSED');
    const pays = await paymentsOf(one.s);
    assert.deepEqual(
      pays.map((p) => [p.Method, Number(p.AmountDue), p.Username]),
      [['TRANSFER', paidQr.amount, 'he-thong-ngan-hang']],
    );
    const evt = await received;
    assert.deepEqual([evt.status, evt.amount, evt.takeaway], ['MATCHED', paidQr.amount, false]);
    assert.equal((await settled).sessionId, one.s, 'điện thoại khách sang màn cảm ơn');

    // Cùng giao dịch SePay gửi lại → bỏ qua (khóa Provider + mã giao dịch)
    const two = await guestOrder('02', [{ menuItemId: ids['Nước suối'], quantity: 1 }]);
    const qr2 = await qrOf(two);
    const txn = { provider: 'SEPAY', providerTxnId: 'sepay-trung-1', amount: qr2.amount, content: qr2.content, transactionAt: new Date() };
    assert.equal((await bankFeed.handleIncoming(txn)).status, 'MATCHED');
    assert.equal(await bankFeed.handleIncoming(txn), null, 'gửi lại → không xử lý');
    assert.equal((await paymentsOf(two.s)).length, 1);
    assert.equal(await countTxn("ProviderTxnId = 'sepay-trung-1'"), 1);
  });

  test('AC-100-03: có mã nhưng không tự thu được (thiếu / dư, còn đơn chưa tiếp nhận, bàn đã thanh toán) → "chưa khớp" kèm lý do, bàn vẫn mở; mã bán mang đi → chỉ báo quầy; không có mã của quán → bỏ qua, không lưu, không báo', async () => {
    shortTable = await guestOrder('03', [{ menuItemId: ids['Nước suối'], quantity: 2 }]);
    const qr3 = await qrOf(shortTable);
    const short = ok(await simulate({ amount: qr3.amount - 1000, content: qr3.content }));
    assert.deepEqual([short.status, short.sessionId], ['UNMATCHED', shortTable.s]);
    assert.match(short.note, /Chuyển thiếu 1\.000đ/);
    assert.equal(await sessionStatus(shortTable.s), 'OPEN');

    const four = await guestOrder('04', [{ menuItemId: ids['Nước suối'], quantity: 1 }]);
    const over = ok(await simulate({ amount: (await qrOf(four)).amount + 5000, content: (await qrOf(four)).content }));
    assert.equal(over.status, 'UNMATCHED');
    assert.match(over.note, /Chuyển dư 5\.000đ/);
    assert.equal(await sessionStatus(four.s), 'OPEN');

    // Đúng số tiền nhưng còn đơn chưa tiếp nhận (bàn 06) → không tự thu
    const qr6 = await qrOf(pendingTable);
    const pending = ok(await simulate({ amount: qr6.amount, content: qr6.content }));
    assert.equal(pending.status, 'UNMATCHED');
    assert.match(pending.note, /chưa tiếp nhận/);
    assert.equal(await sessionStatus(pendingTable.s), 'OPEN');

    // Bàn đã thanh toán (khách chuyển lần hai)
    const again = ok(await simulate({ amount: paidQr.amount, content: paidQr.content }));
    assert.deepEqual([again.status, again.table?.code], ['UNMATCHED', '01']);
    assert.match(again.note, /đã thanh toán/);

    // Mã bán mang đi → chỉ báo quầy (nhân viên ghi đơn như thường)
    const ta = app.waitFor(staffSock, 'bank.received', (p) => p.takeaway === true);
    const takeaway = ok(await simulate({ amount: 35000, content: 'CF MANG DI 0930' }));
    assert.deepEqual([takeaway.status, takeaway.handledBy], ['HANDLED', 'Tự động (ngân hàng)']);
    assert.equal((await ta).amount, 35000);

    // Không có mã của quán (tài khoản cá nhân: lương, người nhà chuyển…) → bỏ qua, không lưu
    const before = await countTxn();
    const skipped = ok(await simulate({ amount: 5_000_000, content: 'NGUYEN VAN B chuyen tien' }));
    assert.equal(skipped.status, 'SKIPPED');
    assert.equal(await countTxn(), before, 'không lưu');
    assert.equal(ok(await feedStatus()).unmatched, 4);
  });

  test('AC-100-04: thu ngân xử lý khoản chưa khớp — ghép vào bàn đúng số phải thu → thu chuyển khoản (người ghi là thu ngân), lệch → 409 AMOUNT_MISMATCH; "Đã xử lý" phải có ghi chú; khoản đã xử lý không xử lý lại (409); CSDL chặn xóa; chưa đăng nhập / khách không xem được', async () => {
    const list = ok(await call(staff, 'get', '/api/bank-transactions'));
    assert.equal(list.length, 4);
    const of = (code) => list.find((b) => b.table?.code === code);
    const [short, over, pending] = [of('03'), of('04'), of('06')];

    const mismatch = await call(staff, 'post', `/api/bank-transactions/${short.bankTxnId}/match`, { sessionId: short.sessionId });
    assert.deepEqual([mismatch.status, mismatch.body.code], [409, 'AMOUNT_MISMATCH']);
    assert.equal(await sessionStatus(short.sessionId), 'OPEN');

    // Tiếp nhận đơn rồi ghép đúng số tiền → thu chuyển khoản, người ghi là thu ngân
    ok(await call(staff, 'post', `/api/orders/${pendingTable.orderId}/accept`, {}));
    const updated = app.waitFor(staffSock, 'bank.updated', (p) => p.bankTxnId === pending.bankTxnId);
    const matched = ok(await call(staff, 'post', `/api/bank-transactions/${pending.bankTxnId}/match`, { sessionId: pendingTable.s }));
    const staffName = (await q1("SELECT FullName FROM dbo.Users WHERE Username = 'staff1'"))[0].FullName;
    assert.deepEqual([matched.status, matched.handledBy, matched.sessionId], ['MATCHED', staffName, pendingTable.s]);
    assert.equal((await updated).status, 'MATCHED');
    assert.equal(await sessionStatus(pendingTable.s), 'CLOSED');
    assert.deepEqual(
      (await paymentsOf(pendingTable.s)).map((p) => [p.Method, p.Username]),
      [['TRANSFER', 'staff1']],
    );
    const reuse = await call(staff, 'post', `/api/bank-transactions/${pending.bankTxnId}/match`, { sessionId: short.sessionId });
    assert.deepEqual([reuse.status, reuse.body.code], [409, 'BANK_TXN_HANDLED'], 'một khoản tiền không thu cho hai bàn');

    const noNote = await call(staff, 'post', `/api/bank-transactions/${over.bankTxnId}/resolve`, { note: '  ' });
    assert.deepEqual([noNote.status, noNote.body.code], [400, 'NOTE_REQUIRED']);
    const resolved = ok(await call(staff, 'post', `/api/bank-transactions/${over.bankTxnId}/resolve`, { note: 'Đã trả lại khách 5.000đ tiền mặt' }));
    assert.deepEqual([resolved.status, resolved.note, resolved.handledBy], ['HANDLED', 'Đã trả lại khách 5.000đ tiền mặt', staffName]);
    const twice = await call(staff, 'post', `/api/bank-transactions/${over.bankTxnId}/resolve`, { note: 'Lần hai' });
    assert.deepEqual([twice.status, twice.body.code], [409, 'BANK_TXN_HANDLED']);

    assert.deepEqual(
      ok(await call(staff, 'get', '/api/bank-transactions'))
        .map((b) => b.table?.code)
        .sort(),
      ['01', '03'],
      'còn khoản chưa xử lý',
    );
    assert.ok(ok(await call(staff, 'get', '/api/bank-transactions?status=ALL')).length >= 7, 'xem lại mọi khoản 14 ngày');
    await assert.rejects(pool.request().query(`DELETE FROM dbo.BankTransactions WHERE BankTxnId = ${over.bankTxnId}`), /HISTORY_NO_DELETE/);
    assert.equal((await api.get('/api/bank-transactions')).status, 401, 'chưa đăng nhập');
    assert.equal((await (await app.customer()).get('/api/bank-transactions')).status, 401, 'điện thoại khách');
  });

  test('AC-100-05: hỏi SePay (máy chủ SePay giả): Bearer khóa trong .env, chỉ tiền vào của tài khoản quán, lần đầu từ lúc bật, sau đó theo giao dịch cuối; khớp thì tự thu, khoản không phải của quán bỏ qua; hỏi lại không xử lý trùng; 401 / 429 ghi lỗi, đợi rồi hỏi tiếp', async () => {
    const seen = [];
    let mode = 'ok';
    let txns = [];
    const fake = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://sepay.test');
      seen.push({ path: url.pathname, q: Object.fromEntries(url.searchParams), auth: req.headers.authorization });
      const send = (code, body, headers = {}) => {
        res.writeHead(code, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(body));
      };
      if (mode === '401') return send(401, { status: 401, error: 'Unauthorized' });
      if (mode === '429') return send(429, { status: 429 }, { 'retry-after': '7' });
      if (url.pathname === '/v2/bank-accounts') {
        return send(200, {
          status: 'success',
          data: [
            { id: 'acc-khac', account_number: '999888777' },
            { id: 'acc-quan', account_number: BANK.bankNumber },
          ],
        });
      }
      if (url.pathname === '/v2/transactions') return send(200, { status: 'success', data: txns, meta: { pagination: { has_more: false } } });
      return send(404, {});
    });
    await new Promise((r) => fake.listen(0, '127.0.0.1', r));
    const saved = { ...cfg.sepay };
    try {
      Object.assign(cfg.sepay, { token: 'khoa-sepay-thu', baseUrl: `http://127.0.0.1:${fake.address().port}`, bankAccountId: '' });
      Object.assign(bankFeed.feed, { accountId: null, accountFor: null, retryAt: 0 });
      ok(await settings({ autoConfirm: false }));
      ok(await settings({ autoConfirm: true })); // bật lại → mốc mới, quên giao dịch cuối

      const five = await guestOrder('05', [{ menuItemId: ids['Nước suối'], quantity: 1 }]);
      const qr5 = await qrOf(five);
      const tx = (id, amount, content, at = Date.now()) => ({
        id,
        transaction_date: vnTime(at),
        account_number: BANK.bankNumber,
        transfer_type: 'in',
        amount_in: amount,
        amount_out: 0,
        transaction_content: content,
        reference_number: `FT-${id}`,
      });
      txns = [
        tx('tx-cu', qr5.amount, qr5.content, Date.now() - 3600e3), // trước lúc bật — nhân viên đã xử lý tay
        tx('tx-luong', 8_000_000, 'LUONG THANG 11'), // không phải tiền quán
        tx('tx-ban05', qr5.amount, `IBFT ${qr5.content}`),
      ];
      const r1 = await bankFeed.pollOnce();
      assert.equal(r1.handled?.length, 1, JSON.stringify(r1));
      const [accounts, first] = seen;
      assert.deepEqual([accounts.path, accounts.auth], ['/v2/bank-accounts', 'Bearer khoa-sepay-thu']);
      assert.deepEqual(
        [first.path, first.auth, first.q.transfer_type, first.q.bank_account_id, first.q.since_id],
        ['/v2/transactions', 'Bearer khoa-sepay-thu', 'in', 'acc-quan', undefined],
      );
      assert.ok(first.q.transaction_date_from, 'lần đầu: từ lúc bật');
      assert.equal(await sessionStatus(five.s), 'CLOSED');
      assert.deepEqual(
        (await paymentsOf(five.s)).map((p) => p.Username),
        ['he-thong-ngan-hang'],
      );
      assert.equal(ok(await call(admin, 'get', '/api/admin/settings')).sepaySinceId, 'tx-ban05');
      assert.equal(await countTxn("ProviderTxnId IN ('tx-cu', 'tx-luong')"), 0, 'không lưu khoản ngoài');

      // Lần sau: theo giao dịch cuối; SePay trả lại giao dịch cũ → không thu hai lần; khoản mới sai số tiền → chưa khớp;
      // giờ giao dịch dạng lạ → lấy giờ nhận (không kẹt vòng hỏi)
      const qr3 = await qrOf(shortTable);
      txns = [txns[2], tx('tx-ban03', 1000, qr3.content), { ...tx('tx-gio-la', 2000, qr3.content), transaction_date: '17/11/2026 9:05 PM' }];
      const r2 = await bankFeed.pollOnce();
      assert.equal(r2.handled?.length, 2, JSON.stringify(r2));
      assert.equal(seen.at(-1).q.since_id, 'tx-ban05');
      assert.equal(seen.filter((x) => x.path === '/v2/bank-accounts').length, 1, 'đã biết tài khoản — không hỏi lại');
      assert.equal((await paymentsOf(five.s)).length, 1, 'không thu hai lần');
      const later = await q1(
        "SELECT ProviderTxnId, Status, TransactionAt FROM dbo.BankTransactions WHERE ProviderTxnId IN ('tx-ban03', 'tx-gio-la') ORDER BY BankTxnId",
      );
      assert.deepEqual(
        later.map((x) => [x.ProviderTxnId, x.Status]),
        [
          ['tx-ban03', 'UNMATCHED'],
          ['tx-gio-la', 'UNMATCHED'],
        ],
      );
      assert.ok(Math.abs(new Date(later[1].TransactionAt).getTime() - Date.now()) < 120e3, 'giờ lạ → giờ nhận');
      assert.equal(ok(await call(admin, 'get', '/api/admin/settings')).sepaySinceId, 'tx-gio-la');

      // 401: ghi lỗi, đợi rồi mới hỏi lại
      mode = '401';
      assert.match((await bankFeed.pollOnce()).error, /401/);
      assert.match(ok(await feedStatus()).lastError, /401/);
      const calls = seen.length;
      assert.deepEqual(await bankFeed.pollOnce(), { skipped: true, retry: true });
      assert.equal(seen.length, calls, 'đang đợi — không gọi SePay');
      // 429: đợi theo Retry-After
      bankFeed.feed.retryAt = 0;
      mode = '429';
      const t0 = Date.now();
      assert.match((await bankFeed.pollOnce()).error, /429/);
      assert.ok(bankFeed.feed.retryAt >= t0 + 6000 && bankFeed.feed.retryAt <= Date.now() + 7000, 'đợi 7 giây');
      // Hết lỗi → hỏi tiếp bình thường, xóa lỗi
      bankFeed.feed.retryAt = 0;
      mode = 'ok';
      txns = [];
      assert.deepEqual((await bankFeed.pollOnce()).handled, []);
      const st = ok(await feedStatus());
      assert.equal(st.lastError, null);
      assert.ok(st.lastSyncAt);
    } finally {
      Object.assign(cfg.sepay, saved);
      await new Promise((r) => fake.close(r));
    }
  });
});
