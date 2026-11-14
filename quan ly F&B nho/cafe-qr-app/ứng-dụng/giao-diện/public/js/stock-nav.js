// TASK-109 (F-089): "Nhập kho & kiểm kê" và "Nhà cung cấp & đặt hàng" gộp thành một mục — một hàng thẻ chung cho hai trang
// (/admin/stock, /admin/purchasing). Việc hằng ngày ở hàng trên; báo cáo kho ở hàng dưới (chữ nhỏ).
// Thẻ cùng trang → đổi tại chỗ (ghi ?tab= vào địa chỉ); thẻ của trang kia → chuyển trang tới đúng thẻ.
import { el } from './ui.js';

/** [trang, khóa thẻ, nhãn] — việc hằng ngày. */
export const STOCK_TABS = [
  ['stock', 'receipts', 'Nhập kho'],
  ['stock', 'stocktakes', 'Kiểm kê'],
  ['purchasing', 'suggest', 'Đề xuất nhập hàng'],
  ['purchasing', 'pos', 'Đơn đặt hàng'],
  ['purchasing', 'suppliers', 'Nhà cung cấp'],
];
/** Báo cáo kho — ít dùng hơn. */
export const STOCK_REPORT_TABS = [
  ['stock', 'costs', 'Giá vốn & hao hụt'],
  ['stock', 'cogs', 'Giá vốn thực tế'],
  ['stock', 'loss', 'Thất thoát'],
  ['purchasing', 'report', 'Giá & giao hàng'],
  ['stock', 'units', 'Đơn vị'],
];

/** Thẻ mở đầu: ?tab= nếu thuộc trang này, không thì `fallback`. */
export function initialTab(page, fallback) {
  const want = new URLSearchParams(location.search).get('tab');
  return [...STOCK_TABS, ...STOCK_REPORT_TABS].some(([p, key]) => p === page && key === want) ? want : fallback;
}

/** Hàng thẻ chung; `onPick(key)` khi chọn thẻ cùng trang. */
export function stockTabs(page, active, onPick) {
  const bar = el('div', { class: 'tabs stock-tabs', role: 'tablist', 'aria-label': 'Nhập kho, đặt hàng & kiểm kê' });
  const tab = ([p, key, label], small) =>
    el(
      'button',
      {
        type: 'button',
        role: 'tab',
        class: small ? 'tab-sm' : null,
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
    );
  bar.append(
    ...STOCK_TABS.map((t) => tab(t, false)),
    el('span', { class: 'tabs-break', 'aria-hidden': 'true' }), // xuống hàng: báo cáo kho
    el('span', { class: 'tabs-sep small muted', 'aria-hidden': 'true' }, 'Báo cáo kho:'),
    ...STOCK_REPORT_TABS.map((t) => tab(t, true)),
  );
  return bar;
}
