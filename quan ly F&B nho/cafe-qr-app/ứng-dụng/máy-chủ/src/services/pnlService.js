// FEATURE-034 Lãi/lỗ đơn giản & điểm hòa vốn (ADR-006 D-31) — chỉ quản lý (ADMIN). Luôn là ƯỚC TÍNH:
//   doanh thu thuần = Σ phải thu − Σ hoàn tiền;  giảm giá = doanh thu gộp − Σ phải thu (khuyến mãi + hội viên + giảm tay + làm tròn)
//   lãi gộp = doanh thu thuần − giá vốn (COGS);  lợi nhuận hoạt động = lãi gộp − chi quỹ (danh mục chi phí) − chi phí cố định phân bổ ngày
//   chi phí cố định/ngày = Σ (số tiền tháng ÷ số ngày của tháng) các khoản đang hiệu lực ngày đó
//   hòa vốn/ngày = chi phí cố định bình quân/ngày ÷ biên lãi gộp % (doanh thu thuần cần đạt mỗi ngày)
//   lossValue (TASK-080): hàng mất ròng trong kỳ (điều chỉnh / hao hụt / lệch kiểm kê) — chỉ để nhắc, không trừ vào lợi nhuận
//   F-073: đã có hồ sơ lương → trừ thêm "lương theo chấm công" từng ngày (giờ được trả × lương giờ + phụ cấp đêm / lễ; lương tháng chia đều
//   theo ngày); tạm ứng lương không còn tính là chi phí (đã nằm trong lương). Lương khai ở Chi phí cố định thì xóa đi để không tính hai lần.
import { badRequest, notFound } from '../errors.js';
import * as pnlRepo from '../repositories/pnlRepo.js';
import * as giftDrinkRepo from '../repositories/giftDrinkRepo.js';
import { laborByDay } from './payrollService.js';
import { addDays, eachDay, vnDayStartUtc } from '../utils/time.js';

const daysInMonth = (date) => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();

/** Chi phí cố định phân bổ cho một ngày (số thực — làm tròn khi cộng dồn kỳ). */
export function fixedForDay(costs, date) {
  return costs.filter((c) => c.effectiveFrom <= date && (!c.effectiveTo || c.effectiveTo >= date)).reduce((s, c) => s + c.monthlyAmount / daysInMonth(date), 0);
}

const EMPTY = () => ({ revenueGross: 0, revenueDue: 0, refunds: 0, cogs: 0, cashExpenses: 0, fixed: 0, labor: 0, estimatedCogsRows: 0, payments: 0 });

/** Tính chỉ tiêu từ các khoản cộng dồn (tiền làm tròn đồng). */
export function finalize(b) {
  const fixedCostsAllocated = Math.round(b.fixed);
  const laborCosts = Math.round(b.labor ?? 0);
  const revenueNet = b.revenueDue - b.refunds;
  const grossMargin = revenueNet - b.cogs;
  return {
    revenueGross: b.revenueGross,
    discounts: b.revenueGross - b.revenueDue,
    refunds: b.refunds,
    revenueNet,
    cogs: b.cogs,
    grossMargin,
    grossMarginPct: revenueNet > 0 ? Math.round((grossMargin / revenueNet) * 10000) / 100 : null,
    cashExpenses: b.cashExpenses,
    fixedCostsAllocated,
    laborCosts,
    operatingProfit: grossMargin - b.cashExpenses - fixedCostsAllocated - laborCosts,
    estimatedCogsRows: b.estimatedCogsRows,
    payments: b.payments,
  };
}

export async function report(from, to, groupBy = 'day') {
  if (to < from) throw badRequest('INVALID_RANGE', 'Khoảng thời gian không hợp lệ');
  if (eachDay(from, to).length > 400) throw badRequest('INVALID_RANGE', 'Chọn tối đa khoảng 13 tháng');
  const labor = await laborByDay(from, to); // F-073: null khi chưa có hồ sơ lương nào
  const [data, costs, giftsOutstanding] = await Promise.all([
    pnlRepo.daily(vnDayStartUtc(from), vnDayStartUtc(addDays(to, 1)), { excludeAdvances: Boolean(labor) }),
    pnlRepo.fixedCosts(),
    giftDrinkRepo.outstanding(), // F-070: ly tặng đã thu tiền, chưa dùng (chưa là doanh thu)
  ]);
  const days = new Map(eachDay(from, to).map((d) => [d, EMPTY()]));
  const add = (date, fn) => days.has(date) && fn(days.get(date));
  for (const p of data.payments) {
    add(p.date, (b) => {
      b.revenueGross += p.gross;
      b.revenueDue += p.due;
      b.payments += p.count;
    });
  }
  for (const r of data.refunds) add(r.date, (b) => (b.refunds += r.amount));
  for (const c of data.cogs) {
    add(c.date, (b) => {
      b.cogs += c.amount;
      b.estimatedCogsRows += c.estimatedRows;
    });
  }
  for (const e of data.expenses) add(e.date, (b) => (b.cashExpenses += e.amount));
  for (const [d, b] of days) {
    b.fixed = fixedForDay(costs, d);
    b.labor = labor?.get(d) ?? 0;
  }

  const keyOf = (d) => (groupBy === 'month' ? d.slice(0, 7) : d);
  const groups = new Map();
  const total = EMPTY();
  for (const [d, b] of days) {
    const g = groups.get(keyOf(d)) ?? EMPTY();
    for (const k of Object.keys(total)) {
      g[k] += b[k];
      total[k] += b[k];
    }
    groups.set(keyOf(d), g);
  }
  const totals = finalize(total);
  const dayCount = days.size;
  const fixedPerDay = Math.round(total.fixed / dayCount);
  const byCategory = new Map();
  for (const e of data.expenses) {
    const cur = byCategory.get(e.categoryId) ?? { categoryId: e.categoryId, name: e.name, amount: 0 };
    cur.amount += e.amount;
    byCategory.set(e.categoryId, cur);
  }
  return {
    from,
    to,
    groupBy,
    note: 'ước tính',
    ...totals,
    fixedCostsPerDay: fixedPerDay,
    breakEvenPerDay: totals.grossMargin > 0 && totals.revenueNet > 0 ? Math.round((fixedPerDay * totals.revenueNet) / totals.grossMargin) : null,
    expensesByCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
    lossValue: data.lossValue,
    giftsOutstanding,
    payrollActive: Boolean(labor),
    series: [...groups].map(([period, g]) => ({ period, ...finalize(g) })),
  };
}

export const fixedCosts = () => pnlRepo.fixedCosts();

export async function saveFixedCost(id, body) {
  if (body.effectiveTo && body.effectiveTo < body.effectiveFrom) throw badRequest('VALIDATION_ERROR', 'Ngày kết thúc phải sau ngày bắt đầu');
  const c = await pnlRepo.saveFixedCost(id, body);
  if (!c) throw notFound('Không tìm thấy khoản chi phí cố định');
  return c;
}

export async function removeFixedCost(id) {
  if (!(await pnlRepo.deleteFixedCost(id))) throw notFound('Không tìm thấy khoản chi phí cố định');
  return 'DELETED';
}
