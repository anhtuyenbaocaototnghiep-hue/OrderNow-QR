# TASK-021 — Hoàn thiện tài liệu đồ án (xuất từ tài-liệu/)
Status: TODO
Feature: —
Story: Word III.2 (bộ tài liệu đồ án)
Owner: Sáng + cả nhóm · Tuần: 7–8

## Mục tiêu
Có bộ tài liệu đồ án (đặc tả, UI/UX, sơ đồ CSDL, kết quả test) xuất từ `tài-liệu/`, không duy trì hai bản.

## Phạm vi và phần chưa làm
Trong:
- Xuất `tài-liệu/**/*.md` → `.docx` (ví dụ bằng pandoc — máy đã kiểm chưa cài); sơ đồ CSDL từ data-model; báo cáo test từ TASK-019.

Ngoài:
- Sửa tay Word song song với docs.

## Context cần đọc
- `tài-liệu/README.md` (mục Giữ Word và Markdown nhất quán)
- toàn bộ `tài-liệu/`

## Skill
—

## Acceptance Criteria
- Mốc tuần 8: tài liệu đồ án xuất từ `tài-liệu/`; báo cáo NFR-002 = 100 %.

## Dependencies
TASK-019

## Ràng buộc
`tài-liệu/` là đặc tả hiện hành; Word chỉ là bản xuất.

## Validation
Review chéo nội dung xuất so với docs.

## Đầu ra
File tài liệu đồ án. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
—
