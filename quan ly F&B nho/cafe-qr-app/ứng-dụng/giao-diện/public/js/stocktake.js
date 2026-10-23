// Phiếu kiểm kê (FEATURE-023): DRAFT → nhập số đếm → chốt (ADJUST theo chênh lệch). Dùng ở admin (/api/admin/stocktakes)
// và ở quầy cho trưởng ca (/api/ops/stocktakes — F-036, D-24). Nguyên liệu trong phiếu nháp bị khóa điều chỉnh tay.
// F-048 (ADR-009): phiếu nháp Sửa (ghi chú, nguyên liệu) / Xóa ngay trên danh sách; phiếu đã chốt Hủy phiếu (chỉ màn quản lý — canVoid).
import { staffApi } from './api.js';
import { clear, confirmDialog, dateTime, el, errorMessage, modal, money, num, reasonDialog, toast } from './ui.js';

const STATUS = {
  DRAFT: () => el('span', { class: 'pill' }, 'Nháp — đang đếm'),
  POSTED: (s) => el('span', { class: 'pill on' }, `Đã chốt ${dateTime(s.postedAt)}`),
  VOIDED: () => el('span', { class: 'pill off' }, 'Đã hủy'),
};

/** stocktakeUi({ base, body (vùng hiển thị), ingredients() → danh sách nguyên liệu, reload(), canVoid (hủy phiếu đã chốt) }) → { render, open } */
export function stocktakeUi({ base, body, ingredients, reload, canVoid = false }) {
  // Tên nút có số phiếu — trình đọc màn hình phân biệt được các dòng
  const btn = (label, onclick, cls = '', name = label) => el('button', { class: `btn btn-sm ${cls}`, type: 'button', 'aria-label': name, onclick }, label);

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
                    { class: s.status === 'VOIDED' ? 'voided' : '' },
                    el('td', { class: 'mono' }, `#${s.stocktakeId}`),
                    el('td', {}, (STATUS[s.status] ?? STATUS.DRAFT)(s)),
                    el('td', { class: 'nowrap' }, dateTime(s.countedAt)),
                    el('td', {}, s.countedBy),
                    el('td', { class: 'num' }, s.lineCount),
                    el('td', { class: 'num' }, s.shrinkageValue ? money(s.shrinkageValue) : '—'),
                    el(
                      'td',
                      {},
                      el(
                        'div',
                        { class: 'row nowrap' },
                        s.status === 'DRAFT'
                          ? [
                              btn('Nhập số đếm', () => openStocktake(s.stocktakeId), '', `Nhập số đếm phiếu kiểm kê #${s.stocktakeId}`),
                              btn('Sửa', () => editDraft(s.stocktakeId), '', `Sửa phiếu kiểm kê #${s.stocktakeId}`),
                              btn('Xóa', () => removeDraft(s.stocktakeId), 'btn-danger', `Xóa phiếu kiểm kê #${s.stocktakeId}`),
                            ]
                          : [
                              btn('Xem', () => openStocktake(s.stocktakeId), '', `Xem phiếu kiểm kê #${s.stocktakeId}`),
                              canVoid && s.status === 'POSTED'
                                ? btn('Hủy phiếu', () => voidPosted(s.stocktakeId), 'btn-danger', `Hủy phiếu kiểm kê #${s.stocktakeId}`)
                                : null,
                            ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
    );
  }

  /** Hộp chọn nguyên liệu + ghi chú — dùng cho phiếu mới và Sửa phiếu nháp. */
  function pickForm(selected, noteValue) {
    const checks = ingredients().map((i) => ({ i, box: el('input', { type: 'checkbox', checked: selected(i.ingredientId) }) }));
    const note = el('input', {
      class: 'input',
      maxlength: 200,
      value: noteValue ?? '',
      placeholder: 'Ghi chú (ví dụ: kiểm cuối tháng)',
      'aria-label': 'Ghi chú',
    });
    const node = el(
      'div',
      { class: 'stack' },
      el('p', { class: 'small muted' }, 'Nguyên liệu trong phiếu nháp bị khóa điều chỉnh tay cho tới khi chốt hoặc xóa phiếu.'),
      note,
      el(
        'div',
        { class: 'check-list' },
        checks.map(({ i, box }) => el('label', {}, box, `${i.name} (còn ${num(i.stockQty)} ${i.unit})`)),
      ),
    );
    return { node, note, ids: () => checks.filter((c) => c.box.checked).map((c) => c.i.ingredientId) };
  }

  async function newStocktake() {
    const f = pickForm(() => true);
    await modal({
      title: 'Phiếu kiểm kê mới',
      body: f.node,
      actions: [
        { label: 'Hủy', value: false },
        {
          label: 'Tạo phiếu',
          class: 'btn-primary',
          onClick: async (close) => {
            try {
              const s = await staffApi(base, { method: 'POST', body: { ingredientIds: f.ids(), note: f.note.value || null } });
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

  /** Sửa phiếu nháp (F-048): ghi chú + thêm / bớt nguyên liệu (bớt → mất số đếm dòng đó). */
  async function editDraft(id) {
    let s;
    try {
      s = await staffApi(`${base}/${id}`);
    } catch (err) {
      return toast(errorMessage(err), 'error');
    }
    const inDraft = new Set(s.lines.map((l) => l.ingredientId));
    const f = pickForm((ingredientId) => inDraft.has(ingredientId), s.note);
    await modal({
      title: `Sửa phiếu kiểm kê #${id}`,
      body: el('div', {}, f.node, el('p', { class: 'small muted' }, 'Bỏ chọn một nguyên liệu sẽ xóa số đếm đã nhập của nguyên liệu đó.')),
      actions: [
        { label: 'Thôi', value: false },
        {
          label: 'Lưu',
          class: 'btn-primary',
          onClick: async (close) => {
            try {
              await staffApi(`${base}/${id}`, { method: 'PUT', body: { ingredientIds: f.ids(), note: f.note.value || null } });
              toast(`Đã sửa phiếu kiểm kê #${id}`, 'success');
              close(true);
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

  async function removeDraft(id, closeDetail) {
    if (
      !(await confirmDialog(`Xóa phiếu kiểm kê nháp #${id}?`, 'Số đếm đã nhập sẽ mất; nguyên liệu được mở khóa điều chỉnh tay.', {
        okLabel: 'Xóa',
        danger: true,
      }))
    )
      return;
    try {
      await staffApi(`${base}/${id}`, { method: 'DELETE' });
      toast(`Đã xóa phiếu kiểm kê #${id}`, 'success');
      closeDetail?.();
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  /** Hủy phiếu đã chốt (F-048, chỉ quản lý): hoàn lại điều chỉnh tồn, không tính hao hụt. */
  async function voidPosted(id, closeDetail) {
    const reason = await reasonDialog(
      `Hủy phiếu kiểm kê #${id}?`,
      'Tồn kho trở lại như trước khi chốt (hoàn lại mọi chênh lệch), phiếu không còn tính vào hao hụt / thất thoát. Chỉ hủy được phiếu chốt gần nhất của các nguyên liệu trong phiếu. Muốn đếm lại thì tạo phiếu mới.',
      { okLabel: 'Hủy phiếu', danger: true, placeholder: 'Ví dụ: đếm nhầm kệ, nhập sai đơn vị…' },
    );
    if (!reason) return;
    try {
      await staffApi(`${base}/${id}/void`, { method: 'POST', body: { reason } });
      toast(`Đã hủy phiếu kiểm kê #${id}`, 'success');
      closeDetail?.();
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error', 8000);
    }
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
      title: `Kiểm kê #${s.stocktakeId}${draft ? ' (nháp)' : s.status === 'VOIDED' ? ' (đã hủy)' : ''}`,
      body: el(
        'div',
        {},
        s.status === 'VOIDED'
          ? el('p', { class: 'small' }, el('strong', {}, 'Đã hủy'), ` ${dateTime(s.voidedAt)} · ${s.voidedBy} · Lý do: ${s.voidReason}`)
          : null,
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
                [
                  'Nguyên liệu',
                  draft ? 'Tồn hệ thống (hiện tại)' : 'Tồn lúc chốt',
                  'Đang giữ cho đơn',
                  'Đếm thực tế',
                  draft ? '' : 'Chênh lệch',
                  'Ghi chú',
                ].map((h) => el('th', {}, h)),
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
      ),
      actions: draft
        ? [
            {
              label: 'Xóa phiếu',
              class: 'btn-danger',
              onClick: async (close) => {
                await removeDraft(id, close);
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
        : [
            canVoid && s.status === 'POSTED'
              ? {
                  label: 'Hủy phiếu',
                  class: 'btn-danger',
                  onClick: async (close) => {
                    await voidPosted(id, close);
                    return false;
                  },
                }
              : null,
            { label: 'Đóng', class: 'btn-primary' },
          ].filter(Boolean),
    });
    m.root.style.width = 'min(900px, 100%)';
  }

  return { render: renderStocktakes, open: openStocktake };
}
