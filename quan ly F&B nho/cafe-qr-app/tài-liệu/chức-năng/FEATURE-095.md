# FEATURE-095 — Logo quán

> **Nguồn:** chủ dự án — "làm thêm chỗ úp hình lên logo nha" (16/11/2026, sau khi xem màn chào). Quyết định: [ADR-057](../quyết-định/ADR-057-logo-quan.md) D-234, D-235. Nền: [F-053](FEATURE-053.md) tên / địa chỉ quán, [F-033](FEATURE-033.md) ảnh hóa đơn (cách nhận ảnh), [F-092](FEATURE-092.md) màn chào.

- **Status:** CONFIRMED (ADR-057) · Triển khai: [TASK-116](../công-việc/TASK-116.md)
- **Actor:** **ACT-ADMIN** (tải / bỏ logo); **ACT-GUEST**, **ACT-STAFF**, **ACT-STORE** (thấy logo).
- **Màn hình:** **SCR-33** Cài đặt → Thông tin quán; **SCR-01** màn chào, **SCR-02** thực đơn, thanh quầy, thanh bên Quản lý, phiếu in, thẻ QR in.
- **Dữ liệu:** cài đặt `shop.logo` (đường dẫn tệp trong `uploads/brand/`). Không migration.

## User Story

- **US-095-1:** Là chủ quán, tôi muốn tải logo của quán lên một lần để khách thấy logo khi quét QR, trên thực đơn, hóa đơn và thẻ QR, nhân viên thấy trên màn quầy — quán trông chuyên nghiệp và dễ nhận ra.

## Quy tắc

1. Chỉ chủ quán tải / bỏ logo. Ảnh jpg, png hoặc webp, tối đa 1 MB, kiểm chữ ký tệp; SVG và tệp khác bị từ chối.
2. Chọn ảnh là lưu ngay; ảnh mới thay ảnh cũ (tệp cũ bị xóa); "Bỏ logo" hỏi lại rồi xóa.
3. Logo hiện trong khung tròn nền trắng, không cắt ảnh. Chưa có logo → biểu tượng ly cà phê như cũ.
4. Địa chỉ ảnh có `?v=<tên tệp>` → trình duyệt lưu đệm lâu nhưng đổi logo là thấy ngay ở lần tải trang sau.

## API

- `PUT /api/admin/settings/logo` (chủ quán): thân là ảnh (`Content-Type: image/jpeg | image/png | image/webp`), ≤ 1 MB → `{ logoUrl }`; sai định dạng → `400 LOGO_INVALID`; quá cỡ → `400 LOGO_TOO_LARGE`.
- `DELETE /api/admin/settings/logo` (chủ quán) → `{ logoUrl: null }`.
- `GET /api/shop/logo` (công khai): tệp ảnh; chưa có → `404`.
- `logoUrl` thêm vào `shop` của `GET /api/shop`, `GET /api/menu`, `GET /api/auth/me`, phiếu in.

## Acceptance Criteria

- AC-095-01: Chủ quán tải ảnh png hợp lệ → 200, `logoUrl` có `?v=`; `GET /api/shop`, `/api/menu`, `/api/auth/me` trả cùng `logoUrl`; `GET /api/shop/logo` trả đúng nội dung + loại ảnh; tải jpg mới → `logoUrl` đổi, tệp cũ bị xóa; ảnh sai định dạng (gif, svg, chữ) → 400 `LOGO_INVALID`; > 1 MB → 400 `LOGO_TOO_LARGE`; quản lý cửa hàng, nhân viên → 403; chưa đăng nhập → 401; bỏ logo → `logoUrl = null`, `GET /api/shop/logo` → 404.
- AC-095-02: (E2E) Cài đặt → Thông tin quán → "Chọn ảnh…" một ảnh png → khung xem trước hiện ảnh, thông báo đã lưu; điện thoại quét QR → màn chào có logo trên tên quán; thực đơn có logo trước tên quán; thanh bên Quản lý, thanh quầy (nhân viên) có ảnh logo thay ly cà phê; phiếu tạm tính và thẻ QR in có logo; "Bỏ logo" → xác nhận → các nơi về biểu tượng ly cà phê.
- AC-095-03: Quét khả năng tiếp cận: Cài đặt (ô Logo quán có nhãn, nút đủ vùng chạm), màn chào + thực đơn có logo (ảnh có chữ thay thế hoặc là trang trí khi tên quán ở ngay bên) — đạt; không cuộn ngang 320 / 390 px.

## Bằng chứng

- Integration: `ứng-dụng/máy-chủ/tests/shop-logo.test.js` (AC-095-01).
- E2E: `kiểm-thử/e2e/flow.spec.js` bài "logo quán…" (AC-095-02); `kiểm-thử/e2e/a11y.spec.js` bài "logo quán (F-095)…" (AC-095-03).
