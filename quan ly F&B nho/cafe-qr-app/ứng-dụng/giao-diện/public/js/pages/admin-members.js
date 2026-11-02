// S-26 Hội viên (FEATURE-014): danh sách che số (D-16), tìm theo SĐT đầy đủ hoặc tên, lịch sử, sửa tên/hạng/ghi chú,
// "Ẩn danh theo yêu cầu"; tab Hạng hội viên (mức chi tiêu + % chiết khấu — D-5).
// ADR-006: sổ điểm + điều chỉnh có lý do, thẻ tem, voucher, người đã giới thiệu (F-039, F-038); từ chối nhận tin chiến dịch (F-037).
// TASK-082 (dễ theo dõi): ô tổng quan (tích điểm hôm nay, lượt thu có hội viên, khách quay lại…), lọc nhanh (sắp lên hạng, lâu chưa quay lại,
// sinh nhật…), tiến độ lên hạng, "Tích điểm gần đây"; hồ sơ hội viên: điểm / hạng / đã chi nổi bật, sửa thông tin thu gọn, nút điểm nhanh.
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { $, clear, confirmDialog, dateTime, el, errorMessage, modal, money, num, showFieldErrors, toast } from '../ui.js';
import { icon } from '../icons.js';

await mountAdminShell('members');

const state = { tab: 'members', q: '', page: 1, view: 'all', tiers: [] };
const body = el('div');
const tabs = el(
  'div',
  { class: 'tabs', role: 'tablist' },
  [
    ['members', 'Hội viên'],
    ['tiers', 'Hạng hội viên'],
  ].map(([key, label]) =>
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
    state.tiers = await staffApi('/api/admin/member-tiers');
    if (state.tab === 'members') await renderMembers();
    else renderTiers();
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

const tierName = (code) => state.tiers.find((t) => t.tierCode === code)?.name ?? code;

const VIEWS = [
  ['all', 'Tất cả', null],
  ['new', 'Mới tháng này', 'newThisMonth'],
  ['top', 'Chi nhiều nhất', null],
  ['points', 'Nhiều điểm', null],
  ['near', 'Sắp lên hạng', 'nearTier'],
  ['lapsed', 'Lâu chưa quay lại', 'lapsed'],
  ['birthday', 'Sinh nhật tháng này', 'birthdays'],
];
const EMPTY = {
  all: 'Chưa có hội viên nào khớp.',
  new: 'Tháng này chưa có hội viên mới.',
  top: 'Chưa có hội viên nào khớp.',
  points: 'Chưa hội viên nào có điểm.',
  near: 'Chưa có ai sắp lên hạng (đã chi từ 80% mức hạng kế).',
  lapsed: 'Không có hội viên nào vắng quá 30 ngày.',
  birthday: 'Tháng này không có hội viên nào sinh nhật (hoặc chưa ghi ngày sinh).',
};
const pct = (a, b) => (b ? Math.round((a * 100) / b) : 0);
/** "hôm nay" / "hôm qua" / "5 ngày trước" — theo ngày giờ quán. */
function ago(d) {
  if (!d) return 'chưa ghé';
  const day = (x) => Math.floor((new Date(x).getTime() + 7 * 3600e3) / 86400e3);
  const n = day(Date.now()) - day(d);
  return n <= 0 ? 'hôm nay' : n === 1 ? 'hôm qua' : `${n} ngày trước`;
}
/** Hạng kế tiếp theo bảng hạng (null = đang ở hạng cao nhất). */
function nextTierOf(m) {
  const sorted = [...state.tiers].sort((a, b) => a.minSpent - b.minSpent);
  const cur = sorted.find((t) => t.tierCode === m.tierCode);
  const next = sorted.find((t) => t.minSpent > (cur?.minSpent ?? 0));
  return next ? { name: next.name, minSpent: next.minSpent, remaining: Math.max(0, next.minSpent - m.totalSpent) } : null;
}
/** Thanh tiến độ lên hạng + câu "còn X lên Y". */
const tierProgress = (m, next) =>
  next
    ? el(
        'div',
        { class: 'mem-progress' },
        el('progress', { max: next.minSpent, value: Math.min(m.totalSpent, next.minSpent), 'aria-label': `Tiến độ lên hạng ${next.name}` }),
        el('div', { class: 'small muted' }, next.remaining ? `còn ${money(next.remaining)} lên ${next.name}` : `đủ mức lên ${next.name}`),
      )
    : el('div', { class: 'small muted' }, 'Hạng cao nhất');
const kpi = (label, value, hint = '') =>
  el(
    'div',
    { class: 'card kpi' },
    el('div', { class: 'label' }, label),
    el('div', { class: 'value' }, value),
    hint ? el('div', { class: 'small muted' }, hint) : null,
  );

function overviewCards(o) {
  const share = pct(o.memberPaymentsToday, o.paymentsToday);
  return el(
    'div',
    { class: 'kpis mem-kpis' },
    kpi('Hội viên', num(o.total), `+${num(o.newThisMonth)} tháng này`),
    kpi('Quay lại trong 30 ngày', num(o.active30), `${pct(o.active30, o.total)}% hội viên`),
    kpi('Điểm tích hôm nay', `+${num(o.earnToday)}`, `${num(o.earnMembersToday)} khách · 7 ngày +${num(o.earn7)}`),
    kpi(
      'Lượt thu có hội viên hôm nay',
      `${num(o.memberPaymentsToday)} / ${num(o.paymentsToday)}`,
      o.paymentsToday && share < 50 ? 'Nhắc nhân viên hỏi SĐT để khách được tích điểm' : `${share}% lượt thu`,
    ),
    kpi('Doanh thu từ hội viên (30 ngày)', `${pct(o.memberRevenue30, o.revenue30)}%`, money(o.memberRevenue30)),
    kpi('Điểm khách đang giữ', num(o.pointsHeld), 'chưa đổi quà'),
  );
}

const PT_LABEL = { EARN: 'tích khi thu tiền', REDEEM: 'đổi quà', ADJUST: 'quản lý điều chỉnh', EXPIRE: 'hết hạn', REFUND: 'trừ lại do hoàn tiền' };

function recentCard(o) {
  return el(
    'section',
    { class: 'card', 'aria-labelledby': 'mem-recent-title' },
    el('h2', { id: 'mem-recent-title' }, 'Tích điểm gần đây'),
    el('p', { class: 'small muted' }, 'Điểm tự cộng lúc thu tiền khi bàn / đơn đã gắn SĐT hội viên (tỷ lệ điểm chỉnh ở Khách hàng → Tích điểm & quà).'),
    o.recent.length
      ? el(
          'ul',
          { class: 'mem-feed' },
          o.recent.map((t) =>
            el(
              'li',
              {},
              el('span', { class: `mem-delta ${t.delta > 0 ? 'pos-val' : 'neg'}` }, `${t.delta > 0 ? '+' : '−'}${num(Math.abs(t.delta))}`),
              el(
                'div',
                {},
                el('button', { class: 'linklike', type: 'button', onclick: () => openMember(t.memberId) }, t.fullName),
                el(
                  'div',
                  { class: 'small muted' },
                  `${dateTime(t.createdAt)} · ${PT_LABEL[t.type] ?? t.type}${t.paymentId ? ` · lượt thu #${t.paymentId}` : ''}${t.note ? ` — ${t.note}` : ''}`,
                ),
              ),
            ),
          ),
        )
      : el('p', { class: 'muted' }, 'Chưa có lượt tích điểm nào.'),
  );
}

async function renderMembers() {
  const [r, o] = await Promise.all([
    staffApi(`/api/admin/members?${new URLSearchParams({ q: state.q, page: state.page, view: state.view })}`),
    staffApi('/api/admin/members/overview'),
  ]);
  const pages = Math.max(1, Math.ceil(r.total / r.pageSize));
  const q = el('input', {
    class: 'input',
    placeholder: 'SĐT đầy đủ (0912345678) hoặc tên',
    value: state.q,
    'aria-label': 'Tìm hội viên',
    style: { maxWidth: '22rem' },
  });
  const search = () => {
    state.q = q.value.trim();
    state.page = 1;
    load();
  };
  q.addEventListener('keydown', (e) => e.key === 'Enter' && search());
  const chips = el(
    'div',
    { class: 'row wrap mem-views', role: 'group', 'aria-label': 'Lọc nhanh hội viên' },
    VIEWS.map(([key, label, countKey]) =>
      el(
        'button',
        {
          class: 'btn btn-sm',
          type: 'button',
          'aria-pressed': String(state.view === key),
          onclick: () => {
            state.view = key;
            state.page = 1;
            load();
          },
        },
        countKey ? `${label} (${num(o[countKey])})` : label,
      ),
    ),
  );
  const table =
    r.items.length === 0
      ? el('div', { class: 'empty' }, state.q ? 'Chưa có hội viên nào khớp.' : EMPTY[state.view])
      : el(
          'div',
          { class: 'table-wrap' },
          el(
            'table',
            { class: 'table mem-table' },
            el(
              'thead',
              {},
              el(
                'tr',
                {},
                ['Hội viên', 'Điểm', 'Đã chi · lên hạng', 'Lần cuối ghé', ''].map((h, i) => el('th', { class: i === 1 ? 'num' : '' }, h)),
              ),
            ),
            el(
              'tbody',
              {},
              r.items.map((m) =>
                el(
                  'tr',
                  { style: { cursor: 'pointer' }, onclick: () => openMember(m.memberId) },
                  el(
                    'td',
                    {},
                    el('strong', {}, m.fullName),
                    ' ',
                    el('span', { class: 'pill' }, m.tierName),
                    m.isActive ? null : el('span', { class: 'pill off' }, 'Đã khóa'),
                    m.firstOrderDiscount ? el('span', { class: 'pill on' }, 'chưa dùng ưu đãi đơn đầu') : null,
                    el('div', { class: 'small muted mono' }, m.phone),
                  ),
                  el('td', { class: 'num' }, el('strong', {}, num(m.points))),
                  el('td', {}, money(m.totalSpent), el('span', { class: 'small muted' }, ` · ${num(m.visitCount)} lần`), tierProgress(m, m.nextTier)),
                  el(
                    'td',
                    { class: 'nowrap' },
                    ago(m.lastVisitAt),
                    m.birthDate && state.view === 'birthday'
                      ? el('div', { class: 'small muted' }, `sinh nhật ${m.birthDate.slice(8, 10)}/${m.birthDate.slice(5, 7)}`)
                      : null,
                  ),
                  el('td', {}, el('button', { class: 'btn btn-sm', type: 'button', 'aria-label': `Xem ${m.fullName}` }, 'Xem')),
                ),
              ),
            ),
          ),
        );
  clear(
    body,
    overviewCards(o),
    el(
      'div',
      { class: 'mem-grid' },
      el(
        'section',
        { class: 'card', 'aria-labelledby': 'mem-list-title' },
        el('h2', { id: 'mem-list-title' }, 'Danh sách hội viên'),
        chips,
        el(
          'div',
          { class: 'filters' },
          q,
          el('button', { class: 'btn btn-primary', type: 'button', onclick: search }, 'Tìm'),
          el('span', { class: 'muted small' }, `${num(r.total)} hội viên · SĐT được che, tìm bằng số đầy đủ`),
        ),
        table,
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
      ),
      recentCard(o),
    ),
  );
}

async function openMember(id) {
  let data;
  try {
    data = await staffApi(`/api/admin/members/${id}`);
  } catch (err) {
    return toast(errorMessage(err), 'error');
  }
  const { member: m, history } = data;
  const loyaltyBox = el('div', {}, el('p', { class: 'muted small' }, 'Đang tải điểm / tem…'));
  const form = el(
    'form',
    { class: 'form-grid' },
    el('div', { class: 'field' }, el('label', {}, 'Họ tên'), el('input', { class: 'input', name: 'fullName', value: m.fullName, maxlength: 100 })),
    el(
      'div',
      { class: 'field' },
      el('label', {}, 'Hạng'),
      el(
        'select',
        { class: 'input', name: 'tierCode' },
        state.tiers.map((t) => el('option', { value: t.tierCode, selected: t.tierCode === m.tierCode }, `${t.name} (${t.discountPercent}%)`)),
      ),
    ),
    el('div', { class: 'field' }, el('label', {}, 'Ngày sinh'), el('input', { class: 'input', type: 'date', name: 'birthDate', value: m.birthDate ?? '' })),
    el('div', { class: 'field' }, el('label', {}, 'Ghi chú'), el('input', { class: 'input', name: 'note', value: m.note ?? '', maxlength: 200 })),
    el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'isActive', checked: m.isActive }), 'Đang hoạt động'),
  );
  modal({
    title: m.fullName,
    body: el(
      'div',
      { class: 'stack' },
      el(
        'div',
        { class: 'mem-summary' },
        el('div', {}, el('div', { class: 'small muted' }, 'Điểm hiện có'), el('div', { class: 'mem-big' }, num(m.points))),
        el('div', {}, el('div', { class: 'small muted' }, 'Hạng'), el('div', { class: 'mem-big' }, m.tierName), tierProgress(m, nextTierOf(m))),
        el(
          'div',
          {},
          el('div', { class: 'small muted' }, 'Đã chi'),
          el('div', { class: 'mem-big' }, money(m.totalSpent)),
          el('div', { class: 'small muted' }, `${num(m.visitCount)} lần · lần cuối ${ago(m.lastVisitAt)}`),
        ),
      ),
      el(
        'p',
        { class: 'small muted' },
        `SĐT ${m.phone} · đăng ký ${dateTime(m.createdAt)} (đồng ý lưu thông tin lúc ${dateTime(m.consentAt)})${m.birthDate ? ` · sinh nhật ${m.birthDate.slice(8, 10)}/${m.birthDate.slice(5, 7)}` : ''}`,
      ),
      m.anonymizedAt
        ? el('div', { class: 'alert warning' }, `Đã ẩn danh lúc ${dateTime(m.anonymizedAt)}`)
        : el('details', { class: 'mem-edit' }, el('summary', {}, 'Sửa thông tin (tên, hạng, ngày sinh, ghi chú)'), form),
      el('h3', { style: { fontSize: '1rem', marginTop: '0.5rem' } }, 'Lịch sử mua'),
      history.length === 0
        ? el('p', { class: 'muted' }, 'Chưa có giao dịch.')
        : el(
            'ul',
            { class: 'small' },
            history.map((h) =>
              el(
                'li',
                {},
                `${dateTime(h.createdAt)} · ${h.spentAmount >= 0 ? 'chi' : 'hoàn'} ${money(Math.abs(h.spentAmount))}`,
                h.discountAmount ? ` · giảm ${money(h.discountAmount)}` : '',
                h.tierBefore !== h.tierAfter ? ` · lên hạng ${tierName(h.tierAfter)}` : '',
              ),
            ),
          ),
      m.anonymizedAt ? null : loyaltyBox,
    ),
    actions: m.anonymizedAt
      ? [{ label: 'Đóng', class: 'btn-primary' }]
      : [
          {
            label: 'Ẩn danh theo yêu cầu',
            class: 'btn-danger',
            onClick: async (close) => {
              const ok = await confirmDialog(
                'Ẩn danh hội viên?',
                'Xóa tên và thay số điện thoại bằng mã băm (theo yêu cầu của khách — NĐ 13/2023). Lịch sử thanh toán vẫn giữ để đối soát. Không thể hoàn tác.',
                { okLabel: 'Ẩn danh', danger: true },
              );
              if (!ok) return false;
              try {
                await staffApi(`/api/admin/members/${m.memberId}/anonymize`, { method: 'POST' });
                toast('Đã ẩn danh hội viên', 'success');
                close();
                load();
              } catch (err) {
                toast(errorMessage(err), 'error');
              }
              return false;
            },
          },
          { label: 'Đóng' },
          {
            label: 'Lưu',
            class: 'btn-primary',
            onClick: async () => {
              const f = (n) => form.elements.namedItem(n);
              try {
                await staffApi(`/api/admin/members/${m.memberId}`, {
                  method: 'PUT',
                  body: {
                    fullName: f('fullName').value,
                    tierCode: f('tierCode').value,
                    note: f('note').value || null,
                    birthDate: f('birthDate').value || null,
                    isActive: f('isActive').checked,
                  },
                });
                toast('Đã lưu hội viên', 'success');
                load();
              } catch (err) {
                if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error');
                return false;
              }
            },
          },
        ],
  });
  if (!m.anonymizedAt) renderLoyalty(m, loyaltyBox);
}

const PT_TYPE = { EARN: 'Tích', REDEEM: 'Đổi quà', ADJUST: 'Điều chỉnh', EXPIRE: 'Hết hạn', REFUND: 'Hoàn tiền' };
const VOUCHER_SOURCE = { REFERRAL: 'giới thiệu bạn', CAMPAIGN: 'chiến dịch', MANUAL: 'quản lý tặng' };

/** F-039 / F-038 / F-037 trong hồ sơ hội viên. */
async function renderLoyalty(m, box) {
  let d;
  try {
    d = await staffApi(`/api/admin/members/${m.memberId}/loyalty`);
  } catch (err) {
    return clear(box, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
  const delta = el('input', {
    class: 'input',
    type: 'number',
    step: 1,
    placeholder: '+50 hoặc -20',
    'aria-label': 'Số điểm cộng / trừ',
    style: { maxWidth: '8rem' },
  });
  const reason = el('input', { class: 'input', maxlength: 200, placeholder: 'Lý do (bắt buộc)', 'aria-label': 'Lý do điều chỉnh điểm' });
  const optOut = el('input', { type: 'checkbox', checked: m.optOut });
  optOut.addEventListener('change', async () => {
    try {
      await staffApi(`/api/admin/members/${m.memberId}/opt-out`, { method: 'PATCH', body: { optOut: optOut.checked } });
      toast(optOut.checked ? 'Đã tắt nhận tin chiến dịch' : 'Đã bật lại nhận tin chiến dịch', 'success');
    } catch (err) {
      optOut.checked = !optOut.checked;
      toast(errorMessage(err), 'error');
    }
  });
  clear(
    box,
    el('h3', { style: { fontSize: '1rem', marginTop: '0.5rem' } }, 'Điểm · tem · voucher'),
    el('p', { class: 'small muted' }, 'Cộng / trừ điểm tay (khách quên đọc SĐT, tặng điểm xin lỗi…) — bắt buộc ghi lý do, có trong lịch sử điểm.'),
    el('label', { class: 'check' }, optOut, 'Khách từ chối nhận tin chiến dịch (opt-out)'),
    d.cards.length
      ? el(
          'ul',
          { class: 'small' },
          d.cards.map((c) =>
            el(
              'li',
              {},
              icon('stamp'),
              `${c.name}: ${c.stamps}/${c.requiredStamps} tem · đã đủ ${c.completedCards} thẻ · còn ${c.rewardsAvailable} lượt món miễn phí`,
            ),
          ),
        )
      : el('p', { class: 'small muted' }, 'Chưa có thẻ tem.'),
    el(
      'div',
      { class: 'row wrap', role: 'group', 'aria-label': 'Điểm nhanh' },
      [10, 50, 100, -10].map((v) =>
        el(
          'button',
          {
            class: 'btn btn-sm',
            type: 'button',
            onclick: () => {
              delta.value = String(v);
              reason.focus();
            },
          },
          v > 0 ? `+${v}` : `−${-v}`,
        ),
      ),
    ),
    el(
      'div',
      { class: 'row wrap' },
      delta,
      reason,
      el(
        'button',
        {
          class: 'btn btn-sm',
          type: 'button',
          onclick: async () => {
            try {
              const r = await staffApi(`/api/admin/members/${m.memberId}/points`, {
                method: 'POST',
                body: { delta: Number(delta.value), reason: reason.value.trim() },
              });
              toast(`Đã điều chỉnh — còn ${r.points} điểm`, 'success');
              m.optOut = optOut.checked;
              renderLoyalty(m, box);
            } catch (err) {
              toast(errorMessage(err), 'error');
            }
          },
        },
        'Điều chỉnh điểm',
      ),
    ),
    d.pointHistory.length
      ? el(
          'ul',
          { class: 'small' },
          d.pointHistory
            .slice(0, 15)
            .map((h) =>
              el(
                'li',
                {},
                `${dateTime(h.createdAt)} · ${PT_TYPE[h.type] ?? h.type} ${h.delta > 0 ? '+' : ''}${h.delta} điểm`,
                h.note ? ` — ${h.note}` : '',
                h.createdBy ? ` (${h.createdBy})` : '',
              ),
            ),
        )
      : el('p', { class: 'small muted' }, 'Chưa có giao dịch điểm.'),
    d.vouchers.length
      ? el(
          'ul',
          { class: 'small' },
          d.vouchers.map((v) =>
            el(
              'li',
              {},
              icon('ticket'),
              `${v.code} −${v.percent ? `${v.percent}%` : money(v.amount)} · hạn ${dateTime(v.expiresAt)} · ${VOUCHER_SOURCE[v.source] ?? v.source}`,
              v.usedAt ? ` · đã dùng ${dateTime(v.usedAt)}` : new Date(v.expiresAt) < new Date() ? ' · hết hạn' : ' · còn dùng được',
            ),
          ),
        )
      : null,
    d.referrals.length ? el('p', { class: 'small' }, `Đã giới thiệu ${d.referrals.length} người: ${d.referrals.map((r) => r.fullName).join(', ')}`) : null,
  );
}

function renderTiers() {
  const rows = state.tiers.map((t) => ({
    t,
    name: el('input', { class: 'input', value: t.name, maxlength: 50, 'aria-label': `Tên hạng ${t.tierCode}` }),
    min: el('input', { class: 'input', type: 'number', min: 0, step: 1000, value: t.minSpent, 'aria-label': `Mức chi tiêu ${t.tierCode}` }),
    pct: el('input', { class: 'input', type: 'number', min: 0, max: 50, step: 0.5, value: t.discountPercent, 'aria-label': `Chiết khấu ${t.tierCode}` }),
  }));
  clear(
    body,
    el(
      'div',
      { class: 'card', style: { maxWidth: '760px' } },
      el(
        'p',
        { class: 'small muted' },
        'Hội viên tự lên hạng khi tổng chi tiêu (số thực trả) đạt mức; không tự hạ hạng. Chiết khấu tính lúc thu tiền, chỉ trên món cho phép cộng dồn với khuyến mãi.',
      ),
      el(
        'table',
        { class: 'table' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Mã'), el('th', {}, 'Tên hạng'), el('th', {}, 'Chi tiêu từ (đ)'), el('th', {}, 'Chiết khấu %'))),
        el(
          'tbody',
          {},
          rows.map((r) => el('tr', {}, el('td', { class: 'mono' }, r.t.tierCode), el('td', {}, r.name), el('td', {}, r.min), el('td', {}, r.pct))),
        ),
      ),
      el(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          style: { marginTop: '0.75rem' },
          onclick: async () => {
            try {
              state.tiers = await staffApi('/api/admin/member-tiers', {
                method: 'PUT',
                body: rows.map((r) => ({ tierCode: r.t.tierCode, name: r.name.value, minSpent: Number(r.min.value), discountPercent: Number(r.pct.value) })),
              });
              toast('Đã lưu hạng hội viên', 'success');
              renderTiers();
            } catch (err) {
              toast(errorMessage(err), 'error');
            }
          },
        },
        'Lưu hạng',
      ),
      el('p', { class: 'small muted', style: { marginTop: '0.75rem' } }, 'Ưu đãi đơn đầu tiên (mặc định 10%) chỉnh ở trang Cài đặt.'),
    ),
  );
}

load();
