# TASK-000 — Chốt câu hỏi mở và ghi quyết định (ADR)
Status: DONE (14/10/2026) — ADR-000…003 đã ghi; còn mở Q-000 (người ký chốt) và Q-008 (hosting)
Feature: —
Story: —
Owner: Cả nhóm (Nhật Anh điều phối) · Tuần: 1

## Mục tiêu
Mọi câu hỏi có thể làm đảo thiết kế lõi đều có quyết định được ghi thành ADR, và docs được cập nhật trạng thái theo các ADR đó.

## Phạm vi và phần chưa làm
Trong:
- Ghi D-1/D-2/D-3 thành ADR-000 — **đã xong**.
- Chốt Q-000, Q-001, Q-002, Q-004b, Q-005, Q-006 (và Q-010) → ADR-001… theo gợi ý đánh số ở `tài-liệu/quyết-định/README.md`.
- Xem xét các câu hỏi mới Q-012 → Q-018 (phát hiện khi đối chiếu Word). **Q-013 phải có quyết định trước TASK-004.**
- Cập nhật PROPOSED / NEEDS_CONFIRMATION → CONFIRMED ở feature, rule, data-model, api-contract và ghi "theo ADR-00x" tại chỗ sửa.

Ngoài:
- Viết code, tạo database.

## Context cần đọc
- `tài-liệu/open-questions.md`
- `tài-liệu/quyết-định/README.md` (mẫu ADR)
- `tài-liệu/sản-phẩm/overview.md`
- `tài-liệu/nghiệp-vụ/business-rules.md`
- `tài-liệu/kiến-trúc/data-model.md` (phần SP, phương án A/B/C)

## Skill
—

## Acceptance Criteria
- Q-000, Q-001, Q-002, Q-004b, Q-005, Q-006 có ADR trạng thái ACCEPTED.
- Q-013 có quyết định (cho/không cho gọi thêm sau khi gọi thanh toán; đưa kiểm tra phiên vào SP).
- Mọi chỗ còn ghi NEEDS_CONFIRMATION đều thuộc một Q được cố ý để mở, có ghi lý do.
- Checklist "Trước khi giao agent task đầu tiên" trong `tài-liệu/công-việc/README.md` được đánh dấu.

## Dependencies
—

## Ràng buộc
Agent chỉ soạn ADR từ quyết định nhóm đã đưa ra; không tự chọn phương án (rules: "không tự chọn cách hiểu").

## Validation
Review chéo: `grep -rn NEEDS_CONFIRMATION tài-liệu/` và đối chiếu từng kết quả với danh sách Q còn mở.

## Đầu ra
`tài-liệu/quyết-định/` (ADR-001…); docs bị ảnh hưởng được cập nhật trạng thái. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
Q-000: ai là người ký chốt cuối.
