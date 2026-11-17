# TASK-122 — Kế hoạch: chuyển khoản bằng VietQR (F-099, ADR-062)

## Các bước

### 1. CSDL
- `0061_chuyen_khoan_vietqr.sql`: `Sessions.PayMethodHint` (`CASH` | `TRANSFER`), CHECK.
- `sp_RequestPayment`: thêm `@Method` (mặc định NULL → `CASH`).

### 2. Miền / dịch vụ
- `domain/vietqr.js`: `toCard` → QRIBFTTC.
- `services/transferService.js` (mới):
  - `contentFor`, `transferQr`, `transferForStaff`;
  - `settingsService`: 5 khóa `pay.*`, `transferReady`, `/api/shop` → `transfer.enabled`;
  - `sessionService`: `requestPayment(method)` (chặn `TRANSFER_OFF`, sự kiện thêm `payMethod`), `transferForCustomer`, phiếu tạm tính thêm `transfer`.

### 3. API
- `public.js`: `request-payment` nhận `{ method }`; `GET /api/sessions/{id}/transfer`.
- `staff.js`: `POST /api/payments/transfer-qr` (thu ngân).
- `operations.js`: cài đặt mới (chỉ chủ quán — không có trong `STORE_MGR_SETTINGS`).

### 4. Giao diện
- `admin-settings.js`: khối "Nhận chuyển khoản".
- `t-track.js`: hộp Gọi thanh toán có 2 lựa chọn; khung mã QR (lưu ảnh, chép); khung "Đã gọi thanh toán" ghi chuyển khoản + "Xem mã QR".
- `pos-dashboard.js`:
  - hộp Thu tiền hiện mã khi chọn "Chuyển khoản" và chọn sẵn theo khách;
  - dải Gọi thanh toán ghi "chuyển khoản";
  - thông báo kèm âm báo ghi "chuyển khoản".
- `pos-takeaway.js`: hiện mã khi chọn chuyển khoản.
- `pos-receipt.js`: phiếu tạm tính in mã.
- `customer.css` / `pos.css`.

### 5. Test
- `transfer-qr.test.js`.
- E2E AC-099-05.
- a11y khung mã.

### 6. Tài liệu
ADR-062, FEATURE-099, BR-128, api-contract, data-model, screens-flows, roles-permissions, tc-map, `.agent/rules.md` (ngoại lệ D-1/D-2/D-3).

## Rủi ro

1. **Đổi quy tắc gốc D-1/D-2/D-3.** ADR-062 giữ "đã trả chỉ do nhân viên ghi". Không có API nào cho khách đổi trạng thái thanh toán.
2. **Số trên điện thoại khác số quầy thu** (ưu đãi / giảm tay áp ở quầy). Hộp Thu tiền hiện mã theo số phải thu thật; nhân viên xử lý phần chênh như thu tiền thường.
3. **Số thẻ** (QRIBFTTC): chưa phải app ngân hàng nào cũng chuyển tới thẻ được. Chủ quán thử chuyển 1.000đ; không được thì đổi sang số tài khoản trong Cài đặt.
4. **Migration chạy trên CafeQrDev:** chỉ thêm cột (có sao lưu trước).
