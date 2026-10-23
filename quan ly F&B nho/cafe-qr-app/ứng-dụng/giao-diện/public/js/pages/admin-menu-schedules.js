// S-34 Lịch thực đơn (FEATURE-040): lịch theo mùa / khung giờ — mỗi lịch HIỆN (SHOW) hoặc ẨN (HIDE) món / cả danh mục;
// xem trước "menu lúc …". Tab Thời gian pha (FEATURE-025): chuẩn quản lý nhập vs trung vị thực tế, cài đặt bếp, chạy lại thống kê.
import { staffApi } from '../api.js';
import { mountAdminShell, toggle } from '../admin-shell.js';
import { $, clear, confirmDialog, dateTime, el, errorMessage, modal, showFieldErrors, toast, todayVn } from '../ui.js';
import { icon } from '../icons.js';

await mountAdminShell('schedules');

const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']; // bit0 = Chủ nhật
const state = { tab: 'schedules', list: [], items: [], categories: [] };
const body = el('div');
const tabs = el(
  'div',
  { class: 'tabs', role: 'tablist' },
  [
    ['schedules', 'Lịch thực đơn'],
    ['prep', 'Thời gian pha & hàng chờ'],
  ].map(([key, label]) =>
    el(
      'button',
      {
        type: 'button',
        role: 'tab',
        'aria-selected': String(state.tab === key),
        onclick: (e) => {
          state.tab = key;
          tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget)));
          load();
        },
      },
      label,
    ),
  ),
);
clear($('#content'), tabs, body);

async function load() {
  clear($('#head-actions'));
  clear(body, el('p', { class: 'muted' }, 'Đang tải…'));
  try {
    if (state.tab === 'schedules') await loadSchedules();
    else await loadPrep();
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

// ---------- Lịch thực đơn ----------
const fmtDate = (d) => (d ? d.split('-').reverse().join('/') : '…');
const daysText = (mask) => (mask === 127 ? 'mọi ngày' : DAYS.filter((_, i) => mask & (1 << i)).join(', '));
const periodText = (s) => (s.startDate || s.endDate ? `${fmtDate(s.startDate)} → ${fmtDate(s.endDate)}` : 'Không giới hạn ngày');

async function loadSchedules() {
  [state.list, state.items, state.categories] = await Promise.all([
    staffApi('/api/admin/menu-schedules'),
    staffApi('/api/admin/menu-items'),
    staffApi('/api/admin/categories'),
  ]);
  clear(
    $('#head-actions'),
    el('button', { class: 'btn', type: 'button', onclick: preview }, 'Xem trước menu lúc…'),
    el('button', { class: 'btn btn-primary', type: 'button', onclick: () => edit(null) }, '+ Thêm lịch'),
  );
  clear(
    body,
    el(
      'p',
      { class: 'muted small' },
      'Món thuộc lịch "Hiện" chỉ có trên menu khách khi lịch đang hiệu lực; lịch "Ẩn" giấu món trong khung giờ đó. Món không thuộc lịch nào luôn hiện. ',
      'Quầy vẫn bán được món đang ẩn (có nhãn "Ngoài lịch"). Giờ tính theo giờ quán.',
    ),
    state.list.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có lịch. Ví dụ: "Bữa sáng 6:00–10:30 hiện Bánh mì", "Mùa Giáng sinh 01/12–31/12 hiện danh mục Đồ uống Noel".')
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
                ['Lịch', 'Khoảng ngày', 'Ngày / giờ', 'Món / danh mục', 'Bật', ''].map((h) => el('th', {}, h)),
              ),
            ),
            el(
              'tbody',
              {},
              state.list.map((s) =>
                el(
                  'tr',
                  {},
                  el(
                    'td',
                    {},
                    el('strong', {}, s.name),
                    s.sourceCategoryId ? el('div', { class: 'small muted' }, 'Tự tạo từ giờ bán của danh mục (sửa ở Thực đơn)') : null,
                  ),
                  el('td', { class: 'small' }, periodText(s)),
                  el('td', { class: 'small' }, daysText(s.daysOfWeekMask), el('div', {}, s.startTime ? `${s.startTime}–${s.endTime}` : 'cả ngày')),
                  el(
                    'td',
                    { class: 'small' },
                    s.targets.map((t) =>
                      el(
                        'div',
                        {},
                        el('span', { class: `pill ${t.mode === 'HIDE' ? 'danger' : ''}` }, t.mode === 'SHOW' ? 'Hiện' : 'Ẩn'),
                        ' ',
                        t.categoryId ? `Danh mục ${t.name}` : t.name,
                      ),
                    ),
                  ),
                  el(
                    'td',
                    {},
                    toggle(
                      s.isActive,
                      async (v, input) => {
                        try {
                          await staffApi(`/api/admin/menu-schedules/${s.scheduleId}/active`, { method: 'PATCH', body: { isActive: v } });
                          toast(v ? 'Đã bật lịch' : 'Đã tắt lịch — menu khách cập nhật ngay', 'success');
                          load();
                        } catch (err) {
                          input.checked = !v;
                          toast(errorMessage(err), 'error');
                        }
                      },
                      `Bật ${s.name}`,
                    ),
                  ),
                  el(
                    'td',
                    {},
                    s.sourceCategoryId
                      ? null
                      : el(
                          'div',
                          { class: 'row' },
                          el('button', { class: 'btn btn-sm', type: 'button', onclick: () => edit(s) }, 'Sửa'),
                          el('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => remove(s) }, 'Xóa'),
                        ),
                  ),
                ),
              ),
            ),
          ),
        ),
  );
}

async function remove(s) {
  if (!(await confirmDialog(`Xóa lịch "${s.name}"?`, 'Món trong lịch sẽ hiện theo các lịch còn lại (hoặc luôn hiện).', { okLabel: 'Xóa', danger: true })))
    return;
  try {
    await staffApi(`/api/admin/menu-schedules/${s.scheduleId}`, { method: 'DELETE' });
    toast('Đã xóa lịch', 'success');
    load();
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

function modeSelect(name, value) {
  return el(
    'select',
    { class: 'input', name, style: { width: 'auto' }, 'aria-label': 'Hiện/ẩn' },
    el('option', { value: '' }, '—'),
    el('option', { value: 'SHOW', selected: value === 'SHOW' }, 'Hiện'),
    el('option', { value: 'HIDE', selected: value === 'HIDE' }, 'Ẩn'),
  );
}

function edit(s) {
  const isNew = !s;
  const modeOf = (key) => s?.targets.find((t) => (key.startsWith('c') ? t.categoryId === Number(key.slice(1)) : t.menuItemId === Number(key.slice(1))))?.mode;
  const mask = s?.daysOfWeekMask ?? 127;
  const form = el(
    'form',
    { class: 'stack' },
    el(
      'div',
      { class: 'form-grid' },
      el('div', { class: 'field' }, el('label', {}, 'Tên lịch'), el('input', { class: 'input', name: 'name', value: s?.name ?? '', maxlength: 100 })),
      el(
        'div',
        { class: 'field' },
        el('label', {}, 'Từ ngày (trống = không giới hạn)'),
        el('input', { class: 'input', name: 'startDate', type: 'date', value: s?.startDate ?? '' }),
      ),
      el('div', { class: 'field' }, el('label', {}, 'Đến ngày'), el('input', { class: 'input', name: 'endDate', type: 'date', value: s?.endDate ?? '' })),
      el(
        'div',
        { class: 'field' },
        el('label', {}, 'Từ giờ (trống = cả ngày)'),
        el('input', { class: 'input', name: 'startTime', type: 'time', value: s?.startTime ?? '' }),
      ),
      el('div', { class: 'field' }, el('label', {}, 'Đến giờ'), el('input', { class: 'input', name: 'endTime', type: 'time', value: s?.endTime ?? '' })),
    ),
    el(
      'div',
      { class: 'field' },
      el('label', {}, 'Ngày trong tuần'),
      el(
        'div',
        { class: 'days' },
        DAYS.map((d, i) => el('label', {}, el('input', { type: 'checkbox', name: 'dow', value: i, checked: Boolean(mask & (1 << i)) }), d)),
      ),
    ),
    el(
      'div',
      { class: 'field' },
      el('label', {}, 'Món / danh mục trong lịch (Hiện = chỉ có trên menu trong lịch; Ẩn = giấu trong lịch)'),
      el(
        'div',
        { class: 'check-list schedule-targets' },
        state.categories.map((c) =>
          el('div', { class: 'row between' }, el('strong', {}, `Cả danh mục ${c.name}`), modeSelect(`c${c.categoryId}`, modeOf(`c${c.categoryId}`))),
        ),
        state.items.map((i) => el('div', { class: 'row between' }, el('span', {}, i.name), modeSelect(`i${i.menuItemId}`, modeOf(`i${i.menuItemId}`)))),
      ),
    ),
    el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'isActive', checked: s?.isActive ?? true }), 'Bật lịch'),
  );
  modal({
    title: isNew ? 'Thêm lịch thực đơn' : `Sửa: ${s.name}`,
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async () => {
          const f = (n) => form.elements.namedItem(n);
          const targets = [...form.querySelectorAll('select')]
            .filter((x) => x.value)
            .map((x) =>
              x.name.startsWith('c') ? { categoryId: Number(x.name.slice(1)), mode: x.value } : { menuItemId: Number(x.name.slice(1)), mode: x.value },
            );
          const body = {
            name: f('name').value,
            startDate: f('startDate').value || null,
            endDate: f('endDate').value || null,
            startTime: f('startTime').value || null,
            endTime: f('endTime').value || null,
            daysOfWeekMask: [...form.querySelectorAll('input[name="dow"]:checked')].reduce((m, x) => m | (1 << Number(x.value)), 0),
            isActive: f('isActive').checked,
            targets,
          };
          try {
            if (isNew) await staffApi('/api/admin/menu-schedules', { method: 'POST', body });
            else await staffApi(`/api/admin/menu-schedules/${s.scheduleId}`, { method: 'PUT', body });
            toast('Đã lưu lịch — menu khách cập nhật ngay', 'success');
            load();
          } catch (err) {
            if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error');
            return false;
          }
        },
      },
    ],
  });
}

function preview() {
  const nowVn = new Date(Date.now() + 7 * 3600e3).toISOString().slice(11, 16);
  const at = el('input', { class: 'input', type: 'datetime-local', value: `${todayVn()}T${nowVn}`, 'aria-label': 'Thời điểm xem trước' });
  const out = el('div', { class: 'preview-menu' });
  const run = async () => {
    try {
      const r = await staffApi(`/api/admin/menu-schedules/preview?at=${encodeURIComponent(at.value.slice(0, 16))}`);
      const row = (i) =>
        el('li', { class: i.visible ? '' : 'muted' }, icon(i.visible ? 'check' : 'x', { label: i.visible ? 'Hiện' : 'Ẩn' }), i.name, i.visible ? '' : ' (ẩn)');
      clear(
        out,
        r.categories.map((c) => el('div', {}, el('strong', {}, c.name), el('ul', { class: 'small' }, c.items.map(row)))),
        r.combos.length ? el('div', {}, el('strong', {}, 'Combo'), el('ul', { class: 'small' }, r.combos.map(row))) : null,
      );
    } catch (err) {
      clear(out, el('div', { class: 'field-error' }, errorMessage(err)));
    }
  };
  at.addEventListener('change', run);
  modal({
    title: 'Xem trước menu khách',
    body: el('div', { class: 'stack' }, el('label', {}, 'Thời điểm (giờ quán)'), at, out),
    actions: [{ label: 'Đóng', class: 'btn-primary' }],
  });
  run();
}

// ---------- Thời gian pha & hàng chờ (F-025) ----------
async function loadPrep() {
  const [stats, settings, eta, jobs] = await Promise.all([
    staffApi('/api/admin/prep-stats'),
    staffApi('/api/admin/settings'),
    staffApi('/api/queue/eta'),
    staffApi('/api/admin/jobs'),
  ]);
  const job = jobs.find((j) => j.name === 'prep-stats');
  const field = (name, label, value, attrs = {}) =>
    el('div', { class: 'field' }, el('label', {}, label), el('input', { class: 'input', name, type: 'number', value, ...attrs }));
  const form = el(
    'form',
    { class: 'card stack' },
    el('h2', { style: { margin: 0, fontSize: '1.05rem' } }, 'Cài đặt bếp'),
    el(
      'div',
      { class: 'form-grid' },
      field('etaBaseSeconds', 'Thời gian cơ bản mỗi đơn (giây)', settings.etaBaseSeconds, { min: 0, max: 3600 }),
      field('kitchenParallelism', 'Số người pha cùng lúc', settings.kitchenParallelism, { min: 1, max: 10 }),
      field('etaSpreadPercent', 'Khoảng dao động hiển thị (±%)', settings.etaSpreadPercent, { min: 0, max: 100 }),
      field('etaDefaultItemSeconds', 'Thời gian mặc định món chưa có số liệu (giây)', settings.etaDefaultItemSeconds, { min: 10, max: 3600 }),
    ),
    el('div', { class: 'row' }, el('button', { class: 'btn btn-primary', type: 'submit' }, 'Lưu cài đặt bếp')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (n) => Number(form.elements.namedItem(n).value);
    try {
      await staffApi('/api/admin/settings', {
        method: 'PUT',
        body: {
          etaBaseSeconds: v('etaBaseSeconds'),
          kitchenParallelism: v('kitchenParallelism'),
          etaSpreadPercent: v('etaSpreadPercent'),
          etaDefaultItemSeconds: v('etaDefaultItemSeconds'),
        },
      });
      toast('Đã lưu cài đặt bếp', 'success');
      load();
    } catch (err) {
      if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error');
    }
  });
  clear(
    $('#head-actions'),
    el(
      'button',
      {
        class: 'btn',
        type: 'button',
        onclick: async (e) => {
          e.currentTarget.disabled = true;
          const r = await staffApi('/api/admin/jobs/prep-stats/run', { method: 'POST' }).catch((err) => ({ status: 'FAILED', error: errorMessage(err) }));
          toast(r.status === 'OK' ? 'Đã tính lại thời gian pha thực tế' : `Không chạy được: ${r.error ?? r.status}`, r.status === 'OK' ? 'success' : 'warning');
          load();
        },
      },
      'Tính lại thống kê',
    ),
  );
  const sec = (s) => (s ? `${Math.floor(s / 60)} phút ${s % 60 ? `${s % 60} giây` : ''}`.trim() : '—');
  clear(
    body,
    el(
      'div',
      { class: 'kpis' },
      el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Hàng chờ hiện tại'), el('div', { class: 'value' }, `${eta.queueLength} món`)),
      el(
        'div',
        { class: 'card kpi' },
        el('div', { class: 'label' }, 'Khách gọi lúc này chờ khoảng'),
        el('div', { class: 'value' }, `${eta.minMinutes}–${eta.maxMinutes} phút`),
      ),
      el(
        'div',
        { class: 'card kpi' },
        el('div', { class: 'label' }, 'Thống kê thực tế'),
        el('div', { class: 'value small' }, job?.lastRun?.finishedAt ? dateTime(job.lastRun.finishedAt) : 'Chưa chạy'),
      ),
    ),
    form,
    el('h2', { style: { fontSize: '1.05rem', marginTop: '1.2rem' } }, 'Thời gian pha từng món'),
    el(
      'p',
      { class: 'muted small' },
      'Thực tế = trung vị 30 ngày (tiếp nhận → hoàn tất, chia đều cho số món trong đơn), tự tính lúc 02:00. Đặt "Chuẩn" để dùng số của bạn thay thống kê (sửa ở Thực đơn → Sửa món).',
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
            ['Món', 'Chuẩn (quản lý nhập)', 'Thực tế (trung vị)', 'Số mẫu', 'Đang dùng để ước tính'].map((h) => el('th', {}, h)),
          ),
        ),
        el(
          'tbody',
          {},
          stats.map((s) =>
            el(
              'tr',
              {},
              el('td', {}, s.name),
              el('td', {}, sec(s.prepSeconds)),
              el('td', {}, sec(s.medianSeconds)),
              el('td', { class: 'num' }, s.sampleCount),
              el('td', {}, el('strong', {}, sec(s.usedSeconds))),
            ),
          ),
        ),
      ),
    ),
  );
}

load();
