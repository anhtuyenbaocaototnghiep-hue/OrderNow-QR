// Hộp thoại kho nâng cao dùng chung (ADR-006 giai đoạn 5): thuộc tính nguyên liệu (hạn dùng / theo lô F-028, hao hụt định mức F-032),
// danh sách lô + hủy lô (F-028). Server kiểm mọi ràng buộc. Bán thành phẩm + công thức sơ chế (F-027) bỏ khỏi giao diện — ADR-064 D-254
// (nguyên liệu cũ đã là bán thành phẩm giữ nguyên loại khi lưu).
import { staffApi } from './api.js';
import { clear, dateTime, el, errorMessage, modal, money, num, showFieldErrors, toast } from './ui.js';

// Nguồn của lô (F-028) — lô cũ từ sơ chế vẫn hiện đúng nguồn
const LOT_SOURCE = { RECEIPT: 'Nhập kho', PREP: 'Sơ chế', ADJUST: 'Điều chỉnh / kiểm kê', RESTOCK: 'Hoàn tiền' };

export function ingredientBadges(i) {
  return [
    i.trackLots ? el('span', { class: 'pill' }, 'Theo lô') : null,
    i.expiredQty > 0 ? el('span', { class: 'pill danger' }, `Hết hạn ${num(i.expiredQty)} ${i.unit}`) : null,
  ];
}

export function costLine(i) {
  return el(
    'div',
    { class: 'muted small' },
    `Giá vốn bình quân: ${i.avgCost ? `${num(i.avgCost)}đ/${i.unit}` : 'chưa có'}`,
    i.wastePercent ? ` · hao hụt định mức ${num(i.wastePercent)}%` : '',
    i.shelfLifeHours ? ` · dùng trong ${i.shelfLifeHours} giờ` : '',
    // F-075: hạn sau khi mở
    i.packSize && i.openShelfHours ? ` · hộp ${num(i.packSize)} ${i.unit}, mở rồi dùng trong ${i.openShelfHours} giờ` : '',
    i.openLeft > 0 ? ` · hộp đang mở còn ${num(i.openLeft)} ${i.unit}` : '',
  );
}

/** Hạn dùng, hao hụt định mức, theo lô. */
export function advancedDialog(i, onDone) {
  const form = el(
    'form',
    { class: 'stack' },
    el(
      'div',
      { class: 'field' },
      // F-075: tách rõ với "hạn sau khi mở" bên dưới — ô này là hạn tính từ lúc nhập kho (tự điền hạn của lô)
      el('label', {}, 'Hạn dùng tính từ lúc nhập (giờ) — trống = không hạn'),
      el('input', { class: 'input', name: 'shelfLifeHours', type: 'number', min: 1, max: 8760, value: i.shelfLifeHours ?? '' }),
    ),
    el(
      'div',
      { class: 'field' },
      el('label', {}, 'Hao hụt định mức (% tiêu thụ) — dùng cho báo cáo thất thoát và dự báo nhập hàng'),
      el('input', { class: 'input', name: 'wastePercent', type: 'number', min: 0, max: 100, step: 'any', value: i.wastePercent ?? 0 }),
    ),
    // F-075 (ADR-033): hạn sau khi mở — một lô nhiều hộp nên theo dõi "hộp đang mở" (app tự biết lúc bán)
    el(
      'fieldset',
      { class: 'field open-pack' },
      el('legend', {}, 'Hạn sau khi mở hộp / gói (sữa, kem, siro…)'),
      el(
        'div',
        { class: 'time-pair' },
        el(
          'div',
          { class: 'stack' },
          el('label', { for: 'adv-pack' }, `Một hộp / gói bao nhiêu ${i.unit}`),
          el('input', { class: 'input', id: 'adv-pack', name: 'packSize', type: 'number', min: 0, step: 'any', value: i.packSize ?? '' }),
        ),
        el(
          'div',
          { class: 'stack' },
          el('label', { for: 'adv-open' }, 'Mở rồi dùng được (giờ)'),
          el('input', { class: 'input', id: 'adv-open', name: 'openShelfHours', type: 'number', min: 1, max: 8760, value: i.openShelfHours ?? '' }),
        ),
      ),
      el(
        'p',
        { class: 'small muted' },
        'Ví dụ sữa tươi: hộp 1000 ml, dùng trong 72 giờ sau khi mở. App tự biết lúc nào mở hộp mới (khi bán); quá hạn thì phần còn trong hộp không tính là còn hàng và quầy được nhắc bỏ. Để trống cả hai = không theo dõi.',
      ),
    ),
    el(
      'label',
      { class: 'check' },
      el('input', { type: 'checkbox', name: 'trackLots', checked: i.trackLots }),
      'Theo dõi theo lô + hạn sử dụng (trừ kho lô hết hạn sớm trước — FEFO)',
    ),
    el('p', { class: 'small muted' }, 'Bật theo lô: tồn hiện có thành một lô "Tồn đầu" không hạn. Tắt: đóng mọi lô.'),
  );
  modal({
    title: `Kho nâng cao: ${i.name}`,
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async () => {
          const f = (n) => form.elements.namedItem(n);
          try {
            await staffApi(`/api/admin/ingredients/${i.ingredientId}/advanced`, {
              method: 'PUT',
              body: {
                kind: i.kind, // ADR-064 D-254: không còn chọn loại — giữ nguyên
                shelfLifeHours: f('shelfLifeHours').value ? Number(f('shelfLifeHours').value) : null,
                wastePercent: Number(f('wastePercent').value || 0),
                trackLots: f('trackLots').checked,
                packSize: f('packSize').value ? Number(f('packSize').value) : null,
                openShelfHours: f('openShelfHours').value ? Number(f('openShelfHours').value) : null,
              },
            });
            toast('Đã lưu', 'success');
            onDone?.();
          } catch (err) {
            if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error', 6000);
            return false;
          }
        },
      },
    ],
  });
}

const fmtDate = (d) => (d ? d.split('-').reverse().join('/') : 'không hạn');

/** Lô của nguyên liệu (mở + đã đóng gần đây); hủy lô còn hàng. writeOffUrl: (lotId) → endpoint (quản lý hoặc quầy). */
export async function lotsDialog(i, onDone, writeOffUrl = (id) => `/api/admin/lots/${id}/write-off`) {
  const body = el('div', {}, el('p', { class: 'muted' }, 'Đang tải…'));
  const m = modal({ title: `Lô: ${i.name}`, body, actions: [{ label: 'Đóng', class: 'btn-primary' }] });
  async function load() {
    try {
      const r = await staffApi(`/api/admin/ingredients/${i.ingredientId}/lots?all=1`);
      clear(
        body,
        r.lots.length === 0
          ? el('p', { class: 'muted' }, 'Chưa có lô.')
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
                    ['Lô', 'Còn', 'Hạn dùng', 'Giá', 'Nguồn', 'Nhận lúc', ''].map((h) => el('th', {}, h)),
                  ),
                ),
                el(
                  'tbody',
                  {},
                  r.lots.map((l) =>
                    el(
                      'tr',
                      { class: l.isClosed ? 'muted' : '' },
                      el('td', {}, l.lotCode ?? `#${l.lotId}`),
                      el('td', { class: 'num' }, `${num(l.qty)} ${i.unit}`),
                      el(
                        'td',
                        {},
                        fmtDate(l.expiryDate),
                        !l.isClosed && l.daysLeft !== null && l.daysLeft < 0 ? el('span', { class: 'badge danger' }, ' Hết hạn') : null,
                        !l.isClosed && l.daysLeft !== null && l.daysLeft >= 0 && l.daysLeft <= 2
                          ? el('span', { class: 'badge pending' }, ` Còn ${l.daysLeft} ngày`)
                          : null,
                      ),
                      el('td', { class: 'num' }, `${money(l.unitCost)}/${i.unit}`),
                      el('td', {}, LOT_SOURCE[l.source] ?? l.source),
                      el('td', { class: 'small' }, dateTime(l.receivedAt)),
                      el(
                        'td',
                        {},
                        l.isClosed
                          ? 'Đã đóng'
                          : el(
                              'button',
                              {
                                class: 'btn btn-sm btn-danger',
                                type: 'button',
                                onclick: async () => {
                                  try {
                                    await staffApi(writeOffUrl(l.lotId), { method: 'POST', body: {} });
                                    toast(`Đã hủy lô ${l.lotCode ?? `#${l.lotId}`}`, 'success');
                                    await load();
                                    onDone?.();
                                  } catch (err) {
                                    toast(errorMessage(err), 'error', 6000);
                                  }
                                },
                              },
                              'Hủy lô',
                            ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
      );
    } catch (err) {
      clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
    }
  }
  await load();
  return m;
}
