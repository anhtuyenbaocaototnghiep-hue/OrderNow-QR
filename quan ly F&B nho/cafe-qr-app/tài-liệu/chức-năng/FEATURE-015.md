# FEATURE-015 — Combo cố định

> **Nguồn:** skill `extend-features` §4 F-015. Quyết định: [ADR-005](../quyết-định/ADR-005-mo-rong-giai-doan-2.md) D-9.

- **Status:** CONFIRMED (ADR-005) · Triển khai: READY_FOR_REVIEW (16/10/2026)
- **Actor:**
  - ADMIN tạo combo.
  - Khách và STAFF bán combo.
- **Màn hình:**
  - Quản lý → **Combo** (`/admin/combos`).
  - Menu khách: mục "🍱 Combo" (kèm "Tiết kiệm x đ").
  - Quầy mang đi: tab **Combo**.
- **Dữ liệu:** migration `0005_combo.sql`.
  - `MenuItems.ItemType` = `SINGLE` | `COMBO`. Combo không thuộc danh mục: `CategoryId` = NULL.
  - `ComboComponents` (món, SL 1–10).
  - `OrderItems.ParentOrderItemId`, `ListPrice`.
  - TVP `OrderLineInput`.
- **Quy tắc:**
  - Giá combo do quản lý đặt. "Tiết kiệm" = Σ giá lẻ − giá combo (tính lại theo giá hiện tại).
  - Combo không nhận khuyến mãi giá theo món. Combo không có BOM riêng (`PUT …/bom` → `400 COMBO_HAS_NO_BOM`).
  - Đặt combo SL n → 1 dòng cha (giá combo) + dòng con (giá 0, SL = n × SL thành phần).
  - Giữ và trừ kho theo BOM của **dòng con**.
  - Combo hết khi một thành phần tắt "còn bán" / bị xóa, hoặc kho không đủ cho 1 combo (tính động).
  - Combo lồng combo bị chặn (`400 COMBO_INVALID`, SP cũng kiểm).
  - Xóa món đang là thành phần combo → `409 IN_COMBO` (kèm tên combo).
- **API:**
  - `GET/POST /api/admin/combos`.
  - `PUT /api/admin/combos/{id}` (thay toàn bộ thành phần).
  - `PATCH /api/admin/combos/{id}/availability`.
  - Xóa combo: `DELETE /api/admin/menu-items/{id}`.
  - `GET /api/menu` trả thêm `combos[]` (`components`, `listTotal`, `savings`).
- **Acceptance Criteria**
  - AC-015-01: Combo 2 thành phần, bán SL 2 → 3 dòng `OrderItems`, tổng = 2 × giá combo. Hoàn tất trừ kho = Σ BOM thành phần × 2.
  - AC-015-02: Thành phần tắt "còn bán" → menu báo combo hết. Gửi đơn → `409 ITEM_UNAVAILABLE` ghi tên combo.
  - AC-015-03: Đổi giá lẻ thành phần → `savings` đổi. Đơn cũ giữ nguyên tổng.
  - AC-015-04: Bill và phiếu pha in dòng combo + các món thành phần (giá 0).
- **Bằng chứng:**
  - `tests/sales.test.js` → "Combo (F-015)".
  - `tests/pricing.test.js` (combo).
  - E2E "tùy chọn món + combo".
