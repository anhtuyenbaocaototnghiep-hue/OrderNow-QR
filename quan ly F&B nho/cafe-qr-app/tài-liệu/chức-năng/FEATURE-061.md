# FEATURE-061 — Chế độ cơ bản và hướng dẫn 5 bước ở màn quầy

> **Nguồn:** chủ dự án 29/10/2026. Quyết định: [ADR-021](../quyết-định/ADR-021-che-do-co-ban-chinh-sach-qr.md) D-79, D-80.

- **Status:** CONFIRMED (ADR-021) · Triển khai: [TASK-077](../công-việc/TASK-077.md)
- **Actor:** **ACT-ADMIN** (bật / tắt nhóm mục), **ACT-STAFF / ACT-LEAD / ACT-ADMIN** (xem hướng dẫn ở màn quầy).
- **Màn hình:**
  - **Cài đặt** (SCR-33): thẻ **"Giao diện quản lý"** — 5 ô tích nhóm nâng cao (Kho hàng; Khách hàng & khuyến mãi; Sổ quỹ & nhân sự; Phân tích & lãi lỗ; Công cụ nâng cao), ghi rõ mỗi nhóm gồm trang nào.
  - **Menu quản lý** (mọi trang `/admin/*`): chỉ hiện nhóm đã bật; trang của nhóm đang ẩn mở thẳng bằng đường dẫn vẫn chạy, có dải nhắc.
  - **Màn quầy** (SCR-10 và các trang quầy): mục "Kho & sơ chế" theo nhóm Kho hàng; nút **"Hướng dẫn"** trên thanh trên; lớp hướng dẫn 5 bước ở trang Đơn hàng.
- **Dữ liệu:** khóa cài đặt `ui.modules` (danh sách, mặc định rỗng = cơ bản); cột `Users.TourSeenAt` (migration 0041).

## User Story

- **US-061-1:** Là chủ quán mới dùng app, tôi muốn menu quản lý chỉ hiện những mục cần cho việc bán hàng hằng ngày và tự bật thêm khi cần, để không bị ngợp bởi hàng chục trang chưa dùng tới.
- **US-061-2:** Là nhân viên mới, tôi muốn lần đầu vào màn quầy được chỉ từng bước mở ca, nhận đơn, hoàn tất, thu tiền, đóng ca ngay trên màn thật, để làm được việc mà không cần người kèm.

## Quy tắc (BR-096, BR-097)

| Nhóm (`ui.modules`) | Mục ẩn khi tắt |
| --- | --- |
| `inventory` — Kho hàng | Nguyên liệu, Nhập kho & kiểm kê, Nhà cung cấp; màn quầy: Kho & sơ chế |
| `customers` — Khách hàng & khuyến mãi | Hội viên, Tích điểm & voucher, Khuyến mãi, Gợi ý & ghim, Đánh giá món |
| `finance` — Sổ quỹ & nhân sự | Sổ quỹ, Nhân sự & chấm công |
| `analytics` — Phân tích & lãi lỗ | Phân tích, Lãi / lỗ |
| `advanced` — Công cụ nâng cao | Lịch thực đơn, Nhật ký thao tác, Tra cứu API |

- Luôn hiện: Hôm nay, Báo cáo & lịch sử, Món & định lượng, Tùy chọn món, Combo, Ca & hoàn tiền, Cảnh báo, Bàn & mã QR, Tài khoản, Cài đặt.
- Ẩn chỉ là **giao diện**: quyền, API, nghiệp vụ (trừ kho, tích điểm, sổ quỹ khi thu tiền…) không đổi.
- Quán mới = cơ bản. CSDL đã có đơn lúc nâng cấp → migration bật đủ 5 nhóm. Dữ liệu mẫu bật đủ.
- Migration 0041 bật đủ 5 nhóm khi CSDL đã dùng thật: có đơn, hội viên hoặc phiếu nhập kho.
- Hướng dẫn: hiện ở trang Đơn hàng khi `user.tourSeenAt` rỗng; đổi bước được đọc qua vùng `aria-live` (focus giữ ở nút Tiếp); xoay / đổi cỡ màn hình trong lúc hướng dẫn mở không gỡ `inert` phía sau; 5 bước: (1) Mở ca, (2) Đơn mới → Tiếp nhận, (3) Đang pha → Hoàn tất, (4) Bàn → thu tiền (Tiền mặt / Chuyển khoản), (5) Ca & hoàn tiền → Đóng ca. Bỏ qua / Xong → `POST /api/auth/tour-seen`. Nút "Hướng dẫn" mở lại (không đổi `tourSeenAt`). Tài khoản có sẵn lúc nâng cấp và tài khoản do lệnh cài đặt tạo = đã xem.

## API

| Method & path | Mô tả |
| --- | --- |
| `GET /api/auth/me` | Thêm `modules` (mảng nhóm đang bật) và `user.tourSeenAt` |
| `GET` / `PUT /api/admin/settings` | Thêm `uiModules` (mảng con của 5 nhóm, không trùng) |
| `POST /api/auth/tour-seen` | Đánh dấu tài khoản đã xem hướng dẫn → `{ tourSeenAt }` |

## Acceptance Criteria

- AC-061-01: Quán mới (chưa lưu `ui.modules`): `GET /api/auth/me` trả `modules: []`; menu quản lý không có Kho hàng, Khách hàng, Sổ quỹ, Nhân sự, Phân tích, Lãi / lỗ, Lịch thực đơn, Nhật ký, Tra cứu API; màn quầy không có "Kho & sơ chế".
- AC-061-02: Quản lý lưu `uiModules` → đọc lại đúng, `auth/me` trả đúng; nhóm lạ / trùng → `400`, cài đặt không đổi; nhân viên / trưởng ca → `403`.
- AC-061-03: Mở thẳng trang của nhóm đang ẩn → trang vẫn chạy, có dải "Mục này đang ẩn khỏi menu" + link Cài đặt; API của nhóm đó vẫn trả `200`. Migration 0041 trên CSDL đã có đơn bật đủ 5 nhóm, tài khoản có sẵn = đã xem hướng dẫn.
- AC-061-04: Tài khoản mới: `auth/me` có `tourSeenAt = null`; `POST /api/auth/tour-seen` → có giờ, gọi lại không đổi giờ; chưa đăng nhập → `401`.
- AC-061-05: Trên trình duyệt: tài khoản mới đăng nhập quầy → hướng dẫn bước 1/5 khoanh nút ca → Tiếp tới 5/5 → Xong; đăng nhập lại không hiện; nút "Hướng dẫn" mở lại; quản lý bật nhóm Kho hàng ở Cài đặt → menu hiện "Kho hàng".

## Bằng chứng

`tests/basic-mode.test.js` · E2E "chế độ cơ bản…", "hướng dẫn 5 bước…".
