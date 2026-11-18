// Hộp thoại nhận hàng theo đơn đặt hàng (FEATURE-030) — dùng chung trang quản lý (S-35) và quầy "Kho" (S-17).
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
  // DEF-033: mỗi dòng — tên + "đặt … · đã nhận …" (cùng đơn vị gói) ở trên; các ô có nhãn ở dưới, tự xuống hàng theo bề ngang hộp
  // (trước: lưới 4 cột cố định chỉ có ở trang quản lý → dòng có ô hạn dùng ép tên còn một chữ mỗi dòng, ô ngày tràn ra ngoài hộp)
  const field = (label, input) => el('label', { class: 'recv-field' }, el('span', { class: 'small muted' }, label), input);
  const form = el(
    'div',
    { class: 'stack' },
    rows.map((r) => {
      const pack = r.l.packUnitCode;
      const receivedPacks = Math.round((r.l.receivedBaseQty / r.l.packSize) * 1000) / 1000;
      return el(
        'div',
        { class: 'recv-line' },
        el(
          'div',
          { class: 'recv-head' },
          el('strong', {}, r.l.name),
          el('span', { class: 'small muted' }, `đặt ${num(r.l.orderedPacks)} ${pack} · đã nhận ${num(receivedPacks)} ${pack}`),
        ),
        el(
          'div',
          { class: 'recv-fields' },
          field(
            `Số nhận (${pack})`,
            el('input', { class: 'input', type: 'number', min: 0, step: 'any', value: r.packs, oninput: (e) => (r.packs = e.target.value) }),
          ),
          field(
            `Giá / ${pack} (đ)`,
            el('input', { class: 'input', type: 'number', min: 0, step: 'any', value: r.price, oninput: (e) => (r.price = e.target.value) }),
          ),
          r.lots ? field('Hạn sử dụng', el('input', { class: 'input', type: 'date', oninput: (e) => (r.expiry = e.target.value) })) : null,
        ),
      );
    }),
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
