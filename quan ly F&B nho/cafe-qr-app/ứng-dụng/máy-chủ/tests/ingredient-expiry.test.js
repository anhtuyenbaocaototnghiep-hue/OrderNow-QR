// F-089 (TASK-109) — Kho nguyên liệu hiện hạn sử dụng: GET /api/admin/ingredients trả lô còn hàng gần hết hạn nhất của nguyên
// liệu theo lô (F-028): nextExpiry (ngày, giờ VN) · nextExpiryDays (âm = đã hết hạn) · nextExpiryQty (tổng các lô cùng ngày đó).
// SQL Server thật.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let app, api, pool, admin, staff, ing;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const addDaysVn = (n) => new Date(Date.parse(`${todayVn()}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
const MILK = 'Sữa tươi';
const expiryOf = async (name) => {
  const i = ok(await call(admin, 'get', '/api/admin/ingredients')).find((x) => x.name === name);
  return [i.nextExpiry, i.nextExpiryDays, i.nextExpiryQty];
};
const receive = async (lines) => ok(await call(admin, 'post', '/api/admin/stock-receipts', { lines }), 201);
const trackLots = async (on) => ok(await call(admin, 'put', `/api/admin/ingredients/${ing[MILK]}/advanced`, { kind: 'RAW', wastePercent: 0, trackLots: on }));

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ing = Object.fromEntries((await pool.request().query('SELECT IngredientId, Name FROM dbo.Ingredients')).recordset.map((x) => [x.Name, x.IngredientId]));
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 0 }), 201);
});

after(() => app?.close());

describe('Hạn sử dụng ở Kho nguyên liệu (F-089)', () => {
  test('AC-089-01: danh sách nguyên liệu trả lô còn hàng gần hết hạn nhất — ngày, số ngày còn lại (âm = đã hết hạn), lượng của các lô cùng ngày; không theo lô hoặc lô không ghi hạn → không có hạn', async () => {
    assert.deepEqual(await expiryOf(MILK), [null, null, 0], 'chưa theo lô');
    await trackLots(true);
    assert.deepEqual(await expiryOf(MILK), [null, null, 0], 'tồn có sẵn thành lô mở đầu không ghi hạn');

    await receive([{ ingredientId: ing[MILK], qty: 500, unitCost: 30, expiryDate: addDaysVn(8), lotCode: 'B' }]);
    assert.deepEqual(await expiryOf(MILK), [addDaysVn(8), 8, 500]);
    // (mỗi phiếu nhập một dòng / nguyên liệu → hai phiếu)
    await receive([{ ingredientId: ing[MILK], qty: 300, unitCost: 30, expiryDate: addDaysVn(2), lotCode: 'A1' }]);
    await receive([{ ingredientId: ing[MILK], qty: 200, unitCost: 30, expiryDate: addDaysVn(2), lotCode: 'A2' }]);
    assert.deepEqual(await expiryOf(MILK), [addDaysVn(2), 2, 500], 'hai lô cùng ngày gần nhất → cộng lượng');

    await receive([{ ingredientId: ing[MILK], qty: 100, unitCost: 30, expiryDate: addDaysVn(-1), lotCode: 'X' }]);
    assert.deepEqual(await expiryOf(MILK), [addDaysVn(-1), -1, 100], 'lô đã hết hạn đứng đầu, số ngày âm');

    // Nguyên liệu khác không bị ảnh hưởng
    assert.deepEqual(await expiryOf('Sữa đặc'), [null, null, 0]);
  });

  test('AC-089-02: hủy lô hết hạn / dùng hết các lô gần hạn (FEFO) → hạn chuyển sang lô kế tiếp; tắt theo lô → không còn hạn', async () => {
    const x = ok(await call(staff, 'get', '/api/lots/expiring?days=3')).find((l) => l.lotCode === 'X');
    ok(await call(staff, 'post', `/api/lots/${x.lotId}/write-off`, {}), 201);
    assert.deepEqual(await expiryOf(MILK), [addDaysVn(2), 2, 500], 'lô X đã hủy (đóng) → không tính');

    ok(await call(staff, 'post', '/api/waste', { ingredientId: ing[MILK], qty: 500, reason: 'QUALITY' }), 201); // FEFO: A1 + A2
    assert.deepEqual(await expiryOf(MILK), [addDaysVn(8), 8, 500], 'lô hết hàng → sang lô B');

    await trackLots(false);
    assert.deepEqual(await expiryOf(MILK), [null, null, 0]);
  });
});
