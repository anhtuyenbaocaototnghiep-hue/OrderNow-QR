// S-26 Hội viên (FEATURE-014): danh sách che số (D-16), tìm theo SĐT đầy đủ hoặc tên, lịch sử, sửa tên/hạng/ghi chú,
// "Ẩn danh theo yêu cầu"; tab Hạng hội viên (mức chi tiêu + % chiết khấu — D-5).
// ADR-006: sổ điểm + điều chỉnh có lý do, thẻ tem, voucher, người đã giới thiệu (F-039, F-038); từ chối nhận tin chiến dịch (F-037).
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { $, clear, confirmDialog, dateTime, el, errorMessage, modal, money, num, showFieldErrors, toast } from '../ui.js';
import { icon } from '../icons.js';

await mountAdminShell('members');

const state = { tab: 'members', q: '', page: 1, tiers: [] };
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

async function renderMembers() {
  const r = await staffApi(`/api/admin/members?${new URLSearchParams({ q: state.q, page: state.page })}`);
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
  clear(
    body,
    el(
      'div',
      { class: 'filters' },
      q,
      el('button', { class: 'btn btn-primary', type: 'button', onclick: search }, 'Tìm'),
      el('span', { class: 'muted small' }, `${r.total} hội viên · SĐT được che, tìm bằng số đầy đủ`),
    ),
    r.items.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có hội viên nào khớp.')
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
                ['Họ tên', 'SĐT', 'Hạng', 'Đã chi', 'Lượt', 'Điểm', 'Lần cuối', ''].map((h, i) => el('th', { class: i >= 3 && i <= 5 ? 'num' : '' }, h)),
              ),
            ),
            el(
              'tbody',
              {},
              r.items.map((m) =>
                el(
                  'tr',
                  { style: { cursor: 'pointer' }, onclick: () => openMember(m.memberId) },
                  el('td', {}, el('strong', {}, m.fullName), m.isActive ? null : el('span', { class: 'pill off' }, 'Đã khóa')),
                  el('td', { class: 'mono' }, m.phone),
                  el(
                    'td',
                    {},
                    el('span', { class: 'pill' }, m.tierName),
                    m.firstOrderDiscount ? el('span', { class: 'pill on' }, 'chưa dùng ưu đãi đơn đầu') : null,
                  ),
                  el('td', { class: 'num' }, money(m.totalSpent)),
                  el('td', { class: 'num' }, num(m.visitCount)),
                  el('td', { class: 'num' }, num(m.points)),
                  el('td', { class: 'nowrap' }, m.lastVisitAt ? dateTime(m.lastVisitAt) : '—'),
                  el('td', {}, el('button', { class: 'btn btn-sm', type: 'button' }, 'Xem')),
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
        'p',
        { class: 'small muted' },
        `SĐT ${m.phone} · đăng ký ${dateTime(m.createdAt)} (đồng ý lưu thông tin lúc ${dateTime(m.consentAt)}) · đã chi ${money(m.totalSpent)} · ${m.visitCount} lượt · ${m.points} điểm`,
      ),
      m.anonymizedAt ? el('div', { class: 'alert warning' }, `Đã ẩn danh lúc ${dateTime(m.anonymizedAt)}`) : form,
      el('h3', { style: { fontSize: '1rem', marginTop: '0.5rem' } }, 'Lịch sử'),
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
