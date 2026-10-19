// Điều chỉnh tồn kho tay có lý do (Q-011/ADR-003) — admin và trưởng ca ở quầy (F-036, D-24). Ghi giao dịch ADJUST + nhật ký thao tác.
import { staffApi } from './api.js';
import { el, errorMessage, modal, num, setBusy, showFieldErrors, toast } from './ui.js';

/** adjustDialog(nguyên liệu, { url (POST …/adjust), onDone }) */
export function adjustDialog(i, { url, onDone }) {
  const mode = el(
    'select',
    { class: 'input', name: 'mode' },
    el('option', { value: 'newQty' }, 'Đặt số tồn mới (kiểm kê)'),
    el('option', { value: 'delta' }, 'Cộng / trừ (nhập thêm, hao hụt…)'),
  );
  const qty = el('input', { class: 'input', name: 'newQty', inputmode: 'decimal', placeholder: `Ví dụ: ${num(i.stockQty)}` });
  const reason = el('input', { class: 'input', name: 'reason', maxlength: 200, placeholder: 'Ví dụ: Kiểm kê cuối ngày, nhập thêm hàng, đổ vỡ…' });
  const hint = el('div', { class: 'muted small' });
  const updateHint = () => {
    qty.name = mode.value;
    hint.textContent =
      mode.value === 'delta'
        ? 'Số dương = nhập thêm, số âm = giảm (ví dụ -50).'
        : `Tồn hiện tại ${num(i.stockQty)} ${i.unit}; đang giữ cho đơn ${num(i.reservedQty)} ${i.unit}.`;
  };
  mode.addEventListener('change', updateHint);
  updateHint();
  const form = el(
    'form',
    {},
    el('div', { class: 'field' }, el('label', {}, 'Cách điều chỉnh'), mode),
    el('div', { class: 'field' }, el('label', {}, `Số lượng (${i.unit})`), qty, hint),
    el('div', { class: 'field' }, el('label', {}, 'Lý do'), reason),
  );
  modal({
    title: `Điều chỉnh kho: ${i.name}`,
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu điều chỉnh',
        class: 'btn-primary',
        onClick: async (_c, e) => {
          const value = String(qty.value).replace(',', '.').trim();
          if (value === '' || Number.isNaN(Number(value))) {
            qty.classList.add('invalid');
            toast('Nhập số lượng hợp lệ', 'error');
            return false;
          }
          setBusy(e.currentTarget, true);
          try {
            const r = await staffApi(url, {
              method: 'POST',
              body: { [mode.value]: Number(value), reason: reason.value },
            });
            toast(`Đã điều chỉnh: ${r.name} còn ${num(r.stockQty)} ${r.unit}`, 'success');
            onDone?.();
          } catch (err) {
            setBusy(e.currentTarget, false);
            if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error', 5000);
            return false;
          }
        },
      },
    ],
  });
}
