// Chọn tùy chọn món (FEATURE-013): radio khi nhóm chọn 1, checkbox khi chọn nhiều; tôn trọng tối thiểu/tối đa.
// Dùng chung cho menu khách (sheet) và quầy bán mang đi (modal). Giá hiển thị chỉ để tham khảo — server tính lại.
// F-081 (ADR-039): `pickItem` — bảng chọn món của khách (tùy chọn + ghi chú + số lượng) trượt lên ngay khi bấm món.
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

/**
 * Trạng thái chọn + các fieldset nhóm tùy chọn (dùng chung cho bảng chọn ở quầy và của khách).
 * → { nodes, chosen(), missing() } — missing() = nhóm bắt buộc chưa đủ (null nếu đủ).
 */
function optionGroups(item, modifierGroups, { initial = null, errorEl, onChange }) {
  const groups = groupsOf(item, modifierGroups);
  const selected = new Map(groups.map((g) => [g.groupId, new Set()]));
  const start = initial ?? defaultChoice(item, modifierGroups)?.optionIds ?? [];
  for (const g of groups) for (const o of g.options) if (start.includes(o.optionId)) selected.get(g.groupId).add(o.optionId);
  const chosen = () => groups.flatMap((g) => g.options.filter((o) => selected.get(g.groupId).has(o.optionId)));
  const nodes = groups.map((g) => {
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
          onChange();
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
  });
  const missing = () => groups.find((g) => selected.get(g.groupId).size < g.minSelect) ?? null;
  return { nodes, chosen, missing };
}

/** Mở bảng chọn → Promise { optionIds, optionLabels, optionDelta } | null (đóng). */
export function pickOptions(item, modifierGroups, { initial = null, sheet = true, confirmLabel = 'Thêm vào giỏ' } = {}) {
  const totalEl = el('strong');
  const errorEl = el('div', { class: 'field-error', hidden: true });
  const refresh = () => {
    totalEl.textContent = money(item.price + opts.chosen().reduce((s, o) => s + o.priceDelta, 0));
  };
  const opts = optionGroups(item, modifierGroups, { initial, errorEl, onChange: () => refresh() });
  const body = el('div', { class: 'opt-picker' }, opts.nodes, errorEl, el('div', { class: 'opt-total' }, el('span', {}, 'Giá 1 phần'), totalEl));
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
          const g = opts.missing();
          if (g) {
            errorEl.textContent = `Vui lòng chọn ${g.name}`;
            errorEl.hidden = false;
            return false;
          }
          close(describe(opts.chosen()));
          return false;
        },
      },
    ],
  }).result.then((v) => (v && typeof v === 'object' ? v : null));
}

/**
 * F-081 (ADR-039 D-178…D-181): bảng chọn món của khách — bấm món là trượt lên ngay, chọn hết ở một chỗ rồi mới vào giỏ:
 * tùy chọn (size, topping… — lựa chọn mặc định chọn sẵn), ghi chú nhanh (nút) + ô ghi chú, số lượng; nút "Thêm vào giỏ · tổng".
 * `head` = phần đầu (ảnh, giá, mô tả combo…) do trang dựng. Không tự đưa bàn phím lên (nút chính được focus, không phải ô ghi chú).
 * → Promise { optionIds, optionLabels, optionDelta, note, quantity } | null (đóng / Hủy).
 */
export function pickItem(item, modifierGroups, { head = null, noteChips = [], allowNote = true, maxQty = 50 } = {}) {
  const errorEl = el('div', { class: 'field-error', hidden: true });
  const unitEl = el('strong');
  let qty = 1;
  let confirmBtn = null;
  const unitPrice = () => item.price + opts.chosen().reduce((s, o) => s + o.priceDelta, 0);
  const refresh = () => {
    unitEl.textContent = money(unitPrice());
    qtyEl.textContent = String(qty);
    minus.disabled = qty <= 1;
    plus.disabled = qty >= maxQty;
    if (confirmBtn) confirmBtn.textContent = `Thêm vào giỏ · ${money(unitPrice() * qty)}`;
  };
  const opts = optionGroups(item, modifierGroups, { errorEl, onChange: () => refresh() });

  // Ghi chú: nút chọn nhanh ghép vào ô ghi chú (giống giỏ hàng)
  const note = el('input', { class: 'input', id: 'item-note', maxlength: 200, placeholder: 'Ví dụ: ít ngọt, không đá…', autocomplete: 'off' });
  const parts = () =>
    note.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const chips = noteChips.map((chip) => {
    const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': 'false' }, chip);
    b.addEventListener('click', () => {
      const cur = parts();
      const next = cur.includes(chip) ? cur.filter((p) => p !== chip) : [...cur, chip];
      note.value = next.join(', ').slice(0, 200);
      syncChips();
    });
    return b;
  });
  const syncChips = () => chips.forEach((b) => b.setAttribute('aria-pressed', String(parts().includes(b.textContent))));
  note.addEventListener('input', syncChips);

  const qtyEl = el('span', { 'aria-live': 'polite', id: 'item-qty' });
  const minus = el('button', { type: 'button', 'aria-label': `Bớt ${item.name}` }, '−');
  const plus = el('button', { type: 'button', 'aria-label': `Thêm ${item.name}` }, '+');
  minus.addEventListener('click', () => {
    qty = Math.max(1, qty - 1);
    refresh();
  });
  plus.addEventListener('click', () => {
    qty = Math.min(maxQty, qty + 1);
    refresh();
  });

  const body = el(
    'div',
    { class: 'opt-picker item-sheet' },
    head,
    opts.nodes,
    errorEl,
    allowNote
      ? el(
          'div',
          { class: 'item-note field' },
          el('label', { for: 'item-note' }, 'Ghi chú'),
          chips.length ? el('div', { class: 'note-chips' }, chips) : null,
          note,
        )
      : null,
    el('div', { class: 'item-qty' }, el('span', {}, 'Số lượng'), el('div', { class: 'stepper' }, minus, qtyEl, plus)),
    el('div', { class: 'opt-total' }, el('span', {}, 'Giá 1 phần'), unitEl),
  );

  const m = modal({
    title: item.name,
    sheet: true,
    body,
    actions: [
      { label: 'Hủy', value: null },
      {
        label: 'Thêm vào giỏ',
        class: 'btn-primary',
        onClick: (close) => {
          const g = opts.missing();
          if (g) {
            errorEl.textContent = `Vui lòng chọn ${g.name}`;
            errorEl.hidden = false;
            errorEl.scrollIntoView({ block: 'nearest' });
            return false;
          }
          close({ ...describe(opts.chosen()), note: allowNote ? note.value.trim().slice(0, 200) : '', quantity: qty });
          return false;
        },
      },
    ],
  });
  confirmBtn = m.root.querySelector('.modal-foot .btn-primary');
  refresh();
  confirmBtn?.focus(); // không mở bàn phím điện thoại bằng ô ghi chú
  return m.result.then((v) => (v && typeof v === 'object' ? v : null));
}
