// Unit test (không DB) giai đoạn 6 — ADR-006: luật nhật ký thao tác + che dữ liệu nhạy cảm (F-035, D-26), CSV (F-033),
// phân bổ chi phí cố định + chỉ tiêu lãi/lỗ (F-034, D-31), thời hạn token → giờ (F-035), ngưỡng giảm tay theo vai (F-036, D-24).
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './helpers/testDb.js';

let matchRule, sanitize, toCsv, fixedForDay, finalize, ttlHours, discountLimits, can;

before(async () => {
  useTestDatabase(); // module app đọc env lúc import — luôn trỏ DB test dù không truy vấn
  ({ matchRule, sanitize } = await import('../src/middleware/audit.js'));
  ({ toCsv } = await import('../src/utils/csv.js'));
  ({ fixedForDay, finalize } = await import('../src/services/pnlService.js'));
  ({ ttlHours } = await import('../src/services/attendanceService.js'));
  ({ discountLimits, can } = await import('../src/auth/permissions.js'));
});

describe('Luật nhật ký thao tác (D-26)', () => {
  test('route quầy theo bảng luật; GET và thao tác bán thường không ghi', () => {
    assert.deepEqual(matchRule('POST', '/payments/12/refunds'), { action: 'payment.refund', entity: 'Payment', entityId: '12' });
    assert.deepEqual(matchRule('POST', '/cash-transactions/7/approve'), { action: 'cash.approve', entity: 'CashTransaction', entityId: '7' });
    assert.deepEqual(matchRule('PUT', '/attendance/3'), { action: 'attendance.update', entity: 'Attendance', entityId: '3' });
    assert.equal(matchRule('GET', '/payments/12'), null);
    assert.equal(matchRule('POST', '/orders/5/complete'), null);
    assert.equal(matchRule('POST', '/orders/5/accept'), null);
    assert.equal(matchRule('POST', '/auth/login'), null);
  });

  test('mọi thao tác đổi dữ liệu dưới /admin đều ghi, hành động suy ra từ đường dẫn', () => {
    assert.deepEqual(matchRule('POST', '/admin/menu-items'), { action: 'menu-items.create', entity: 'MenuItem', entityId: null });
    assert.deepEqual(matchRule('PUT', '/admin/menu-items/9'), { action: 'menu-items.update', entity: 'MenuItem', entityId: '9' });
    assert.deepEqual(matchRule('PUT', '/admin/menu-items/9/bom'), { action: 'menu-items.bom', entity: 'MenuItem', entityId: '9' });
    assert.deepEqual(matchRule('PATCH', '/admin/users/4/active'), { action: 'users.active', entity: 'User', entityId: '4' });
    assert.deepEqual(matchRule('DELETE', '/admin/promotions/2'), { action: 'promotions.delete', entity: 'Promotion', entityId: '2' });
    assert.deepEqual(matchRule('PUT', '/admin/settings'), { action: 'settings.update', entity: 'Settings', entityId: null });
    assert.deepEqual(matchRule('PUT', `/admin/units/${encodeURIComponent('thùng')}`), { action: 'units.update', entity: 'Unit', entityId: 'thùng' });
    assert.deepEqual(matchRule('PUT', '/admin/units/KG'), { action: 'units.update', entity: 'Unit', entityId: 'KG' });
    assert.deepEqual(matchRule('POST', '/admin/purchase-orders/from-suggestion'), {
      action: 'purchase-orders.from-suggestion',
      entity: 'PurchaseOrder',
      entityId: null,
    });
    assert.deepEqual(matchRule('POST', '/admin/jobs/prep-stats/run'), { action: 'jobs.run', entity: 'Job', entityId: 'prep-stats' });
    assert.equal(matchRule('GET', '/admin/reports/pnl'), null);
  });

  test('che dữ liệu: bỏ mật khẩu / hash / token ở mọi tầng; số điện thoại chỉ còn 3 số cuối', () => {
    const out = sanitize({
      username: 'a',
      password: 'x',
      adminPassword: 'y',
      PasswordHash: '$2a$10$abc',
      accessToken: 't',
      nested: [{ phone: '0901234567', note: 'ok', resetToken: 'r' }],
      member: { Phone: '0912345678' },
    });
    assert.deepEqual(out, { username: 'a', nested: [{ phone: '***567', note: 'ok' }], member: { Phone: '***678' } });
    assert.equal(sanitize(null), null);
    assert.equal(sanitize(5), 5);
  });
});

describe('CSV (F-033)', () => {
  test('BOM UTF-8, bọc ô có dấu phẩy / ngoặc kép / xuống dòng, chặn công thức Excel; số âm giữ nguyên', () => {
    const csv = toCsv(
      ['A', 'B'],
      [
        ['x,y', 'say "hi"'],
        ['=1+1', -50000],
        ['dòng\nmới', null],
      ],
    );
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.equal(csv.slice(1), 'A,B\r\n"x,y","say ""hi"""\r\n\'=1+1,-50000\r\n"dòng\nmới",\r\n');
  });
});

describe('Lãi / lỗ (F-034, D-31)', () => {
  const costs = [
    { monthlyAmount: 30_000_000, effectiveFrom: '2026-09-01', effectiveTo: null },
    { monthlyAmount: 3_100_000, effectiveFrom: '2026-10-05', effectiveTo: '2026-10-20' },
  ];
  test('chi phí cố định/ngày = số tiền tháng ÷ số ngày của tháng, chỉ trong thời gian hiệu lực', () => {
    assert.equal(fixedForDay(costs, '2026-08-31'), 0);
    assert.equal(fixedForDay(costs, '2026-09-15'), 1_000_000); // tháng 9: 30 ngày
    assert.equal(Math.round(fixedForDay(costs, '2026-10-04')), Math.round(30_000_000 / 31));
    assert.equal(Math.round(fixedForDay(costs, '2026-10-05')), Math.round(30_000_000 / 31 + 100_000));
    assert.equal(Math.round(fixedForDay(costs, '2026-10-21')), Math.round(30_000_000 / 31));
  });

  test('chỉ tiêu: thuần = phải thu − hoàn; giảm = gộp − phải thu; lợi nhuận = lãi gộp − chi quỹ − cố định; doanh thu 0 → biên null', () => {
    const r = finalize({
      revenueGross: 2_100_000,
      revenueDue: 2_000_000,
      refunds: 100_000,
      cogs: 600_000,
      cashExpenses: 150_000,
      fixed: 999_999.6,
      estimatedCogsRows: 0,
      payments: 3,
    });
    assert.deepEqual(
      [r.discounts, r.revenueNet, r.grossMargin, r.grossMarginPct, r.fixedCostsAllocated, r.operatingProfit],
      [100_000, 1_900_000, 1_300_000, 68.42, 1_000_000, 150_000],
    );
    assert.equal(
      finalize({ revenueGross: 0, revenueDue: 0, refunds: 0, cogs: 0, cashExpenses: 0, fixed: 0, estimatedCogsRows: 0, payments: 0 }).grossMarginPct,
      null,
    );
  });
});

describe('Chấm công + quyền (F-035, F-036)', () => {
  test('thời hạn token → số giờ', () => {
    assert.equal(ttlHours('8h'), 8);
    assert.equal(ttlHours('90m'), 1.5);
    assert.equal(ttlHours('1d'), 24);
    assert.equal(ttlHours('7200'), 2);
    assert.equal(ttlHours('lạ'), 8);
  });

  test('ngưỡng giảm tay theo vai; quản lý không giới hạn; quyền theo ma trận', () => {
    const s = { staffMaxPercent: 10, staffMaxAmount: 20000, managerMaxPercent: 20, managerMaxAmount: 50000 };
    assert.deepEqual(discountLimits('STAFF', s), { staffMaxPercent: 10, staffMaxAmount: 20000 });
    assert.deepEqual(discountLimits('MANAGER', s), { staffMaxPercent: 20, staffMaxAmount: 50000 });
    assert.equal(discountLimits('ADMIN', s), null);
    assert.equal(can({ role: 'STAFF' }, 'cash.create'), true);
    assert.equal(can({ role: 'STAFF' }, 'cash.approve'), false);
    assert.equal(can({ role: 'MANAGER' }, 'stocktake.post'), true);
    assert.equal(can({ role: 'MANAGER' }, 'admin.all'), false);
    assert.equal(can(null, 'pos.use'), false);
  });
});
