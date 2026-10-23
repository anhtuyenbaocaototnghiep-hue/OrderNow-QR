# FEATURE-037 — Chiến dịch theo phân khúc

> **Nguồn:** skill `advanced-features` §4 F-037. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-29.

- **Status:** CONFIRMED (ADR-006 D-29) · Triển khai: READY_FOR_REVIEW (18/10/2026)
- **Actor:** ADMIN.
- **Màn hình:**
  - **Quản lý → Tích điểm, voucher & chiến dịch → Phân khúc & chiến dịch:**
    - phân khúc: điều kiện + "Xem trước số người" (số người, số bị loại vì từ chối nhận tin, số vừa nhận tin, 20 người mẫu đã che);
    - chiến dịch: nội dung có `{name}` `{voucher}` `{expires}`, voucher riêng, hẹn giờ; nút "Chạy ngay";
    - "Kết quả" (hiệu quả + danh sách đã che + "Tải danh sách CSV").
  - **Quản lý → Hội viên → hồ sơ:** "Khách từ chối nhận tin chiến dịch (opt-out)".
- **Dữ liệu:** migration `0031_chien_dich.sql`:
  - `Members.OptOut`, `LastContactedAt`;
  - `Segments(Name, RuleJson ISJSON)`;
  - `Campaigns(SegmentId, Channel EXPORT|ZALO_OA|SMS, MessageTemplate, VoucherPercent/Days/MinOrder, ScheduledAt, Status DRAFT|SCHEDULED|RUNNING|DONE|FAILED, StartedAt, FinishedAt, Error)`;
  - `CampaignDeliveries(CampaignId, MemberId UNIQUE cặp, VoucherId, Status SENT|EXPORTED|SKIPPED|FAILED, SentAt, Error)`;
  - `Vouchers.CampaignId` FK;
  - Setting `campaign.min_days_between = 7`.
- **Mã nguồn:**
  - `channels/zaloOa.js`: interface `send({ phone, text }) → { ok, error }`; bật khi có `ZALO_OA_TOKEN` (+ `ZALO_OA_URL`);
  - job `campaigns-due`: mỗi 5 phút.

## Quy tắc (D-29)

1. **Phân khúc:** AND các điều kiện `tierIn`, `lastVisitDaysGte/Lte`, `visitCountGte/Lte`, `totalSpentGte`, `birthdayMonth`, `hasPointsGte`.
   - Ngày ghé cuối = `LastVisitAt` (chưa ghé thì lấy ngày đăng ký).
   - Luôn loại hội viên ngừng / đã ẩn danh / **OptOut**.
   - Điều kiện lạ → 400.
2. **Chạy chiến dịch** (ngay hoặc job khi tới giờ hẹn):
   - một tiến trình giành quyền chạy (`DRAFT/SCHEDULED → RUNNING`); chạy lại → 409 `CAMPAIGN_NOT_RUNNABLE`;
   - mỗi người một bản ghi gửi (unique) — chạy lại không gửi trùng;
   - người đã nhận tin trong 7 ngày → `SKIPPED` kèm lý do, không voucher;
   - có voucher → mỗi người một voucher riêng (`CD…`, Source `CAMPAIGN`);
   - gửi được → `LastContactedAt`.
3. **Kênh:**
   - `EXPORT` (mặc định): ghi `EXPORTED`, quản lý tải CSV.
     SĐT đầy đủ chỉ có trong file tải về; mỗi lần tải ghi nhật ký thao tác `campaigns.export`. Màn hình luôn che tên / SĐT.
   - `ZALO_OA`: chỉ khi có token (400 `CHANNEL_NOT_CONFIGURED`); gửi lỗi → `FAILED` (không voucher).
   - `SMS`: chưa hỗ trợ (400 `CHANNEL_NOT_SUPPORTED`).
4. **Hiệu quả:**
   - số voucher của chiến dịch đã dùng;
   - doanh thu các lượt thu dùng voucher đó;
   - số khách có lượt thu trong 14 ngày sau khi nhận tin.

## API (ADMIN)

| Method & path | Ghi chú |
| --- | --- |
| `GET/POST /api/admin/segments` · `PUT/DELETE …/{id}` | `{ name, rule }`; đang được chiến dịch dùng → 409 `IN_USE` |
| `POST /api/admin/segments/preview { rule }` | `{ count, optedOut, recentlyContacted, sample[] }` (đã che) |
| `GET/POST /api/admin/campaigns` · `GET/PUT/DELETE …/{id}` | sửa / xóa chỉ khi chưa chạy (409 `CAMPAIGN_LOCKED`) |
| `POST /api/admin/campaigns/{id}/run` | → `{ …, result: { delivered, skipped, failed } }` |
| `GET /api/admin/campaigns/{id}/export.csv` | CSV UTF-8 BOM: Họ tên, SĐT, Hạng, Mã voucher, Hạn dùng, Nội dung |
| `PATCH /api/admin/members/{id}/opt-out { optOut }` | |

## Acceptance Criteria

- AC-037-01: Hội viên mẫu: a (Thân thiết, 40 ngày chưa ghé), b (Thân thiết, 45 ngày), "recent" (Thân thiết, 5 ngày), "member" (hạng Hội viên, 40 ngày), "opt" (Thân thiết, 40 ngày, từ chối nhận tin) → phân khúc "Thân thiết, ≥ 30 ngày chưa ghé" trả đúng {a, b}: số người 2, bị loại vì từ chối nhận tin 1, danh sách mẫu đã che SĐT; điều kiện lạ → 400. _(viết lại cho kiểm được — TASK-057, 20/10/2026)_
- AC-037-02: Chạy chiến dịch kênh xuất danh sách (`EXPORT`) cho phân khúc 2 người, voucher 15 % hạn 7 ngày → kết quả {gửi 2, bỏ qua 0, lỗi 0}, trạng thái `DONE`, đúng 2 voucher gắn với 2 người đó; CSV = 1 dòng tiêu đề + 2 dòng, có SĐT đầy đủ và nội dung "giảm 15%"; đúng 1 dòng nhật ký `campaigns.export`. _(viết lại cho kiểm được — TASK-057, 20/10/2026)_
- AC-037-03: Gửi lại trong 7 ngày → bỏ qua và ghi lý do.
- AC-037-04: Zalo OA chưa cấu hình → 400; kênh giả: lỗi từng người ghi FAILED.
- AC-037-05: Chiến dịch hẹn giờ → trạng thái `SCHEDULED`; khi tới giờ, job `campaigns-due` chạy → `DONE`; một người nhận dùng voucher ở 1 lượt thu → hiệu quả = {voucher đã dùng 1, doanh thu = số phải thu của lượt đó, khách quay lại trong 14 ngày 1}. _(viết lại cho kiểm được — TASK-057, 20/10/2026)_
- AC-037-06: Chạy lại chiến dịch đã chạy xong → 409 `CAMPAIGN_NOT_RUNNABLE`. _(bổ sung — TASK-057, 20/10/2026)_
- AC-037-07: Tạo chiến dịch kênh SMS → 400 `CHANNEL_NOT_SUPPORTED`. _(bổ sung — TASK-057, 20/10/2026)_
- AC-037-08: Sửa hoặc xóa chiến dịch đã chạy → 409 `CAMPAIGN_LOCKED`; xóa phân khúc đang được chiến dịch dùng → 409 `IN_USE`. _(bổ sung — TASK-057, 20/10/2026)_

## Bằng chứng

- `tests/loyalty.test.js` → "Chiến dịch theo phân khúc (F-037)": 6 test.
- E2E "CRM: …" (chạy chiến dịch xuất danh sách).
