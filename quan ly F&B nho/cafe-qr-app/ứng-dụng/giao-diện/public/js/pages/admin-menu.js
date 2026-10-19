// S-21 Thực đơn: danh mục + món (giá, ảnh, còn bán/hết món, ẩn/hiện), link sang định lượng BOM (FEATURE-010).
import { staffApi } from '../api.js';
import { confirmAndDelete, mountAdminShell, toggle } from '../admin-shell.js';
import { $, clear, el, errorMessage, modal, money, moneyInput, moneyValue, setBusy, setMoney, showFieldErrors, thumb, toast } from '../ui.js';

await mountAdminShell('menu');

const state = { categories: [], items: [], groups: [], filter: '' };

async function load() {
  try {
    [state.categories, state.items, state.groups] = await Promise.all([
      staffApi('/api/admin/categories'),
      staffApi('/api/admin/menu-items'),
      staffApi('/api/admin/modifier-groups'),
    ]);
    render();
  } catch (err) {
    clear($('#content'), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

clear($('#head-actions'), el('button', { class: 'btn btn-primary', type: 'button', onclick: () => editItem(null) }, '+ Thêm món'));

function render() {
  clear($('#content'), el('div', { class: 'grid-2' }, categoriesCard(), itemsCard()));
}

// ---------- Danh mục ----------
function categoriesCard() {
  const name = el('input', { class: 'input', name: 'name', placeholder: 'Tên danh mục mới', maxlength: 50 });
  const form = el(
    'form',
    {
      class: 'row',
      style: { marginTop: '0.75rem' },
      onsubmit: async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button');
        setBusy(btn, true);
        try {
          await staffApi('/api/admin/categories', { method: 'POST', body: { name: name.value, sortOrder: state.categories.length + 1 } });
          toast('Đã thêm danh mục', 'success');
          await load();
        } catch (err) {
          if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error');
        } finally {
          setBusy(btn, false);
        }
      },
    },
    name,
    el('button', { class: 'btn', type: 'submit' }, 'Thêm'),
  );
  return el(
    'div',
    { class: 'card' },
    el('h2', { style: { fontSize: '1rem' } }, 'Danh mục'),
    el(
      'div',
      { class: 'stack' },
      el(
        'button',
        {
          class: `chip ${state.filter === '' ? 'active' : ''}`,
          type: 'button',
          onclick: () => {
            state.filter = '';
            render();
          },
        },
        `Tất cả (${state.items.length})`,
      ),
      state.categories.map((c) =>
        el(
          'div',
          { class: 'row between' },
          el(
            'button',
            {
              class: `chip ${state.filter === c.categoryId ? 'active' : ''}`,
              type: 'button',
              onclick: () => {
                state.filter = c.categoryId;
                render();
              },
            },
            `${c.name} (${c.itemCount})`,
            c.sellFrom ? ` · ${c.sellFrom}–${c.sellTo}` : '',
          ),
          el(
            'div',
            { class: 'row' },
            el('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => editCategory(c) }, 'Sửa'),
            el('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => deleteCategory(c), 'aria-label': `Xóa ${c.name}` }, 'Xóa'),
          ),
        ),
      ),
    ),
    form,
  );
}

function editCategory(c) {
  const name = el('input', { class: 'input', name: 'name', value: c.name, maxlength: 50 });
  const sort = el('input', { class: 'input', name: 'sortOrder', type: 'number', min: 0, value: c.sortOrder });
  const from = el('input', { class: 'input', name: 'sellFrom', type: 'time', value: c.sellFrom ?? '' });
  const to = el('input', { class: 'input', name: 'sellTo', type: 'time', value: c.sellTo ?? '' });
  const form = el(
    'form',
    {},
    el('div', { class: 'field' }, el('label', {}, 'Tên danh mục'), name),
    el('div', { class: 'field' }, el('label', {}, 'Thứ tự hiển thị'), sort),
    el(
      'div',
      { class: 'field' },
      el('label', {}, 'Giờ bán trên menu khách (để trống = cả ngày)'),
      el('div', { class: 'row' }, from, el('span', {}, '→'), to),
      el('div', { class: 'small muted' }, 'Ngoài giờ bán, danh mục bị ẩn trên menu QR (quầy vẫn bán mang đi). Giờ kết thúc nhỏ hơn giờ bắt đầu = qua nửa đêm.'),
    ),
  );
  modal({
    title: 'Sửa danh mục',
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async () => {
          try {
            await staffApi(`/api/admin/categories/${c.categoryId}`, {
              method: 'PUT',
              body: { name: name.value, sortOrder: Number(sort.value), sellFrom: from.value || null, sellTo: to.value || null },
            });
            toast('Đã lưu danh mục', 'success');
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

function deleteCategory(c) {
  return confirmAndDelete({
    url: `/api/admin/categories/${c.categoryId}`,
    label: `danh mục "${c.name}"`,
    warning: 'Chỉ xóa được danh mục không còn món nào.',
    onDone: () => {
      if (state.filter === c.categoryId) state.filter = '';
      return load();
    },
  });
}

function deleteItem(i) {
  return confirmAndDelete({
    url: `/api/admin/menu-items/${i.menuItemId}`,
    label: `món "${i.name}"`,
    warning: 'Khách sẽ không thấy món này trên thực đơn nữa.',
    onDone: load,
  });
}

// ---------- Món ----------
function itemsCard() {
  const items = state.filter === '' ? state.items : state.items.filter((i) => i.categoryId === state.filter);
  return el(
    'div',
    {},
    items.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có món nào. Bấm "+ Thêm món".')
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
                el('th', {}, 'Món'),
                el('th', {}, 'Danh mục'),
                el('th', { class: 'num' }, 'Giá'),
                el('th', {}, 'Còn bán'),
                el('th', {}, 'Hiện trên menu'),
                el('th', {}, 'Định lượng'),
                el('th', {}, 'Tùy chọn'),
                el('th', {}, ''),
              ),
            ),
            el(
              'tbody',
              {},
              items.map((i) =>
                el(
                  'tr',
                  {},
                  el(
                    'td',
                    {},
                    el(
                      'div',
                      { class: 'row' },
                      thumb(i.name, i.imageUrl),
                      el('div', {}, el('strong', {}, i.name), i.soldOut && i.isAvailable ? el('div', { class: 'badge danger' }, 'Hết nguyên liệu') : null),
                    ),
                  ),
                  el('td', {}, i.categoryName),
                  el('td', { class: 'num' }, money(i.price)),
                  el(
                    'td',
                    {},
                    toggle(i.isAvailable, (v, input) => setAvailability(i, v, input), `Còn bán ${i.name}`),
                  ),
                  el(
                    'td',
                    {},
                    toggle(i.isActive, (v, input) => saveItem(i.menuItemId, { ...itemBody(i), isActive: v }, input), `Hiện ${i.name}`),
                  ),
                  el('td', {}, el('a', { href: `/admin/menu/${i.menuItemId}/bom` }, i.bomCount ? `${i.bomCount} nguyên liệu` : 'Chưa có — thiết lập')),
                  el(
                    'td',
                    { class: 'small' },
                    i.groupIds
                      .map((g) => state.groups.find((x) => x.groupId === g)?.name)
                      .filter(Boolean)
                      .join(', ') || '—',
                  ),
                  el(
                    'td',
                    {},
                    el(
                      'div',
                      { class: 'row' },
                      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => editItem(i) }, 'Sửa'),
                      el('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => deleteItem(i), 'aria-label': `Xóa ${i.name}` }, 'Xóa'),
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
      '"Còn bán" tắt = báo hết món ngay cho khách (cập nhật realtime). Món cũng tự hiện "Hết món" khi kho không đủ nguyên liệu cho 1 suất.',
    ),
  );
}

const itemBody = (i) => ({
  categoryId: i.categoryId,
  name: i.name,
  price: i.price,
  imageUrl: i.imageUrl ?? '',
  isAvailable: i.isAvailable,
  isActive: i.isActive,
});

async function setAvailability(item, isAvailable, input) {
  try {
    await staffApi(`/api/admin/menu-items/${item.menuItemId}/availability`, { method: 'PATCH', body: { isAvailable } });
    toast(isAvailable ? `${item.name}: còn bán` : `${item.name}: đã báo hết món`, 'success');
    load();
  } catch (err) {
    input.checked = !isAvailable;
    toast(errorMessage(err), 'error');
  }
}

async function saveItem(id, body, input) {
  try {
    await staffApi(`/api/admin/menu-items/${id}`, { method: 'PUT', body });
    load();
  } catch (err) {
    if (input) input.checked = !input.checked;
    toast(errorMessage(err), 'error');
  }
}

function editItem(item) {
  const isNew = !item;
  const price = moneyInput({ name: 'price', id: 'price' });
  setMoney(price, item?.price ?? null);
  const form = el(
    'form',
    {},
    el(
      'div',
      { class: 'field' },
      el('label', { for: 'name' }, 'Tên món'),
      el('input', { class: 'input', id: 'name', name: 'name', maxlength: 100, value: item?.name ?? '' }),
    ),
    el(
      'div',
      { class: 'field' },
      el('label', { for: 'categoryId' }, 'Danh mục'),
      el(
        'select',
        { class: 'input', id: 'categoryId', name: 'categoryId' },
        state.categories.map((c) => el('option', { value: c.categoryId, selected: c.categoryId === (item?.categoryId ?? state.filter) }, c.name)),
      ),
    ),
    el('div', { class: 'field' }, el('label', { for: 'price' }, 'Giá (VND)'), price),
    el(
      'div',
      { class: 'field' },
      el('label', { for: 'imageUrl' }, 'Ảnh (URL, không bắt buộc)'),
      el('input', { class: 'input', id: 'imageUrl', name: 'imageUrl', maxlength: 500, placeholder: 'https://… hoặc /img/…', value: item?.imageUrl ?? '' }),
    ),
    state.groups.length
      ? el(
          'div',
          { class: 'field' },
          el('label', {}, 'Nhóm tùy chọn (size, đường, đá, topping…)'),
          el(
            'div',
            { class: 'check-list' },
            state.groups.map((g) =>
              el(
                'label',
                {},
                el('input', { type: 'checkbox', name: 'groupIds', value: g.groupId, checked: item?.groupIds.includes(g.groupId) }),
                `${g.name} · ${g.options.map((o) => o.name).join(', ')}`,
              ),
            ),
          ),
        )
      : el('p', { class: 'small muted' }, 'Tạo nhóm tùy chọn (Size, Đường…) ở trang "Tùy chọn món" để gán cho món.'),
    el(
      'div',
      { class: 'field' },
      el('label', { for: 'prepSeconds' }, 'Thời gian pha chuẩn (giây, trống = dùng thống kê thực tế) — ước tính thời gian chờ'),
      el('input', {
        class: 'input',
        id: 'prepSeconds',
        name: 'prepSeconds',
        type: 'number',
        min: 10,
        max: 3600,
        placeholder: 'Ví dụ 90',
        value: item?.prepSeconds ?? '',
      }),
    ),
    el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'isAvailable', checked: item?.isAvailable ?? true }), 'Còn bán'),
    el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'isActive', checked: item?.isActive ?? true }), 'Hiện trên menu'),
  );
  if (state.categories.length === 0) {
    toast('Hãy tạo danh mục trước', 'warning');
    return;
  }
  modal({
    title: isNew ? 'Thêm món' : `Sửa món: ${item.name}`,
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async (_close, e) => {
          const f = (name) => form.elements.namedItem(name);
          const body = {
            name: f('name').value,
            categoryId: Number(f('categoryId').value),
            price: moneyValue(price) ?? -1,
            imageUrl: f('imageUrl').value,
            isAvailable: f('isAvailable').checked,
            isActive: f('isActive').checked,
            groupIds: [...form.querySelectorAll('input[name="groupIds"]:checked')].map((x) => Number(x.value)),
            prepSeconds: f('prepSeconds').value ? Number(f('prepSeconds').value) : null,
          };
          setBusy(e.currentTarget, true);
          try {
            if (isNew) await staffApi('/api/admin/menu-items', { method: 'POST', body });
            else await staffApi(`/api/admin/menu-items/${item.menuItemId}`, { method: 'PUT', body });
            toast(isNew ? 'Đã thêm món' : 'Đã lưu món', 'success');
            load();
          } catch (err) {
            setBusy(e.currentTarget, false);
            if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error');
            return false;
          }
        },
      },
    ],
  });
}

load();
