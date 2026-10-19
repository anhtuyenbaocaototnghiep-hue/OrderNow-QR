# FEATURE-013 — Tùy chọn món (size, đường, đá, topping)

> **Nguồn:** skill `extend-features` §4 F-013 (chủ dự án giao 16/10/2026). Quyết định: [ADR-005](../quyết-định/ADR-005-mo-rong-giai-doan-2.md) D-13.

- **Status:** CONFIRMED (ADR-005) · Triển khai: READY_FOR_REVIEW (16/10/2026)
- **Actor:**
  - ADMIN cấu hình nhóm tùy chọn.
  - Khách và STAFF chọn khi gọi món.
- **Màn hình:**
  - Quản lý → **Tùy chọn món** (`/admin/modifiers`): tạo nhóm và tùy chọn.
  - Quản lý → Thực đơn → Sửa món: gán nhóm cho món.
  - Khách: bảng chọn (sheet) khi bấm "Chọn size / tùy chọn".
  - Quầy (mang đi): modal chọn tùy chọn.
- **Dữ liệu:**
  - Bảng: `ModifierGroups` (Min/Max), `ModifierOptions` (`PriceDelta`, `IsDefault`), `ModifierOptionBom`, `MenuItemModifierGroups`.
  - `OrderItemModifiers` lưu tên + phụ thu lúc đặt.
  - Migration `0007_tuy_chon_mon.sql`.
- **Quy tắc:**
  - Nhóm có tối thiểu/tối đa số tùy chọn. Tùy chọn có phụ thu ≥ 0 và định lượng cộng thêm.
  - Giá dòng = giá món (sau khuyến mãi dòng) + Σ phụ thu.
  - Nhu cầu kho = Σ SL × (BOM món + BOM tùy chọn đã chọn) → giữ kho khi gửi, trừ khi hoàn tất (ADR-001).
  - Cùng món nhưng khác tùy chọn là hai dòng giỏ.
  - Món mà mọi nhóm bắt buộc đều có mặc định: bấm "+" là thêm ngay theo mặc định (giữ ≤ 3 chạm — NFR-003). Khách đổi bằng "Chọn size / tùy chọn".
  - Sửa hoặc xóa tùy chọn không đổi đơn cũ. Tùy chọn đã có trong đơn thì xóa mềm.
- **API:**
  - `GET/POST /api/admin/modifier-groups`, `PUT/DELETE /api/admin/modifier-groups/{id}`.
  - `PUT /api/admin/menu-items/{id}` nhận thêm `groupIds`.
  - `POST /api/orders` và `/api/orders/takeaway`: mỗi dòng nhận thêm `optionIds[]`.
  - `GET /api/menu`: mỗi món có `groupIds`, kèm `modifierGroups[]`.
- **Lỗi:** thiếu nhóm bắt buộc, quá tối đa, hoặc tùy chọn không thuộc món → `400 INVALID_OPTIONS`.
- **Acceptance Criteria**
  - AC-013-01: Size L +5.000đ → tổng dòng = (29.000 + 5.000) × SL. Giữ và trừ kho thêm 20 ml theo BOM tùy chọn.
  - AC-013-02: Nhóm `MinSelect = 1` không chọn → 400. Tùy chọn lạ → 400.
  - AC-013-03: Quản lý đổi phụ thu Size L sau khi đã có đơn → đơn cũ vẫn ghi 5.000đ.
  - AC-013-04: Phiếu pha, chi tiết đơn và bill in ghi tên tùy chọn ("Size L, Trân châu").
- **Bằng chứng:**
  - Unit: `tests/pricing.test.js` (tùy chọn).
  - Integration: `tests/sales.test.js` → "Tùy chọn món (F-013)".
  - E2E: "tùy chọn món + combo".
