# API contract

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §11.3 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

Quy ước chung: JSON; thời gian ISO-8601 UTC; lỗi dạng `{ "code": "OUT_OF_STOCK", "message": "…", "details": {...} }`; phân trang `?page=&pageSize=` cho danh sách dài. Xác thực: `Authorization: Bearer <jwt>` cho `/pos` và `/admin`; cookie `cf_client` cho khách. HTTP status là quyết định kỹ thuật ở bảng này, không suy từ Word. **Không có endpoint nào cho khách đổi trạng thái thanh toán (BR-007).**

**Khách (public, cookie client)**

| Method & path | Mục đích | Request | Response | Lỗi |
| --- | --- | --- | --- | --- |
| `POST /api/sessions/scan` | Quét QR | `{ qrToken }` | `200 { state: "NEW", session }` hoặc `200 { state: "OCCUPIED", table, openSessions: [{ sessionId, itemCount, openedAt }] }` | 404 `TABLE_NOT_FOUND` |
| `POST /api/sessions` | Tạo phiên mới trên bàn | `{ qrToken }` | `201 { sessionId, table }` | 404 |
| `POST /api/sessions/{id}/join` | Gộp vào phiên | — | `200 { sessionId }` | 409 `SESSION_CLOSED`, 404 |
| `GET /api/menu` | Menu | — | `200 { categories: [{ id, name, items: [{ id, name, price, imageUrl, isAvailable }] }] }` | — |
| `POST /api/orders` | Gửi đơn dine-in | `{ sessionId, items: [{ menuItemId, quantity, note }] }` + header `Idempotency-Key` | `201 { orderId, orderCode, totalAmount, status, paymentStatus }` | 400 validation; 403 phiên không thuộc client; 409 `OUT_OF_STOCK { items: [{ menuItemId, name }] }`; 409 `ITEM_UNAVAILABLE`; 409 `SESSION_CLOSED` |
| `GET /api/sessions/{id}` | Phiên + đơn + tổng tạm tính (ảnh chụp cho S-05) | — | `200 { sessionId, table, status, amountDue, paymentRequestedAt, orders: [{ orderId, orderCode, status, paymentStatus, totalAmount, items[], createdAt }] }` | 403 |
| `POST /api/sessions/{id}/request-payment` | **Gọi thanh toán** (D-2) | — | `200 { status: "PAYMENT_REQUESTED", amountDue, requestedAt }` | 403; 409 `NO_ORDERS`; 409 `SESSION_CLOSED` |
| `GET /api/orders/{id}` | Chi tiết đơn (khách) | — | `200 {...}` | 403 |

**Quầy (STAFF/ADMIN)**

| Method & path | Mục đích | Request | Response | Lỗi |
| --- | --- | --- | --- | --- |
| `POST /api/auth/login` | Đăng nhập | `{ username, password }` | `200 { accessToken, user: { id, fullName, role } }` | 401; 403 `ACCOUNT_LOCKED` |
| `GET /api/auth/me` | Thông tin hiện tại | — | `200 { user }` | 401 |
| `GET /api/orders?status=PENDING,PREPARING&since=<iso>` | Danh sách đơn đang xử lý / đơn mới từ mốc | — | `200 [{ ...order, table, items[] }]` | 401 |
| `GET /api/sessions?status=OPEN,PAYMENT_REQUESTED` | Bàn đang phục vụ + bàn gọi thanh toán | — | `200 [{ sessionId, table, status, amountDue, orderCount, openedAt, paymentRequestedAt }]` | 401 |
| `POST /api/orders/takeaway` | **Bán mang đi** (D-3) | `{ items[], amountReceived }` | `201 { order, payment: { amountDue, amountReceived, changeGiven } }` | 400 `INSUFFICIENT_AMOUNT`; 409 `OUT_OF_STOCK` |
| `POST /api/orders/{id}/accept` | Tiếp nhận (Q-004b) | — | `200 { order }` | 409 `INVALID_STATE` |
| `POST /api/orders/{id}/complete` | Hoàn tất + trừ kho | — | `200 { order, inventoryDeducted: [{ ingredientId, qty }] }` | 409 `ALREADY_PROCESSED`; 409 `OUT_OF_STOCK`; 409 `INVALID_STATE` |
| `POST /api/orders/{id}/cancel` | Hủy đơn PENDING | `{ reason? }` | `200 { order }` | 409 `INVALID_STATE` |
| `POST /api/sessions/{id}/settle` | **Đã thu tiền** phiên (D-2) | `{ amountReceived }` | `200 { session, payment: { paymentId, amountDue, amountReceived, changeGiven } }` | 400 `INSUFFICIENT_AMOUNT`; 409 `ALREADY_SETTLED`; 409 `HAS_PENDING_ORDERS { orderIds }`; 409 `NO_ORDERS` |
| `POST /api/sessions/{id}/close` | Đóng bàn trống (phiên không có đơn) | — | `200` | 409 `HAS_ORDERS` |
| `GET /api/sessions/{id}/receipt?mode=final\|provisional` | Dữ liệu hóa đơn phiên (in) | — | `200 { shop, table, session, orders[], lines[], amountDue, payment?, mode }` | 409 `UNPAID` nếu `mode=final` mà chưa thu (BR-014) |
| `GET /api/orders/{id}/receipt` | Hóa đơn đơn mang đi | — | `200 {...}` | 409 `UNPAID` |

**Quản trị (ADMIN)**

| Method & path | Mục đích |
| --- | --- |
| `GET/POST /api/admin/categories`, `PUT/DELETE /api/admin/categories/{id}` | Danh mục |
| `GET/POST /api/admin/menu-items`, `PUT /api/admin/menu-items/{id}`, `PATCH /api/admin/menu-items/{id}/availability` | Món; đổi availability phát realtime |
| `GET /api/admin/menu-items/{id}/bom`, `PUT /api/admin/menu-items/{id}/bom` | BOM (PUT thay toàn bộ, body `[{ ingredientId, amount }]`) |
| `GET/POST /api/admin/tables`, `PUT /api/admin/tables/{id}`, `POST /api/admin/tables/{id}/regenerate-qr`, `GET /api/admin/tables/{id}/qr.png` | Bàn + QR |
| `GET/POST /api/admin/ingredients`, `PUT /api/admin/ingredients/{id}`, `POST /api/admin/ingredients/{id}/adjust`, `GET /api/admin/ingredients/{id}/transactions` | Kho |
| `GET/POST /api/admin/users`, `PUT /api/admin/users/{id}`, `POST /api/admin/users/{id}/reset-password`, `PATCH /api/admin/users/{id}/active` | Tài khoản |
| `GET /api/admin/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD` | `{ totalRevenue, orderCount, byDay: [{ date, revenue, orders }], topItems: [{ menuItemId, name, qty, revenue }], lowStock: [{ ingredientId, name, available, threshold }] }`; 400 `INVALID_RANGE` (BR-005) |
| `GET /api/admin/orders?from&to&status&page`, `GET /api/admin/payments?from&to` | Lịch sử đơn; lịch sử thu tiền (đối soát ca theo `ReceivedBy`) |

## Bổ sung và chốt khi triển khai (14/10/2026)

Mã nguồn: `ứng-dụng/máy-chủ/src/routes/{public,staff,admin}.js`. Test: `ứng-dụng/máy-chủ/tests/api.test.js`.

### Khác/bổ sung so với bảng đề xuất

| Endpoint | Chốt khi triển khai |
| --- | --- |
| `GET /api/health` | `200 { status: "ok", db: "up" }` hoặc `503` khi mất DB |
| `POST /api/sessions/scan` | Thêm `state: "MEMBER"` khi trình duyệt (cookie `cf_client`) đã thuộc một phiên mở của bàn (đóng tab rồi quét lại → vào lại phiên cũ). `openSessions[]` gồm `{ sessionId, label, itemCount, openedAt }`, không lộ đơn/ghi chú khách khác |
| `POST /api/sessions/{id}/join` | Body **`{ qrToken }`** — kiểm phiên thuộc đúng bàn; sai bàn → 404; phiên đã đóng → `409 SESSION_CLOSED` |
| `GET /api/sessions/{id}` | Khách (thành viên phiên) **hoặc** nhân viên (Bearer). Trả thêm `itemCount`, `pendingCount`, `preparingCount`, `payment` (khi đã đóng) |
| `GET /api/menu` | `{ shop: { name }, categories: [{ id, name, items: [{ id, name, price, imageUrl, isAvailable, soldOut }] }] }` — `isAvailable = IsAvailable && !soldOut`; `soldOut` = không đủ nguyên liệu khả dụng cho 1 suất (ADR-003) |
| `POST /api/orders` | 409 `OUT_OF_STOCK` / `ITEM_UNAVAILABLE` có `details.items: [{ menuItemId, name }]`; `Idempotency-Key` (≤ 100 ký tự) nhớ 60 giây theo `cf_client`; rate limit 10/phút/khách → `429 RATE_LIMITED`. Response có thêm `order` (đầy đủ) |
| `GET /api/orders` (quầy) | Mặc định: `PENDING` + `PREPARING` (mọi lúc) + `COMPLETED` trong ngày (giờ VN). Lọc `status` (csv), `since` (ISO), `type` |
| `POST /api/orders/{id}/accept` | Đơn đã được tiếp nhận/hoàn tất bởi người khác → `409 ALREADY_PROCESSED`; đơn đã hủy → `409 INVALID_STATE` |
| `POST /api/orders/{id}/complete` | `200 { order, inventoryDeducted: [{ ingredientId, name, qty, unit }] }` |
| `POST /api/orders/takeaway` | `201 { order, payment: { paymentId, amountDue, amountReceived, changeGiven, paidAt, receivedBy } }` |
| `GET /api/orders/{id}/receipt` | Chỉ đơn mang đi đã thu; đơn tại bàn → `409 USE_SESSION_RECEIPT` (in theo phiên) |
| `POST /api/sessions/{id}/settle` | Body thêm `expectedAmountDue` (số tiền POS đang hiển thị) → lệch thì `409 AMOUNT_CHANGED`. `409 HAS_PENDING_ORDERS` có `details.orderIds` |
| `POST /api/sessions/{id}/close` | Đóng bàn trống khi không có đơn nào khác `CANCELLED` (Q-018); còn đơn → `409 HAS_ORDERS` |
| `GET /api/auth/me` | `{ user, shop: { name, address } }` |
| `DELETE /api/admin/categories/{id}` | `204`; còn món → `409 HAS_ITEMS` |
| `PUT /api/admin/menu-items/{id}/bom` | Lỗi `400 VALIDATION_ERROR` "Định lượng không hợp lệ, phải lớn hơn 0" với `details.fields: [{ path: "0.amount" | "1.ingredientId", message }]`; BOM cũ giữ nguyên |
| `POST /api/admin/ingredients` | Body `{ name, unit, stockQty, lowStockThreshold }`; tồn ban đầu ghi `InventoryTransactions(ADJUST)` |
| `POST /api/admin/ingredients/{id}/adjust` | Body `{ newQty }` **hoặc** `{ delta }` + `reason` (bắt buộc). Lỗi `NEGATIVE_STOCK`, `BELOW_RESERVED`, `INVALID_ADJUSTMENT` |
| `GET /api/admin/orders` | Lịch sử đơn (Q-014): `from`, `to` (bắt buộc), `status`, `type`, `page`, `pageSize ≤ 200` → `{ items, total, page, pageSize }` |
| `GET /api/admin/reports/revenue` | Thêm `byHour` (khi `from = to`), `byStaff`; `byDay` đủ mọi ngày (0 nếu không bán) |

### Mã lỗi ứng dụng (ngoài mã SP ở data-model)

`VALIDATION_ERROR` 400 (kèm `details.fields`), `INVALID_RANGE` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `ACCOUNT_LOCKED` 403, `TABLE_NOT_FOUND` 404, `NOT_FOUND` 404, `USERNAME_TAKEN` 409, `DUPLICATE_CODE` 409 (mã bàn), `DUPLICATE_NAME` 409 (nguyên liệu), `HAS_ITEMS` 409, `UNPAID` 409, `USE_SESSION_RECEIPT` 409, `CANNOT_LOCK_SELF` 400, `CANNOT_CHANGE_OWN_ROLE` 400, `RATE_LIMITED` 429, `PAYLOAD_TOO_LARGE` 413, `INTERNAL_ERROR` 500.

### Định danh khách

Mọi request `/api/*` không có cookie hợp lệ sẽ được cấp `cf_client` (32 hex, HttpOnly, SameSite=Lax, 1 năm). Quyền của khách = các phiên có dòng `SessionClients(sessionId, cf_client)`.

### Xóa trong Quản lý (ADR-004)

| Endpoint | Kết quả |
| --- | --- |
| `DELETE /api/admin/menu-items/{id}` | `200 { result: "DELETED" \| "ARCHIVED" }`; 404 nếu không có / đã xóa |
| `DELETE /api/admin/categories/{id}` | Như trên (trước đây trả 204); còn món → `409 HAS_ITEMS` |
| `DELETE /api/admin/tables/{id}` | Như trên; bàn đang có khách → `409 TABLE_BUSY`; sau khi xóa, quét QR cũ → `404 TABLE_NOT_FOUND` |
| `DELETE /api/admin/ingredients/{id}` | Như trên; đang trong BOM → `409 IN_USE` (`details.menuItems: [tên món]`); đang giữ cho đơn → `409 HAS_RESERVED` |
| `DELETE /api/admin/users/{id}` | Như trên; tự xóa → `400 CANNOT_DELETE_SELF`; token của người bị xóa → `401` ở request kế tiếp |

`DELETED` = xóa hẳn khỏi DB; `ARCHIVED` = xóa mềm (đã có lịch sử). Mọi endpoint danh sách/sửa bỏ qua bản ghi đã xóa; báo cáo, lịch sử đơn, lịch sử kho vẫn giữ tên.
