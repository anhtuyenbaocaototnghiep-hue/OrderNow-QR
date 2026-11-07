// F-075 — hạn dùng nguyên liệu: hộp đang mở (hạn sau khi mở), rủi ro hết hạn quy ra tiền, món nên mời, cảnh báo, tiền hủy theo tháng
// (ADR-033). SQL Server thật.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let app, api, pool, admin, staff, lead, ing, flushAudit;
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
const row = async (name) => (await q1(`SELECT * FROM dbo.Ingredients WHERE Name = N'${name}'`))[0];
const COFFEE = 'Cà phê cốt';
const MILK = 'Sữa đặc';
const advanced = (name, extra) => call(admin, 'put', `/api/admin/ingredients/${ing[name]}/advanced`, { kind: 'RAW', wastePercent: 0, ...extra });
let menu;
async function sell(itemName, quantity = 1) {
  const r = ok(await call(staff, 'post', '/api/orders/takeaway', { items: [{ menuItemId: menu[itemName], quantity }], amountReceived: 5_000_000 }), 201);
  ok(await call(staff, 'post', `/api/orders/${r.order.orderId}/complete`));
}
const addDaysVn = (n) => new Date(Date.parse(`${todayVn()}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  ok(await call(admin, 'post', '/api/admin/users', { username: 'lead1', password: 'Pass@123', fullName: 'Trưởng ca Minh', role: 'MANAGER' }), 201);
  staff = await app.login('staff1', 'Staff@123');
  lead = await app.login('lead1', 'Pass@123');
  ing = Object.fromEntries((await q1('SELECT IngredientId, Name FROM dbo.Ingredients')).map((x) => [x.Name, x.IngredientId]));
  menu = await app.ids();
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 500_000 }), 201);
  // cà phê cốt có giá vốn (50đ/ml) để các con số tiền có nghĩa
  ok(await call(admin, 'post', '/api/admin/stock-receipts', { lines: [{ ingredientId: ing[COFFEE], qty: 1000, unitCost: 50 }] }), 201);
  ({ flushAudit } = await import('../src/middleware/audit.js'));
});

after(() => app?.close());

describe('Hộp đang mở (ADR-033 D-147)', () => {
  test('AC-075-01: đặt dung tích hộp + hạn sau khi mở (cả hai hoặc không); bán → tự mở hộp, trừ dần phần còn trong hộp, dùng hết hộp thì không còn hộp mở, dùng vượt thì mở thêm hộp; tắt → xóa trạng thái', async () => {
    fail(await advanced(COFFEE, { packSize: 100 }), 400, 'VALIDATION_ERROR');
    const saved = ok(await advanced(COFFEE, { packSize: 100, openShelfHours: 24 }));
    assert.deepEqual([saved.packSize, saved.openShelfHours, saved.openLeft], [100, 24, 0]);

    await sell('Cà phê đen'); // 25 ml → mở hộp 100, còn 75
    let r = await row(COFFEE);
    assert.equal(Number(r.OpenLeft), 75);
    assert.ok(Math.abs(new Date(r.OpenedAt).getTime() - Date.now()) < 120_000, 'mở lúc bán');
    await sell('Cà phê đen', 3); // 75 ml → vừa hết hộp
    r = await row(COFFEE);
    assert.deepEqual([Number(r.OpenLeft), r.OpenedAt], [0, null]);
    await sell('Cà phê đen', 5); // 125 ml → mở 2 hộp, hộp sau còn 75
    assert.equal(Number((await row(COFFEE)).OpenLeft), 75);
    const list = ok(await call(admin, 'get', '/api/admin/ingredients'));
    assert.equal(list.find((x) => x.name === COFFEE).openLeft, 75);

    ok(await advanced(COFFEE, { packSize: null, openShelfHours: null }));
    r = await row(COFFEE);
    assert.deepEqual([r.PackSize, Number(r.OpenLeft), r.OpenedAt], [null, 0, null]);
    await sell('Cà phê đen');
    assert.equal(Number((await row(COFFEE)).OpenLeft), 0, 'tắt rồi thì không theo dõi');
  });

  test('AC-075-02: hộp mở quá hạn sau khi mở → phần còn không tính là còn hàng; nhân viên bỏ phần đó → phiếu hủy EXPIRED, trừ kho đúng phần còn, có nhật ký; bỏ lần nữa → 409 NO_OPEN_PACK', async () => {
    ok(await advanced(COFFEE, { packSize: 100, openShelfHours: 24 }));
    await sell('Cà phê đen'); // còn 75
    await q1(`UPDATE dbo.Ingredients SET OpenedAt = DATEADD(HOUR, -25, SYSUTCDATETIME()) WHERE IngredientId = ${ing[COFFEE]}`);
    const ops = ok(await call(staff, 'get', '/api/ops/ingredients'));
    const coffee = ops.find((x) => x.ingredientId === ing[COFFEE]);
    assert.equal(coffee.expiredQty, 75, 'phần còn của hộp quá hạn không tính vào khả dụng');

    const staffView = ok(await call(staff, 'get', '/api/expiry/risk'));
    const item = staffView.items.find((x) => x.kind === 'OPEN' && x.ingredientId === ing[COFFEE]);
    assert.deepEqual([item.qty, item.expired, item.when], [75, true, 'hộp đang mở đã quá hạn']);
    assert.equal(item.value, undefined, 'nhân viên không thấy giá vốn');
    assert.equal(staffView.totalValue, undefined);
    const adminView = ok(await call(admin, 'get', '/api/expiry/risk'));
    const avg = Number((await row(COFFEE)).AvgCost);
    assert.equal(avg, 50);
    assert.equal(adminView.items.find((x) => x.kind === 'OPEN' && x.ingredientId === ing[COFFEE]).value, 3750, '75 ml × 50đ');

    const before = Number((await row(COFFEE)).StockQty);
    const r = ok(await call(staff, 'post', `/api/ingredients/${ing[COFFEE]}/discard-open`, {}));
    assert.equal(r.qty, 75);
    const after = await row(COFFEE);
    assert.deepEqual([Number(after.StockQty), Number(after.OpenLeft), after.OpenedAt], [before - 75, 0, null]);
    const waste = (await q1(`SELECT TOP 1 Reason, Qty FROM dbo.WasteLogs WHERE IngredientId = ${ing[COFFEE]} ORDER BY WasteId DESC`))[0];
    assert.deepEqual([waste.Reason, Number(waste.Qty)], ['EXPIRED', 75]);
    fail(await call(staff, 'post', `/api/ingredients/${ing[COFFEE]}/discard-open`, {}), 409, 'NO_OPEN_PACK');
    await flushAudit();
    assert.equal((await q1("SELECT COUNT(*) AS n FROM dbo.AuditLogs WHERE Action = 'inventory.discard-open'"))[0].n, 1);
    const again = ok(await call(staff, 'get', '/api/ops/ingredients'));
    assert.equal(again.find((x) => x.ingredientId === ing[COFFEE]).expiredQty, 0);
  });
});

describe('Rủi ro quy ra tiền, món nên mời, cảnh báo, tiền hủy theo tháng (ADR-033 D-149…D-152)', () => {
  let lotId;
  test('AC-075-03: hộp mở sắp quá hạn + lô hết hạn ngày mai → danh sách rủi ro có số tiền (chỉ quản lý), món nên mời là món đang bán dùng các nguyên liệu đó; lô đã hết hạn không gợi ý mời; trang Hôm nay có rủi ro + tiền đã hủy tháng này', async () => {
    await sell('Cà phê đen'); // mở hộp mới, còn 75
    await q1(`UPDATE dbo.Ingredients SET OpenedAt = DATEADD(HOUR, -19, SYSUTCDATETIME()) WHERE IngredientId = ${ing[COFFEE]}`); // còn ~5 giờ
    ok(await advanced(MILK, { trackLots: true }));
    ok(
      await call(admin, 'post', '/api/admin/stock-receipts', {
        supplier: 'NCC Sữa An Phát',
        lines: [{ ingredientId: ing[MILK], qty: 500, unitCost: 100, expiryDate: addDaysVn(1), lotCode: 'SD-01' }],
      }),
      201,
    );
    lotId = (await q1(`SELECT LotId FROM dbo.IngredientLots WHERE LotCode = 'SD-01'`))[0].LotId;

    const r = ok(await call(admin, 'get', '/api/expiry/risk'));
    const lot = r.items.find((x) => x.kind === 'LOT' && x.lotId === lotId);
    assert.deepEqual([lot.qty, lot.when, lot.value, lot.expired], [500, 'hết hạn ngày mai', 50_000, false]);
    const pack = r.items.find((x) => x.kind === 'OPEN' && x.ingredientId === ing[COFFEE]);
    assert.match(pack.when, /^hộp đang mở còn \d giờ$/);
    assert.equal(
      r.totalValue,
      r.items.reduce((s, x) => s + x.value, 0),
    );
    const names = r.pushItems.map((p) => p.name);
    assert.ok(names.includes('Cà phê đen') && names.includes('Cà phê sữa'), JSON.stringify(names));
    const den = r.pushItems.find((p) => p.name === 'Cà phê đen');
    assert.deepEqual(
      den.because.map((b) => b.name),
      [COFFEE],
    );
    assert.ok(r.pushItems.find((p) => p.name === 'Cà phê sữa').because.some((b) => b.name === MILK && b.when === 'hết hạn ngày mai'));
    assert.ok(
      r.pushItems.every((p) => p.because.every((b) => !/đã/.test(b.when))),
      'không gợi ý món theo nguyên liệu đã hết hạn',
    );

    const today = ok(await call(admin, 'get', '/api/dashboard/today'));
    assert.equal(today.expiry.totalValue, r.totalValue);
    assert.ok(today.expiry.wasteThisMonth.total > 0, 'đã bỏ hộp cà phê ở AC-075-02');
    const leadToday = ok(await call(lead, 'get', '/api/dashboard/today'));
    assert.equal(leadToday.expiry.totalValue, undefined);
    assert.ok(leadToday.expiry.items.every((x) => x.value === undefined));
    assert.deepEqual(
      leadToday.expiry.pushItems.map((p) => p.name),
      names,
    );
  });

  test('AC-075-04: 06:00 có cảnh báo EXPIRY_RISK (một lần mỗi ngày); tiền hủy vì hết hạn trong tháng theo nguyên liệu và nhà cung cấp (lô từ phiếu nhập; không theo lô → không rõ); tháng sai → 400', async () => {
    ok(await call(admin, 'post', '/api/admin/jobs/lot-expiry/run'));
    ok(await call(admin, 'post', '/api/admin/jobs/lot-expiry/run'));
    const alerts = await q1("SELECT Title FROM dbo.Alerts WHERE Kind = 'EXPIRY_RISK'");
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].Title, /trị giá [\d.]+đ/);

    ok(await call(staff, 'post', `/api/lots/${lotId}/write-off`, {}), 201);
    const month = todayVn().slice(0, 7);
    const w = ok(await call(admin, 'get', `/api/admin/expiry/waste?month=${month}`));
    const milk = w.byIngredient.find((x) => x.name === MILK);
    assert.deepEqual([milk.qty, milk.cost], [500, 50_000]);
    assert.deepEqual(
      w.byIngredient.filter((x) => x.name === COFFEE).map((x) => [x.qty, x.cost]),
      [[75, 3750]],
    );
    assert.equal(w.bySupplier.find((x) => x.name === 'NCC Sữa An Phát').cost, 50_000);
    assert.ok(
      w.bySupplier.some((x) => x.name === null),
      'cà phê không theo lô → không rõ nhà cung cấp',
    );
    assert.equal(
      w.total,
      w.byIngredient.reduce((s, x) => s + x.cost, 0),
    );
    fail(await call(admin, 'get', '/api/admin/expiry/waste?month=2026-13'), 400, 'VALIDATION_ERROR');
    fail(await call(staff, 'get', `/api/admin/expiry/waste?month=${month}`), 403, 'FORBIDDEN');
  });
});
