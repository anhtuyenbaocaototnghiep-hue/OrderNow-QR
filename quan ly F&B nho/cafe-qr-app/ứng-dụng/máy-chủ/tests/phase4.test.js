// Integration test (SQL Server thật) giai đoạn 4 — ADR-006: gọi lại đơn & yêu thích (F-045), lịch thực đơn (F-040),
// thời gian chờ (F-025), chia bill (F-026, gồm thu đồng thời cùng một phần).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let app, api, pool, admin, staff, ids;

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  assert.equal((await api.post('/api/shifts/open').set(auth(staff)).send({ openingCash: 0 })).status, 201);
});

after(() => app.close());

const adminApi = (method, path, body) => api[method](path).set(auth(admin)).send(body);
const staffApi = (method, path, body) => api[method](path).set(auth(staff)).send(body);
const qrOf = async (code) => (await pool.request().query(`SELECT QrToken FROM dbo.Tables WHERE Code = '${code}'`)).recordset[0].QrToken;
/** Khách C gộp vào nhóm đang mở của bàn. */
async function joinGroup(C, code, sessionId) {
  const r = await C.post(`/api/sessions/${sessionId}/join`, { qrToken: await qrOf(code) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}
const order = async (C, sessionId, items) => {
  const r = await C.post('/api/orders', { sessionId, items });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.order;
};
const acceptAll = async (sessionId) => {
  const orders = (await staffApi('get', `/api/sessions/${sessionId}`)).body.orders.filter((o) => o.status === 'PENDING');
  for (const o of orders) assert.equal((await staffApi('post', `/api/orders/${o.orderId}/accept`)).status, 200);
};
const settleWhole = async (sessionId, extra = {}) => {
  const p = (await staffApi('post', `/api/sessions/${sessionId}/settle/preview`, extra)).body;
  const r = await staffApi('post', `/api/sessions/${sessionId}/settle`, { amountReceived: p.totals.amountDue, ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
};
const vnHourFromNow = (h) => `${String((new Date(Date.now() + 7 * 3600e3).getUTCHours() + h + 24) % 24).padStart(2, '0')}:00`;

describe('Gọi lại đơn lần trước & món yêu thích (F-045)', () => {
  let A, memberId, firstOrder;

  test('hội viên trả đơn → lần sau gọi lại: giỏ đã kiểm, giá HIỆN TẠI, tùy chọn/ghi chú giữ nguyên', async () => {
    A = await app.customer();
    const s1 = await app.seat(A, '01');
    const reg = await A.post('/api/members', { phone: '0901000001', fullName: 'Lê Gọi Lại', consent: true });
    assert.equal(reg.status, 201);
    memberId = reg.body.memberId;
    assert.equal((await A.post(`/api/sessions/${s1}/member`, { phone: '0901000001' })).status, 200);
    firstOrder = await order(A, s1, [
      { menuItemId: ids['Cà phê sữa'], quantity: 2, note: 'ít đường' },
      { menuItemId: ids['Nước suối'], quantity: 1 },
    ]);
    await acceptAll(s1);
    await settleWhole(s1);

    // Lần sau (phiên mới): gắn lại hội viên → thấy đơn lần trước
    const s2 = (await A.post('/api/sessions', { qrToken: await qrOf('01') })).body.session.sessionId;
    assert.equal((await A.post(`/api/sessions/${s2}/member`, { phone: '0901000001' })).status, 200);
    const recent = await A.get(`/api/members/${memberId}/recent-orders`);
    assert.equal(recent.status, 200);
    assert.equal(recent.body[0].orderId, firstOrder.orderId);
    assert.deepEqual(
      recent.body[0].items.map((i) => [i.name, i.quantity, i.note, i.available]),
      [
        ['Cà phê sữa', 2, 'ít đường', true],
        ['Nước suối', 1, null, true],
      ],
    );

    // Giá đổi → giỏ dùng giá mới
    const items = (await adminApi('get', '/api/admin/menu-items')).body;
    const cps = items.find((i) => i.name === 'Cà phê sữa');
    await adminApi('put', `/api/admin/menu-items/${cps.menuItemId}`, { ...cps, imageUrl: '', price: 31000 });
    const replay = await A.post('/api/cart/replay', { orderId: firstOrder.orderId });
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.deepEqual(
      replay.body.items.map((i) => [i.name, i.quantity, i.price, i.note]),
      [
        ['Cà phê sữa', 2, 31000, 'ít đường'],
        ['Nước suối', 1, 10000, null],
      ],
    );
    assert.deepEqual(replay.body.skipped, []);
    await adminApi('put', `/api/admin/menu-items/${cps.menuItemId}`, { ...cps, imageUrl: '', price: 29000 });
  });

  test('món đã hết → giỏ gọi lại thiếu món đó + lý do', async () => {
    await adminApi('patch', `/api/admin/menu-items/${ids['Nước suối']}/availability`, { isAvailable: false });
    const r = await A.post('/api/cart/replay', { orderId: firstOrder.orderId });
    assert.deepEqual(
      r.body.items.map((i) => i.name),
      ['Cà phê sữa'],
    );
    assert.deepEqual(r.body.skipped, [{ name: 'Nước suối', reason: 'đang hết món' }]);
    await adminApi('patch', `/api/admin/menu-items/${ids['Nước suối']}/availability`, { isAvailable: true });
  });

  test('♥ lưu và hiện lại; "hay gọi" lấy từ đơn đã thu; khách phiên khác gọi với memberId lạ → 403; quầy xem được', async () => {
    const heart = await api.put(`/api/members/${memberId}/favorites/${ids['Latte']}`).set('Cookie', A.cookie);
    assert.equal(heart.status, 200, JSON.stringify(heart.body));
    const fav = (await A.get(`/api/members/${memberId}/favorites`)).body;
    assert.deepEqual(fav.hearted, [ids['Latte']]);
    const byName = Object.fromEntries(fav.items.map((i) => [i.name, i]));
    assert.equal(byName['Latte'].hearted, true);
    assert.equal(byName['Cà phê sữa'].timesOrdered, 2);

    const B = await app.customer();
    await app.seat(B, '02');
    for (const path of [`/api/members/${memberId}/recent-orders`, `/api/members/${memberId}/favorites`]) {
      assert.equal((await B.get(path)).status, 403, path);
    }
    assert.equal((await B.post('/api/cart/replay', { orderId: firstOrder.orderId })).status, 403);
    assert.equal((await api.put(`/api/members/${memberId}/favorites/${ids['Latte']}`).set('Cookie', B.cookie)).status, 403);
    assert.equal((await staffApi('get', `/api/members/${memberId}/recent-orders?limit=5`)).status, 200);

    const del = await api.delete(`/api/members/${memberId}/favorites/${ids['Latte']}`).set('Cookie', A.cookie);
    assert.deepEqual(del.body.hearted, []);
  });
});

describe('Thực đơn theo lịch (F-040)', () => {
  let schedule;

  test('lịch SHOW ngoài khung giờ hiện tại: khách không thấy / không đặt được; quầy thấy (cờ hiddenBySchedule) và vẫn bán', async () => {
    const r = await adminApi('post', '/api/admin/menu-schedules', {
      name: 'Bánh buổi sáng',
      startTime: vnHourFromNow(2),
      endTime: vnHourFromNow(4),
      targets: [{ menuItemId: ids['Bánh croissant'], mode: 'SHOW' }],
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    schedule = r.body;
    const menu = (await api.get('/api/menu')).body;
    assert.ok(!menu.categories.flatMap((c) => c.items).some((i) => i.name === 'Bánh croissant'));
    assert.ok(menu.nextChangeAt, 'có mốc tự tải lại menu');
    const staffMenu = (await api.get('/api/menu').set(auth(staff))).body;
    assert.equal(staffMenu.categories.flatMap((c) => c.items).find((i) => i.name === 'Bánh croissant').hiddenBySchedule, true);

    const C = await app.customer();
    const s = await app.seat(C, '03');
    const bad = await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Bánh croissant'], quantity: 1 }] });
    assert.equal(bad.status, 409);
    assert.equal(bad.body.code, 'ITEM_UNAVAILABLE');
    const ta = await staffApi('post', '/api/orders/takeaway', { items: [{ menuItemId: ids['Bánh croissant'], quantity: 1 }], amountReceived: 100000 });
    assert.equal(ta.status, 201, JSON.stringify(ta.body));
  });

  test('xem trước "menu lúc …": trong khung → hiện; tắt lịch → khách thấy lại ngay', async () => {
    const at = `${todayVn()}T${schedule.startTime}`;
    const pv = (await adminApi('get', `/api/admin/menu-schedules/preview?at=${encodeURIComponent(at)}`)).body;
    const row = pv.categories.flatMap((c) => c.items).find((i) => i.name === 'Bánh croissant');
    assert.equal(row.visible, true);
    assert.equal((await adminApi('patch', `/api/admin/menu-schedules/${schedule.scheduleId}/active`, { isActive: false })).status, 200);
    const menu = (await api.get('/api/menu')).body;
    assert.ok(menu.categories.flatMap((c) => c.items).some((i) => i.name === 'Bánh croissant'));
    assert.equal((await adminApi('delete', `/api/admin/menu-schedules/${schedule.scheduleId}`)).status, 200);
  });

  test('giờ bán danh mục (F-020) đồng bộ thành lịch "Giờ bán — …"; xóa giờ → bỏ lịch; kiểm đầu vào', async () => {
    const cats = (await adminApi('get', '/api/admin/categories')).body;
    const c = cats.find((x) => x.name === 'Trà & đồ uống khác');
    await adminApi('put', `/api/admin/categories/${c.categoryId}`, { name: c.name, sortOrder: c.sortOrder, sellFrom: '06:00', sellTo: '09:00' });
    let list = (await adminApi('get', '/api/admin/menu-schedules')).body;
    const synced = list.find((s) => s.sourceCategoryId === c.categoryId);
    assert.equal(synced.name, 'Giờ bán — Trà & đồ uống khác');
    assert.deepEqual(
      synced.targets.map((t) => [t.categoryId, t.mode]),
      [[c.categoryId, 'SHOW']],
    );
    await adminApi('put', `/api/admin/categories/${c.categoryId}`, { name: c.name, sortOrder: c.sortOrder, sellFrom: null, sellTo: null });
    list = (await adminApi('get', '/api/admin/menu-schedules')).body;
    assert.ok(!list.some((s) => s.sourceCategoryId === c.categoryId));
    assert.equal((await adminApi('post', '/api/admin/menu-schedules', { name: 'x', targets: [] })).status, 400);
    assert.equal(
      (await adminApi('post', '/api/admin/menu-schedules', { name: 'x', startTime: '09:00', targets: [{ menuItemId: 1, mode: 'SHOW' }] })).status,
      400,
    );
    assert.equal((await staffApi('get', '/api/admin/menu-schedules')).status, 403);
  });
});

describe('Thời gian chờ ước tính (F-025)', () => {
  test('hàng chờ trống → base + giỏ; thêm đơn → ETA tăng; parallelism 2 → giảm; thời gian pha quản lý nhập được dùng', async () => {
    // Dọn hàng chờ: hoàn tất / hủy các đơn còn lại từ test trước
    const pending = (await staffApi('get', '/api/orders?status=PENDING,PREPARING')).body;
    for (const o of pending) {
      if (o.status === 'PENDING') await staffApi('post', `/api/orders/${o.orderId}/cancel`, {});
      else await staffApi('post', `/api/orders/${o.orderId}/complete`);
    }
    const empty = (await api.get(`/api/queue/eta?items=${ids['Nước suối']}:1`)).body;
    assert.equal(empty.queueLength, 0);
    assert.equal(empty.etaSeconds, 120 + 180);

    const C = await app.customer();
    const s = await app.seat(C, '04');
    for (let k = 0; k < 3; k++) await order(C, s, [{ menuItemId: ids['Cà phê đen'], quantity: 2 }]);
    const busy = (await api.get(`/api/queue/eta?items=${ids['Nước suối']}:1`)).body;
    assert.equal(busy.queueLength, 6);
    assert.equal(busy.etaSeconds, 120 + 6 * 180 + 180);
    const mine = (await C.get(`/api/sessions/${s}/eta`)).body.eta;
    assert.equal(mine.etaSeconds, 120 + 6 * 180);

    await adminApi('put', '/api/admin/settings', { kitchenParallelism: 2 });
    const par = (await api.get(`/api/queue/eta?items=${ids['Nước suối']}:1`)).body;
    assert.equal(par.etaSeconds, 120 + (6 * 180) / 2 + 180);
    await adminApi('put', '/api/admin/settings', { kitchenParallelism: 1 });

    const items = (await adminApi('get', '/api/admin/menu-items')).body;
    const den = items.find((i) => i.name === 'Cà phê đen');
    const upd = await adminApi('put', `/api/admin/menu-items/${den.menuItemId}`, { ...den, imageUrl: '', prepSeconds: 60 });
    assert.equal(upd.body.prepSeconds, 60);
    const fast = (await api.get('/api/queue/eta')).body;
    assert.equal(fast.etaSeconds, 120 + 6 * 60);
    assert.equal((await adminApi('put', `/api/admin/menu-items/${den.menuItemId}`, { ...den, imageUrl: '', prepSeconds: 5 })).status, 400);
    await adminApi('put', `/api/admin/menu-items/${den.menuItemId}`, { ...den, imageUrl: '', prepSeconds: null });
    // Khách phiên khác không xem ETA phiên này
    const other = await app.customer();
    await app.seat(other, '05');
    assert.equal((await other.get(`/api/sessions/${s}/eta`)).status, 403);
  });

  test('job prep-stats (02:00): trung vị thực tế theo món, ghi JobRuns; chạy lại không nhân đôi; hai lần cùng lúc → một SKIPPED', async () => {
    // Đơn hoàn tất có thời lượng biết trước: 3 đơn × 1 dòng Cà phê đen, 120/240/300 giây → trung vị 240
    const orders = (await staffApi('get', '/api/orders?status=PENDING')).body.slice(0, 3);
    const durations = [120, 240, 300];
    for (const [k, o] of orders.entries()) {
      await staffApi('post', `/api/orders/${o.orderId}/accept`);
      await staffApi('post', `/api/orders/${o.orderId}/complete`);
      await pool.request().query(`UPDATE dbo.Orders SET AcceptedAt = DATEADD(SECOND, -${durations[k]}, CompletedAt) WHERE OrderId = ${o.orderId}`);
    }
    const run = await adminApi('post', '/api/admin/jobs/prep-stats/run');
    assert.equal(run.body.status, 'OK', JSON.stringify(run.body));
    const stats = (await adminApi('get', '/api/admin/prep-stats')).body;
    const den = stats.find((x) => x.name === 'Cà phê đen');
    assert.ok(den.sampleCount >= 3);
    assert.equal(den.medianSeconds, 240);
    await adminApi('post', '/api/admin/jobs/prep-stats/run');
    const n = (await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.ItemPrepStats WHERE MenuItemId = ${ids['Cà phê đen']}`)).recordset[0].n;
    assert.equal(n, 1);
    const [a, b] = await Promise.all([adminApi('post', '/api/admin/jobs/prep-stats/run'), adminApi('post', '/api/admin/jobs/prep-stats/run')]);
    assert.deepEqual([a.body.status, b.body.status].sort(), ['OK', 'SKIPPED']);
    const jobs = (await adminApi('get', '/api/admin/jobs')).body;
    assert.equal(jobs.find((j) => j.name === 'prep-stats').lastRun.status !== undefined, true);
  });
});

describe('Chia bill theo người (F-026)', () => {
  let A, B, s, lines, splitA, splitB, promo;

  test('2 khách, 4 dòng: mỗi người nhận dòng của mình, 1 dòng Chung; không lấy được dòng/phần người khác', async () => {
    promo = (
      await adminApi('post', '/api/admin/promotions', {
        name: 'Giảm 10% đơn từ 50k',
        type: 'ORDER_PERCENT',
        value: 10,
        minOrderAmount: 50000,
        startDate: todayVn(),
        endDate: todayVn(),
        stackWithMember: true,
        isActive: true,
      })
    ).body;
    A = await app.customer();
    B = await app.customer();
    s = await app.seat(A, '06');
    await joinGroup(B, '06', s);
    await order(A, s, [
      { menuItemId: ids['Cà phê sữa'], quantity: 1 },
      { menuItemId: ids['Bạc xỉu'], quantity: 1 },
    ]);
    await order(B, s, [
      { menuItemId: ids['Latte'], quantity: 1 },
      { menuItemId: ids['Trà đào'], quantity: 1 },
    ]);
    await acceptAll(s);
    const ra = await A.post(`/api/sessions/${s}/splits`, { label: 'Anh A' });
    assert.equal(ra.status, 201, JSON.stringify(ra.body));
    splitA = ra.body.splitId;
    splitB = (await B.post(`/api/sessions/${s}/splits`, { label: 'Chị B' })).body.splitId;
    const v = (await A.get(`/api/sessions/${s}/splits`)).body;
    assert.equal(v.splits.length, 3);
    assert.equal(v.splits.find((x) => x.splitId === splitA).mine, true);
    lines = Object.fromEntries(v.splits.find((x) => x.isCommon).lines.map((l) => [l.name, l.orderItemId]));
    const claim = (C, name, splitId) => api.put(`/api/sessions/${s}/items/${lines[name]}/split`).set('Cookie', C.cookie).send({ splitId });
    assert.equal((await claim(A, 'Cà phê sữa', splitA)).status, 200);
    assert.equal((await claim(A, 'Bạc xỉu', splitA)).status, 200);
    assert.equal((await claim(B, 'Latte', splitB)).status, 200);
    assert.equal((await claim(A, 'Latte', splitA)).status, 409, 'dòng đã thuộc phần B');
    assert.equal((await claim(A, 'Trà đào', splitB)).status, 403, 'không gán vào phần người khác');
    const after = (await B.get(`/api/sessions/${s}/splits`)).body;
    const by = Object.fromEntries(after.splits.map((x) => [x.label, x]));
    assert.deepEqual(
      by['Anh A'].lines.map((l) => l.name),
      ['Cà phê sữa', 'Bạc xỉu'],
    );
    assert.deepEqual(
      by['Chung'].lines.map((l) => l.name),
      ['Trà đào'],
    );
    assert.equal((await staffApi('post', `/api/sessions/${s}/settle/preview`, {})).body.code, 'SESSION_HAS_SPLITS');
  });

  test('thu phần A → phiên vẫn mở; phần cuối B tự gộp Chung + hội viên chỉ giảm phần B → phiên đóng, Σ khớp', async () => {
    const pa = (await staffApi('post', `/api/splits/${splitA}/settle/preview`, {})).body;
    assert.equal(pa.includeCommon, false);
    // Cà phê sữa 29k + Bạc xỉu 32k = 61k; đơn A 61k ≥ 50k → KM 10% = 6.100
    assert.equal(pa.totals.amountDue, 61000 - 6100 - ((61000 - 6100) % 500));
    const settleA = await staffApi('post', `/api/splits/${splitA}/settle`, { amountReceived: 100000, expectedAmountDue: pa.totals.amountDue });
    assert.equal(settleA.status, 200, JSON.stringify(settleA.body));
    assert.equal(settleA.body.sessionClosed, false);
    assert.equal((await A.get(`/api/sessions/${s}`)).body.status, 'OPEN');

    const reg = await staffApi('post', '/api/members', { phone: '0901000002', fullName: 'Chị B', consent: true });
    const pb = (await staffApi('post', `/api/splits/${splitB}/settle/preview`, { memberId: reg.body.memberId })).body;
    assert.equal(pb.includeCommon, true);
    assert.ok(pb.totals.memberDiscount > 0);
    const settleB = await staffApi('post', `/api/splits/${splitB}/settle`, {
      amountReceived: 200000,
      memberId: reg.body.memberId,
      expectedAmountDue: pb.totals.amountDue,
    });
    assert.equal(settleB.status, 200, JSON.stringify(settleB.body));
    assert.equal(settleB.body.sessionClosed, true);
    assert.equal(settleA.body.payment.memberDiscount, 0);
    const detail = (await A.get(`/api/sessions/${s}`)).body;
    assert.equal(detail.status, 'CLOSED');
    assert.equal(detail.payments.length, 2);
    // Bill riêng phần A chỉ có dòng của A
    const rc = (await staffApi('get', `/api/payments/${settleA.body.payment.paymentId}/receipt`)).body;
    assert.deepEqual(
      rc.lines.map((l) => l.name),
      ['Cà phê sữa', 'Bạc xỉu'],
    );
    assert.equal(rc.splitLabel, 'Anh A');
    await adminApi('patch', `/api/admin/promotions/${promo.promotionId}/active`, { isActive: false });
  });

  test('thu đồng thời cùng một phần → 1 thành công, 1 lỗi 409', async () => {
    const C = await app.customer();
    const D = await app.customer();
    const s2 = await app.seat(C, '02');
    await joinGroup(D, '02', s2);
    await order(C, s2, [{ menuItemId: ids['Nước suối'], quantity: 1 }]);
    await order(D, s2, [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    await acceptAll(s2);
    const sc = (await C.post(`/api/sessions/${s2}/splits`, { label: 'C' })).body.splitId;
    const sd = (await D.post(`/api/sessions/${s2}/splits`, { label: 'D' })).body.splitId;
    const v = (await C.get(`/api/sessions/${s2}/splits`)).body;
    const common = Object.fromEntries(v.splits.find((x) => x.isCommon).lines.map((l) => [l.name, l.orderItemId]));
    await api.put(`/api/sessions/${s2}/items/${common['Nước suối']}/split`).set('Cookie', C.cookie).send({ splitId: sc });
    await api.put(`/api/sessions/${s2}/items/${common['Cà phê đen']}/split`).set('Cookie', D.cookie).send({ splitId: sd });
    const [x, y] = await Promise.all([
      staffApi('post', `/api/splits/${sc}/settle`, { amountReceived: 50000 }),
      staffApi('post', `/api/splits/${sc}/settle`, { amountReceived: 50000 }),
    ]);
    assert.deepEqual([x.status, y.status].sort(), [200, 409]);
    const n = (await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.Payments WHERE SplitId = ${sc}`)).recordset[0].n;
    assert.equal(n, 1);
    // Hoàn tiền một phần chia bill: không được chọn hủy đơn; hoàn đủ không hủy đơn của phần khác
    const payId = (await pool.request().query(`SELECT PaymentId FROM dbo.Payments WHERE SplitId = ${sc}`)).recordset[0].PaymentId;
    const ord = (await staffApi('get', `/api/sessions/${s2}`)).body.orders[0];
    const bad = await adminApi('post', `/api/payments/${payId}/refunds`, { amount: 1000, reason: 'Thử hủy đơn', orderIds: [ord.orderId] });
    assert.equal(bad.status, 400);
    const ok = await adminApi('post', `/api/payments/${payId}/refunds`, { amount: 10000, reason: 'Khách đổi ý' });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.ok((await staffApi('get', `/api/sessions/${s2}`)).body.orders.every((o) => o.status !== 'VOIDED'));
    // Thu phần còn lại → đóng
    assert.equal((await staffApi('post', `/api/splits/${sd}/settle`, { amountReceived: 50000 })).body.sessionClosed, true);
  });

  test('phần cuối tự gộp Chung; phần Chung trống → SPLIT_EMPTY; "Thu chung" khi chưa thu phần nào → bỏ chia, thu cả bàn như cũ', async () => {
    const C = await app.customer();
    const s3 = await app.seat(C, '05');
    await order(C, s3, [{ menuItemId: ids['Nước suối'], quantity: 2 }]);
    await acceptAll(s3);
    const created = (await C.post(`/api/sessions/${s3}/splits`, { label: 'Tôi' })).body;
    const sp = created.splitId;
    // Phần duy nhất còn mở = phần cuối → tự gộp dòng Chung (D-17)
    const pv = (await staffApi('post', `/api/splits/${sp}/settle/preview`, {})).body;
    assert.equal(pv.includeCommon, true);
    assert.equal(pv.totals.amountDue, 20000);
    // Nhận hết món về phần mình → phần Chung trống
    const commonSplit = created.splits.find((x) => x.isCommon);
    await api.put(`/api/sessions/${s3}/items/${commonSplit.lines[0].orderItemId}/split`).set('Cookie', C.cookie).send({ splitId: sp });
    assert.equal((await staffApi('post', `/api/splits/${commonSplit.splitId}/settle/preview`, {})).body.code, 'SPLIT_EMPTY');
    const m = await staffApi('post', `/api/sessions/${s3}/splits/merge`);
    assert.equal(m.body.unsplit, true);
    await settleWhole(s3);
    assert.equal((await C.get(`/api/sessions/${s3}`)).body.status, 'CLOSED');
  });
});
