# FEATURE-094 — Giao diện màn khách theo giờ và theo mùa

> **Nguồn:** chủ dự án 16/11/2026 — "cái dạo này có thể làm sáng tối theo thời gian được không, giống như vào buổi tối giao diện sẽ khác buổi sáng giao diện khác, và theo mùa xuân hạ thu đông" (kèm ảnh màn chào) → đồng ý phương án: "ok tiến hành làm". Quyết định: [ADR-056](../quyết-định/ADR-056-giao-dien-khach-theo-gio-va-mua.md) D-231, D-232, D-233; [ADR-060](../quyết-định/ADR-060-mau-man-khach-chi-theo-gio-quan.md) D-240 (17/11/2026 — "đổi theo giờ quán": màu chỉ theo giờ của quán). Nền: [F-092](FEATURE-092.md) màn chào (lời chào theo giờ), [F-093](FEATURE-093.md) màn khách chỉ cho điện thoại, [F-083](FEATURE-083.md) cài đặt màn khách.

- **Status:** CONFIRMED (ADR-056) · Triển khai: [TASK-115](../công-việc/TASK-115.md), [TASK-119](../công-việc/TASK-119.md)
- **Actor:** **ACT-GUEST / ACT-MEMBER** (điện thoại khách); **ACT-ADMIN / ACT-STORE** (bật / tắt ở Cài đặt).
- **Màn hình:** **SCR-01** màn chào, **SCR-02** thực đơn, **SCR-03** giỏ, **SCR-05** theo dõi đơn; **SCR-33** Cài đặt → Màn gọi món của khách.
- **Dữ liệu:** cài đặt `guest.daypart_theme`, `guest.season_decor` (mặc định bật). Không migration.

## User Story

- **US-094-1:** Là khách, tôi muốn màn gọi món dịu mắt khi ngồi quán buổi tối và có không khí theo buổi, theo mùa, để dùng thoải mái và thấy quán chăm chút; là chủ quán, tôi muốn bật / tắt được việc này.

## Quy tắc

1. Giờ Việt Nam: 5:00–10:59 sáng (khung giới thiệu có mặt trời ló ở góc), 11:00–17:59 ngày (như cũ), 18:00–4:59 tối (giao diện tối). Màu chỉ theo giờ của quán — máy bật chế độ tối vẫn sáng ban ngày ([ADR-060](../quyết-định/ADR-060-mau-man-khach-chi-theo-gio-quan.md) D-240). Tắt "Tự đổi sáng / tối theo giờ" → luôn như cũ (sáng).
2. Trang đang mở tự đổi khi qua mốc giờ (không tải lại); lời chào ở màn chào đổi theo.
3. Mùa theo tháng: Xuân 1–3 (hoa mai), Hạ 4–6 (ly đá, giọt nước), Thu 7–9 (lá vàng), Đông 10–12 (ly nóng + bông tuyết) — chỉ khung giới thiệu ở màn chào; nút, giá, chữ, thẻ món giữ màu quán. Tắt "Trang trí theo mùa" → khung giới thiệu như cũ (ly cà phê).
4. Giao diện tối đạt tương phản AA như ban ngày. Chỉ màn chào, thực đơn, giỏ, theo dõi đơn; trang quà, vòng quay, chính sách, quầy, Quản lý không đổi.

## API

- `GET /api/shop` (công khai): thêm `guestTheme: { daypart: boolean, season: boolean }`.
- `GET / PUT /api/admin/settings`: `guestDaypartTheme`, `guestSeasonDecor` (boolean; chủ quán, quản lý cửa hàng).

## Acceptance Criteria

- AC-094-01: Cài đặt mới mặc định `guestDaypartTheme = true`, `guestSeasonDecor = true`; `GET /api/shop` trả `guestTheme: { daypart: true, season: true }`; tắt từng cài đặt → `/api/shop` đổi theo; quản lý cửa hàng đổi được; nhân viên → 403; giá trị không phải boolean → 400.
- AC-094-02: (điện thoại 390 px, bật) 8:00 giờ Việt Nam → `<html data-daypart="morning">`, không tối, khung giới thiệu có mặt trời (lớp nắng); 20:00 → `data-theme="dark"`: nền trang, thẻ món, đầu trang tối, chữ sáng ở màn chào, thực đơn, theo dõi đơn; đang mở lúc 17:59:40, đồng hồ chạy qua 18:00 → tự tối không tải lại, lời chào thành "Chào buổi tối"; máy bật chế độ tối lúc 10:00 → vẫn sáng (theo giờ quán — ADR-060); tắt "Tự đổi sáng / tối theo giờ" → 20:00 vẫn sáng.
- AC-094-03: (bật) tháng 2 → `data-season="spring"`, khung giới thiệu hiện hình hoa; tháng 5 → `summer` ly đá; tháng 8 → `autumn` lá; tháng 11 → `winter` ly nóng; màu nút "Xem thực đơn – Gọi món" không đổi giữa các mùa; tắt "Trang trí theo mùa" → không có `data-season`, khung giới thiệu hiện ly cà phê như cũ.
- AC-094-04: Giao diện tối (20:00) — màn chào, thực đơn, bảng chọn món, giỏ, theo dõi đơn: quét khả năng tiếp cận (nhãn, tên nút, tương phản AA, vùng chạm ≥ 24 px, dấu focus) đạt; không cuộn ngang ở 320 / 390 px.

## Bằng chứng

- Integration: `ứng-dụng/máy-chủ/tests/guest-theme.test.js` (AC-094-01).
- E2E: `kiểm-thử/e2e/flow.spec.js` bài "giao diện khách theo giờ…" (AC-094-02), "trang trí theo mùa…" (AC-094-03); `kiểm-thử/e2e/a11y.spec.js` bài "khách giao diện tối…" (AC-094-04).
