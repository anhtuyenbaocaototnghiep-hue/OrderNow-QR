// Integration test (SQL Server thật) F-051 — đánh giá sau khi dùng món (ADR-010 D-46…D-48).
// Mỗi test dùng món riêng để số lượt / trung bình không lẫn: Cà phê đen + Bạc xỉu (01–03), Bánh croissant (04, 05), Nước suối (05).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let flushAudit;
let app, api, pool, admin, staff, lead, ids, tables, staffSock;

const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const stars = (pairs) => pairs.map(([name, n]) => ({ menuItemId: ids[name], stars: n }));

/** Nhóm khách ở bàn gọi món → quầy tiếp nhận → thu tiền (phiên đóng). second: thêm điện thoại thứ hai Gộp vào nhóm trước khi thu. */
async function paidGroup(code, items, { second = false, pay = true } = {}) {
  const C = await app.customer();
  const s = await app.seat(C, code);
  let D = null;
  if (second) {
    D = await app.customer();
    const j = await D.post(`/api/sessions/${s}/join`, { qrToken: tables[code] });
    assert.ok([200, 201].includes(j.status), JSON.stringify(j.body));
  }
  const o = await C.post('/api/orders', { sessionId: s, items: items.map(([name, quantity]) => ({ menuItemId: ids[name], quantity })) });
  assert.equal(o.status, 201, JSON.stringify(o.body));
  assert.equal((await call(staff, 'post', `/api/orders/${o.body.orderId}/accept`)).status, 200);
  if (pay) assert.equal((await call(staff, 'post', `/api/sessions/${s}/settle`, { amountReceived: 1_000_000 })).status, 200);
  return { C, D, s, orderId: o.body.orderId };
}

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  ({ flushAudit } = await import('../src/middleware/audit.js'));
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  const u = await call(admin, 'post', '/api/admin/users', { username: 'lead1', password: 'Pass@123', fullName: 'Trưởng ca 1', role: 'MANAGER' });
  assert.equal(u.status, 201, JSON.stringify(u.body));
  lead = await app.login('lead1', 'Pass@123');
  ids = await app.ids();
  tables = Object.fromEntries((await q1('SELECT Code, QrToken FROM dbo.Tables')).map((t) => [t.Code, t.QrToken]));
  assert.equal((await call(staff, 'post', '/api/shifts/open', { openingCash: 0 })).status, 201);
  staffSock = await app.connect({ auth: { token: staff } });
});

after(() => app.close());

describe('Đánh giá sau khi dùng món (F-051)', () => {
  test('AC-051-01: khách trong nhóm đã thanh toán đánh giá (Cà phê đen 5, Bạc xỉu 4, "ngon") → 201; gửi lại → 409 ALREADY_REVIEWED; điện thoại khác cùng nhóm vẫn đánh giá 1 lần', async () => {
    const { C, D, s } = await paidGroup(
      '01',
      [
        ['Cà phê đen', 1],
        ['Bạc xỉu', 1],
      ],
      { second: true },
    );
    const info = await C.get(`/api/sessions/${s}/review`);
    assert.equal(info.status, 200, JSON.stringify(info.body));
    assert.deepEqual([info.body.canReview, info.body.submitted], [true, false]);
    assert.deepEqual(info.body.items.map((i) => i.name).sort(), ['Bạc xỉu', 'Cà phê đen']);
    const body = {
      items: stars([
        ['Cà phê đen', 5],
        ['Bạc xỉu', 4],
      ]),
      comment: 'ngon',
    };
    const r = await C.post(`/api/sessions/${s}/review`, body);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const again = await C.post(`/api/sessions/${s}/review`, body);
    assert.deepEqual([again.status, again.body.code], [409, 'ALREADY_REVIEWED']);
    assert.deepEqual((await C.get(`/api/sessions/${s}/review`)).body.submitted, true);
    assert.equal((await D.post(`/api/sessions/${s}/review`, { items: stars([['Cà phê đen', 4]]) })).status, 201);
    const rows = await q1(
      `SELECT r.Comment, ri.MenuItemId, ri.Stars FROM dbo.Reviews r JOIN dbo.ReviewItems ri ON ri.ReviewId = r.ReviewId WHERE r.SessionId = '${s}'`,
    );
    assert.equal(rows.length, 3);
    assert.ok(rows.some((x) => x.Comment === 'ngon' && x.MenuItemId === ids['Bạc xỉu'] && x.Stars === 4));
  });

  test('AC-051-02: chưa thanh toán → 409 SESSION_NOT_PAID; quá 24 giờ → 409 REVIEW_EXPIRED; điện thoại / quầy không thuộc nhóm → 403; món không thuộc nhóm, sao ngoài 1–5, trùng món, không chấm gì → 400; hủy bàn (không thu) → không đánh giá', async () => {
    const open = await paidGroup('02', [['Cà phê đen', 1]], { pay: false });
    assert.equal((await open.C.get(`/api/sessions/${open.s}/review`)).body.reason, 'SESSION_NOT_PAID');
    const notPaid = await open.C.post(`/api/sessions/${open.s}/review`, { items: stars([['Cà phê đen', 5]]) });
    assert.deepEqual([notPaid.status, notPaid.body.code], [409, 'SESSION_NOT_PAID']);
    assert.equal((await call(admin, 'post', `/api/sessions/${open.s}/cancel`, { reason: 'khách bỏ về', stockMode: 'WASTE' })).status, 200);
    assert.equal(
      (await open.C.post(`/api/sessions/${open.s}/review`, { items: stars([['Cà phê đen', 5]]) })).body.code,
      'SESSION_NOT_PAID',
      'hủy bàn không có lượt thu',
    );

    const { C, s } = await paidGroup('03', [['Cà phê đen', 1]]);
    const stranger = await app.customer();
    assert.equal((await stranger.get(`/api/sessions/${s}/review`)).status, 403);
    assert.equal((await stranger.post(`/api/sessions/${s}/review`, { items: stars([['Cà phê đen', 5]]) })).status, 403);
    assert.equal((await call(staff, 'post', `/api/sessions/${s}/review`, { items: stars([['Cà phê đen', 5]]) })).status, 403);
    for (const bad of [
      { items: stars([['Latte', 5]]) },
      { items: [{ menuItemId: ids['Cà phê đen'], stars: 6 }] },
      { items: [{ menuItemId: ids['Cà phê đen'], stars: 0 }] },
      {
        items: stars([
          ['Cà phê đen', 5],
          ['Cà phê đen', 4],
        ]),
      },
      { items: [], comment: '   ' },
      { comment: 'x'.repeat(301) },
    ]) {
      const r = await C.post(`/api/sessions/${s}/review`, bad);
      assert.equal(r.status, 400, `${JSON.stringify(bad).slice(0, 80)} → ${r.status} ${JSON.stringify(r.body)}`);
    }
    await q1(`UPDATE dbo.Sessions SET ClosedAt = DATEADD(HOUR, -25, ClosedAt) WHERE SessionId = '${s}'; SELECT 1 AS ok`);
    const expired = await C.post(`/api/sessions/${s}/review`, { items: stars([['Cà phê đen', 5]]) });
    assert.deepEqual([expired.status, expired.body.code], [409, 'REVIEW_EXPIRED']);
    assert.equal((await q1(`SELECT COUNT(*) AS n FROM dbo.Reviews WHERE SessionId IN ('${s}', '${open.s}')`))[0].n, 0);
  });

  test('AC-051-03: có món 2 sao → quầy nhận review.low (bàn, món, góp ý), có trong danh sách cảnh báo; nhân viên bấm Đã xử lý → hết khỏi danh sách, ghi người xử lý; đánh giá toàn ≥ 3 sao không báo', async () => {
    const { C, s } = await paidGroup('04', [
      ['Cà phê đen', 1],
      ['Bạc xỉu', 1],
    ]);
    const ev = app.waitFor(staffSock, 'review.low');
    const r = await C.post(`/api/sessions/${s}/review`, {
      items: stars([
        ['Cà phê đen', 2],
        ['Bạc xỉu', 5],
      ]),
      comment: 'cà phê nguội',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const low = await ev;
    assert.equal(low.reviewId, r.body.reviewId);
    assert.equal(low.table.name, 'Bàn 04');
    assert.equal(low.comment, 'cà phê nguội');
    assert.deepEqual(
      low.items.map((i) => [i.name, i.stars]),
      [
        ['Cà phê đen', 2],
        ['Bạc xỉu', 5],
      ],
    );
    const alerts = (await call(staff, 'get', '/api/reviews/alerts')).body;
    assert.ok(alerts.some((a) => a.reviewId === r.body.reviewId));
    const handled = app.waitFor(staffSock, 'review.handled', (p) => p.reviewId === r.body.reviewId);
    const h = await call(staff, 'post', `/api/reviews/${r.body.reviewId}/handle`);
    assert.equal(h.status, 200, JSON.stringify(h.body));
    assert.equal(h.body.handledBy, 'Nhân viên quầy 1');
    await handled;
    assert.ok(!(await call(staff, 'get', '/api/reviews/alerts')).body.some((a) => a.reviewId === r.body.reviewId));
    assert.equal((await call(staff, 'post', `/api/reviews/${r.body.reviewId}/handle`)).body.code, 'ALREADY_PROCESSED');
    await flushAudit();
    assert.equal((await q1(`SELECT COUNT(*) AS n FROM dbo.AuditLogs WHERE Action = 'review.handle' AND EntityId = '${r.body.reviewId}'`))[0].n, 1);

    const good = await paidGroup('05', [['Cà phê đen', 1]]);
    const ok = await good.C.post(`/api/sessions/${good.s}/review`, { items: stars([['Cà phê đen', 3]]) });
    assert.equal(ok.status, 201);
    assert.equal((await q1(`SELECT HasLow FROM dbo.Reviews WHERE ReviewId = ${ok.body.reviewId}`))[0].HasLow, false);
    assert.ok(!(await call(staff, 'get', '/api/reviews/alerts')).body.some((a) => a.reviewId === ok.body.reviewId));
  });

  test('AC-051-04: trang Đánh giá của quản lý: Bánh croissant 2 lượt (5, 4) → trung bình 4,5, phân bố đúng, có góp ý; nhân viên / trưởng ca → 403', async () => {
    for (const [code, n, comment] of [
      ['01', 5, 'bánh giòn'],
      ['02', 4, null],
    ]) {
      const g = await paidGroup(code, [['Bánh croissant', 1]]);
      assert.equal((await g.C.post(`/api/sessions/${g.s}/review`, { items: stars([['Bánh croissant', n]]), comment })).status, 201);
    }
    const today = todayVn();
    const rep = await call(admin, 'get', `/api/admin/reviews?from=${today}&to=${today}`);
    assert.equal(rep.status, 200, JSON.stringify(rep.body));
    const c = rep.body.items.find((x) => x.name === 'Bánh croissant');
    assert.deepEqual([c.count, c.avg, c.dist], [2, 4.5, [0, 0, 0, 1, 1]]);
    assert.ok(rep.body.reviews.some((r) => r.comment === 'bánh giòn' && r.items.some((i) => i.name === 'Bánh croissant' && i.stars === 5)));
    for (const token of [staff, lead]) assert.equal((await call(token, 'get', `/api/admin/reviews?from=${today}&to=${today}`)).status, 403);
  });

  test('AC-051-05: menu khách — Nước suối 5 lượt (5, 5, 4, 4, 5) → ★ 4,6 (5); Bánh croissant 4 lượt → chưa hiện; đổi ngưỡng ở Cài đặt thành 3 → hiện', async () => {
    const codes = ['01', '02', '03', '04', '05'];
    for (const [i, n] of [5, 5, 4, 4, 5].entries()) {
      const g = await paidGroup(codes[i], [['Nước suối', 1]]);
      assert.equal((await g.C.post(`/api/sessions/${g.s}/review`, { items: stars([['Nước suối', n]]) })).status, 201);
    }
    for (const code of ['03', '04']) {
      const g = await paidGroup(code, [['Bánh croissant', 1]]);
      assert.equal((await g.C.post(`/api/sessions/${g.s}/review`, { items: stars([['Bánh croissant', 3]]) })).status, 201);
    }
    const ratingOf = async (name) => {
      const menu = (await (await app.customer()).get('/api/menu')).body;
      return [...menu.categories.flatMap((c) => c.items), ...menu.combos].find((i) => i.name === name).rating;
    };
    assert.deepEqual(await ratingOf('Nước suối'), { avg: 4.6, count: 5 });
    assert.equal(await ratingOf('Bánh croissant'), null, 'mới 4 lượt (< 5)');
    assert.equal((await call(admin, 'put', '/api/admin/settings', { reviewMenuMinCount: 3 })).status, 200);
    assert.deepEqual(await ratingOf('Bánh croissant'), { avg: 3.8, count: 4 });
    assert.equal((await call(admin, 'put', '/api/admin/settings', { reviewMenuMinCount: 5, reviewMenuDays: 90 })).status, 200);
  });

  test('AC-051-05 (review G3): một người mở nhiều tab trong cùng nhóm không dồn được phiếu — sao trên menu tính theo nhóm; mỗi nhóm tối đa số món đã gọi; món đã xóa không có trong danh sách chấm', async () => {
    // Nhóm gọi 3 ly Trà đào: 3 điện thoại chấm 1 sao → 1 lượt (1 nhóm); điện thoại thứ 4 → 409 REVIEW_LIMIT
    const C = await app.customer();
    const s = await app.seat(C, '06');
    const extra = [];
    for (let i = 0; i < 3; i++) {
      const X = await app.customer();
      assert.ok([200, 201].includes((await X.post(`/api/sessions/${s}/join`, { qrToken: tables['06'] })).status));
      extra.push(X);
    }
    const o = await C.post('/api/orders', { sessionId: s, items: [{ menuItemId: ids['Trà đào'], quantity: 3 }] });
    assert.equal(o.status, 201, JSON.stringify(o.body));
    assert.equal((await call(staff, 'post', `/api/orders/${o.body.orderId}/accept`)).status, 200);
    assert.equal((await call(staff, 'post', `/api/sessions/${s}/settle`, { amountReceived: 1_000_000 })).status, 200);
    for (const phone of [C, extra[0], extra[1]]) {
      assert.equal((await phone.post(`/api/sessions/${s}/review`, { items: stars([['Trà đào', 1]]) })).status, 201);
    }
    assert.equal((await extra[2].get(`/api/sessions/${s}/review`)).body.reason, 'REVIEW_LIMIT');
    const fourth = await extra[2].post(`/api/sessions/${s}/review`, { items: stars([['Trà đào', 1]]) });
    assert.deepEqual([fourth.status, fourth.body.code], [409, 'REVIEW_LIMIT']);
    assert.equal((await call(admin, 'put', '/api/admin/settings', { reviewMenuMinCount: 1 })).status, 200);
    const ratingOf = async (name) => {
      const menu = (await (await app.customer()).get('/api/menu')).body;
      return [...menu.categories.flatMap((c) => c.items), ...menu.combos].find((i) => i.name === name).rating;
    };
    assert.deepEqual(await ratingOf('Trà đào'), { avg: 1, count: 1 }, '3 điện thoại cùng nhóm = 1 lượt');
    const g2 = await paidGroup('01', [['Trà đào', 1]]);
    assert.equal((await g2.C.post(`/api/sessions/${g2.s}/review`, { items: stars([['Trà đào', 5]]) })).status, 201);
    assert.deepEqual(await ratingOf('Trà đào'), { avg: 3, count: 2 }, 'trung bình các nhóm (1 + 5) / 2');
    assert.equal((await call(admin, 'put', '/api/admin/settings', { reviewMenuMinCount: 5 })).status, 200);

    // Món đã xóa khỏi đơn trước khi thu (F-046) không có trong danh sách chấm, chấm vào → 400
    const v = await paidGroup(
      '02',
      [
        ['Cà phê đen', 1],
        ['Trà đào', 1],
      ],
      { pay: false },
    );
    const [line] = await q1(`SELECT OrderItemId FROM dbo.OrderItems WHERE OrderId = ${v.orderId} AND MenuItemId = ${ids['Trà đào']}`);
    assert.equal(
      (await call(admin, 'post', `/api/order-items/${line.OrderItemId}/void`, { quantity: 0, reason: 'khách đổi ý', stockMode: 'WASTE' })).status,
      200,
    );
    assert.equal((await call(staff, 'post', `/api/sessions/${v.s}/settle`, { amountReceived: 1_000_000 })).status, 200);
    assert.deepEqual(
      (await v.C.get(`/api/sessions/${v.s}/review`)).body.items.map((i) => i.name),
      ['Cà phê đen'],
    );
    assert.equal((await v.C.post(`/api/sessions/${v.s}/review`, { items: stars([['Trà đào', 1]]) })).status, 400);
  });

  test('AC-051-03 (review G3): tài khoản chỉ từng xử lý đánh giá thấp (quản lý — không chấm công) → xóa mềm, không lỗi khóa ngoại', async () => {
    const u = await call(admin, 'post', '/api/admin/users', { username: 'handler1', password: 'Pass@123', fullName: 'QL xử lý đánh giá', role: 'ADMIN' });
    assert.equal(u.status, 201, JSON.stringify(u.body));
    const handler = await app.login('handler1', 'Pass@123');
    const g = await paidGroup('03', [['Cà phê đen', 1]]);
    const r = await g.C.post(`/api/sessions/${g.s}/review`, { items: stars([['Cà phê đen', 1]]) });
    assert.equal(r.status, 201);
    assert.equal((await call(handler, 'post', `/api/reviews/${r.body.reviewId}/handle`)).status, 200);
    const del = await call(admin, 'delete', `/api/admin/users/${u.body.userId}`);
    assert.deepEqual([del.status, del.body.result], [200, 'ARCHIVED'], JSON.stringify(del.body));
  });
});
