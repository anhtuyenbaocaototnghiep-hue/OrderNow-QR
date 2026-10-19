# TASK-027 — Quản lý "Marketing & Khách hàng" + báo cáo marketing
Status: READY_FOR_REVIEW (16/10/2026). Bằng chứng: `npm test` 98/98, `npm run test:e2e` 20/20, `npm run load` 10/10 (16/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-014…017 (trang quản lý + báo cáo)
Nguồn: skill `extend-features` (chủ dự án giao 16/10/2026) · Quyết định: ADR-005 · Plan: `tài-liệu/kế-hoạch/TASK-023-033-plan.md`

## Mục tiêu
Theo FEATURE-014…017 — mở rộng hệ thống đang chạy, không phá luồng lõi (đặt món → tiếp nhận → hoàn tất/trừ kho → gọi thanh toán → thu tiền → in bill; bán mang đi) và giữ bất biến kho/tiền.

## Phạm vi
- Migration: —
- SP / backend / UI / test theo đặc tả feature; số tiền tính bằng `src/pricing/pricing.js`.

## Phụ thuộc
TASK-023…026

## Validation
operations.test.js (báo cáo marketing); chạy lại toàn bộ test cũ (`npm test`, `npm run test:e2e`, `npm run load`) — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ; bàn giao: `tài-liệu/chất-lượng/handover-2026-10-16.md`.
