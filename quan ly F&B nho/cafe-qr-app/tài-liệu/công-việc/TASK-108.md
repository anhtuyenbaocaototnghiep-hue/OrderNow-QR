# TASK-108 — Đổi tên trang "Lãi / lỗ" → "Thu chi" (F-034)
Status: READY_FOR_REVIEW (14/11/2026)
Feature: [FEATURE-034](../chức-năng/FEATURE-034.md) · Màn hình: S-39 `/admin/pnl`, thanh bên trang Quản lý
Nguồn: chủ dự án 14/11/2026 — "lãi lỗ đổi tên thành thu chi". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-108-doi-ten-thu-chi` chồng lên `task/TASK-107-bo-doi-nguoi`

## Phạm vi
- Chỉ đổi chữ hiển thị (không đổi đường dẫn, API, quyền, cách tính): thanh bên, tiêu đề trang + tab, tên quyền "Thu chi, chi phí cố định, phân tích", chữ ở Sổ quỹ, Cài đặt (nhóm nâng cao "Phân tích & thu chi"), mô tả vai trò.
- Nhóm thanh bên "Thu chi & nhân sự" → "Quỹ & nhân sự" (tránh trùng chữ).
- Giữ chữ lãi / lỗ khi nói về con số trong trang ("Quán đang lỗ …", dòng "Lỗ", đường "Lãi / lỗ" trên biểu đồ).
- Test: E2E AC-077-08 (thanh Xin quyền ghi "Thu chi", tên bài sửa theo). Tài liệu: FEATURE-034, screens-flows, roles-permissions, hướng dẫn `chức-năng-mới/20`, `24`, README.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm run test:e2e` · `npm run trace -- --check`
