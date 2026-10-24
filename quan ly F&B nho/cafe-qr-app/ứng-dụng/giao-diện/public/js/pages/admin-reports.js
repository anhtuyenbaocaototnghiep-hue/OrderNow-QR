// S-25 Báo cáo (FEATURE-012): khoảng ngày hợp lệ (BR-005), KPI, biểu đồ theo ngày/giờ, món bán chạy, nguyên liệu sắp hết,
// thu tiền theo nhân viên; tab Lịch sử đơn (Q-014/ADR-003) và Thu tiền.
// ADR-005: doanh thu = tiền thực thu − hoàn tiền; tab Marketing (hội viên, chiết khấu theo loại, khuyến mãi, giảm tay).
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { printUrl } from '../print.js';
import { $, clear, dateTime, el, errorMessage, modal, money, num, paymentBadge, statusBadge, todayVn } from '../ui.js';
import { icon } from '../icons.js';

await mountAdminShell('reports');

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const fmtDate = (d) => d.split('-').reverse().join('/');
const state = { tab: 'revenue', from: addDays(todayVn(), -6), to: todayVn(), page: 1, status: '', type: '' };

// ---------- Bộ lọc ----------
const fromInput = el('input', { type: 'date', class: 'input', id: 'from', value: state.from, max: todayVn() });
const toInput = el('input', { type: 'date', class: 'input', id: 'to', value: state.to, max: todayVn() });
const viewBtn = el('button', { class: 'btn btn-primary', type: 'button', onclick: () => apply() }, 'Xem');
const rangeError = el('div', { class: 'field-error', hidden: true }, 'Khoảng thời gian không hợp lệ');
const body = el('div');

function validRange() {
  const f = fromInput.value;
  const t = toInput.value;
  const ok = Boolean(f && t && f <= t && t <= todayVn());
  viewBtn.disabled = !ok; // AC-012-02
  rangeError.hidden = ok;
  fromInput.classList.toggle('invalid', !ok);
  toInput.classList.toggle('invalid', !ok);
  return ok;
}
fromInput.addEventListener('input', validRange);
toInput.addEventListener('input', validRange);

function quick(label, from, to) {
  return el(
    'button',
    {
      class: 'btn btn-sm',
      type: 'button',
      onclick: () => {
        fromInput.value = from;
        toInput.value = to;
        validRange();
        apply();
      },
    },
    label,
  );
}

function apply() {
  if (!validRange()) return;
  state.from = fromInput.value;
  state.to = toInput.value;
  state.page = 1;
  load();
}

const tabs = el(
  'div',
  { class: 'tabs', role: 'tablist' },
  [
    ['revenue', 'Doanh thu'],
    ['history', 'Lịch sử đơn'],
    ['payments', 'Thu tiền'],
    ['marketing', 'Marketing & khách hàng'],
  ].map(([key, label]) =>
    el(
      'button',
      {
        type: 'button',
        role: 'tab',
        'aria-selected': String(state.tab === key),
        dataset: { tab: key },
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

const today = todayVn();
const monthStart = `${today.slice(0, 8)}01`;
clear(
  $('#content'),
  el(
    'div',
    { class: 'filters' },
    quick('Hôm nay', today, today),
    quick('7 ngày', addDays(today, -6), today),
    quick('Tháng này', monthStart, today),
    el('div', { class: 'field' }, el('label', { for: 'from' }, 'Từ ngày'), fromInput),
    el('div', { class: 'field' }, el('label', { for: 'to' }, 'Đến ngày'), toInput),
    viewBtn,
    rangeError,
  ),
  tabs,
  body,
);

async function load() {
  clear(body, el('p', { class: 'muted' }, 'Đang tải…'));
  try {
    if (state.tab === 'revenue') renderRevenue(await staffApi(`/api/admin/reports/revenue?from=${state.from}&to=${state.to}`));
    else if (state.tab === 'history') await loadHistory();
    else if (state.tab === 'marketing') renderMarketing(await staffApi(`/api/admin/reports/marketing?from=${state.from}&to=${state.to}`));
    else renderPayments(await staffApi(`/api/admin/payments?from=${state.from}&to=${state.to}`));
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

// ---------- Doanh thu ----------
const SVG = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...children) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  for (const c of children.flat(Infinity))
    if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}

function barChart(points) {
  const W = Math.max(640, points.length * 38);
  const H = 240;
  const pad = { l: 64, r: 12, t: 12, b: 34 };
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = 10 ** Math.floor(Math.log10(max));
  const top = Math.ceil(max / step) * step;
  const bw = (W - pad.l - pad.r) / points.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  return svg(
    'svg',
    { class: 'chart rev-chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Biểu đồ doanh thu' },
    ticks.map((t) => [
      svg('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t) }),
      svg('text', { x: pad.l - 6, y: y(t) + 4, 'text-anchor': 'end' }, t >= 1000 ? `${num(t / 1000)}k` : num(t)),
    ]),
    points.map((p, i) => {
      const h = Math.max(0, H - pad.b - y(p.value));
      return [
        svg(
          'rect',
          { class: 'bar', x: pad.l + i * bw + bw * 0.15, y: y(p.value), width: bw * 0.7, height: h, rx: 3 },
          svg('title', {}, `${p.label}: ${money(p.value)} · ${p.orders} đơn`),
        ),
        points.length <= 31 ? svg('text', { x: pad.l + i * bw + bw / 2, y: H - pad.b + 16, 'text-anchor': 'middle' }, p.label) : null,
      ];
    }),
  );
}

function renderRevenue(r) {
  const points = r.byHour
    ? Array.from({ length: 24 }, (_, h) => {
        const d = r.byHour.find((x) => x.hour === h);
        return { label: `${h}h`, value: d?.revenue ?? 0, orders: d?.orders ?? 0 };
      }).filter((p, h) => p.value > 0 || (h >= 6 && h <= 22))
    : r.byDay.map((d) => ({ label: fmtDate(d.date).slice(0, 5), value: d.revenue, orders: d.orders }));
  clear(
    body,
    el(
      'div',
      { class: 'kpis' },
      el(
        'div',
        { class: 'card kpi' },
        el('div', { class: 'label' }, 'Tổng doanh thu'),
        el('div', { class: 'value' }, money(r.totalRevenue)),
        r.refunded ? el('div', { class: 'small muted' }, `đã trừ hoàn tiền ${money(r.refunded)}`) : null,
      ),
      // F-056 (ADR-019 D-72): doanh thu theo cách trả — tiền mặt đối chiếu két, chuyển khoản đối chiếu tài khoản ngân hàng
      ['CASH', 'TRANSFER'].map((k) =>
        el(
          'div',
          { class: 'card kpi' },
          el('div', { class: 'label' }, k === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'),
          el('div', { class: 'value' }, money(r.byMethod?.[k]?.revenue ?? 0)),
          el('div', { class: 'small muted' }, `${num(r.byMethod?.[k]?.payments ?? 0)} lượt thu`),
        ),
      ),
      el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Số hóa đơn (đơn đã thu)'), el('div', { class: 'value' }, num(r.orderCount))),
      el(
        'div',
        { class: 'card kpi' },
        el('div', { class: 'label' }, 'Trung bình / đơn'),
        el('div', { class: 'value' }, money(r.orderCount ? r.totalRevenue / r.orderCount : 0)),
      ),
      el(
        'div',
        { class: 'card kpi' },
        el('div', { class: 'label' }, 'Nguyên liệu sắp hết'),
        el('div', { class: 'value', style: { color: r.lowStock.length ? 'var(--c-danger)' : '' } }, r.lowStock.length),
      ),
    ),
    el(
      'div',
      { class: 'card', style: { marginBottom: '1rem' } },
      el(
        'h2',
        { style: { fontSize: '1rem' } },
        r.byHour ? `Doanh thu theo giờ — ${fmtDate(r.from)}` : `Doanh thu theo ngày — ${fmtDate(r.from)} đến ${fmtDate(r.to)}`,
      ),
      barChart(points),
      el(
        'p',
        { class: 'muted small' },
        'Tiền thực thu theo ngày thanh toán (giờ Việt Nam), đã trừ khuyến mãi / hội viên / giảm giá và hoàn tiền; không gồm đơn đã hủy hoặc chưa thu.',
      ),
    ),
    el(
      'div',
      { class: 'grid-2', style: { gridTemplateColumns: '1fr 1fr' } },
      el(
        'div',
        { class: 'card' },
        el('h2', { style: { fontSize: '1rem' } }, 'Món bán chạy'),
        r.topItems.length === 0
          ? el('p', { class: 'muted' }, 'Chưa có dữ liệu.')
          : el(
              'div',
              { class: 'table-wrap' },
              el(
                'table',
                { class: 'table' },
                el(
                  'thead',
                  {},
                  el('tr', {}, el('th', {}, '#'), el('th', {}, 'Món'), el('th', { class: 'num' }, 'SL'), el('th', { class: 'num' }, 'Doanh thu')),
                ),
                el(
                  'tbody',
                  {},
                  r.topItems.map((t, i) =>
                    el(
                      'tr',
                      {},
                      el('td', {}, i + 1),
                      el('td', {}, t.name),
                      el('td', { class: 'num' }, num(t.qty)),
                      el('td', { class: 'num' }, money(t.revenue)),
                    ),
                  ),
                ),
              ),
            ),
      ),
      el(
        'div',
        { class: 'stack' },
        el(
          'div',
          { class: 'card' },
          el('h2', { style: { fontSize: '1rem' } }, 'Nguyên liệu sắp hết'),
          r.lowStock.length === 0
            ? el('p', { class: 'muted' }, 'Không có nguyên liệu nào dưới ngưỡng.')
            : el(
                'ul',
                {},
                r.lowStock.map((l) => el('li', {}, el('strong', {}, l.name), ` — còn ${num(l.available)} ${l.unit} (ngưỡng ${num(l.threshold)})`)),
              ),
          el('a', { href: '/admin/ingredients', class: 'small' }, 'Đi tới kho nguyên liệu →'),
        ),
        el(
          'div',
          { class: 'card' },
          el('h2', { style: { fontSize: '1rem' } }, 'Thu tiền theo nhân viên'),
          r.byStaff.length === 0
            ? el('p', { class: 'muted' }, 'Chưa có lượt thu tiền.')
            : el(
                'div',
                { class: 'table-wrap' },
                el(
                  'table',
                  { class: 'table' },
                  el('thead', {}, el('tr', {}, el('th', {}, 'Nhân viên'), el('th', { class: 'num' }, 'Lượt thu'), el('th', { class: 'num' }, 'Số tiền'))),
                  el(
                    'tbody',
                    {},
                    r.byStaff.map((s) =>
                      el('tr', {}, el('td', {}, s.fullName), el('td', { class: 'num' }, s.payments), el('td', { class: 'num' }, money(s.amount))),
                    ),
                  ),
                ),
              ),
        ),
      ),
    ),
  );
}

// ---------- Lịch sử đơn ----------
const STATUS_OPTIONS = [
  ['', 'Mọi trạng thái'],
  ['PENDING', 'Chờ xác nhận'],
  ['PREPARING', 'Đang chuẩn bị'],
  ['COMPLETED', 'Đã xong'],
  ['CANCELLED', 'Đã hủy'],
];
const TYPE_OPTIONS = [
  ['', 'Tại bàn + mang đi'],
  ['DINE_IN', 'Tại bàn'],
  ['TAKE_AWAY', 'Mang đi'],
];
const select = (options, value, onchange) =>
  el(
    'select',
    { class: 'input', style: { width: 'auto' }, onchange: (e) => onchange(e.target.value) },
    options.map(([v, l]) => el('option', { value: v, selected: v === value }, l)),
  );

async function loadHistory() {
  const q = new URLSearchParams({ from: state.from, to: state.to, page: state.page, pageSize: 30 });
  if (state.status) q.set('status', state.status);
  if (state.type) q.set('type', state.type);
  const r = await staffApi(`/api/admin/orders?${q}`);
  const pages = Math.max(1, Math.ceil(r.total / r.pageSize));
  clear(
    body,
    el(
      'div',
      { class: 'filters' },
      select(STATUS_OPTIONS, state.status, (v) => {
        state.status = v;
        state.page = 1;
        load();
      }),
      select(TYPE_OPTIONS, state.type, (v) => {
        state.type = v;
        state.page = 1;
        load();
      }),
      el('span', { class: 'muted small' }, `${r.total} đơn (theo ngày tạo)`),
    ),
    r.items.length === 0
      ? el('div', { class: 'empty card' }, 'Không có đơn nào trong khoảng này.')
      : el(
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
                ['Mã', 'Thời gian', 'Nơi', 'Món', 'Tổng', 'Trạng thái', 'Thanh toán'].map((h, i) => el('th', { class: i === 4 ? 'num' : '' }, h)),
              ),
            ),
            el(
              'tbody',
              {},
              r.items.map((o) =>
                el(
                  'tr',
                  { style: { cursor: 'pointer' }, onclick: () => showOrder(o) },
                  el('td', { class: 'mono' }, o.orderCode),
                  el('td', { class: 'nowrap' }, dateTime(o.createdAt)),
                  el('td', {}, o.type === 'TAKE_AWAY' ? 'Mang đi' : o.table?.name),
                  el('td', { class: 'small' }, o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')),
                  el('td', { class: 'num' }, money(o.totalAmount)),
                  el('td', {}, statusBadge(o.status)),
                  el('td', {}, paymentBadge(o.paymentStatus)),
                ),
              ),
            ),
          ),
        ),
    el(
      'div',
      { class: 'pager' },
      el(
        'button',
        {
          class: 'btn btn-sm',
          type: 'button',
          disabled: state.page <= 1,
          onclick: () => {
            state.page--;
            load();
          },
        },
        '‹ Trước',
      ),
      el('span', { class: 'small' }, `Trang ${state.page}/${pages}`),
      el(
        'button',
        {
          class: 'btn btn-sm',
          type: 'button',
          disabled: state.page >= pages,
          onclick: () => {
            state.page++;
            load();
          },
        },
        'Sau ›',
      ),
    ),
  );
}

function showOrder(o) {
  const actions = [];
  if (o.paymentStatus === 'PAID' && o.type === 'TAKE_AWAY')
    actions.push({ label: 'In lại hóa đơn', onClick: () => printUrl(`/pos/orders/${o.orderId}/receipt`) });
  if (o.paymentStatus === 'PAID' && o.sessionId)
    actions.push({ label: 'In lại hóa đơn bàn', onClick: () => printUrl(`/pos/sessions/${o.sessionId}/receipt?mode=final`) });
  actions.push({ label: 'Đóng', class: 'btn-primary' });
  modal({
    title: `Đơn #${o.orderCode}`,
    body: el(
      'div',
      { class: 'stack' },
      el(
        'div',
        { class: 'row wrap' },
        statusBadge(o.status),
        paymentBadge(o.paymentStatus),
        el('span', { class: 'muted' }, o.type === 'TAKE_AWAY' ? 'Mang đi' : o.table?.name),
      ),
      el(
        'div',
        { class: 'small muted' },
        `Tạo: ${dateTime(o.createdAt)}`,
        o.paidAt ? ` · Thu tiền: ${dateTime(o.paidAt)}` : '',
        o.completedAt ? ` · Xong: ${dateTime(o.completedAt)}` : '',
        o.cancelledAt ? ` · Hủy: ${dateTime(o.cancelledAt)}` : '',
      ),
      o.cancelReason ? el('div', { class: 'alert danger' }, `Lý do hủy: ${o.cancelReason}`) : null,
      el(
        'ul',
        {},
        o.items.map((i) => el('li', {}, `${i.quantity} × ${i.name} — ${money(i.lineTotal)}`, i.note ? ` (${i.note})` : '')),
      ),
      el('div', { class: 'due' }, el('span', {}, 'Tổng'), el('span', {}, money(o.totalAmount))),
    ),
    actions,
  });
}

// ---------- Thu tiền ----------
function renderPayments(list) {
  const total = list.reduce((s, p) => s + p.amountDue, 0);
  clear(
    body,
    el('p', { class: 'muted' }, `${list.length} lượt thu · tổng ${money(total)}`),
    list.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có lượt thu tiền nào.')
      : el(
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
                ['Thời gian', 'Bàn / đơn', 'Cách trả', 'Giảm', 'Phải thu', 'Khách đưa', 'Tiền thừa', 'Đã hoàn', 'Thu ngân'].map((h, i) =>
                  el('th', { class: i >= 3 && i <= 7 ? 'num' : '' }, h),
                ),
              ),
            ),
            el(
              'tbody',
              {},
              list.map((p) =>
                el(
                  'tr',
                  {},
                  el('td', { class: 'nowrap' }, dateTime(p.paidAt)),
                  el(
                    'td',
                    {},
                    p.orderCode ? `${p.target} · #${p.orderCode}` : p.target,
                    p.member ? el('div', { class: 'small muted' }, icon('star', { label: 'Hội viên' }), p.member) : null,
                    p.manualReason ? el('div', { class: 'small muted' }, `Giảm tay: ${p.manualReason}`) : null,
                  ),
                  el('td', {}, p.method === 'TRANSFER' ? 'Chuyển khoản' : 'Tiền mặt'),
                  el('td', { class: 'num' }, p.discount ? `−${money(p.discount)}` : '—'),
                  el('td', { class: 'num' }, money(p.amountDue)),
                  el('td', { class: 'num' }, money(p.amountReceived)),
                  el('td', { class: 'num' }, money(p.changeGiven)),
                  el('td', { class: 'num' }, p.refunded ? money(p.refunded) : '—'),
                  el('td', {}, p.receivedBy),
                ),
              ),
            ),
          ),
        ),
  );
}

// ---------- Marketing & khách hàng (ADR-005) ----------
function renderMarketing(r) {
  const kpi = (label, value, sub) =>
    el(
      'div',
      { class: 'card kpi' },
      el('div', { class: 'label' }, label),
      el('div', { class: 'value' }, value),
      sub ? el('div', { class: 'small muted' }, sub) : null,
    );
  const mv = r.memberVsWalkin;
  const total = mv.member.amount + mv.walkin.amount;
  const share = total ? Math.round((1000 * mv.member.amount) / total) / 10 : 0;
  clear(
    body,
    el(
      'div',
      { class: 'kpis' },
      kpi('Hội viên mới', num(r.newMemberTotal)),
      kpi('Doanh thu hội viên', money(mv.member.amount), `${mv.member.payments} lượt · ${share}% tổng`),
      kpi('Doanh thu khách lẻ', money(mv.walkin.amount), `${mv.walkin.payments} lượt`),
      kpi('Quay lại trong 30 ngày', `${r.return30.rate}%`, `${r.return30.returning}/${r.return30.activeMembers} hội viên ghé ≥ 2 lần`),
    ),
    el(
      'div',
      { class: 'grid-2', style: { gridTemplateColumns: '1fr 1fr' } },
      el(
        'div',
        { class: 'card' },
        el('h2', { style: { fontSize: '1rem' } }, 'Chiết khấu theo loại'),
        el(
          'table',
          { class: 'table' },
          el(
            'tbody',
            {},
            [
              ['Khuyến mãi (giá món + theo đơn)', r.discounts.promo],
              ['Hội viên', r.discounts.member],
              ['Giảm giá tay', r.discounts.manual],
              ['Làm tròn', r.discounts.rounding],
              ['Hoàn tiền', r.discounts.refunds],
            ].map(([l, v]) => el('tr', {}, el('td', {}, l), el('td', { class: 'num' }, money(v)))),
          ),
        ),
      ),
      el(
        'div',
        { class: 'card' },
        el('h2', { style: { fontSize: '1rem' } }, 'Top khuyến mãi'),
        r.topPromotions.length === 0
          ? el('p', { class: 'muted' }, 'Chưa có lượt dùng khuyến mãi.')
          : el(
              'table',
              { class: 'table' },
              el('thead', {}, el('tr', {}, el('th', {}, 'Khuyến mãi'), el('th', { class: 'num' }, 'Lượt'), el('th', { class: 'num' }, 'Tiền giảm'))),
              el(
                'tbody',
                {},
                r.topPromotions.map((p) =>
                  el('tr', {}, el('td', {}, p.name), el('td', { class: 'num' }, p.uses), el('td', { class: 'num' }, money(p.discount))),
                ),
              ),
            ),
      ),
    ),
    el(
      'div',
      { class: 'grid-2', style: { gridTemplateColumns: '1fr 1fr', marginTop: '1rem' } },
      el(
        'div',
        { class: 'card' },
        el('h2', { style: { fontSize: '1rem' } }, 'Hội viên mới theo ngày'),
        r.newMembers.length === 0
          ? el('p', { class: 'muted' }, 'Chưa có.')
          : el(
              'ul',
              {},
              r.newMembers.map((d) => el('li', {}, `${fmtDate(d.date)}: ${d.count}`)),
            ),
      ),
      el(
        'div',
        { class: 'card' },
        el('h2', { style: { fontSize: '1rem' } }, 'Giảm giá tay theo nhân viên / ngày'),
        r.manualByStaff.length === 0
          ? el('p', { class: 'muted' }, 'Không có giảm giá tay.')
          : el(
              'ul',
              {},
              r.manualByStaff.map((m) =>
                el('li', {}, `${fmtDate(m.date)} · ${m.fullName}: ${m.count} lần · ${money(m.amount)}${m.approvedBy ? ` (duyệt: ${m.approvedBy})` : ''}`),
              ),
            ),
      ),
    ),
  );
}

validRange();
load();
