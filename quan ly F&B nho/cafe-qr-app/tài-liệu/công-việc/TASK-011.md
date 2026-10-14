# TASK-011 — Hạ tầng realtime: hub, room, publisher sau commit, client reconnect + refetch
Status: READY_FOR_REVIEW (14/10/2026). Bằng chứng: `npm test` 39/39, `npm run test:e2e` 14/14, `npm run load` 10/10 (14/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: Realtime (`tài-liệu/kiến-trúc/realtime-events.md`); hỗ trợ AC-002-05, AC-004-03, AC-007-01, AC-010-02
Story: US5 (bản 1), US4 (bản 2), Module 3.1
Owner: Nhật Anh + Tuyến · Tuần: 4

## Mục tiêu
Sự kiện được phát tới đúng nhóm client sau khi commit, và client luôn tự đồng bộ lại khi kết nối lại.

## Phạm vi và phần chưa làm
Trong:
- Hub Socket.io hoặc SignalR (theo ADR-002); room `staff` (yêu cầu JWT), `session:{id}` (cookie phải thuộc phiên), `public`.
- Interface `RealtimePublisher` được service gọi **sau commit**; mọi payload có `emittedAt`.
- Hook phía client: kết nối/kết nối lại → fetch ảnh chụp trước rồi mới áp sự kiện; bỏ qua sự kiện cũ hơn dữ liệu đang có.
- Nối `order.created` (TASK-010) và `menu.availability_changed` (TASK-006).

Ngoài:
- UI dashboard (TASK-012), màn hình theo dõi đơn (TASK-014).

## Context cần đọc
- `tài-liệu/kiến-trúc/realtime-events.md`
- `tài-liệu/kiến-trúc/system-overview.md`
- `tài-liệu/chức-năng/FEATURE-004.md`
- `tài-liệu/chức-năng/FEATURE-007.md`
- `tài-liệu/nghiệp-vụ/roles-permissions.md`

## Skill
implement-feature

## Acceptance Criteria
- AC-004-03: client của phiên khác không nhận được sự kiện.
- Join room trái phép (không JWT vào `staff`, cookie lạ vào `session:{id}`) bị từ chối.
- AC-007-01 (≤ 2 s) đo trên môi trường dev; AC-002-05 và AC-010-02 hoàn thiện.

## Dependencies
TASK-005, TASK-010

## Ràng buộc
Realtime không phải nguồn sự thật; không phát trong transaction.

## Validation
Integration test phát sự kiện sau commit; test 2 client ở 2 phiên khác nhau; đo thời gian trên dev.

## Đầu ra
Module `realtime` + hook client, realtime-events cập nhật nếu payload thay đổi. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
Q-002.
