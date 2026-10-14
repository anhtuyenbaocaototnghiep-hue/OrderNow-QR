# TASK-017 — Admin: tài khoản nhân viên (UI) và báo cáo doanh thu
Status: READY_FOR_REVIEW (14/10/2026). Bằng chứng: `npm test` 39/39, `npm run test:e2e` 14/14, `npm run load` 10/10 (14/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-009 (AC-009-02, AC-009-05), FEATURE-012 (AC-012-01…04)
Story: US8, US9 bản 2; US11 bản 1
Owner: Nhật Anh + Tuyến · Tuần: 6

## Mục tiêu
Admin quản lý được tài khoản và xem báo cáo doanh thu đúng định nghĩa.

## Phạm vi và phần chưa làm
Trong:
- API users: tạo, sửa, reset mật khẩu, khóa/mở; UI S-20.
- `GET /api/admin/reports/revenue`, `GET /api/admin/payments` (và `GET /api/admin/orders` nếu Q-014 được chốt); UI S-25 (bộ lọc, KPI, biểu đồ, top món, sắp hết, thu tiền theo nhân viên).

Ngoài:
- Lọc "theo ca" (làm sau, Q-014).

## Context cần đọc
- `tài-liệu/chức-năng/FEATURE-009.md`
- `tài-liệu/chức-năng/FEATURE-012.md`
- `tài-liệu/nghiệp-vụ/business-rules.md` (BR-004, BR-005, BR-016, BR-017)
- `tài-liệu/kiến-trúc/api-contract.md` (phần Quản trị)
- `tài-liệu/giao-diện/screens-flows.md` (S-20, S-25)

## Skill
implement-feature

## Acceptance Criteria
- AC-009-02, AC-009-05.
- AC-012-01…AC-012-04 (đối chiếu với bộ seed đơn mẫu).

## Dependencies
TASK-005, TASK-013

## Ràng buộc
Doanh thu tính ở server theo định nghĩa ở FEATURE-012 (theo `PaidAt` — PROPOSED); múi giờ `Asia/Ho_Chi_Minh`.

## Validation
Integration test báo cáo với dữ liệu seed cố định; test quyền STAFF → 403.

## Đầu ra
API + UI tài khoản và báo cáo, test. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
Q-014; định nghĩa "ngày doanh thu".
