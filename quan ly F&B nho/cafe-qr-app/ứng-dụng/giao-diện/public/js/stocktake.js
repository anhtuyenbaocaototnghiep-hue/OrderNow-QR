// Phiếu kiểm kê (FEATURE-023): DRAFT → nhập số đếm → chốt (ADJUST theo chênh lệch). Dùng ở admin (/api/admin/stocktakes)
// và ở quầy cho trưởng ca (/api/ops/stocktakes — F-036, D-24). Nguyên liệu trong phiếu nháp bị khóa điều chỉnh tay.
import { staffApi } from './api.js';
import { clear, confirmDialog, dateTime, el, errorMessage, modal, money, num, toast } from './ui.js';

/** stocktakeUi({ base, body (vùng hiển thị), ingredients() → danh sách nguyên liệu, reload() }) → { render, open } */
export function stocktakeUi({ base, body, ingredients, reload }) {
  async function renderStocktakes() {
    const list = await staffApi(base);
    clear(
      body,
      el(
        'div',
        { class: 'row', style: { marginBottom: '1rem' } },
        el('button', { class: 'btn btn-primary', type: 'button', onclick: newStocktake }, '+ Phiếu kiểm kê mới'),
        el('span', { class: 'small muted' }, 'Đếm thực tế → nhập số → Chốt: hệ thống điều chỉnh tồn theo chênh lệch và ghi lịch sử.'),
      ),
      list.length === 0
        ? el('div', { class: 'empty card' }, 'Chưa có phiếu kiểm kê.')
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
                  ['Phiếu', 'Trạng thái', 'Tạo lúc', 'Người đếm', 'Số nguyên liệu', 'Giá trị hao hụt', ''].map((h) => el('th', {}, h)),
                ),
              ),
              el(
                'tbody',
                {},
                list.map((s) =>
                  el(
                    'tr',
                    {},
                    el('td', { class: 'mono' }, `#${s.stocktakeId}`),
                    el(
                      'td',
                      {},
                      el(
                        'span',
                        { class: `pill ${s.status === 'DRAFT' ? '' : 'on'}` },
                        s.status === 'DRAFT' ? 'Nháp — đang đếm' : `Đã chốt ${dateTime(s.postedAt)}`,
                      ),
                    ),
                    el('td', { class: 'nowrap' }, dateTime(s.countedAt)),
                    el('td', {}, s.countedBy),
                    el('td', { class: 'num' }, s.lineCount),
                    el('td', { class: 'num' }, s.shrinkageValue ? money(s.shrinkageValue) : '—'),
                    el(
                      'td',
                      {},
                      el(
                        'button',
                        { class: 'btn btn-sm', type: 'button', onclick: () => openStocktake(s.stocktakeId) },
                        s.status === 'DRAFT' ? 'Nhập số đếm' : 'Xem',
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
    );
  }

  async function newStocktake() {
    const checks = ingredients().map((i) => ({ i, box: el('input', { type: 'checkbox', checked: true }) }));
    const note = el('input', { class: 'input', maxlength: 200, placeholder: 'Ghi chú (ví dụ: kiểm cuối tháng)' });
    await modal({
      title: 'Phiếu kiểm kê mới',
      body: el(
        'div',
        { class: 'stack' },
        el('p', { class: 'small muted' }, 'Nguyên liệu trong phiếu nháp bị khóa điều chỉnh tay cho tới khi chốt hoặc xóa phiếu.'),
        note,
        el(
          'div',
          { class: 'check-list' },
          checks.map(({ i, box }) => el('label', {}, box, `${i.name} (còn ${num(i.stockQty)} ${i.unit})`)),
        ),
      ),
      actions: [
        { label: 'Hủy', value: false },
        {
          label: 'Tạo phiếu',
          class: 'btn-primary',
          onClick: async (close) => {
            try {
              const s = await staffApi(base, {
                method: 'POST',
                body: { ingredientIds: checks.filter((c) => c.box.checked).map((c) => c.i.ingredientId), note: note.value || null },
              });
              close(true);
              openStocktake(s.stocktakeId);
              reload();
            } catch (err) {
              toast(errorMessage(err), 'error');
            }
            return false;
          },
        },
      ],
    }).result;
  }

  async function openStocktake(id) {
    let s;
    try {
      s = await staffApi(`${base}/${id}`);
    } catch (err) {
      return toast(errorMessage(err), 'error');
    }
    const draft = s.status === 'DRAFT';
    const inputs = s.lines.map((l) => ({
      l,
      counted: el('input', {
        class: 'input',
        type: 'number',
        min: 0,
        step: 'any',
        value: l.countedQty ?? '',
        disabled: !draft,
        'aria-label': `Đếm ${l.name}`,
        style: { width: '8rem' },
      }),
      note: el('input', { class: 'input', maxlength: 200, value: l.note ?? '', disabled: !draft, placeholder: 'Ghi chú', 'aria-label': `Ghi chú ${l.name}` }),
    }));
    const linesBody = () =>
      inputs.map(({ l, counted }) => ({
        ingredientId: l.ingredientId,
        countedQty: counted.value === '' ? null : Number(counted.value),
        note: inputs.find((x) => x.l === l).note.value || null,
      }));
    const save = () => staffApi(`${base}/${id}/lines`, { method: 'PUT', body: linesBody() });
    const m = modal({
      title: `Kiểm kê #${s.stocktakeId}${draft ? ' (nháp)' : ''}`,
      body: el(
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
              ['Nguyên liệu', draft ? 'Tồn hệ thống (hiện tại)' : 'Tồn lúc chốt', 'Đang giữ cho đơn', 'Đếm thực tế', draft ? '' : 'Chênh lệch', 'Ghi chú'].map(
                (h) => el('th', {}, h),
              ),
            ),
          ),
          el(
            'tbody',
            {},
            inputs.map(({ l, counted, note }) =>
              el(
                'tr',
                {},
                el('td', {}, l.name, el('span', { class: 'muted small' }, ` (${l.unit})`)),
                el('td', { class: 'num' }, num(draft ? l.currentQty : l.systemQty)),
                el('td', { class: 'num' }, num(l.reservedQty)),
                el('td', {}, counted),
                el('td', { class: `num ${l.diff < 0 ? 'neg' : ''}` }, draft ? '' : num(l.diff)),
                el('td', {}, note),
              ),
            ),
          ),
        ),
      ),
      actions: draft
        ? [
            {
              label: 'Xóa phiếu',
              class: 'btn-danger',
              onClick: async (close) => {
                if (
                  !(await confirmDialog('Xóa phiếu kiểm kê nháp?', 'Số đếm đã nhập sẽ mất; nguyên liệu được mở khóa điều chỉnh tay.', {
                    okLabel: 'Xóa',
                    danger: true,
                  }))
                )
                  return false;
                try {
                  await staffApi(`${base}/${id}`, { method: 'DELETE' });
                  close();
                  reload();
                } catch (err) {
                  toast(errorMessage(err), 'error');
                }
                return false;
              },
            },
            {
              label: 'Lưu nháp',
              onClick: async () => {
                try {
                  await save();
                  toast('Đã lưu số đếm', 'success');
                } catch (err) {
                  toast(errorMessage(err), 'error');
                }
                return false;
              },
            },
            {
              label: 'Chốt kiểm kê',
              class: 'btn-primary',
              onClick: async (close) => {
                try {
                  await save();
                  const r = await staffApi(`${base}/${id}/post`, { method: 'POST' });
                  toast(`Đã chốt kiểm kê #${id}${r.shrinkageValue ? ` · hao hụt ${money(r.shrinkageValue)}` : ''}`, 'success', 6000);
                  close();
                  reload();
                } catch (err) {
                  toast(errorMessage(err), 'error', 7000);
                }
                return false;
              },
            },
          ]
        : [{ label: 'Đóng', class: 'btn-primary' }],
    });
    m.root.style.width = 'min(900px, 100%)';
  }

  return { render: renderStocktakes, open: openStocktake };
}
