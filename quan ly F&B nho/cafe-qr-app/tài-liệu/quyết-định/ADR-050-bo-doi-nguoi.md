# ADR-050 — Bỏ "Đổi người" ở máy quầy

- **Trạng thái:** ACCEPTED (14/11/2026). Chủ dự án (sau khi xem màn quầy gọn — ADR-049 D-220): "bỏ chức năng đổi người ở màn hình quầy".
- **Bối cảnh:** F-072 ([ADR-030](ADR-030-cham-cong-tinh-luong.md) D-126) cho người sắp đứng máy chạm tên + nhập PIN để phiên máy quầy đổi sang tên mình — nút "Đổi người" trên thanh trên mọi trang quầy, hộp chọn người (`switchUserDialog`), API `POST /api/auth/switch`. Trên màn quầy gọn nút này thừa và dễ nhầm với "Chấm công" (cũng chạm tên + PIN). Rà soát bảo mật 13/11/2026 cũng ghi `/auth/switch` là một lối đổi phiên bằng PIN.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-221 | **Bỏ "Đổi người".** Máy quầy không còn nút "Đổi người" (mọi trang, cả hai bố cục); bỏ hộp chọn người đổi phiên và API `POST /api/auth/switch` (gọi → `404`, không cấp phiên). Người khác đứng máy: **Đăng xuất** rồi đăng nhập tài khoản của mình (người giữ ca: đóng ca trước khi đăng xuất — F-054). **Giữ nguyên:** PIN riêng để **Chấm công** ở màn chung, **xác nhận thao tác tiền** (hỏi PIN của người đang đăng nhập — D-127), "Đặt PIN", "Quên PIN?". Thay ADR-030 D-126. |

## Phương án đã cân nhắc

- **Chỉ ẩn nút, giữ API:** còn một lối đổi phiên bằng PIN mà không giao diện nào dùng — bỏ luôn cho gọn, bớt chỗ để dò PIN.
- **Cài đặt bật / tắt "Đổi người":** chủ dự án nói bỏ; thêm cài đặt là thêm thứ phải hiểu (D-220 "đơn giản hơn").

## Hệ quả

- **Thao tác tiền vẫn ghi đúng người:** ghi theo người đang đăng nhập + PIN của chính người đó (D-127 không đổi).
- **Màn quầy một màn hình (ADR-049):** hai người dùng chung một màn hình → đăng nhập bằng tài khoản có đủ vị trí cần dùng (hoặc trưởng ca); tài khoản đang đăng nhập không pha chế thì Hàng pha nhắc "Không có vị trí Pha chế — người pha đăng nhập để làm đơn".
- **Mã nguồn:** `pos-shell.js` (bỏ nút), `staff-pin.js` (bỏ `switchUserDialog`), `routes/payroll.js` + `services/userService.js` (bỏ `/auth/switch`, `switchTo`), lời nhắc ở `pos-dashboard.js`.
- **Test:** `attendance-kiosk.test.js` AC-072-04 → kiểm đã bỏ (404, phiên không đổi, thao tác ghi người đang đăng nhập); `owner-admin-only.test.js` AC-084-01 → 404; E2E AC-072-07 / AC-073-09 và AC-072-12: người khác đứng máy bằng Đăng xuất / đăng nhập, không còn nút "Đổi người".
- **Tài liệu:** FEATURE-072 (US-072-2, quy tắc 4, AC-072-04, AC-072-07), BR-109, api-contract, screens-flows, UAT-41, ADR-030 (D-126), ADR-049 / FEATURE-088 (lời nhắc), skill `cham-cong-tinh-luong`.
