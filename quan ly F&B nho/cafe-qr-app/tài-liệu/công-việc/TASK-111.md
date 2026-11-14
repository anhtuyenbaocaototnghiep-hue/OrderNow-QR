# TASK-111 — Bỏ trang "Phân tích" ở trang Quản lý (ADR-052)
Status: READY_FOR_REVIEW (14/11/2026)
Feature: [FEATURE-042](../chức-năng/FEATURE-042.md) (AC-042-06), [FEATURE-041](../chức-năng/FEATURE-041.md) · ADR: [ADR-052](../quyết-định/ADR-052-bo-trang-phan-tich.md) D-225 · UC-16 · SCR-41 (bỏ), SCR-39, SCR-33
Nguồn: chủ dự án 14/11/2026 — "bỏ cái phân tích không cần thiết". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-111-bo-trang-phan-tich` chồng lên `task/TASK-110-phan-quyen-don-gian` · Kế hoạch: [TASK-111-plan](../kế-hoạch/TASK-111-plan.md)

## Phạm vi
- Bỏ trang `/admin/analytics` (HTML + JS), mục thanh bên; địa chỉ cũ → `/admin/pnl`.
- Cài đặt: nhóm nâng cao "Thu chi"; quyền `admin.pnl` tên "Thu chi, chi phí cố định", trang `pnl`; mô tả vai Chủ quán bỏ chữ "phân tích".
- Giữ API phân tích (không giao diện nào gọi) — ghi trong ADR-052.

## Test
- `analytics.test.js`: thêm AC-042-06; các test API F-041 / F-042 giữ.
- E2E: bài "phân tích + dashboard" → "bỏ trang Phân tích … dashboard" (AC-042-06, AC-043-02 / 03); a11y bỏ bước quét trang Phân tích.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`
