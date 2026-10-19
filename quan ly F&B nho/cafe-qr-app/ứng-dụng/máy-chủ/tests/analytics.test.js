// Giai đoạn 8 — ADR-006: menu engineering (F-041, D-30), giờ cao điểm / dự báo doanh thu / so sánh kỳ / theo bàn (F-042),
// dashboard chủ quán + bảng tổng hợp ngày (F-043, D-32). Unit (hàm thuần) + integration trên SQL Server thật.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';
import { classifyMenu, flagTables, heatmapMatrix, pctChange, revenueForecast, weekdayIndex } from '../src/domain/analytics.js';

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const utcAt = (vnDate, hh, mm = 0) =>
  new Date(Date.parse(`${vnDate}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`) - 7 * 3600e3).toISOString();

describe('Hàm thuần phân tích (F-041, F-042)', () => {
  test('menu engineering: 8 món số liệu biết trước → đúng 4 nhóm; món < 5 lần → Chưa đủ dữ liệu', () => {
    const row = (name, qty, price, unitCogs) => ({ name, qty, revenue: qty * price, cogs: qty * unitCogs });
    const { items, medianQty, medianMarginPerUnit } = classifyMenu([
      row('A', 40, 25000, 5000),
      row('B', 30, 29000, 15000),
      row('C', 10, 32000, 8000),
      row('D', 8, 39000, 30000),
      row('E', 35, 35000, 25000),
      row('F', 6, 25000, 5000),
      row('G', 3, 10000, 4000),
      row('H', 20, 25000, 20000),
    ]);
    const cls = Object.fromEntries(items.map((i) => [i.name, i.class]));
    assert.equal(medianQty, 20);
    assert.equal(medianMarginPerUnit, 14000);
    assert.deepEqual(cls, { A: 'STAR', B: 'STAR', C: 'PUZZLE', D: 'DOG', E: 'PLOWHORSE', F: 'PUZZLE', G: 'INSUFFICIENT', H: 'PLOWHORSE' });
    assert.match(items.find((i) => i.name === 'G').advice, /Chưa đủ dữ liệu/);
  });

  test('heatmap 7×24: Thứ Hai = hàng 0; dự báo WMA 0,4/0,3/0,2/0,1 ± độ lệch chuẩn; % thay đổi; cờ bàn ngồi lâu – doanh thu thấp', () => {
    assert.equal(weekdayIndex('2026-10-12'), 0); // Thứ Hai
    assert.equal(weekdayIndex('2026-10-17'), 5); // Thứ Bảy
    const h = heatmapMatrix([
      { date: '2026-10-17', hour: 10, value: 5 },
      { date: '2026-10-10', hour: 10, value: 3 },
      { date: '2026-10-12', hour: 8, value: 2 },
    ]);
    assert.equal(h.matrix[5][10], 8);
    assert.equal(h.max, 8);
    const today = '2026-10-18';
    const daily = new Map([
      [addDays(today, -7), 100000],
      [addDays(today, -14), 200000],
      [addDays(today, -21), 300000],
      [addDays(today, -28), 400000],
    ]);
    const [f0] = revenueForecast(daily, today, 1, addDays);
    assert.equal(f0.forecast, 200000);
    assert.equal(f0.samples, 4);
    assert.equal(f0.high - f0.forecast, Math.round(Math.sqrt(((100000 - 250000) ** 2 + (200000 - 250000) ** 2 + 50000 ** 2 + 150000 ** 2) / 3)));
    assert.equal(pctChange(120, 100), 20);
    assert.equal(pctChange(5, 0), null);
    const { tables } = flagTables([
      { tableId: 1, sessions: 1, minutes: 30, revenue: 100000 },
      { tableId: 2, sessions: 1, minutes: 60, revenue: 150000 },
      { tableId: 3, sessions: 1, minutes: 180, revenue: 60000 },
      { tableId: 4, sessions: 0, minutes: 0, revenue: 0 },
    ]);
    assert.deepEqual(
      tables.map((t) => [t.tableId, t.flag]),
      [
        [1, false],
        [2, false],
        [3, true],
        [4, false],
      ],
    );
    assert.equal(tables[2].revenuePerHour, 20000);
  });
});

describe('Phân tích + dashboard trên dữ liệu thật (F-041, F-042, F-043)', () => {
  let app, api, pool, admin, staff, lead, ids, tableIds, staffId;
  const q1 = async (s) => (await pool.request().query(s)).recordset;
  const today = todayVn();

  before(async () => {
    app = await startApp();
    ({ api, pool } = app);
    admin = await app.login('admin', 'Admin@123');
    staff = await app.login('staff1', 'Staff@123');
    assert.equal(
      (await api.post('/api/admin/users').set(auth(admin)).send({ username: 'lead8', password: 'Pass@123', fullName: 'Trưởng ca 8', role: 'MANAGER' })).status,
      201,
    );
    lead = await app.login('lead8', 'Pass@123');
    ids = await app.ids();
    tableIds = Object.fromEntries((await q1('SELECT TableId, Code FROM dbo.Tables')).map((t) => [t.Code, t.TableId]));
    staffId = (await q1("SELECT UserId FROM dbo.Users WHERE Username = 'staff1'"))[0].UserId;
  });
  after(() => app.close());

  let seq = 0;
  async function completedOrder(menuItemName, qty, unitPrice, unitCogs, vnDate, hour = 10) {
    seq += 1;
    const at = utcAt(vnDate, hour, seq % 50);
    await pool.request().query(`
      DECLARE @O INT;
      INSERT dbo.Orders (OrderCode, Type, Status, TotalAmount, CreatedAt, CompletedAt)
      VALUES ('AN${String(seq).padStart(6, '0')}', 'TAKE_AWAY', 'COMPLETED', ${qty * unitPrice}, '${at}', '${at}');
      SET @O = SCOPE_IDENTITY();
      INSERT dbo.OrderItems (OrderId, MenuItemId, Quantity, UnitPrice, CogsAmount) VALUES (@O, ${ids[menuItemName]}, ${qty}, ${unitPrice}, ${qty * unitCogs});`);
  }
  async function payment(amount, vnDate, hour = 12, sessionId = null) {
    const at = utcAt(vnDate, hour);
    if (sessionId) {
      await pool
        .request()
        .query(
          `INSERT dbo.Payments (SessionId, AmountDue, AmountReceived, ReceivedBy, PaidAt) VALUES ('${sessionId}', ${amount}, ${amount}, ${staffId}, '${at}')`,
        );
      return;
    }
    seq += 1;
    await pool.request().query(`
      DECLARE @O INT;
      INSERT dbo.Orders (OrderCode, Type, Status, PaymentStatus, PaymentMethod, TotalAmount, CreatedAt, PaidAt, CompletedAt)
      VALUES ('PY${String(seq).padStart(6, '0')}', 'TAKE_AWAY', 'COMPLETED', 'PAID', 'CASH', ${amount}, '${at}', '${at}', '${at}');
      SET @O = SCOPE_IDENTITY();
      INSERT dbo.Payments (OrderId, AmountDue, AmountReceived, ReceivedBy, PaidAt) VALUES (@O, ${amount}, ${amount}, ${staffId}, '${at}');`);
  }

  test('menu engineering 30 ngày: đúng 4 nhóm theo trung vị; món bán < 5 lần → Chưa đủ dữ liệu; ghim món vào gợi ý; trưởng ca → 403', async () => {
    const d = addDays(today, -3);
    for (const [name, qty, price, cogs] of [
      ['Cà phê đen', 40, 25000, 5000],
      ['Cà phê sữa', 30, 29000, 15000],
      ['Bạc xỉu', 10, 32000, 8000],
      ['Latte', 8, 39000, 30000],
      ['Trà đào', 35, 35000, 25000],
      ['Sữa tươi đường', 6, 25000, 5000],
      ['Nước suối', 3, 10000, 4000],
      ['Bánh croissant', 20, 25000, 20000],
    ]) {
      await completedOrder(name, qty, price, cogs, d);
    }
    const r = await api.get('/api/admin/reports/menu-engineering').set(auth(admin));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const cls = Object.fromEntries(r.body.items.map((i) => [i.name, i.class]));
    assert.deepEqual(cls, {
      'Cà phê đen': 'STAR',
      'Cà phê sữa': 'STAR',
      'Bạc xỉu': 'PUZZLE',
      Latte: 'DOG',
      'Trà đào': 'PLOWHORSE',
      'Sữa tươi đường': 'PUZZLE',
      'Nước suối': 'INSUFFICIENT',
      'Bánh croissant': 'PLOWHORSE',
    });
    assert.equal(r.body.estimatedCogs, false);
    const pin = await api.post('/api/admin/reports/menu-engineering/pin').set(auth(admin)).send({ menuItemId: ids['Bạc xỉu'] });
    assert.equal(pin.status, 200, JSON.stringify(pin.body));
    const sug = await api.get('/api/admin/suggestions').set(auth(admin));
    assert.equal(sug.body.items.find((i) => i.menuItemId === ids['Bạc xỉu']).isPinned, true);
    assert.notEqual(sug.body.mode, 'AUTO');
    assert.equal((await api.get('/api/admin/reports/menu-engineering').set(auth(lead))).status, 403);
  });

  test('heatmap: đơn dày 10–11 h Thứ Bảy → ô (T7, 10h) đậm nhất; doanh thu theo giờ thu tiền', async () => {
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    const lastSat = addDays(today, -((dow - 5 + 7) % 7 || 7));
    for (let i = 0; i < 12; i += 1) await completedOrder('Cà phê đen', 1, 25000, 5000, lastSat, 10);
    await completedOrder('Cà phê đen', 1, 25000, 5000, addDays(lastSat, -2), 15);
    const r = await api.get(`/api/admin/reports/heatmap?from=${addDays(lastSat, -6)}&to=${lastSat}&metric=orders`).set(auth(admin));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const flat = r.body.matrix.flatMap((row, d) => row.map((v, h) => ({ d, h, v })));
    const top = flat.sort((a, b) => b.v - a.v)[0];
    assert.deepEqual([top.d, top.h], [5, 10]);
    assert.ok(r.body.max >= 12);
    assert.equal((await api.get(`/api/admin/reports/heatmap?from=${today}&to=${addDays(today, -400)}`).set(auth(admin))).status, 400);
  });

  test('dự báo doanh thu: hôm nay = WMA 4 cùng thứ gần nhất (thuần, đã trừ hoàn) ± 1 độ lệch chuẩn', async () => {
    for (const [w, amount] of [
      [1, 100000],
      [2, 200000],
      [3, 300000],
      [4, 400000],
    ]) {
      await payment(amount, addDays(today, -7 * w));
    }
    const r = await api.get('/api/admin/reports/revenue-forecast?days=7').set(auth(admin));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.forecast.length, 7);
    assert.equal(r.body.forecast[0].date, today);
    assert.equal(r.body.forecast[0].forecast, 200000);
    assert.ok(r.body.forecast[0].low < 200000 && r.body.forecast[0].high > 200000);
    assert.ok(r.body.history.length >= 28 - 1);
  });

  test('so sánh tuần: số liệu kỳ này / kỳ trước khớp tính tay; % thay đổi đúng công thức', async () => {
    const r = await api.get('/api/admin/reports/compare?period=week&offset=1').set(auth(admin));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const { current, previous, change } = r.body;
    const sum = async (from, to) =>
      Number(
        (await q1(`SELECT ISNULL(SUM(AmountDue), 0) AS V FROM dbo.Payments WHERE PaidAt >= '${utcAt(from, 0)}' AND PaidAt < '${utcAt(addDays(to, 1), 0)}'`))[0]
          .V,
      );
    assert.equal(current.revenueNet, await sum(current.from, current.to));
    assert.equal(previous.revenueNet, await sum(previous.from, previous.to));
    assert.equal(change.revenueNet, pctChange(current.revenueNet, previous.revenueNet));
    assert.equal(r.body.partial, false);
    const now = await api.get('/api/admin/reports/compare?period=month').set(auth(admin));
    assert.equal(now.body.current.to, today);
  });

  test('theo bàn: bàn ngồi 3 giờ chỉ 60.000đ bị gắn cờ "ngồi lâu – doanh thu thấp"', async () => {
    const d = addDays(today, -2);
    const sess = async (code, minutes, amount) => {
      const open = utcAt(d, 9);
      const close = new Date(Date.parse(open) + minutes * 60e3).toISOString();
      const id = (
        await q1(
          `INSERT dbo.Sessions (TableId, Status, OpenedAt, ClosedAt, ClosedBy) OUTPUT inserted.SessionId VALUES (${tableIds[code]}, 'CLOSED', '${open}', '${close}', ${staffId})`,
        )
      )[0].SessionId;
      await payment(amount, d, 11, id);
    };
    await sess('01', 30, 100000);
    await sess('02', 60, 150000);
    await sess('03', 180, 60000);
    const r = await api.get(`/api/admin/reports/tables?from=${d}&to=${d}`).set(auth(admin));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const byCode = Object.fromEntries(r.body.tables.map((t) => [t.code, t]));
    assert.deepEqual([byCode['03'].flag, byCode['01'].flag, byCode['02'].flag], [true, false, false]);
    assert.equal(byCode['03'].avgMinutes, 180);
    assert.equal(byCode['03'].revenuePerHour, 20000);
  });

  test('dashboard: job 00:30 tạo dòng tổng hợp hôm qua; số khớp báo cáo; trưởng ca không thấy lãi; nhân viên → 403; "Tính lại hôm nay"', async () => {
    const y = addDays(today, -1);
    await payment(80000, y, 9);
    await payment(20000, y, 15);
    const job = await api.post('/api/admin/jobs/daily-summary/run').set(auth(admin));
    assert.equal(job.status, 200, JSON.stringify(job.body));
    const row = (await q1(`SELECT * FROM dbo.DailySummaries WHERE SummaryDate = '${y}'`))[0];
    assert.ok(row, 'phải có dòng tổng hợp hôm qua');
    const pnl = await api.get(`/api/admin/reports/pnl?from=${y}&to=${y}`).set(auth(admin));
    assert.equal(Number(row.RevenueNet), pnl.body.revenueNet);
    const a = await api.get('/api/dashboard/today').set(auth(admin));
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(a.body.date, y);
    assert.equal(a.body.yesterday.revenueNet, pnl.body.revenueNet);
    assert.equal(a.body.yesterday.grossProfit, pnl.body.grossMargin);
    assert.ok('stocktakeOverdue' in a.body.todos);
    const m = await api.get('/api/dashboard/today').set(auth(lead));
    assert.equal(m.status, 200);
    assert.equal(m.body.full, false);
    assert.ok(!('grossProfit' in m.body.yesterday) && !('cogs' in m.body.yesterday));
    assert.equal(m.body.yesterday.revenueNet, pnl.body.revenueNet);
    assert.equal((await api.get('/api/dashboard/today').set(auth(staff))).status, 403);
    const re = await api.post('/api/dashboard/recompute').set(auth(lead));
    assert.equal(re.status, 200);
    assert.equal(re.body.today.date, today);
    // Chạy lại job không nhân đôi
    await api.post('/api/admin/jobs/daily-summary/run').set(auth(admin));
    assert.equal((await q1(`SELECT COUNT(*) AS N FROM dbo.DailySummaries WHERE SummaryDate = '${y}'`))[0].N, 1);
  });
});
