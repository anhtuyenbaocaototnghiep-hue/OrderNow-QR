// S-22 Bàn & QR: tạo bàn sinh QR tự động (DEC-008), tải/in QR, tạo lại QR (QR cũ hết hiệu lực — AC-010-04).
import { staffApi, staffBlobUrl } from '../api.js';
import { confirmAndDelete, mountAdminShell, toggle } from '../admin-shell.js';
import { $, clear, confirmDialog, el, errorMessage, modal, setBusy, showFieldErrors, toast } from '../ui.js';

await mountAdminShell('tables');

clear(
  $('#head-actions'),
  el('a', { class: 'btn', href: '/admin/tables/print' }, '🖨 In tất cả QR'),
  el('button', { class: 'btn btn-primary', type: 'button', onclick: () => editTable(null) }, '+ Thêm bàn'),
);

const blobUrls = [];
async function qrImage(table) {
  const img = el('img', { class: 'qr-img', alt: `QR ${table.name}` });
  try {
    const url = await staffBlobUrl(`/api/admin/tables/${table.tableId}/qr.png?v=${table.qrToken}`);
    blobUrls.push(url);
    img.src = url;
  } catch {
    img.alt = 'Không tải được QR';
  }
  return img;
}

async function load() {
  let tables;
  try {
    tables = await staffApi('/api/admin/tables');
  } catch (err) {
    return clear($('#content'), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
  blobUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  if (tables.length === 0) return clear($('#content'), el('div', { class: 'empty card' }, 'Chưa có bàn nào. Bấm "+ Thêm bàn".'));
  const rows = await Promise.all(
    tables.map(async (t) =>
      el(
        'tr',
        {},
        el('td', {}, await qrImage(t)),
        el('td', {}, el('strong', {}, t.name), el('div', { class: 'muted small' }, `Mã bàn: ${t.code}`)),
        el('td', { class: 'small' }, el('a', { href: t.qrUrl, target: '_blank', rel: 'noopener' }, t.qrUrl)),
        el('td', {}, t.openSessions ? el('span', { class: 'badge preparing' }, `${t.openSessions} phiên mở`) : el('span', { class: 'muted small' }, 'Trống')),
        el(
          'td',
          {},
          toggle(t.isActive, (v, input) => save(t, { code: t.code, name: t.name, isActive: v }, input), `Hoạt động ${t.name}`),
        ),
        el(
          'td',
          {},
          el(
            'div',
            { class: 'row wrap' },
            el('button', { class: 'btn btn-sm', type: 'button', onclick: () => download(t) }, 'Tải QR'),
            el('button', { class: 'btn btn-sm', type: 'button', onclick: () => editTable(t) }, 'Sửa'),
            el('button', { class: 'btn btn-sm', type: 'button', onclick: () => regenerate(t) }, 'Tạo lại QR'),
            el(
              'button',
              {
                class: 'btn btn-sm btn-danger',
                type: 'button',
                'aria-label': `Xóa ${t.name}`,
                onclick: () =>
                  confirmAndDelete({
                    url: `/api/admin/tables/${t.tableId}`,
                    label: t.name,
                    warning: 'Mã QR của bàn sẽ hết hiệu lực ngay. Không xóa được khi bàn đang có khách.',
                    onDone: load,
                  }),
              },
              'Xóa',
            ),
          ),
        ),
      ),
    ),
  );
  clear(
    $('#content'),
    el(
      'p',
      { class: 'muted' },
      'Mỗi bàn có một mã QR cố định chứa đường dẫn ngẫu nhiên (không đoán được số bàn). Đặt PUBLIC_BASE_URL đúng địa chỉ máy chủ để điện thoại khách quét được.',
    ),
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
            ['QR', 'Bàn', 'Đường dẫn', 'Trạng thái', 'Hoạt động', ''].map((h) => el('th', {}, h)),
          ),
        ),
        el('tbody', {}, rows),
      ),
    ),
  );
}

async function download(t) {
  try {
    const url = await staffBlobUrl(`/api/admin/tables/${t.tableId}/qr.png`);
    const a = el('a', { href: url, download: `qr-ban-${t.code}.png` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

async function regenerate(t) {
  const ok = await confirmDialog(`Tạo lại QR cho ${t.name}?`, 'Mã QR cũ đang dán trên bàn sẽ hết hiệu lực ngay. Bạn cần in và dán mã mới.', {
    okLabel: 'Tạo lại',
    danger: true,
  });
  if (!ok) return;
  try {
    await staffApi(`/api/admin/tables/${t.tableId}/regenerate-qr`, { method: 'POST' });
    toast(`Đã tạo QR mới cho ${t.name}`, 'success');
    load();
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

async function save(t, body, input) {
  try {
    await staffApi(`/api/admin/tables/${t.tableId}`, { method: 'PUT', body });
    load();
  } catch (err) {
    if (input) input.checked = !input.checked;
    toast(errorMessage(err), 'error');
  }
}

function editTable(t) {
  const code = el('input', { class: 'input', name: 'code', maxlength: 10, placeholder: 'Ví dụ: 07', value: t?.code ?? '' });
  const name = el('input', { class: 'input', name: 'name', maxlength: 50, placeholder: 'Ví dụ: Bàn 07 (để trống = "Bàn " + mã)', value: t?.name ?? '' });
  const form = el(
    'form',
    {},
    el('div', { class: 'field' }, el('label', {}, 'Mã bàn'), code),
    el('div', { class: 'field' }, el('label', {}, 'Tên hiển thị'), name),
  );
  modal({
    title: t ? `Sửa ${t.name}` : 'Thêm bàn',
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: t ? 'Lưu' : 'Tạo bàn & QR',
        class: 'btn-primary',
        onClick: async (_c, e) => {
          setBusy(e.currentTarget, true);
          try {
            if (t)
              await staffApi(`/api/admin/tables/${t.tableId}`, {
                method: 'PUT',
                body: { code: code.value, name: name.value || `Bàn ${code.value}`, isActive: t.isActive },
              });
            else await staffApi('/api/admin/tables', { method: 'POST', body: { code: code.value, name: name.value || undefined } });
            toast(t ? 'Đã lưu bàn' : 'Đã tạo bàn và mã QR', 'success');
            load();
          } catch (err) {
            setBusy(e.currentTarget, false);
            if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error');
            return false;
          }
        },
      },
    ],
  });
}

load();
