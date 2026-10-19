// Hộp thoại nhận hàng theo đơn đặt hàng (FEATURE-030) — dùng chung trang quản lý (S-35) và quầy "Kho & sơ chế" (S-17).
import { staffApi } from './api.js';
import { clear, el, errorMessage, modal, num, toast } from './ui.js';

/** Nhận hàng: điền sẵn số gói còn thiếu; nhập hạn dùng cho nguyên liệu theo lô; nhận vượt cần xác nhận. */
export function receivePoDialog(po, { url, onDone, ingredients }) {
  const rows = po.lines.map((l) => {
    const remaining = Math.max(0, Math.round(((l.orderedBaseQty - l.receivedBaseQty) / l.packSize) * 1000) / 1000);
    const lots = ingredients.find((i) => i.ingredientId === l.ingredientId)?.trackLots;
    return { l, packs: remaining, price: l.unitPrice ?? '', expiry: '', lots };
  });
  const over = el('input', { type: 'checkbox' });
  const msg = el('div');
  const form = el(
    'div',
    { class: 'stack' },
    rows.map((r) =>
      el(
        'div',
        { class: 'receipt-row' },
        el(
          'div',
          {},
          el('strong', {}, r.l.name),
          el('div', { class: 'small muted' }, `đặt ${num(r.l.orderedPacks)} ${r.l.packUnitCode} · đã nhận ${num(r.l.receivedBaseQty)} ${r.l.unit}`),
        ),
        el('input', {
          class: 'input',
          type: 'number',
          min: 0,
          step: 'any',
          value: r.packs,
          'aria-label': `Thực nhận ${r.l.name}`,
          oninput: (e) => (r.packs = e.target.value),
        }),
        el('input', {
          class: 'input',
          type: 'number',
          min: 0,
          step: 'any',
          placeholder: 'Giá / gói',
          value: r.price,
          oninput: (e) => (r.price = e.target.value),
        }),
        r.lots ? el('input', { class: 'input', type: 'date', title: 'Hạn sử dụng', oninput: (e) => (r.expiry = e.target.value) }) : null,
      ),
    ),
    el('label', { class: 'check' }, over, 'Xác nhận nhận vượt số đã đặt (nếu có)'),
    msg,
  );
  modal({
    title: `Nhận hàng — đơn #${po.poId} (${po.supplierName})`,
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Nhập kho',
        class: 'btn-success',
        onClick: async () => {
          try {
            const r = await staffApi(url, {
              method: 'POST',
              body: {
                confirmOver: over.checked,
                lines: rows.map((x) => ({
                  poLineId: x.l.poLineId,
                  packs: Number(x.packs || 0),
                  packPrice: x.price === '' ? null : Number(x.price),
                  expiryDate: x.expiry || null,
                })),
              },
            });
            toast(r.po.status === 'RECEIVED' ? 'Đã nhận đủ hàng' : 'Đã nhận một phần — đơn vẫn chờ phần còn lại', 'success');
            onDone?.();
          } catch (err) {
            clear(msg, el('div', { class: 'field-error' }, errorMessage(err)));
            return false;
          }
        },
      },
    ],
  });
}
