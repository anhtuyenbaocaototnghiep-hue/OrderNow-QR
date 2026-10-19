# FEATURE-025 — Thời gian chờ ước tính

> **Nguồn:** skill `advanced-features` §4 F-025. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-18.

- **Status:** CONFIRMED (ADR-006 D-18) · Triển khai: READY_FOR_REVIEW (17/10/2026)
- **Actor:** khách xem; STAFF xem hàng chờ; ADMIN chỉnh thời gian pha / cài đặt bếp.
- **Màn hình:**
  - **Khách — giỏ:** "⏱ Dự kiến có món sau khoảng 8–12 phút" trước nút Gửi.
  - **Khách — theo dõi đơn:** "⏱ Món của bạn dự kiến xong sau khoảng …"; cập nhật theo sự kiện đơn.
  - **Quầy:** cột **Mới** có dòng "Hàng chờ: 6 món · khách mới chờ ~7–12 phút".
  - **Quản lý:** Thực đơn → Sửa món có ô **Thời gian pha chuẩn (giây)**.
  - **Quản lý → Lịch thực đơn & thời gian pha → tab "Thời gian pha & hàng chờ":**
    - cài đặt bếp;
    - bảng chuẩn / thực tế / số mẫu / số đang dùng;
    - nút **Tính lại thống kê**.
- **Dữ liệu:** migration `0017_thoi_gian_cho.sql`:
  - `MenuItems.PrepSeconds`;
  - `ItemPrepStats(MenuItemId, MedianSeconds, SampleCount, ComputedAt)`;
  - Settings `kitchen.base_seconds=120`, `kitchen.parallelism=1`, `eta.spread_percent=25`, `eta.default_item_seconds=180`;
  - bảng **`JobRuns`** dùng chung cho mọi job nền.
- **Job:** `prep-stats` lúc 02:00 (bộ lập lịch chung `src/jobs/scheduler.js`).

## Quy tắc (D-18)

1. **Hàng chờ** = các dòng món SINGLE của đơn `PENDING` / `PREPARING`; combo tính theo món thành phần.
2. **Thời gian chuẩn một món**, lấy theo thứ tự ưu tiên:
   1. `PrepSeconds` quản lý nhập;
   2. trung vị 30 ngày (khi có ≥ 3 mẫu);
   3. 180 giây.
3. **Công thức:**
   - ETA giỏ = `base + Σ hàng chờ ÷ parallelism + Σ giỏ`.
   - ETA phiên = `base + Σ (món đứng trước + món của phiên) ÷ parallelism`.
   - Hiển thị `[⌊ETA × 0,75⌋, ⌈ETA × 1,25⌉]` phút.
4. **Thống kê 02:00:** (`CompletedAt − AcceptedAt`) của đơn hoàn tất 30 ngày, chia đều cho số dòng món SINGLE, lấy trung vị theo món. Bỏ đơn bất thường (≤ 0 hoặc > 2 giờ). Chạy lại không nhân đôi (MERGE).
5. **Cache:** hàng chờ 10 giây, xóa ngay khi đơn được gửi / tiếp nhận / hoàn tất / hủy.

## API

| Method & path | Ghi chú |
| --- | --- |
| `GET /api/queue/eta?items=12:2,15:1` | `{ etaSeconds, minMinutes, maxMinutes, queueLength, queueOrders }` — công khai |
| `GET /api/sessions/{id}/eta` | `{ eta: { … } \| null }` — khách thuộc phiên hoặc quầy |
| `GET /api/admin/prep-stats` | Bảng chuẩn / thực tế |
| `PUT /api/admin/settings` | Thêm `etaBaseSeconds`, `kitchenParallelism`, `etaSpreadPercent`, `etaDefaultItemSeconds` |
| `GET /api/admin/jobs` · `POST /api/admin/jobs/{name}/run` | Trạng thái job + chạy lại thủ công |

## Acceptance Criteria

- AC-025-01: Hàng chờ 0 → ETA = base + thời gian giỏ.
- AC-025-02: Thêm 3 đơn vào hàng chờ → ETA tăng đúng.
- AC-025-03: `parallelism = 2` → phần hàng chờ giảm ½.
- AC-025-04: Món chưa có thống kê → 180 giây; có `PrepSeconds` → dùng số quản lý nhập.
- AC-025-05: Job tính trung vị đúng (120/240/300 giây → 240); chạy lại không nhân đôi; hai lần cùng lúc → một lần `SKIPPED`.

## Bằng chứng

- `tests/phase4-unit.test.js` → "Thời gian chờ": 3 test.
- `tests/phase4.test.js` → "Thời gian chờ ước tính (F-025)": 2 test.
- E2E "gọi lại đơn lần trước + thời gian chờ…": giỏ, theo dõi đơn, cột Mới.
