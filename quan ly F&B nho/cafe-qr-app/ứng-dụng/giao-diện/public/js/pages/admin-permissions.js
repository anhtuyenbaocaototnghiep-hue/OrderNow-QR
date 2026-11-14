// SCR-58 Quyền nâng cao (F-091, ADR-053 D-226 — chỉ chủ quán): một trang riêng cho mọi việc về quyền nâng cao.
//  - Khung "Xin quyền chờ duyệt" (F-079 — chuyển từ trang Tài khoản; Hôm nay → #xin-quyen): Duyệt kèm thời hạn / Từ chối.
//  - Chọn một người (bên trái) → công tắc Cho phép / Không cho phép từng việc (F-090, ADR-051 D-222): khác vai trò = quyền riêng.
//    ?user={id} chọn sẵn (nhãn "Có quyền nâng cao" ở trang Tài khoản trỏ tới đây). Vai trò / vị trí đổi ở trang Tài khoản.
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { permissionSwitches } from '../perm-editor.js';
import { $, clear, confirmDialog, dateTime, el, errorMessage, setBusy, toast } from '../ui.js';
import { positionsText, ROLE_BADGE, ROLE_LABEL } from '../roles.js';

await mountAdminShell('permissions');

const ROLE = { ...ROLE_LABEL, STAFF: 'Nhân viên quầy' };
const DURATIONS = [
  ['ALWAYS', 'Luôn luôn'],
  ['TODAY', 'Hết hôm nay'],
  ['WEEK', '7 ngày'],
];
const state = { users: [], requests: [], selected: Number(new URLSearchParams(location.search).get('user')) || null, editor: null };

clear(
  $('#head-actions'),
  el('a', { class: 'btn', href: '/admin/users' }, 'Tài khoản'), // vai trò, vị trí, mật khẩu, số điện thoại
);

async function load() {
  try {
    const [users, req] = await Promise.all([staffApi('/api/admin/users'), staffApi('/api/admin/access-requests')]);
    state.users = users.filter((u) => u.role !== 'ADMIN'); // chủ quán luôn đủ mọi quyền
    state.requests = req.requests;
  } catch (err) {
    return clear($('#content'), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
  if (!state.users.some((u) => u.userId === state.selected)) state.selected = (state.users.find((u) => u.grantCount) ?? state.users[0])?.userId ?? null;
  const panel = el('section', { class: 'card perm-panel', 'aria-labelledby': 'perm-panel-title' });
  clear(
    $('#content'),
    requestsCard(state.requests),
    el(
      'p',
      { class: 'small muted' },
      'Mỗi người làm được theo vai trò và vị trí (đặt ở trang Tài khoản). Ở đây chủ quán cho phép hoặc không cho phép thêm từng việc cho từng người — có hiệu lực ngay ở thao tác kế tiếp của người đó.',
    ),
    state.users.length
      ? el('div', { class: 'perm-page' }, peopleList(), panel)
      : el('div', { class: 'empty card' }, 'Chưa có tài khoản nhân viên — tạo ở trang Tài khoản.'),
  );
  if (state.selected) await showPerson(panel);
}

/** Danh sách người — một nút mỗi người (đang chọn: aria-pressed). */
function peopleList() {
  return el(
    'nav',
    { class: 'perm-people', 'aria-label': 'Chọn người' },
    state.users.map((u) =>
      el(
        'button',
        {
          class: 'perm-person',
          type: 'button',
          'aria-pressed': String(u.userId === state.selected),
          dataset: { user: u.userId },
          onclick: () => pick(u.userId),
        },
        el('strong', {}, u.fullName),
        el(
          'span',
          { class: 'perm-person-meta' },
          el('span', { class: `badge ${ROLE_BADGE[u.role] ?? ''}` }, ROLE[u.role] ?? u.role),
          u.role === 'STAFF' ? el('span', { class: 'small muted' }, positionsText(u)) : null,
          u.isActive ? null : el('span', { class: 'badge cancelled' }, 'Đã khóa'),
        ),
        u.grantCount ? el('span', { class: 'badge preparing' }, `${u.grantCount} quyền nâng cao`) : null,
      ),
    ),
  );
}

/** Chọn người khác — đang có thay đổi chưa lưu thì hỏi. */
async function pick(userId) {
  if (userId === state.selected) return;
  if (
    state.editor?.changed() &&
    !(await confirmDialog('Bỏ thay đổi chưa lưu?', 'Các công tắc vừa đổi của người đang chọn chưa được lưu.', { okLabel: 'Bỏ thay đổi', danger: true }))
  )
    return;
  state.selected = userId;
  history.replaceState(null, '', `${location.pathname}?user=${userId}`);
  document.querySelectorAll('.perm-person').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.user) === userId)));
  await showPerson($('.perm-panel'));
}

async function showPerson(panel) {
  const u = state.users.find((x) => x.userId === state.selected);
  clear(panel, el('p', { class: 'muted' }, 'Đang tải…'));
  let view;
  try {
    view = await staffApi(`/api/admin/users/${u.userId}/grants`);
  } catch (err) {
    return clear(panel, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
  if (state.selected !== u.userId) return; // đã chọn người khác trong lúc tải
  const base = view.items.filter((i) => i.byRole).length;
  const diffLine = el('p', { class: 'small perm-diff', 'aria-live': 'polite' });
  const paintDiff = () => {
    const { more, less } = editor.diff();
    diffLine.textContent = [more.length ? `Cấp thêm: ${more.join('; ')}` : null, less.length ? `Bỏ bớt: ${less.join('; ')}` : null].filter(Boolean).join(' · ');
    diffLine.hidden = !diffLine.textContent;
  };
  const editor = permissionSwitches(view, paintDiff);
  state.editor = editor;
  const save = el(
    'button',
    {
      class: 'btn btn-primary',
      type: 'button',
      onclick: async () => {
        setBusy(save, true);
        try {
          await staffApi(`/api/admin/users/${u.userId}/grants`, { method: 'PUT', body: { grants: editor.grants() } });
          toast(`Đã lưu quyền của ${u.fullName}`, 'success');
          state.editor = null;
          await load();
          document.querySelector(`.perm-person[data-user="${u.userId}"]`)?.focus();
        } catch (err) {
          setBusy(save, false);
          toast(errorMessage(err), 'error', 6000);
        }
      },
    },
    'Lưu quyền',
  );
  clear(
    panel,
    el('h2', { id: 'perm-panel-title' }, `Quyền của ${u.fullName}`),
    el(
      'p',
      { class: 'small muted' },
      `${ROLE[u.role] ?? u.role}${u.role === 'STAFF' ? ` · ${positionsText(u)}` : ''} — theo vai trò được làm ${base} / ${view.items.length} việc. `,
      el('a', { href: '/admin/users' }, 'Đổi vai trò / vị trí ở Tài khoản'),
    ),
    diffLine,
    editor.node,
    el('div', { class: 'row wrap perm-actions' }, el('button', { class: 'btn', type: 'button', onclick: () => editor.reset() }, 'Về như vai trò'), save),
  );
  paintDiff();
}

/** Khung "Xin quyền chờ duyệt" (F-079; chỉ hiện khi có yêu cầu). */
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
            state.selected = r.user.userId; // duyệt xong → xem quyền của người đó
            state.editor = null;
            await load();
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
