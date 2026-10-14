# TASK-014 — Khách theo dõi đơn realtime (S-05) + nút Gọi thêm món
Status: READY_FOR_REVIEW (14/10/2026). Bằng chứng: `npm test` 39/39, `npm run test:e2e` 14/14, `npm run load` 10/10 (14/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-004 (AC-004-01…04); phần hiển thị của AC-003-06
Story: US4 bản 1
Owner: Tuyến · Tuần: 5

## Mục tiêu
Khách thấy trạng thái từng đơn trong phiên mà không cần F5, và gọi thêm món được.

## Phạm vi và phần chưa làm
Trong:
- `GET /api/sessions/{id}`, `GET /api/orders/{id}` (phía khách, kiểm ownership).
- UI S-05: danh sách đơn, trạng thái, pop-up "Đã xong", tổng tạm tính, nút "Gọi thêm món"; trạng thái mất kết nối/kết nối lại; màn hình "Cảm ơn" khi nhận `session.settled` (phối hợp TASK-015).

Ngoài:
- Nút và luồng Gọi thanh toán (TASK-015).

## Context cần đọc
- `tài-liệu/chức-năng/FEATURE-004.md`
- `tài-liệu/giao-diện/screens-flows.md` (S-05)
- `tài-liệu/kiến-trúc/realtime-events.md`
- `tài-liệu/kiến-trúc/api-contract.md` (`GET /api/sessions/{id}`)

## Skill
implement-feature

## Acceptance Criteria
- AC-004-01…AC-004-04; phần hiển thị 2 đơn của AC-003-06.

## Dependencies
TASK-011

## Ràng buộc
Không tin sự kiện bị nhỡ — luôn refetch khi kết nối lại.

## Validation
Playwright 2 trình duyệt (khách + quầy); test rớt mạng 30 s.

## Đầu ra
UI S-05, endpoint phía khách, test. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
Q-004b (nhãn trạng thái).
