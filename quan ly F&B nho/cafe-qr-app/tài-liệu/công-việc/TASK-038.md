# TASK-038 — Chia bill theo người trong phiên gộp
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-026 (AC-026-01…06)
Nguồn: skill `advanced-features` §4 F-026 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 D-17 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Nhóm khách gộp chung một bàn trả riêng được: mỗi điện thoại nhận các dòng món của mình, quầy thu từng phần, in bill riêng; phần cuối thu xong thì đóng bàn. Tiền mỗi phần tính bằng cùng bộ `pricing` với thu cả bàn; giữ BR-019 và mọi bất biến tiền.

## Phạm vi
- Migration `0018_chia_bill.sql` (`SessionSplits`; `OrderItems.SplitId/PaidAt/PaymentId`; `Payments.SplitId`; unique `UX_Payments_Session` chỉ cho phiên không chia, `UX_Payments_Split` mỗi phần một lượt thu).
- SP:
  - mới `sp_SettleSplit` (phần cuối tự gộp dòng Chung, thiếu → `50111 COMMON_REQUIRED`);
  - `sp_SettleSession` từ chối phiên đã chia (`50113 SESSION_HAS_SPLITS`) và ghi `PaidAt`/`PaymentId` lên dòng;
  - `sp_RefundPayment`: lượt thu của một phần chỉ hoàn tiền, không hủy đơn.
- Backend:
  - `splitService` / `splitsRepo`; `pricing.partOrders` (khuyến mãi đơn phân bổ theo dòng) → `settleTotals`;
  - route `GET`/`POST /api/sessions/:id/splits`, `PUT /api/sessions/:id/items/:orderItemId/split`, `POST /api/splits/:id/settle/preview`, `POST /api/splits/:id/settle`, `POST /api/sessions/:id/splits/merge`, `GET /api/payments/:id/receipt`;
  - realtime `session.split_changed`.
- UI:
  - theo dõi đơn (khách): nút "🧾 Chia bill theo người", Của tôi / Bỏ, thẻ "Bàn đang chia bill";
  - quầy: "🧾 Chia N phần · đã thu X"; drawer Thu tiền theo phần (Thu phần này, + Thêm phần, Thu chung, In lại);
  - bill từng phần `/pos/payments/:id/receipt`.

## Phụ thuộc
TASK-015 (thu tiền), TASK-023 (hội viên), TASK-025 (`pricing`), TASK-030 (giảm tay), TASK-033 (hoàn tiền).

## Validation
`phase4-unit.test.js` → "Chia khuyến mãi đơn theo dòng (F-026)" (2 test), `phase4.test.js` → "Chia bill theo người (F-026)" (4 test, gồm thu đồng thời cùng một phần); bất biến `helpers/testDb.js` (`SPLIT_SESSION_MISMATCH`, `SPLIT_UNPAID_LINE`, `LINE_PAYMENT_OTHER_SESSION`, `SPLIT_PAID_NO_PAYMENT`); E2E "chia bill: 2 khách gộp bàn…"; chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-026, ADR-006); hướng dẫn `chức-năng-mới/15-chia-bill.md`.
