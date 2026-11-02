// Sổ quỹ ca (FEATURE-033, ADR-006 D-23) — dùng ở màn Ca (POS) và trang Sổ quỹ (admin).
// Chi > ngưỡng / danh mục cần duyệt → "Chờ duyệt"; trưởng ca / quản lý duyệt. Nhân viên đứng quầy → nhập tài khoản người duyệt.
// F-050: khoản đã duyệt của ca còn mở có Sửa / Hủy (quyền như duyệt); khoản đã hủy giữ trong sổ, nhãn "Đã hủy".
// TASK-081 (dễ dùng): chọn danh mục bằng nút, nút số tiền nhanh, nội dung để trống = tên danh mục (trừ danh mục luôn cần duyệt),
// báo trước khoản nào sẽ chờ duyệt, chụp ảnh hóa đơn bằng camera; bảng gọn 5 cột.
import { staffApi, staffBlobUrl, staffUpload } from './api.js';
import { clear, dateTime, el, errorMessage, modal, money, moneyInput, moneyValue, setMoney, time, toast } from './ui.js';
import { icon } from './icons.js';

export const CASH_STATUS = {
  PENDING: ['Chờ duyệt', 'pending'],
  APPROVED: ['Đã duyệt', 'ok'],
  REJECTED: ['Từ chối', 'danger'],
  VOIDED: ['Đã hủy', 'voided'], // F-050
};
export const cashStatusBadge = (s) => el('span', { class: `badge ${CASH_STATUS[s][1]}` }, CASH_STATUS[s][0]);
const MAX_IMAGE = 2 * 1024 * 1024;
const canApprove = (user) => user.role === 'MANAGER' || user.role === 'ADMIN';

let categoriesCache = null;
const loadCategories = async () => (categoriesCache ??= await staffApi('/api/cash-categories'));

function fileField() {
  // capture: điện thoại / máy tính bảng mở thẳng camera để chụp hóa đơn (máy tính bỏ qua, vẫn chọn tệp)
  return el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', capture: 'environment', class: 'input', 'aria-label': 'Ảnh hóa đơn' });
}

async function uploadReceipt(id, file) {
  if (file.size > MAX_IMAGE) throw new Error('Ảnh hóa đơn tối đa 2 MB');
  return staffUpload(`/api/cash-transactions/${id}/receipt`, file);
}

const QUICK_AMOUNTS = [20000, 50000, 100000, 200000, 500000];
let thresholdCache = null;
const loadThreshold = async () => (thresholdCache ??= (await staffApi('/api/shifts/current')).cashApproveThreshold ?? null);

/** Hộp thoại ghi khoản chi (OUT) / thu thêm (IN). Trả khoản vừa ghi hoặc null. */
export async function cashEntryDialog(direction) {
  let cats;
  let threshold = null;
  try {
    [cats, threshold] = await Promise.all([
      loadCategories().then((all) => all.filter((c) => c.direction === direction)),
      direction === 'OUT' ? loadThreshold().catch(() => null) : null, // không đọc được ngưỡng → chỉ không báo trước
    ]);
  } catch (err) {
    toast(errorMessage(err), 'error');
    return null;
  }
  if (!cats.length) {
    toast('Chưa có danh mục — quản lý thêm ở Quản lý → Sổ quỹ → Danh mục thu chi', 'warning', 6000);
    return null;
  }
  let chosen = cats[0];
  const chips = el(
    'div',
    { class: 'cash-chips', role: 'group', 'aria-labelledby': 'cash-cat-label' },
    cats.map((c) =>
      el(
        'button',
        {
          class: 'btn btn-sm',
          type: 'button',
          'aria-pressed': String(c === chosen),
          onclick: () => {
            chosen = c;
            [...chips.children].forEach((b, k) => b.setAttribute('aria-pressed', String(cats[k] === c)));
            refresh();
          },
        },
        c.name,
      ),
    ),
  );
  const amount = moneyInput({ id: 'cash-amount' });
  amount.addEventListener('input', () => refresh());
  const quick = el(
    'div',
    { class: 'row wrap cash-quick', role: 'group', 'aria-label': 'Số tiền nhanh' },
    QUICK_AMOUNTS.map((v) =>
      el(
        'button',
        {
          class: 'btn btn-sm',
          type: 'button',
          onclick: () => {
            setMoney(amount, v);
            refresh();
          },
        },
        money(v),
      ),
    ),
  );
  const reason = el('input', { class: 'input', id: 'cash-reason', maxlength: 200 });
  const reasonLabel = el('label', { for: 'cash-reason' });
  const file = fileField();
  const note = el('p', { class: 'small cash-note', 'aria-live': 'polite' });
  const msg = el('div');
  const willWait = () => direction === 'OUT' && (chosen.requiresApproval || (threshold !== null && (moneyValue(amount) ?? 0) > threshold));
  function refresh() {
    clear(reasonLabel, chosen.requiresApproval ? 'Nội dung (bắt buộc với danh mục này)' : 'Nội dung (không bắt buộc)');
    reason.placeholder = chosen.requiresApproval ? 'Ghi rõ chi cho việc gì' : `Để trống sẽ ghi "${chosen.name}"`;
    clear(
      note,
      willWait()
        ? [
            el('span', { class: 'badge pending' }, 'Cần duyệt'),
            ` Khoản này chờ trưởng ca / quản lý duyệt, chưa trừ vào két tới khi duyệt${chosen.requiresApproval ? ` (danh mục "${chosen.name}" luôn cần duyệt)` : ` (chi trên ${money(threshold)})`}.`,
          ]
        : direction === 'OUT'
          ? 'Lưu xong là trừ vào tiền dự kiến trong két.'
          : 'Lưu xong là cộng vào tiền dự kiến trong két.',
    );
  }
  refresh();
  const result = await modal({
    title: direction === 'OUT' ? 'Chi tiền từ két' : 'Thu thêm vào két',
    body: el(
      'div',
      { class: 'stack' },
      el('div', { id: 'cash-cat-label' }, 'Danh mục'),
      chips,
      el('label', { for: 'cash-amount' }, 'Số tiền'),
      amount,
      quick,
      reasonLabel,
      reason,
      direction === 'OUT' ? [el('label', {}, 'Ảnh hóa đơn (không bắt buộc, ≤ 2 MB — máy có camera thì chụp luôn)'), file] : null,
      note,
      msg,
    ),
    actions: [
      { label: 'Hủy', value: null },
      {
        label: direction === 'OUT' ? 'Ghi khoản chi' : 'Ghi khoản thu',
        class: 'btn-primary',
        onClick: async (close) => {
          const v = moneyValue(amount);
          if (!v) {
            clear(msg, el('div', { class: 'field-error' }, 'Nhập số tiền'));
            return false;
          }
          const text = reason.value.trim() || (chosen.requiresApproval ? '' : chosen.name);
          if (!text) {
            clear(msg, el('div', { class: 'field-error' }, `Danh mục "${chosen.name}" cần ghi rõ nội dung`));
            return false;
          }
          const f = file.files?.[0];
          if (f && f.size > MAX_IMAGE) {
            clear(msg, el('div', { class: 'field-error' }, 'Ảnh hóa đơn tối đa 2 MB'));
            return false;
          }
          try {
            let txn = await staffApi('/api/cash-transactions', {
              method: 'POST',
              body: { categoryId: chosen.categoryId, amount: v, reason: text },
            });
            if (f) {
              try {
                txn = await uploadReceipt(txn.cashTxnId, f);
              } catch (err) {
                toast(`Đã ghi khoản, nhưng chưa gắn được ảnh: ${errorMessage(err)}`, 'warning', 7000);
              }
            }
            toast(txn.status === 'PENDING' ? `Đã ghi ${money(v)} — chờ duyệt` : `Đã ghi ${money(v)}`, txn.status === 'PENDING' ? 'warning' : 'success', 5000);
            close(txn);
          } catch (err) {
            clear(msg, el('div', { class: 'alert danger' }, errorMessage(err)));
          }
          return false;
        },
      },
    ],
  }).result;
  return result && typeof result === 'object' ? result : null;
}

/** Duyệt / từ chối khoản chờ. user: người đang đăng nhập. Trả true nếu đã xử lý. */
export async function reviewDialog(txn, user, approve) {
  const self = canApprove(user) && txn.createdBy.userId !== user.userId;
  const otherBox = el('input', { type: 'checkbox' });
  const adminUser = el('input', {
    class: 'input',
    placeholder: 'Tên đăng nhập trưởng ca / quản lý',
    autocomplete: 'off',
    'aria-label': 'Tên đăng nhập người duyệt',
  });
  const adminPass = el('input', {
    class: 'input',
    type: 'password',
    placeholder: 'Mật khẩu',
    autocomplete: 'new-password',
    'aria-label': 'Mật khẩu người duyệt',
  });
  const credsRow = el('div', { class: 'row' }, adminUser, adminPass);
  const creds = el('div', { class: 'approval', hidden: self }, el('div', { class: 'small' }, 'Người duyệt nhập tài khoản:'), credsRow);
  otherBox.addEventListener('change', () => (creds.hidden = !otherBox.checked));
  const rejectReason = el('input', { class: 'input', maxlength: 200, placeholder: 'Lý do từ chối', 'aria-label': 'Lý do từ chối' });
  const msg = el('div');
  const ok = await modal({
    title: `${approve ? 'Duyệt' : 'Từ chối'} khoản chi ${money(txn.amount)}`,
    body: el(
      'div',
      { class: 'stack' },
      el('p', {}, `${txn.category.name} — ${txn.reason}`),
      el('p', { class: 'small muted' }, `Ghi lúc ${dateTime(txn.createdAt)} bởi ${txn.createdBy.fullName}`),
      approve ? null : rejectReason,
      self ? el('label', { class: 'check' }, otherBox, 'Người khác duyệt (nhập tài khoản)') : null,
      creds,
      msg,
    ),
    actions: [
      { label: 'Hủy', value: false },
      {
        label: approve ? 'Duyệt chi' : 'Từ chối',
        class: approve ? 'btn-primary' : 'btn-danger',
        onClick: async (close) => {
          const useCreds = !creds.hidden;
          const body = {
            ...(approve ? {} : { rejectReason: rejectReason.value.trim() }),
            ...(useCreds ? { adminUsername: adminUser.value.trim(), adminPassword: adminPass.value } : {}),
          };
          try {
            await staffApi(`/api/cash-transactions/${txn.cashTxnId}/${approve ? 'approve' : 'reject'}`, { method: 'POST', body });
            toast(approve ? 'Đã duyệt khoản chi' : 'Đã từ chối khoản chi', 'success');
            close(true);
          } catch (err) {
            clear(msg, el('div', { class: 'alert danger' }, errorMessage(err)));
          }
          return false;
        },
      },
    ],
  }).result;
  return ok === true;
}

/**
 * Hủy / sửa khoản đã duyệt (F-050). Hủy: khoản → "Đã hủy", két cộng / trừ lại. Sửa: hủy + ghi khoản thay thế (điền sẵn; vượt ngưỡng → chờ duyệt).
 * Chỉ khi ca còn mở; quyền như duyệt (trưởng ca / quản lý; không tự hủy khoản mình ghi trừ quản lý; nhân viên → người duyệt nhập tài khoản).
 */
export async function voidDialog(txn, user, { edit = false } = {}) {
  let cats = [];
  if (edit) {
    try {
      cats = (await loadCategories()).filter((c) => c.direction === txn.direction);
    } catch (err) {
      toast(errorMessage(err), 'error');
      return false;
    }
  }
  const self = canApprove(user) && (txn.createdBy.userId !== user.userId || user.role === 'ADMIN');
  const otherBox = el('input', { type: 'checkbox' });
  const adminUser = el('input', {
    class: 'input',
    placeholder: 'Tên đăng nhập trưởng ca / quản lý',
    autocomplete: 'off',
    'aria-label': 'Tên đăng nhập người duyệt',
  });
  const adminPass = el('input', {
    class: 'input',
    type: 'password',
    placeholder: 'Mật khẩu',
    autocomplete: 'new-password',
    'aria-label': 'Mật khẩu người duyệt',
  });
  const creds = el(
    'div',
    { class: 'approval', hidden: self },
    el('div', { class: 'small' }, 'Người duyệt nhập tài khoản:'),
    el('div', { class: 'row' }, adminUser, adminPass),
  );
  otherBox.addEventListener('change', () => (creds.hidden = !otherBox.checked));
  const reason = el('input', { class: 'input', maxlength: 200, placeholder: edit ? 'Ví dụ: ghi nhầm số tiền' : 'Ví dụ: ghi trùng, đã trả lại tiền vào két' });
  const archived = edit && !cats.some((c) => c.categoryId === txn.category.categoryId); // danh mục cũ đã ngừng dùng → phải chọn danh mục khác
  const cat = edit
    ? el(
        'select',
        { class: 'input' },
        archived ? el('option', { value: '', selected: true, disabled: true }, `${txn.category.name} (ngừng dùng — chọn danh mục khác)`) : null,
        cats.map((c) =>
          el('option', { value: c.categoryId, selected: c.categoryId === txn.category.categoryId }, c.name + (c.requiresApproval ? ' (cần duyệt)' : '')),
        ),
      )
    : null;
  const amount = edit ? moneyInput({}) : null;
  if (amount) setMoney(amount, txn.amount);
  const oldReason = txn.reason.replace(/ \(thay khoản #\d+\)$/, '').slice(0, 180);
  const newReason = edit ? el('input', { class: 'input', maxlength: 180, value: oldReason }) : null;
  const msg = el('div');
  const ok = await modal({
    title: `${edit ? 'Sửa' : 'Hủy'} khoản ${txn.direction === 'OUT' ? 'chi' : 'thu'} #${txn.cashTxnId} — ${money(txn.amount)}`,
    body: el(
      'div',
      { class: 'stack' },
      el('p', {}, `${txn.category.name} — ${txn.reason}`),
      el(
        'p',
        { class: 'small muted' },
        edit
          ? 'Khoản cũ chuyển "Đã hủy", khoản mới ghi thay (chi lớn / danh mục cần duyệt thì chờ duyệt — nếu sau đó bị từ chối thì cả hai khoản đều không tính). Ảnh hóa đơn không chuyển sang khoản mới.'
          : 'Khoản chuyển "Đã hủy" (vẫn còn trong sổ), tiền dự kiến trong két tính lại. Chỉ làm được khi ca còn mở.',
      ),
      edit
        ? [
            el('div', { class: 'field' }, el('label', {}, 'Danh mục'), cat),
            el('div', { class: 'field' }, el('label', {}, 'Số tiền mới'), amount),
            el('div', { class: 'field' }, el('label', {}, 'Nội dung khoản mới'), newReason),
          ]
        : null,
      el('div', { class: 'field' }, el('label', {}, edit ? 'Lý do sửa (bắt buộc)' : 'Lý do hủy (bắt buộc)'), reason),
      self ? el('label', { class: 'check' }, otherBox, 'Người khác duyệt (nhập tài khoản)') : null,
      creds,
      msg,
    ),
    actions: [
      { label: 'Thôi', value: false },
      {
        label: edit ? 'Lưu khoản mới' : 'Hủy khoản',
        class: edit ? 'btn-primary' : 'btn-danger',
        onClick: async (close) => {
          if (!reason.value.trim()) {
            clear(msg, el('div', { class: 'field-error' }, edit ? 'Nhập lý do sửa' : 'Nhập lý do hủy'));
            return false;
          }
          if (edit && !cat.value) {
            clear(msg, el('div', { class: 'field-error' }, 'Chọn danh mục cho khoản mới'));
            return false;
          }
          if (edit && Number(cat.value) === txn.category.categoryId && moneyValue(amount) === txn.amount && newReason.value.trim() === oldReason) {
            clear(msg, el('div', { class: 'field-error' }, 'Chưa thay đổi gì — đổi số tiền, danh mục hoặc nội dung'));
            return false;
          }
          const body = {
            reason: reason.value.trim(),
            ...(edit ? { replacement: { categoryId: Number(cat.value), amount: moneyValue(amount), reason: newReason.value.trim() } } : {}),
            ...(!creds.hidden ? { adminUsername: adminUser.value.trim(), adminPassword: adminPass.value } : {}),
          };
          try {
            const r = await staffApi(`/api/cash-transactions/${txn.cashTxnId}/void`, { method: 'POST', body });
            if (r.replacement) {
              const pending = r.replacement.status === 'PENDING';
              toast(
                `Đã sửa: khoản mới #${r.replacement.cashTxnId} ${money(r.replacement.amount)}${pending ? ' — chờ duyệt' : ''}`,
                pending ? 'warning' : 'success',
                6000,
              );
            } else toast(`Đã hủy khoản #${txn.cashTxnId}`, 'success');
            close(true);
          } catch (err) {
            clear(msg, el('div', { class: 'alert danger' }, errorMessage(err)));
          }
          return false;
        },
      },
    ],
  }).result;
  return ok === true;
}

/** Xem ảnh hóa đơn (tải có xác thực). */
export async function showReceipt(txn) {
  try {
    const url = await staffBlobUrl(`/api/cash-transactions/${txn.cashTxnId}/receipt`);
    modal({
      title: `Hóa đơn — ${txn.reason}`,
      body: el('img', { src: url, alt: `Ảnh hóa đơn: ${txn.reason}`, class: 'receipt-image' }),
      onClose: () => URL.revokeObjectURL(url),
    });
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

/** Gắn / thay ảnh hóa đơn cho khoản đã ghi. */
export function attachReceiptPicker(txn, onDone) {
  const input = fileField();
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      await uploadReceipt(txn.cashTxnId, f);
      toast('Đã gắn ảnh hóa đơn', 'success');
      onDone?.();
    } catch (err) {
      toast(errorMessage(err), 'error', 6000);
    }
  });
  input.click();
}

/** Bảng sổ quỹ (5 cột: giờ · khoản · số tiền · trạng thái · thao tác). opts: { user, editable (ca đang mở — duyệt / gắn ảnh), onChange, showDate (nhiều ngày) } */
export function cashBookTable(rows, { user, editable = false, onChange, showDate = false } = {}) {
  if (!rows.length) return el('p', { class: 'muted' }, 'Chưa có khoản thu / chi nào ngoài bán hàng.');
  return el(
    'div',
    { class: 'table-wrap' },
    el(
      'table',
      { class: 'table cash-book' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          ['Giờ', 'Khoản', 'Số tiền', 'Trạng thái', ''].map((h, i) => el('th', { class: i === 2 ? 'num' : '' }, h)),
        ),
      ),
      el(
        'tbody',
        {},
        rows.map((t) =>
          el(
            'tr',
            { class: t.status === 'REJECTED' ? 'muted' : t.status === 'VOIDED' ? 'voided' : '' },
            el('td', { class: 'nowrap' }, showDate ? dateTime(t.createdAt) : time(t.createdAt)),
            el(
              'td',
              {},
              el('strong', {}, t.category.name),
              t.reason !== t.category.name ? ` — ${t.reason}` : null,
              el(
                'div',
                { class: 'small muted' },
                el('span', { class: 'mono' }, `#${t.cashTxnId}`),
                ` · ${t.direction === 'IN' ? 'thu' : 'chi'} · ghi bởi ${t.createdBy.fullName}`,
              ),
              t.rejectReason ? el('div', { class: 'small muted' }, `Từ chối: ${t.rejectReason}`) : null,
              t.voidReason
                ? el(
                    'div',
                    { class: 'small muted' },
                    `Hủy ${dateTime(t.voidedAt)}: ${t.voidReason}${t.voidedBy ? ` (${t.voidedBy.fullName})` : ''}${t.replacedById ? ` · thay bằng khoản #${t.replacedById}` : ''}`,
                  )
                : null,
            ),
            el('td', { class: `num ${t.direction === 'OUT' ? 'neg' : 'pos-val'}` }, `${t.direction === 'OUT' ? '−' : '+'}${money(t.amount)}`),
            el(
              'td',
              {},
              cashStatusBadge(t.status),
              t.status === 'VOIDED'
                ? el('div', { class: 'small muted' }, t.voidedBy?.fullName ?? '')
                : t.approvedBy
                  ? el('div', { class: 'small muted' }, t.approvedBy.fullName)
                  : null,
            ),
            el(
              'td',
              { class: 'no-print' },
              // nút nằm trong div: ô bảng giữ display: table-cell, đường kẻ hàng không lệch
              el(
                'div',
                { class: 'row cash-actions' },
                t.hasReceipt
                  ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => showReceipt(t), title: 'Xem ảnh hóa đơn' }, icon('receipt'), 'Ảnh')
                  : null,
                editable &&
                  !t.hasReceipt &&
                  t.direction === 'OUT' &&
                  (t.status === 'APPROVED' || t.status === 'PENDING') &&
                  (t.createdBy.userId === user.userId || canApprove(user))
                  ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => attachReceiptPicker(t, onChange) }, 'Gắn ảnh')
                  : null,
                editable && t.status === 'APPROVED' && t.shiftOpen !== false
                  ? [
                      el(
                        'button',
                        {
                          class: 'btn btn-sm',
                          type: 'button',
                          'aria-label': `Sửa khoản #${t.cashTxnId}`,
                          onclick: async () => (await voidDialog(t, user, { edit: true })) && onChange?.(),
                        },
                        'Sửa',
                      ),
                      el(
                        'button',
                        {
                          class: 'btn btn-sm btn-danger',
                          type: 'button',
                          'aria-label': `Hủy khoản #${t.cashTxnId}`,
                          onclick: async () => (await voidDialog(t, user)) && onChange?.(),
                        },
                        'Hủy',
                      ),
                    ]
                  : null,
                editable && t.status === 'PENDING'
                  ? [
                      el(
                        'button',
                        { class: 'btn btn-sm btn-primary', type: 'button', onclick: async () => (await reviewDialog(t, user, true)) && onChange?.() },
                        'Duyệt',
                      ),
                      el(
                        'button',
                        { class: 'btn btn-sm btn-danger', type: 'button', onclick: async () => (await reviewDialog(t, user, false)) && onChange?.() },
                        'Từ chối',
                      ),
                    ]
                  : null,
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
