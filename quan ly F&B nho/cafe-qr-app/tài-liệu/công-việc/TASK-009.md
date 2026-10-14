# TASK-009 — Khách: menu + giỏ hàng (S-02, S-03), GET /api/menu
Status: READY_FOR_REVIEW (14/10/2026). Bằng chứng: `npm test` 39/39, `npm run test:e2e` 14/14, `npm run load` 10/10 (14/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-002 (AC-002-01…05)
Story: US2
Owner: Tuyến · Tuần: 3

## Mục tiêu
Khách xem menu theo danh mục, thêm món vào giỏ và chỉnh số lượng/ghi chú trên điện thoại.

## Phạm vi và phần chưa làm
Trong:
- `GET /api/menu`.
- UI S-02, S-03: giỏ ở client (state + localStorage theo `sessionId`); các trạng thái loading / rỗng / lỗi mạng / hết món.
- Lắng nghe `menu.availability_changed` (AC-002-05 hoàn thiện cùng TASK-011).

Ngoài:
- Gửi đơn (TASK-010).

## Context cần đọc
- `tài-liệu/chức-năng/FEATURE-002.md`
- `tài-liệu/giao-diện/screens-flows.md` (S-02, S-03)
- `tài-liệu/kiến-trúc/api-contract.md` (`GET /api/menu`)
- `tài-liệu/sản-phẩm/overview.md` (NFR-003, NFR-004)

## Skill
implement-feature

## Acceptance Criteria
- AC-002-01…AC-002-04; AC-002-05 cùng TASK-011.
- Đếm số thao tác theo định nghĩa đã chốt ở Q-016 (NFR-003).

## Dependencies
TASK-006

## Ràng buộc
Mobile-first (≥ 360 px); giá định dạng VND; không tin giá từ client (giá tính ở server — TASK-010).

## Validation
Unit test FE cho giỏ; E2E nhẹ cho luồng chọn món; đo kích thước bundle trang khách (NFR-004, PROPOSED).

## Đầu ra
UI S-02/S-03, endpoint menu, test. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
Q-012, Q-016.
