# TASK-013 — Hoàn tất & trừ kho qua sp_CompleteOrder (API + nút trên POS)
Status: READY_FOR_REVIEW (14/10/2026). Bằng chứng: `npm test` 39/39, `npm run test:e2e` 14/14, `npm run load` 10/10 (14/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-007 (AC-007-03, AC-007-04)
Story: US6 bản 1; US5 bản 2
Owner: Nhật Anh + Tuyến · Tuần: 4–5

## Mục tiêu
Bấm Hoàn tất sẽ đổi trạng thái đơn và trừ kho đúng một lần, kể cả khi bị bấm đồng thời.

## Phạm vi và phần chưa làm
Trong:
- `POST /api/orders/{id}/complete` gọi `sp_CompleteOrder`; map 50001/50002/50003; retry khi deadlock 1205 (≤ 3 lần).
- Nút Hoàn tất (và "Tiếp nhận & Hoàn tất" — PROPOSED) trên S-10/S-11; xử lý 409 "đã được nhân viên khác xử lý".
- Phát `order.status_changed` và `inventory.low` sau commit.

Ngoài:
- In bill dine-in (in lúc thu tiền phiên — TASK-015, theo ADR-000).

## Context cần đọc
- `tài-liệu/chức-năng/FEATURE-007.md`
- `tài-liệu/nghiệp-vụ/business-rules.md` (BR-001, BR-002, BR-013)
- `tài-liệu/kiến-trúc/data-model.md` (`sp_CompleteOrder`)
- `tài-liệu/kiến-trúc/api-contract.md`
- `tài-liệu/kiến-trúc/realtime-events.md`

## Skill
implement-feature

## Acceptance Criteria
- AC-007-03, AC-007-04 (ở mức API, đồng thời trên SQL Server thật).
- Mốc nghiệm thu cuối tuần 4: QR → quầy → tiếp nhận → hoàn tất → kho giảm.

## Dependencies
TASK-004, TASK-012

## Ràng buộc
Chỉ trừ kho qua SP; không kiểm tra-rồi-ghi ở tầng app.

## Validation
Integration test 2 request đồng thời; E2E bấm Hoàn tất và kiểm khách nhận trạng thái (khi có TASK-014).

## Đầu ra
API complete, UI nút, test. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
Q-001, Q-006.
