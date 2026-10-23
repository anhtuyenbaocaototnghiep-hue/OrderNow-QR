# FEATURE-003 — Gửi đơn hàng (dine-in) với kiểm kho

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §8 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

- **Status:** CONFIRMED — giữ kho theo ADR-001 (phương án A); từ chối cả đơn theo ADR-003 (Q-005); khóa phiên khi gửi theo ADR-003 (Q-013). Đã triển khai 14/10/2026
- **Source:** US2 (cả 2 bản), US10, User flow bước 4–6, Module 1.2
- **Actor:** Khách
- **Điều kiện trước:** Có `sessionId` `OPEN` hoặc `PAYMENT_REQUESTED` thuộc `clientToken` (nếu đang gọi thanh toán mà gọi thêm món → phiên quay lại `OPEN`, báo quầy — PROPOSED); giỏ ≥ 1 món.
- **Đầu vào**

| Trường | Bắt buộc | Validation |
| --- | --- | --- |
| `sessionId` | Có | Phiên không `CLOSED`, thuộc clientToken |
| `items[]` | Có, ≥ 1 | — |
| `items[].menuItemId` | Có | Tồn tại, active, available |
| `items[].quantity` | Có | Số nguyên 1..50 (BR-015) |
| `items[].note` | Không | ≤ 200 ký tự |

- **Luồng thành công**
  1. Server validate input, tính `TotalAmount` từ giá DB (BR-011/012).
  2. Gọi `sp_SubmitOrder` trong một transaction: tính tổng nguyên liệu cần = Σ(qty × BOM); khóa dòng `Ingredients` liên quan; kiểm `Available ≥ cần` cho **mọi** nguyên liệu; nếu đủ → tăng `ReservedQty` (A), insert `Orders` (`PENDING`, `UNPAID`) + `OrderItems`; commit.
  3. Phát realtime `order.created` tới nhóm `staff` và `session:{id}`.
  4. Trả `201 { orderId, orderCode, totalAmount, status }` → client chuyển màn hình theo dõi đơn (S-05) với thông báo "Đặt món thành công".
- **Lỗi và biên**
  - Thiếu nguyên liệu → rollback, `409 { code: "OUT_OF_STOCK", items: [{ menuItemId, name }] }`; **không** có dòng nào được ghi; client bỏ các món đó khỏi giỏ, báo "Rất tiếc, Trà đào vừa hết món. Vui lòng chọn món khác".
  - Món không còn bán → `409 ITEM_UNAVAILABLE`.
  - Phiên không thuộc client → `403`; phiên `CLOSED` → `409 SESSION_CLOSED` (BR-020), client hướng dẫn quét lại QR.
  - Gửi lặp (double-tap) → client disable nút sau lần bấm đầu; server chấp nhận `Idempotency-Key` header (PROPOSED) để trả lại cùng đơn nếu trùng key trong 1 phút.
  - Hai bàn cùng gửi khi kho chỉ đủ 1 suất → đúng 1 đơn thành công (AC-003-04).
- **Acceptance Criteria**
  - AC-003-01: Giỏ 2 món hợp lệ, kho đủ → 201, `Orders` có 1 dòng `PENDING/UNPAID`, `OrderItems` 2 dòng với `UnitPrice` = giá hiện tại, `ReservedQty` tăng đúng Σ BOM (nếu A), quầy nhận `order.created` < 2 s.
  - AC-003-02: Kho hết cốt trà đào → 409 `OUT_OF_STOCK` nêu "Trà đào"; không có dòng `Orders`/`OrderItems` mới; `ReservedQty` không đổi.
  - AC-003-03: Client gửi `price` giả 1 đ → server bỏ qua, `TotalAmount` đúng theo DB.
  - AC-003-04: Kho đủ **1** suất trà đào; 20 request đồng thời từ 20 phiên → đúng 1 đơn 201, 19 đơn 409; `StockQty − ReservedQty ≥ 0`.
  - AC-003-05: Phiên của client khác → 403; không ghi dữ liệu.
  - AC-003-06: Khách gửi đơn thứ hai trong cùng phiên → 201; màn hình theo dõi hiện cả 2 đơn; tổng phiên = tổng 2 đơn.
  - AC-003-07: Gửi đơn vào phiên đã thu tiền (`CLOSED`) → 409 `SESSION_CLOSED` (BR-020), không tạo đơn; khách phải quét lại QR để mở phiên mới. _(bổ sung — TASK-057, 20/10/2026)_
  - AC-003-08: Giỏ có món đã tắt "còn bán" hoặc không còn tồn tại → 409 `ITEM_UNAVAILABLE` kèm danh sách mã món đó; cả đơn bị từ chối, không ghi dòng nào (BR-009). _(bổ sung — TASK-057, 20/10/2026)_
  - AC-003-09: Dòng có số lượng 0 hoặc 51, hoặc giỏ trống → 400 `VALIDATION_ERROR` (BR-015: 1..50), không tạo đơn. _(bổ sung — TASK-057, 20/10/2026)_
- **Liên kết:** Data `Orders, OrderItems, Ingredients, BomItems` · SP `sp_SubmitOrder` · API `POST /api/orders` · UI S-03 · Rule BR-001, BR-009, BR-010, BR-011, BR-012, BR-015, BR-020 · Hỏi Q-001, Q-005, Q-013 (khóa phiên trong `sp_SubmitOrder`).
