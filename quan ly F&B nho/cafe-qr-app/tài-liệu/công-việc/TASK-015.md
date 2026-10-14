# TASK-015 — Gọi thanh toán + thu tiền mặt tại bàn + in bill phiên + Đóng bàn trống
Status: READY_FOR_REVIEW (14/10/2026). Bằng chứng: `npm test` 39/39, `npm run test:e2e` 14/14, `npm run load` 10/10 (14/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-005 (AC-005-01…05), FEATURE-006 (AC-006-01…06)
Story: ADR-000 (D-2); US7
Owner: Nhật Anh + Tuyến · Tuần: 5

## Mục tiêu
Khách gọi thanh toán; nhân viên thu tiền mặt, in bill và đóng phiên đúng một lần.

## Phạm vi và phần chưa làm
Trong:
- SP `sp_RequestPayment`, `sp_SettleSession` + integration test: 2 settle đồng thời, còn đơn PENDING, tiền thiếu, submit ⇄ settle (theo Q-013).
- API `request-payment`, `settle`, `close`, `receipt?mode=final|provisional`.
- UI: nút Gọi thanh toán + S-04 trên S-05; dải Gọi thanh toán + âm thanh riêng trên S-10; drawer S-14; trang in S-12 (phiên, 58/80 mm, tạm tính có chữ TẠM TÍNH).
- Realtime: `session.payment_requested`, `session.settled`, `session.closed`, `session.payment_cancelled` (nếu Q-013 cho gọi thêm).

Ngoài:
- Bán mang đi (TASK-016); báo cáo (TASK-017).

## Context cần đọc
- `tài-liệu/chức-năng/FEATURE-005.md`
- `tài-liệu/chức-năng/FEATURE-006.md`
- `tài-liệu/nghiệp-vụ/business-rules.md` (BR-007, BR-014, BR-018, BR-019)
- `tài-liệu/nghiệp-vụ/workflows-states.md` (trạng thái phiên)
- `tài-liệu/kiến-trúc/data-model.md` (`sp_RequestPayment`, `sp_SettleSession`, ghi chú #2)
- `tài-liệu/kiến-trúc/api-contract.md`
- `tài-liệu/kiến-trúc/realtime-events.md`
- `tài-liệu/giao-diện/screens-flows.md` (S-04, S-05, S-10, S-12, S-14)

## Skill
implement-feature, change-database

## Acceptance Criteria
- AC-005-01…AC-005-05.
- AC-006-01…AC-006-05.
- AC-006-06 (báo cáo cộng đúng): kiểm bằng truy vấn ở task này; kiểm qua UI ghi NOT_RUN cho tới TASK-017.

## Dependencies
TASK-010, TASK-011, TASK-012

## Ràng buộc
Không có API nào cho khách đổi `PaymentStatus` (BR-007); thu tiền chỉ qua `sp_SettleSession`.

## Validation
Integration test SP/API đồng thời trên SQL Server thật; kiểm in bằng Chrome print preview 80 mm (máy in thật ở TASK-020).

## Đầu ra
SP + API + UI thanh toán, test, data-model/api-contract cập nhật. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
Q-013, Q-015, Q-018.
