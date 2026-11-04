# TASK-086 — Mừng khách quay lại
Status: IN_PROGRESS (04/11/2026)
Quyết định: [ADR-027](../quyết-định/ADR-027-mung-khach-quay-lai.md) D-107…D-111 · Feature: [FEATURE-069](../chức-năng/FEATURE-069.md) · BR-106
Module: MOD-LOYALTY, MOD-BILLING · Màn hình: SCR-13 / SCR-14, SCR-03 / SCR-05, SCR-12, SCR-40, SCR-26
Nguồn: chủ dự án 04/11/2026 — "tiến hành làm và khi làm xong thì làm ra skill .md" (Mừng khách quay lại + Ly treo). · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-086-mung-khach-quay-lai` chồng lên `task/TASK-085-thu-thap-ngay-sinh` (chưa gộp `main`) · Kế hoạch: [TASK-086-plan.md](../kế-hoạch/TASK-086-plan.md)

## Mục tiêu
Hội viên lâu không ghé quay lại thì quầy nhận ra ngay, điện thoại khách có lời chào, quà nhỏ tự trừ một lần; chủ quán biết quà có giữ chân được khách không.

## Phạm vi
1. Migration 0046 (nguồn `WINBACK`, bảng `WinbackGifts`).
2. Máy chủ: `domain/winback.js`, `winbackRepo`, `winbackService`; `loyaltyService` (trạng thái, tự áp sau quà sinh nhật), `billingService` (`skipWinback`, `winbackApplied`), nhãn "Quà quay lại"; `GET / PUT /api/admin/winback`; bộ lọc "Lâu chưa quay lại" dùng `winback.after_days`.
3. Giao diện: dải ở khung thu tiền, lời chào ở ô hội viên / Thẻ thành viên, tab "Mừng khách quay lại", nhãn nguồn voucher.
4. Test integration + E2E (hội viên mẫu vắng 52 ngày trong dữ liệu E2E); tài liệu; skill `mung-khach-quay-lai`.

## Không được sửa
Luật quà sinh nhật (BR-104) và thứ tự ưu tiên của nó, quy tắc voucher F-038, `sp_Loyalty`, `sp_ApplyMemberPayment`.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).
