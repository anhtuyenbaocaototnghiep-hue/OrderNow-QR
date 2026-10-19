# FEATURE-017 — Gợi ý / bán chạy / ghim

> **Nguồn:** skill `extend-features` §4 F-017. Quyết định: [ADR-005](../quyết-định/ADR-005-mo-rong-giai-doan-2.md) D-11.

- **Status:** CONFIRMED (ADR-005) · Triển khai: READY_FOR_REVIEW (16/10/2026)
- **Actor:** ADMIN cấu hình; khách xem.
- **Màn hình:**
  - Menu khách: mục "⭐ Gợi ý cho bạn". Món ghim có nhãn riêng, món tự động có nhãn "Bán chạy".
  - Quản lý → **Gợi ý & ghim** (`/admin/suggestions`):
    - chế độ, số món, số ngày;
    - món ghim (thứ tự ↑↓, nhãn);
    - ẩn khỏi gợi ý;
    - bảng top 20 thực tế.
- **Dữ liệu:**
  - `MenuItems.IsPinned/PinLabel/PinOrder/HideFromSuggestions` (migration `0004_goi_y.sql`).
  - `Settings`: `suggestion.mode` (AUTO | PINNED | BOTH), `suggestion.window_days` (7), `suggestion.top_n` (8).
- **Quy tắc:**
  - Top bán chạy = Σ số lượng dòng khách chọn (không tính dòng con combo) của đơn đã thu, không hủy/hoàn, trong N ngày (giờ quán).
  - Kết quả cache 15 phút. Lưu cấu hình gợi ý thì xóa cache.
  - Danh sách gợi ý = món ghim (theo thứ tự) + món tự động chưa ghim (tối đa N).
  - Bỏ món ẩn khỏi gợi ý và món đang hết.
  - Chế độ PINNED chỉ hiện món ghim; AUTO chỉ hiện món tự động.
- **API:**
  - `GET /api/menu` trả `suggested[] = { menuItemId, label, kind: PINNED | AUTO }`.
  - `GET/PUT /api/admin/suggestions`.
  - Realtime `menu.updated` → menu khách đang mở tự tải lại.
- **Acceptance Criteria**
  - AC-017-01: Có đơn đã thu → top xếp đúng theo số lượng.
  - AC-017-02: Ghim 1 món (nhãn "Món mới") → đứng đầu, sau đó là "Bán chạy".
  - AC-017-03: Chế độ PINNED → không còn món tự động.
  - AC-017-04: Món hết / ẩn khỏi gợi ý → không xuất hiện.
- **Bằng chứng:** `tests/sales.test.js` → "Gợi ý / bán chạy / ghim (F-017)".
