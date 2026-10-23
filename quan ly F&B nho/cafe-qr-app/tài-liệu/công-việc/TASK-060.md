# TASK-060 — Sửa / hủy phiếu nhập kho, sửa / hủy phiếu kiểm kê
Status: READY_FOR_REVIEW (21/10/2026)
Feature: [FEATURE-048](../chức-năng/FEATURE-048.md) · Quyết định: [ADR-009](../quyết-định/ADR-009-sua-huy-phieu-kho.md) D-39…D-42 · Module: MOD-INVENTORY, MOD-ADMIN (nhật ký thao tác) · Màn hình: SCR-31 (Nhập kho & kiểm kê), SCR-17 (Kho & sơ chế — Kiểm kê)
Nguồn: chủ dự án báo 21/10/2026: "nhập kho kiểm kê thiếu cái sửa xóa rồi". 4 câu hỏi nghiệp vụ đã được trả lời trước khi code. · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-060-sua-huy-phieu-kho` · Phụ thuộc: TASK-033 (F-023), TASK-039…041 (lô, PO, giá vốn), TASK-044 (F-036)

## Mục tiêu
Quản lý sửa / hủy được phiếu nhập kho mà tồn, giá vốn, lô, đơn đặt hàng và lịch sử giá vẫn đúng. Phiếu kiểm kê nháp sửa / xóa được ngay trên danh sách. Phiếu kiểm kê đã chốt hủy được. Mọi thao tác giữ lịch sử, có lý do và ghi nhật ký.

## Phạm vi sửa
- **CSDL:**
  - `chuyển-đổi/0034_sua_huy_phieu_kho.sql` (chỉ thêm cột / mở rộng CHECK);
  - `thủ-tục/sp_ReviseStockReceipt.sql`, `sp_VoidStocktake.sql` (mới);
  - `sp_DeleteUser.sql` (tham chiếu mới).
- **Server:**
  - `errors.js` (50190…50199);
  - `stockRepo` / `stockService` (sửa / hủy, sửa nháp);
  - `routes/operations.js`, `routes/ops.js`;
  - `middleware/audit.js` (ảnh trước phiếu nhập kèm dòng; luật quầy `PUT /ops/stocktakes/{id}`);
  - `purchasingRepo.cancelPo` (chỉ tính phiếu còn hiệu lực);
  - `inventoryRepo.lossReport`, `dashboardRepo.todos` (chỉ kiểm kê `POSTED`).
- **Giao diện:**
  - `js/pages/admin-stock.js` (cột trạng thái, chi tiết + Sửa / Hủy, form sửa dùng chung bộ nhập dòng);
  - `js/stocktake.js` (Sửa / Xóa nháp trên danh sách, Hủy phiếu đã chốt khi `canVoid`);
  - `css/admin.css` hoặc `base.css` (dòng đã hủy).
- **Test:**
  - `tests/stock-revise.test.js` (mới);
  - bất biến mới trong `tests/helpers/testDb.js`;
  - E2E mới trong `kiểm-thử/e2e/flow.spec.js`.
- **Tài liệu:**
  - ADR-009, FEATURE-048, TASK-060;
  - BR-074…077, US-048-1…4;
  - `tc-map`, `traceability`, `api-contract`, `data-model`, `roles-permissions`, `actors` (AF);
  - hướng dẫn `chức-năng-mới/11-…`, README chức năng / công việc.

## Không được sửa
- Công thức nhập kho / chốt kiểm kê hiện có (`sp_ReceiveStock`, `sp_PostStocktake`).
- Giá vốn của đơn đã hoàn tất.
- Dữ liệu thật trong `CafeQrDev`: chỉ chạy migration cộng dồn.
- Quyền hiện có của trưởng ca (F-036).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` (gồm bất biến sau mọi bộ) · `npm run test:e2e` · `npm run trace -- --check` · migrate `CafeQrDev` (`node --env-file-if-exists=.env kịch-bản/db-migrate.js`).

## Cần hỏi duyệt nếu
- Phải đổi / xóa dữ liệu đã có.
- Phải đổi cách tính giá vốn đơn đã hoàn tất.
- Muốn mở quyền cho trưởng ca.

## Review G3 (agent độc lập, 21/10/2026)
Kết luận lần 1: **Request changes**. Đã sửa:

| # | Phát hiện | Xử lý |
| --- | --- | --- |
| M1 (phải sửa) | Sửa phiếu nhận theo PO quy đổi lại dòng theo bảng đơn vị chung, không theo quy cách gói của PO. Ví dụ thùng 12 lít bị tính thành 24 lon × 330 ml. Hậu quả: chỉ đổi ghi chú cũng làm sai tồn / giá vốn / PO | `stockService.editLines`: <br>• dòng người dùng không đổi → giữ đúng SL / giá đã lưu; <br>• dòng theo gói của PO → quy theo `PackSize` của dòng PO; <br>• còn lại → bảng đơn vị. <br>Màn Sửa hiện đúng đơn vị gói không có trong bảng. Test mới **FAIL với cách cũ**, PASS với cách mới |
| M2 (phải sửa) | Sửa dòng theo lô, hạn để trống → hạn tính từ ngày sửa (gia hạn hàng) | Hạn tính theo **ngày nhập gốc**; lô mới giữ `ReceivedAt` gốc (thứ tự FEFO); có test |
| S1 | Hủy kiểm kê mở lại lô đã đóng còn số (sau khi tắt / bật theo lô) → Σ lô ≠ tồn | Bỏ các lô đó khỏi danh sách trả lại; phần đó thành lô `ADJUST` mới; có test. Nguyên nhân gốc ở `sp_SetTrackLots` ghi **DEF-013** (mở, ngoài phạm vi) |
| S2 | `STOCKTAKE_LOCKED` không kèm tên nguyên liệu | Cả 2 SP trả tên; thông báo riêng; có test (kể cả hủy kiểm kê khi có phiếu nháp khác) |
| N1 | Thứ tự khóa khác `sp_ReceiveStock` | Khóa PO + dòng PO ngay sau phiếu |
| N2 | `LastPrice` NCC bị tính lại cả khi phiếu không phải lần ghi giá mới nhất | Chỉ tính lại khi phiếu là lần ghi giá mới nhất của NCC cho nguyên liệu đó |
| N4 | Không gửi ghi chú / nhà cung cấp thì bị xóa | Không gửi = giữ nguyên (phiếu nhập và phiếu kiểm kê nháp); có test |
| N7 | Thiếu chỉ mục tra giao dịch theo phiếu | Migration `0035_chi_muc_phieu_kho.sql` |
| N8 | Nút trên danh sách kiểm kê trùng tên | Tên nút có số phiếu |

**Chưa làm** (ghi lại, rủi ro thấp):
- N3: hai phiếu kiểm kê chốt trong cùng một giây thì so thứ tự theo số phiếu.
- N5: nguyên liệu đã xóa nằm trong phiếu nhập / phiếu nháp.
- N6: số gói > 3 chữ số lẻ.
- N9: dòng PO không nối, chỉ gặp qua API.

## Kết quả thực chạy (21/10/2026, sau khi sửa theo review)

| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **268/268 PASS** (20 file; `stock-revise.test.js` 13 test; bất biến `RECEIPT_LEDGER_MISMATCH`, `STOCKTAKE_LEDGER_MISMATCH`, `PO_RECEIVED_MISMATCH` đúng sau mọi bộ) |
| Test M1 với cách quy đổi cũ | **FAIL** đúng chỗ (gói 12 lít bị tính theo bảng đơn vị) — code đã khôi phục |
| `npm run test:e2e` | **36/36 PASS** (33 luồng + 3 khả năng tiếp cận) |
| `node kịch-bản/traceability.js --check` | 119 US, 300 AC — PASS 300, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| Migration `CafeQrDev` | `0034`, `0035` + SP mới đã áp (chỉ thêm cột / chỉ mục) |
