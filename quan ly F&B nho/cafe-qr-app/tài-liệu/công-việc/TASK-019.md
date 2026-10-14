# TASK-019 — E2E Playwright, k6 kịch bản tranh chấp kho, đo NFR-001
Status: READY_FOR_REVIEW (14/10/2026) — E2E Playwright 14/14, ép tải §13.2 10/10 vòng, NFR-001 p95 165 ms trên máy local; NOT_RUN: đo trên Wi-Fi quán, k6
Feature: NFR-001, NFR-002
Story: Word mục 4 / III.2 (chỉ số hiệu năng)
Owner: Sáng · Tuần: 6–7

## Mục tiêu
Có bằng chứng định lượng cho hai chỉ tiêu mà Word yêu cầu.

## Phạm vi và phần chưa làm
Trong:
- Playwright luồng khách + quầy (2 trình duyệt) và kiểm reconnect.
- k6 kịch bản 13.2 đầy đủ (và 13.4 nếu Q-013 đã chốt).
- Đo NFR-001: p95 trên ≥ 30 lần.

Ngoài:
- Sửa tính năng (ghi lỗi và giao lại task tương ứng).

## Context cần đọc
- `tài-liệu/chất-lượng/test-strategy.md`
- `tài-liệu/sản-phẩm/overview.md` (NFR)
- `tài-liệu/chức-năng/FEATURE-003.md`
- `tài-liệu/chức-năng/FEATURE-007.md`

## Skill
verify-change

## Acceptance Criteria
- NFR-002: 100 % kịch bản pass qua 10 lần lặp với seed ngẫu nhiên.
- NFR-001: p95 < 2 s.
- Có báo cáo test kèm số liệu thô.

## Dependencies
TASK-016, TASK-018

## Ràng buộc
Không nới constraint hay giảm số luồng để test pass.

## Validation
Chạy trên staging và trên SQL Server thật; lưu kết quả k6/Playwright.

## Đầu ra
`kiểm-thử/e2e`, `kiểm-thử/load`, báo cáo test. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
—
