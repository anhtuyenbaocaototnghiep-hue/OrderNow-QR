# ADR-060 — Màu màn khách chỉ theo giờ của quán

- **Trạng thái:** ACCEPTED (17/11/2026). Chủ dự án: "đổi theo giờ quán" (17/11/2026 — sau khi thấy máy tính bật chế độ tối của Windows thì màn khách tối cả ban ngày, điện thoại thì không). Thay một phần [ADR-056](ADR-056-giao-dien-khach-theo-gio-va-mua.md) D-231.
- **Bối cảnh:** D-231 cho màn khách tối cả ban ngày khi máy đang bật chế độ tối (`prefers-color-scheme: dark`). Laptop của quán để Windows ở chế độ tối nên màn khách trên máy tính tối lúc 14 giờ, còn điện thoại (chế độ sáng) thì sáng — chủ quán thấy hai máy khác nhau, khó kiểm tra.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-240 | **Màu màn khách chỉ theo giờ của quán** (giờ Việt Nam): 18:00–4:59 tối, còn lại sáng (sáng 5–10 giờ có mặt trời ở khung giới thiệu). **Bỏ** quy tắc "máy bật chế độ tối thì tối cả ngày" của D-231 — điện thoại khách, máy tính quầy cùng một màu vào cùng một lúc. Cài đặt "Tự đổi sáng / tối theo giờ" và trang trí theo mùa giữ nguyên. |

## Hệ quả

- **Mã nguồn:** `js/guest-theme.js` (bỏ `matchMedia('(prefers-color-scheme: dark)')`), `js/pages/admin-settings.js` (ghi chú dưới công tắc).
- **Test:** E2E "giao diện khách theo giờ…" — máy bật chế độ tối lúc 10:00 vẫn sáng (AC-094-02 sửa theo).
- **Tài liệu:** ADR-056 (ghi chú), FEATURE-094 (quy tắc 1, AC-094-02), design-system, screens-flows, tc-map.
