// Sổ quỹ ca (FEATURE-033, ADR-006 D-23) — dùng ở màn Ca (POS) và trang Sổ quỹ (admin).
// Chi > ngưỡng / danh mục cần duyệt → "Chờ duyệt"; trưởng ca / quản lý duyệt. Nhân viên đứng quầy → nhập tài khoản người duyệt.
import { staffApi, staffBlobUrl, staffUpload } from './api.js';
import { clear, dateTime, el, errorMessage, modal, money, moneyInput, moneyValue, time, toast } from './ui.js';

export const CASH_STATUS = { PENDING: ['Chờ duyệt', 'pending'], APPROVED: ['Đã duyệt', 'ok'], REJECTED: ['Từ chối', 'danger'] };
export const cashStatusBadge = (s) => el('span', { class: `badge ${CASH_STATUS[s][1]}` }, CASH_STATUS[s][0]);
const MAX_IMAGE = 2 * 1024 * 1024;
const canApprove = (user) => user.role === 'MANAGER' || user.role === 'ADMIN';

let categoriesCache = null;
const loadCategories = async () => (categoriesCache ??= await staffApi('/api/cash-categories'));

function fileField() {
  const input = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'input', 'aria-label': 'Ảnh hóa đơn' });
  return input;
}

async function uploadReceipt(id, file) {
  if (file.size > MAX_IMAGE) throw new Error('Ảnh hóa đơn tối đa 2 MB');
  return staffUpload(`/api/cash-transactions/${id}/receipt`, file);
}

/** Hộp thoại ghi khoản chi (OUT) / thu khác (IN). Trả khoản vừa ghi hoặc null. */
export async function cashEntryDialog(direction) {
  let cats;
  try {
    cats = (await loadCategories()).filter((c) => c.direction === direction);
  } catch (err) {
    toast(errorMessage(err), 'error');
    return null;
  }
  const cat = el(
    'select',
    { class: 'input', id: 'cash-cat', 'aria-label': 'Danh mục' },
    cats.map((c) => el('option', { value: c.categoryId }, c.name + (c.requiresApproval ? ' (cần duyệt)' : ''))),
  );
  const amount = moneyInput({ id: 'cash-amount', 'aria-label': 'Số tiền' });
  const reason = el('input', {
    class: 'input',
    id: 'cash-reason',
    maxlength: 200,
    placeholder: direction === 'OUT' ? 'Ví dụ: mua 2 bao đá' : 'Ví dụ: chủ quán bổ sung tiền lẻ',
  });
  const file = fileField();
  const msg = el('div');
  const result = await modal({
    title: direction === 'OUT' ? 'Chi tiền từ két' : 'Thu khác vào két',
    body: el(
      'div',
      { class: 'stack' },
      el('label', { for: 'cash-cat' }, 'Danh mục'),
      cat,
      el('label', { for: 'cash-amount' }, 'Số tiền'),
      amount,
      el('label', { for: 'cash-reason' }, 'Nội dung / lý do (bắt buộc)'),
      reason,
      direction === 'OUT' ? [el('label', {}, 'Ảnh hóa đơn (không bắt buộc, ≤ 2 MB)'), file] : null,
      direction === 'OUT'
        ? el('p', { class: 'small muted' }, 'Khoản chi lớn hoặc danh mục "Khác" sẽ chờ trưởng ca / quản lý duyệt — chưa trừ vào két cho tới khi duyệt.')
        : null,
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
          if (!reason.value.trim()) {
            clear(msg, el('div', { class: 'field-error' }, 'Nhập nội dung / lý do'));
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
              body: { categoryId: Number(cat.value), amount: v, reason: reason.value.trim() },
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

/** Bảng sổ quỹ. opts: { user, editable (ca đang mở — duyệt / gắn ảnh), onChange, showDate (nhiều ngày) } */
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
          ['Giờ', 'Loại', 'Danh mục', 'Nội dung', 'Số tiền', 'Trạng thái', 'Người ghi', ''].map((h, i) => el('th', { class: i === 4 ? 'num' : '' }, h)),
        ),
      ),
      el(
        'tbody',
        {},
        rows.map((t) =>
          el(
            'tr',
            { class: t.status === 'REJECTED' ? 'muted' : '' },
            el('td', { class: 'nowrap' }, showDate ? dateTime(t.createdAt) : time(t.createdAt)),
            el('td', {}, t.direction === 'IN' ? 'Thu' : 'Chi'),
            el('td', {}, t.category.name),
            el('td', {}, t.reason, t.rejectReason ? el('div', { class: 'small muted' }, `Từ chối: ${t.rejectReason}`) : null),
            el('td', { class: `num ${t.direction === 'OUT' ? 'neg' : ''}` }, `${t.direction === 'OUT' ? '−' : '+'}${money(t.amount)}`),
            el('td', {}, cashStatusBadge(t.status), t.approvedBy ? el('div', { class: 'small muted' }, t.approvedBy.fullName) : null),
            el('td', {}, t.createdBy.fullName),
            el(
              'td',
              { class: 'row no-print' },
              t.hasReceipt ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => showReceipt(t), title: 'Xem ảnh hóa đơn' }, '🧾 Ảnh') : null,
              editable && !t.hasReceipt && t.direction === 'OUT' && (t.createdBy.userId === user.userId || canApprove(user))
                ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => attachReceiptPicker(t, onChange) }, 'Gắn ảnh')
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
  );
}
