// F-060 — phát hiện bất thường, cảnh báo qua email (ADR-020, BR-093…BR-095).
// Unit: so mức bình thường, giờ yên lặng. Integration (SQL Server thật) với bộ gửi email GIẢ (ghi lại / ép lỗi — không gửi thật).
// Thứ tự describe là cố ý: phần "so mức bình thường" chạy đầu khi lịch sử ca còn sạch (chỉ có ca trống).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

// Bộ test gửi nhiều email liên tiếp → nâng giới hạn 20 email / giờ (đọc lúc nạp config trong startApp)
process.env.MAIL_HOURLY_MAX = '100000';
// Không bao giờ gửi email thật từ test, kể cả khi .env có hộp thư gửi thật (SMTP_*) — bộ gửi giả thay ở before()
for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_TRANSPORT']) delete process.env[k];

let app, api, pool, admin, staff, lead, ids, alertService, mailService, anomaly, flushAudit, config;
const sent = [];
let failNext = 0;
const fakeTransport = {
  sendMail: async (m) => {
    if (failNext > 0) {
      failNext -= 1;
      throw new Error('SMTP giả lỗi');
    }
    sent.push(m);
    return { messageId: String(sent.length) };
  },
};

const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const settings = async (body) => ok(await call(admin, 'put', '/api/admin/settings', body));
const currentShift = async () => (await call(staff, 'get', '/api/shifts/current')).body.shift;
/** Đóng ca đang mở (lệch `diff` đồng so với tiền dự kiến) → ca vừa đóng. */
async function closeShift(diff = 0) {
  const sh = await currentShift();
  return ok(await call(staff, 'post', `/api/shifts/${sh.shiftId}/close`, { countedCash: sh.expectedCash + diff })).shift;
}
const openShift = async () => ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 500_000 }), 201).shift; // đủ tiền để đếm thiếu
const alertsOf = (shiftId) => q1(`SELECT Kind, Severity, Title, Detail, UserId FROM dbo.Alerts WHERE ShiftId = ${shiftId} ORDER BY Kind`);
const outbox = (where = '1 = 1') => q1(`SELECT * FROM dbo.AlertOutbox WHERE ${where} ORDER BY OutboxId`);

/** Khách bàn `code` gọi món, quầy tiếp nhận → { sessionId, orderId } */
async function served(code, items = [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]) {
  const C = await app.customer();
  const sessionId = await app.seat(C, code);
  const order = ok(await C.post('/api/orders', { sessionId, items }), 201);
  ok(await call(staff, 'post', `/api/orders/${order.orderId}/accept`));
  return { sessionId, orderId: order.orderId };
}
/** Một lượt thu ở bàn `code`. manual: giảm giá tay (quản lý thu → không cần duyệt). → payment */
async function pay(code, { method = 'CASH', manual = false } = {}) {
  const t = await served(code);
  const body = method === 'TRANSFER' ? { method } : { amountReceived: 1_000_000 };
  if (manual) Object.assign(body, { manualDiscount: { kind: 'AMOUNT', value: 1000 }, manualReason: 'khách quen' });
  return ok(await call(manual ? admin : staff, 'post', `/api/sessions/${t.sessionId}/settle`, body)).payment;
}

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  alertService = await import('../src/services/alertService.js');
  mailService = await import('../src/services/mailService.js');
  anomaly = await import('../src/utils/anomaly.js');
  ({ flushAudit } = await import('../src/middleware/audit.js'));
  ({ config } = await import('../src/config.js'));
  mailService._setTransport(fakeTransport);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ok(await call(admin, 'post', '/api/admin/users', { username: 'lead1', password: 'Pass@123', fullName: 'Trưởng ca 1', role: 'MANAGER' }), 201);
  lead = await app.login('lead1', 'Pass@123');
  ids = await app.ids();
});

after(() => {
  mailService?._setTransport(null); // before() lỗi giữa chừng (vd thiếu module) vẫn phải đóng app, không treo tiến trình test
  return app?.close();
});

describe('So mức bình thường (F-060, BR-093)', () => {
  test('AC-060-04 (unit): trung bình + 2 độ lệch chuẩn; cần ≥ 10 ca; dưới mức tối thiểu không báo; giờ yên lặng qua nửa đêm', () => {
    const b = anomaly.baseline([0, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
    assert.equal(b.n, 10);
    assert.equal(b.mean, 0.2);
    assert.ok(Math.abs(b.limit - (0.2 + 2 * Math.sqrt(0.4))) < 1e-9);
    assert.deepEqual(anomaly.judge({ value: 3, fixed: 5, floor: 2, base: b }), { anomalous: true, byFixed: false, byStats: true });
    assert.equal(anomaly.judge({ value: 1, fixed: 5, floor: 2, base: b }).anomalous, false, 'dưới mức tối thiểu');
    assert.equal(anomaly.judge({ value: 3, fixed: 5, floor: 2, base: anomaly.baseline([0, 0, 0]) }).anomalous, false, 'chưa đủ 10 ca');
    assert.equal(anomaly.judge({ value: 3, fixed: 5, floor: 2, base: b, useStats: false }).anomalous, false, 'tắt so mức bình thường');
    assert.equal(anomaly.judge({ value: 6, fixed: 5, base: null }).byFixed, true);
    assert.equal(anomaly.quietMinutesLeft(23 * 60 + 30, '23:00', '06:00'), 390);
    assert.equal(anomaly.quietMinutesLeft(5 * 60, '23:00', '06:00'), 60);
    assert.equal(anomaly.quietMinutesLeft(12 * 60, '23:00', '06:00'), 0);
    assert.equal(anomaly.quietMinutesLeft(12 * 60, '', ''), 0);
    assert.equal(anomaly.quietMinutesLeft(13 * 60 + 15, '13:00', '14:00'), 45);
  });

  test('AC-060-04: sau 10 ca bình thường (0 lượt hoàn), ca có 2 lượt hoàn → bất thường theo mức bình thường dù chưa vượt ngưỡng cố định 5; ghi "bình thường"', async () => {
    await settings({ alertEmails: ['chuquan@example.com'], alertRefundsMax: 5, alertRefundBig: 100_000_000, alertCashDiffMax: 1_000_000, alertUseStats: true });
    await openShift();
    for (let i = 0; i < 10; i += 1) {
      await closeShift();
      await openShift();
    }
    const p1 = await pay('01');
    const p2 = await pay('02');
    for (const p of [p1, p2]) ok(await call(admin, 'post', `/api/payments/${p.paymentId}/refunds`, { amount: 1000, reason: 'trả lại một phần' }), 201);
    const sh = await closeShift();
    const [a] = (await alertsOf(sh.shiftId)).filter((x) => x.Kind === 'REFUNDS');
    assert.ok(a, 'có cảnh báo REFUNDS');
    const d = JSON.parse(a.Detail);
    assert.deepEqual([d.value, d.fixed, d.byFixed, d.byStats], [2, 5, false, true]);
    assert.equal(d.normal.mean, 0);
    assert.match(a.Title, /bình thường ~0/);
    await openShift();
  });
});

describe('Cài đặt cảnh báo (F-060, BR-094, BR-095)', () => {
  test('AC-060-01: lưu email nhận / loại email / giờ / ngưỡng → đọc lại đúng; sai dạng / > 5 / trùng / giờ sai / ngưỡng ngoài khoảng → 400, không đổi; nhân viên / trưởng ca → 403', async () => {
    const r = await settings({
      alertEmails: ['ChuQuan@Example.com', 'quanly@example.com'],
      alertImmediate: true,
      alertShiftReport: true,
      alertDailyDigest: false,
      alertDigestTime: '21:30',
      alertQuietStart: '',
      alertQuietEnd: '',
      alertCashDiffMax: 30000,
      alertTransferShareMax: 70,
    });
    assert.deepEqual(r.alertEmails, ['chuquan@example.com', 'quanly@example.com'], 'chữ thường, giữ thứ tự');
    assert.deepEqual([r.alertDailyDigest, r.alertDigestTime, r.alertCashDiffMax, r.alertTransferShareMax], [false, '21:30', 30000, 70]);
    const bad = [
      { alertEmails: ['khong-phai-email'] },
      { alertEmails: ['a@x.vn', 'b@x.vn', 'c@x.vn', 'd@x.vn', 'e@x.vn', 'f@x.vn'] },
      { alertEmails: ['a@x.vn', 'A@x.vn'] },
      { alertDigestTime: '25:00' },
      { alertQuietStart: '7h' },
      { alertTransferShareMax: 0 },
      { alertRefundBig: 500 },
    ];
    for (const body of bad) {
      const res = await call(admin, 'put', '/api/admin/settings', body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.code, 'VALIDATION_ERROR');
    }
    const now = (await call(admin, 'get', '/api/admin/settings')).body;
    assert.deepEqual([now.alertEmails, now.alertDigestTime, now.alertTransferShareMax], [['chuquan@example.com', 'quanly@example.com'], '21:30', 70]);
    for (const token of [staff, lead]) {
      assert.equal((await call(token, 'put', '/api/admin/settings', { alertEmails: ['x@x.vn'] })).status, 403);
      assert.equal((await call(token, 'get', '/api/admin/alerts')).status, 403);
      assert.equal((await call(token, 'get', '/api/admin/alerts/mail-status')).status, 403);
    }
    assert.equal((await api.get('/api/admin/alerts')).status, 401);
  });

  test('AC-060-05: đổi danh sách email nhận → thư báo tới CẢ địa chỉ cũ lẫn mới; đổi ngưỡng / tắt loại email cũng báo; chỉ đổi thứ tự → không báo; Nhật ký thao tác ghi lần đổi', async () => {
    await mailService.flush(); // gửi hết thư cũ trong hàng đợi trước
    sent.length = 0;
    await settings({ alertEmails: ['chumoi@example.com'] });
    await mailService.flush();
    const notice = sent.find((m) => /Đổi email nhận cảnh báo/.test(m.subject));
    assert.ok(notice, 'có thư báo');
    for (const to of ['chuquan@example.com', 'quanly@example.com', 'chumoi@example.com']) assert.ok(notice.to.includes(to), to);
    assert.match(notice.text, /Trước: chuquan@example\.com, quanly@example\.com/);
    await flushAudit();
    const [log] = await q1("SELECT TOP 1 AfterJson FROM dbo.AuditLogs WHERE Action = 'settings.update' ORDER BY AuditId DESC");
    assert.deepEqual(JSON.parse(log.AfterJson).input.alertEmails, ['chumoi@example.com']);
    // Lưu lại đúng danh sách cũ (không đổi) → không có thư báo mới
    sent.length = 0;
    await settings({ alertEmails: ['chumoi@example.com'] });
    await mailService.flush();
    assert.equal(sent.filter((m) => /Đổi email/.test(m.subject)).length, 0);
    // Tắt email báo cáo ca + nâng ngưỡng lệch két (cách "giấu" cảnh báo mà không đổi người nhận) → vẫn có thư báo
    const before = await settings({});
    await settings({ alertShiftReport: false, alertCashDiffMax: 5_000_000 });
    await mailService.flush();
    const changed = sent.find((m) => /Đổi cài đặt cảnh báo/.test(m.subject));
    assert.ok(changed, 'có thư báo đổi cài đặt');
    assert.equal(changed.to, 'chumoi@example.com');
    assert.match(changed.text, /Báo cáo khi đóng ca: bật → tắt/);
    assert.ok(changed.text.includes(`Lệch két cho phép: ${before.alertCashDiffMax.toLocaleString('vi-VN')}đ → 5.000.000đ`), changed.text);
    await settings({ alertShiftReport: true, alertCashDiffMax: before.alertCashDiffMax });
    // Chỉ đổi thứ tự hai email → không phải đổi người nhận
    await settings({ alertEmails: ['a@example.com', 'b@example.com'] });
    await mailService.flush();
    sent.length = 0;
    await settings({ alertEmails: ['b@example.com', 'a@example.com'] });
    await mailService.flush();
    assert.equal(sent.length, 0, 'đổi thứ tự không gửi thư báo');
    await settings({ alertEmails: ['chumoi@example.com'] });
  });

  test('AC-060-10: mail-status không có mật khẩu; "Gửi email thử" khi chưa cấu hình hộp thư → báo lỗi rõ; đã cấu hình → gửi tới đúng địa chỉ, tính vào giới hạn mỗi giờ; che SĐT mọi dạng viết', async () => {
    // Hộp thư gửi có mật khẩu (giá trị dò) → mail-status không được lộ
    Object.assign(config.mail, { host: 'smtp.example.com', user: 'gui@example.com', pass: 'MATKHAU-DO-123' });
    const st = ok(await call(admin, 'get', '/api/admin/alerts/mail-status'));
    assert.equal(st.configured, true);
    assert.ok(!JSON.stringify(st).includes('MATKHAU-DO-123'), 'không có mật khẩu');
    assert.ok(!JSON.stringify(st).toLowerCase().includes('pass'), 'không có khóa mật khẩu');
    Object.assign(config.mail, { host: '', user: '', pass: '' });
    mailService._setTransport(null); // không có SMTP_* trong .env của test → chưa cấu hình
    const none = ok(await call(admin, 'post', '/api/admin/alerts/test-email', { emails: ['thu@example.com'] }));
    assert.equal(none.ok, false);
    assert.match(none.error, /Chưa cấu hình hộp thư gửi/);
    assert.equal(ok(await call(admin, 'get', '/api/admin/alerts/mail-status')).configured, false);
    mailService._setTransport(fakeTransport);
    sent.length = 0;
    assert.deepEqual(ok(await call(admin, 'post', '/api/admin/alerts/test-email', { emails: ['thu@example.com'] })), { ok: true });
    assert.equal(sent[0].to, 'thu@example.com');
    assert.equal((await outbox("Kind = 'TEST' AND Status = 'SENT'")).length, 1, 'email thử tính vào giới hạn mỗi giờ');
    const max = config.mail.hourlyMax;
    config.mail.hourlyMax = 1; // đã gửi 1 email trong giờ → hết lượt
    const capped = ok(await call(admin, 'post', '/api/admin/alerts/test-email', { emails: ['thu@example.com'] }));
    config.mail.hourlyMax = max;
    assert.equal(capped.ok, false);
    assert.match(capped.error, /giới hạn/);
    for (const phone of ['0912345678', '0912 345 678', '0912.345.678', '+84 912 345 678', '091-234-5678'])
      assert.equal(alertService.maskPhones(`khách ${phone} trả lại`), 'khách *** trả lại', phone);
    assert.equal(alertService.maskPhones('hoàn 1.000.000.000đ lượt #1023'), 'hoàn 1.000.000.000đ lượt #1023', 'không che số tiền / mã');
    assert.equal((await call(admin, 'post', '/api/admin/alerts/test-email', { emails: ['khong-hop-le'] })).status, 400);
  });
});

describe('Phát hiện khi đóng ca (F-060, BR-093)', () => {
  test('AC-060-02: ca vượt 5 ngưỡng → 5 cảnh báo (giá trị, ngưỡng, người liên quan) + MỘT email báo cáo ca có ⚠️', async () => {
    await settings({
      alertEmails: ['chuquan@example.com'],
      alertShiftReport: true,
      alertImmediate: true,
      alertUseStats: false,
      alertCashDiffMax: 1000,
      alertTransferShareMax: 50,
      alertVoidsMax: 0,
      alertRefundsMax: 0,
      alertManualDiscountMax: 0,
      alertRefundBig: 100_000_000,
    });
    await closeShift();
    await openShift();
    sent.length = 0;
    // 5 lượt thu: 3 chuyển khoản (60%), 1 giảm giá tay; 1 lượt hoàn; 1 món đã pha bị hủy; đóng ca thiếu 50.000đ
    const t1 = await pay('01', { method: 'TRANSFER' });
    await pay('02', { method: 'TRANSFER' });
    await pay('03', { method: 'TRANSFER' });
    await pay('04', { manual: true });
    const v = await served('05', [
      { menuItemId: ids['Cà phê đen'], quantity: 1 },
      { menuItemId: ids['Nước suối'], quantity: 1 },
    ]);
    const [line] = await q1(`SELECT OrderItemId FROM dbo.OrderItems WHERE OrderId = ${v.orderId} AND MenuItemId = ${ids['Nước suối']}`);
    ok(await call(staff, 'post', `/api/orders/${v.orderId}/complete`)); // món đã pha xong
    ok(await call(admin, 'post', `/api/order-items/${line.OrderItemId}/void`, { quantity: 0, reason: 'đổ vỡ', stockMode: 'WASTE' }));
    assert.equal((await q1(`SELECT StockMode FROM dbo.OrderItemVoids WHERE OrderItemId = ${line.OrderItemId}`))[0].StockMode, 'WASTE');
    ok(await call(staff, 'post', `/api/sessions/${v.sessionId}/settle`, { amountReceived: 1_000_000 }));
    ok(await call(admin, 'post', `/api/payments/${t1.paymentId}/refunds`, { amount: 1000, reason: 'khách 0912345678 trả lại' }), 201);
    const sh = await closeShift(-50000);
    const rows = await alertsOf(sh.shiftId);
    assert.deepEqual(rows.map((r) => r.Kind).sort(), ['CASH_DIFF', 'MANUAL_DISCOUNT', 'REFUNDS', 'TRANSFER_SHARE', 'VOIDS']);
    const by = Object.fromEntries(rows.map((r) => [r.Kind, { ...r, d: JSON.parse(r.Detail) }]));
    assert.deepEqual([by.CASH_DIFF.Severity, by.CASH_DIFF.d.difference, by.CASH_DIFF.d.fixed], ['HIGH', -50000, 1000]);
    assert.match(by.CASH_DIFF.Title, /thiếu 50\.000đ/);
    assert.deepEqual([by.TRANSFER_SHARE.d.value, by.TRANSFER_SHARE.d.payments], [60, { transfer: 3, total: 5 }]);
    assert.equal(by.VOIDS.d.value, 1);
    assert.equal(by.REFUNDS.d.value, 1);
    assert.equal(by.MANUAL_DISCOUNT.d.value, 1);
    assert.ok(by.VOIDS.d.people[0].fullName, 'có người liên quan');
    await mailService.flush();
    const mails = sent.filter((m) => m.subject.includes(`Ca #${sh.shiftId}`));
    assert.equal(
      mails.length,
      1,
      `một email báo cáo ca — hàng đợi: ${JSON.stringify((await outbox(`DedupeKey = 'SHIFT:${sh.shiftId}'`)).map((r) => [r.Status, r.Attempts, r.LastError, r.NextAttemptAt]))}, đã gửi: ${JSON.stringify(sent.map((m) => m.subject))}`,
    );
    assert.equal(mails[0].to, 'chuquan@example.com');
    assert.match(mails[0].subject, /⚠️ 5 dấu hiệu bất thường/);
    assert.match(mails[0].text, /Lệch két: −50\.000đ/);
    assert.match(mails[0].text, /3\/5 lượt = 60%/);
    // Chạy lại phát hiện cho cùng ca → không tạo trùng cảnh báo / email
    const again = await alertService.onShiftClosed(sh.shiftId);
    assert.deepEqual([again.alerts.length, again.email], [0, null]);
    assert.equal((await alertsOf(sh.shiftId)).length, 5);
    await openShift();
  });

  test('AC-060-02: ca không bất thường → không cảnh báo, email "không có dấu hiệu bất thường ✔"; tắt báo cáo ca → không email nhưng cảnh báo vẫn có', async () => {
    await settings({ alertCashDiffMax: 20000, alertTransferShareMax: 60, alertVoidsMax: 3, alertRefundsMax: 2, alertManualDiscountMax: 5 });
    sent.length = 0;
    await pay('01');
    const calm = await closeShift();
    assert.equal((await alertsOf(calm.shiftId)).length, 0);
    await mailService.flush();
    const mail = sent.find((m) => m.subject.includes(`Ca #${calm.shiftId}`));
    assert.match(mail.subject, /✔ không có dấu hiệu bất thường/);
    assert.match(mail.text, /Lệch két: 0đ/);

    await settings({ alertShiftReport: false });
    await openShift();
    const off = await closeShift(-90000);
    assert.deepEqual(
      (await alertsOf(off.shiftId)).map((r) => r.Kind),
      ['CASH_DIFF'],
    );
    assert.equal((await outbox(`DedupeKey = 'SHIFT:${off.shiftId}'`)).length, 0, 'không xếp email báo cáo ca');
    await settings({ alertShiftReport: true });
    await openShift();
  });
});

describe('Cảnh báo tức thì (F-060, BR-093)', () => {
  test('AC-060-03: hoàn tiền ≥ mức lớn → BIG_REFUND + email ngay, SĐT trong lý do bị che; hủy khoản sổ quỹ đã duyệt → CASH_VOID; tắt "tức thì" → chỉ cảnh báo trong app', async () => {
    await settings({ alertImmediate: true, alertRefundBig: 10000, alertRefundsMax: 50 });
    sent.length = 0;
    const p = await pay('02');
    const ref = ok(await call(admin, 'post', `/api/payments/${p.paymentId}/refunds`, { amount: 10000, reason: 'khách 0912 345 678 trả món' }), 201);
    const [big] = await q1(`SELECT * FROM dbo.Alerts WHERE DedupeKey = 'REFUND:${ref.refund.refundId}'`);
    assert.deepEqual([big.Kind, big.Severity, JSON.parse(big.Detail).reason], ['BIG_REFUND', 'HIGH', 'khách *** trả món']);
    await mailService.flush();
    const bigMail = sent.find((m) => /⚠️ Hoàn tiền 10\.000đ/.test(m.subject));
    assert.ok(bigMail, 'email tức thì');
    assert.match(bigMail.text, /Lý do: khách \*\*\* trả món/);
    assert.ok(!/345 678/.test(JSON.stringify(sent)), 'không lộ SĐT khách trong email');

    const cats = Object.fromEntries((await call(staff, 'get', '/api/cash-categories')).body.map((c) => [c.name, c.categoryId]));
    const txn = ok(await call(admin, 'post', '/api/cash-transactions', { categoryId: cats['Mua đá'], amount: 30000, reason: 'mua đá' }), 201);
    const txnId = txn.cashTxnId ?? txn.txn?.cashTxnId;
    const st = (await q1(`SELECT Status FROM dbo.CashTransactions WHERE CashTxnId = ${txnId}`))[0].Status;
    if (st === 'PENDING') ok(await call(admin, 'post', `/api/cash-transactions/${txnId}/approve`, {}));
    await settings({ alertImmediate: false });
    sent.length = 0;
    ok(await call(admin, 'post', `/api/cash-transactions/${txnId}/void`, { reason: 'ghi nhầm' }));
    const [cv] = await q1(`SELECT * FROM dbo.Alerts WHERE DedupeKey = 'CASHVOID:${txnId}'`);
    assert.equal(cv.Kind, 'CASH_VOID');
    assert.match(cv.Title, /bị hủy: 30\.000đ/);
    assert.equal((await outbox(`AlertId = ${cv.AlertId}`)).length, 0, 'tắt tức thì → không email');
    await settings({ alertImmediate: true, alertRefundBig: 200000 });
  });
});

describe('Gửi chắc chắn (F-060, BR-094)', () => {
  test('AC-060-06: gửi lỗi → thử lại 5 lần sau 1 / 5 / 15 / 60 / 240 phút, vẫn lỗi → FAILED (hiện ở mail-status); "Gửi lại email lỗi" xếp lại và gửi được; không gửi trùng', async () => {
    failNext = 1_000; // mọi lần gửi đều lỗi
    const sh = await closeShift(-77000);
    const [row] = await outbox(`DedupeKey = 'SHIFT:${sh.shiftId}'`);
    assert.equal(row.Status, 'PENDING');
    const waits = [1, 5, 15, 60, 240];
    for (let i = 1; i <= 6; i += 1) {
      await pool.request().query(`UPDATE dbo.AlertOutbox SET NextAttemptAt = DATEADD(MINUTE, -1, SYSUTCDATETIME()) WHERE OutboxId = ${row.OutboxId}`);
      const t0 = Date.now();
      await mailService.flush();
      const [r] = await outbox(`OutboxId = ${row.OutboxId}`);
      assert.equal(r.Attempts, i);
      assert.equal(r.Status, i < 6 ? 'PENDING' : 'FAILED', `lần ${i}`);
      if (i < 6) {
        const wait = (new Date(r.NextAttemptAt) - t0) / 60000;
        assert.ok(wait > waits[i - 1] - 0.1 && wait < waits[i - 1] + 0.5, `lần ${i}: hẹn sau ~${waits[i - 1]} phút, thực tế ${wait.toFixed(2)}`);
      }
    }
    const st = ok(await call(admin, 'get', '/api/admin/alerts/mail-status'));
    assert.ok(st.failed >= 1);
    assert.match(st.lastError.error, /SMTP giả lỗi/);
    failNext = 0;
    sent.length = 0;
    await mailService.flush();
    assert.equal(sent.filter((m) => m.subject.includes(`Ca #${sh.shiftId}`)).length, 0, 'FAILED không tự gửi lại');
    // Sửa xong hộp thư gửi → quản lý bấm "Gửi lại email lỗi" → xếp lại, gửi một lần
    assert.ok(ok(await call(admin, 'post', '/api/admin/alerts/mail-retry', {})).requeued >= 1);
    assert.equal((await call(staff, 'post', '/api/admin/alerts/mail-retry', {})).status, 403);
    await mailService.flush();
    await mailService.flush();
    assert.equal(sent.filter((m) => m.subject.includes(`Ca #${sh.shiftId}`)).length, 1, 'gửi lại đúng một lần');
    assert.equal(ok(await call(admin, 'get', '/api/admin/alerts/mail-status')).failed, 0);
    await openShift();
  });

  test('AC-060-06: ghi cảnh báo lỗi (CSDL từ chối) → đóng ca, hoàn tiền lớn, hủy khoản sổ quỹ đã duyệt vẫn thành công', async () => {
    await settings({ alertRefundBig: 1000 });
    await pool.request().batch("CREATE TRIGGER dbo.trg_TestAlertsFail ON dbo.Alerts INSTEAD OF INSERT AS BEGIN THROW 50999, 'test: ghi cảnh báo lỗi', 1; END");
    try {
      const p = await pay('03');
      ok(await call(admin, 'post', `/api/payments/${p.paymentId}/refunds`, { amount: 5000, reason: 'thử lỗi' }), 201);
      const cats = Object.fromEntries((await call(staff, 'get', '/api/cash-categories')).body.map((c) => [c.name, c.categoryId]));
      const txn = ok(await call(admin, 'post', '/api/cash-transactions', { categoryId: cats['Mua đá'], amount: 20000, reason: 'mua đá' }), 201);
      const txnId = txn.cashTxnId ?? txn.txn?.cashTxnId;
      if ((await q1(`SELECT Status FROM dbo.CashTransactions WHERE CashTxnId = ${txnId}`))[0].Status === 'PENDING')
        ok(await call(admin, 'post', `/api/cash-transactions/${txnId}/approve`, {}));
      ok(await call(admin, 'post', `/api/cash-transactions/${txnId}/void`, { reason: 'thử lỗi' }));
      const sh = await closeShift(-99000); // lệch két vượt ngưỡng → cố ghi cảnh báo → lỗi bị nuốt, ca vẫn đóng
      assert.ok(sh.closedAt, 'ca đã đóng');
      assert.equal((await alertsOf(sh.shiftId)).length, 0, 'không ghi được cảnh báo (trigger từ chối)');
    } finally {
      await pool.request().batch('DROP TRIGGER IF EXISTS dbo.trg_TestAlertsFail');
    }
    await settings({ alertRefundBig: 200000 });
    await openShift();
  });

  test('AC-060-06: email tạo trong giờ yên lặng → hoãn tới hết giờ yên lặng; thư báo đổi người nhận không bị hoãn', async () => {
    const vnMin = (new Date(Date.now() + 7 * 3600e3).getUTCHours() * 60 + new Date().getUTCMinutes()) % 1440;
    const hhmm = (m) => `${String(Math.floor(((m + 1440) % 1440) / 60)).padStart(2, '0')}:${String((m + 1440) % 60).padStart(2, '0')}`;
    await settings({ alertQuietStart: hhmm(vnMin - 60), alertQuietEnd: hhmm(vnMin + 120) });
    const sh = await closeShift(-60000);
    const [row] = await outbox(`DedupeKey = 'SHIFT:${sh.shiftId}'`);
    const waitMin = (new Date(row.NextAttemptAt) - Date.now()) / 60000;
    assert.ok(waitMin > 100 && waitMin <= 121, `hoãn ~2 giờ, thực tế ${waitMin.toFixed(1)} phút`);
    await settings({ alertEmails: ['chumoi@example.com', 'phong@example.com'] });
    const [notice] = await q1("SELECT TOP 1 NextAttemptAt FROM dbo.AlertOutbox WHERE Kind = 'NOTICE' ORDER BY OutboxId DESC");
    assert.ok(new Date(notice.NextAttemptAt) <= new Date(Date.now() + 5000), 'thư báo đổi người nhận gửi ngay');
    await settings({ alertQuietStart: '', alertQuietEnd: '' });
    await openShift();
  });
});

describe('Tổng kết ngày (F-060, BR-094)', () => {
  test('AC-060-07: tổng kết 24 giờ tính tới giờ gửi — doanh thu tiền mặt / chuyển khoản, các ca, cảnh báo; không gửi hai lần; gửi bù hôm qua khi email đã cài từ trước; mốc 00:00 là trọn ngày hôm trước', async () => {
    await settings({ alertDailyDigest: true, alertDigestTime: '23:59' });
    const day = todayVn();
    const vnDay = (d) => d.split('-').reverse().join('/');
    const d1 = await alertService.dailyDigest(day);
    assert.ok(d1, 'xếp email tổng kết');
    assert.match(d1.subject, new RegExp(`Tổng kết ${vnDay(day)}`));
    assert.match(d1.text, /\(23:59 .* → 23:59 .*\)/, 'ghi rõ khoảng 24 giờ tính tới giờ gửi');
    assert.match(d1.text, /Tiền mặt \/ Chuyển khoản: .*đ \/ .*đ/);
    assert.match(d1.text, /Ca #\d+/);
    assert.match(d1.text, /Cảnh báo: \d+/);
    assert.equal(await alertService.dailyDigest(day), null, 'không xếp lần hai');
    // Email nhận đã cài từ 2 ngày trước → runDigests gửi bù hôm qua (hôm nay đã có)
    await pool.request().query("UPDATE dbo.Settings SET UpdatedAt = DATEADD(DAY, -2, SYSUTCDATETIME()) WHERE SettingKey = 'alert.emails'");
    const r = await alertService.runDigests(new Date());
    const yesterday = new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    assert.deepEqual(r.sent, [yesterday]);
    assert.equal((await outbox(`DedupeKey IN ('DIGEST:${day}', 'DIGEST:${yesterday}')`)).length, 2);
    // Vừa đổi email nhận (sau giờ tổng kết hôm qua) → không gửi bù ngày cũ
    await pool.request().query(`DELETE FROM dbo.AlertOutbox WHERE DedupeKey = 'DIGEST:${yesterday}'`);
    await pool.request().query("UPDATE dbo.Settings SET UpdatedAt = SYSUTCDATETIME() WHERE SettingKey = 'alert.emails'");
    assert.deepEqual((await alertService.runDigests(new Date())).sent, []);
    // Mốc 00:00 ngày mai = trọn ngày hôm nay: tiêu đề ghi hôm nay, có các ca đã đóng hôm nay (ca đóng sau 22:00 không bị bỏ sót)
    await settings({ alertDigestTime: '00:00' });
    const tomorrow = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const d0 = await alertService.dailyDigest(tomorrow);
    assert.match(d0.subject, new RegExp(`Tổng kết ${vnDay(day)}`));
    assert.match(d0.text, /\(00:00 .* → 00:00 .*\)/);
    assert.match(d0.text, /Ca #\d+/);
    await settings({ alertDigestTime: '22:00' });
  });
});

describe('Trang Cảnh báo bất thường (F-060, BR-095)', () => {
  test('AC-060-08: danh sách Mới / Tất cả; Đã xem / Đã xử lý có ghi chú; alert.created chỉ tới phòng admin; xóa quản lý từng xử lý cảnh báo → xóa mềm', async () => {
    const list = ok(await call(admin, 'get', '/api/admin/alerts?status=NEW'));
    assert.ok(list.alerts.length > 0 && list.newCount === list.alerts.length);
    const a = list.alerts[0];
    assert.equal(ok(await call(admin, 'patch', `/api/admin/alerts/${a.alertId}`, { status: 'SEEN' })).alert.status, 'SEEN');
    const res = ok(await call(admin, 'patch', `/api/admin/alerts/${a.alertId}`, { status: 'RESOLVED', note: 'đã đối chiếu' })).alert;
    assert.deepEqual([res.status, res.note, res.handledBy.fullName.length > 0], ['RESOLVED', 'đã đối chiếu', true]);
    assert.ok(!ok(await call(admin, 'get', '/api/admin/alerts?status=NEW')).alerts.some((x) => x.alertId === a.alertId));
    assert.ok(ok(await call(admin, 'get', '/api/admin/alerts?status=ALL')).alerts.some((x) => x.alertId === a.alertId));
    assert.equal((await call(admin, 'patch', '/api/admin/alerts/999999', { status: 'SEEN' })).status, 404);
    assert.equal((await call(admin, 'patch', `/api/admin/alerts/${a.alertId}`, { status: 'NEW' })).status, 400);

    const adminSock = await app.connect({ auth: { token: admin } });
    const staffSock = await app.connect({ auth: { token: staff } });
    const toAdmin = app.waitFor(adminSock, 'alert.created', (p) => p.alert.kind === 'CASH_DIFF');
    const toStaff = app
      .waitFor(staffSock, 'alert.created', () => true, 800)
      .then(
        () => 'nhận',
        () => 'không nhận',
      );
    await closeShift(-123000);
    const evt = await toAdmin;
    assert.match(evt.alert.title, /thiếu 123\.000đ/);
    assert.equal(await toStaff, 'không nhận', 'nhân viên không nhận cảnh báo');
    // Quản lý chỉ từng xử lý cảnh báo vẫn xóa được tài khoản → xóa mềm (cảnh báo giữ tên người xử lý), không lỗi khóa ngoại
    ok(await call(admin, 'post', '/api/admin/users', { username: 'admin2', password: 'Pass@123', fullName: 'Quản lý 2', role: 'ADMIN' }), 201);
    const admin2 = await app.login('admin2', 'Pass@123');
    ok(await call(admin2, 'patch', `/api/admin/alerts/${evt.alert.alertId}`, { status: 'SEEN' }));
    const [{ UserId: admin2Id }] = await q1("SELECT UserId FROM dbo.Users WHERE Username = 'admin2'");
    assert.equal(ok(await call(admin, 'delete', `/api/admin/users/${admin2Id}`)).result, 'ARCHIVED');
    await openShift();
  });
});
