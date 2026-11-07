// F-074 — bán tiếp khi mất mạng: mã lượt thu chống ghi hai lần, gửi bù đơn bán tạm, phiếu bán tay (ADR-032). SQL Server thật.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, lead, ids, flushAudit, shiftId;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const fail = (r, status, code) => assert.deepEqual([r.status, r.body.code], [status, code], JSON.stringify(r.body));
const q1 = async (text) => (await pool.request().query(text)).recordset;
const one = async (text) => (await q1(text))[0];
const minutesAgo = (m) => new Date(Math.floor((Date.now() - m * 60_000) / 1000) * 1000).toISOString();
const sale = (over = {}) => ({
  clientRef: randomUUID(),
  localCode: 'T-0001',
  soldAt: minutesAgo(20),
  shiftId,
  method: 'CASH',
  amountReceived: 100_000,
  total: 60_000,
  device: 'Máy quầy 2',
  items: [
    { menuItemId: ids['Cà phê đen'], quantity: 2, optionIds: [], unitPrice: 25_000 },
    { menuItemId: ids['Nước suối'], quantity: 1, optionIds: [], unitPrice: 10_000 },
  ],
  ...over,
});
const stockOf = async (name) => Number((await one(`SELECT StockQty FROM dbo.Ingredients WHERE Name = N'${name}'`)).StockQty);

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  ok(await call(admin, 'post', '/api/admin/users', { username: 'lead1', password: 'Pass@123', fullName: 'Trưởng ca Minh', role: 'MANAGER' }), 201);
  staff = await app.login('staff1', 'Staff@123');
  lead = await app.login('lead1', 'Pass@123');
  ids = await app.ids();
  shiftId = ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 500_000 }), 201).shift.shiftId;
  ({ flushAudit } = await import('../src/middleware/audit.js'));
});

after(() => app?.close());

describe('Mã lượt thu (ADR-032 D-141)', () => {
  test('AC-074-01: bán mang đi gửi kèm mã lượt thu — gửi lại cùng mã (mạng chập chờn, bấm hai lần) trả đúng đơn đã ghi, không tạo đơn / lượt thu thứ hai', async () => {
    const clientRef = randomUUID();
    const body = { items: [{ menuItemId: ids['Nước suối'], quantity: 1 }], amountReceived: 20_000, clientRef };
    const first = ok(await call(staff, 'post', '/api/orders/takeaway', body), 201);
    const again = ok(await call(staff, 'post', '/api/orders/takeaway', body), 200);
    assert.equal(again.duplicate, true);
    assert.equal(again.order.orderId, first.order.orderId);
    assert.equal((await one(`SELECT COUNT(*) AS n FROM dbo.Orders WHERE ClientRef = '${clientRef}'`)).n, 1);
    assert.equal((await one(`SELECT COUNT(*) AS n FROM dbo.Payments WHERE OrderId = ${first.order.orderId}`)).n, 1);
    // Lượt thu đã ghi lúc có mạng mà máy quầy tưởng mất → gửi bù cùng mã cũng không ghi lại
    const backfill = ok(
      await call(
        staff,
        'post',
        '/api/offline-sales',
        sale({ clientRef, total: 10_000, amountReceived: 20_000, items: body.items.map((i) => ({ ...i, unitPrice: 10_000 })) }),
      ),
    );
    assert.deepEqual([backfill.status, backfill.order.orderId], ['DUPLICATE', first.order.orderId]);
  });
});

describe('Gửi bù đơn bán lúc mất mạng (ADR-032 D-142…D-145)', () => {
  test('AC-074-02: gửi bù → đơn mang đi "Đã xong", đúng giờ bán, đúng giá đã thu, ghi vào ca, trừ kho, có nhật ký; món đang tắt vẫn ghi; gửi lại → DUPLICATE; danh sách theo ca', async () => {
    await q1(`UPDATE dbo.MenuItems SET IsAvailable = 0 WHERE MenuItemId = ${ids['Nước suối']}`); // tắt sau khi đã bán lúc mất mạng
    const beforeCoffee = await stockOf('Cà phê cốt');
    const body = sale();
    const r = ok(await call(staff, 'post', '/api/offline-sales', body), 201);
    assert.equal(r.status, 'SYNCED');
    assert.deepEqual([r.order.type, r.order.status, r.order.paymentStatus, r.order.saleSource], ['TAKE_AWAY', 'COMPLETED', 'PAID', 'OFFLINE']);
    assert.equal(new Date(r.order.createdAt).toISOString(), body.soldAt);
    assert.equal(new Date(r.order.completedAt).toISOString(), body.soldAt);
    assert.deepEqual([r.payment.amountDue, r.payment.amountReceived, r.payment.method, r.payment.shiftId], [60_000, 100_000, 'CASH', shiftId]);
    assert.equal(new Date(r.payment.paidAt).toISOString(), body.soldAt);
    assert.deepEqual(r.issues, []);
    assert.equal(await stockOf('Cà phê cốt'), beforeCoffee - 50, 'trừ kho 2 ly × 25');
    assert.equal(Number((await one("SELECT ReservedQty FROM dbo.Ingredients WHERE Name = N'Cà phê cốt'")).ReservedQty), 0);
    await q1(`UPDATE dbo.MenuItems SET IsAvailable = 1 WHERE MenuItemId = ${ids['Nước suối']}`);

    const again = ok(await call(staff, 'post', '/api/offline-sales', body));
    assert.deepEqual([again.status, again.order.orderId], ['DUPLICATE', r.order.orderId]);
    assert.equal((await one(`SELECT COUNT(*) AS n FROM dbo.Orders WHERE ClientRef = '${body.clientRef}'`)).n, 1);
    assert.equal(await stockOf('Cà phê cốt'), beforeCoffee - 50, 'gửi lại không trừ kho lần nữa');

    const list = ok(await call(lead, 'get', `/api/offline-sales?shiftId=${shiftId}`));
    const row = list.find((x) => x.orderId === r.order.orderId);
    assert.deepEqual(
      [row.localCode, row.source, row.soldBy.fullName, row.device, row.amountDue],
      ['T-0001', 'OFFLINE', 'Nhân viên quầy 1', 'Máy quầy 2', 60_000],
    );
    await flushAudit();
    assert.equal((await one(`SELECT COUNT(*) AS n FROM dbo.AuditLogs WHERE Action = 'order.offline-sale' AND EntityId = '${r.order.orderId}'`)).n, 2);
    await assert.rejects(q1(`DELETE dbo.OfflineSales WHERE OrderId = ${r.order.orderId}`), /HISTORY_NO_DELETE/);
  });

  test('AC-074-03: kho thiếu → vẫn ghi, chỉ trừ phần còn có (không âm), báo "Chưa trừ"; giá khác bảng giá → ghi đúng số đã thu + báo; một cảnh báo cho cả ca; chuyển khoản → cần đối chiếu; SĐT hội viên → cộng điểm, SĐT lạ → báo', async () => {
    await q1("UPDATE dbo.Ingredients SET StockQty = 5, ReservedQty = 0 WHERE Name = N'Đường'");
    const beforeCoffee = await stockOf('Cà phê cốt');
    const short = ok(
      await call(
        staff,
        'post',
        '/api/offline-sales',
        sale({ total: 25_000, amountReceived: 50_000, items: [{ menuItemId: ids['Cà phê đen'], quantity: 1, unitPrice: 25_000 }] }),
      ),
      201,
    );
    const shortIssue = short.issues.find((i) => i.code === 'STOCK_SHORT');
    assert.match(shortIssue.text, /Đường/);
    assert.equal(await stockOf('Đường'), 5, 'không trừ phần thiếu, không âm');
    assert.equal(await stockOf('Cà phê cốt'), beforeCoffee - 25, 'nguyên liệu đủ vẫn trừ');

    const priced = ok(
      await call(
        staff,
        'post',
        '/api/offline-sales',
        sale({ total: 20_000, amountReceived: 20_000, items: [{ menuItemId: ids['Nước suối'], quantity: 2, unitPrice: 10_000 }] }),
      ),
      201,
    );
    assert.deepEqual(priced.issues, []);
    const diff = ok(
      await call(
        staff,
        'post',
        '/api/offline-sales',
        sale({ total: 24_000, amountReceived: 24_000, items: [{ menuItemId: ids['Nước suối'], quantity: 2, unitPrice: 12_000 }] }),
      ),
      201,
    );
    assert.match(diff.issues.find((i) => i.code === 'PRICE_DIFF').text, /Nước suối: thu 12\.000đ, bảng giá 10\.000đ/);
    assert.equal(diff.payment.amountDue, 24_000, 'ghi đúng số đã thu');
    const alerts = await q1(`SELECT Title FROM dbo.Alerts WHERE Kind = 'OFFLINE_SALE'`);
    assert.equal(alerts.length, 1, 'một cảnh báo cho cả ca');
    assert.match(alerts[0].Title, new RegExp(`ca #${shiftId}`));

    const transfer = ok(
      await call(
        staff,
        'post',
        '/api/offline-sales',
        sale({ method: 'TRANSFER', amountReceived: null, total: 10_000, items: [{ menuItemId: ids['Nước suối'], quantity: 1, unitPrice: 10_000 }] }),
      ),
      201,
    );
    assert.deepEqual(
      transfer.issues.map((i) => i.code),
      ['TRANSFER_CHECK'],
    );
    assert.equal(transfer.payment.method, 'TRANSFER');

    ok(await call(staff, 'post', '/api/members', { phone: '0912000074', fullName: 'Hội viên Mất Mạng', consent: true }), 201);
    const member = ok(
      await call(
        staff,
        'post',
        '/api/offline-sales',
        sale({ memberPhone: '0912 000 074', total: 10_000, amountReceived: 10_000, items: [{ menuItemId: ids['Nước suối'], quantity: 1, unitPrice: 10_000 }] }),
      ),
      201,
    );
    assert.ok(member.payment.member, 'gắn hội viên để cộng điểm');
    const stranger = ok(
      await call(
        staff,
        'post',
        '/api/offline-sales',
        sale({ memberPhone: '0999000111', total: 10_000, amountReceived: 10_000, items: [{ menuItemId: ids['Nước suối'], quantity: 1, unitPrice: 10_000 }] }),
      ),
      201,
    );
    assert.deepEqual(
      stranger.issues.map((i) => i.code),
      ['MEMBER_NOT_FOUND'],
    );
  });

  test('AC-074-04: chặn dữ liệu sai — tổng không khớp, giờ bán tương lai, quá 72 giờ, tiền khách đưa thiếu, món đã xóa; phiếu bán tay chỉ trưởng ca / quản lý (7 ngày); ca lúc bán đã đóng → ghi vào ca mới + báo; chưa mở ca → 409 giữ lại gửi sau', async () => {
    fail(await call(staff, 'post', '/api/offline-sales', sale({ total: 59_000 })), 400, 'VALIDATION_ERROR');
    fail(await call(staff, 'post', '/api/offline-sales', sale({ soldAt: new Date(Date.now() + 3600e3).toISOString() })), 400, 'VALIDATION_ERROR');
    fail(await call(staff, 'post', '/api/offline-sales', sale({ soldAt: minutesAgo(73 * 60) })), 400, 'SALE_TOO_OLD');
    fail(await call(staff, 'post', '/api/offline-sales', sale({ amountReceived: 50_000 })), 400, 'VALIDATION_ERROR');
    await q1(`UPDATE dbo.MenuItems SET DeletedAt = SYSUTCDATETIME() WHERE MenuItemId = ${ids['Bạc xỉu']}`);
    fail(
      await call(
        staff,
        'post',
        '/api/offline-sales',
        sale({ total: 29_000, amountReceived: 29_000, items: [{ menuItemId: ids['Bạc xỉu'], quantity: 1, unitPrice: 29_000 }] }),
      ),
      409,
      'OFFLINE_ITEM_MISSING',
    );
    await q1(`UPDATE dbo.MenuItems SET DeletedAt = NULL WHERE MenuItemId = ${ids['Bạc xỉu']}`);

    const paper = sale({ source: 'PAPER', soldAt: minutesAgo(2 * 24 * 60), localCode: null });
    fail(await call(staff, 'post', '/api/offline-sales', paper), 403, 'PAPER_SALE_FORBIDDEN');
    const p = ok(await call(lead, 'post', '/api/offline-sales', { ...paper, soldBy: null }), 201);
    assert.deepEqual([p.order.saleSource, p.offline.source, p.offline.soldBy.fullName], ['PAPER', 'PAPER', 'Trưởng ca Minh']);
    fail(await call(lead, 'post', '/api/offline-sales', sale({ source: 'PAPER', soldAt: minutesAgo(8 * 24 * 60) })), 400, 'SALE_TOO_OLD');

    // Đóng ca khi máy quầy khác còn đơn bán tạm chưa gửi → mở ca mới → gửi bù ghi vào ca mới + báo
    const closing = ok(await call(staff, 'get', '/api/shifts/current')).shift;
    ok(await call(staff, 'post', `/api/shifts/${shiftId}/close`, { countedCash: closing.expectedCash ?? 0 }));
    const late = sale({ total: 10_000, amountReceived: 10_000, items: [{ menuItemId: ids['Nước suối'], quantity: 1, unitPrice: 10_000 }] });
    fail(await call(staff, 'post', '/api/offline-sales', late), 409, 'NO_OPEN_SHIFT');
    const next = ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 0 }), 201).shift.shiftId;
    const moved = ok(await call(staff, 'post', '/api/offline-sales', late), 201);
    assert.equal(moved.payment.shiftId, next);
    assert.match(moved.issues.find((i) => i.code === 'SHIFT_LATE').text, new RegExp(`ca #${shiftId}.*ca #${next}`));
    assert.equal((await q1(`SELECT 1 FROM dbo.Alerts WHERE Kind = 'OFFLINE_SALE' AND ShiftId = ${next}`)).length, 1, 'ca mới có cảnh báo riêng');
  });
});
