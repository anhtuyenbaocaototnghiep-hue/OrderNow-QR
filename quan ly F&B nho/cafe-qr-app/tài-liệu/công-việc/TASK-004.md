# TASK-004 — SP sp_SubmitOrder, sp_CompleteOrder, sp_CancelOrder + test đồng thời
Status: READY_FOR_REVIEW (14/10/2026). Bằng chứng: `npm test` 39/39, `npm run test:e2e` 14/14, `npm run load` 10/10 (14/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-003 (AC-003-04), FEATURE-007 (AC-007-03, AC-007-04); BR-001, BR-002
Story: US10, US6 (demo.docx)
Owner: Nhật Anh (+ Sáng viết test) · Tuần: 2

## Mục tiêu
Các SP lõi giữ đúng invariant kho khi chạy đồng thời, và có integration test trên SQL Server thật.

## Phạm vi và phần chưa làm
Trong:
- `cơ-sở-dữ-liệu/thủ-tục/sp_SubmitOrder.sql`, `sp_CompleteOrder.sql`, `sp_CancelOrder.sql` (`CREATE OR ALTER`) theo data-model, ADR-001 và quyết định Q-013.
- Cách sinh `OrderCode` (ghi chú đối chiếu #3) và kiểm `MenuItemId` không tồn tại (ghi chú #5).
- Integration test: happy path; thiếu kho; hủy trả giữ chỗ; đồng thời (kịch bản 13.2 thu nhỏ, ≥ 10 luồng); 2 request complete đồng thời.

Ngoài:
- `sp_RequestPayment` / `sp_SettleSession` (TASK-015); API.

## Context cần đọc
- `tài-liệu/kiến-trúc/data-model.md` (DDL, SP, ghi chú đối chiếu, bảng mã lỗi)
- `tài-liệu/nghiệp-vụ/business-rules.md` (BR-001, BR-002, BR-010, BR-013)
- `tài-liệu/chất-lượng/test-strategy.md` (13.2)
- `tài-liệu/chức-năng/FEATURE-003.md`
- `tài-liệu/chức-năng/FEATURE-007.md`

## Skill
change-database

## Acceptance Criteria
- AC-003-04 ở mức SP: 20 lời gọi đồng thời khi kho chỉ đủ 1 suất → đúng 1 thành công, 19 lỗi 50002.
- AC-007-03: hoàn tất trừ đúng Σ BOM; có N dòng `DEDUCT`.
- AC-007-04: 2 complete đồng thời → 1 thành công, 1 lỗi 50001; kho trừ đúng 1 lần.
- Bất biến sau mọi test: `StockQty ≥ 0`; `ReservedQty` = Σ nhu cầu của đơn `PENDING/PREPARING` (nếu A); mỗi (OrderId, IngredientId) ≤ 1 dòng `DEDUCT`.

## Dependencies
TASK-003

## Ràng buộc
Không nới constraint; khóa `Ingredients` bằng `UPDLOCK, HOLDLOCK`; `THROW` theo bảng mã lỗi; không mock DB trong test đồng thời.

## Validation
Chạy test trên SQL Server thật (Docker hoặc instance cài sẵn), lặp 10 lần. Đây là mốc nghiệm thu cuối tuần 2.

## Đầu ra
`cơ-sở-dữ-liệu/thủ-tục/*.sql`, integration test, data-model cập nhật nếu SP khác bản đề xuất. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
Q-001, Q-013, Q-010 (hủy), Q-006.
