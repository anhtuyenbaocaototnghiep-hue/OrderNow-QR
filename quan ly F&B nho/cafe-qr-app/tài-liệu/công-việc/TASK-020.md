# TASK-020 — Chạy thử tại quán: máy in thật, Wi-Fi quán, dữ liệu menu/BOM thật
Status: TODO — cần máy in nhiệt thật và Wi-Fi quán
Feature: —
Story: Word II (chạy thử tại quán thực tế)
Owner: Cả nhóm · Tuần: 7

## Mục tiêu
Hệ thống chạy ổn định ở quán thử nghiệm.

## Phạm vi và phần chưa làm
Trong:
- In thật khổ 58/80 mm; đo NFR-001 trên Wi-Fi của quán; nhập menu/BOM thật; sửa lỗi phát sinh.

Ngoài:
- Tính năng mới.

## Context cần đọc
- `tài-liệu/chất-lượng/test-strategy.md`
- `tài-liệu/vận-hành/local-development.md`

## Skill
verify-change

## Acceptance Criteria
- Mốc cuối tuần 7: chạy tại quán với máy in thật; lỗi được ghi và xử lý hoặc chuyển backlog.

## Dependencies
TASK-019

## Ràng buộc
Không dùng dữ liệu thật cho test tải.

## Validation
Biên bản chạy thử (ảnh bill, số đo).

## Đầu ra
Biên bản, danh sách lỗi đã sửa. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
Q-007 (ngăn kéo tiền — chỉ ghi nhận nếu máy in hỗ trợ kick-drawer ở driver).
