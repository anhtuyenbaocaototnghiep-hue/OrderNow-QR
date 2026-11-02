// F-064 — báo động giá vốn khi nhập hàng giá cao hơn (ADR-023, BR-100, BR-101).
// Unit: giá mốc, phân loại, giá gợi ý, tác động lên thực đơn. Integration (SQL Server thật) với bộ gửi email GIẢ.
// Mỗi test tạo nguyên liệu + món riêng nên không phụ thuộc thứ tự, trừ các test đổi cài đặt (đặt lại ở cuối test).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

process.env.MAIL_HOURLY_MAX = '100000';
// Không bao giờ gửi email thật từ test, kể cả khi .env có hộp thư gửi thật (SMTP_*)
for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_TRANSPORT']) delete process.env[k];

let app, api, pool, admin, staff, lead, mailService, alertService, cost;

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
const newIngredient = async (name, unit = 'ml') =>
  ok(await call(admin, 'post', '/api/admin/ingredients', { name, unit, stockQty: 0, lowStockThreshold: 0 }), 201).ingredientId;
/** Món mới. bom: [[ingredientId, amount]] */
async function newItem(name, price, bom) {
  const id = ok(await call(admin, 'post', '/api/admin/menu-items', { categoryId: 1, name, price }), 201).menuItemId;
  ok(
    await call(
      admin,
      'put',
      `/api/admin/menu-items/${id}/bom`,
      bom.map(([ingredientId, amount]) => ({ ingredientId, amount })),
    ),
  );
  return id;
}
/** Phiếu nhập. lines: [[ingredientId, unitCost]] (mặc định 100.000 đơn vị) → phiếu */
const receive = async (lines, extra = {}) =>
  ok(
    await call(admin, 'post', '/api/admin/stock-receipts', {
      lines: lines.map(([ingredientId, unitCost]) => ({ ingredientId, qty: 100_000, unitCost })),
      ...extra,
    }),
    201,
  );
const sell = async (menuItemId, quantity) =>
  ok(await call(staff, 'post', '/api/orders/takeaway', { items: [{ menuItemId, quantity }], amountReceived: 5_000_000 }), 201);
const alertsOf = async (receiptId) =>
  (
    await q1(
      `SELECT AlertId, Kind, Severity, Title, Detail, Status, Note, DedupeKey, UserId FROM dbo.Alerts WHERE DedupeKey LIKE 'COST:${receiptId}:%' ORDER BY AlertId`,
    )
  ).map((a) => ({
    ...a,
    detail: JSON.parse(a.Detail),
  }));
const mailsOf = (alertId) => q1(`SELECT * FROM dbo.AlertOutbox WHERE AlertId = ${alertId}`);
const marksOf = (ingredientId) => q1(`SELECT * FROM dbo.CostAlertMarks WHERE IngredientId = ${ingredientId}`);
/** Giờ yên lặng phủ lúc này: từ 1 giờ trước tới 2 giờ sau (giờ quán) — không phụ thuộc giờ chạy test. */
function quietNow() {
  const h = new Date(Date.now() + 7 * 3600e3).getUTCHours();
  const at = (x) => `${String((x + 24) % 24).padStart(2, '0')}:00`;
  return settings({ alertImmediate: true, alertQuietStart: at(h - 1), alertQuietEnd: at(h + 2) });
}
const noAlert = async (receipt, why) => assert.deepEqual(await alertsOf(receipt.receiptId), [], why);

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  mailService = await import('../src/services/mailService.js');
  alertService = await import('../src/services/alertService.js');
  cost = await import('../src/domain/costImpact.js');
  mailService._setTransport({ sendMail: async () => ({ messageId: 'x' }) });
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ok(await call(admin, 'post', '/api/admin/users', { username: 'leadca', password: 'Pass@123', fullName: 'Trưởng ca giá vốn', role: 'MANAGER' }), 201);
  lead = await app.login('leadca', 'Pass@123');
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 0 }), 201);
  ok(await call(admin, 'put', '/api/admin/units/hộp1l', { name: 'hộp 1 lít', baseUnitCode: 'ml', factor: 1000 }));
  await settings({ alertEmails: ['chuquan@example.com'] });
});

after(() => {
  mailService?._setTransport(null);
  return app?.close();
});

describe('Hàm thuần (F-064, ADR-023)', () => {
  const now = new Date('2026-11-02T00:00:00Z');
  const daysAgo = (n) => new Date(now.getTime() - n * 86_400_000);

  test('AC-064-04 (unit): giá mốc = lần báo gần nhất, giảm theo phiếu rẻ hơn trong 90 ngày; chưa báo → thấp nhất 90 ngày, không có thì phiếu gần nhất', () => {
    const h = [
      { receiptId: 1, unitCost: 20, receivedAt: daysAgo(200) },
      { receiptId: 2, unitCost: 30, receivedAt: daysAgo(10) },
      { receiptId: 3, unitCost: 31, receivedAt: daysAgo(5) },
    ];
    assert.deepEqual(cost.referencePrice({ history: [], now }), { ref: null, last: null });
    assert.deepEqual(cost.referencePrice({ history: h, now }), { ref: 30, last: 31 }, 'giá 200 ngày trước không còn tính');
    assert.deepEqual(cost.referencePrice({ history: h.slice(0, 1), now }), { ref: 20, last: 20 }, 'cả lịch sử đều cũ → phiếu gần nhất');
    assert.deepEqual(cost.referencePrice({ anchor: { receiptId: 2, unitCost: 30 }, history: h, now }), { ref: 30, last: 31 }, 'tăng sau khi báo: giữ mốc');
    assert.deepEqual(cost.referencePrice({ anchor: { receiptId: 1, unitCost: 40 }, history: h, now }).ref, 30, 'giá giảm: mốc giảm theo');
    const line = (receiptId, unitCost, days = 5) => ({ receiptId, unitCost, receivedAt: daysAgo(days) });
    assert.equal(cost.referencePrice({ history: [line(1, 30), line(2, 14)], now }).ref, 30, 'một phiếu rẻ bất thường không kéo mốc xuống');
    assert.equal(cost.referencePrice({ history: [line(1, 30), line(2, 14), line(3, 14)], now }).ref, 14, 'phiếu sau cũng rẻ → giá thật');
    assert.equal(cost.referencePrice({ history: [line(1, 30), line(2, 15)], now }).ref, 15, 'đúng một nửa vẫn là giá thường');
    assert.equal(
      cost.referencePrice({ anchor: { receiptId: 1, unitCost: 120 }, history: [line(1, 120, 300), line(2, 90, 100)], now }).ref,
      90,
      'mua thưa: phiếu gần nhất sau lần báo vẫn được tính dù quá 90 ngày',
    );
  });

  test('AC-064-05 (unit): trên 50% so với cả mốc lẫn phiếu trước mới nghi nhầm; đúng 50% hoặc phiếu trước đã cao thì không', () => {
    const lines = (unitCost) => [{ ingredientId: 1, unitCost }];
    const classify = (unitCost, ref, last) => cost.classifyLines(lines(unitCost), new Map([[1, { ref, last }]]), { risePct: 5 })[0];
    assert.deepEqual([classify(46, 30, 30).suspect, classify(46, 30, 30).major], [true, false]);
    assert.deepEqual([classify(45, 30, 30).suspect, classify(45, 30, 30).major], [false, true], 'đúng 50%');
    assert.deepEqual([classify(46, 30, 46).suspect, classify(46, 30, 46).major], [false, true], 'phiếu trước đã giá đó → giá thật');
    assert.equal(classify(31.5, 30, 30).major, true, 'đúng ngưỡng 5%');
    assert.equal(classify(31.4, 30, 30).major, false);
    assert.equal(cost.classifyLines(lines(null), new Map([[1, { ref: 30, last: 30 }]]), { risePct: 5 }).length, 0, 'dòng không có giá');
    assert.equal(cost.classifyLines(lines(30), new Map([[1, { ref: null, last: null }]]), { risePct: 5 }).length, 0, 'lần đầu có giá');
  });

  test('AC-064-01 (unit): giá gợi ý làm tròn lên 1.000đ; không có mức giữ % khi giá cũ đã lỗ / hòa vốn', () => {
    assert.deepEqual(cost.suggestPrices({ price: 30000, oldCost: 12000, newCost: 12900 }), { keepAmount: 31000, keepMargin: 33000 });
    assert.deepEqual(cost.suggestPrices({ price: 35000, oldCost: 10000, newCost: 10720 }), { keepAmount: 36000, keepMargin: 38000 });
    assert.deepEqual(cost.suggestPrices({ price: 45000, oldCost: 13000, newCost: 14200 }), { keepAmount: 47000, keepMargin: 50000 });
    assert.deepEqual(
      cost.suggestPrices({ price: 30000, oldCost: 12000, newCost: 13000 }),
      { keepAmount: 31000, keepMargin: 33000 },
      'số tròn không bị làm tròn thêm',
    );
    assert.equal(cost.suggestPrices({ price: 10000, oldCost: 12000, newCost: 13000 }).keepMargin, null);
  });

  test('AC-064-02 (unit): bán thành phẩm lồng nhau và giá nghi nhầm được tính đúng; công thức vòng lặp không treo', () => {
    const ingredients = new Map([
      [1, { name: 'Sữa', lastUnitCost: 36, avgCost: 30 }],
      [2, { name: 'Cốt', lastUnitCost: null, avgCost: 0 }],
      [3, { name: 'Cốt 2', lastUnitCost: null, avgCost: 0 }],
      [4, { name: 'Lạ', lastUnitCost: null, avgCost: 7 }],
    ]);
    const snap = {
      ingredients,
      recipes: new Map([
        [2, { outputQty: 100, lines: [{ ingredientId: 3, qty: 100 }] }],
        [3, { outputQty: 50, lines: [{ ingredientId: 1, qty: 50 }] }],
      ]),
      bom: new Map([
        [
          10,
          [
            { ingredientId: 2, amount: 100 },
            { ingredientId: 4, amount: 100 },
          ],
        ],
      ]),
      combos: new Map(),
      items: [{ menuItemId: 10, name: 'Món', itemType: 'SINGLE', price: 20000 }],
      options: [],
      sales: new Map([[10, 2]]),
    };
    const change = (extra) => [{ ingredientId: 1, oldCost: 30, newCost: 36, risePct: 20, major: true, suspect: false, ...extra }];
    const r = cost.menuImpact(snap, change(), { marginDrop: 2, marginMin: 60 });
    assert.deepEqual(
      [r.items[0].oldCost, r.items[0].newCost, r.items[0].monthlyLoss, r.items[0].causes],
      [3700, 4300, 1200, ['Sữa']],
      'qua 2 tầng công thức; nguyên liệu chưa có giá nhập dùng giá vốn bình quân',
    );
    assert.deepEqual(
      cost.menuImpact(snap, change({ major: false, suspect: true }), { marginDrop: 2, marginMin: 60 }).items,
      [],
      'giá nghi nhầm không tính vào lãi',
    );
    snap.recipes.set(3, { outputQty: 50, lines: [{ ingredientId: 2, qty: 50 }] }); // vòng lặp 2 ↔ 3 (CSDL đã chặn, đây là lưới an toàn)
    assert.deepEqual(cost.menuImpact(snap, change(), { marginDrop: 2, marginMin: 60 }).items, []);
  });
});

describe('Nhập hàng giá cao hơn (F-064)', () => {
  test('AC-064-01: sữa tăng 20% → một cảnh báo: giá vốn, lãi, tiền mất theo số bán 30 ngày, 2 giá gợi ý, xếp theo tiền mất; giá bán không đổi', async () => {
    const milk = await newIngredient('Sữa A1');
    const tea = await newIngredient('Trà A1', 'g');
    const coffee = await newIngredient('Cà phê A1', 'g');
    const bean = await newIngredient('Hạt A1', 'g');
    const first = await receive([
      [milk, 30],
      [tea, 50],
      [coffee, 100],
      [bean, 100],
    ]);
    await noAlert(first, 'lần đầu có giá: chưa có gì để so');
    const teaMilk = await newItem('Trà sữa A1', 30000, [
      [milk, 150],
      [tea, 150],
    ]);
    const bacXiu = await newItem('Bạc xỉu A1', 35000, [
      [milk, 120],
      [coffee, 64],
    ]);
    const latte = await newItem('Latte A1', 45000, [
      [milk, 200],
      [bean, 70],
    ]);
    await sell(teaMilk, 4);
    await sell(bacXiu, 3);
    await sell(latte, 1);

    const r = await receive([[milk, 36]]);
    assert.equal(JSON.stringify(r).includes('monthlyLoss'), false, 'phản hồi nhập kho không có số liệu cảnh báo');
    const alerts = await alertsOf(r.receiptId);
    assert.equal(alerts.length, 1);
    const [a] = alerts;
    assert.deepEqual([a.Kind, a.Severity, a.Status, a.UserId], ['COST_RISE', 'HIGH', 'NEW', null]);
    assert.equal(a.Title, `Giá Sữa A1 tăng 20% — 3 món tụt lãi (phiếu nhập #${r.receiptId})`);
    assert.deepEqual(
      a.detail.items.map((i) => [i.name, i.oldCost, i.newCost, i.oldMargin, i.newMargin, i.qty30, i.monthlyLoss, i.suggestKeepAmount, i.suggestKeepMargin]),
      [
        ['Trà sữa A1', 12000, 12900, 60, 57, 4, 3600, 31000, 33000],
        ['Bạc xỉu A1', 10000, 10720, 71.4, 69.4, 3, 2160, 36000, 38000],
        ['Latte A1', 13000, 14200, 71.1, 68.4, 1, 1200, 47000, 50000],
      ],
    );
    assert.equal(a.detail.monthlyLoss, 6960);
    assert.deepEqual(
      [a.detail.ingredients[0].oldCost, a.detail.ingredients[0].newCost, a.detail.ingredients[0].risePct, a.detail.ingredients[0].oldStock > 0],
      [30, 36, 20, true],
    );
    const prices = await q1(`SELECT Price FROM dbo.MenuItems WHERE MenuItemId IN (${teaMilk}, ${bacXiu}, ${latte}) ORDER BY MenuItemId`);
    assert.deepEqual(
      prices.map((p) => Number(p.Price)),
      [30000, 35000, 45000],
      'app không tự đổi giá',
    );
    const mails = await mailsOf(a.AlertId);
    assert.equal(mails.length, 1, 'một email mỗi phiếu');
    assert.match(mails[0].Subject, /Giá Sữa A1 tăng 20%/);
    assert.match(mails[0].BodyText, /mất khoảng 6\.960đ mỗi tháng/);
    assert.match(mails[0].BodyText, /Trà sữa A1: lãi 60% → 57%.*gợi ý 31\.000đ \(giữ tiền lãi\) hoặc 33\.000đ \(giữ % lãi\)/);
    assert.match(mails[0].BodyText, /app không tự đổi giá/);
    assert.deepEqual(
      (await marksOf(milk)).map((m) => [m.AlertId, m.ReceiptId, Number(m.UnitCost)]),
      [[a.AlertId, r.receiptId, 36]],
    );
  });

  test('AC-064-02: dò qua bán thành phẩm và combo; nhập theo gói quy về đơn vị gốc; tùy chọn được liệt kê; món ẩn / đã xóa không báo', async () => {
    const milk = await newIngredient('Sữa A2');
    const sugar = await newIngredient('Đường A2', 'g');
    const semi = await newIngredient('Cốt sữa A2');
    ok(await call(admin, 'put', `/api/admin/ingredients/${semi}/advanced`, { kind: 'SEMI', shelfLifeHours: 24, wastePercent: 0 }));
    ok(
      await call(admin, 'put', `/api/admin/ingredients/${semi}/recipe`, {
        outputQty: 1000,
        lines: [
          { ingredientId: milk, qty: 500 },
          { ingredientId: sugar, qty: 100 },
        ],
      }),
    );
    ok(
      await call(admin, 'post', '/api/admin/stock-receipts', {
        lines: [
          { ingredientId: milk, packUnitCode: 'hộp1l', packQty: 100, packPrice: 20000 },
          { ingredientId: sugar, qty: 10000, unitCost: 10 },
        ],
      }),
      201,
    );
    const viaSemi = await newItem('Trà cốt A2', 10000, [[semi, 200]]);
    const direct = await newItem('Sữa đá A2', 20000, [[milk, 100]]);
    const combo = ok(
      await call(admin, 'post', '/api/admin/combos', { name: 'Combo A2', price: 30000, components: [{ menuItemId: direct, quantity: 2 }] }),
      201,
    ).menuItemId;
    const hidden = await newItem('Món ẩn A2', 20000, [[milk, 100]]);
    const gone = await newItem('Món xóa A2', 20000, [[milk, 100]]);
    await pool
      .request()
      .query(
        `UPDATE dbo.MenuItems SET IsActive = 0 WHERE MenuItemId = ${hidden}; UPDATE dbo.MenuItems SET DeletedAt = SYSUTCDATETIME() WHERE MenuItemId = ${gone};`,
      );
    const group = ok(
      await call(admin, 'post', '/api/admin/modifier-groups', {
        name: 'Thêm A2',
        minSelect: 0,
        maxSelect: 1,
        options: [{ name: 'Thêm sữa A2', priceDelta: 3000 }],
      }),
      201,
    );
    await pool.request().query(`INSERT dbo.ModifierOptionBom (OptionId, IngredientId, Amount) VALUES (${group.options[0].optionId}, ${milk}, 50)`);

    const r = ok(
      await call(admin, 'post', '/api/admin/stock-receipts', { lines: [{ ingredientId: milk, packUnitCode: 'hộp1l', packQty: 10, packPrice: 26000 }] }),
      201,
    );
    const [a] = await alertsOf(r.receiptId);
    assert.deepEqual([a.detail.ingredients[0].oldCost, a.detail.ingredients[0].newCost, a.detail.ingredients[0].risePct], [20, 26, 30], 'so theo đơn vị gốc');
    assert.deepEqual(a.detail.ingredients[0].pack, { unit: 'hộp1l', oldPrice: 20000, newPrice: 26000 });
    const byName = new Map(a.detail.items.map((i) => [i.name, i]));
    assert.deepEqual([...byName.keys()].sort(), ['Combo A2', 'Sữa đá A2', 'Trà cốt A2'].sort(), 'không có món ẩn / đã xóa');
    assert.deepEqual([byName.get('Trà cốt A2').oldCost, byName.get('Trà cốt A2').newCost], [2200, 2800], 'bán thành phẩm = Σ công thức ÷ sản lượng');
    assert.deepEqual([byName.get('Combo A2').oldCost, byName.get('Combo A2').newCost, byName.get('Combo A2').itemType], [4000, 5200, 'COMBO']);
    assert.deepEqual(byName.get('Trà cốt A2').menuItemId, viaSemi);
    assert.deepEqual(byName.get('Combo A2').menuItemId, combo);
    assert.deepEqual(a.detail.options, [{ name: 'Thêm sữa A2', group: 'Thêm A2', priceDelta: 3000, oldCost: 1000, newCost: 1300 }]);
  });

  test('AC-064-03: không báo khi tăng dưới ngưỡng, giá giảm, không có giá, lãi không vượt ngưỡng; món thiếu giá vào danh sách "chưa tính được"', async () => {
    const milk = await newIngredient('Sữa A3');
    const small = await newIngredient('Quế A3', 'g');
    const unknownIng = await newIngredient('Lạ A3', 'g');
    await receive([
      [milk, 100],
      [small, 10],
    ]);
    await newItem('Món A3', 40000, [[milk, 200]]);
    await newItem('Món ít quế A3', 40000, [[small, 10]]);
    await noAlert(await receive([[milk, 104]]), 'tăng 4% < 5%');
    await noAlert(await receive([[milk, 90]]), 'giá giảm');
    await noAlert(ok(await call(admin, 'post', '/api/admin/stock-receipts', { lines: [{ ingredientId: milk, qty: 10 }] }), 201), 'dòng không có giá');
    await noAlert(await receive([[small, 14]]), 'tăng 40% nhưng lãi món gần như không đổi (dùng rất ít)');

    const other = await newIngredient('Sữa khác A3');
    await receive([[other, 100]]);
    await newItem('Món thiếu giá A3', 40000, [
      [other, 10],
      [unknownIng, 10],
    ]);
    const [a] = await alertsOf((await receive([[other, 120]])).receiptId);
    assert.equal(a.Severity, 'MEDIUM');
    assert.match(a.Title, /1 món chưa tính được lãi/);
    assert.deepEqual(a.detail.items, []);
    assert.deepEqual(
      a.detail.unknown.map((u) => [u.name, u.missing]),
      [['Món thiếu giá A3', ['Lạ A3']]],
    );
  });

  test('AC-064-04: tăng dần cộng dồn tới ngưỡng thì báo; đã báo rồi nhập lại cùng giá không báo; giá giảm thì mốc giảm theo', async () => {
    const milk = await newIngredient('Sữa A4');
    await receive([[milk, 100]]);
    await newItem('Món A4', 40000, [[milk, 200]]);
    await noAlert(await receive([[milk, 104]]), '+4%');
    const third = await receive([[milk, 108]]);
    const [a] = await alertsOf(third.receiptId);
    assert.deepEqual([a.detail.ingredients[0].oldCost, a.detail.ingredients[0].newCost], [100, 108], 'so với 100 ban đầu, không phải 104');
    await noAlert(await receive([[milk, 108]]), 'nhập lại cùng giá');
    await noAlert(await receive([[milk, 110]]), '+1,9% so với mốc 108');
    await noAlert(await receive([[milk, 90]]), 'giá giảm');
    const [b] = await alertsOf((await receive([[milk, 95]])).receiptId);
    assert.deepEqual([b.detail.ingredients[0].oldCost, b.detail.ingredients[0].newCost], [90, 95], 'mốc đã giảm theo còn 90');
  });

  test('AC-064-05: giá tăng trên 50% → hỏi nhập nhầm, không gợi ý giá, không dời mốc; phiếu sau vẫn giá đó → báo bình thường có giá gợi ý', async () => {
    const milk = await newIngredient('Sữa A5');
    await receive([[milk, 30]]);
    await newItem('Món A5', 40000, [[milk, 100]]);
    const typo = await receive([[milk, 360]]);
    const [a] = await alertsOf(typo.receiptId);
    assert.equal(a.Severity, 'HIGH');
    assert.equal(a.Title, `Giá Sữa A5 tăng 1.100% — có nhập nhầm không? (phiếu nhập #${typo.receiptId})`);
    assert.deepEqual([a.detail.items, a.detail.ingredients.length, a.detail.suspects[0].newCost], [[], 0, 360]);
    assert.deepEqual(await marksOf(milk), [], 'không dời mốc');
    assert.match((await mailsOf(a.AlertId))[0].BodyText, /nếu nhập nhầm, sửa phiếu nhập/);

    const [b] = await alertsOf((await receive([[milk, 360]])).receiptId);
    assert.deepEqual([b.detail.suspects, b.detail.ingredients[0].oldCost, b.detail.ingredients[0].newCost], [[], 30, 360]);
    assert.ok(b.detail.items[0].suggestKeepAmount > 40000, 'lần hai coi là giá thật, có gợi ý');
  });

  test('AC-064-06: sửa giá → cảnh báo cũ "Đã xử lý" + thư đính chính + tính lại; hủy phiếu → mốc trở về; sửa không đổi giá → không có gì mới', async () => {
    const milk = await newIngredient('Sữa A6');
    await receive([[milk, 100]]);
    await newItem('Món A6', 40000, [[milk, 200]]);
    const edit = (receipt, unitCost, reason) =>
      call(admin, 'put', `/api/admin/stock-receipts/${receipt.receiptId}`, { reason, lines: [{ ingredientId: milk, qty: 100_000, unitCost }] });
    const correction = (receiptId) => q1(`SELECT * FROM dbo.AlertOutbox WHERE DedupeKey LIKE 'COSTFIX:${receiptId}:%'`);
    const send = () => mailService.flushOnce(); // email cũ đã đi thì mới cần thư đính chính

    // Sửa không đổi giá: giữ nguyên cảnh báo, không có thư
    const same = await receive([[milk, 120]]);
    ok(
      await call(admin, 'put', `/api/admin/stock-receipts/${same.receiptId}`, {
        reason: 'sửa ghi chú',
        note: 'ghi chú mới',
        lines: [{ ingredientId: milk, qty: 100_000, unitCost: 120 }],
      }),
    );
    await send();
    ok(
      await call(admin, 'put', `/api/admin/stock-receipts/${same.receiptId}`, {
        reason: 'thêm dòng quên',
        lines: [
          { ingredientId: milk, qty: 100_000, unitCost: 120 },
          { ingredientId: await newIngredient('Quên giá A6', 'g'), qty: 5 },
        ],
      }),
    );
    const kept = await alertsOf(same.receiptId);
    assert.deepEqual([kept.length, kept[0].Status], [1, 'NEW']);
    assert.deepEqual(await correction(same.receiptId), []);

    // Hủy phiếu: mốc trở về 100 → nhập 120 lại báo
    ok(await call(admin, 'post', `/api/admin/stock-receipts/${same.receiptId}/void`, { reason: 'nhập nhầm phiếu' }));
    const voided = await alertsOf(same.receiptId);
    assert.equal(voided[0].Status, 'RESOLVED');
    assert.match(voided[0].Note, /đã hủy — cảnh báo này không còn hiệu lực/);
    assert.deepEqual(await marksOf(milk), []);
    assert.equal((await correction(same.receiptId)).length, 1);

    // Sửa về giá gần như cũ: cảnh báo cũ gỡ, không có cảnh báo mới
    const fixed = await receive([[milk, 120]]);
    const [old] = await alertsOf(fixed.receiptId);
    assert.deepEqual([old.detail.ingredients[0].oldCost, old.detail.ingredients[0].newCost], [100, 120], 'mốc đã trở về');
    await send();
    ok(await edit(fixed, 102, 'gõ nhầm'));
    const afterFix = await alertsOf(fixed.receiptId);
    assert.deepEqual(
      afterFix.map((a) => a.Status),
      ['RESOLVED'],
    );
    assert.match(afterFix[0].Note, /đã sửa giá/);
    const mail = await correction(fixed.receiptId);
    assert.equal(mail.length, 1);
    assert.match(mail[0].Subject, /Đính chính: phiếu nhập #\d+ đã sửa giá/);
    assert.match(mail[0].BodyText, /gõ nhầm/);

    // Sửa sang giá khác vẫn tăng: có cảnh báo mới theo giá đúng
    const raised = await receive([[milk, 120]]);
    ok(await edit(raised, 130, 'giá thật cao hơn'));
    const again = await alertsOf(raised.receiptId);
    assert.deepEqual(
      again.map((a) => a.Status),
      ['RESOLVED', 'NEW'],
    );
    assert.equal(again[1].detail.ingredients[0].newCost, 130);
    assert.deepEqual(
      (await marksOf(milk)).map((m) => [m.AlertId, Number(m.UnitCost)]),
      [[again[1].AlertId, 130]],
    );
  });

  test('AC-064-07: nhận theo đơn đặt cũng báo; tắt tức thì không có email; giờ yên lặng hoãn; che SĐT nhà cung cấp; lỗi cảnh báo không làm hỏng phiếu', async () => {
    const milk = await newIngredient('Sữa A7');
    await receive([[milk, 30]]);
    await newItem('Món A7', 40000, [[milk, 400]]);
    const sup = ok(
      await call(admin, 'post', '/api/admin/suppliers', {
        name: 'NCC A7',
        leadTimeDays: 1,
        deliveryDaysMask: 127,
        items: [{ ingredientId: milk, packUnitCode: 'hộp1l', isPreferred: true, lastPrice: 30000 }],
      }),
      201,
    );
    const po = ok(
      await call(admin, 'post', '/api/admin/purchase-orders', { supplierId: sup.supplierId, lines: [{ ingredientId: milk, orderedPacks: 5 }] }),
      201,
    );
    ok(await call(admin, 'post', `/api/admin/purchase-orders/${po.poId}/send`));
    const rc = ok(
      await call(staff, 'post', `/api/receiving/purchase-orders/${po.poId}/receive`, {
        lines: [{ poLineId: po.lines[0].poLineId, packs: 5, packPrice: 36000 }],
      }),
      201,
    );
    assert.equal(JSON.stringify(rc).includes('monthlyLoss'), false, 'nhân viên nhận hàng không thấy số liệu cảnh báo');
    const [viaPo] = await alertsOf(rc.receipt.receiptId);
    assert.deepEqual([viaPo.detail.ingredients[0].oldCost, viaPo.detail.ingredients[0].newCost], [30, 36]);
    assert.equal(viaPo.detail.supplier, 'NCC A7');

    await settings({ alertImmediate: false });
    const silent = await receive([[milk, 45]]);
    const [s] = await alertsOf(silent.receiptId);
    assert.ok(s, 'vẫn có cảnh báo trong app');
    assert.deepEqual(await mailsOf(s.AlertId), []);

    await quietNow();
    const quiet = await receive([[milk, 54]], { supplier: 'Anh Ba 0912345678' });
    const [q] = await alertsOf(quiet.receiptId);
    const [mail] = await mailsOf(q.AlertId);
    assert.ok(new Date(mail.NextAttemptAt).getTime() > Date.now() + 30 * 60_000, 'email bị hoãn tới hết giờ yên lặng');
    assert.equal(mail.BodyText.includes('0912345678'), false);
    assert.match(mail.BodyText, /Anh Ba \*\*\*/);
    assert.equal(q.detail.supplier, 'Anh Ba ***');
    await settings({ alertImmediate: true, alertQuietStart: '', alertQuietEnd: '' });

    await pool.request().query("EXEC sp_rename 'dbo.CostAlertMarks', 'CostAlertMarks_tam'");
    try {
      const broken = await receive([[milk, 70]]);
      assert.equal(broken.lines[0].unitCost, 70, 'phiếu vẫn lưu dù phần cảnh báo lỗi');
      assert.deepEqual((await q1(`SELECT Status FROM dbo.StockReceipts WHERE ReceiptId = ${broken.receiptId}`))[0].Status, 'POSTED');
      await noAlert(broken);
    } finally {
      await pool.request().query("EXEC sp_rename 'dbo.CostAlertMarks_tam', 'CostAlertMarks'");
    }
  });

  test('AC-064-08: ba ngưỡng có mặc định, lưu được, sai → 400; đổi ngưỡng → thư báo; ngưỡng mới có hiệu lực', async () => {
    const s = ok(await call(admin, 'get', '/api/admin/settings'));
    assert.deepEqual([s.alertCostRisePct, s.alertCostMarginDrop, s.alertCostMarginMin], [5, 2, 60]);
    for (const bad of [
      { alertCostRisePct: 0 },
      { alertCostRisePct: 101 },
      { alertCostMarginDrop: 0 },
      { alertCostMarginMin: -1 },
      { alertCostMarginMin: 101 },
      { alertCostRisePct: 'abc' },
    ]) {
      assert.equal((await call(admin, 'put', '/api/admin/settings', bad)).status, 400, JSON.stringify(bad));
    }
    const before = (await q1("SELECT MAX(OutboxId) AS m FROM dbo.AlertOutbox WHERE Kind = 'NOTICE'"))[0].m ?? 0;
    const saved = await settings({ alertCostRisePct: 30, alertCostMarginDrop: 10, alertCostMarginMin: 20 });
    assert.deepEqual([saved.alertCostRisePct, saved.alertCostMarginDrop, saved.alertCostMarginMin], [30, 10, 20]);
    const [notice] = await q1(`SELECT * FROM dbo.AlertOutbox WHERE Kind = 'NOTICE' AND OutboxId > ${before}`);
    assert.match(notice.BodyText, /Báo khi giá nhập tăng từ: 5% → 30%/);
    assert.match(notice.BodyText, /Tỷ lệ lãi tối thiểu: 60% → 20%/);

    const milk = await newIngredient('Sữa A8');
    await receive([[milk, 100]]);
    await newItem('Món A8', 40000, [[milk, 200]]);
    await noAlert(await receive([[milk, 120]]), 'tăng 20% < ngưỡng mới 30%');
    await settings({ alertCostRisePct: 5, alertCostMarginDrop: 2, alertCostMarginMin: 60 });
  });

  test('AC-064-09: nhân viên không đọc được cảnh báo, không nhận alert.created; quản lý nhận qua phòng admin', async () => {
    const milk = await newIngredient('Sữa A9');
    await receive([[milk, 100]]);
    await newItem('Món A9', 40000, [[milk, 200]]);
    assert.equal((await call(staff, 'get', '/api/admin/alerts?status=ALL')).status, 403);
    assert.equal((await call(staff, 'put', '/api/admin/settings', { alertCostRisePct: 50 })).status, 403);
    assert.equal((await call(lead, 'get', '/api/admin/alerts?status=ALL')).status, 403);
    const adminSock = await app.connect({ auth: { token: admin } });
    const staffSock = await app.connect({ auth: { token: staff } });
    const toAdmin = app.waitFor(adminSock, 'alert.created', (p) => p.alert.kind === 'COST_RISE' && /Sữa A9/.test(p.alert.title));
    const toStaff = app
      .waitFor(staffSock, 'alert.created', () => true, 800)
      .then(
        () => 'nhận',
        () => 'không nhận',
      );
    await receive([[milk, 120]]);
    assert.equal((await toAdmin).alert.detail.items[0].name, 'Món A9');
    assert.equal(await toStaff, 'không nhận');
  });
});

describe('Các trường hợp từ review G3 (F-064)', () => {
  test('AC-064-03: món vốn đã dưới mức tối thiểu: giá vốn tăng rất ít không báo; tụt đủ điểm thì báo mức vừa', async () => {
    const butter = await newIngredient('Bơ G1', 'g');
    const bread = await newIngredient('Bánh G1', 'g');
    await receive([
      [butter, 20],
      [bread, 100],
    ]);
    await newItem('Bánh mì G1', 25000, [
      [butter, 5],
      [bread, 150],
    ]);
    await noAlert(await receive([[butter, 22]]), 'lãi 39,6% → 39,6%: không vừa rơi xuống dưới mức, không tụt đủ điểm');
    const [a] = await alertsOf((await receive([[bread, 110]])).receiptId);
    assert.deepEqual([a.Severity, a.detail.items[0].crossed, a.detail.items[0].drop], ['MEDIUM', false, 6]);
  });

  test('AC-064-03: phiếu hàng tặng 0đ không làm tắt báo động và không bị coi là giá thật', async () => {
    const milk = await newIngredient('Sữa G2');
    const tea = await newIngredient('Trà G2', 'g');
    await receive([
      [milk, 30],
      [tea, 50],
    ]);
    await newItem('Món G2', 40000, [
      [milk, 400],
      [tea, 100],
    ]);
    await noAlert(await receive([[milk, 0]]), 'hàng tặng');
    const [a] = await alertsOf((await receive([[tea, 60]])).receiptId);
    assert.deepEqual([a.detail.items[0].oldCost, a.detail.items[0].newCost], [17000, 18000], 'sữa tính theo giá vốn bình quân, không phải 0đ');
    const [b] = await alertsOf((await receive([[milk, 36]])).receiptId);
    assert.deepEqual([b.detail.ingredients[0].oldCost, b.detail.ingredients[0].newCost], [30, 36], 'vẫn so với giá thật trước đó');
  });

  test('AC-064-03: giá tăng mạnh của nguyên liệu không món nào dùng không tạo cảnh báo', async () => {
    const cup = await newIngredient('Ly giấy G3', 'g');
    await receive([[cup, 100]]);
    await noAlert(await receive([[cup, 300]]));
  });

  test('AC-064-04: một phiếu rẻ bất thường không làm phiếu giá thường sau đó bị báo', async () => {
    const milk = await newIngredient('Sữa G4');
    await receive([[milk, 30]]);
    await newItem('Món G4', 40000, [[milk, 100]]);
    await noAlert(await receive([[milk, 14]]), 'khuyến mãi / gõ nhầm giá thấp');
    await noAlert(await receive([[milk, 30]]), 'về giá thường');
  });

  test('AC-064-05: giá nghi nhầm chưa sửa không làm sai lãi món ở phiếu nguyên liệu khác sau đó', async () => {
    const milk = await newIngredient('Sữa G5');
    const tea = await newIngredient('Trà G5', 'g');
    await receive([
      [milk, 30],
      [tea, 50],
    ]);
    await newItem('Trà sữa G5', 30000, [
      [milk, 150],
      [tea, 150],
    ]);
    await receive([[milk, 360]]);
    const [a] = await alertsOf((await receive([[tea, 60]])).receiptId);
    const [i] = a.detail.items;
    assert.deepEqual([i.oldCost, i.newCost, i.oldMargin, i.newMargin, i.suggestKeepMargin], [12000, 13500, 60, 55, 34000]);
  });

  test('AC-064-06: hủy phiếu đã báo trong khi phiếu sau cùng giá → phiếu sau được xét lại, không mất báo động', async () => {
    const milk = await newIngredient('Sữa G6');
    await receive([[milk, 100]]);
    await newItem('Món G6', 40000, [[milk, 200]]);
    const marked = await receive([[milk, 120]]);
    const next = await receive([[milk, 120]]);
    await noAlert(next, 'đã báo ở phiếu trước');
    ok(await call(admin, 'post', `/api/admin/stock-receipts/${marked.receiptId}/void`, { reason: 'phiếu trùng' }));
    assert.equal((await alertsOf(marked.receiptId))[0].Status, 'RESOLVED');
    const reviewed = await alertsOf(next.receiptId);
    assert.deepEqual(
      reviewed.map((a) => [a.Status, a.detail.ingredients[0].oldCost, a.detail.ingredients[0].newCost]),
      [['NEW', 100, 120]],
    );
    assert.deepEqual(
      (await marksOf(milk)).map((m) => [m.ReceiptId, Number(m.UnitCost)]),
      [[next.receiptId, 120]],
    );
    await noAlert(await receive([[milk, 120]]), 'đã báo lại rồi, không báo lần nữa');
  });

  test('AC-064-06: hủy lần báo mới hơn → mốc về lần báo trước; sửa phiếu cũ khi đã có phiếu mới hơn không tạo báo động theo giá cũ', async () => {
    const milk = await newIngredient('Sữa G7');
    await receive([[milk, 100]]);
    await newItem('Món G7', 40000, [[milk, 200]]);
    await receive([[milk, 120]]);
    const newer = await receive([[milk, 140]]);
    assert.equal((await alertsOf(newer.receiptId)).length, 1);
    ok(await call(admin, 'post', `/api/admin/stock-receipts/${newer.receiptId}/void`, { reason: 'nhầm' }));
    await noAlert(await receive([[milk, 120]]), 'mốc 120 của lần báo trước');

    const tea = await newIngredient('Trà G7', 'g');
    await receive([[tea, 100]]);
    await newItem('Món trà G7', 40000, [[tea, 200]]);
    const older = await receive([[tea, 102]]);
    await receive([[tea, 102]]);
    ok(
      await call(admin, 'put', `/api/admin/stock-receipts/${older.receiptId}`, { reason: 'sửa', lines: [{ ingredientId: tea, qty: 100_000, unitCost: 130 }] }),
    );
    await noAlert(older, 'giá hiện tại là giá phiếu mới hơn');
  });

  test('AC-064-06: email chưa gửi thì sửa phiếu xóa luôn email đó, không có thư đính chính', async () => {
    const milk = await newIngredient('Sữa G8');
    await receive([[milk, 100]]);
    await newItem('Món G8', 40000, [[milk, 200]]);
    await quietNow();
    const r = await receive([[milk, 120]]);
    const [a] = await alertsOf(r.receiptId);
    assert.equal((await mailsOf(a.AlertId)).length, 1);
    ok(
      await call(admin, 'put', `/api/admin/stock-receipts/${r.receiptId}`, { reason: 'gõ nhầm', lines: [{ ingredientId: milk, qty: 100_000, unitCost: 101 }] }),
    );
    await settings({ alertQuietStart: '', alertQuietEnd: '' });
    assert.deepEqual(await mailsOf(a.AlertId), []);
    assert.deepEqual(await q1(`SELECT 1 AS x FROM dbo.AlertOutbox WHERE DedupeKey LIKE 'COSTFIX:${r.receiptId}:%'`), []);
    assert.equal((await alertsOf(r.receiptId))[0].Status, 'RESOLVED');
  });

  test('AC-064-01: chạy lại sau lỗi giữa chừng (deadlock) không tạo trùng cảnh báo, mốc, email, không gỡ nhầm cảnh báo vừa tạo', async () => {
    const milk = await newIngredient('Sữa G9');
    await receive([[milk, 100]]);
    await newItem('Món G9', 40000, [[milk, 200]]);
    const r = await receive([[milk, 120]]);
    const before = ok(await call(admin, 'get', `/api/admin/stock-receipts/${r.receiptId}`));
    await alertService.onStockReceived(before);
    const [a, extra] = await alertsOf(r.receiptId);
    assert.equal(extra, undefined);
    assert.equal((await mailsOf(a.AlertId)).length, 1);
    assert.equal((await marksOf(milk)).length, 1);

    ok(
      await call(admin, 'put', `/api/admin/stock-receipts/${r.receiptId}`, {
        reason: 'giá đúng',
        lines: [{ ingredientId: milk, qty: 100_000, unitCost: 130 }],
      }),
    );
    const edited = ok(await call(admin, 'get', `/api/admin/stock-receipts/${r.receiptId}`));
    const [{ UserId: adminId }] = await q1("SELECT UserId FROM dbo.Users WHERE Username = 'admin'");
    await alertService.onReceiptRevised(before, edited, { userId: adminId });
    assert.deepEqual(
      (await alertsOf(r.receiptId)).map((x) => x.Status),
      ['RESOLVED', 'NEW'],
    );
    assert.equal((await marksOf(milk)).length, 1);
  });

  test('AC-064-07: tên món / nhà cung cấp chứa thẻ HTML được thoát trong email', async () => {
    const milk = await newIngredient('Sữa G10');
    await receive([[milk, 100]]);
    await newItem('<img src=x onerror=alert(1)>', 40000, [[milk, 200]]);
    const r = await receive([[milk, 120]], { supplier: '<script>alert(2)</script>' });
    const [a] = await alertsOf(r.receiptId);
    const [mail] = await mailsOf(a.AlertId);
    assert.equal(/<img|<script/.test(mail.BodyHtml), false);
    assert.match(mail.BodyHtml, /&lt;img src=x/);
    assert.match(mail.BodyHtml, /&lt;script&gt;/);
  });
});
