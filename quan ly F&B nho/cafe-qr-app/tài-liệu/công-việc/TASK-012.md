# TASK-012 — Dashboard quầy: đơn realtime, âm thanh, mất kết nối, Tiếp nhận, Hủy, bàn đang phục vụ
Status: READY_FOR_REVIEW (14/10/2026). Bằng chứng: `npm test` 39/39, `npm run test:e2e` 14/14, `npm run load` 10/10 (14/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-007 (AC-007-01, 02, 05, 07); Q-010
Story: US5–US6 bản 1; US4 bản 2
Owner: Tuyến (UI) + Nhật Anh (API) · Tuần: 4

## Mục tiêu
Nhân viên thấy đơn mới ngay lập tức, tiếp nhận hoặc hủy được, và không bỏ sót đơn khi rớt mạng.

## Phạm vi và phần chưa làm
Trong:
- `GET /api/orders?status=&since=`, `GET /api/sessions?status=`, `POST /api/orders/{id}/accept`, `POST /api/orders/{id}/cancel` (`sp_CancelOrder`).
- UI S-10: 3 cột, âm thanh "Ting", icon kết nối, banner "Có đơn hàng bị trễ", panel Bàn đang phục vụ; drawer S-11.

Ngoài:
- Hoàn tất (TASK-013); dải Gọi thanh toán và thu tiền (TASK-015); Bán mang đi (TASK-016).

## Context cần đọc
- `tài-liệu/chức-năng/FEATURE-007.md`
- `tài-liệu/nghiệp-vụ/workflows-states.md` (máy trạng thái đơn)
- `tài-liệu/kiến-trúc/api-contract.md` (phần Quầy)
- `tài-liệu/kiến-trúc/realtime-events.md`
- `tài-liệu/giao-diện/screens-flows.md` (S-10, S-11)

## Skill
implement-feature

## Acceptance Criteria
- AC-007-01, AC-007-02, AC-007-05, AC-007-07.

## Dependencies
TASK-011

## Ràng buộc
Kiểm quyền ở server; `accept` là `UPDATE … WHERE Status = 'PENDING'` có điều kiện.

## Validation
Integration test API; Playwright: tắt mạng (route abort) rồi bật lại → thấy đủ đơn và banner.

## Đầu ra
UI S-10/S-11, API accept/cancel/list, test. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
Q-004b (có nút Tiếp nhận không), Q-010 (hủy), Q-017 (KDS riêng).
