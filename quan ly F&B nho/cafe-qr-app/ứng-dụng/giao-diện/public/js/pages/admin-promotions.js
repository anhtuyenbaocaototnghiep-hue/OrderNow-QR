// S-28 Khuyến mãi (FEATURE-016, D-8, D-10): giá đặc biệt theo món/danh mục theo lịch (happy hour) hoặc giảm theo đơn tối thiểu;
// giới hạn lượt/ngày, cờ cộng dồn hội viên; thống kê lượt dùng, tiền giảm, doanh thu đơn có khuyến mãi.
import { staffApi } from '../api.js';
import { mountAdminShell, toggle } from '../admin-shell.js';
import { $, clear, confirmDialog, el, errorMessage, modal, money, showFieldErrors, toast, todayVn } from '../ui.js';

await mountAdminShell('promotions');

const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']; // bit0 = Chủ nhật
const TYPES = {
  ITEM_PRICE: 'Giá đặc biệt cho món',
  ORDER_PERCENT: 'Giảm % theo đơn',
  ORDER_AMOUNT: 'Giảm tiền theo đơn',
};
const state = { list: [], items: [], categories: [] };
clear($('#head-actions'), el('button', { class: 'btn btn-primary', type: 'button', onclick: () => edit(null) }, '+ Thêm khuyến mãi'));

async function load() {
  try {
    [state.list, state.items, state.categories] = await Promise.all([
      staffApi('/api/admin/promotions'),
      staffApi('/api/admin/menu-items'),
      staffApi('/api/admin/categories'),
    ]);
    render();
  } catch (err) {
    clear($('#content'), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

const fmtDate = (d) => d.split('-').reverse().join('/');
const valueText = (p) => (p.type === 'ITEM_PRICE' ? money(p.value) : p.type === 'ORDER_PERCENT' ? `−${p.value}%` : `−${money(p.value)}`);
const daysText = (mask) => (mask === 127 ? 'mọi ngày' : DAYS.filter((_, i) => mask & (1 << i)).join(', '));
const targetText = (p) =>
  p.type !== 'ITEM_PRICE'
    ? p.minOrderAmount > 0
      ? `đơn từ ${money(p.minOrderAmount)}`
      : 'mọi đơn'
    : [
        ...p.itemIds.map((id) => state.items.find((i) => i.menuItemId === id)?.name ?? `#${id}`),
        ...p.categoryIds.map((id) => `DM ${state.categories.find((c) => c.categoryId === id)?.name ?? id}`),
      ].join(', ');

function render() {
  clear(
    $('#content'),
    state.list.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có khuyến mãi. Ví dụ: "Happy hour 14–17h trà đào 25k", "Giảm 10% đơn từ 200k".')
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
                ['Khuyến mãi', 'Loại', 'Mức', 'Áp dụng', 'Lịch', 'Lượt hôm nay', 'Cộng dồn HV', 'Bật', ''].map((h) => el('th', {}, h)),
              ),
            ),
            el(
              'tbody',
              {},
              state.list.map((p) =>
                el(
                  'tr',
                  {},
                  el('td', {}, el('strong', {}, p.name), p.badgeText ? el('div', {}, el('span', { class: 'pill' }, p.badgeText)) : null),
                  el('td', { class: 'small' }, TYPES[p.type]),
                  el('td', { class: 'nowrap' }, valueText(p)),
                  el('td', { class: 'small' }, targetText(p)),
                  el(
                    'td',
                    { class: 'small' },
                    `${fmtDate(p.startDate)} → ${fmtDate(p.endDate)}`,
                    el('div', {}, daysText(p.daysOfWeekMask), p.startTime ? ` · ${p.startTime}–${p.endTime}` : ' · cả ngày'),
                  ),
                  el('td', { class: 'num' }, p.maxUsesPerDay ? `${p.usedToday}/${p.maxUsesPerDay}` : p.usedToday),
                  el('td', {}, p.stackWithMember ? 'Có' : 'Không'),
                  el(
                    'td',
                    {},
                    toggle(
                      p.isActive,
                      async (v, input) => {
                        try {
                          await staffApi(`/api/admin/promotions/${p.promotionId}/active`, { method: 'PATCH', body: { isActive: v } });
                          load();
                        } catch (err) {
                          input.checked = !v;
                          toast(errorMessage(err), 'error');
                        }
                      },
                      `Bật ${p.name}`,
                    ),
                  ),
                  el(
                    'td',
                    {},
                    el(
                      'div',
                      { class: 'row' },
                      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => edit(p) }, 'Sửa'),
                      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => stats(p) }, 'Thống kê'),
                      el('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => remove(p) }, 'Xóa'),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
    el(
      'p',
      { class: 'muted small' },
      'Giá khuyến mãi khóa lúc khách gửi đơn. Một món chỉ nhận một khuyến mãi giá (giá thấp nhất); một đơn chỉ nhận một khuyến mãi theo đơn (giảm nhiều nhất). Giờ tính theo giờ quán.',
    ),
  );
}

async function remove(p) {
  if (
    !(await confirmDialog(`Xóa "${p.name}"?`, 'Khuyến mãi đã được dùng sẽ được ẩn (giữ cho báo cáo); chưa dùng thì xóa hẳn.', { okLabel: 'Xóa', danger: true }))
  )
    return;
  try {
    const r = await staffApi(`/api/admin/promotions/${p.promotionId}`, { method: 'DELETE' });
    toast(r.result === 'ARCHIVED' ? 'Đã xóa (vẫn giữ trong báo cáo)' : 'Đã xóa khuyến mãi', 'success');
    load();
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

async function stats(p) {
  try {
    const s = await staffApi(`/api/admin/promotions/${p.promotionId}/stats`);
    modal({
      title: `Thống kê: ${p.name}`,
      body: el(
        'div',
        { class: 'kpis' },
        el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Lượt dùng (đơn)'), el('div', { class: 'value' }, s.uses)),
        el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Tổng tiền giảm'), el('div', { class: 'value' }, money(s.discount))),
        el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Doanh thu đơn có KM'), el('div', { class: 'value' }, money(s.revenue))),
      ),
      actions: [{ label: 'Đóng', class: 'btn-primary' }],
    });
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

function edit(p) {
  const isNew = !p;
  const v = (name, value) => el('input', { class: 'input', name, value: value ?? '' });
  const type = el(
    'select',
    { class: 'input', name: 'type' },
    Object.entries(TYPES).map(([k, label]) => el('option', { value: k, selected: k === (p?.type ?? 'ITEM_PRICE') }, label)),
  );
  const valueLabel = el('label', {}, '');
  const minRow = el(
    'div',
    { class: 'field' },
    el('label', {}, 'Đơn tối thiểu (đ)'),
    el('input', { class: 'input', name: 'minOrderAmount', type: 'number', min: 0, step: 1000, value: p?.minOrderAmount ?? 0 }),
  );
  const targetsBox = el(
    'div',
    { class: 'field' },
    el('label', {}, 'Áp dụng cho món / danh mục'),
    el(
      'div',
      { class: 'check-list', id: 'targets' },
      state.categories.map((c) =>
        el(
          'label',
          {},
          el('input', { type: 'checkbox', name: 'cat', value: c.categoryId, checked: p?.categoryIds.includes(c.categoryId) }),
          el('strong', {}, `Cả danh mục ${c.name}`),
        ),
      ),
      state.items.map((i) =>
        el(
          'label',
          {},
          el('input', { type: 'checkbox', name: 'item', value: i.menuItemId, checked: p?.itemIds.includes(i.menuItemId) }),
          `${i.name} (${money(i.price)})`,
        ),
      ),
    ),
  );
  const syncType = () => {
    const t = type.value;
    valueLabel.textContent = t === 'ITEM_PRICE' ? 'Giá mới (đ)' : t === 'ORDER_PERCENT' ? 'Giảm (%)' : 'Giảm (đ)';
    targetsBox.hidden = t !== 'ITEM_PRICE';
    minRow.hidden = t === 'ITEM_PRICE';
  };
  type.addEventListener('change', syncType);
  const mask = p?.daysOfWeekMask ?? 127;
  const form = el(
    'form',
    { class: 'stack' },
    el(
      'div',
      { class: 'form-grid' },
      el('div', { class: 'field' }, el('label', {}, 'Tên khuyến mãi'), v('name', p?.name)),
      el('div', { class: 'field' }, el('label', {}, 'Loại'), type),
      el('div', { class: 'field' }, valueLabel, el('input', { class: 'input', name: 'value', type: 'number', min: 0, step: 'any', value: p?.value ?? '' })),
      minRow,
      el(
        'div',
        { class: 'field' },
        el('label', {}, 'Từ ngày'),
        el('input', { class: 'input', name: 'startDate', type: 'date', value: p?.startDate ?? todayVn() }),
      ),
      el(
        'div',
        { class: 'field' },
        el('label', {}, 'Đến ngày'),
        el('input', { class: 'input', name: 'endDate', type: 'date', value: p?.endDate ?? todayVn() }),
      ),
      el(
        'div',
        { class: 'field' },
        el('label', {}, 'Từ giờ (trống = cả ngày)'),
        el('input', { class: 'input', name: 'startTime', type: 'time', value: p?.startTime ?? '' }),
      ),
      el('div', { class: 'field' }, el('label', {}, 'Đến giờ'), el('input', { class: 'input', name: 'endTime', type: 'time', value: p?.endTime ?? '' })),
      el(
        'div',
        { class: 'field' },
        el('label', {}, 'Tối đa lượt/ngày (trống = không giới hạn)'),
        el('input', { class: 'input', name: 'maxUsesPerDay', type: 'number', min: 1, value: p?.maxUsesPerDay ?? '' }),
      ),
      el(
        'div',
        { class: 'field' },
        el('label', {}, 'Nhãn hiển thị (≤ 30 ký tự)'),
        el('input', { class: 'input', name: 'badgeText', maxlength: 30, value: p?.badgeText ?? '', placeholder: 'Giờ vàng' }),
      ),
    ),
    el(
      'div',
      { class: 'field' },
      el('label', {}, 'Ngày trong tuần'),
      el(
        'div',
        { class: 'days' },
        DAYS.map((d, i) => el('label', {}, el('input', { type: 'checkbox', name: 'dow', value: i, checked: Boolean(mask & (1 << i)) }), d)),
      ),
    ),
    targetsBox,
    el(
      'label',
      { class: 'check' },
      el('input', { type: 'checkbox', name: 'stackWithMember', checked: p?.stackWithMember ?? false }),
      'Cho cộng dồn chiết khấu hội viên',
    ),
    el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'isActive', checked: p?.isActive ?? true }), 'Bật'),
  );
  syncType();
  modal({
    title: isNew ? 'Thêm khuyến mãi' : `Sửa: ${p.name}`,
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async () => {
          const f = (n) => form.elements.namedItem(n);
          const checked = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((x) => Number(x.value));
          const body = {
            name: f('name').value,
            type: type.value,
            value: Number(f('value').value),
            minOrderAmount: type.value === 'ITEM_PRICE' ? 0 : Number(f('minOrderAmount').value || 0),
            startDate: f('startDate').value,
            endDate: f('endDate').value,
            daysOfWeekMask: checked('dow').reduce((m, i) => m | (1 << i), 0),
            startTime: f('startTime').value || null,
            endTime: f('endTime').value || null,
            maxUsesPerDay: f('maxUsesPerDay').value ? Number(f('maxUsesPerDay').value) : null,
            stackWithMember: f('stackWithMember').checked,
            badgeText: f('badgeText').value || null,
            isActive: f('isActive').checked,
            itemIds: type.value === 'ITEM_PRICE' ? checked('item') : [],
            categoryIds: type.value === 'ITEM_PRICE' ? checked('cat') : [],
          };
          try {
            if (isNew) await staffApi('/api/admin/promotions', { method: 'POST', body });
            else await staffApi(`/api/admin/promotions/${p.promotionId}`, { method: 'PUT', body });
            toast('Đã lưu khuyến mãi', 'success');
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
// F-041: "Tạo khuyến mãi" từ menu engineering → mở form mới, chọn sẵn món (?menuItemId=)
const preset = Number(new URLSearchParams(location.search).get('menuItemId'));
if (preset) {
  edit(null);
  const box = document.querySelector(`#targets input[name="item"][value="${preset}"]`);
  if (box) box.checked = true;
}
