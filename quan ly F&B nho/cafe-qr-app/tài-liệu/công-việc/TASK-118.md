# TASK-118 — Quét QR bàn có nhóm: tự vào nhóm của bàn (F-097)
Status: READY_FOR_REVIEW (17/11/2026)
Feature: [FEATURE-097](../chức-năng/FEATURE-097.md) · ADR: [ADR-059](../quyết-định/ADR-059-tu-vao-nhom-cua-ban.md) (D-238, D-239) · AC-097-01…04 · US-097-1 · UC-01 · MOD-ORDER · SCR-01, SCR-05
Nguồn: chủ dự án — "bạn bỏ cái cá nhân với gộp bàn rồi bạn xem tích hợp sao" → duyệt phương án: "okay" (17/11/2026). · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-118-tu-vao-nhom-cua-ban` chồng lên `task/TASK-117-them-tai-khoan-chu-quan`

## Phạm vi
- `t-entry.js`: bàn 1 nhóm → tự vào (báo), ≥ 2 nhóm → chọn nhóm, bỏ "Tạo đơn cá nhân"; F-086 "Gọi món ở Bàn …"; màn chào "Trả riêng từng người?".
- `t-track.js`: `?act=split` mở hộp Chia bill theo người.
- Ngoài phạm vi: đổi API / CSDL / màn quầy (bàn nhiều nhóm vẫn thu như cũ).

## Test
- E2E mới "vào nhóm của bàn…" (AC-097-01…04); E2E cũ theo luồng mới (nhóm thứ hai mở bằng API); a11y màn chọn nhóm (bàn 2 nhóm).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`
