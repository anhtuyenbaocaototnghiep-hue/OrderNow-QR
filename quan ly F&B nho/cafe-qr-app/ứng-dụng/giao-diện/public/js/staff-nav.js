// TASK-132 (ADR-068 D-260 — chủ quán 23/11/2026: ảnh thanh bên "Nhân sự & chấm công" + "Lương", "gộp 2 cái này lại"):
// một mục "Nhân sự & lương" ở thanh bên, một hàng thẻ chung cho hai trang (/admin/staff, /admin/payroll) — như "Nhập kho & kiểm kê"
// (TASK-109, stock-nav.js). Thẻ cùng trang → đổi tại chỗ (ghi ?tab= vào địa chỉ); thẻ của trang kia → chuyển trang tới đúng thẻ.
// Quyền giữ nguyên theo từng trang: thẻ của trang người dùng không mở được thì không hiện (vd "Lương" cần quyền Lương).
import { canOpenAdminPage } from './roles.js';
import { el } from './ui.js';

/** [trang, khóa thẻ, nhãn] */
export const STAFF_TABS = [
  ['staff', 'attendance', 'Chấm công'],
  ['staff', 'roster', 'Lịch làm tuần'],
  ['staff', 'productivity', 'Năng suất'],
  ['staff', 'week', 'Báo cáo tuần'],
  ['payroll', 'payroll', 'Lương'],
];

/** Thẻ mở đầu: ?tab= nếu thuộc trang này, không thì `fallback`. */
export function initialStaffTab(page, fallback) {
  const want = new URLSearchParams(location.search).get('tab');
  return STAFF_TABS.some(([p, key]) => p === page && key === want) ? want : fallback;
}

/** Hàng thẻ chung; `onPick(key)` khi chọn thẻ cùng trang; `user` để ẩn thẻ của trang không có quyền. */
export function staffTabs(page, active, onPick, user) {
  const bar = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Nhân sự & lương' });
  const tabs = STAFF_TABS.filter(([p]) => p === page || canOpenAdminPage(user, p));
  bar.append(
    ...tabs.map(([p, key, label]) =>
      el(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': String(p === page && key === active),
          onclick: (e) => {
            if (p !== page) {
              location.href = `/admin/${p}?tab=${key}`;
              return;
            }
            bar.querySelectorAll('[role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget)));
            history.replaceState(null, '', `${location.pathname}?tab=${key}`);
            onPick(key);
          },
        },
        label,
      ),
    ),
  );
  return bar;
}
