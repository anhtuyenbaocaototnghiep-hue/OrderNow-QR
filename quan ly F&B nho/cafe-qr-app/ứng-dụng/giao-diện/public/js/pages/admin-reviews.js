// SCR-45 Đánh giá món (FEATURE-051, ADR-010 D-46…D-48): khách chấm 1–5 sao từng món sau khi thanh toán + góp ý.
// Bảng theo món (lượt, sao trung bình, phân bố) để chỉnh công thức / menu; danh sách góp ý, đánh giá thấp (≤ 2 sao) và ai đã xử lý.
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { $, clear, dateTime, el, errorMessage, todayVn } from '../ui.js';
import { icon } from '../icons.js';

await mountAdminShell('reviews');

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const state = { from: addDays(todayVn(), -29), to: todayVn() };
const stars = (n) => n.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const body = el('div');
const fromInput = el('input', { type: 'date', class: 'input', value: state.from, max: todayVn() });
const toInput = el('input', { type: 'date', class: 'input', value: state.to, max: todayVn() });
clear(
  $('#content'),
  el(
    'div',
    { class: 'filters' },
    el('div', { class: 'field' }, el('label', {}, 'Từ ngày'), fromInput),
    el('div', { class: 'field' }, el('label', {}, 'Đến ngày'), toInput),
    el(
      'button',
      {
        class: 'btn',
        type: 'button',
        onclick: () => {
          state.from = fromInput.value;
          state.to = toInput.value;
          load();
        },
      },
      'Xem',
    ),
  ),
  el(
    'p',
    { class: 'small muted' },
    'Khách chấm sao từng món trên điện thoại sau khi thanh toán (1 lần / điện thoại / lượt, trong 24 giờ). Món có đủ số lượt (Cài đặt → Đánh giá món) hiện sao trên menu khách.',
  ),
  body,
);

async function load() {
  clear(body, el('p', { class: 'muted' }, 'Đang tải…'));
  try {
    render(await staffApi(`/api/admin/reviews?from=${state.from}&to=${state.to}`));
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

function render({ items, reviews }) {
  const low = reviews.filter((r) => r.hasLow);
  clear(
    body,
    el(
      'div',
      { class: 'kpis' },
      el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Lượt đánh giá'), el('div', { class: 'value' }, reviews.length)),
      el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Có món ≤ 2 sao'), el('div', { class: 'value' }, low.length)),
      el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Chưa xử lý'), el('div', { class: 'value' }, low.filter((r) => !r.handledAt).length)),
    ),
    el(
      'div',
      { class: 'card' },
      el('h2', { style: { fontSize: '1rem' } }, 'Theo món'),
      items.length === 0
        ? el('p', { class: 'muted' }, 'Chưa có đánh giá trong khoảng này.')
        : el(
            'div',
            { class: 'table-wrap' },
            el(
              'table',
              { class: 'table reviews-table' },
              el(
                'thead',
                {},
                el(
                  'tr',
                  {},
                  ['Món', 'Lượt', 'Sao trung bình', '5★', '4★', '3★', '2★', '1★'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)),
                ),
              ),
              el(
                'tbody',
                {},
                items.map((it) =>
                  el(
                    'tr',
                    {},
                    el('td', {}, it.name),
                    el('td', { class: 'num' }, it.count),
                    el('td', { class: `num ${it.avg < 3 ? 'neg' : ''}` }, icon('star', { filled: true }), ` ${stars(it.avg)}`),
                    [...it.dist].reverse().map((n) => el('td', { class: 'num' }, n)),
                  ),
                ),
              ),
            ),
          ),
    ),
    el(
      'div',
      { class: 'card', style: { marginTop: '1rem' } },
      el('h2', { style: { fontSize: '1rem' } }, 'Các lượt đánh giá'),
      reviews.length === 0
        ? el('p', { class: 'muted' }, 'Chưa có lượt nào.')
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
                  ['Lúc', 'Bàn', 'Món', 'Góp ý', 'Đánh giá thấp'].map((h) => el('th', {}, h)),
                ),
              ),
              el(
                'tbody',
                {},
                reviews.map((r) =>
                  el(
                    'tr',
                    {},
                    el('td', { class: 'nowrap' }, dateTime(r.createdAt)),
                    el('td', {}, r.table.name),
                    el('td', {}, r.items.map((i) => `${i.name} ${i.stars}★`).join(', ') || '—'),
                    el('td', {}, r.comment ?? '—'),
                    el(
                      'td',
                      {},
                      !r.hasLow
                        ? '—'
                        : r.handledAt
                          ? el('span', { class: 'pill on' }, `Đã xử lý · ${r.handledBy}`)
                          : el('span', { class: 'pill off' }, 'Chưa xử lý'),
                    ),
                  ),
                ),
              ),
            ),
          ),
    ),
  );
}

await load();
