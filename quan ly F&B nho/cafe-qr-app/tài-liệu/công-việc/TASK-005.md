# TASK-005 — Auth: đăng nhập, JWT, guard STAFF/ADMIN, cookie khách
Status: READY_FOR_REVIEW (14/10/2026). Bằng chứng: `npm test` 39/39, `npm run test:e2e` 14/14, `npm run load` 10/10 (14/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-009 (AC-009-01, AC-009-03, AC-009-04)
Story: US8 bản 2
Owner: Nhật Anh · Tuần: 2

## Mục tiêu
Nhân viên đăng nhập được; endpoint quầy/admin được bảo vệ đúng vai trò; khách có cookie định danh.

## Phạm vi và phần chưa làm
Trong:
- `POST /api/auth/login`, `GET /api/auth/me`; JWT (thời hạn theo tech-stack, đang PROPOSED).
- Guard STAFF/ADMIN (ADMIN kế thừa STAFF — PROPOSED); kiểm `IsActive` ở mỗi request (BR-017).
- Cấp cookie `cf_client` cho khách khi chưa có; seed admin từ biến môi trường; rate limit cho login (PROPOSED).
- Test ma trận quyền cơ bản.

Ngoài:
- UI quản lý tài khoản (TASK-017).

## Context cần đọc
- `tài-liệu/chức-năng/FEATURE-009.md`
- `tài-liệu/nghiệp-vụ/roles-permissions.md`
- `tài-liệu/nghiệp-vụ/business-rules.md` (BR-004, BR-017)
- `tài-liệu/kiến-trúc/api-contract.md` (phần Quầy: auth)
- `tài-liệu/vận-hành/local-development.md` (biến môi trường)

## Skill
implement-feature

## Acceptance Criteria
- AC-009-01 phần đăng nhập và 403 khi gọi API admin (tài khoản tạo bằng seed/SQL nếu chưa có UI).
- AC-009-03.
- AC-009-04.

## Dependencies
TASK-002

## Ràng buộc
Kiểm quyền ở server; không log mật khẩu/token; secret lấy từ env.

## Validation
Integration test login / tài khoản bị khóa / guard; ma trận actor × endpoint cho các endpoint đã có.

## Đầu ra
Module `auth`, test, api-contract cập nhật nếu có chi tiết mới. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
—
