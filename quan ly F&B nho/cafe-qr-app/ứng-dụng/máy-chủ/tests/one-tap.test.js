// F-076 — quy trình 1 chạm ở màn Đơn hàng (ADR-034): cài đặt, /auth/me, thời gian làm của đơn "nhận + xong" cùng lúc. SQL Server thật.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const q1 = async (text) => (await pool.request().query(text)).recordset;

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 500_000 }), 201);
});

after(() => app?.close());

describe('Quy trình 1 chạm (ADR-034)', () => {
  test('AC-076-01: cài đặt "Quy trình 1 chạm" (mặc định bật; dữ liệu cũ của test để tắt) — quản lý bật / tắt, máy quầy đọc qua /auth/me; nhân viên không đổi được', async () => {
    await q1("DELETE dbo.Settings WHERE SettingKey = 'pos.one_tap'");
    ok(await call(admin, 'put', '/api/admin/settings', { shopName: 'Quán thử' })); // lưu cài đặt khác → bộ nhớ đệm đọc lại
    assert.equal(ok(await call(admin, 'get', '/api/admin/settings')).oneTap, true, 'chưa đặt → mặc định bật');
    assert.equal(ok(await call(admin, 'put', '/api/admin/settings', { oneTap: false })).oneTap, false);
    assert.deepEqual(ok(await call(staff, 'get', '/api/auth/me')).pos, { oneTap: false });
    ok(await call(admin, 'put', '/api/admin/settings', { oneTap: true }));
    assert.deepEqual(ok(await call(staff, 'get', '/api/auth/me')).pos, { oneTap: true });
    assert.equal((await call(staff, 'put', '/api/admin/settings', { oneTap: false })).status, 403);
  });

  test('AC-076-02: thời gian làm món — đơn nhận + xong cùng lúc (1 chạm) tính từ lúc có thể bắt đầu (đơn tới / đơn trước vừa xong) tới lúc xong, không ra 0 giây; đơn 3 bước vẫn tính từ lúc tiếp nhận', async () => {
    const cat = (await q1('SELECT TOP 1 CategoryId FROM dbo.Categories ORDER BY CategoryId'))[0].CategoryId;
    const item = ok(await call(admin, 'post', '/api/admin/menu-items', { categoryId: cat, name: 'Trà thử 1 chạm', price: 20000 }), 201);
    const sell = async () =>
      ok(await call(staff, 'post', '/api/orders/takeaway', { items: [{ menuItemId: item.menuItemId, quantity: 1 }], amountReceived: 20000 }), 201).order
        .orderId;
    const a = await sell();
    const b = await sell();
    ok(await call(staff, 'post', `/api/orders/${a}/complete`));
    ok(await call(staff, 'post', `/api/orders/${b}/complete`));
    // Mốc giờ biết trước (giây trước "bây giờ", trước mọi đơn mẫu khác trong 30 ngày không chen giữa hai đơn này):
    //   A 3 bước: tới −900, tiếp nhận −600, xong −480 → 120 giây
    //   B 1 chạm: tới −500, nhận −300, xong −298 → bắt đầu từ lúc A xong (−480, muộn hơn lúc B tới) → 182 giây
    const at = (s) => `DATEADD(SECOND, ${s}, SYSUTCDATETIME())`;
    await q1(`UPDATE dbo.Orders SET CreatedAt = ${at(-900)}, AcceptedAt = ${at(-600)}, CompletedAt = ${at(-480)} WHERE OrderId = ${a};
              UPDATE dbo.Orders SET CreatedAt = ${at(-500)}, AcceptedAt = ${at(-300)}, CompletedAt = ${at(-298)} WHERE OrderId = ${b};
              UPDATE dbo.Orders SET CompletedAt = DATEADD(SECOND, -2000, CompletedAt)
              WHERE Status = 'COMPLETED' AND OrderId NOT IN (${a}, ${b}) AND CompletedAt > ${at(-1000)};`);
    const run = ok(await call(admin, 'post', '/api/admin/jobs/prep-stats/run'));
    assert.equal(run.status, 'OK', JSON.stringify(run));
    const stat = ok(await call(admin, 'get', '/api/admin/prep-stats')).find((x) => x.name === 'Trà thử 1 chạm');
    assert.equal(stat.sampleCount, 2);
    assert.equal(stat.medianSeconds, 151, 'trung vị của 120 và 182 giây');
  });
});
