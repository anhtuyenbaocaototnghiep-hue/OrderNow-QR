# TASK-086 — Mừng khách quay lại
Status: READY_FOR_REVIEW (04/11/2026)
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

## Kết quả thực chạy (04/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **407/407 PASS** (40 file; thêm `winback.test.js` 5 test — AC-069-01…05; `member-overview.test.js` đổi khách "vắng" 40 → 50 ngày theo mốc mới; mọi test F-067 / voucher / thu tiền cũ vẫn xanh) |
| `npm run test:e2e` | **63/63 PASS** (thêm 1 E2E — AC-069-06; hội viên mẫu vắng 52 ngày trong `kịch-bản/e2e-server.js`) |
| `npm run trace -- --check` | 155 US, 422 AC — PASS 422, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| Chụp màn hình 1366 / 390 px (CafeQrTest) | Khung quầy, điện thoại khách, tab quản lý: không cuộn ngang ở 390 px. Đã sửa theo ảnh: nhãn ô cài đặt quá dài làm lệch hàng |

Chưa có review G3 độc lập; chưa gộp `main`, chưa đẩy GitHub — chờ chủ dự án.
