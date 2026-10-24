# ADR-019 — Thu bằng chuyển khoản, thu chung nhiều bàn, tách hóa đơn theo món

- **Trạng thái:** ACCEPTED (24/10/2026). Chủ dự án yêu cầu: "thêm chức năng gộp hóa đơn và tách hóa đơn và khi thanh toán nhân viên có thêm mục chuyển khoản … để biết, chứ trên máy có tiền mặt, khi thanh toán chuyển khoản bấm vậy sẽ thiếu tiền và thất thoát". Trả lời 4 câu hỏi trước khi code (bên dưới).
- **Thay một phần ADR-000 D-1:** vẫn **không** tích hợp cổng thanh toán / QR động / webhook ngân hàng; chỉ thêm việc **ghi nhận** lượt thu bằng chuyển khoản.
- **Bối cảnh:**
  - ADR-000 chỉ cho thu tiền mặt. Khách chuyển khoản vào tài khoản quán thì nhân viên vẫn phải bấm "Đã thu tiền" → lượt thu tính vào tiền mặt dự kiến trong két → đóng ca thấy **thiếu tiền** dù không mất tiền thật; không phân biệt được với thất thoát thật.
  - CSDL đã chừa chỗ: `Payments.Method` (chỉ cho `'CASH'`), `Orders.PaymentMethod` (chỉ `'CASH'`).
  - Đã có chia bill theo người (F-026, ADR-006): khách tự chọn món trên điện thoại, hoặc quầy "+ Thêm phần" rồi đổi từng món bằng menu thả xuống, thu từng phần.
  - Câu hỏi đưa chủ dự án chọn: cách xác nhận chuyển khoản; trả kết hợp tiền mặt + chuyển khoản; "gộp hóa đơn" nghĩa là gì; "tách hóa đơn" cần thêm cách nào.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-71 | **Thu bằng chuyển khoản — nhân viên chọn rồi bấm xác nhận.** Ở mọi lượt thu (thu tiền bàn, thu từng phần chia bill, bán mang đi) có hai lựa chọn **Tiền mặt** / **Chuyển khoản**. Chuyển khoản: không nhập "tiền khách đưa", không có tiền thừa; nhân viên xem tiền đã về tài khoản quán (app ngân hàng) rồi bấm **"Đã nhận chuyển khoản & In bill"**. App **không** hiện mã QR, **không** tự đối soát với ngân hàng (chủ dự án chọn). **Mỗi lượt thu một cách trả**; khách muốn trả một phần tiền mặt, một phần chuyển khoản thì tách hóa đơn rồi thu từng phần. Số phải thu (khuyến mãi, hội viên, giảm giá, làm tròn) **không đổi** theo cách trả. |
| D-72 | **Két chỉ tính tiền mặt.** Tiền mặt dự kiến khi đóng ca = tiền đầu ca + Σ lượt thu **tiền mặt** − Σ hoàn tiền của lượt thu **tiền mặt** + thu khác − chi quỹ (đã duyệt). Lượt thu chuyển khoản vẫn gắn ca, vẫn tính doanh thu, nhưng không cộng vào két. **Hoàn tiền theo cách khách đã trả**: hoàn lượt chuyển khoản = chuyển trả khách, không trừ két. Màn Ca & hoàn tiền, báo cáo, danh sách lượt thu và bill in ghi rõ cách trả; doanh thu tổng không đổi. |
| D-73 | **"Gộp hóa đơn" = thu chung nhiều bàn một lần.** Trong ngăn Thu tiền bàn A, nhân viên bấm **"Thu chung với bàn khác"**, tích các bàn / nhóm đang phục vụ → ngăn hiện **tổng chung** (đơn xếp theo bàn; khuyến mãi đơn giữ nguyên, hội viên / giảm giá / voucher tính trên cả tổng) → thu một lần, **in một bill**, **đóng tất cả các bàn**. Gộp chỉ xảy ra **đúng lúc thu**, trong cùng một transaction với lượt thu: thu không thành (tiền vừa đổi, còn đơn chờ tiếp nhận, ca đã đóng…) thì không gộp gì. Bỏ chọn / đóng ngăn trước khi thu thì các bàn vẫn riêng. Không gộp nhóm đang chia bill. Điện thoại khách ở các bàn được gộp chuyển sang màn "Đã thanh toán" của bàn A và đánh giá món được như khách bàn A. |
| D-74 | **Tách hóa đơn theo món — nút rõ ràng ở quầy.** Ngăn Thu tiền bàn có nút **"Tách hóa đơn"**: hộp thoại liệt kê các món chưa thu, chọn bằng **ô tích**, đặt tên phần (mặc định "Phần N") → **một lần bấm** tạo phần mới và chuyển các món đã chọn vào phần đó (một transaction). Bàn chưa chia bill thì các món còn lại vào phần **"Phần còn lại"** để thành hai hóa đơn độc lập (nếu để ở "Chung", phần vừa tách là phần cuối nên sẽ tự gộp món Chung theo F-026). Món gọi thêm sau đó vào "Chung" như F-026. Cách cũ (menu thả xuống từng món, khách tự chọn trên điện thoại) giữ nguyên. |

Chủ dự án **không chọn**:
- hiện mã VietQR có sẵn số tiền ở quầy (D-71 chọn "chỉ bấm xác nhận");
- tự xác nhận qua dịch vụ ngân hàng (SePay / Casso — cần đăng ký, có phí, cần địa chỉ internet công khai);
- trả kết hợp tiền mặt + chuyển khoản trong một lượt thu;
- gộp hẳn nhóm vào nhau ngay khi bấm (trước lúc thu);
- chia đều theo số người, tách theo số tiền tùy ý.

## Thích nghi kỹ thuật

| Vấn đề | Cách làm | Lý do |
| --- | --- | --- |
| Lưu cách trả | Migration 0039 nới CHECK `Payments.Method` và `Orders.PaymentMethod` thành `('CASH','TRANSFER')`. Lượt chuyển khoản ghi `AmountReceived = AmountDue` (tiền thừa 0 — cột tính sẵn) | Cột có sẵn từ ADR-000; không đổi cột tính `ChangeGiven` / ràng buộc `AmountReceived ≥ AmountDue` |
| Két | `sp_CloseShift` và truy vấn ca đang mở (`shiftsRepo`) chỉ cộng `Method = 'CASH'`, chỉ trừ hoàn tiền của lượt `CASH`; thêm số liệu `transferIn`, `transferRefunds` | Một công thức cho đóng ca và màn ca đang mở |
| Thu chung | Cột mới `Sessions.MergedIntoSessionId` (FK tự tham chiếu). Thủ tục mới `sp_MergeSessions` (khóa các phiên; kiểm còn mở, không chia bill; chuyển `Orders.SessionId` sang phiên A — **giữ `Orders.TableId`** bàn gốc; chép thành viên điện thoại sang A; đóng phiên nguồn, ghi `MergedIntoSessionId`). Service chạy `sp_MergeSessions` rồi `sp_SettleSession` **trong cùng một transaction** (`inTransaction`) | Dùng lại nguyên bộ tính tiền / thu tiền đã kiểm; lỗi ở bất kỳ bước nào → rollback cả gộp; đơn và bill vẫn ghi bàn gốc. Phân tích "Theo bàn" (F-042) tính theo lượt thu nên doanh thu thu chung ghi vào bàn thu (bàn A), số lượt ngồi của bàn được gộp không tính — chấp nhận (một nhóm, một lượt thu) |
| Xem trước tổng chung | `POST /api/sessions/{id}/settle/preview` và `…/settle` nhận thêm `mergeSessionIds` (tối đa 10); phiếu tạm tính `/pos/sessions/{id}/receipt?mode=provisional&merge=…` | Không thêm luồng tính tiền mới |
| Tách theo món | Endpoint mới (quầy) `POST /api/sessions/{id}/splits/separate` `{ label, orderItemIds[] }` — một transaction: tạo phần (và phần Chung nếu chưa có) + chuyển các dòng chưa thu | Tránh trạng thái dở dang khi chuyển từng món một qua nhiều request |
| Quyền / ca | Như thu tiền hiện tại: nhân viên trở lên, cần ca mở (F-018); tách hóa đơn cần ca mở như chia bill (F-055) | Không thêm quyền mới |

## Hệ quả

- Migration **0039** (chỉ thêm / nới ràng buộc, không đổi dữ liệu cũ — lượt thu cũ đều là `CASH`). Thủ tục đổi: `sp_SettleSession`, `sp_SettleSplit`, `sp_SubmitOrder` (mang đi), `sp_CloseShift`; mới: `sp_MergeSessions`.
- API: thêm `method` ở các lượt thu; `mergeSessionIds` ở thu tiền bàn; endpoint tách hóa đơn; số liệu ca thêm `transferIn`; báo cáo thêm phần chia theo cách trả.
- Feature: [FEATURE-056](../chức-năng/FEATURE-056.md) (chuyển khoản), [FEATURE-057](../chức-năng/FEATURE-057.md) (thu chung nhiều bàn), [FEATURE-058](../chức-năng/FEATURE-058.md) (tách hóa đơn theo món). Task: [TASK-073](../công-việc/TASK-073.md). Business rule: BR-088…BR-091.
