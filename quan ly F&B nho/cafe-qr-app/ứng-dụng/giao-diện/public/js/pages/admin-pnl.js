// S-39 Lãi / lỗ ƯỚC TÍNH (FEATURE-034, ADR-006 D-31) — chỉ quản lý. Doanh thu thuần − giá vốn − chi quỹ (danh mục chi phí)
// − chi phí cố định phân bổ theo ngày; điểm hòa vốn/ngày = chi phí cố định/ngày ÷ biên lãi gộp %. Biểu đồ cột tự vẽ (SVG).
import { staffApi } from '../api.js';
import { confirmAndDelete, mountAdminShell } from '../admin-shell.js';
import { $, clear, el, errorMessage, modal, money, showFieldErrors, toast, todayVn } from '../ui.js';
import { attachHover, barPath, compact, niceScale, svg } from '../chart-kit.js';

await mountAdminShell('pnl');

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const state = { from: `${todayVn().slice(0, 8)}01`, to: todayVn(), groupBy: 'day' };
const body = el('div');
clear($('#content'), body);

async function load() {
  clear(body, el('p', { class: 'muted' }, 'Đang tải…'));
  try {
    const [r, costs] = await Promise.all([
      staffApi(`/api/admin/reports/pnl?from=${state.from}&to=${state.to}&groupBy=${state.groupBy}`),
      staffApi('/api/admin/fixed-costs'),
    ]);
    render(r, costs);
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

function filters() {
  const date = (key, label) => {
    const input = el('input', { type: 'date', class: 'input', value: state[key], max: todayVn(), 'aria-label': label });
    input.addEventListener('change', () => {
      state[key] = input.value;
      load();
    });
    return el('div', { class: 'field' }, el('label', {}, label), input);
  };
  const group = el(
    'select',
    { class: 'input', 'aria-label': 'Nhóm theo' },
    el('option', { value: 'day', selected: state.groupBy === 'day' }, 'Theo ngày'),
    el('option', { value: 'month', selected: state.groupBy === 'month' }, 'Theo tháng'),
  );
  group.addEventListener('change', () => {
    state.groupBy = group.value;
    load();
  });
  const preset = (label, from, to) =>
    el(
      'button',
      {
        class: 'btn btn-sm',
        type: 'button',
        onclick: () => {
          Object.assign(state, { from, to });
          load();
        },
      },
      label,
    );
  const t = todayVn();
  return el(
    'div',
    { class: 'filters' },
    date('from', 'Từ ngày'),
    date('to', 'Đến ngày'),
    el('div', { class: 'field' }, el('label', {}, 'Nhóm theo'), group),
    preset('Tháng này', `${t.slice(0, 8)}01`, t),
    preset('30 ngày', addDays(t, -29), t),
    preset('Năm nay', `${t.slice(0, 4)}-01-01`, t),
  );
}

const kpi = (label, value, hint = '', cls = '') =>
  el(
    'div',
    { class: `card kpi ${cls}` },
    el('div', { class: 'label' }, label),
    el('div', { class: 'value' }, value),
    hint ? el('div', { class: 'small muted' }, hint) : null,
  );

// ---------- Biểu đồ (TASK-069, ADR-015 D-60: 3 màu --viz-*, cột bo đầu chân vuông, khe 2px, rê chuột / bàn phím xem số) ----------
const SERIES = [
  ['revenueNet', 'Doanh thu thuần', 'pnl-rev'],
  ['cogs', 'Giá vốn', 'pnl-cogs'],
  ['costs', 'Chi phí (quỹ + cố định)', 'pnl-cost'],
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
      'aria-label': 'Biểu đồ doanh thu thuần, giá vốn, chi phí theo kỳ — rê chuột hoặc dùng phím mũi tên để xem số',
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
          svg('text', { x: W - pad.r, y: y(breakEven) - 6, 'text-anchor': 'end', class: 'pnl-breakeven-label' }, `Hòa vốn ${money(breakEven)}/ngày`),
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
    rows: (i) => [...SERIES.map(([k, label, cls]) => [label, money(pts[i][k]), cls]), ['Lợi nhuận hoạt động', money(pts[i].operatingProfit)]],
  });
  return el(
    'div',
    {},
    plot,
    el(
      'div',
      { class: 'row small legend' },
      SERIES.map(([, label, cls]) => el('span', {}, el('i', { class: `swatch ${cls}` }), label)),
      breakEven ? el('span', {}, el('i', { class: 'swatch pnl-be' }), 'Doanh thu thuần cần đạt mỗi ngày (hòa vốn)') : null,
    ),
  );
}

function render(r, costs) {
  clear(
    body,
    filters(),
    el(
      'div',
      { class: 'alert warning' },
      el('strong', {}, 'Ước tính. '),
      'Giá vốn lấy theo giá vốn bình quân lúc hoàn tất đơn; chi phí cố định chia đều theo ngày; chưa gồm thuế và các khoản chi ngoài sổ quỹ.',
      r.estimatedCogsRows ? ` ${r.estimatedCogsRows} dòng món chưa có giá vốn chốt — đã ước tính theo định lượng × giá vốn hiện tại.` : '',
    ),
    el(
      'div',
      { class: 'kpis' },
      kpi('Doanh thu thuần', money(r.revenueNet), `Gộp ${money(r.revenueGross)} − giảm ${money(r.discounts)} − hoàn ${money(r.refunds)}`),
      kpi('Giá vốn (COGS)', money(r.cogs)),
      kpi('Lãi gộp', money(r.grossMargin), r.grossMarginPct === null ? '' : `Biên ${r.grossMarginPct.toLocaleString('vi-VN')} %`),
      kpi('Chi quỹ (chi phí)', money(r.cashExpenses)),
      kpi('Chi phí cố định phân bổ', money(r.fixedCostsAllocated), `${money(r.fixedCostsPerDay)}/ngày`),
      kpi('Lợi nhuận hoạt động', money(r.operatingProfit), '', r.operatingProfit < 0 ? 'neg' : 'pos'),
      kpi('Hòa vốn mỗi ngày', r.breakEvenPerDay === null ? '—' : money(r.breakEvenPerDay), 'Doanh thu thuần cần đạt / ngày'),
    ),
    el('div', { class: 'card' }, el('h2', {}, 'Doanh thu thuần · giá vốn · chi phí'), pnlChart(r.series, state.groupBy === 'day' ? r.breakEvenPerDay : null)),
    el(
      'div',
      { class: 'grid-2', style: { marginTop: '1rem' } },
      el(
        'div',
        { class: 'stack' },
        el(
          'div',
          { class: 'card' },
          el('h2', {}, 'Chi quỹ theo danh mục'),
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
            : el('p', { class: 'muted' }, 'Không có khoản chi quỹ thuộc danh mục chi phí.'),
        ),
        fixedCostsCard(costs),
      ),
      el('div', { class: 'card' }, el('h2', {}, state.groupBy === 'day' ? 'Theo ngày' : 'Theo tháng'), seriesTable(r.series)),
    ),
  );
}

function seriesTable(series) {
  const cols = [
    ['period', 'Kỳ'],
    ['revenueNet', 'Doanh thu thuần'],
    ['cogs', 'Giá vốn'],
    ['grossMargin', 'Lãi gộp'],
    ['cashExpenses', 'Chi quỹ'],
    ['fixedCostsAllocated', 'Cố định'],
    ['operatingProfit', 'Lợi nhuận'],
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
                ? el('td', { class: 'nowrap' }, s.period)
                : el('td', { class: `num ${k === 'operatingProfit' && s[k] < 0 ? 'neg' : ''}` }, money(s[k])),
            ),
          ),
        ),
      ),
    ),
  );
}

// ---------- Chi phí cố định ----------
function fixedCostsCard(costs) {
  return el(
    'div',
    { class: 'card' },
    el(
      'div',
      { class: 'row between' },
      el('h2', { style: { margin: 0 } }, 'Chi phí cố định / tháng'),
      el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => editCost(null) }, '+ Thêm'),
    ),
    el('p', { class: 'small muted' }, 'Mặt bằng, lương cố định, Internet… — chia đều theo số ngày của tháng, chỉ tính trong thời gian hiệu lực.'),
    costs.length
      ? el(
          'table',
          { class: 'table' },
          el(
            'tbody',
            {},
            costs.map((c) =>
              el(
                'tr',
                { class: c.effectiveTo && c.effectiveTo < todayVn() ? 'muted' : '' },
                el('td', {}, c.name, el('div', { class: 'small muted' }, `từ ${c.effectiveFrom}${c.effectiveTo ? ` đến ${c.effectiveTo}` : ''}`)),
                el('td', { class: 'num' }, money(c.monthlyAmount)),
                el(
                  'td',
                  { class: 'row' },
                  el('button', { class: 'btn btn-sm', type: 'button', onclick: () => editCost(c) }, 'Sửa'),
                  el(
                    'button',
                    {
                      class: 'btn btn-sm btn-danger',
                      type: 'button',
                      onclick: () => confirmAndDelete({ url: `/api/admin/fixed-costs/${c.costId}`, label: `khoản "${c.name}"`, onDone: load }),
                    },
                    'Xóa',
                  ),
                ),
              ),
            ),
          ),
        )
      : el('p', { class: 'muted' }, 'Chưa khai báo chi phí cố định.'),
  );
}

function editCost(c) {
  const name = el('input', { class: 'input', name: 'name', maxlength: 100, value: c?.name ?? '', placeholder: 'Ví dụ: Tiền mặt bằng' });
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
    title: c ? `Sửa: ${c.name}` : 'Thêm chi phí cố định',
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
