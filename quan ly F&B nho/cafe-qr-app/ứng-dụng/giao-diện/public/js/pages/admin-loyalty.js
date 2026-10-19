// S-40 Tích điểm, voucher & chiến dịch (ADR-006): quà đổi điểm + chương trình tem (F-039), voucher (F-038),
// phân khúc + chiến dịch (F-037: xem trước số người, chạy ngay / hẹn giờ, xuất CSV, hiệu quả). Chỉ quản lý.
import { staffApi, staffBlobUrl } from '../api.js';
import { confirmAndDelete, mountAdminShell, toggle } from '../admin-shell.js';
import { $, clear, dateTime, el, errorMessage, modal, money, showFieldErrors, toast, todayVn } from '../ui.js';

await mountAdminShell('loyalty');

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const state = { tab: 'rewards', menu: [], tiers: [] };
const body = el('div');
const TABS = [
  ['rewards', 'Quà đổi điểm'],
  ['stamps', 'Chương trình tem'],
  ['vouchers', 'Voucher'],
  ['campaigns', 'Phân khúc & chiến dịch'],
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
    if (!state.menu.length) {
      const [items, tiers] = await Promise.all([staffApi('/api/admin/menu-items'), staffApi('/api/admin/member-tiers')]);
      state.menu = items.filter((i) => i.itemType !== 'COMBO');
      state.tiers = tiers;
    }
    if (state.tab === 'stamps') await renderStamps();
    else if (state.tab === 'vouchers') await renderVouchers();
    else if (state.tab === 'campaigns') await renderCampaigns();
    else await renderRewards();
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

const table = (head, rows) =>
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
          head.map((h) => el('th', {}, h)),
        ),
      ),
      el('tbody', {}, rows),
    ),
  );
const menuSelect = (value, attrs = {}) =>
  el(
    'select',
    { class: 'input', ...attrs },
    el('option', { value: '' }, '— Chọn món —'),
    state.menu.map((m) => el('option', { value: m.menuItemId, selected: m.menuItemId === value }, m.name)),
  );

// ---------- Quà đổi điểm (F-039) ----------
async function renderRewards() {
  const list = await staffApi('/api/admin/rewards');
  clear(
    body,
    el(
      'div',
      { class: 'row', style: { marginBottom: '1rem' } },
      el('button', { class: 'btn btn-primary', type: 'button', onclick: () => editReward(null) }, '+ Thêm quà'),
      el(
        'span',
        { class: 'small muted' },
        'Khách tích 1 điểm cho mỗi 10.000đ thực trả (không hết hạn). Đổi quà tại quầy lúc thu tiền; không dùng cùng giảm giá tay.',
      ),
    ),
    list.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có quà đổi điểm.')
      : table(
          ['Quà', 'Điểm', 'Loại', 'Đang dùng', ''],
          list.map((r) =>
            el(
              'tr',
              { class: r.isActive ? '' : 'muted' },
              el('td', {}, r.name),
              el('td', { class: 'num' }, r.pointsCost),
              el('td', {}, r.rewardType === 'DISCOUNT' ? `Giảm ${money(r.discountAmount)}` : `Tặng ${r.menuItemName ?? 'món'}`),
              el(
                'td',
                {},
                toggle(r.isActive, (on, input) => saveReward(r, { ...r, isActive: on }).catch(() => (input.checked = !on)), `Đang dùng ${r.name}`),
              ),
              el(
                'td',
                { class: 'row' },
                el('button', { class: 'btn btn-sm', type: 'button', onclick: () => editReward(r) }, 'Sửa'),
                el(
                  'button',
                  {
                    class: 'btn btn-sm btn-danger',
                    type: 'button',
                    onclick: () => confirmAndDelete({ url: `/api/admin/rewards/${r.rewardId}`, label: `quà "${r.name}"`, onDone: load }),
                  },
                  'Xóa',
                ),
              ),
            ),
          ),
        ),
  );
}

async function saveReward(r, payload) {
  const body = {
    name: payload.name,
    pointsCost: payload.pointsCost,
    rewardType: payload.rewardType,
    discountAmount: payload.rewardType === 'DISCOUNT' ? payload.discountAmount : null,
    menuItemId: payload.rewardType === 'FREE_ITEM' ? payload.menuItemId : null,
    isActive: payload.isActive,
    sortOrder: payload.sortOrder ?? 0,
  };
  await staffApi(r ? `/api/admin/rewards/${r.rewardId}` : '/api/admin/rewards', { method: r ? 'PUT' : 'POST', body });
  toast('Đã lưu quà', 'success');
  load();
}

function editReward(r) {
  const name = el('input', { class: 'input', name: 'name', maxlength: 100, value: r?.name ?? '' });
  const cost = el('input', { class: 'input', name: 'pointsCost', type: 'number', min: 1, value: r?.pointsCost ?? 100 });
  const type = el(
    'select',
    { class: 'input', name: 'rewardType' },
    el('option', { value: 'DISCOUNT', selected: r?.rewardType !== 'FREE_ITEM' }, 'Giảm tiền'),
    el('option', { value: 'FREE_ITEM', selected: r?.rewardType === 'FREE_ITEM' }, 'Tặng một món'),
  );
  const amount = el('input', { class: 'input', name: 'discountAmount', type: 'number', min: 1000, step: 1000, value: r?.discountAmount ?? 20000 });
  const item = menuSelect(r?.menuItemId, { name: 'menuItemId' });
  const amountField = el('div', { class: 'field' }, el('label', {}, 'Số tiền giảm (đ)'), amount);
  const itemField = el('div', { class: 'field' }, el('label', {}, 'Món tặng (phải có trên bill)'), item);
  const sync = () => {
    amountField.hidden = type.value !== 'DISCOUNT';
    itemField.hidden = type.value !== 'FREE_ITEM';
  };
  type.addEventListener('change', sync);
  sync();
  const form = el(
    'form',
    {},
    el('div', { class: 'field' }, el('label', {}, 'Tên quà'), name),
    el('div', { class: 'field' }, el('label', {}, 'Số điểm cần'), cost),
    el('div', { class: 'field' }, el('label', {}, 'Loại quà'), type),
    amountField,
    itemField,
  );
  modal({
    title: r ? `Sửa quà: ${r.name}` : 'Thêm quà đổi điểm',
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async () => {
          try {
            await saveReward(r, {
              name: name.value.trim(),
              pointsCost: Number(cost.value),
              rewardType: type.value,
              discountAmount: Number(amount.value),
              menuItemId: Number(item.value) || null,
              isActive: r?.isActive ?? true,
              sortOrder: r?.sortOrder ?? 0,
            });
          } catch (err) {
            if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error');
            return false;
          }
        },
      },
    ],
  });
}

// ---------- Chương trình tem (F-039) ----------
async function renderStamps() {
  const list = await staffApi('/api/admin/stamp-programs');
  clear(
    body,
    el(
      'div',
      { class: 'row', style: { marginBottom: '1rem' } },
      el('button', { class: 'btn btn-primary', type: 'button', onclick: () => editProgram(null) }, '+ Thêm chương trình tem'),
      el('span', { class: 'small muted' }, 'Mỗi món thuộc chương trình = 1 tem; đủ số tem → 1 lượt món miễn phí (dùng ở quầy khi thu tiền).'),
    ),
    list.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có chương trình tem.')
      : table(
          ['Chương trình', 'Số tem', 'Món tích tem', 'Món tặng', 'Đang chạy', ''],
          list.map((p) =>
            el(
              'tr',
              { class: p.isActive ? '' : 'muted' },
              el('td', {}, p.name),
              el('td', { class: 'num' }, p.requiredStamps),
              el('td', {}, p.items.map((i) => i.name).join(', ')),
              el('td', {}, p.rewardName ?? 'Món rẻ nhất của chương trình trên bill'),
              el('td', {}, p.isActive ? 'Có' : 'Ngừng'),
              el(
                'td',
                { class: 'row' },
                el('button', { class: 'btn btn-sm', type: 'button', onclick: () => editProgram(p) }, 'Sửa'),
                el(
                  'button',
                  {
                    class: 'btn btn-sm btn-danger',
                    type: 'button',
                    onclick: () => confirmAndDelete({ url: `/api/admin/stamp-programs/${p.programId}`, label: `chương trình "${p.name}"`, onDone: load }),
                  },
                  'Xóa',
                ),
              ),
            ),
          ),
        ),
  );
}

function editProgram(p) {
  const name = el('input', { class: 'input', name: 'name', maxlength: 100, value: p?.name ?? 'Thẻ tích ly' });
  const required = el('input', { class: 'input', name: 'requiredStamps', type: 'number', min: 2, max: 50, value: p?.requiredStamps ?? 10 });
  const checks = state.menu.map((m) => ({ m, box: el('input', { type: 'checkbox', checked: p?.menuItemIds.includes(m.menuItemId) ?? false }) }));
  const reward = menuSelect(p?.rewardMenuItemId ?? null, { name: 'rewardMenuItemId' });
  const active = el('input', { type: 'checkbox', checked: p?.isActive ?? true });
  const form = el(
    'form',
    {},
    el('div', { class: 'field' }, el('label', {}, 'Tên chương trình'), name),
    el('div', { class: 'field' }, el('label', {}, 'Số tem đổi 1 món'), required),
    el('label', {}, 'Món tích tem'),
    el(
      'div',
      { class: 'check-list' },
      checks.map(({ m, box }) => el('label', {}, box, m.name)),
    ),
    el('div', { class: 'field' }, el('label', {}, 'Món tặng (để trống = món rẻ nhất của chương trình có trên bill)'), reward),
    el('label', { class: 'check' }, active, 'Đang chạy'),
  );
  modal({
    title: p ? `Sửa: ${p.name}` : 'Chương trình tem mới',
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async () => {
          try {
            await staffApi(p ? `/api/admin/stamp-programs/${p.programId}` : '/api/admin/stamp-programs', {
              method: p ? 'PUT' : 'POST',
              body: {
                name: name.value.trim(),
                requiredStamps: Number(required.value),
                menuItemIds: checks.filter((c) => c.box.checked).map((c) => c.m.menuItemId),
                rewardMenuItemId: Number(reward.value) || null,
                isActive: active.checked,
              },
            });
            toast('Đã lưu chương trình tem', 'success');
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

// ---------- Voucher (F-038) ----------
const SOURCE = { REFERRAL: 'Giới thiệu bạn', CAMPAIGN: 'Chiến dịch', MANUAL: 'Quản lý tặng' };
async function renderVouchers() {
  const from = addDays(todayVn(), -29);
  const list = await staffApi(`/api/admin/vouchers?from=${from}&to=${todayVn()}`);
  clear(
    body,
    el(
      'div',
      { class: 'row', style: { marginBottom: '1rem' } },
      el('button', { class: 'btn btn-primary', type: 'button', onclick: newVoucher }, '+ Tạo voucher'),
      el(
        'span',
        { class: 'small muted' },
        'Voucher 30 ngày gần nhất. Mỗi voucher dùng một lần; người mới được giới thiệu thanh toán lần đầu ≥ 30.000đ → cả hai nhận 10%.',
      ),
    ),
    list.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có voucher.')
      : table(
          ['Mã', 'Giảm', 'Hội viên', 'Nguồn', 'Hạn', 'Trạng thái'],
          list.map((v) =>
            el(
              'tr',
              {},
              el('td', { class: 'mono' }, v.code),
              el(
                'td',
                {},
                v.percent ? `${v.percent}%` : money(v.amount),
                v.minOrderAmount ? el('div', { class: 'small muted' }, `đơn từ ${money(v.minOrderAmount)}`) : null,
              ),
              el('td', {}, v.memberName ?? 'Ai cũng dùng được'),
              el('td', {}, SOURCE[v.source] ?? v.source),
              el('td', { class: 'nowrap' }, dateTime(v.expiresAt)),
              el('td', {}, v.usedAt ? `Đã dùng ${dateTime(v.usedAt)}` : new Date(v.expiresAt) < new Date() ? 'Hết hạn' : 'Còn dùng được'),
            ),
          ),
        ),
  );
}

function newVoucher() {
  const kind = el('select', { class: 'input' }, el('option', { value: 'percent' }, 'Giảm %'), el('option', { value: 'amount' }, 'Giảm số tiền'));
  const value = el('input', { class: 'input', type: 'number', min: 1, value: 10 });
  const min = el('input', { class: 'input', type: 'number', min: 0, step: 1000, value: 0 });
  const days = el('input', { class: 'input', type: 'number', min: 1, max: 365, value: 30 });
  const form = el(
    'form',
    {},
    el('div', { class: 'field' }, el('label', {}, 'Kiểu'), kind),
    el('div', { class: 'field' }, el('label', {}, 'Mức giảm'), value),
    el('div', { class: 'field' }, el('label', {}, 'Đơn tối thiểu (đ)'), min),
    el('div', { class: 'field' }, el('label', {}, 'Hiệu lực (ngày)'), days),
    el('p', { class: 'small muted' }, 'Voucher không gắn hội viên — ai có mã đều dùng được một lần.'),
  );
  modal({
    title: 'Tạo voucher',
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Tạo',
        class: 'btn-primary',
        onClick: async () => {
          try {
            const v = await staffApi('/api/admin/vouchers', {
              method: 'POST',
              body: { [kind.value]: Number(value.value), minOrderAmount: Number(min.value) || 0, days: Number(days.value) },
            });
            toast(`Đã tạo voucher ${v.code}`, 'success', 8000);
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

// ---------- Phân khúc & chiến dịch (F-037) ----------
const STATUS = { DRAFT: 'Nháp', SCHEDULED: 'Đã hẹn giờ', RUNNING: 'Đang chạy', DONE: 'Đã chạy', FAILED: 'Lỗi' };
const CHANNEL = { EXPORT: 'Xuất danh sách (CSV)', ZALO_OA: 'Zalo OA', SMS: 'SMS' };

async function renderCampaigns() {
  const [segments, campaigns] = await Promise.all([staffApi('/api/admin/segments'), staffApi('/api/admin/campaigns')]);
  clear(
    body,
    el(
      'div',
      { class: 'grid-2' },
      el(
        'div',
        { class: 'card' },
        el(
          'div',
          { class: 'row between' },
          el('h2', { style: { margin: 0 } }, 'Phân khúc'),
          el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => editSegment(null) }, '+ Thêm'),
        ),
        segments.length === 0
          ? el('p', { class: 'muted' }, 'Chưa có phân khúc.')
          : el(
              'ul',
              { class: 'plain-list' },
              segments.map((s) =>
                el(
                  'li',
                  { class: 'row between' },
                  el('span', {}, s.name, el('div', { class: 'small muted' }, ruleText(s.rule))),
                  el(
                    'span',
                    { class: 'row' },
                    el('button', { class: 'btn btn-sm', type: 'button', onclick: () => editSegment(s) }, 'Sửa'),
                    el(
                      'button',
                      {
                        class: 'btn btn-sm btn-danger',
                        type: 'button',
                        onclick: () => confirmAndDelete({ url: `/api/admin/segments/${s.segmentId}`, label: `phân khúc "${s.name}"`, onDone: load }),
                      },
                      'Xóa',
                    ),
                  ),
                ),
              ),
            ),
      ),
      el(
        'div',
        { class: 'card' },
        el(
          'div',
          { class: 'row between' },
          el('h2', { style: { margin: 0 } }, 'Chiến dịch'),
          el(
            'button',
            { class: 'btn btn-sm btn-primary', type: 'button', disabled: !segments.length, onclick: () => editCampaign(null, segments) },
            '+ Tạo chiến dịch',
          ),
        ),
        el('p', { class: 'small muted' }, 'Mỗi khách nhận tối đa 1 tin / 7 ngày; khách từ chối nhận tin không có trong danh sách.'),
        campaigns.length === 0
          ? el('p', { class: 'muted' }, 'Chưa có chiến dịch.')
          : table(
              ['Chiến dịch', 'Kênh', 'Trạng thái', 'Đã gửi', ''],
              campaigns.map((c) =>
                el(
                  'tr',
                  {},
                  el('td', {}, c.name, el('div', { class: 'small muted' }, c.segment.name)),
                  el('td', {}, CHANNEL[c.channel]),
                  el(
                    'td',
                    {},
                    STATUS[c.status],
                    c.scheduledAt && c.status === 'SCHEDULED' ? el('div', { class: 'small muted' }, dateTime(c.scheduledAt)) : null,
                  ),
                  el('td', { class: 'num' }, c.counts.delivered, c.counts.skipped ? el('div', { class: 'small muted' }, `bỏ qua ${c.counts.skipped}`) : null),
                  el(
                    'td',
                    { class: 'row' },
                    ['DRAFT', 'SCHEDULED'].includes(c.status)
                      ? [
                          el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => runCampaign(c) }, 'Chạy ngay'),
                          el('button', { class: 'btn btn-sm', type: 'button', onclick: () => editCampaign(c, segments) }, 'Sửa'),
                        ]
                      : el('button', { class: 'btn btn-sm', type: 'button', onclick: () => showCampaign(c.campaignId) }, 'Kết quả'),
                  ),
                ),
              ),
            ),
      ),
    ),
  );
}

function ruleText(r) {
  const parts = [];
  if (r.tierIn?.length) parts.push(`hạng ${r.tierIn.map((t) => state.tiers.find((x) => x.tierCode === t)?.name ?? t).join(' / ')}`);
  if (r.lastVisitDaysGte !== undefined) parts.push(`≥ ${r.lastVisitDaysGte} ngày chưa ghé`);
  if (r.lastVisitDaysLte !== undefined) parts.push(`ghé trong ${r.lastVisitDaysLte} ngày`);
  if (r.visitCountGte !== undefined) parts.push(`≥ ${r.visitCountGte} lượt`);
  if (r.visitCountLte !== undefined) parts.push(`≤ ${r.visitCountLte} lượt`);
  if (r.totalSpentGte !== undefined) parts.push(`chi ≥ ${money(r.totalSpentGte)}`);
  if (r.birthdayMonth !== undefined) parts.push(`sinh tháng ${r.birthdayMonth}`);
  if (r.hasPointsGte !== undefined) parts.push(`≥ ${r.hasPointsGte} điểm`);
  return parts.join(' · ') || 'Mọi hội viên';
}

function editSegment(s) {
  const r = s?.rule ?? {};
  const name = el('input', { class: 'input', maxlength: 100, value: s?.name ?? '' });
  const tierChecks = state.tiers.map((t) => ({ t, box: el('input', { type: 'checkbox', checked: r.tierIn?.includes(t.tierCode) ?? false }) }));
  const num = (key, label) => {
    const input = el('input', { class: 'input', type: 'number', min: 0, value: r[key] ?? '', 'aria-label': label, dataset: { key } });
    return { key, input, node: el('div', { class: 'field' }, el('label', {}, label), input) };
  };
  const fields = [
    num('lastVisitDaysGte', 'Chưa ghé ít nhất (ngày)'),
    num('lastVisitDaysLte', 'Có ghé trong (ngày)'),
    num('visitCountGte', 'Số lượt ghé ≥'),
    num('visitCountLte', 'Số lượt ghé ≤'),
    num('totalSpentGte', 'Tổng chi ≥ (đ)'),
    num('birthdayMonth', 'Sinh nhật tháng (1–12)'),
    num('hasPointsGte', 'Điểm ≥'),
  ];
  const result = el('div', { class: 'small' });
  const rule = () => {
    const out = {};
    const tiers = tierChecks.filter((x) => x.box.checked).map((x) => x.t.tierCode);
    if (tiers.length) out.tierIn = tiers;
    for (const f of fields) if (f.input.value !== '') out[f.key] = Number(f.input.value);
    return out;
  };
  const preview = async () => {
    try {
      const p = await staffApi('/api/admin/segments/preview', { method: 'POST', body: { rule: rule() } });
      clear(
        result,
        el('strong', {}, `${p.count} hội viên`),
        ` (loại ${p.optedOut} người từ chối nhận tin; ${p.recentlyContacted} người vừa nhận tin trong 7 ngày sẽ bị bỏ qua)`,
        p.sample.length ? el('div', { class: 'muted' }, `Ví dụ: ${p.sample.map((x) => `${x.maskedName} (${x.phone})`).join(', ')}`) : null,
      );
    } catch (err) {
      clear(result, el('span', { class: 'field-error' }, errorMessage(err)));
    }
  };
  const form = el(
    'form',
    {},
    el('div', { class: 'field' }, el('label', {}, 'Tên phân khúc'), name),
    el('label', {}, 'Hạng (không chọn = mọi hạng)'),
    el(
      'div',
      { class: 'row wrap' },
      tierChecks.map(({ t, box }) => el('label', { class: 'check' }, box, t.name)),
    ),
    el(
      'div',
      { class: 'form-grid' },
      fields.map((f) => f.node),
    ),
    el('button', { class: 'btn btn-sm', type: 'button', onclick: preview }, 'Xem trước số người'),
    result,
  );
  modal({
    title: s ? `Sửa phân khúc: ${s.name}` : 'Phân khúc mới',
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async () => {
          try {
            await staffApi(s ? `/api/admin/segments/${s.segmentId}` : '/api/admin/segments', {
              method: s ? 'PUT' : 'POST',
              body: { name: name.value.trim(), rule: rule() },
            });
            toast('Đã lưu phân khúc', 'success');
            load();
          } catch (err) {
            if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error');
            return false;
          }
        },
      },
    ],
  });
  preview();
}

function editCampaign(c, segments) {
  const name = el('input', { class: 'input', maxlength: 100, value: c?.name ?? '' });
  const seg = el(
    'select',
    { class: 'input' },
    segments.map((s) => el('option', { value: s.segmentId, selected: s.segmentId === c?.segment.segmentId }, s.name)),
  );
  const channel = el(
    'select',
    { class: 'input' },
    Object.entries(CHANNEL)
      .filter(([k]) => k !== 'SMS')
      .map(([k, v]) => el('option', { value: k, selected: k === (c?.channel ?? 'EXPORT') }, v)),
  );
  const message = el(
    'textarea',
    { class: 'input', rows: 3, maxlength: 500 },
    c?.messageTemplate ?? 'Chào {name}! Quán tặng bạn mã {voucher}, dùng trước {expires}. Hẹn gặp lại!',
  );
  const pct = el('input', { class: 'input', type: 'number', min: 1, max: 100, value: c?.voucherPercent ?? 10 });
  const days = el('input', { class: 'input', type: 'number', min: 1, max: 365, value: c?.voucherDays ?? 14 });
  const withVoucher = el('input', { type: 'checkbox', checked: c ? Boolean(c.voucherPercent) : true });
  const at = el('input', { class: 'input', type: 'datetime-local' });
  const form = el(
    'form',
    {},
    el('div', { class: 'field' }, el('label', {}, 'Tên chiến dịch'), name),
    el('div', { class: 'field' }, el('label', {}, 'Phân khúc'), seg),
    el('div', { class: 'field' }, el('label', {}, 'Kênh'), channel),
    el('div', { class: 'field' }, el('label', {}, 'Nội dung ({name} {voucher} {expires})'), message),
    el('label', { class: 'check' }, withVoucher, 'Tặng mỗi người một voucher riêng'),
    el(
      'div',
      { class: 'form-grid' },
      el('div', { class: 'field' }, el('label', {}, 'Giảm (%)'), pct),
      el('div', { class: 'field' }, el('label', {}, 'Hạn (ngày)'), days),
    ),
    el('div', { class: 'field' }, el('label', {}, 'Hẹn giờ chạy (để trống = lưu nháp, bấm "Chạy ngay" sau)'), at),
  );
  modal({
    title: c ? `Sửa chiến dịch: ${c.name}` : 'Chiến dịch mới',
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async () => {
          const payload = {
            name: name.value.trim(),
            segmentId: Number(seg.value),
            channel: channel.value,
            messageTemplate: message.value.trim(),
            voucherPercent: withVoucher.checked ? Number(pct.value) : null,
            voucherDays: withVoucher.checked ? Number(days.value) : null,
            scheduledAt: at.value ? `${at.value}:00+07:00` : null,
          };
          try {
            await staffApi(c ? `/api/admin/campaigns/${c.campaignId}` : '/api/admin/campaigns', { method: c ? 'PUT' : 'POST', body: payload });
            toast('Đã lưu chiến dịch', 'success');
            load();
          } catch (err) {
            if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error', 7000);
            return false;
          }
        },
      },
    ],
  });
}

async function runCampaign(c) {
  try {
    const r = await staffApi(`/api/admin/campaigns/${c.campaignId}/run`, { method: 'POST' });
    toast(`Đã chạy: ${r.result.delivered} người nhận, bỏ qua ${r.result.skipped}, lỗi ${r.result.failed}`, 'success', 7000);
    await load();
    showCampaign(c.campaignId);
  } catch (err) {
    toast(errorMessage(err), 'error', 7000);
  }
}

async function showCampaign(id) {
  let c;
  try {
    c = await staffApi(`/api/admin/campaigns/${id}`);
  } catch (err) {
    return toast(errorMessage(err), 'error');
  }
  const DSTATUS = { SENT: 'Đã gửi', EXPORTED: 'Trong file xuất', SKIPPED: 'Bỏ qua', FAILED: 'Lỗi' };
  modal({
    title: `Chiến dịch: ${c.name}`,
    drawer: true,
    body: el(
      'div',
      { class: 'stack' },
      el(
        'p',
        { class: 'small' },
        `${CHANNEL[c.channel]} · ${STATUS[c.status]}${c.finishedAt ? ` lúc ${dateTime(c.finishedAt)}` : ''}${c.error ? ` · ${c.error}` : ''}`,
      ),
      el(
        'div',
        { class: 'kpis' },
        el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Voucher đã dùng'), el('div', { class: 'value' }, c.effectiveness.vouchersUsed)),
        el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Doanh thu từ voucher'), el('div', { class: 'value' }, money(c.effectiveness.revenue))),
        el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Quay lại trong 14 ngày'), el('div', { class: 'value' }, c.effectiveness.returned14d)),
      ),
      c.channel === 'EXPORT' && c.counts.delivered
        ? el('button', { class: 'btn btn-primary', type: 'button', onclick: () => exportCsv(c) }, 'Tải danh sách (CSV, có SĐT đầy đủ — được ghi nhật ký)')
        : null,
      table(
        ['Khách', 'SĐT', 'Trạng thái', 'Voucher'],
        c.deliveries.map((d) =>
          el(
            'tr',
            {},
            el('td', {}, d.fullName),
            el('td', { class: 'mono' }, d.phone),
            el('td', {}, DSTATUS[d.status], d.error ? el('div', { class: 'small muted' }, d.error) : null),
            el('td', { class: 'mono' }, d.voucher ? `${d.voucher.code}${d.voucher.usedAt ? ' ✔' : ''}` : ''),
          ),
        ),
      ),
    ),
  });
}

async function exportCsv(c) {
  try {
    const url = await staffBlobUrl(`/api/admin/campaigns/${c.campaignId}/export.csv`);
    const a = el('a', { href: url, download: `chien-dich-${c.campaignId}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

await load();
