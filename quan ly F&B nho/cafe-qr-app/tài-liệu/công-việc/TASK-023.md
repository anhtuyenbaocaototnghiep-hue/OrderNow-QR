# TASK-023 — Hội viên SĐT + họ tên (tra cứu, đăng ký, chiết khấu khi thu tiền, quản lý, ẩn danh)
Status: READY_FOR_REVIEW (16/10/2026). Bằng chứng: `npm test` 98/98, `npm run test:e2e` 20/20, `npm run load` 10/10 (16/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-014 (AC-014-01…06)
Nguồn: skill `extend-features` (chủ dự án giao 16/10/2026) · Quyết định: ADR-005 · Plan: `tài-liệu/kế-hoạch/TASK-023-033-plan.md`

## Mục tiêu
Theo FEATURE-014 — mở rộng hệ thống đang chạy, không phá luồng lõi (đặt món → tiếp nhận → hoàn tất/trừ kho → gọi thanh toán → thu tiền → in bill; bán mang đi) và giữ bất biến kho/tiền.

## Phạm vi
- Migration: 0003_hoi_vien.sql
- SP / backend / UI / test theo đặc tả feature; số tiền tính bằng `src/pricing/pricing.js`.

## Phụ thuộc
—

## Validation
members.test.js, pricing.test.js, E2E "hội viên…"; chạy lại toàn bộ test cũ (`npm test`, `npm run test:e2e`, `npm run load`) — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ; bàn giao: `tài-liệu/chất-lượng/handover-2026-10-16.md`.
