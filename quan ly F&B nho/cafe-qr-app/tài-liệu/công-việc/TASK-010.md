# TASK-010 — Gửi đơn hàng dine-in với kiểm kho
Status: READY_FOR_REVIEW (14/10/2026). Bằng chứng: `npm test` 39/39, `npm run test:e2e` 14/14, `npm run load` 10/10 (14/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-003
Story: US2, US10 (demo.docx)
Owner: Nhật Anh + Tuyến · Tuần: 3–4

## Mục tiêu
Khách trong phiên OPEN gửi được đơn hợp lệ; đơn bị từ chối khi hết nguyên liệu; không bao giờ âm kho.

## Phạm vi và phần chưa làm
Trong: POST /api/orders, DTO validation, gọi sp_SubmitOrder, map lỗi 50002 → OUT_OF_STOCK kèm tên món,
Idempotency-Key, UI S-03 xử lý lỗi, phát `order.created` (nếu TASK-011 xong; nếu chưa → để hook rỗng và ghi rõ).
Ngoài: thanh toán, theo dõi đơn, take-away.

## Context cần đọc
- tài-liệu/chức-năng/FEATURE-003.md (AC-003-01…06)
- BR-001, BR-009, BR-010 (theo ADR-001 khi đã chốt Q-001), BR-011, BR-012, BR-015, BR-020 trong tài-liệu/nghiệp-vụ/business-rules.md
- tài-liệu/kiến-trúc/data-model.md (phần SP + ghi chú đối chiếu), api-contract.md (POST /api/orders), system-overview.md (tầng)
- tài-liệu/giao-diện/screens-flows.md S-03

## Skill
implement-feature; change-database nếu phải sửa SP.

## Acceptance Criteria
AC-003-01 … AC-003-05. AC-003-06: phần API (đơn thứ hai trong cùng phiên → 201) nghiệm thu ở task này; phần hiển thị trên S-05 nghiệm thu ở TASK-014.

## Dependencies
TASK-004 (SP + test), TASK-008 (phiên), TASK-009 (giỏ).

## Ràng buộc
Không đổi contract mã lỗi; không kiểm kho ở tầng app (chỉ SP); giá lấy từ DB.

## Validation
Integration test endpoint (happy, OUT_OF_STOCK, 403 phiên lạ, giá giả); concurrency 20 phiên/1 suất trên SQL Server thật;
E2E S-02→S-03 gửi đơn thành công và bị từ chối. Lệnh: xem tài-liệu/vận-hành/local-development.md.

## Đầu ra
Code API + FE, tests, cập nhật api-contract nếu có chi tiết mới, báo cáo bàn giao (tài-liệu/chất-lượng/test-strategy.md#ban-giao).

## Câu hỏi hoặc blocker
Q-005 (từ chối cả đơn) — đã chốt trong ADR-003? Nếu chưa: triển khai theo đề xuất và ghi rõ.
Q-013 (khóa phiên trong sp_SubmitOrder; gọi thêm sau khi đã gọi thanh toán) — phải có quyết định trước khi làm.
