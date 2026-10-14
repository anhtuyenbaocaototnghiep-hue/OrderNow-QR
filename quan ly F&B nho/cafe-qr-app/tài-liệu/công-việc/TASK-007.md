# TASK-007 — Admin: nguyên liệu, BOM, điều chỉnh kho, lịch sử kho
Status: READY_FOR_REVIEW (14/10/2026). Bằng chứng: `npm test` 39/39, `npm run test:e2e` 14/14, `npm run load` 10/10 (14/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-011 (AC-011-01…04)
Story: US9 bản 1, US7 bản 2
Owner: Nhật Anh + Tuyến · Tuần: 3

## Mục tiêu
Admin thiết lập BOM cho từng món và quản lý tồn kho có nhật ký.

## Phạm vi và phần chưa làm
Trong:
- API ingredients CRUD; `adjust` ghi `InventoryTransactions(ADJUST)`, không âm, không thấp hơn `ReservedQty` (nếu A); lịch sử giao dịch.
- BOM: `GET` / `PUT` thay toàn bộ trong một transaction; `amount > 0`; không trùng nguyên liệu.
- UI S-23, S-24 (highlight ô lỗi).

Ngoài:
- Phiếu nhập kho đầy đủ (làm sau — Q-011).

## Context cần đọc
- `tài-liệu/chức-năng/FEATURE-011.md`
- `tài-liệu/nghiệp-vụ/business-rules.md` (BR-003, BR-016)
- `tài-liệu/kiến-trúc/api-contract.md` (phần Quản trị)
- `tài-liệu/giao-diện/screens-flows.md` (S-23, S-24)
- `tài-liệu/kiến-trúc/data-model.md`

## Skill
implement-feature (+ change-database nếu đổi schema)

## Acceptance Criteria
- AC-011-02, AC-011-03, AC-011-04.
- AC-011-01 (bán 1 ly → kho giảm đúng): kiểm ở mức SP qua TASK-004; kiểm đầu-cuối ghi NOT_RUN cho tới khi có TASK-013.

## Dependencies
TASK-003, TASK-005

## Ràng buộc
Mọi thay đổi tồn kho đều ghi `InventoryTransactions`; không sửa tồn kho ngoài transaction.

## Validation
Integration test BOM validation và adjust; unit test FE cho form BOM.

## Đầu ra
API + UI kho/BOM, test. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
Q-011.
