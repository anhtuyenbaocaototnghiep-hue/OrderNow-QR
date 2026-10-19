// S-39 Lãi / lỗ ƯỚC TÍNH (FEATURE-034, ADR-006 D-31) — chỉ quản lý. Doanh thu thuần − giá vốn − chi quỹ (danh mục chi phí)
// − chi phí cố định phân bổ theo ngày; điểm hòa vốn/ngày = chi phí cố định/ngày ÷ biên lãi gộp %. Biểu đồ cột tự vẽ (SVG).
import { staffApi } from '../api.js';
import { confirmAndDelete, mountAdminShell } from '../admin-shell.js';
import { $, clear, el, errorMessage, modal, money, showFieldErrors, toast, todayVn } from '../ui.js';

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

// ---------- Biểu đồ ----------
const SVG = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...children) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  for (const c of children.flat(Infinity))
    if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}
const SERIES = [
  ['revenueNet', 'Doanh thu thuần', 'pnl-rev'],
  ['cogs', 'Giá vốn', 'pnl-cogs'],
  ['costs', 'Chi phí (quỹ + cố định)', 'pnl-cost'],
];
const short = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr` : `${Math.round(v / 1000)}k`);

function pnlChart(series, breakEven) {
  const pts = series.map((s) => ({ ...s, costs: s.cashExpenses + s.fixedCostsAllocated }));
  const W = Math.max(640, pts.length * 54);
  const H = 260;
  const pad = { l: 56, r: 12, t: 14, b: 34 };
  const max = Math.max(1, breakEven ?? 0, ...pts.flatMap((p) => SERIES.map(([k]) => p[k])));
  const step = 10 ** Math.floor(Math.log10(max));
  const top = Math.ceil(max / step) * step;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - Math.max(0, v) / top);
  const gw = (W - pad.l - pad.r) / pts.length;
  const bw = (gw * 0.8) / SERIES.length;
  return el(
    'div',
    {},
    svg(
      'svg',
      { class: 'chart pnl-chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Biểu đồ doanh thu thuần, giá vốn, chi phí' },
      [0, 0.25, 0.5, 0.75, 1].map((f) => [
        svg('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: y(f * top), y2: y(f * top) }),
        svg('text', { x: pad.l - 6, y: y(f * top) + 4, 'text-anchor': 'end' }, short(f * top)),
      ]),
      pts.map((p, i) => [
        SERIES.map(([k, label, cls], j) =>
          svg(
            'rect',
            { class: `bar ${cls}`, x: pad.l + i * gw + gw * 0.1 + j * bw, y: y(p[k]), width: bw * 0.92, height: Math.max(0, H - pad.b - y(p[k])), rx: 2 },
            svg('title', {}, `${p.period} · ${label}: ${money(p[k])}`),
          ),
        ),
        pts.length <= 31
          ? svg('text', { x: pad.l + i * gw + gw / 2, y: H - pad.b + 16, 'text-anchor': 'middle' }, p.period.length > 7 ? p.period.slice(8, 10) : p.period)
          : null,
      ]),
      breakEven
        ? [
            svg('line', { class: 'pnl-breakeven', x1: pad.l, x2: W - pad.r, y1: y(breakEven), y2: y(breakEven) }),
            svg('text', { x: W - pad.r, y: y(breakEven) - 4, 'text-anchor': 'end', class: 'pnl-breakeven-label' }, `Hòa vốn ${money(breakEven)}/ngày`),
          ]
        : null,
    ),
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
