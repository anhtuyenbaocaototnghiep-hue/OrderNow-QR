# TASK-016 — Mục Bán mang đi (S-13): thu tiền mặt tại quầy, in bill đơn
Status: READY_FOR_REVIEW (14/10/2026). Bằng chứng: `npm test` 39/39, `npm run test:e2e` 14/14, `npm run load` 10/10 (14/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-008 (AC-008-01…05)
Story: US8 bản 1, US6 bản 2; ADR-000 (D-3)
Owner: Tuyến + Nhật Anh · Tuần: 5–6

## Mục tiêu
Nhân viên bán nhanh cho khách vãng lai: chọn món, nhận tiền mặt, in bill, đơn vào hàng pha chế.

## Phạm vi và phần chưa làm
Trong:
- `POST /api/orders/takeaway` (`sp_SubmitOrder` với `TAKE_AWAY`/`CASH`), `GET /api/orders/{id}/receipt`.
- UI S-13: lưới món, giỏ, ô tiền khách đưa + nút nhanh, tiền thừa, "Thu tiền & In bill", tab "Đơn mang đi hôm nay"; trang in S-12 chế độ đơn.

Ngoài:
- Chuyển khoản (làm sau theo ADR-000).

## Context cần đọc
- `tài-liệu/chức-năng/FEATURE-008.md`
- `tài-liệu/nghiệp-vụ/business-rules.md` (BR-006, BR-009)
- `tài-liệu/kiến-trúc/api-contract.md` (`POST /api/orders/takeaway`)
- `tài-liệu/giao-diện/screens-flows.md` (S-13, S-12)

## Skill
implement-feature

## Acceptance Criteria
- AC-008-01…AC-008-05.

## Dependencies
TASK-010, TASK-013, TASK-015

## Ràng buộc
Giá tính ở server; `amountReceived` ≥ tổng (BR-006).

## Validation
Integration test API (gồm khách gọi → 401); E2E luồng bán mang đi; in thử trên Chrome print preview.

## Đầu ra
API + UI Bán mang đi, test. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
—
