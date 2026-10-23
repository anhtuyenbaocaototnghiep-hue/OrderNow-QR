# ADR-009 — Sửa / hủy phiếu nhập kho, sửa phiếu kiểm kê nháp, hủy phiếu kiểm kê đã chốt

- **Trạng thái:** ACCEPTED (21/10/2026). Chủ dự án chọn các phương án dưới đây trong phiên làm việc ngày 21/10/2026, trả lời câu hỏi trước khi code; cả 4 câu đều chọn phương án khuyến nghị. Triển khai: [TASK-060](../công-việc/TASK-060.md).
- **Bối cảnh:** chủ dự án báo: "nhập kho kiểm kê thiếu cái sửa xóa rồi".
  - **Phiếu nhập** (F-023, F-028, F-030, F-031) chỉ có Tạo và Xem. Nhập sai số lượng, giá, nguyên liệu hay nhà cung cấp thì không sửa được. Cách duy nhất là điều chỉnh tay từng nguyên liệu, nhưng làm vậy giá vốn bình quân, đơn đặt hàng và lịch sử giá nhà cung cấp vẫn sai.
  - **Phiếu kiểm kê** nháp chỉ sửa được số đếm. Không thêm / bớt được nguyên liệu, và nút Xóa nằm khuất trong hộp "Nhập số đếm". Phiếu **đã chốt** thì không làm gì được.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-39 | **Hủy phiếu nhập = giữ lịch sử.** Phiếu chuyển "Đã hủy", **bắt buộc lý do**, vẫn hiện trong danh sách (gạch ngang, ghi người / lúc / lý do). Một lần, trong một transaction, hệ thống làm các việc sau: <br>• trừ lại đúng số đã nhập (lịch sử kho `IMPORT` âm, ghi "Hủy phiếu nhập #N — lý do"); <br>• tính ngược giá vốn bình quân; <br>• trả lại giá nhập gần nhất; <br>• đơn đặt hàng (nếu phiếu nhận theo PO) trả lại phần đã nhận; <br>• bỏ giá của phiếu khỏi lịch sử giá nhà cung cấp. <br>Không xóa hẳn. |
| D-40 | **Sửa phiếu nhập giữ nguyên số phiếu.** Đổi được nguyên liệu, số lượng, giá, đơn vị, hạn dùng / mã lô, nhà cung cấp, ghi chú; **bắt buộc lý do**. Dòng giống hệt thì giữ nguyên. Dòng đổi = bỏ dòng cũ + nhập dòng mới, cùng một transaction. Phiếu ghi người / lúc / lý do sửa gần nhất; chi tiết từng lần nằm ở lịch sử kho và nhật ký thao tác. <br>**Sửa / hủy chỉ được khi đủ các điều kiện sau** (chọn phương án "khi chưa kiểm kê & còn đủ hàng"; xét trên các nguyên liệu bị ảnh hưởng): <br>• chưa có phiếu kiểm kê **chốt sau lúc nhập** → nếu có: `409 RECEIPT_AFTER_STOCKTAKE`; <br>• không nằm trong phiếu kiểm kê nháp → nếu có: `409 STOCKTAKE_LOCKED`; <br>• tồn sau khi trừ lại vẫn ≥ phần đang giữ cho đơn → nếu không: `409 RECEIPT_STOCK_USED`; <br>• nguyên liệu theo lô: lô của dòng cũ còn nguyên → nếu không: `409 RECEIPT_LOT_USED`. <br>Không giới hạn số ngày. Không đạt điều kiện thì báo rõ tên nguyên liệu và hướng làm (kiểm kê mới). |
| D-41 | **Phiếu kiểm kê.** <br>**Nháp:** sửa ghi chú, thêm / bớt nguyên liệu (bớt thì mất số đếm của dòng đó; phải còn ≥ 1 nguyên liệu); nút **Xóa** ngay ở danh sách. <br>**Đã chốt:** nút **Hủy phiếu**, bắt buộc lý do. Hủy sẽ: <br>• hoàn lại mọi điều chỉnh tồn của phiếu (`ADJUST` ngược, ghi "Hủy kiểm kê #N — lý do"); <br>• nguyên liệu theo lô: trả lại đúng các lô đã bị trừ khi chốt; phần thừa đã cộng thì trừ khỏi lô "Kiểm kê" của phiếu trước, rồi mới theo FEFO; <br>• phiếu chuyển "Đã hủy", **không tính vào hao hụt / thất thoát**. <br>Chỉ hủy được phiếu chốt **gần nhất** của mọi nguyên liệu trong phiếu → nếu không: `409 STOCKTAKE_NOT_LATEST`. Phần thừa phải còn đủ để trừ → nếu không: `409 STOCKTAKE_SURPLUS_USED`. Đếm lại = tạo phiếu mới. |
| D-42 | **Quyền.** <br>• Sửa / hủy phiếu nhập, hủy phiếu kiểm kê đã chốt: **chỉ Quản lý** (ADMIN, `/api/admin/*`). <br>• Trưởng ca (quyền `stocktake.post` — F-036): vẫn tạo / sửa / xóa phiếu kiểm kê **nháp** và chốt như hiện nay, ở quầy (`/api/ops/stocktakes`). <br>• Nhân viên: không. <br>Mọi thao tác ghi nhật ký thao tác (F-035); phiếu nhập có ảnh "trước" gồm cả các dòng. |

Chủ dự án **không chọn**:
- xóa hẳn phiếu nhập;
- giới hạn "chỉ sửa trong ngày nhập";
- chỉ cho sửa ghi chú / nhà cung cấp;
- cho trưởng ca hủy phiếu đã ghi kho.

## Thích nghi kỹ thuật

| Vấn đề | Cách làm | Lý do |
| --- | --- | --- |
| Ghi kho khi sửa / hủy | SP mới `sp_ReviseStockReceipt` (`@Mode` `EDIT` / `VOID`) chạy một transaction: <br>• khóa phiếu và nguyên liệu (`UPDLOCK, HOLDLOCK`); <br>• kiểm điều kiện D-40; <br>• dòng đổi ghi `IMPORT` **+ dòng mới trước, − dòng cũ sau** — số dư trên lịch sử không bao giờ âm giữa chừng; <br>• `IMPORT` âm mang `StockReceiptId`. | Dùng lại loại giao dịch `IMPORT`, không đổi `CK_InvTxn_Type`. Σ `IMPORT` của một phiếu = Σ dòng hiện tại (phiếu còn hiệu lực) hoặc 0 (đã hủy); test kiểm bất biến này |
| Giá vốn bình quân tính ngược | Phần còn lại sau khi bỏ dòng cũ: giá trị = tồn × `AvgCost` − SL cũ × giá cũ (giá lấy từ dòng `IMPORT` gốc, 4 chữ số lẻ). <br>Nếu còn hàng và giá trị > 0 → bình quân lại với dòng mới như `sp_ReceiveStock`. <br>Nếu không xác định được → lấy giá dòng mới, hoặc giữ nguyên `AvgCost`. <br>Dòng cũ không có giá → phần còn lại giữ `AvgCost`. | Đúng công thức F-031 chạy ngược. Đơn đã hoàn tất không tính lại giá vốn (F-031 quy tắc 4) |
| Giá nhập gần nhất | Chỉ tính lại khi phiếu này là lần nhập có giá **mới nhất** của nguyên liệu. Khi đó = giá dòng còn hiệu lực mới nhất; không còn dòng nào thì giữ nguyên | Không đè giá của phiếu nhập sau |
| Lô (F-028) | Dòng cũ phải còn nguyên lô (chưa trừ, chưa đóng) mới bỏ được → đóng lô. Dòng mới → lô mới (`RECEIPT`, `SourceId` = phiếu). Nguyên liệu bật theo lô **sau** khi nhập (dòng cũ không có lô) → `RECEIPT_LOT_USED` | Giữ bất biến Σ lô mở = tồn; không đoán lô nào là hàng của phiếu |
| Đơn đặt hàng (F-030) | `ReceivedBaseQty` −SL cũ / +SL mới, nối dòng mới vào dòng PO cùng nguyên liệu. Trạng thái tính lại: <br>• chưa nhận gì → `SENT`; <br>• đủ → `RECEIVED`; <br>• còn lại → `PARTIAL`. <br>Sửa tăng vượt số đặt → `409 OVER_RECEIPT`, cần `confirmOver`. Hủy PO chỉ tính phiếu nhập còn hiệu lực | Bất biến mới: `ReceivedBaseQty` = Σ dòng phiếu còn hiệu lực trỏ vào dòng PO |
| Lịch sử giá nhà cung cấp | Xóa dòng giá của phiếu (nguyên liệu bị ảnh hưởng). Sửa → ghi lại theo giá mới với `RecordedAt` = lúc nhập gốc. `LastPrice` = lần ghi giá mới nhất còn lại | Giá của phiếu đã hủy không được dùng làm "giá gần nhất" |
| Hủy kiểm kê | SP mới `sp_VoidStocktake`. Báo cáo hao hụt (`shrinkage`) vốn chỉ lấy `POSTED`; báo cáo thất thoát (`lossReport`) đổi sang chỉ tính giao dịch của phiếu `POSTED`, nên cả giao dịch chốt lẫn giao dịch hủy đều bị loại. "Lần kiểm kê gần nhất" ở màn Hôm nay chỉ tính `POSTED` | Phiếu đã hủy không tính hao hụt, kể cả khi hủy ở kỳ khác |
| Sửa phiếu kiểm kê nháp | `PUT …/stocktakes/{id}` `{ note, ingredientIds }`. Nguyên liệu thêm vào chụp tồn hiện tại. Phiếu đã chốt → `409 STOCKTAKE_NOT_DRAFT` | Như tạo phiếu |
| Người dùng bị xóa | `sp_DeleteUser` tính thêm `StockReceipts.VoidedBy / EditedBy`, `Stocktakes.VoidedBy` là lịch sử, nên tài khoản bị khóa thay vì xóa hẳn | Giữ khóa ngoại |

## Hệ quả

- Migration `0034_sua_huy_phieu_kho.sql` (chỉ thêm):
  - `StockReceipts`: thêm `Status` (`POSTED` / `VOIDED`, mặc định `POSTED`), `VoidedBy / VoidedAt / VoidReason`, `EditedBy / EditedAt / EditReason`;
  - `Stocktakes`: `CK_Stocktakes_Status` thêm `VOIDED`, thêm `VoidedBy / VoidedAt / VoidReason`.
  - `0035_chi_muc_phieu_kho.sql` (review G3): chỉ mục lọc `InventoryTransactions(StockReceiptId)`, `(StocktakeId)`. Migration kế tiếp lúc đó: `0036` (đã dùng cho F-049 — ADR-010).
- Mã lỗi SP mới 50190…50199 ([data-model.md](../kiến-trúc/data-model.md)).
- Business rule: BR-074 … BR-077.
- Tài liệu:
  - [FEATURE-048](../chức-năng/FEATURE-048.md), [TASK-060](../công-việc/TASK-060.md);
  - hướng dẫn [`chức-năng-mới/11-nhập-kho-kiểm-kê-giá-vốn.md`](../../chức-năng-mới/11-nhập-kho-kiểm-kê-giá-vốn.md).
- FEATURE-023 quy tắc "Phiếu đã chốt không sửa / chốt lại được" vẫn đúng: không sửa số đếm của phiếu đã chốt. Bổ sung: hủy được theo D-41.
