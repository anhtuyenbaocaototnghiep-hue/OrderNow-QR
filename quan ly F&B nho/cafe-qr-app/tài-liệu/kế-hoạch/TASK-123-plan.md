# TASK-123 — Kế hoạch: tự xác nhận chuyển khoản qua SePay (F-100, ADR-063)

## Các bước

### 1. CSDL — `0062_tien_vao_ngan_hang.sql`

- **Bảng `BankTransactions`:**
  - khóa duy nhất `(Provider, ProviderTxnId)`;
  - trạng thái `NEW` / `MATCHED` / `UNMATCHED` / `HANDLED`;
  - trigger chặn xóa (`HISTORY_NO_DELETE`).
- **Tài khoản hệ thống** `he-thong-ngan-hang` ("Tự động (ngân hàng)"):
  - đã lưu trữ, không đăng nhập được;
  - là người ghi lượt thu tự động.

### 2. Dịch vụ

- **`repositories/bankRepo.js`:** lưu, ghi kết quả, giữ chỗ khi xử lý (`claimUnmatched`), danh sách, bàn vừa đóng, tài khoản hệ thống.
- **`services/bankFeedService.js`:**
  - `isShopTransfer`: chỉ khoản có mã của quán;
  - `handleIncoming`: lưu → khớp bàn → tự thu hoặc "chưa khớp" → báo quầy;
  - `simulate`;
  - `pollOnce`: SePay v2 — tài khoản trùng số, `transaction_date_from`, `since_id`, 401 / 429;
  - `startBankFeed`: 5 giây, `JOBS_ENABLED`;
  - `status`, `list`, `matchToSession`, `resolve`.
- **`settingsService`:**
  - khóa `pay.auto_confirm`, `pay.auto_confirm_since`, `pay.sepay_since_id`;
  - bật → đặt mốc bắt đầu, quên giao dịch cuối.
- **`config.sepay`:** đọc từ `.env`.
- **`transferService`:** thêm `auto` vào mã QR.

### 3. API

- **`operations.js`:**
  - cài đặt `autoConfirm` (chỉ chủ quán — không có trong `STORE_MGR_SETTINGS`);
  - `GET /api/admin/bank-feed`, `POST /api/admin/bank-feed/simulate` (chỉ chủ quán).
- **`staff.js`** (thu ngân):
  - `GET /api/bank-transactions`;
  - `POST /api/bank-transactions/{id}/match`;
  - `POST /api/bank-transactions/{id}/resolve`.
- **`server.js`:** `startBankFeed()`.
- **Realtime:** `bank.received`, `bank.updated` (room `staff`).

### 4. Giao diện

- **`ui.js`:** `speak()` (giọng tiếng Việt của máy; không có thì thôi).
- **`pos-dashboard.js` + `pos/index.html` + `pos.css`:**
  - dải `#bank-strip`;
  - hộp xử lý: ghép bàn / lý do nhanh / ghi chú;
  - chuông + đọc to khi `bank.received`.
- **`admin-settings.js`:** công tắc, trạng thái, hộp "Giả lập tiền vào".
- **`t-track.js`:** câu "quán tự xác nhận khi tiền vào" khi `auto`.

### 5. Test

- `bank-feed.test.js` (máy chủ SePay giả bằng `node:http`).
- E2E AC-100-06.

### 6. Tài liệu

- ADR-063, FEATURE-100, BR-129, US-100-1.
- api-contract, data-model, realtime-events, screens-flows, roles-permissions, tc-map.
- `.agent/rules.md`.
- `.env.example`, sổ bí mật S-12.
- Hướng dẫn vận hành SePay.

## Rủi ro

1. **Máy tự ghi đã thu.** Đây là ngoại lệ của D-1/D-2/D-3; ADR-063 chỉ cho khi đủ 4 điều kiện D-250. Khách vẫn không có API nào đổi trạng thái thanh toán.
2. **Tài khoản cá nhân có tiền riêng.** Chỉ lưu khoản có mã của quán; tiền khác không vào CSDL, không hiện ở quầy.
3. **Khóa SePay xem được mọi giao dịch.** Khóa chỉ để ở `.env`, không vào CSDL / giao diện / nhật ký; hướng dẫn ghi cách thu hồi.
4. **SePay trả lại giao dịch cũ** (`since_id` không như mong đợi). Đã có ba lớp chặn: khóa duy nhất, mốc thời gian lúc bật, chỉ xét khoản có mã của quán.
5. **Số trên mã QR khác số phải thu lúc khớp** (giảm giá áp ở quầy sau khi khách quét). Không tự thu, khoản về "chưa khớp" để nhân viên xử lý.
6. **Migration chạy trên CafeQrDev:** chỉ thêm bảng + một tài khoản hệ thống (có sao lưu trước).
