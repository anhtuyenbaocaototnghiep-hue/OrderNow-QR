# TASK-006 — Admin: danh mục, món (availability), bàn + sinh QR + trang in QR
Status: READY_FOR_REVIEW (14/10/2026). Bằng chứng: `npm test` 39/39, `npm run test:e2e` 14/14, `npm run load` 10/10 (14/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-010 (AC-010-01…05)
Story: Actor 1.3
Owner: Nhật Anh (API) + Tuyến (UI) · Tuần: 2–3

## Mục tiêu
Admin cấu hình được menu và bàn; mỗi bàn có QR quét vào đúng bàn.

## Phạm vi và phần chưa làm
Trong:
- API quản trị: categories, menu-items, `PATCH …/availability` (phát `menu.availability_changed`; nếu TASK-011 chưa xong thì để publisher rỗng và ghi rõ).
- Tables: tạo/sửa, `regenerate-qr`, `qr.png` (thư viện sinh QR, DEC-008).
- UI S-21, S-22 và trang in lưới QR.

Ngoài:
- BOM và kho (TASK-007).

## Context cần đọc
- `tài-liệu/chức-năng/FEATURE-010.md`
- `tài-liệu/kiến-trúc/api-contract.md` (phần Quản trị)
- `tài-liệu/giao-diện/screens-flows.md` (S-21, S-22)
- `tài-liệu/kiến-trúc/data-model.md`

## Skill
implement-feature

## Acceptance Criteria
- AC-010-01…AC-010-05. Phần realtime của AC-010-02 hoàn thiện cùng TASK-011.

## Dependencies
TASK-003, TASK-005

## Ràng buộc
Không xóa cứng món (dùng `IsActive`); `qrToken` ngẫu nhiên 32 ký tự, không dùng `TableId` trong URL.

## Validation
Integration test API (gồm STAFF → 403); kiểm thủ công QR quét được trên điện thoại.

## Đầu ra
API + UI admin menu/bàn, test. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
—
