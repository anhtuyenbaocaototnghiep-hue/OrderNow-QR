# TASK-008 — Khách: quét QR, tách/gộp phiên (API + S-01)
Status: READY_FOR_REVIEW (14/10/2026). Bằng chứng: `npm test` 39/39, `npm run test:e2e` 14/14, `npm run load` 10/10 (14/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-001 (AC-001-01…05)
Story: US1 (2 bản), User flow 1–3
Owner: Nhật Anh + Tuyến · Tuần: 3

## Mục tiêu
Khách quét QR được gắn vào đúng phiên trên đúng bàn, có lựa chọn Gộp chung / Cá nhân.

## Phạm vi và phần chưa làm
Trong:
- `POST /api/sessions/scan`, `POST /api/sessions`, `POST /api/sessions/{id}/join`; bảng `SessionClients`; kiểm ownership qua cookie.
- UI S-01: hộp thoại Gộp/Cá nhân; liệt kê khi có nhiều phiên mở (PROPOSED); nhận 409 `SESSION_CLOSED` thì tự tạo phiên mới và báo khách.

Ngoài:
- Menu và giỏ (TASK-009).

## Context cần đọc
- `tài-liệu/chức-năng/FEATURE-001.md`
- `tài-liệu/nghiệp-vụ/business-rules.md` (BR-008)
- `tài-liệu/nghiệp-vụ/workflows-states.md` (trạng thái phiên)
- `tài-liệu/kiến-trúc/api-contract.md` (phần Khách)
- `tài-liệu/giao-diện/screens-flows.md` (S-01)

## Skill
implement-feature

## Acceptance Criteria
- AC-001-01…AC-001-05.

## Dependencies
TASK-003 (và cơ chế cookie của TASK-005)

## Ràng buộc
Không lộ chi tiết đơn/ghi chú của phiên khác ở bước OCCUPIED.

## Validation
Integration test API; E2E 2 trình duyệt cho Gộp và Cá nhân.

## Đầu ra
Module `sessions` (phần quét/gộp), UI S-01, test. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
Q-012 ("thấy chung" là thấy giỏ hay thấy đơn).
