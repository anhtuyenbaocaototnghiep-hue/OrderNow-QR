// Chọn tùy chọn món (FEATURE-013): radio khi nhóm chọn 1, checkbox khi chọn nhiều; tôn trọng tối thiểu/tối đa.
// Dùng chung cho menu khách (sheet) và quầy bán mang đi (modal). Giá hiển thị chỉ để tham khảo — server tính lại.
import { el, modal, money } from './ui.js';

/** Nhóm tùy chọn gán cho món (theo thứ tự nhóm trên menu). */
export const groupsOf = (item, modifierGroups) => (item.groupIds ?? []).map((id) => modifierGroups.find((g) => g.groupId === id)).filter(Boolean);

/** Lựa chọn mặc định hợp lệ (mọi nhóm bắt buộc đều có mặc định) → thêm nhanh không mở bảng chọn; ngược lại null. */
export function defaultChoice(item, modifierGroups) {
  const groups = groupsOf(item, modifierGroups);
  if (groups.length === 0) return { optionIds: [], optionLabels: [], optionDelta: 0 };
  const chosen = [];
  for (const g of groups) {
    const defs = g.options.filter((o) => o.isDefault).slice(0, g.maxSelect);
    if (defs.length < g.minSelect) return null;
    chosen.push(...defs);
  }
  return describe(chosen);
}

const describe = (opts) => ({
  optionIds: opts.map((o) => o.optionId),
  optionLabels: opts.map((o) => o.name),
  optionDelta: opts.reduce((s, o) => s + o.priceDelta, 0),
});

/** Mở bảng chọn → Promise { optionIds, optionLabels, optionDelta } | null (đóng). */
export function pickOptions(item, modifierGroups, { initial = null, sheet = true, confirmLabel = 'Thêm vào giỏ' } = {}) {
  const groups = groupsOf(item, modifierGroups);
  const selected = new Map(groups.map((g) => [g.groupId, new Set()]));
  const start = initial ?? defaultChoice(item, modifierGroups)?.optionIds ?? [];
  for (const g of groups) for (const o of g.options) if (start.includes(o.optionId)) selected.get(g.groupId).add(o.optionId);

  const totalEl = el('strong');
  const errorEl = el('div', { class: 'field-error', hidden: true });
  const chosenOptions = () => groups.flatMap((g) => g.options.filter((o) => selected.get(g.groupId).has(o.optionId)));
  const refresh = () => {
    totalEl.textContent = money(item.price + chosenOptions().reduce((s, o) => s + o.priceDelta, 0));
  };

  const body = el(
    'div',
    { class: 'opt-picker' },
    groups.map((g) => {
      const single = g.maxSelect === 1;
      const hint = g.minSelect > 0 ? (single ? 'Bắt buộc chọn 1' : `Chọn ${g.minSelect}–${g.maxSelect}`) : single ? 'Không bắt buộc' : `Tối đa ${g.maxSelect}`;
      return el(
        'fieldset',
        { class: 'opt-group' },
        el('legend', {}, g.name, ' ', el('span', { class: 'muted small' }, `(${hint})`)),
        g.options.map((o) => {
          const input = el('input', {
            type: single ? 'radio' : 'checkbox',
            name: `g${g.groupId}`,
            value: o.optionId,
            checked: selected.get(g.groupId).has(o.optionId),
          });
          input.addEventListener('change', () => {
            const set = selected.get(g.groupId);
            if (single) {
              set.clear();
              set.add(o.optionId);
            } else if (input.checked) {
              if (set.size >= g.maxSelect) {
                input.checked = false;
                errorEl.textContent = `${g.name}: chọn tối đa ${g.maxSelect}`;
                errorEl.hidden = false;
                return;
              }
              set.add(o.optionId);
            } else set.delete(o.optionId);
            errorEl.hidden = true;
            refresh();
          });
          return el(
            'label',
            { class: 'opt-row' },
            input,
            el('span', { class: 'grow' }, o.name),
            o.priceDelta ? el('span', { class: 'muted' }, `+${money(o.priceDelta)}`) : null,
          );
        }),
      );
    }),
    errorEl,
    el('div', { class: 'opt-total' }, el('span', {}, 'Giá 1 phần'), totalEl),
  );
  refresh();

  return modal({
    title: item.name,
    sheet,
    body,
    actions: [
      { label: 'Hủy', value: null },
      {
        label: confirmLabel,
        class: 'btn-primary',
        onClick: (close) => {
          for (const g of groups) {
            const n = selected.get(g.groupId).size;
            if (n < g.minSelect) {
              errorEl.textContent = `Vui lòng chọn ${g.name}`;
              errorEl.hidden = false;
              return false;
            }
          }
          close(describe(chosenOptions()));
          return false;
        },
      },
    ],
  }).result.then((v) => (v && typeof v === 'object' ? v : null));
}
