# TASK-114 — Màn khách chỉ cho điện thoại (F-093)
Status: READY_FOR_REVIEW (16/11/2026)
Feature: [FEATURE-093](../chức-năng/FEATURE-093.md) · ADR: [ADR-055](../quyết-định/ADR-055-man-khach-chi-cho-dien-thoai.md) (D-230) · AC-093-01, AC-093-02 · US-093-1 · UC-01 · MOD-ORDER · SCR-01, SCR-02, SCR-03, SCR-05
Nguồn: chủ dự án 16/11/2026 — "bạn làm giao diện oder của khách thuần về điện thoại thôi". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-114-man-khach-chi-dien-thoai` chồng lên `task/TASK-113-man-chao-khi-quet-qr`

## Phạm vi
- `css/customer.css`: `body.customer` một cột tối đa 480 px (`--phone`), màn rộng thì nền hai bên + viền / bóng mảnh; thanh giỏ, thanh nút đáy, bảng chọn, hộp thoại trong cột; bỏ bố cục máy tính (cột 720 / 1040 px, thẻ món 2 cột).
- Không đổi JS, API, CSDL, màn quầy.
- Ngoài phạm vi: chặn mở bằng máy tính, khung giả lập điện thoại.

## Test
- E2E mới "màn khách chỉ cho điện thoại…" (AC-093-01, AC-093-02).
- Chạy lại toàn bộ E2E (các bài khách 390 / 320 px, a11y) để chắc điện thoại không đổi.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`
