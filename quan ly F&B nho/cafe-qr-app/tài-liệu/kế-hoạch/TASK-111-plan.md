# TASK-111 — Kế hoạch: bỏ trang Phân tích (ADR-052)

| Thứ | Ở đâu | Việc |
| --- | --- | --- |
| Trang | `routes/pages.js`, `admin/analytics.html`, `js/pages/admin-analytics.js` | Bỏ khỏi `PAGES`, xóa 2 tệp; `GET /admin/analytics` → `redirect('/admin/pnl')` |
| Thanh bên / quyền giao diện | `js/admin-shell.js`, `js/roles.js` | Bỏ mục + `MODULE_OF.analytics`; bỏ `PAGE_CAP.analytics`, `ADMIN_PAGE_HREF` |
| Cài đặt | `js/pages/admin-settings.js` | Nhóm `analytics` → "Thu chi" (khóa giữ để `ui.modules` đã lưu không đổi) |
| Quyền máy chủ | `auth/permissions.js` | `admin.pnl`: nhãn "Thu chi, chi phí cố định", `pages: ['pnl']`; quy tắc API giữ |
| Test | `analytics.test.js`, `flow.spec.js`, `a11y.spec.js` | AC-042-06; sửa bài E2E phân tích + dashboard; bỏ quét a11y trang Phân tích |

Rủi ro: liên kết cũ tới `/admin/analytics` (đánh dấu trình duyệt) → chuyển về Thu chi, không 404; `ui.modules` đã lưu có `analytics` vẫn hợp lệ (nay chỉ Thu chi).
