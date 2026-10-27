# FEATURE-059 — QR Wi-Fi cho khách in kèm QR bàn

> **Nguồn:** chủ dự án hỏi 26/10/2026 "khách có thể quét wifi và cả 4G không" → chọn "chuyển qua quét bằng wifi" (cách chạy trong mạng nội bộ, ADR-016 D-61: điện thoại khách vào app qua Wi-Fi của quán). Khách phải vào đúng Wi-Fi trước khi quét QR bàn; gõ tên + mật khẩu Wi-Fi chậm và hay sai → in thêm **QR Wi-Fi** cạnh QR bàn như các quán cà phê vẫn làm.

- **Status:** CONFIRMED (yêu cầu trực tiếp của chủ dự án) · Triển khai: [TASK-074](../công-việc/TASK-074.md)
- **Actor:** **ACT-ADMIN** (nhập Wi-Fi, in QR); **ACT-GUEST / ACT-MEMBER** (quét QR Wi-Fi rồi QR bàn).
- **Màn hình:**
  - **Quản lý → Hệ thống → Cài đặt** (SCR-33): thẻ **Wi-Fi cho khách** — ô **Tên Wi-Fi**, ô **Mật khẩu Wi-Fi**; lưu cùng nút **Lưu cài đặt**.
  - **In mã QR các bàn** (SCR-22, `/admin/tables/print`): khi đã nhập tên Wi-Fi, mỗi thẻ bàn có **"① Quét để vào Wi-Fi"** (QR Wi-Fi + dòng tên / mật khẩu cho máy không quét được) và **"② Quét để gọi món"** (QR bàn như cũ). Chưa nhập → thẻ như cũ.
- **Dữ liệu:** không có bảng / cột mới, không migration. Hai khóa mới trong `dbo.Settings`: `wifi.ssid`, `wifi.password`.

## User Story

- **US-059-1:** Là chủ quán, tôi muốn in QR Wi-Fi cạnh QR gọi món trên mỗi bàn, để khách quét một lần là vào được Wi-Fi của quán rồi gọi món, không phải hỏi và gõ mật khẩu.

## Quy tắc (BR-092)

1. Chỉ ADMIN sửa / xem (như mọi cài đặt). Tên Wi-Fi 0–32 **byte** UTF-8 (giới hạn của chuẩn Wi-Fi; bỏ khoảng trắng hai đầu; tên có dấu được); rỗng = không in QR Wi-Fi. Mật khẩu rỗng (mạng không mật khẩu) hoặc 8–63 ký tự **không dấu** (ASCII in được, chuẩn WPA/WPA2 — gõ nhầm chữ có dấu do bộ gõ tiếng Việt thì QR không bao giờ vào được mạng); giữ nguyên khoảng trắng. Tên và mật khẩu không được kết thúc bằng `\` (Android đọc sai).
2. Nội dung QR theo định dạng Wi-Fi chuẩn mà camera Android / iPhone đọc được: `WIFI:T:WPA;S:<tên>;P:<mật khẩu>;;` (mạng mở: `WIFI:T:nopass;S:<tên>;;`); ký tự `\ ; , : "` trong tên / mật khẩu được thoát bằng `\`. Giá trị trông như số hex (vd. `CAFE1234`) **không** đặt trong ngoặc kép: camera Android 10+ và iPhone đọc nguyên văn; riêng ứng dụng quét cũ (ZXing Barcode Scanner) có thể hiểu nhầm thành mã hex — chấp nhận.
3. `GET /api/admin/wifi-qr.png` (ADMIN) trả ảnh QR Wi-Fi; chưa nhập tên → `404`.
4. Mật khẩu Wi-Fi **không** ghi vào Nhật ký thao tác (khóa có chữ "password" luôn bị bỏ — F-035), nhưng in trên thẻ bàn: nên dùng **mạng Wi-Fi riêng cho khách**, không dùng chung mạng máy quầy.
5. Thẻ bàn in dòng thanh toán đúng với F-056: "Thanh toán tiền mặt hoặc chuyển khoản".

## API (thay đổi)

| Method & path | Thay đổi |
| --- | --- |
| `GET /api/admin/settings`, `PUT /api/admin/settings` | Thêm `wifiSsid`, `wifiPassword` |
| `GET /api/admin/wifi-qr.png` | **Mới** — ảnh PNG QR Wi-Fi; `404` khi chưa nhập tên Wi-Fi |

## Acceptance Criteria

- AC-059-01: Quản lý lưu tên Wi-Fi + mật khẩu → `GET /api/admin/settings` trả đúng; `GET /api/admin/wifi-qr.png` → `200 image/png`; chuỗi QR đúng định dạng `WIFI:T:WPA;S:…;P:…;;`, ký tự đặc biệt được thoát, mạng không mật khẩu ra `T:nopass`.
- AC-059-02: Chưa nhập tên Wi-Fi, hoặc xóa trống tên → `GET /api/admin/wifi-qr.png` → `404`.
- AC-059-03: Tên > 32 byte, mật khẩu 1–7 hoặc > 63 ký tự hoặc có chữ có dấu, tên / mật khẩu kết thúc bằng `\` → `400 VALIDATION_ERROR`, cài đặt không đổi. Nhân viên / trưởng ca → `403`, chưa đăng nhập → `401`. Nhật ký thao tác của lần lưu không chứa mật khẩu Wi-Fi.
- AC-059-04: Trên trình duyệt: quản lý nhập Wi-Fi trong Cài đặt → trang In QR, mỗi thẻ bàn có "Quét để vào Wi-Fi" (ảnh QR Wi-Fi, tên và mật khẩu) và "Quét để gọi món".

## Bằng chứng

`tests/wifi-qr.test.js` (AC-059-01…03) · E2E "QR Wi-Fi cho khách…" (AC-059-04).
