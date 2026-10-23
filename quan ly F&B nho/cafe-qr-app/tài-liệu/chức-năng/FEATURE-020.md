# FEATURE-020 — Tự "hết món" + công tắc nhận đơn QR + giờ bán theo danh mục

> **Nguồn:** skill `extend-features` §4 F-020. Quyết định: [ADR-005](../quyết-định/ADR-005-mo-rong-giai-doan-2.md) D-12.

- **Status:** CONFIRMED (ADR-005) · Triển khai: READY_FOR_REVIEW (16/10/2026)
- **Actor:**
  - STAFF/ADMIN bật/tắt nhận đơn.
  - ADMIN đặt giờ bán.
  - Khách bị áp dụng.
- **Tự "hết món" (D-12):** **đã có sẵn** từ MVP (ADR-003).
  - Món tự hiện "Hết món" khi `StockQty − ReservedQty` < BOM cho 1 suất, và tự bán lại khi nhập kho hoặc điều chỉnh. Combo tính theo Σ BOM thành phần.
  - Món quản lý tắt tay không bao giờ tự bật.
  - Thay đổi được phát qua `menu.availability_changed`.
  - Không cần cột `AutoSoldOut` (xem ADR-005 "Thích nghi").
- **Công tắc nhận đơn QR:**
  - `Settings.store.accepting_orders` / `store.closed_message`.
  - Đổi được ở nút "QR: đang nhận đơn / tạm ngưng" trên thanh quầy và ở Quản lý → Cài đặt.
  - Khi tắt:
    - `POST /api/orders` của khách → `503 STORE_CLOSED` (kèm thông báo);
    - menu khách hiện banner, nút Gửi đơn bị khóa;
    - quầy vẫn bán mang đi.
  - Đổi trạng thái → phát `store.status_changed` tới khách và quầy.
- **Giờ bán theo danh mục:**
  - `Categories.SellFrom/SellTo` (migration `0010_nhan_don_gio_ban.sql`). Đặt ở Thực đơn → Sửa danh mục.
  - Ngoài giờ: menu khách ẩn danh mục, gửi đơn món đó → `409 ITEM_UNAVAILABLE` ("ngoài giờ bán").
  - Quầy (gọi `/api/menu` kèm Bearer) vẫn thấy và bán được.
  - Giờ kết thúc nhỏ hơn giờ bắt đầu = qua nửa đêm.
- **API:**
  - `GET/PUT /api/store` (STAFF).
  - `GET/PUT /api/admin/settings`.
  - `PUT /api/admin/categories/{id}` thêm `sellFrom`, `sellTo`.
  - `GET /api/menu` trả `store`.
- **Acceptance Criteria**
  - AC-020-01: Nhân viên tắt nhận đơn QR → trong ≤ 2 s (NFR-001) khách đang mở menu nhận trạng thái mới (`store.status_changed`): banner "tạm ngưng nhận đơn", nút Gửi đơn bị khóa; khách gửi đơn → 503 `STORE_CLOSED`; quầy bán mang đi vẫn 201. Bật lại → khách gửi đơn được (201). _(viết lại cho kiểm được — TASK-057, 20/10/2026)_
  - AC-020-02: Danh mục ngoài giờ → khách không thấy và không đặt được; quầy vẫn thấy.
  - AC-020-03: Món hết nguyên liệu tự hiện "Hết món", nhập kho xong tự bán lại (đã có từ MVP — api.test "hết nguyên liệu…").
  - AC-020-04: Đặt giờ bán danh mục chỉ có giờ bắt đầu, thiếu giờ kết thúc → 400; xóa cả hai giờ → danh mục hiện lại với khách. _(bổ sung — TASK-057, 20/10/2026)_
- **Bằng chứng:**
  - `tests/sales.test.js` → "Công tắc nhận đơn + giờ bán (F-020)".
  - E2E "tạm ngưng nhận đơn QR…".
