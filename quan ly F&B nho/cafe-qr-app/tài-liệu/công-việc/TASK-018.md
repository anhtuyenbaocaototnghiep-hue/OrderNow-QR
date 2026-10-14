# TASK-018 — Deploy staging (FE + API + SQL Server), HTTPS, seed staging
Status: BLOCKED — chờ Q-008 (hosting online). Hệ thống đã chạy được local/LAN (`npm start`)
Feature: —
Story: Word III.2, IV.2 (deploy online)
Owner: Nhật Anh · Tuần: 6

## Mục tiêu
Luồng đầy đủ chạy được trên môi trường online để demo và test tải.

## Phạm vi và phần chưa làm
Trong:
- Deploy theo quyết định Q-008; HTTPS; CORS chỉ cho domain FE; biến môi trường; `PUBLIC_BASE_URL` dùng cho QR; seed dữ liệu giả.
- Tùy chọn: bản chạy trong LAN của quán.

Ngoài:
- Dữ liệu thật.

## Context cần đọc
- `tài-liệu/vận-hành/local-development.md`
- `tài-liệu/kiến-trúc/tech-stack.md`
- `tài-liệu/sản-phẩm/overview.md`

## Skill
—

## Acceptance Criteria
- Mốc cuối tuần 6: trên staging chạy được gọi thanh toán → thu tiền → in bill, và bán mang đi.

## Dependencies
TASK-015

## Ràng buộc
Không đưa secret vào repo; backup DB nếu có dữ liệu thử nghiệm.

## Validation
Smoke test thủ công theo checklist; ghi quy trình deploy vào `tài-liệu/vận-hành/local-development.md`.

## Đầu ra
Môi trường staging, tài liệu deploy. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
Q-008.
