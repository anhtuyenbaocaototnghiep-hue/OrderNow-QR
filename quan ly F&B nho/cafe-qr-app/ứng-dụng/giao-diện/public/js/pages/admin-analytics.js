// S-41 Phân tích (ADR-006 giai đoạn 8) — chỉ quản lý:
//   Menu engineering (F-041, D-30): biểu đồ phân tán SL × lãi gộp/món, 4 ô theo trung vị, bảng + lọc danh mục, "Ghim món", "Tạo khuyến mãi";
//   Giờ cao điểm (heatmap bảng HTML tô màu), Dự báo doanh thu 7 ngày (± 1 độ lệch chuẩn), So sánh kỳ, Theo bàn (F-042).
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { $, clear, el, errorMessage, money, num, toast, todayVn } from '../ui.js';
import { attachHover, compact, niceScale, svg } from '../chart-kit.js';

await mountAdminShell('analytics');

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const state = {
  tab: 'menu',
  from: addDays(todayVn(), -29),
  to: todayVn(),
  categoryId: '',
  cls: '',
  metric: 'orders',
  period: 'week',
  offset: 0,
  categories: [],
};
const body = el('div');
const TABS = [
  ['menu', 'Menu engineering'],
  ['heatmap', 'Giờ cao điểm'],
  ['forecast', 'Dự báo doanh thu'],
  ['compare', 'So sánh kỳ'],
  ['tables', 'Theo bàn'],
];
const tabs = el(
  'div',
  { class: 'tabs', role: 'tablist' },
  TABS.map(([key, label]) =>
    el(
      'button',
      {
        type: 'button',
        role: 'tab',
        'aria-selected': String(state.tab === key),
        onclick: (e) => {
          state.tab = key;
          tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget)));
          load();
        },
      },
      label,
    ),
  ),
);
clear($('#content'), tabs, body);

async function load() {
  clear(body, el('p', { class: 'muted' }, 'Đang tải…'));
  try {
    if (!state.categories.length) state.categories = await staffApi('/api/admin/categories');
    if (state.tab === 'heatmap') await renderHeatmap();
    else if (state.tab === 'forecast') await renderForecast();
    else if (state.tab === 'compare') await renderCompare();
    else if (state.tab === 'tables') await renderTables();
    else await renderMenu();
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

function rangeFilters(extra = []) {
  const date = (key, label) => {
    const input = el('input', { type: 'date', class: 'input', value: state[key], max: todayVn(), 'aria-label': label });
    input.addEventListener('change', () => {
      state[key] = input.value;
      load();
    });
    return el('div', { class: 'field' }, el('label', {}, label), input);
  };
  return el('div', { class: 'filters' }, date('from', 'Từ ngày'), date('to', 'Đến ngày'), extra);
}
const select = (key, label, options) => {
  const s = el(
    'select',
    { class: 'input', 'aria-label': label },
    options.map(([v, l]) => el('option', { value: v, selected: String(state[key]) === String(v) }, l)),
  );
  s.addEventListener('change', () => {
    state[key] = s.value;
    load();
  });
  return el('div', { class: 'field' }, el('label', {}, label), s);
};

// ---------- F-041 Menu engineering ----------
const CLASS = {
  STAR: ['Ngôi sao', 'me-star'],
  PLOWHORSE: ['Ngựa kéo', 'me-plow'],
  PUZZLE: ['Câu đố', 'me-puzzle'],
  DOG: ['Chó (cân nhắc bỏ)', 'me-dog'],
  INSUFFICIENT: ['Chưa đủ dữ liệu', 'me-na'],
};

async function renderMenu() {
  const q = new URLSearchParams({ from: state.from, to: state.to, ...(state.categoryId ? { categoryId: state.categoryId } : {}) });
  const r = await staffApi(`/api/admin/reports/menu-engineering?${q}`);
  const rows = r.items.filter((i) => !state.cls || i.class === state.cls);
  clear(
    body,
    rangeFilters([
      select('categoryId', 'Danh mục', [['', 'Tất cả'], ...state.categories.map((c) => [c.categoryId, c.name])]),
      select('cls', 'Nhóm', [['', 'Tất cả'], ...Object.entries(CLASS).map(([k, [l]]) => [k, l])]),
    ]),
    r.estimatedCogs
      ? el('div', { class: 'alert warning' }, 'Một số dòng chưa có giá vốn chốt — đã ước tính theo định lượng × giá vốn bình quân hiện tại.')
      : null,
    el(
      'div',
      { class: 'grid-2 me-grid' },
      el('div', { class: 'card' }, el('h2', {}, 'Số lượng × lãi gộp / món'), scatter(r)),
      el(
        'div',
        { class: 'card' },
        el('h2', {}, 'Gợi ý theo nhóm'),
        el(
          'ul',
          { class: 'small' },
          ['STAR', 'PLOWHORSE', 'PUZZLE', 'DOG'].map((k) =>
            el('li', {}, el('span', { class: `badge ${CLASS[k][1]}` }, CLASS[k][0]), ` ${r.items.find((i) => i.class === k)?.advice ?? ''}`),
          ),
        ),
        el('p', { class: 'small muted' }, `Trung vị: ${num(r.medianQty ?? 0)} phần · ${money(r.medianMarginPerUnit ?? 0)} lãi/món (món bán ≥ 5 lần trong kỳ).`),
      ),
    ),
    el(
      'div',
      { class: 'table-wrap', style: { marginTop: '1rem' } },
      el(
        'table',
        { class: 'table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            ['Món', 'Nhóm', 'SL', 'Tỉ trọng', 'Doanh thu', 'Giá vốn', 'Lãi gộp', 'Lãi / món', ''].map((h, i) =>
              el('th', { class: i >= 2 && i <= 7 ? 'num' : '' }, h),
            ),
          ),
        ),
        el(
          'tbody',
          {},
          rows.map((i) =>
            el(
              'tr',
              {},
              el('td', {}, i.name, el('div', { class: 'small muted' }, i.categoryName ?? '')),
              el('td', {}, el('span', { class: `badge ${CLASS[i.class][1]}`, title: i.advice }, CLASS[i.class][0])),
              el('td', { class: 'num' }, num(i.qty)),
              el('td', { class: 'num' }, `${i.share}%`),
              el('td', { class: 'num' }, money(i.revenue)),
              el('td', { class: 'num' }, money(i.cogs), i.estimatedQty ? el('span', { class: 'small muted', title: 'Có phần ước tính' }, '*') : null),
              el('td', { class: 'num' }, money(i.margin)),
              el('td', { class: 'num' }, money(i.marginPerUnit)),
              el(
                'td',
                { class: 'row' },
                i.itemType !== 'COMBO' && !i.archived ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => pin(i) }, 'Ghim món này') : null,
                !i.archived ? el('a', { class: 'btn btn-sm', href: `/admin/promotions?menuItemId=${i.menuItemId}` }, 'Tạo khuyến mãi') : null,
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

async function pin(i) {
  try {
    await staffApi('/api/admin/reports/menu-engineering/pin', { method: 'POST', body: { menuItemId: i.menuItemId } });
    toast(`Đã ghim "${i.name}" vào mục gợi ý của thực đơn khách`, 'success');
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

function scatter(r) {
  const pts = r.items.filter((i) => i.class !== 'INSUFFICIENT');
  if (!pts.length) return el('p', { class: 'muted' }, 'Chưa đủ dữ liệu (cần món bán ≥ 5 lần).');
  const W = 560;
  const H = 320;
  const pad = { l: 56, r: 12, t: 12, b: 34 };
  const maxX = Math.max(...pts.map((p) => p.qty)) * 1.1;
  const minY = Math.min(0, ...pts.map((p) => p.marginPerUnit));
  const maxY = Math.max(1, ...pts.map((p) => p.marginPerUnit)) * 1.1;
  const x = (v) => pad.l + ((W - pad.l - pad.r) * v) / maxX;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - minY) / (maxY - minY));
  return svg(
    'svg',
    { class: 'chart me-chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Biểu đồ phân tán menu engineering' },
    svg('line', { class: 'grid', x1: x(r.medianQty), x2: x(r.medianQty), y1: pad.t, y2: H - pad.b }),
    svg('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: y(r.medianMarginPerUnit), y2: y(r.medianMarginPerUnit) }),
    svg('text', { x: W - pad.r, y: pad.t + 10, 'text-anchor': 'end' }, 'Ngôi sao'),
    svg('text', { x: pad.l + 4, y: pad.t + 10 }, 'Câu đố'),
    svg('text', { x: W - pad.r, y: H - pad.b - 4, 'text-anchor': 'end' }, 'Ngựa kéo'),
    svg('text', { x: pad.l + 4, y: H - pad.b - 4 }, 'Chó'),
    svg('text', { x: (W + pad.l) / 2, y: H - 6, 'text-anchor': 'middle' }, 'Số lượng bán →'),
    svg('text', { x: pad.l - 6, y: y(maxY / 1.1) + 4, 'text-anchor': 'end' }, compact(maxY / 1.1)),
    svg('text', { x: pad.l - 6, y: y(r.medianMarginPerUnit) + 4, 'text-anchor': 'end' }, compact(r.medianMarginPerUnit)),
    pts.map((p) =>
      svg(
        'circle',
        { class: `dot ${CLASS[p.class][1]}`, cx: x(p.qty), cy: y(p.marginPerUnit), r: 6 },
        svg('title', {}, `${p.name}: ${p.qty} phần · ${money(p.marginPerUnit)}/món`),
      ),
    ),
  );
}

// ---------- F-042 Giờ cao điểm ----------
const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
async function renderHeatmap() {
  const r = await staffApi(`/api/admin/reports/heatmap?from=${state.from}&to=${state.to}&metric=${state.metric}`);
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => r.matrix.some((row) => row[h] > 0) || (h >= 6 && h <= 22));
  const shade = (v) => (r.max ? Math.round((v / r.max) * 100) / 100 : 0);
  clear(
    body,
    rangeFilters([
      select('metric', 'Chỉ số', [
        ['orders', 'Số đơn'],
        ['revenue', 'Doanh thu'],
      ]),
    ]),
    el(
      'div',
      { class: 'table-wrap' },
      el(
        'table',
        { class: 'heatmap' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', {}, ''),
            hours.map((h) => el('th', {}, `${h}h`)),
          ),
        ),
        el(
          'tbody',
          {},
          r.matrix.map((row, d) =>
            el(
              'tr',
              {},
              el('th', {}, DOW[d]),
              hours.map((h) =>
                el(
                  'td',
                  {
                    style: { '--heat': shade(row[h]) },
                    title: `${DOW[d]} ${h}h: ${state.metric === 'revenue' ? money(row[h]) : `${row[h]} đơn`}`,
                    class: row[h] === r.max && r.max > 0 ? 'peak' : '',
                  },
                  row[h] ? (state.metric === 'revenue' ? compact(row[h]) : row[h]) : '',
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    el('p', { class: 'small muted' }, 'Giờ quán (UTC+7). Ô đậm nhất = giờ đông nhất trong kỳ — dùng để xếp lịch làm / chuẩn bị nguyên liệu.'),
  );
}

// ---------- F-042 Dự báo doanh thu (TASK-069, ADR-015 D-60: thực tế xanh --viz-1 nét liền, dự báo cam --viz-2 nét đứt nối tiếp + dải mờ, mốc "Hôm nay") ----------
async function renderForecast() {
  const r = await staffApi('/api/admin/reports/revenue-forecast?days=7');
  const pts = [
    ...r.history.map((h) => ({ date: h.date, value: h.revenue, kind: 'hist' })),
    ...r.forecast.map((f) => ({ date: f.date, value: f.forecast, low: f.low, high: f.high, kind: 'fc' })),
  ];
  const W = Math.max(640, pts.length * 22);
  const H = 280;
  const pad = { l: 56, r: 16, t: 22, b: 34 };
  const base = H - pad.b;
  const { top, ticks } = niceScale(Math.max(...pts.map((p) => p.high ?? p.value)));
  const x = (i) => pad.l + ((W - pad.l - pad.r) * i) / Math.max(1, pts.length - 1);
  const y = (v) => pad.t + (base - pad.t) * (1 - Math.max(0, v) / top);
  const path = (list, key = 'value') => list.map((i, k) => `${k ? 'L' : 'M'}${x(i)},${y(pts[i][key])}`).join(' ');
  const histIdx = pts.flatMap((p, i) => (p.kind === 'hist' ? [i] : []));
  const fcIdx = pts.flatMap((p, i) => (p.kind === 'fc' ? [i] : []));
  // Đường dự báo / dải mờ bắt đầu từ ngày thực tế cuối (hôm qua) để hai đoạn liền nhau, không bị hở.
  const lastHist = histIdx.at(-1);
  const fcLine = lastHist === undefined ? fcIdx : [lastHist, ...fcIdx];
  const edge = (key) => fcLine.map((i) => `${x(i)},${y(i === lastHist ? pts[i].value : pts[i][key])}`);
  const bandPath = fcIdx.length ? `M${edge('high').join(' L')} L${edge('low').reverse().join(' L')} Z` : '';
  const today = fcIdx[0];
  const anchor = today ?? pts.length - 1;
  const dm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const dow = (d) => DOW[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7];
  const chart = svg(
    'svg',
    {
      class: 'chart fc-chart',
      viewBox: `0 0 ${W} ${H}`,
      role: 'img',
      'aria-label': 'Biểu đồ doanh thu thuần 28 ngày qua và dự báo 7 ngày tới — rê chuột hoặc dùng phím mũi tên để xem số từng ngày',
    },
    ticks.map((t) => [
      svg('line', { class: t ? 'grid' : 'axis-line', x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t) }),
      svg('text', { class: 'tick', x: pad.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, compact(t)),
    ]),
    today !== undefined
      ? [
          svg('line', { class: 'fc-today', x1: x(today), x2: x(today), y1: pad.t - 6, y2: base }),
          svg('text', { class: 'fc-today-label', x: x(today) + 6, y: pad.t - 8 }, 'Hôm nay'),
        ]
      : null,
    bandPath ? svg('path', { class: 'fc-band', d: bandPath }) : null,
    histIdx.length ? svg('path', { class: 'fc-hist', d: path(histIdx) }) : null,
    fcIdx.length ? svg('path', { class: 'fc-line', d: path(fcLine) }) : null,
    fcIdx.map((i) => svg('circle', { class: 'fc-dot', cx: x(i), cy: y(pts[i].value), r: 4 })),
    pts.map((p, i) =>
      (i - anchor) % 7 === 0 || i === pts.length - 1 ? svg('text', { class: 'tick', x: x(i), y: base + 18, 'text-anchor': 'middle' }, dm(p.date)) : null,
    ),
  );
  const plot = el('div', {}, chart);
  attachHover(chart, {
    width: W,
    count: pts.length,
    xAt: x,
    yTop: pad.t,
    yBottom: base,
    title: (i) => `${dow(pts[i].date)} ${dm(pts[i].date)}${pts[i].kind === 'fc' ? ' · dự báo' : ''}`,
    rows: (i) =>
      pts[i].kind === 'fc'
        ? [
            ['Dự báo', money(pts[i].value)],
            ['Khoảng', `${money(pts[i].low)} – ${money(pts[i].high)}`],
          ]
        : [['Doanh thu thuần', money(pts[i].value)]],
  });
  clear(
    body,
    el(
      'div',
      { class: 'card' },
      el('h2', {}, 'Doanh thu thuần 28 ngày qua + dự báo 7 ngày tới'),
      plot,
      el(
        'div',
        { class: 'row small legend' },
        el('span', {}, el('i', { class: 'fc-key fc-key-line' }), 'Thực tế'),
        el('span', {}, el('i', { class: 'fc-key fc-key-dash' }), 'Dự báo'),
        el('span', {}, el('i', { class: 'fc-key fc-key-band' }), 'Khoảng ± 1 độ lệch chuẩn'),
      ),
      el('p', { class: 'small muted' }, 'Mỗi ngày tới = trung bình có trọng số 4 cùng thứ gần nhất (0,4 · 0,3 · 0,2 · 0,1); dải mờ = ± 1 độ lệch chuẩn.'),
    ),
    el(
      'div',
      { class: 'table-wrap', style: { marginTop: '1rem' } },
      el(
        'table',
        { class: 'table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            ['Ngày', 'Dự báo', 'Khoảng', 'Số tuần mẫu'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)),
          ),
        ),
        el(
          'tbody',
          {},
          r.forecast.map((f) =>
            el(
              'tr',
              {},
              el('td', {}, `${dow(f.date)} ${dm(f.date)}`),
              el('td', { class: 'num' }, money(f.forecast)),
              el('td', { class: 'num' }, `${money(f.low)} – ${money(f.high)}`),
              el('td', { class: 'num' }, f.samples),
            ),
          ),
        ),
      ),
    ),
  );
}

// ---------- F-042 So sánh kỳ ----------
async function renderCompare() {
  const r = await staffApi(`/api/admin/reports/compare?period=${state.period}&offset=${state.offset}`);
  const card = (label, now, before, change, fmt, suffix = '') =>
    el(
      'div',
      { class: 'card kpi' },
      el('div', { class: 'label' }, label),
      el('div', { class: 'value' }, now === null ? '—' : fmt(now)),
      el(
        'div',
        { class: `small ${change === null ? 'muted' : change >= 0 ? 'up' : 'down'}` },
        change === null ? `Kỳ trước ${before === null ? '—' : fmt(before)}` : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}${suffix} so với ${fmt(before)}`,
      ),
    );
  const off = el(
    'select',
    { class: 'input', 'aria-label': 'Kỳ' },
    [0, 1, 2, 3].map((o) => el('option', { value: o, selected: o === Number(state.offset) }, o === 0 ? 'Kỳ này' : `${o} kỳ trước`)),
  );
  off.addEventListener('change', () => {
    state.offset = Number(off.value);
    load();
  });
  const fmtD = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  clear(
    body,
    el(
      'div',
      { class: 'filters' },
      select('period', 'Theo', [
        ['week', 'Tuần'],
        ['month', 'Tháng'],
      ]),
      el('div', { class: 'field' }, el('label', {}, 'Kỳ'), off),
    ),
    el(
      'p',
      { class: 'small muted' },
      `${fmtD(r.current.from)}–${fmtD(r.current.to)} so với ${fmtD(r.previous.from)}–${fmtD(r.previous.to)}${r.partial ? ' (kỳ đang diễn ra — so cùng số ngày)' : ''}`,
    ),
    el(
      'div',
      { class: 'kpis' },
      card('Doanh thu thuần', r.current.revenueNet, r.previous.revenueNet, r.change.revenueNet, money, '%'),
      card('Số đơn', r.current.orders, r.previous.orders, r.change.orders, num, '%'),
      card('Bill trung bình', r.current.avgBill, r.previous.avgBill, r.change.avgBill, money, '%'),
      card('Hội viên mới', r.current.newMembers, r.previous.newMembers, r.change.newMembers, num, '%'),
      card('Giá vốn / doanh thu', r.current.cogsPct, r.previous.cogsPct, r.change.cogsPct, (v) => `${v}%`, ' điểm %'),
    ),
  );
}

// ---------- F-042 Theo bàn ----------
async function renderTables() {
  const r = await staffApi(`/api/admin/reports/tables?from=${state.from}&to=${state.to}`);
  clear(
    body,
    rangeFilters(),
    el(
      'p',
      { class: 'small muted' },
      `Trung vị: ${money(r.medianRevenuePerHour)}/giờ ngồi · ${num(r.medianMinutes)} phút/lượt. Cờ đỏ = ngồi lâu (≥ trung vị) mà doanh thu/giờ dưới trung vị.`,
    ),
    el(
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
            ['Bàn', 'Số lượt', 'Doanh thu', 'Ngồi TB', 'Doanh thu / giờ ngồi', ''].map((h, i) => el('th', { class: i && i < 5 ? 'num' : '' }, h)),
          ),
        ),
        el(
          'tbody',
          {},
          r.tables.map((t) =>
            el(
              'tr',
              { class: t.flag ? 'loss-flag' : '' },
              el('td', {}, t.name),
              el('td', { class: 'num' }, t.sessions),
              el('td', { class: 'num' }, money(t.revenue)),
              el('td', { class: 'num' }, t.sessions ? `${t.avgMinutes} phút` : '—'),
              el('td', { class: 'num' }, t.sessions ? money(t.revenuePerHour) : '—'),
              el('td', {}, t.flag ? el('span', { class: 'badge danger' }, 'Ngồi lâu – doanh thu thấp') : null),
            ),
          ),
        ),
      ),
    ),
  );
}

await load();
