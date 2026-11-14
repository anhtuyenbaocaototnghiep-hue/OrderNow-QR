# ADR-052 — Bỏ trang "Phân tích" ở trang Quản lý

- **Trạng thái:** ACCEPTED (14/11/2026). Chủ dự án: "bỏ cái phân tích không cần thiết".
- **Bối cảnh:** trang **Phân tích & menu engineering** (`/admin/analytics`, SCR-41 — F-041, F-042, ADR-006 giai đoạn 8) có 5 thẻ: Menu engineering, Giờ cao điểm, Dự báo doanh thu, So sánh kỳ, Theo bàn. Chủ quán đã có **Hôm nay** (doanh thu hôm qua, món bán chạy, việc cần làm), **Báo cáo & lịch sử** và **Thu chi** (lãi / lỗ). Sau khi làm gọn giao diện (ADR-042, D-220), chủ dự án thấy trang Phân tích không cần.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-225 | **Bỏ trang Phân tích khỏi giao diện.** Thanh bên (nhóm Tổng quan) không còn mục "Phân tích"; xóa `admin/analytics.html`, `js/pages/admin-analytics.js`. Địa chỉ cũ `/admin/analytics` chuyển (302) về `/admin/pnl` — Thu chi, cùng quyền. Cài đặt → nhóm nâng cao "Phân tích & thu chi" đổi thành **"Thu chi"** (khóa `analytics` của `ui.modules` giữ nguyên, nay chỉ ẩn / hiện Thu chi). Quyền `admin.pnl` đổi tên **"Thu chi, chi phí cố định"**, trang chỉ còn `pnl`. **Giữ API** `/api/admin/reports/menu-engineering` (+ `/pin`), `heatmap`, `revenue-forecast`, `compare`, `tables` (chỉ chủ quán / người có quyền Thu chi; xem ở Tra cứu API) — không trang nào gọi, không job nền riêng; giữ để không mất cách tính đã kiểm (F-041, F-042) và bật lại được nếu cần. |

## Phương án đã cân nhắc

- **Bỏ luôn API + mã tính (menu engineering, giờ cao điểm, dự báo, so sánh, theo bàn):** nhiều thay đổi (route, service, domain, test, tài liệu) cho phần không ai thấy; chủ dự án chỉ nói bỏ trang. Có thể làm sau nếu muốn.
- **Ẩn mặc định (chế độ cơ bản F-061) thay vì bỏ:** trang vẫn còn trong Cài đặt → không đúng ý "bỏ".
- **Chuyển `/admin/analytics` về Hôm nay:** Hôm nay cần quyền khác (`dashboard.view`); Thu chi cùng quyền với trang cũ nên không ai bị chặn.

## Hệ quả

- **Mã nguồn:** `routes/pages.js` (bỏ trang, thêm chuyển hướng), `js/admin-shell.js` (thanh bên, `MODULE_OF`), `js/roles.js` (trang ↔ quyền, mô tả vai Chủ quán), `js/pages/admin-settings.js` (nhóm "Thu chi"), `auth/permissions.js` (nhãn + trang của `admin.pnl`). CSS biểu đồ dùng chung với Thu chi giữ nguyên.
- **Test:** `analytics.test.js` thêm AC-042-06 (chuyển hướng 302, API vẫn 200 cho chủ quán, trưởng ca 403, nhãn quyền); E2E bài "phân tích + dashboard" → "bỏ trang Phân tích … dashboard" (AC-042-06 + AC-043-02 / 03); a11y bỏ các bước quét trang Phân tích. Test API F-041 / F-042 giữ nguyên.
- **Tài liệu:** FEATURE-041, FEATURE-042 (giao diện đã bỏ, AC-042-06), screens-flows (S-41), sitemap (SCR-41), roles-permissions, use-cases (UC-16), user-stories (US-041-1, US-042-1…3), tc-map, hướng dẫn `chức-năng-mới/23` + README.
