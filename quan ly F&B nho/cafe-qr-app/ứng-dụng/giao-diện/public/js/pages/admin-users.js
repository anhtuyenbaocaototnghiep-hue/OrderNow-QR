// S-20 Tài khoản: tạo (username duy nhất — BR-004), sửa tên/vai trò, đặt lại mật khẩu, khóa/mở (BR-017). Không xóa cứng.
import { staffApi } from '../api.js';
import { confirmAndDelete, mountAdminShell, toggle } from '../admin-shell.js';
import { $, clear, confirmDialog, dateTime, el, errorMessage, modal, setBusy, showFieldErrors, toast } from '../ui.js';

const me = await mountAdminShell('users');

clear($('#head-actions'), el('button', { class: 'btn btn-primary', type: 'button', onclick: () => createUser() }, '+ Thêm nhân viên'));

const ROLE = { STAFF: 'Nhân viên quầy', ADMIN: 'Quản lý' };

async function load() {
  let users;
  try {
    users = await staffApi('/api/admin/users');
  } catch (err) {
    return clear($('#content'), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
  clear(
    $('#content'),
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
            ['Tên đăng nhập', 'Họ tên', 'Vai trò', 'Tạo lúc', 'Hoạt động', ''].map((h) => el('th', {}, h)),
          ),
        ),
        el(
          'tbody',
          {},
          users.map((u) =>
            el(
              'tr',
              { style: { opacity: u.isActive ? 1 : 0.6 } },
              el(
                'td',
                { class: 'mono' },
                u.username,
                u.userId === me.userId ? el('span', { class: 'badge primary', style: { marginLeft: '0.4rem' } }, 'Bạn') : null,
              ),
              el('td', {}, u.fullName),
              el('td', {}, el('span', { class: `badge ${u.role === 'ADMIN' ? 'primary' : ''}` }, ROLE[u.role])),
              el('td', { class: 'small' }, dateTime(u.createdAt)),
              el(
                'td',
                {},
                u.userId === me.userId
                  ? el('span', { class: 'muted small' }, '—')
                  : toggle(u.isActive, (v, input) => setActive(u, v, input), `Hoạt động ${u.username}`),
              ),
              el(
                'td',
                {},
                el(
                  'div',
                  { class: 'row wrap' },
                  el('button', { class: 'btn btn-sm', type: 'button', onclick: () => editUser(u) }, 'Sửa'),
                  el('button', { class: 'btn btn-sm', type: 'button', onclick: () => resetPassword(u) }, 'Đặt lại mật khẩu'),
                  u.userId === me.userId
                    ? null
                    : el(
                        'button',
                        {
                          class: 'btn btn-sm btn-danger',
                          type: 'button',
                          'aria-label': `Xóa ${u.username}`,
                          onclick: () =>
                            confirmAndDelete({
                              url: `/api/admin/users/${u.userId}`,
                              label: `tài khoản "${u.username}"`,
                              warning: 'Người này sẽ bị đăng xuất và không đăng nhập được nữa.',
                              onDone: load,
                            }),
                        },
                        'Xóa',
                      ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    el(
      'p',
      { class: 'muted small' },
      'Khóa tài khoản có hiệu lực ngay ở thao tác kế tiếp của người đó. Tài khoản không bị xóa để giữ lịch sử đơn và thu tiền.',
    ),
  );
}

async function setActive(u, isActive, input) {
  if (!isActive && !(await confirmDialog(`Khóa ${u.username}?`, 'Người này sẽ bị đăng xuất và không đăng nhập được nữa.', { okLabel: 'Khóa', danger: true }))) {
    input.checked = true;
    return;
  }
  try {
    await staffApi(`/api/admin/users/${u.userId}/active`, { method: 'PATCH', body: { isActive } });
    toast(isActive ? `Đã mở khóa ${u.username}` : `Đã khóa ${u.username}`, 'success');
    load();
  } catch (err) {
    input.checked = !isActive;
    toast(errorMessage(err), 'error');
  }
}

const roleSelect = (value) =>
  el(
    'select',
    { class: 'input', name: 'role' },
    Object.entries(ROLE).map(([v, l]) => el('option', { value: v, selected: v === value }, l)),
  );

function formModal({ title, form, submitLabel, send }) {
  modal({
    title,
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: submitLabel,
        class: 'btn-primary',
        onClick: async (_c, e) => {
          setBusy(e.currentTarget, true);
          try {
            await send();
            load();
          } catch (err) {
            setBusy(e.currentTarget, false);
            if (!showFieldErrors(form, err)) {
              form.querySelector('.alert')?.remove();
              form.prepend(el('div', { class: 'alert danger' }, errorMessage(err)));
            }
            return false;
          }
        },
      },
    ],
  });
}

function createUser() {
  const form = el(
    'form',
    { autocomplete: 'off' },
    el(
      'div',
      { class: 'field' },
      el('label', {}, 'Tên đăng nhập'),
      el('input', { class: 'input', name: 'username', maxlength: 50, autocomplete: 'off', placeholder: 'chữ không dấu, số, . _ -' }),
    ),
    el(
      'div',
      { class: 'field' },
      el('label', {}, 'Mật khẩu (tối thiểu 6 ký tự)'),
      el('input', { class: 'input', name: 'password', type: 'password', maxlength: 100, autocomplete: 'new-password' }),
    ),
    el('div', { class: 'field' }, el('label', {}, 'Họ tên'), el('input', { class: 'input', name: 'fullName', maxlength: 100 })),
    el('div', { class: 'field' }, el('label', {}, 'Vai trò'), roleSelect('STAFF')),
  );
  const f = (n) => form.elements.namedItem(n);
  formModal({
    title: 'Thêm nhân viên',
    form,
    submitLabel: 'Tạo tài khoản',
    send: async () => {
      await staffApi('/api/admin/users', {
        method: 'POST',
        body: { username: f('username').value, password: f('password').value, fullName: f('fullName').value, role: f('role').value },
      });
      toast('Đã tạo tài khoản — nhân viên có thể đăng nhập ngay', 'success');
    },
  });
}

function editUser(u) {
  const form = el(
    'form',
    {},
    el('div', { class: 'field' }, el('label', {}, 'Họ tên'), el('input', { class: 'input', name: 'fullName', maxlength: 100, value: u.fullName })),
    el('div', { class: 'field' }, el('label', {}, 'Vai trò'), roleSelect(u.role)),
  );
  const f = (n) => form.elements.namedItem(n);
  if (u.userId === me.userId) f('role').disabled = true;
  formModal({
    title: `Sửa ${u.username}`,
    form,
    submitLabel: 'Lưu',
    send: async () => {
      await staffApi(`/api/admin/users/${u.userId}`, {
        method: 'PUT',
        body: { fullName: f('fullName').value, role: u.userId === me.userId ? u.role : f('role').value },
      });
      toast('Đã lưu', 'success');
    },
  });
}

function resetPassword(u) {
  const form = el(
    'form',
    {},
    el(
      'div',
      { class: 'field' },
      el('label', {}, `Mật khẩu mới cho ${u.username}`),
      el('input', { class: 'input', name: 'password', type: 'password', maxlength: 100, autocomplete: 'new-password' }),
    ),
  );
  formModal({
    title: 'Đặt lại mật khẩu',
    form,
    submitLabel: 'Đặt lại',
    send: async () => {
      await staffApi(`/api/admin/users/${u.userId}/reset-password`, { method: 'POST', body: { password: form.elements.namedItem('password').value } });
      toast('Đã đặt lại mật khẩu', 'success');
    },
  });
}

load();
