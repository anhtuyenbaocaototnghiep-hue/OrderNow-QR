# TASK-119 — Màu màn khách chỉ theo giờ của quán (F-094, ADR-060)
Status: READY_FOR_REVIEW (17/11/2026)
Feature: [FEATURE-094](../chức-năng/FEATURE-094.md) · ADR: [ADR-060](../quyết-định/ADR-060-mau-man-khach-chi-theo-gio-quan.md) (D-240) · AC-094-02 (sửa) · US-094-1 · SCR-01, SCR-02, SCR-05
Nguồn: chủ dự án — "đổi theo giờ quán" (17/11/2026 — sau khi thấy máy tính bật chế độ tối của Windows thì màn khách tối cả ban ngày, điện thoại thì không). · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-119-mau-theo-gio-quan` chồng lên `task/TASK-118-tu-vao-nhom-cua-ban`

## Phạm vi
- `js/guest-theme.js`: bỏ theo dõi chế độ tối của máy; `data-theme="dark"` chỉ khi 18:00–4:59 (cài đặt bật).
- Ghi chú công tắc ở Cài đặt; E2E AC-094-02 (máy chế độ tối lúc 10:00 vẫn sáng).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm run test:e2e` · `npm run trace -- --check` (không đổi mã máy chủ)
