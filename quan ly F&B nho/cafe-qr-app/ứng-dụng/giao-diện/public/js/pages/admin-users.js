// S-20 Tài khoản: tạo (username duy nhất — BR-004), sửa tên/vai trò, đặt lại mật khẩu, khóa/mở (BR-017). Không xóa cứng.
// F-079 (ADR-037): nút "Quyền" — đặt riêng từng quyền (theo vai trò / cho phép / không cho, kèm hạn); khung "Xin quyền chờ duyệt".
import { staffApi } from '../api.js';
import { confirmAndDelete, mountAdminShell, toggle } from '../admin-shell.js';
import { $, clear, confirmDialog, dateTime, el, errorMessage, modal, setBusy, showFieldErrors, toast } from '../ui.js';
import { LEVEL_LABEL, POSITION_HINT, POSITION_LABEL, positionsText, ROLE_BADGE, ROLE_LABEL, ROLE_SUMMARY } from '../roles.js';

const me = await mountAdminShell('users');

clear($('#head-actions'), el('button', { class: 'btn btn-primary', type: 'button', onclick: () => createUser() }, '+ Thêm nhân viên'));

// F-036: Trưởng ca = quyền quầy + giảm tay 20 %/50k, hoàn tiền trong ca, duyệt chi quỹ, sửa chấm công trong ngày, kiểm kê, điều chỉnh kho
// F-077 (ADR-035): Quản lý cửa hàng = trưởng ca + trang Quản lý phần vận hành; ADMIN hiện là "Chủ quán"
const ROLE = { ...ROLE_LABEL, STAFF: 'Nhân viên quầy' };

/** F-077: bảng "vai trò làm được gì" — chủ quán chọn vai cho đúng người. */
const roleGuide = () =>
  el(
    'details',
    { class: 'card role-guide' },
    el('summary', {}, 'Mỗi vai trò làm được gì?'),
    el(
      'dl',
      {},
      ROLE_SUMMARY.flatMap(([r, text]) => [el('dt', {}, el('span', { class: `badge ${ROLE_BADGE[r]}` }, ROLE[r])), el('dd', {}, text)]),
    ),
    // F-078: vị trí + cấp của nhân viên quầy
    el(
      'p',
      { class: 'small', style: { margin: '0.75rem 0 0.25rem' } },
      el('strong', {}, 'Nhân viên quầy chia theo vị trí'),
      ' (chọn được nhiều, để trống = mọi việc):',
    ),
    el(
      'ul',
      { class: 'small' },
      Object.entries(POSITION_LABEL).map(([p, l]) => el('li', {}, el('strong', {}, l), `: ${POSITION_HINT[p]}.`)),
      el('li', {}, el('strong', {}, 'Thử việc'), ': giảm giá tay, ghi chi quỹ, sửa / xóa món luôn cần trưởng ca trở lên duyệt.'),
    ),
  );

/** F-078: ô chọn vị trí + cấp — chỉ hiện khi vai trò là Nhân viên quầy. */
function staffFields(form, u = null) {
  const boxes = Object.entries(POSITION_LABEL).map(([p, l]) => {
    const input = el('input', { type: 'checkbox', name: 'positions', value: p, checked: Boolean(u?.positions?.includes(p)) });
    return el('label', { class: 'check' }, input, l);
  });
  const level = el(
    'select',
    { class: 'input', name: 'level', id: 'user-level' },
    Object.entries(LEVEL_LABEL).map(([v, l]) => el('option', { value: v, selected: v === (u?.level ?? 'OFFICIAL') }, l)),
  );
  const box = el(
    'div',
    { class: 'staff-fields stack' },
    el('fieldset', { class: 'field' }, el('legend', {}, 'Vị trí (để trống = mọi việc)'), el('div', { class: 'row' }, boxes)),
    el('div', { class: 'field' }, el('label', { for: 'user-level' }, 'Cấp'), level),
  );
  const role = form.elements.namedItem('role');
  const sync = () => (box.hidden = role.value !== 'STAFF');
  role.addEventListener('change', sync);
  sync();
  form.append(box);
  return () =>
    role.value === 'STAFF'
      ? {
          positions: (() => {
            const picked = boxes
              .map((b) => b.querySelector('input'))
              .filter((i) => i.checked)
              .map((i) => i.value);
            return picked.length ? picked : null;
          })(),
          level: level.value,
        }
      : { positions: null, level: 'OFFICIAL' };
}

async function load() {
  let users;
  try {
    users = await staffApi('/api/admin/users');
  } catch (err) {
    return clear($('#content'), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
  let requests = [];
  try {
    requests = (await staffApi('/api/admin/access-requests')).requests; // F-079
  } catch {
    /* không chặn trang Tài khoản */
  }
  clear(
    $('#content'),
    requestsCard(requests),
    roleGuide(),
    // F-072 (DEF-020): chỉ chỗ đặt / đổi PIN — quản lý không đặt hộ, chỉ xóa để người đó tự đặt lại
    el(
      'p',
      { class: 'small muted' },
      'PIN chấm công: mỗi người tự đặt bằng mật khẩu đăng nhập của mình — ngay ở màn Chấm công (chạm tên mình, hoặc "Quên PIN?" trên bàn phím) hoặc máy quầy → Giờ công → Đặt / Đổi PIN. Quản lý không biết và không đặt PIN hộ; quên cả mật khẩu thì bấm "Đặt lại mật khẩu"; nghi bị lộ thì "Xóa PIN".',
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
            ['Tên đăng nhập', 'Họ tên', 'Vai trò', 'PIN', 'Tạo lúc', 'Hoạt động', ''].map((h) => el('th', {}, h)),
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
              el(
                'td',
                {},
                el('span', { class: `badge ${ROLE_BADGE[u.role] ?? ''}` }, ROLE[u.role]),
                u.level === 'PROBATION' ? el('span', { class: 'badge pending', style: { marginLeft: '0.3rem' } }, 'Thử việc') : null,
                u.role === 'STAFF' ? el('div', { class: 'small muted' }, positionsText(u)) : null,
                u.grantCount ? el('div', {}, el('span', { class: 'badge preparing' }, 'Có quyền riêng')) : null, // F-079
              ),
              el(
                'td',
                {},
                u.role === 'ADMIN' && !u.hasPin
                  ? el('span', { class: 'muted small' }, 'Không cần')
                  : u.hasPin
                    ? el('span', { class: 'badge ok' }, 'Đã đặt')
                    : el('span', { class: 'badge pending' }, 'Chưa đặt'),
              ),
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
                  u.role !== 'ADMIN' ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => grantsDialog(u) }, 'Quyền') : null, // F-079
                  el('button', { class: 'btn btn-sm', type: 'button', onclick: () => resetPassword(u) }, 'Đặt lại mật khẩu'),
                  // F-072: quên PIN / nghi bị lộ → xóa để người đó đăng nhập bằng mật khẩu và đặt lại (quản lý không biết PIN của ai)
                  u.hasPin
                    ? el(
                        'button',
                        {
                          class: 'btn btn-sm',
                          type: 'button',
                          'aria-label': `Xóa PIN của ${u.username}`,
                          onclick: async () => {
                            if (
                              !(await confirmDialog('Xóa PIN', `Xóa PIN của ${u.fullName}? Người đó sẽ đăng nhập bằng mật khẩu để đặt PIN mới.`, {
                                okLabel: 'Xóa PIN',
                              }))
                            )
                              return;
                            try {
                              await staffApi(`/api/admin/users/${u.userId}/pin-reset`, { method: 'POST' });
                              toast(`Đã xóa PIN của ${u.fullName}`, 'success');
                              load();
                            } catch (err) {
                              toast(errorMessage(err), 'error');
                            }
                          },
                        },
                        'Xóa PIN',
                      )
                    : null,
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
          const btn = e.currentTarget; // DEF-024: giữ nút trước await — sau await e.currentTarget là null, nút sẽ khóa mãi khi máy chủ báo lỗi
          setBusy(btn, true);
          try {
            await send();
            load();
          } catch (err) {
            setBusy(btn, false);
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
  const staffValues = staffFields(form);
  formModal({
    title: 'Thêm nhân viên',
    form,
    submitLabel: 'Tạo tài khoản',
    send: async () => {
      await staffApi('/api/admin/users', {
        method: 'POST',
        body: { username: f('username').value, password: f('password').value, fullName: f('fullName').value, role: f('role').value, ...staffValues() },
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
  const staffValues = staffFields(form, u); // F-078
  formModal({
    title: `Sửa ${u.username}`,
    form,
    submitLabel: 'Lưu',
    send: async () => {
      await staffApi(`/api/admin/users/${u.userId}`, {
        method: 'PUT',
        body: { fullName: f('fullName').value, role: u.userId === me.userId ? u.role : f('role').value, ...staffValues() },
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

// ---------- F-079 (ADR-037): quyền riêng từng tài khoản ----------
const DURATIONS = [
  ['ALWAYS', 'Luôn luôn'],
  ['TODAY', 'Hết hôm nay'],
  ['WEEK', '7 ngày'],
];
const dateTimeOrDash = (d) => (d ? dateTime(d) : 'không hạn');

/** Hạn theo lựa chọn: luôn / hết hôm nay (giờ VN) / 7 ngày / đến ngày (hết ngày đó, giờ VN). → ISO hoặc null */
function expiryFrom(kind, date) {
  const endOfVnDay = (d) => new Date(Date.parse(`${d}T00:00:00+07:00`) + 86400000).toISOString();
  const todayVn = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  if (kind === 'TODAY') return endOfVnDay(todayVn);
  if (kind === 'WEEK') return endOfVnDay(new Date(Date.parse(`${todayVn}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10));
  if (kind === 'DATE') return date ? endOfVnDay(date) : undefined;
  return null;
}

async function grantsDialog(u) {
  let view;
  try {
    view = await staffApi(`/api/admin/users/${u.userId}/grants`);
  } catch (err) {
    return toast(errorMessage(err), 'error');
  }
  const rows = view.items.map((it) => {
    const mode = el(
      'select',
      { class: 'input', 'aria-label': `Quyền: ${it.label}` },
      el('option', { value: '' }, 'Mặc định'),
      el('option', { value: 'ALLOW', selected: it.override?.effect === 'ALLOW' }, 'Cho phép'),
      el('option', { value: 'DENY', selected: it.override?.effect === 'DENY' }, 'Không cho'),
    );
    const until = el(
      'select',
      { class: 'input', 'aria-label': `Hạn: ${it.label}` },
      el('option', { value: 'KEEP', selected: Boolean(it.override) }, 'Giữ hạn cũ'),
      el('option', { value: 'ALWAYS' }, 'Luôn luôn'),
      el('option', { value: 'TODAY' }, 'Hết hôm nay'),
      el('option', { value: 'WEEK' }, '7 ngày'),
      el('option', { value: 'DATE' }, 'Đến ngày…'),
    );
    if (!it.override) until.querySelector('option[value="KEEP"]').remove();
    const date = el('input', { class: 'input', type: 'date', hidden: true, 'aria-label': `Đến ngày: ${it.label}` });
    const sync = () => {
      until.disabled = !mode.value;
      date.hidden = until.value !== 'DATE' || !mode.value;
    };
    mode.addEventListener('change', sync);
    until.addEventListener('change', sync);
    sync();
    const tr = el(
      'tr',
      { dataset: { cap: it.key } },
      el(
        'td',
        {},
        it.label,
        it.money ? el('span', { class: 'badge pending', style: { marginLeft: '0.35rem' }, title: 'Dính tới tiền — cấp thì có cảnh báo' }, 'Tiền') : null,
        el('div', { class: 'small muted' }, `Mặc định theo vai trò: ${it.byRole ? 'có' : 'không'}`),
      ),
      el('td', {}, mode),
      el(
        'td',
        { class: 'stack' },
        until,
        date,
        it.override ? el('div', { class: 'small muted' }, `Hạn hiện tại: ${dateTimeOrDash(it.override.expiresAt)}`) : null,
      ),
    );
    return { it, tr, mode, until, date };
  });
  const groups = [...new Set(view.items.map((i) => i.group))];
  const body = el(
    'div',
    { class: 'stack grants' },
    el(
      'p',
      { class: 'small muted' },
      'Mặc định mỗi người làm được theo vai trò và vị trí. Đặt "Cho phép" / "Không cho" để thay riêng cho người này (có thể kèm hạn — hết hạn tự về theo vai trò). Đổi có hiệu lực ngay ở thao tác kế tiếp của người đó.',
    ),
    groups.map((g) =>
      el(
        'div',
        { class: 'table-wrap' },
        el(
          'table',
          { class: 'table' },
          el('thead', {}, el('tr', {}, el('th', {}, g), el('th', {}, 'Người này'), el('th', {}, 'Hạn'))),
          el(
            'tbody',
            {},
            rows.filter((r) => r.it.group === g).map((r) => r.tr),
          ),
        ),
      ),
    ),
    el('p', { class: 'small muted' }, 'Không cấp được (chỉ chủ quán): tài khoản & phân quyền, cài đặt chung, duyệt xin quyền.'),
  );
  modal({
    title: `Quyền của ${u.fullName}`,
    body,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu quyền',
        class: 'btn-primary',
        onClick: async (_close, e) => {
          const grants = [];
          for (const r of rows.filter((x) => x.mode.value)) {
            const expiresAt = r.until.value === 'KEEP' ? (r.it.override?.expiresAt ?? null) : expiryFrom(r.until.value, r.date.value);
            if (expiresAt === undefined) {
              toast(`Chọn ngày hết hạn cho "${r.it.label}"`, 'warning');
              return false;
            }
            grants.push({ capability: r.it.key, effect: r.mode.value, expiresAt });
          }
          const btn = e.currentTarget; // DEF-024: giữ nút trước await — sau await e.currentTarget là null, nút sẽ khóa mãi khi máy chủ báo lỗi
          setBusy(btn, true);
          try {
            await staffApi(`/api/admin/users/${u.userId}/grants`, { method: 'PUT', body: { grants } });
            toast(`Đã lưu quyền của ${u.fullName}`, 'success');
            load();
            return true;
          } catch (err) {
            toast(errorMessage(err), 'error', 6000);
            return false;
          } finally {
            setBusy(btn, false);
          }
        },
      },
    ],
  });
}

/** Khung "Xin quyền chờ duyệt" (chỉ hiện khi có yêu cầu). */
function requestsCard(requests) {
  if (!requests.length) return null;
  return el(
    'section',
    { class: 'card access-requests', id: 'xin-quyen' },
    el('h2', {}, `Xin quyền chờ duyệt (${requests.length})`),
    el(
      'ul',
      { class: 'stack' },
      requests.map((r) => {
        const dur = el(
          'select',
          { class: 'input', 'aria-label': `Thời hạn cho ${r.user.fullName}` },
          DURATIONS.map(([v, l]) => el('option', { value: v, selected: v === 'TODAY' }, l)),
        );
        const decide = async (btn, path, body, ok) => {
          setBusy(btn, true);
          try {
            await staffApi(`/api/admin/access-requests/${r.requestId}/${path}`, { method: 'POST', body });
            toast(ok, 'success');
            load();
          } catch (err) {
            toast(errorMessage(err), 'error');
            setBusy(btn, false);
          }
        };
        return el(
          'li',
          { class: 'access-request' },
          el(
            'div',
            {},
            el('strong', {}, r.user.fullName),
            ` (${ROLE[r.user.role] ?? r.user.role}) xin: `,
            el('strong', {}, r.capabilityLabel ?? r.capability),
            el('div', { class: 'small muted' }, `${dateTime(r.createdAt)}${r.reason ? ` — "${r.reason}"` : ''}`),
          ),
          el(
            'div',
            { class: 'row wrap' },
            dur,
            el(
              'button',
              {
                class: 'btn btn-sm btn-primary',
                type: 'button',
                onclick: (e) => decide(e.currentTarget, 'approve', { duration: dur.value }, `Đã cho phép ${r.user.fullName}`),
              },
              'Duyệt',
            ),
            el(
              'button',
              {
                class: 'btn btn-sm',
                type: 'button',
                onclick: async (e) => {
                  if (!(await confirmDialog('Từ chối yêu cầu?', `${r.user.fullName} sẽ được báo là chưa được cấp quyền này.`, { okLabel: 'Từ chối' }))) return;
                  decide(e.currentTarget, 'reject', {}, 'Đã từ chối');
                },
              },
              'Từ chối',
            ),
          ),
        );
      }),
    ),
  );
}

load();
