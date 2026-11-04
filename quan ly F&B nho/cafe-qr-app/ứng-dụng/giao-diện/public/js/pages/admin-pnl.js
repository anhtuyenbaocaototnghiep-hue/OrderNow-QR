// S-39 Lãi / lỗ ƯỚC TÍNH (FEATURE-034, ADR-006 D-31) — chỉ quản lý. Doanh thu thuần − giá vốn − chi quỹ (danh mục chi phí)
// − chi phí cố định phân bổ theo ngày; điểm hòa vốn/ngày = chi phí cố định/ngày ÷ biên lãi gộp %. Biểu đồ cột tự vẽ (SVG).
// TASK-080: trình bày cho chủ quán không học kế toán — trả lời "lãi / lỗ bao nhiêu" trước, "tiền đi đâu" bằng lời thường
// (thuật ngữ kế toán để chữ nhỏ), mức cần bán mỗi ngày + hôm nay đạt bao nhiêu, lưu ý tự phát hiện; biểu đồ + bảng trong "Xem chi tiết".
// Công thức không đổi.
import { staffApi } from '../api.js';
import { confirmAndDelete, mountAdminShell } from '../admin-shell.js';
import { $, clear, el, errorMessage, modal, money, showFieldErrors, toast, todayVn } from '../ui.js';
import { attachHover, barPath, compact, niceScale, svg } from '../chart-kit.js';

await mountAdminShell('pnl');

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dayCount = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
const fmtDate = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const fmtRange = (from, to) => (from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`);
const daysInMonth = (d) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).getUTCDate();

const PRESETS = [
  ['today', 'Hôm nay'],
  ['week', 'Tuần này'],
  ['month', 'Tháng này'],
  ['lastMonth', 'Tháng trước'],
  ['year', 'Năm nay'],
];
/** Khoảng ngày (giờ quán) của nút chọn nhanh → [từ, đến]. Tuần bắt đầu thứ Hai. */
function rangeOf(key) {
  const t = todayVn();
  if (key === 'today') return [t, t];
  if (key === 'week') return [addDays(t, -((new Date(`${t}T00:00:00Z`).getUTCDay() + 6) % 7)), t];
  if (key === 'lastMonth') {
    const end = addDays(`${t.slice(0, 8)}01`, -1);
    return [`${end.slice(0, 8)}01`, end];
  }
  if (key === 'year') return [`${t.slice(0, 4)}-01-01`, t];
  return [`${t.slice(0, 8)}01`, t];
}
const [from0, to0] = rangeOf('month');
const state = { preset: 'month', from: from0, to: to0 };
/** Tối đa ~2 tháng thì xem theo ngày, dài hơn theo tháng (không còn ô "Nhóm theo"). */
const groupBy = () => (dayCount(state.from, state.to) <= 62 ? 'day' : 'month');
const pnlUrl = (from, to, g = 'day') => `/api/admin/reports/pnl?from=${from}&to=${to}&groupBy=${g}`;
const body = el('div');
clear($('#content'), body);

async function load() {
  clear(body, el('p', { class: 'muted' }, 'Đang tải…'));
  const t = todayVn();
  const prevTo = addDays(state.from, -1);
  const prevFrom = addDays(prevTo, -(dayCount(state.from, state.to) - 1));
  const onlyToday = state.from === t && state.to === t;
  try {
    const [r, prev, today, costs] = await Promise.all([
      staffApi(pnlUrl(state.from, state.to, groupBy())),
      staffApi(pnlUrl(prevFrom, prevTo, 'month')).catch(() => null), // phần so sánh lỗi thì bỏ, không chặn trang
      onlyToday ? null : staffApi(pnlUrl(t, t)).catch(() => null),
      staffApi('/api/admin/fixed-costs'),
    ]);
    render(r, { prev: prev && { ...prev, from: prevFrom, to: prevTo }, today: onlyToday ? r : today, costs });
  } catch (err) {
    clear(body, periodPicker(), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

function periodPicker() {
  const choose = (key) => {
    [state.from, state.to] = rangeOf(key);
    state.preset = key;
    load();
  };
  const date = (key, label) => {
    const input = el('input', { type: 'date', class: 'input', value: state[key], max: todayVn() });
    input.addEventListener('change', () => {
      if (!input.value) return;
      state[key] = input.value;
      state.preset = 'custom';
      if (state.from <= state.to) load();
      else toast('Ngày bắt đầu phải trước ngày kết thúc', 'warning');
    });
    return el('div', { class: 'field' }, el('label', {}, label), input);
  };
  return el(
    'div',
    { class: 'pnl-periods' },
    el(
      'div',
      { class: 'row wrap', role: 'group', 'aria-label': 'Chọn khoảng thời gian' },
      PRESETS.map(([key, label]) =>
        el('button', { class: 'btn btn-sm', type: 'button', 'aria-pressed': String(state.preset === key), onclick: () => choose(key) }, label),
      ),
    ),
    el(
      'details',
      { class: 'pnl-custom', open: state.preset === 'custom' },
      el('summary', {}, 'Chọn ngày khác'),
      el('div', { class: 'filters' }, date('from', 'Từ ngày'), date('to', 'Đến ngày')),
    ),
  );
}

const lossWord = (n) => (n < 0 ? 'lỗ' : 'lãi');

/** Câu trả lời chính: lãi / lỗ bao nhiêu, vì sao, so với khoảng trước cùng độ dài. */
function answerCard(r, prev) {
  const name = PRESETS.find(([k]) => k === state.preset)?.[1];
  const p = r.operatingProfit;
  const empty = !r.payments && !r.cogs;
  const costs = r.cashExpenses + r.fixedCostsAllocated;
  const diff = prev ? p - prev.operatingProfit : 0;
  return el(
    'section',
    { class: 'card pnl-answer', 'aria-labelledby': 'pnl-answer-title' },
    el('p', { class: 'small muted', id: 'pnl-answer-title' }, `${name ? `${name} · ` : ''}${fmtRange(state.from, state.to)}`),
    empty
      ? el('p', { class: 'pnl-verdict' }, 'Chưa có tiền bán hàng trong khoảng này')
      : el('p', { class: `pnl-verdict ${p < 0 ? 'neg' : 'pos-val'}` }, `Quán đang ${lossWord(p)} `, el('strong', {}, money(Math.abs(p)))),
    empty
      ? null
      : el(
          'p',
          {},
          `Bán được ${money(r.revenueNet)}, trả nguyên liệu ${money(r.cogs)} và các chi phí ${money(costs)}, ${p < 0 ? 'còn thiếu' : 'còn lại'} ${money(Math.abs(p))}.`,
        ),
    prev && prev.payments
      ? el(
          'p',
          { class: 'small muted' },
          `So với ${fmtRange(prev.from, prev.to)} (${lossWord(prev.operatingProfit)} ${money(Math.abs(prev.operatingProfit))}): `,
          diff === 0 ? 'bằng nhau' : el('span', { class: diff > 0 ? 'pos-val' : 'neg' }, `${diff > 0 ? 'tốt hơn' : 'kém hơn'} ${money(Math.abs(diff))}`),
        )
      : null,
  );
}

/** "Tiền đi đâu": bán được − nguyên liệu − chi phí khác − cố định = lãi / lỗ. Thanh ngang chỉ để nhìn, số nằm ở cột tiền. */
function flowCard(r) {
  const p = r.operatingProfit;
  const per100k = r.revenueNet > 0 ? Math.round((r.cogs * 100000) / r.revenueNet) : null;
  const rows = [
    ['', 'Tiền bán được', 'doanh thu thuần', r.revenueNet, `Đã trừ giảm giá ${money(r.discounts)} và hoàn tiền ${money(r.refunds)}`, 'pnl-rev'],
    [
      '−',
      'Nguyên liệu',
      'giá vốn',
      r.cogs,
      per100k === null ? 'Theo định lượng các món đã làm' : `Cứ 100.000đ bán được thì tốn khoảng ${money(per100k)} nguyên liệu`,
      'pnl-cogs',
    ],
    ['−', 'Chi phí khác', 'chi quỹ', r.cashExpenses, 'Các khoản chi trong Sổ quỹ: đá, điện nước, vật tư…', 'pnl-cost'],
    [
      '−',
      'Chi phí cố định',
      'phân bổ theo ngày',
      r.fixedCostsAllocated,
      r.fixedCostsPerDay ? `Mặt bằng, lương… khoảng ${money(r.fixedCostsPerDay)} mỗi ngày` : 'Chưa khai — xem mục Chi phí cố định',
      'pnl-cost',
    ],
  ];
  const max = Math.max(1, r.revenueNet, r.cogs + r.cashExpenses + r.fixedCostsAllocated, Math.abs(p));
  const bar = (amount, cls) =>
    el(
      'td',
      { class: 'pnl-bar-cell', 'aria-hidden': 'true' },
      el('span', { class: `pnl-bar ${cls}`, style: { width: `${Math.round((Math.max(0, amount) * 100) / max)}%` } }),
    );
  return el(
    'section',
    { class: 'card', 'aria-labelledby': 'pnl-flow-title' },
    el('h2', { id: 'pnl-flow-title' }, 'Tiền đi đâu'),
    el(
      'table',
      { class: 'pnl-flow' },
      el(
        'tbody',
        {},
        rows.map(([sign, label, term, amount, hint, cls]) =>
          el(
            'tr',
            {},
            el(
              'th',
              { scope: 'row' },
              el('span', { class: 'pnl-sign', 'aria-hidden': 'true' }, sign),
              el('span', {}, label, el('span', { class: 'small muted' }, ` (${term})`)),
              el('div', { class: 'small muted' }, hint),
            ),
            bar(amount, cls),
            el('td', { class: 'num' }, sign ? `${sign} ${money(amount)}` : money(amount)),
          ),
        ),
        el(
          'tr',
          { class: 'pnl-total' },
          el(
            'th',
            { scope: 'row' },
            el('span', { class: 'pnl-sign', 'aria-hidden': 'true' }, '='),
            el('span', {}, p < 0 ? 'Lỗ' : 'Lãi', el('span', { class: 'small muted' }, ' (lợi nhuận hoạt động)')),
          ),
          bar(Math.abs(p), p < 0 ? 'pnl-neg' : 'pnl-pos'),
          el('td', { class: `num ${p < 0 ? 'neg' : 'pos-val'}` }, money(Math.abs(p))),
        ),
      ),
    ),
  );
}

/** Mức tiền bán được cần đạt mỗi ngày để không lỗ (điểm hòa vốn) + hôm nay đạt bao nhiêu. */
function breakEvenCard(r, today) {
  const title = el('h2', { id: 'pnl-be-title' }, 'Mỗi ngày cần bán bao nhiêu để không lỗ?');
  const wrap = (...children) => el('section', { class: 'card pnl-need', 'aria-labelledby': 'pnl-be-title' }, title, ...children);
  if (!r.fixedCostsAllocated) return wrap(el('p', {}, 'Khai chi phí cố định (mặt bằng, lương…) ở mục bên dưới để app tính mức này.'));
  const be = r.breakEvenPerDay;
  if (!be) return wrap(el('p', {}, 'Chưa tính được: tiền bán được trong khoảng này chưa đủ trả tiền nguyên liệu.'));
  const sold = today ? today.revenueNet : null;
  const days = groupBy() === 'day' && r.series.length > 1 ? r.series.filter((s) => s.revenueNet >= be).length : null;
  return wrap(
    el('p', { class: 'pnl-need-amount' }, 'Ít nhất ', el('strong', {}, money(be)), ' tiền bán được mỗi ngày'),
    sold === null
      ? null
      : el(
          'div',
          {},
          el('progress', { max: be, value: Math.max(0, Math.min(sold, be)), 'aria-label': 'Hôm nay đã bán so với mức cần bán' }),
          el(
            'p',
            {},
            `Hôm nay bán được ${money(sold)} — `,
            sold >= be ? el('strong', { class: 'pos-val' }, 'đã đủ mức không lỗ') : `còn thiếu ${money(be - sold)}`,
            ` (${Math.round((Math.max(0, sold) * 100) / be)}%)`,
          ),
        ),
    days === null ? null : el('p', { class: 'small' }, `Trong khoảng đã chọn: ${days} / ${r.series.length} ngày đạt mức này.`),
    el('p', { class: 'small muted' }, `Tính từ chi phí cố định ${money(r.fixedCostsPerDay)}/ngày và tỷ lệ nguyên liệu của khoảng đã chọn.`),
  );
}

/** Lưu ý app tự phát hiện — những chỗ hay làm số lãi / lỗ sai. → [[chữ, [link, nhãn] | null]] */
function hints(r, costs) {
  const out = [];
  const active = costs.filter((c) => c.effectiveFrom <= state.to && (!c.effectiveTo || c.effectiveTo >= state.from));
  const named = (re) => r.expensesByCategory.filter((c) => re.test(c.name) && c.amount > 0);
  const list = (cats) => `"${cats.map((c) => c.name).join('", "')}" ${money(cats.reduce((s, c) => s + c.amount, 0))}`;
  if (!r.fixedCostsAllocated) out.push(['Chưa khai chi phí cố định (mặt bằng, lương…), nên lãi ở trên đang cao hơn thực tế.', null]);
  const salary = named(/lương/i);
  if (salary.length && active.some((c) => /lương/i.test(c.name)))
    out.push([
      `Sổ quỹ có chi ${list(salary)} và chi phí cố định cũng có khoản lương. Nếu tiền tạm ứng nằm trong lương cố định thì lương đang bị trừ hai lần.`,
      ['/admin/cash', 'Mở Sổ quỹ'],
    ]);
  const goods = named(/nguyên liệu|nhập hàng|mua hàng/i);
  if (goods.length)
    out.push([
      `Sổ quỹ có chi ${list(goods)}. Nếu đó là tiền mua hàng đã nhập kho thì đang bị trừ hai lần (đã tính trong Nguyên liệu).`,
      ['/admin/cash', 'Mở Sổ quỹ'],
    ]);
  if (r.giftsOutstanding?.count)
    // F-070: ly tặng đã thu tiền, chưa dùng
    out.push([
      `Đã bán ${r.giftsOutstanding.count} ly tặng chưa dùng (${money(r.giftsOutstanding.amount)}): tiền đã thu, doanh thu tính khi người nhận dùng ly.`,
      ['/admin/loyalty?tab=gift', 'Xem ly tặng'],
    ]);
  if (r.lossValue > 0) out.push([`Hàng hao hụt, đổ bỏ, lệch kiểm kê khoảng ${money(r.lossValue)} — chưa trừ vào lãi ở trên.`, ['/admin/stock', 'Xem kho']]);
  if (r.estimatedCogsRows) out.push([`${r.estimatedCogsRows} món chưa có giá vốn chốt lúc bán, app tạm tính theo giá nguyên liệu hiện tại.`, null]);
  return out;
}

function hintsCard(r, costs) {
  const list = hints(r, costs);
  if (!list.length) return null;
  return el(
    'section',
    { class: 'card pnl-hints', 'aria-labelledby': 'pnl-hints-title' },
    el('h2', { id: 'pnl-hints-title' }, 'Cần để ý'),
    el(
      'ul',
      {},
      list.map(([text, link]) => el('li', {}, text, link ? [' ', el('a', { href: link[0] }, link[1])] : null)),
    ),
  );
}

// ---------- Biểu đồ (TASK-069, ADR-015 D-60: 3 màu --viz-*, cột bo đầu chân vuông, khe 2px, rê chuột / bàn phím xem số) ----------
const SERIES = [
  ['revenueNet', 'Tiền bán được', 'pnl-rev'],
  ['cogs', 'Nguyên liệu', 'pnl-cogs'],
  ['costs', 'Chi phí (khác + cố định)', 'pnl-cost'],
];
/** Nhãn trục: ngày "2026-10-05" → "05", ghi kèm tháng ở nhãn đầu và khi sang tháng ("02/11"); tháng "2026-10" → "10/26". */
function periodTicker() {
  let month = '';
  return (p) => {
    if (p.length !== 10) return p.length === 7 ? `${p.slice(5, 7)}/${p.slice(2, 4)}` : p;
    const m = p.slice(5, 7);
    const t = m === month ? p.slice(8, 10) : `${p.slice(8, 10)}/${m}`;
    month = m;
    return t;
  };
}
const periodFull = (p) =>
  p.length === 10 ? `${p.slice(8, 10)}/${p.slice(5, 7)}/${p.slice(0, 4)}` : p.length === 7 ? `Tháng ${p.slice(5, 7)}/${p.slice(0, 4)}` : p;

function pnlChart(series, breakEven) {
  const pts = series.map((s) => ({ ...s, costs: s.cashExpenses + s.fixedCostsAllocated }));
  // Bề rộng có trần: kỳ dài không làm chữ / cột co lại mức không đọc được (review G3 TASK-069)
  const W = Math.min(1100, Math.max(640, pts.length * 34));
  const H = 280;
  const pad = { l: 56, r: 16, t: 18, b: 34 };
  const base = H - pad.b;
  const { top, ticks } = niceScale(Math.max(breakEven ?? 0, ...pts.flatMap((p) => SERIES.map(([k]) => p[k]))));
  const y = (v) => pad.t + (base - pad.t) * (1 - Math.max(0, v) / top);
  const gw = (W - pad.l - pad.r) / Math.max(1, pts.length);
  const gap = 2; // khe màu nền giữa các cột cạnh nhau
  const rawBw = (gw * 0.72 - gap * (SERIES.length - 1)) / SERIES.length;
  // Quá nhiều kỳ cho cột nhóm (cột < 4 đơn vị) → đổi sang 3 đường cùng màu (dạng hợp với chuỗi thời gian dày)
  const dense = rawBw < 4;
  const bw = Math.min(24, Math.max(0, rawBw));
  const groupW = dense ? 0 : bw * SERIES.length + gap * (SERIES.length - 1);
  const gx = (i) => pad.l + i * gw + (gw - groupW) / 2;
  const cx = (i) => gx(i) + groupW / 2;
  const every = Math.ceil(pts.length / 16); // tối đa ~16 nhãn trục để không chồng chữ
  const tick = periodTicker();
  const chart = svg(
    'svg',
    {
      class: 'chart pnl-chart',
      viewBox: `0 0 ${W} ${H}`,
      role: 'img',
      'aria-label': 'Biểu đồ tiền bán được, nguyên liệu, chi phí theo kỳ — rê chuột hoặc dùng phím mũi tên để xem số',
    },
    ticks.map((t) => [
      svg('line', { class: t ? 'grid' : 'axis-line', x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t) }),
      svg('text', { class: 'tick', x: pad.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, compact(t)),
    ]),
    dense
      ? SERIES.map(([k, , cls]) => svg('path', { class: `pnl-line ${cls}`, d: pts.map((p, i) => `${i ? 'L' : 'M'}${cx(i)},${y(p[k])}`).join(' ') }))
      : pts.map((p, i) => SERIES.map(([k, , cls], j) => svg('path', { class: `bar ${cls}`, d: barPath(gx(i) + j * (bw + gap), y(p[k]), bw, base - y(p[k])) }))),
    pts.map((p, i) => (i % every === 0 ? svg('text', { class: 'tick', x: cx(i), y: base + 18, 'text-anchor': 'middle' }, tick(p.period)) : null)),
    breakEven
      ? [
          svg('line', { class: 'pnl-breakeven', x1: pad.l, x2: W - pad.r, y1: y(breakEven), y2: y(breakEven) }),
          svg('text', { x: W - pad.r, y: y(breakEven) - 6, 'text-anchor': 'end', class: 'pnl-breakeven-label' }, `Cần bán ${money(breakEven)}/ngày`),
        ]
      : null,
  );
  const plot = el('div', {}, chart);
  attachHover(chart, {
    width: W,
    count: pts.length,
    xAt: cx,
    yTop: pad.t,
    yBottom: base,
    title: (i) => periodFull(pts[i].period),
    rows: (i) => [...SERIES.map(([k, label, cls]) => [label, money(pts[i][k]), cls]), ['Lãi / lỗ', money(pts[i].operatingProfit)]],
  });
  return el(
    'div',
    {},
    plot,
    el(
      'div',
      { class: 'row small legend' },
      SERIES.map(([, label, cls]) => el('span', {}, el('i', { class: `swatch ${cls}` }), label)),
      breakEven ? el('span', {}, el('i', { class: 'swatch pnl-be' }), 'Mức cần bán mỗi ngày để không lỗ') : null,
    ),
  );
}

function render(r, { prev, today, costs }) {
  clear(
    body,
    periodPicker(),
    answerCard(r, prev),
    el('div', { class: 'pnl-grid' }, flowCard(r), el('div', { class: 'stack' }, breakEvenCard(r, today), hintsCard(r, costs))),
    fixedCostsCard(costs),
    el(
      'details',
      { class: 'card pnl-detail' },
      el('summary', {}, groupBy() === 'day' ? 'Xem chi tiết từng ngày' : 'Xem chi tiết từng tháng'),
      el('h2', {}, 'Tiền bán được · nguyên liệu · chi phí'),
      pnlChart(r.series, groupBy() === 'day' ? r.breakEvenPerDay : null),
      el('h2', {}, groupBy() === 'day' ? 'Theo ngày' : 'Theo tháng'),
      seriesTable(r.series),
      el('h2', {}, 'Chi phí khác theo danh mục Sổ quỹ'),
      r.expensesByCategory.length
        ? el(
            'table',
            { class: 'table' },
            el(
              'tbody',
              {},
              r.expensesByCategory.map((c) => el('tr', {}, el('td', {}, c.name), el('td', { class: 'num' }, money(c.amount)))),
            ),
          )
        : el('p', { class: 'muted' }, 'Không có khoản chi nào trong Sổ quỹ thuộc danh mục chi phí.'),
    ),
    el('p', { class: 'small muted pnl-note' }, 'Số liệu là ước tính: chưa gồm thuế và các khoản chi không ghi vào Sổ quỹ.'),
  );
}

function seriesTable(series) {
  const cols = [
    ['period', 'Kỳ'],
    ['revenueNet', 'Bán được'],
    ['cogs', 'Nguyên liệu'],
    ['cashExpenses', 'Chi phí khác'],
    ['fixedCostsAllocated', 'Cố định'],
    ['operatingProfit', 'Lãi / lỗ'],
  ];
  return el(
    'div',
    { class: 'table-wrap' },
    el(
      'table',
      { class: 'table' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          cols.map(([k, h]) => el('th', { class: k === 'period' ? '' : 'num' }, h)),
        ),
      ),
      el(
        'tbody',
        {},
        series.map((s) =>
          el(
            'tr',
            {},
            cols.map(([k]) =>
              k === 'period'
                ? el('td', { class: 'nowrap' }, periodFull(s.period))
                : el('td', { class: `num ${k === 'operatingProfit' && s[k] < 0 ? 'neg' : ''}` }, money(s[k])),
            ),
          ),
        ),
      ),
    ),
  );
}

// ---------- Chi phí cố định ----------
const QUICK_COSTS = ['Tiền mặt bằng', 'Lương nhân viên', 'Internet'];

function fixedCostsCard(costs) {
  const t = todayVn();
  const active = costs.filter((c) => c.effectiveFrom <= t && (!c.effectiveTo || c.effectiveTo >= t));
  const monthly = active.reduce((s, c) => s + c.monthlyAmount, 0);
  return el(
    'section',
    { class: 'card', 'aria-labelledby': 'pnl-fixed-title' },
    el('h2', { id: 'pnl-fixed-title' }, 'Chi phí cố định hằng tháng'),
    el('p', { class: 'small muted' }, 'Những khoản tháng nào cũng trả: mặt bằng, lương cố định, Internet… App chia đều theo số ngày trong tháng.'),
    active.length ? el('p', {}, 'Đang áp dụng: ', el('strong', {}, `${money(monthly)}/tháng`), ` ≈ ${money(Math.round(monthly / daysInMonth(t)))}/ngày`) : null,
    el(
      'div',
      { class: 'row wrap' },
      QUICK_COSTS.map((n) => el('button', { class: 'btn btn-sm', type: 'button', onclick: () => editCost(null, n) }, `+ ${n}`)),
      el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => editCost(null) }, '+ Khoản khác'),
    ),
    costs.length
      ? el(
          'ul',
          { class: 'pnl-costs' },
          costs.map((c) =>
            el(
              'li',
              { class: c.effectiveTo && c.effectiveTo < t ? 'muted' : '' },
              el(
                'div',
                {},
                c.name,
                el('div', { class: 'small muted' }, `từ ${fmtDate(c.effectiveFrom)}${c.effectiveTo ? ` đến ${fmtDate(c.effectiveTo)}` : ''}`),
              ),
              el('strong', {}, `${money(c.monthlyAmount)}/tháng`),
              el(
                'div',
                { class: 'row' },
                el('button', { class: 'btn btn-sm', type: 'button', onclick: () => editCost(c), 'aria-label': `Sửa ${c.name}` }, 'Sửa'),
                el(
                  'button',
                  {
                    class: 'btn btn-sm btn-danger',
                    type: 'button',
                    'aria-label': `Xóa ${c.name}`,
                    onclick: () => confirmAndDelete({ url: `/api/admin/fixed-costs/${c.costId}`, label: `khoản "${c.name}"`, onDone: load }),
                  },
                  'Xóa',
                ),
              ),
            ),
          ),
        )
      : el('p', { class: 'muted' }, 'Chưa khai khoản nào.'),
  );
}

/** presetName: tên điền sẵn khi bấm nút nhanh ("+ Tiền mặt bằng"…). */
function editCost(c, presetName = '') {
  const name = el('input', { class: 'input', name: 'name', maxlength: 100, value: c?.name ?? presetName, placeholder: 'Ví dụ: Tiền mặt bằng' });
  const amount = el('input', { class: 'input', name: 'monthlyAmount', inputmode: 'numeric', value: c?.monthlyAmount ?? '' });
  const from = el('input', { class: 'input', name: 'effectiveFrom', type: 'date', value: c?.effectiveFrom ?? `${todayVn().slice(0, 8)}01` });
  const to = el('input', { class: 'input', name: 'effectiveTo', type: 'date', value: c?.effectiveTo ?? '' });
  const form = el(
    'form',
    {},
    el('div', { class: 'field' }, el('label', {}, 'Tên khoản'), name),
    el('div', { class: 'field' }, el('label', {}, 'Số tiền mỗi tháng (đ)'), amount),
    el('div', { class: 'field' }, el('label', {}, 'Hiệu lực từ'), from),
    el('div', { class: 'field' }, el('label', {}, 'Đến (để trống = đang áp dụng)'), to),
  );
  modal({
    title: c ? `Sửa: ${c.name}` : `Thêm chi phí cố định${presetName ? `: ${presetName}` : ''}`,
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async () => {
          try {
            await staffApi(c ? `/api/admin/fixed-costs/${c.costId}` : '/api/admin/fixed-costs', {
              method: c ? 'PUT' : 'POST',
              body: {
                name: name.value.trim(),
                monthlyAmount: Number(String(amount.value).replace(/\D/g, '')) || 0,
                effectiveFrom: from.value,
                effectiveTo: to.value || null,
              },
            });
            toast('Đã lưu chi phí cố định', 'success');
            load();
          } catch (err) {
            if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error');
            return false;
          }
        },
      },
    ],
  });
}

await load();
