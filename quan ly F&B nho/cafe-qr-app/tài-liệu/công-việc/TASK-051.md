# TASK-051 — Chiến dịch theo phân khúc
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-037 (AC-037-01…05)
Nguồn: skill `advanced-features` §4 F-037 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 D-29 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Quản lý lọc hội viên theo điều kiện (hạng, lâu chưa ghé, số lượt, tổng chi, sinh nhật, điểm), tạo chiến dịch kèm voucher riêng từng người, chạy ngay hoặc hẹn giờ; xuất danh sách CSV (mặc định) hoặc gửi Zalo OA khi có token. Tôn trọng opt-out, tối đa 1 tin / 7 ngày / hội viên; đo hiệu quả.

## Phạm vi
- Migration `0031_chien_dich.sql` (`Members.OptOut/LastContactedAt`, `Segments`, `Campaigns`, `CampaignDeliveries` — unique cặp chiến dịch × hội viên; `Vouchers.CampaignId`; Setting `campaign.min_days_between = 7`).
- Backend:
  - `campaignService` / `campaignRepo` (một tiến trình giành quyền chạy, chạy lại → `409 CAMPAIGN_NOT_RUNNABLE`; người vừa nhận tin → `SKIPPED` có lý do);
  - kênh: `EXPORT` (CSV có SĐT đầy đủ, mỗi lần tải ghi nhật ký `campaigns.export`), `ZALO_OA` qua `src/channels/zaloOa.js` khi có `ZALO_OA_TOKEN` (chưa có → `400 CHANNEL_NOT_CONFIGURED`), `SMS` chưa hỗ trợ;
  - route `/api/admin/segments` (+ `preview`), `/api/admin/campaigns` (+ `run`, `export.csv`), `PATCH /api/admin/members/:id/opt-out`.
- Job `campaigns-due` mỗi 5 phút (chạy chiến dịch đã hẹn giờ).
- UI: trang Tích điểm, voucher & chiến dịch → tab "Phân khúc & chiến dịch" (Xem trước số người, Chạy ngay, Kết quả, Tải danh sách CSV); hồ sơ hội viên: ô opt-out.

## Phụ thuộc
TASK-047 (nhật ký thao tác), TASK-050 (voucher), TASK-037 (bộ lập lịch).

## Validation
`loyalty.test.js` → "Chiến dịch theo phân khúc (F-037)" (6 test, gồm kênh Zalo giả lập và hẹn giờ); E2E "CRM: …" (quản lý chạy chiến dịch xuất danh sách); chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-037, ADR-006); hướng dẫn `chức-năng-mới/22-chiến-dịch.md`.
