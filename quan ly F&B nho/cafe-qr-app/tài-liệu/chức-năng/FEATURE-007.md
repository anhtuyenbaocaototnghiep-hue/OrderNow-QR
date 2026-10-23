# FEATURE-007 — Dashboard quầy: nhận đơn realtime, tiếp nhận, hoàn tất & trừ kho, nhận yêu cầu thanh toán

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §8 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

- **Status:** CONFIRMED — hoàn tất theo đơn (Q-006), có nút Tiếp nhận (Q-004b) theo ADR-003; trừ kho theo ADR-001. Đã triển khai 14/10/2026
- **Source:** US5, US6 (bản 1); US4, US5 (bản 2); Module 3.1, 3.2, 4.2; Actor 1.2; D-2
- **Actor:** STAFF, ADMIN
- **Điều kiện trước:** Đăng nhập, tài khoản active.
- **Màn hình (S-10):** Dải trên cùng **"Gọi thanh toán"** (các bàn đang chờ thu tiền, thời gian chờ, nhấp để mở S-14). Dưới là ba cột: **Mới** (`PENDING`), **Đang pha** (`PREPARING`), **Đã xong** (`COMPLETED` hôm nay). Thẻ đơn: mã đơn, bàn/mang đi, thời gian, danh sách món + ghi chú, tổng tiền, nhãn Chưa thu/Đã thu. Góc trên: nút **"Bán mang đi"** (S-13) và danh sách bàn đang phục vụ.
- **Luồng realtime:** Khi mở: `GET /api/orders?status=PENDING,PREPARING&since=<đầu ngày>` và `GET /api/sessions?status=OPEN,PAYMENT_REQUESTED` rồi subscribe room `staff`. `order.created` → "Ting" + thẻ nảy vào cột Mới. `session.payment_requested` → âm thanh khác + thẻ vào dải Gọi thanh toán. Mất kết nối → icon "Mất kết nối" + lưu `lastEventAt`; reconnect → fetch lại với `since=lastEventAt` → nếu có đơn/yêu cầu mới → banner "Có đơn hàng bị trễ".
- **Hành động trên thẻ đơn**
  - **Tiếp nhận** (`POST /api/orders/{id}/accept`): `PENDING → PREPARING`; phát `order.status_changed`.
  - **Hoàn tất** (`POST /api/orders/{id}/complete`): gọi `sp_CompleteOrder` — trong một transaction: `UPDATE Orders SET Status='COMPLETED' WHERE OrderId=@id AND Status='PREPARING'`; `@@ROWCOUNT = 0` → `THROW 50001` (đã xử lý); khóa `Ingredients` liên quan, trừ `StockQty` (và `ReservedQty` nếu A); nếu `StockQty` sẽ âm → `THROW 50002` rollback; ghi `InventoryTransactions`; commit. Thành công → phát `order.status_changed`. Với đơn mang đi, bill đã in lúc tạo; dine-in in khi thu tiền phiên.
  - **Hủy** đơn `PENDING` (Q-010) với lý do.
- **Lỗi và biên**
  - Hai máy bấm Hoàn tất cùng lúc → máy sau nhận `409 ALREADY_PROCESSED` "Đơn hàng này đã được nhân viên khác xử lý"; kho trừ đúng 1 lần (BR-002).
  - Hoàn tất mà kho không đủ (chỉ xảy ra nếu Q-001 ≠ A hoặc kho bị điều chỉnh tay giảm) → `409 OUT_OF_STOCK`, đơn vẫn `PREPARING`, quầy được thông báo cần điều chỉnh kho/hủy.
  - Hoàn tất đơn `PENDING` (chưa tiếp nhận) → `409 INVALID_STATE` (BR-013); POS cho bấm "Tiếp nhận & Hoàn tất" gộp (2 lệnh tuần tự) để đỡ thao tác (PROPOSED).
  - Khách gọi API này → 401.
- **Acceptance Criteria**
  - AC-007-01: Khách gửi đơn → ≤ 2 s dashboard phát âm thanh và hiện thẻ ở cột Mới, không reload.
  - AC-007-02: Bấm Tiếp nhận → đơn sang Đang pha; khách thấy "Đang chuẩn bị".
  - AC-007-03: Bấm Hoàn tất trên đơn `PREPARING` → `COMPLETED`; `Ingredients.StockQty` giảm đúng Σ BOM; `InventoryTransactions` có đúng N dòng (N = số nguyên liệu); khách thấy "Đã xong".
  - AC-007-04: Hai request `complete` đồng thời cho cùng đơn → một 200, một 409; `InventoryTransactions` chỉ có 1 bộ; kho trừ 1 lần.
  - AC-007-05: Rớt mạng 2 phút, có 3 đơn mới + 1 yêu cầu thanh toán → sau reconnect thấy đủ + banner "Có đơn hàng bị trễ".
  - AC-007-06: Khách bấm Gọi thanh toán → thẻ bàn xuất hiện ở dải Gọi thanh toán với âm thanh riêng; nhấp mở S-14 đúng phiên.
  - AC-007-07: Token khách / không token gọi `accept`/`complete` → 401; đơn không đổi.
  - AC-007-08: Hủy đơn `PENDING` → đơn `CANCELLED`, phần nguyên liệu đang giữ trả lại đủ (`ReservedQty` về như trước khi gửi); hủy đơn đã tiếp nhận (`PREPARING`) → 409 `INVALID_STATE` (BR-013, BR-010). _(bổ sung — TASK-057, 20/10/2026)_
  - AC-007-09: Bấm Hoàn tất đơn còn `PENDING` → 409 `INVALID_STATE` (BR-013); bấm Tiếp nhận đơn đã được tiếp nhận ở máy khác → 409 `ALREADY_PROCESSED`. _(bổ sung — TASK-057, 20/10/2026)_
- **Liên kết:** SP `sp_CompleteOrder` · API [api-contract](../kiến-trúc/api-contract.md) · UI S-10, S-11, S-14 · Rule BR-001, BR-002, BR-013 · NFR-001, NFR-002 · Hỏi: Q-001, Q-004b, Q-006, Q-017 (KDS riêng).
