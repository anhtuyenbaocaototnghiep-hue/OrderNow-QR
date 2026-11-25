# FEATURE-053 — Đổi tên quán và địa chỉ trong Cài đặt

> **Nguồn:** chủ dự án yêu cầu 23/10/2026: "bạn làm thêm cho tôi chỗ đổi tên quán nha". Trước đó tên quán / địa chỉ chỉ đặt được bằng `SHOP_NAME` / `SHOP_ADDRESS` trong `.env` (sửa tệp rồi khởi động lại app).

- **Cập nhật 16/11/2026 ([F-095](FEATURE-095.md), ADR-057):** ngoài tên và địa chỉ, chủ quán tải được logo ở Cài đặt → Thông tin quán; logo hiện cạnh tên quán ở màn chào, thực đơn, thanh quầy, thanh bên Quản lý, hóa đơn, thẻ QR.
- **Cập nhật 25/11/2026 ([ADR-070](../quyết-định/ADR-070-so-dien-thoai-quan-va-chu-wifi.md) D-262, [TASK-135](../công-việc/TASK-135.md)):** thêm ô **Số điện thoại quán** (không bắt buộc, khóa `shop.phone`) — in dưới địa chỉ trên hóa đơn, hóa đơn bán lúc mất mạng, phiếu đặt hàng, chân thẻ QR bàn; màn chào khách hiện số bấm gọi được. Quy tắc 8, AC-053-06…08.
- **Status:** CONFIRMED (yêu cầu trực tiếp của chủ dự án) · Triển khai: [TASK-067](../công-việc/TASK-067.md)
- **Actor:** **ACT-ADMIN** — chủ quán / quản lý.
- **Màn hình:** **Quản lý → Hệ thống → Cài đặt** (SCR-33): thẻ **Thông tin quán** đầu trang — ô **Tên quán**, ô **Địa chỉ (in trên hóa đơn)**; lưu cùng nút **Lưu cài đặt**.
- **Dữ liệu:** không có bảng / cột mới, không migration. Hai khóa mới trong `dbo.Settings`: `shop.name`, `shop.address` — chỉ được ghi khi quản lý bấm Lưu. Chưa có khóa → dùng `SHOP_NAME` / `SHOP_ADDRESS` của `.env` như trước.

## User Story

- **US-053-1:** Là chủ quán, tôi muốn đổi tên quán và địa chỉ ngay trong trang Cài đặt, để menu khách, màn quầy và hóa đơn hiện đúng tên mà không phải sửa tệp cấu hình rồi khởi động lại app.

## Quy tắc (BR-085)

1. **Ai đổi:** chỉ ADMIN (như mọi cài đặt quán — `PUT /api/admin/settings`). Nhân viên / trưởng ca → `403`; chưa đăng nhập → `401`.
2. **Hợp lệ:** tên quán bắt buộc, 1–100 ký tự sau khi bỏ khoảng trắng hai đầu; địa chỉ không bắt buộc, tối đa 200 ký tự (để trống = không in địa chỉ). Sai → `400 VALIDATION_ERROR`, không lưu gì.
3. **Một nguồn cho mọi màn:** tên / địa chỉ đọc từ cài đặt cho: thanh quầy, thanh bên quản lý, đầu trang menu khách và tiêu đề tab, hóa đơn / phiếu tạm tính (bàn, từng phần, mang đi), phiếu đặt hàng, thẻ QR in.
4. **Mặc định:** chưa từng lưu → lấy `SHOP_NAME` / `SHOP_ADDRESS` của `.env` (không đổi dữ liệu đang có).
5. **Áp dụng:** trang tải sau khi lưu hiện tên mới (cache cài đặt ≤ 10 giây); trang Cài đặt cập nhật thanh bên ngay sau khi lưu. Màn khác đang mở cập nhật khi tải lại / chuyển trang (không phát realtime).
6. **Nhật ký:** đổi tên / địa chỉ ghi vào Nhật ký thao tác như mọi lần sửa cài đặt (bảng `Settings`, trước / sau); ảnh "trước" luôn có tên / địa chỉ đang dùng, kể cả lần đổi đầu tiên khi giá trị còn lấy từ `.env`.
7. **Không tự chép mặc định:** trang Cài đặt chỉ gửi tên / địa chỉ khi người dùng sửa hai ô này — lưu cài đặt khác không ghi giá trị `.env` vào DB.
8. **Số điện thoại quán (ADR-070 D-262):** không bắt buộc, chỉ ADMIN đổi. Tối đa 20 ký tự; chữ số, khoảng trắng, `.`, `-`, `(`, `)` và `+` ở đầu. Đếm chữ số: `0` + 9–10 số, `+84` + 9–10 số, hoặc `1800` / `1900` + 4–6 số. Sai → `400 VALIDATION_ERROR` (trường `shopPhone`). Giữ cách viết (bỏ khoảng trắng hai đầu, gộp khoảng trắng liền nhau); rỗng = không in. Đọc chung nguồn như tên / địa chỉ; là thông tin công khai (`/api/menu`, `/api/shop`). Không có giá trị mặc định ở `.env`.

## API (thay đổi trên endpoint đã có)

- `GET /api/admin/settings`: thêm `shopName`, `shopAddress`.
- `PUT /api/admin/settings`: nhận thêm `shopName` (1–100), `shopAddress` (0–200); trả cài đặt sau khi lưu.
- `GET /api/auth/me`, `GET /api/menu` (`shop.name`), hóa đơn (`GET /api/sessions/{id}/receipt`, `GET /api/payments/{id}/receipt`, `GET /api/orders/{id}/receipt`): `shop` lấy từ cài đặt.
- **ADR-070:** `GET/PUT /api/admin/settings` thêm `shopPhone` (`''` = chưa có); `shop` ở `/api/auth/me`, `/api/menu`, hóa đơn và `GET /api/shop` thêm `phone` (`null` khi chưa có).

## Acceptance Criteria

- AC-053-01: Quản lý lưu tên "Cà phê Mộc Test" + địa chỉ "12 Lê Lợi" → 200; `GET /api/admin/settings`, `GET /api/auth/me` (`shop`), `GET /api/menu` (`shop.name`) và hóa đơn phiên (`shop`) đều trả tên / địa chỉ mới; Nhật ký thao tác có dòng sửa cài đặt ghi tên cũ → mới.
- AC-053-02: Chưa từng lưu tên quán → mọi nơi dùng `SHOP_NAME` / `SHOP_ADDRESS` của `.env`; lưu địa chỉ rỗng → hóa đơn không còn địa chỉ.
- AC-053-03: Tên rỗng / chỉ khoảng trắng / dài hơn 100 ký tự, địa chỉ dài hơn 200 ký tự → `400 VALIDATION_ERROR`, tên đang dùng không đổi.
- AC-053-04: Nhân viên, trưởng ca gọi `PUT /api/admin/settings` → `403`; chưa đăng nhập → `401`.
- AC-053-05: Trên trình duyệt, quản lý mở Quản lý → Cài đặt, đổi tên quán, bấm Lưu → thanh bên hiện tên mới ngay; khách mở menu thấy tên mới ở đầu trang; trang Cài đặt đạt kiểm tra khả năng tiếp cận.
- AC-053-06 (ADR-070): Chủ quán lưu số `"  0909   123 456 "` → 200, lưu thành `0909 123 456`; `GET /api/admin/settings` (`shopPhone`), `/api/auth/me`, `/api/menu`, hóa đơn phiên (`shop.phone`) và `GET /api/shop` (`phone`) đều trả số đó; lưu cài đặt khác không đổi số; lưu rỗng → không còn số ở đâu (`phone: null`).
- AC-053-07 (ADR-070): Số sai (thiếu / thừa chữ số, có chữ, `+` giữa số, đầu số khác 0 / +84 / 1800 / 1900, dài hơn 20 ký tự) → `400 VALIDATION_ERROR` ở trường `shopPhone`, số đang dùng không đổi; số bàn `028 3822 1234`, `+84 909 123 456`, tổng đài `1900 1234` / `1800.6868`, `(028) 3822-1234` hợp lệ; nhân viên / trưởng ca → `403`.
- AC-053-08 (ADR-070): Trên trình duyệt, Cài đặt có ô "Số điện thoại quán"; số sai báo ngay ("Số điện thoại chưa đúng"), số đúng lưu được; trang In mã QR in "ĐT: …" trên mọi thẻ bàn.
