# FEATURE-048 — Sửa / hủy phiếu nhập kho, sửa phiếu kiểm kê nháp, hủy phiếu kiểm kê đã chốt

> **Nguồn:** chủ dự án báo 21/10/2026: "nhập kho kiểm kê thiếu cái sửa xóa rồi". Quyết định: [ADR-009](../quyết-định/ADR-009-sua-huy-phieu-kho.md) D-39…D-42.

- **Status:** CONFIRMED (ADR-009) · Triển khai: [TASK-060](../công-việc/TASK-060.md)
- **Actor:**
  - **ACT-ADMIN:** sửa / hủy phiếu nhập; hủy phiếu kiểm kê đã chốt.
  - **ACT-LEAD + ACT-ADMIN:** sửa / xóa phiếu kiểm kê nháp.
- **Màn hình:** S-31 **Quản lý → Nhập kho & kiểm kê** (SCR-31); S-17 **Quầy → Kho & sơ chế → Kiểm kê** (SCR-17, trưởng ca).
  - **Tab Nhập kho:**
    - danh sách có cột **Trạng thái**: "Đã sửa" hoặc "Đã hủy" (dòng gạch ngang);
    - bấm phiếu → hộp chi tiết có nút **Sửa** và **Hủy phiếu**;
    - **Sửa** mở form dòng như phiếu mới, điền sẵn dữ liệu cũ, kèm ô **Lý do sửa** (bắt buộc);
    - **Hủy phiếu** hỏi lý do;
    - phiếu đã hủy chỉ xem, có ghi người / lúc / lý do.
  - **Tab Kiểm kê** (dùng chung với quầy):
    - phiếu nháp có nút **Sửa** (ghi chú, chọn nguyên liệu) và **Xóa** ngay trên danh sách;
    - phiếu đã chốt có **Hủy phiếu** (chỉ màn quản lý);
    - phiếu đã hủy có nhãn "Đã hủy".
- **Dữ liệu:** migration `0034_sua_huy_phieu_kho.sql` + `0035_chi_muc_phieu_kho.sql` (chỉ mục).
  - `StockReceipts.Status` (`POSTED` / `VOIDED`), `VoidedBy / VoidedAt / VoidReason`, `EditedBy / EditedAt / EditReason`.
  - `Stocktakes.Status` thêm `VOIDED`, cùng `VoidedBy / VoidedAt / VoidReason`.
- **SP:**
  - mới: `sp_ReviseStockReceipt`, `sp_VoidStocktake`;
  - sửa: `sp_DeleteUser` (thêm tham chiếu lịch sử).

## User Story

- **US-048-1:** Là quản lý, tôi muốn sửa phiếu nhập kho đã lưu (nguyên liệu, số lượng, giá, nhà cung cấp, ghi chú), để tồn kho và giá vốn đúng với hóa đơn thật khi lỡ nhập sai.
- **US-048-2:** Là quản lý, tôi muốn hủy phiếu nhập nhập nhầm mà vẫn giữ lịch sử, để kho trở lại như trước và vẫn đối soát được ai hủy, vì sao.
- **US-048-3:** Là trưởng ca / quản lý, tôi muốn sửa phiếu kiểm kê nháp (thêm / bớt nguyên liệu, ghi chú) và xóa nháp ngay từ danh sách, để không phải tạo lại phiếu khi chọn thiếu / thừa nguyên liệu.
- **US-048-4:** Là quản lý, tôi muốn hủy phiếu kiểm kê đã chốt bị đếm sai, để tồn kho trở lại như trước khi chốt và báo cáo hao hụt không tính phiếu sai.

## Quy tắc (D-39…D-42)

1. **Lý do bắt buộc** cho sửa / hủy phiếu nhập và hủy phiếu kiểm kê. Thiếu → `400 VALIDATION_ERROR`.
2. **Sửa phiếu nhập:**
   - dòng giống hệt (SL, giá, đơn vị đóng gói, hạn dùng, mã lô) giữ nguyên, không sinh giao dịch;
   - dòng đổi / thêm / bỏ → lịch sử kho `IMPORT` "+ dòng mới" rồi "− dòng cũ", ghi "Sửa phiếu nhập #N — lý do";
   - giữ số phiếu; phải còn ≥ 1 dòng (muốn bỏ hết thì Hủy phiếu);
   - phiếu theo PO giữ nhà cung cấp của PO.
3. **Hủy phiếu nhập:** mọi dòng `IMPORT` âm "Hủy phiếu nhập #N — lý do"; phiếu `VOIDED`, dòng phiếu giữ nguyên để xem lại; không tính vào tổng tiền nhập.
4. **Điều kiện sửa / hủy phiếu nhập** (xét trên nguyên liệu bị ảnh hưởng), không đạt thì không đổi gì:
   1. phiếu còn hiệu lực, nếu không → `409 RECEIPT_VOIDED`;
   2. không có phiếu kiểm kê nháp chứa nguyên liệu, nếu có → `409 STOCKTAKE_LOCKED`;
   3. chưa có phiếu kiểm kê **chốt từ lúc nhập trở đi**, nếu có → `409 RECEIPT_AFTER_STOCKTAKE` kèm tên nguyên liệu;
   4. nguyên liệu theo lô: lô của dòng cũ còn nguyên, nếu không → `409 RECEIPT_LOT_USED` kèm tên;
   5. tồn − SL cũ + SL mới ≥ phần đang giữ cho đơn, nếu không → `409 RECEIPT_STOCK_USED` kèm tên.
5. **Giá vốn:**
   - **Bình quân:** tính ngược phần của dòng cũ rồi bình quân với dòng mới (ADR-009). Đơn đã hoàn tất giữ giá vốn cũ.
   - **Giá nhập gần nhất:** chỉ tính lại nếu phiếu này là lần nhập có giá mới nhất của nguyên liệu.
6. **Đơn đặt hàng:**
   - số đã nhận −SL cũ / +SL mới, trạng thái tính lại (`SENT` / `PARTIAL` / `RECEIVED`);
   - sửa tăng vượt số đặt → `409 OVER_RECEIPT` (cần xác nhận);
   - lịch sử giá nhà cung cấp bỏ giá của phiếu hủy, ghi lại giá mới khi sửa.
7. **Kiểm kê nháp:** sửa ghi chú + danh sách nguyên liệu.
   - Thêm → chụp tồn hiện tại; bớt → mất số đếm dòng đó.
   - Danh sách rỗng → `400`. Phiếu không còn nháp → `409 STOCKTAKE_NOT_DRAFT`.
8. **Hủy kiểm kê đã chốt:**
   - Hoàn lại từng chênh lệch (`ADJUST` = −chênh lệch, "Hủy kiểm kê #N — lý do").
   - Nguyên liệu theo lô:
     - thiếu → trả lại đúng các lô đã bị trừ;
     - thừa → trừ lô "Kiểm kê" của phiếu trước, rồi FEFO.
   - Phiếu `VOIDED`; báo cáo hao hụt, thất thoát và "lần kiểm kê gần nhất" không tính phiếu này.
   - Phiếu không phải đã chốt → `409 STOCKTAKE_NOT_POSTED`.
   - Có phiếu chốt sau đó cùng nguyên liệu → `409 STOCKTAKE_NOT_LATEST` kèm tên.
   - Tồn − phần thừa < đang giữ → `409 STOCKTAKE_SURPLUS_USED` kèm tên.
   - Nguyên liệu đang trong phiếu nháp khác → `409 STOCKTAKE_LOCKED`.
9. **Quyền:**
   - `/api/admin/*` (ADMIN) cho mọi thao tác;
   - trưởng ca chỉ `PUT /api/ops/stocktakes/{id}` (sửa nháp) + xóa nháp như cũ;
   - nhân viên / trưởng ca gọi API quản lý → `403`.
   - Nhật ký thao tác ghi `stock-receipts.update`, `stock-receipts.void`, `stocktakes.update`, `stocktakes.void`, `stocktake.update` (quầy).

## API

| Method & path | Quyền | Body → kết quả |
| --- | --- | --- |
| `PUT /api/admin/stock-receipts/{id}` | ADMIN | `{ supplier?, note?, reason, lines[] (như tạo phiếu), confirmOver? }` → phiếu sau sửa |
| `POST /api/admin/stock-receipts/{id}/void` | ADMIN | `{ reason }` → phiếu `VOIDED` |
| `GET /api/admin/stock-receipts[/{id}]` | ADMIN | thêm `status`, `edited*` / `voided*`, `poId`; dòng có `lotCode` |
| `PUT /api/admin/stocktakes/{id}`, `PUT /api/ops/stocktakes/{id}` | ADMIN / `stocktake.post` | `{ note?, ingredientIds[≥1] }` → phiếu nháp |
| `POST /api/admin/stocktakes/{id}/void` | ADMIN | `{ reason }` → phiếu `VOIDED` |

Realtime: sửa / hủy phiếu nhập phát `inventory.received` `{ receiptId, revised: true }` tới quầy, để màn kho tải lại.

## Acceptance Criteria

- AC-048-01: Quản lý sửa phiếu nhập (sữa tươi 1.000 ml × 30đ → 800 ml × 30đ, đường giữ nguyên), có lý do. Kết quả:
  - tồn sữa −200; số phiếu giữ nguyên;
  - lịch sử kho có "Sửa phiếu nhập #N" +800 / −1.000; đường không có giao dịch mới;
  - phiếu ghi người / lúc / lý do sửa.
- AC-048-02: Hủy phiếu nhập kèm lý do. Kết quả:
  - tồn trừ lại đủ; phiếu "Đã hủy" vẫn trong danh sách, có lý do;
  - Σ `IMPORT` của phiếu = 0;
  - hủy lại hoặc sửa phiếu đã hủy → `409 RECEIPT_VOIDED`; thiếu lý do → `400`.
- AC-048-03: Giá vốn bình quân tính ngược:
  - tồn 0 → nhập A 1.000 × 30, rồi B 1.000 × 40 → bình quân 35;
  - hủy B → bình quân 30, giá nhập gần nhất 30;
  - sửa A giá 30 → 20 → bình quân 20.
- AC-048-04: Không đổi gì và báo kèm tên nguyên liệu khi:
  - hàng của phiếu đã dùng (tồn còn lại < phần đang giữ) → `409 RECEIPT_STOCK_USED`;
  - có phiếu kiểm kê chốt sau lúc nhập → `409 RECEIPT_AFTER_STOCKTAKE`;
  - nguyên liệu đang trong phiếu kiểm kê nháp → `409 STOCKTAKE_LOCKED`.
- AC-048-05: Nguyên liệu theo lô:
  - sửa dòng → lô cũ đóng, lô mới đúng SL / hạn mới;
  - hủy phiếu có lô còn nguyên → lô đóng;
  - lô đã dùng một phần → `409 RECEIPT_LOT_USED`;
  - luôn giữ Σ lô mở = tồn.
- AC-048-06: Phiếu nhận theo đơn đặt hàng:
  - sửa giảm → PO `PARTIAL`;
  - hủy → PO trở về `SENT`, số đã nhận 0;
  - sửa tăng vượt số đặt → `409 OVER_RECEIPT`; có `confirmOver` → được.
- AC-048-07: Phiếu kiểm kê nháp:
  - sửa ghi chú, thêm / bớt nguyên liệu; bớt hết → `400`;
  - xóa từ danh sách;
  - sửa phiếu đã chốt → `409 STOCKTAKE_NOT_DRAFT`;
  - trưởng ca sửa được ở quầy.
- AC-048-08: Hủy phiếu kiểm kê đã chốt (thiếu 100 ml sữa, thừa 50 g đường), có lý do. Kết quả:
  - tồn sữa +100, đường −50; phiếu "Đã hủy";
  - báo cáo hao hụt và thất thoát của kỳ không còn tính phiếu này;
  - nguyên liệu theo lô: lô bị trừ được trả lại, Σ lô = tồn.
- AC-048-09: Chặn hủy kiểm kê:
  - có phiếu chốt sau cùng nguyên liệu → `409 STOCKTAKE_NOT_LATEST`;
  - phần thừa đã dùng → `409 STOCKTAKE_SURPLUS_USED`;
  - phiếu nháp → `409 STOCKTAKE_NOT_POSTED`.
- AC-048-10: Quyền và nhật ký:
  - nhân viên và trưởng ca gọi sửa / hủy phiếu nhập hoặc hủy kiểm kê → `403`;
  - mỗi lần sửa / hủy có trong nhật ký thao tác; ảnh "trước" của phiếu nhập có các dòng cũ.
- AC-048-11: Màn Nhập kho & kiểm kê:
  - quản lý sửa rồi hủy một phiếu nhập trên giao diện → dòng hiện "Đã sửa" rồi "Đã hủy" (gạch ngang);
  - tab Kiểm kê: phiếu nháp có Sửa / Xóa trên danh sách; phiếu đã chốt có "Hủy phiếu" → nhãn "Đã hủy".

## Bằng chứng

- `tests/stock-revise.test.js` (AC-048-01…10).
- `kiểm-thử/e2e/flow.spec.js` → "sửa / hủy phiếu nhập kho và phiếu kiểm kê (F-048)" (AC-048-11).
- Bất biến thêm ở `helpers/testDb.js`, chạy sau mọi bộ test:
  - `RECEIPT_LEDGER_MISMATCH`: Σ `IMPORT` của phiếu = Σ dòng (hoặc 0 nếu đã hủy);
  - `STOCKTAKE_LEDGER_MISMATCH`: Σ giao dịch của phiếu kiểm kê = Σ chênh lệch (hoặc 0 nếu đã hủy);
  - `PO_RECEIVED_MISMATCH`: số đã nhận của dòng PO = Σ dòng phiếu còn hiệu lực.
