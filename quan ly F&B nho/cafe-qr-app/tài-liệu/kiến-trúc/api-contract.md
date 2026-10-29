# API contract

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §11.3 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

> **Cập nhật 18/10/2026:** endpoint giai đoạn 4–8 (ADR-006) kèm quyền theo vai (STAFF / MANAGER / ADMIN), trường mới `voucherCode` / `reward` ở các endpoint thu tiền và `POST /api/auth/logout` nằm ở mục "Bổ sung giai đoạn 4–8" cuối file.

> **Cập nhật 18/10/2026 (ADR-007):** 4 endpoint sửa / xóa món, xóa đơn, hủy lượt phục vụ bàn (FEATURE-046) nằm ở mục "Bổ sung F-046" cuối file.
>
> **Cập nhật 21/10/2026 (ADR-009):** sửa / hủy phiếu nhập kho, sửa phiếu kiểm kê nháp, hủy phiếu kiểm kê đã chốt (FEATURE-048) — mục "Bổ sung F-048" cuối file.
>
> **Cập nhật 23/10/2026 (ADR-011):** trang Tra cứu API (FEATURE-052) đọc file này để hiện request / response / mã lỗi cho từng endpoint — mục "Bổ sung F-052" cuối file. Giữ ô đầu mỗi dòng bảng ở dạng `` `METHOD /api/…` `` để trang ghép đúng.

> **Cập nhật 18/10/2026 (ADR-008):** endpoint Thẻ thành viên `GET /api/sessions/{id}/member-card` và trường `memberCard` trên dữ liệu bill (FEATURE-047) nằm ở mục "Bổ sung F-047" cuối file.

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
| `PUT /api/admin/menu-items/{id}/bom` | Lỗi `400 VALIDATION_ERROR` "Định lượng không hợp lệ, phải lớn hơn 0" với `details.fields: [{ path: "0.amount" \| "1.ingredientId", message }]`; BOM cũ giữ nguyên |
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

## Bổ sung giai đoạn 2 (ADR-005, 16/10/2026)

Mọi tiền do server tính bằng bộ `src/pricing/pricing.js` (D-7); FE chỉ hiển thị `breakdownLines`. Trường mới đều **tùy chọn** (API cũ gọi như trước vẫn chạy).

**Khách / dùng chung**

| Method & path | Ghi chú |
| --- | --- |
| `GET /api/menu` | Thêm `store`, `combos[]` (`components`, `listTotal`, `savings`), `promotions[]`, `suggested[]`, `modifierGroups[]`; món có `listPrice`, `price` (giá hiện hành), `promotionBadge`, `groupIds`. Gọi kèm Bearer (quầy) → thấy cả danh mục ngoài giờ bán |
| `POST /api/orders/quote { items }` | Báo giá giỏ: `lines`, `subtotal`, `lineDiscount`, `orderPromotion`, `promoDiscount`, `total` |
| `POST /api/orders` | `items[].optionIds` (F-013); `503 STORE_CLOSED`; `400 INVALID_OPTIONS`; `409 ITEM_UNAVAILABLE` (ngoài giờ bán) |
| `GET /api/sessions/{id}` | Thêm `member` (khách: tên che), `bill { amountDue, breakdown }` (ước tính sau hội viên), `openCalls` |
| `POST /api/members/lookup { phone }` · `POST /api/members { phone, fullName, consent }` | `400 INVALID_PHONE` / `CONSENT_REQUIRED`, `409 PHONE_EXISTS`, `429 RATE_LIMITED` |
| `POST /api/sessions/{id}/member { phone \| memberId }` · `DELETE …/member` | Khách: phiên của mình, bằng SĐT; quầy: `memberId` |
| `POST /api/sessions/{id}/call-staff { message }` | `201`; `429 TOO_SOON { retryAfter }` |

**Quầy (STAFF/ADMIN)**

| Method & path | Ghi chú |
| --- | --- |
| `POST /api/sessions/{id}/settle/preview { memberId?, manualDiscount?, manualReason? }` | `{ totals { subtotal, promoDiscount, memberDiscount, manualDiscount, roundingAdj, amountDue, breakdownLines }, member, needsApproval }` |
| `POST /api/sessions/{id}/settle` | Thêm `memberId`, `manualDiscount { kind: AMOUNT\|PERCENT, value }`, `manualReason`, `adminUsername`, `adminPassword`; `409 NO_OPEN_SHIFT`, `AMOUNT_CHANGED`; `403 ADMIN_APPROVAL_REQUIRED/INVALID` |
| `POST /api/orders/takeaway/quote` · `POST /api/orders/takeaway` | Như trên + `expectedAmountDue` |
| `GET /api/shifts/current` · `POST /api/shifts/open { openingCash }` · `POST /api/shifts/{id}/close { countedCash, note }` · `GET /api/shifts/{id}/report` | `409 SHIFT_ALREADY_OPEN`, `SHIFT_NOT_OPEN` |
| `GET /api/payments/{id}` · `POST /api/payments/{id}/refunds { amount, reason, restockInventory, orderIds?, adminUsername?, adminPassword? }` | `400 REFUND_EXCEEDS`, `409 REFUND_WINDOW_EXPIRED`, `403 ADMIN_APPROVAL_REQUIRED` |
| `GET /api/staff-calls` · `POST /api/staff-calls/{id}/handle` | `409 ALREADY_PROCESSED` |
| `GET/PUT /api/store { acceptingOrders, closedMessage }` | Công tắc nhận đơn QR. `GET` thêm `shiftOpen` (F-055); phản hồi `PUT` không đổi |
| `GET /api/tables` | F-024: bàn đang bật + `sessions[]` chưa đóng (có `note`, `openedBy`); không trả mã QR |
| `POST /api/tables/{id}/sessions { note?, newGroup? }` | F-024 mở bàn → `201 { session }`; `404 TABLE_NOT_FOUND`; `409 TABLE_OCCUPIED { sessions }` khi bàn đang có nhóm mà không chọn `newGroup` |
| `POST /api/sessions/{id}/orders { items, note? }` + `Idempotency-Key` | F-024 nhân viên gọi món giúp → `201 { order }` (`PREPARING`, `createdBy`); không bị chặn bởi `STORE_CLOSED` / giờ bán; `409 SESSION_CLOSED` |
| `PUT /api/sessions/{id}/note { note \| null }` | F-024 ghi chú bàn → `{ session }`; `409 SESSION_CLOSED`. `GET /api/sessions…` của nhân viên có `note`, `noteUpdatedAt`, `noteUpdatedBy`, `openedBy` — response cho khách **không** có |

**Quản lý (ADMIN, `/api/admin`)**: `members` (`?q=&page=`, `{id}`, `{id}/anonymize`), `member-tiers`, `combos` (+ `{id}/availability`), `promotions` (+ `{id}/active`, `{id}/stats`), `suggestions`, `modifier-groups`, `settings`, `shifts`, `refunds`, `stock-receipts`, `stocktakes` (+ `{id}/lines`, `{id}/post`), `reports/marketing`, `reports/costs`; `categories` thêm `sellFrom/sellTo`; `menu-items` thêm `groupIds`; `DELETE menu-items/{id}` có thể `409 IN_COMBO`.

## Bổ sung giai đoạn 4–8 (ADR-006, cập nhật 18/10/2026)

Mã nguồn: `ứng-dụng/máy-chủ/src/routes/`. Route khách và quầy nằm ở `engagement.js`, `ops.js`, `finance.js`, `loyalty.js`, `analytics.js` (`dashboardRouter`) và `staff.js`. Route quản lý gắn dưới `/api/admin` nằm ở `advanced.js`, `financeAdmin.js`, `marketing.js`, `analytics.js` (`analyticsAdminRouter`). Ma trận quyền ở `src/auth/permissions.js` (FEATURE-036). Mọi trường mới đều **tùy chọn**: API cũ gọi như trước vẫn chạy. Chi tiết nghiệp vụ xem FEATURE-025…045. Mã lỗi SP (`50072`, `50110`…`50174`) xem [data-model](data-model.md).

### Quyền

| Ký hiệu (cột "Quyền") | Nghĩa |
| --- | --- |
| Công khai | Không cần đăng nhập |
| Khách/NV | Khách bằng cookie `cf_client` (chỉ phiên của mình, hoặc hội viên đang gắn vào phiên chưa đóng của chính điện thoại đó; sai → `403`) **hoặc** nhân viên bằng Bearer (dùng được mọi phiên / hội viên) |
| NV | Mọi tài khoản đang đăng nhập: STAFF, MANAGER, ADMIN (`requireStaff` ≈ `pos.use`) |
| `tên.quyền` | `requirePermission(…)`: chưa đăng nhập → `401`, không đủ quyền → `403` |
| ADMIN | Mọi route `/api/admin/*` (`requireAdmin`, tương ứng `admin.all`). MANAGER gọi nhận `403` |

| Quyền (`PERMISSIONS`) | STAFF | MANAGER | ADMIN |
| --- | --- | --- | --- |
| `pos.use`, `shift.manage`, `cash.create`, `prep.post`, `waste.create`, `po.receive` | ✔ | ✔ | ✔ |
| `cash.approve` | ✘ | ≤ `manager.cash_out_approve_max` (2.000.000đ) | ✔ |
| `attendance.edit` | ✘ | chỉ trong ngày | ✔ |
| `inventory.adjust`, `stocktake.post` | ✘ | ✔ | ✔ |
| `dashboard.view` | ✘ | bản rút gọn | ✔ |
| `admin.all` | ✘ | ✘ | ✔ |

Ba quyền `prep.post`, `waste.create`, `po.receive` gồm đủ ba vai nên route dùng `requireStaff`.

Giảm giá tay tự duyệt được đến: STAFF ≤ `discount.*` (10 % / 20.000đ), MANAGER ≤ `manager.discount_max_*` (20 % / 50.000đ), ADMIN không giới hạn. Vượt ngưỡng thì gửi kèm `adminUsername` / `adminPassword` của trưởng ca (nếu mức giảm nằm trong ngưỡng trưởng ca) hoặc của quản lý; sai hay thiếu → `403 ADMIN_APPROVAL_REQUIRED` / `ADMIN_APPROVAL_INVALID`.

### Thay đổi trên endpoint đã có

| Endpoint | Thay đổi |
| --- | --- |
| `POST /api/auth/login` | Nhân viên và trưởng ca được tự chấm công vào (`sp_ClockIn`); quản lý không tự chấm |
| **`POST /api/auth/logout`** (mới, NV) | Đóng chấm công đang mở → `200 { clockedOut }`. FE gọi trước khi xóa token. `409 SHIFT_OPEN` (F-054): người gọi là người mở ca đang chạy → `details { shiftId, cashPending }`, chưa ghi giờ ra |
| `GET /api/menu` | Thêm `nextChangeAt` (ISO; mốc lịch thực đơn đổi gần nhất trong 8 ngày tới). Khách không thấy món ngoài lịch; gọi kèm Bearer thì thấy đủ, món đang ẩn có `hiddenBySchedule: true` (F-040) |
| `POST /api/orders` (khách) | Món ngoài lịch → `409 ITEM_UNAVAILABLE`. Quầy (mang đi, gọi món tại bàn) không bị chặn |
| `POST /api/members` | Thêm `referrerPhone?`; response thêm `referred: true`. Lỗi: `404 REFERRER_NOT_FOUND`, `400 SELF_REFERRAL`, `409 REFERRAL_LIMIT` (F-038) |
| `GET /api/sessions/{id}` và các response có `member` | `member.loyalty { points, stampCards[{ programId, name, requiredStamps, stamps, rewardsAvailable, text }], rewards[], vouchers[] }`. Khách không thấy `code` của voucher (F-039) |
| `GET /api/sessions` (quầy) | Thêm `splitCount`, `paidAmount` (F-026) |
| Thu tiền: `POST /api/sessions/{id}/settle` (+ `/preview`), `POST /api/splits/{id}/settle` (+ `/preview`), `POST /api/orders/takeaway` (+ `/quote`) | Body thêm **`voucherCode?`** (≤ 20 ký tự) và **`reward?`**: `{ type: 'POINTS', rewardId }` hoặc `{ type: 'STAMP', programId }`. `totals` thêm `voucherDiscount`, `rewardDiscount`, `pointsEarned`, `stampsEarned[]`; `payment` thêm `voucherCode`, `voucherDiscount`. Lỗi voucher: `404 VOUCHER_NOT_FOUND`; `409 VOUCHER_USED` / `VOUCHER_EXPIRED` / `VOUCHER_NOT_OWNER` / `VOUCHER_MIN_ORDER` / `VOUCHER_UNAVAILABLE` (hai quầy dùng cùng mã). Lỗi đổi thưởng: `400 MEMBER_REQUIRED`, `400 REWARD_WITH_MANUAL`; `409 POINTS_INSUFFICIENT` / `STAMP_REWARD_UNAVAILABLE` / `REWARD_UNAVAILABLE` / `REWARD_ITEM_NOT_IN_BILL` |
| `POST /api/sessions/{id}/settle` | Bàn đã chia bill → `409 SESSION_HAS_SPLITS` |
| `POST /api/payments/{id}/refunds` | MANAGER tự hoàn lượt thu thuộc ca đang mở (`manager.refund_same_shift_only`; tắt cài đặt này thì được hoàn mọi lượt trong ngày); lượt thu khác cần quản lý. Lượt thu của một phần chia bill chỉ được hoàn tiền: gửi `orderIds` → `400 INVALID_REFUND`. Điểm và tem được trừ / trả lại (F-039) |
| `POST /api/shifts/{id}/close` | Còn khoản sổ quỹ chờ duyệt → `409 CASH_PENDING`. `ExpectedCash` gồm thu khác và chi đã duyệt; người đóng ca được chấm công ra |
| `POST /api/admin/stock-receipts` | Dòng `{ ingredientId, qty, unitCost? }` **hoặc** `{ ingredientId, packUnitCode, packQty, packPrice? }`, kèm `expiryDate?`, `lotCode?` (nguyên liệu theo lô). Không quy đổi được → `400 UNIT_MISMATCH` |
| `POST /api/admin/menu-items` · `PUT …/{id}` | `prepSeconds` (10–3600; `null` = dùng thống kê; không gửi = giữ nguyên) |
| `POST /api/admin/users`, `PUT …/{id}`, `PATCH …/{id}/active`, `DELETE …/{id}` | `role: 'STAFF' \| 'MANAGER' \| 'ADMIN'`. Hạ vai, khóa hoặc xóa quản lý đang hoạt động cuối cùng → `409 LAST_ADMIN` |
| `PUT /api/admin/settings` | Thêm `etaBaseSeconds`, `kitchenParallelism`, `etaSpreadPercent`, `etaDefaultItemSeconds` (F-025); `costMethod: 'AVG' \| 'FIFO'` (F-031); `forecastSafetyPercent` (F-029); `managerMaxPercent`, `managerMaxAmount`, `managerRefundSameShiftOnly`, `managerCashApproveMax`, `cashApproveThreshold` (F-036, F-033) |

### Giai đoạn 4 — gọi lại đơn, lịch thực đơn, thời gian chờ, chia bill

| Method & path | Quyền | Request (chính) | Response (chính) | Lỗi |
| --- | --- | --- | --- | --- |
| `GET /api/members/{id}/recent-orders?limit=3` (1–10) | Khách/NV | — | Đơn đã thu gần nhất; mỗi dòng có `available`, `reason` | 403 |
| `GET /api/members/{id}/favorites` | Khách/NV | — | `{ hearted[], items[{ menuItemId, name, price, isAvailable, hearted, timesOrdered }] }` | 403 |
| `PUT` / `DELETE /api/members/{id}/favorites/{menuItemId}` | Khách/NV | — | Danh sách yêu thích mới | 403, 404 (món) |
| `POST /api/cart/replay` | Khách/NV | `{ orderId }` | `{ items[{ menuItemId, name, quantity, note, optionIds, optionLabels, optionDelta, price }], skipped[{ name, reason }] }`. Giá lấy theo thực đơn hiện tại | 403, 404 |
| `GET /api/queue/eta?items=12:2,15:1` | Công khai | — | `{ etaSeconds, minMinutes, maxMinutes, queueLength, queueOrders }` (`no-store`) | 400 |
| `GET /api/sessions/{id}/eta` | Khách/NV | — | `{ eta: {…} \| null }` | 403 |
| `GET /api/sessions/{id}/splits` | Khách/NV | — | `{ hasSplits, splits[{ splitId, label, isCommon, status, mine, member, lines[], unpaidAmount, paidAmount }], lines[] }` | 403, 404 |
| `POST /api/sessions/{id}/splits` | Khách/NV | `{ label }` (≤ 50) | `201 { splitId, …view }`. Khách: phần của điện thoại này (tạo lại → trả phần cũ, đổi tên). Quầy: phần mới. Phần Chung tự tạo cùng phần đầu tiên | 403, `409 SESSION_CLOSED` |
| `PUT /api/sessions/{id}/items/{orderItemId}/split` | Khách/NV | `{ splitId \| null }` | View chia bill | `403` (khách gán dòng không phải Chung / không phải của mình); `409 LINE_LOCKED`, `SPLIT_PAID`, `NO_SPLITS`, `SESSION_CLOSED` |
| `POST /api/splits/{id}/settle/preview` | NV | Như thu cả bàn: `memberId`, `manualDiscount`, `manualReason`, `voucherCode`, `reward`… | `{ split, includeCommon, lineCount, totals, member, needsApproval }` | 404 |
| `POST /api/splits/{id}/settle` | NV | Như trên + `amountReceived`, `expectedAmountDue?` | `{ split, includeCommon, payment, sessionClosed, totals }` | `409 SPLIT_PAID`, `COMMON_REQUIRED`, `SPLIT_EMPTY`, `HAS_PENDING_ORDERS`, `AMOUNT_CHANGED`, `ALREADY_SETTLED`, `NO_OPEN_SHIFT`; `400 INSUFFICIENT_AMOUNT` |
| `POST /api/sessions/{id}/splits/merge` | NV | — | `{ removed, unsplit, …view }` ("Thu chung": chưa thu phần nào → bỏ chia hẳn; đã thu ≥ 1 phần → dồn các phần còn mở về Chung) | `409 SESSION_CLOSED` |
| `GET /api/payments/{id}/receipt` | NV | — | Bill của **một lượt thu** (chỉ các dòng của lượt đó, có tên phần) | 404 |
| `GET` / `POST /api/admin/menu-schedules` | ADMIN | `{ name, startDate?, endDate?, daysOfWeekMask (1–127, bit0 = CN), startTime?, endTime?, isActive, targets[{ menuItemId \| categoryId, mode: SHOW \| HIDE }] }` | Lịch | 400 |
| `PUT` / `DELETE /api/admin/menu-schedules/{id}` · `PATCH …/{id}/active { isActive }` | ADMIN | Như trên | Lịch; phát `menu.updated` | 404 |
| `GET /api/admin/menu-schedules/preview?at=YYYY-MM-DDTHH:MM` | ADMIN | — | Menu khách tại thời điểm đó (giờ quán) | 400 |
| `GET /api/admin/prep-stats` | ADMIN | — | Thời gian pha chuẩn / thực tế / số mẫu / số đang dùng | — |
| `GET /api/admin/jobs` | ADMIN | — | `[{ name, label, schedule, lastRun{ status, startedAt, finishedAt, info, error } }]` | — |
| `POST /api/admin/jobs/{name}/run` | ADMIN | — | `{ name, status: OK \| SKIPPED \| FAILED, info?, error? }` (dùng cho nút "Tính lại", ví dụ `demand-forecast`, `daily-summary`) | 404 (không có job) |

### Giai đoạn 5 — kho nâng cao

| Method & path | Quyền | Request (chính) | Response (chính) | Lỗi |
| --- | --- | --- | --- | --- |
| `GET /api/ops/ingredients` | NV | — | Tồn kho cho quầy (khả dụng đã trừ phần giữ và lô hết hạn; có `expiredQty`) | — |
| `GET /api/prep/recipes` · `GET /api/prep/preview?semiId&multiplier` | NV (`prep.post`) | — | Danh sách bán thành phẩm · `{ lines[{ …, enough, cost }], estimatedCost, canPrepare }` | 404 |
| `POST /api/prep/batches` | NV (`prep.post`) | `{ semiIngredientId, multiplier (≤ 100), note? }` | `201` mẻ + `transactions[]`; phát `inventory.prepared` | `409 PREP_SHORT` (message có tên nguyên liệu thiếu), `404 NO_RECIPE`, `409 STOCKTAKE_LOCKED`, `409 LOT_SHORT` |
| `GET /api/prep/batches?from&to` | NV | — | Mẻ trong kỳ | 400 |
| `POST /api/waste` | NV (`waste.create`) | `{ ingredientId, qty, reason: SPILL \| EXPIRED \| QUALITY \| OTHER, note? }` | `201` phiếu hủy | `409 BELOW_RESERVED`, `409 STOCKTAKE_LOCKED`, `400 WASTE_INVALID` |
| `GET /api/waste?from&to` | NV | — | Phiếu hủy trong kỳ | 400 |
| `GET /api/lots/expiring?days=2` (0–30) | NV | — | Lô mở đã / sắp hết hạn `[{ lotId, ingredientId, name, unit, lotCode, qty, expiryDate, daysLeft, unitCost, source }]` | — |
| `POST /api/lots/{id}/write-off` · `POST /api/admin/lots/{id}/write-off` | NV · ADMIN | `{ note? }` | `201` phiếu hủy `EXPIRED` cho toàn bộ phần còn lại; lô đóng | 404 (lô không còn mở) |
| `GET /api/receiving/purchase-orders` · `GET …/{id}` | NV (`po.receive`) | — | PO đang chờ (`SENT` / `PARTIAL`) | 404 |
| `POST /api/receiving/purchase-orders/{id}/receive` · `POST /api/admin/purchase-orders/{id}/receive` | NV (`po.receive`) · ADMIN | `{ confirmOver, note?, lines[{ poLineId, packs \| qty, packPrice?, expiryDate?, lotCode? }] }` | `201` phiếu nhập | `409 OVER_RECEIPT` (`details.items` = tên), `409 PO_NOT_RECEIVABLE`, 404 |
| `POST /api/ops/ingredients/{id}/adjust` · `GET …/{id}/transactions` | `inventory.adjust` (MANAGER, ADMIN) | Như `/api/admin/ingredients/{id}/adjust` | Như bản admin | Như bản admin |
| `GET` / `POST /api/ops/stocktakes` · `GET` / `DELETE …/{id}` · `PUT …/{id}/lines` · `POST …/{id}/post` | `stocktake.post` (MANAGER, ADMIN) | Như `/api/admin/stocktakes` | Như bản admin | Như bản admin |
| `GET /api/admin/units` · `PUT /api/admin/units/{code}` · `DELETE …/{code}` | ADMIN | `{ name, baseUnitCode?, factor? }` | Đơn vị | `409 IN_USE`; `400` (quy đổi vòng lặp, đơn vị gốc không có) |
| `PUT /api/admin/ingredients/{id}/advanced` | ADMIN | `{ kind: RAW \| SEMI, shelfLifeHours?, wastePercent, trackLots? }` | Nguyên liệu | `409 HAS_RECIPE` (chuyển về RAW khi còn công thức) |
| `GET` / `PUT /api/admin/ingredients/{id}/recipe` | ADMIN | `{ outputQty, instructions?, lines[{ ingredientId, qty }] }` (1–30 dòng) | Công thức | `400 RECIPE_CYCLE`, `400 RECIPE_TOO_DEEP` (> 3 cấp) |
| `GET /api/admin/ingredients/{id}/lots?all=1` | ADMIN | — | `{ ingredient, lots[{ lotCode, qty, expiryDate, daysLeft, unitCost, source, isClosed }] }` | 404 |
| `GET` / `POST /api/admin/suppliers` · `PUT …/{id}` | ADMIN | `{ name, phone?, email?, leadTimeDays, deliveryDaysMask, note?, isActive, items[{ ingredientId, packUnitCode, packSize?, lastPrice?, isPreferred }] }` | Nhà cung cấp kèm `items[]` | 400 |
| `GET /api/admin/purchase-orders?status=` · `POST` · `GET` / `PUT …/{id}` | ADMIN | `{ supplierId, expectedDate?, note?, lines[{ ingredientId, orderedPacks, packUnitCode?, packSize?, unitPrice? }] }` | PO | `409 PO_NOT_DRAFT` (chỉ sửa PO nháp), `400 UNIT_MISMATCH` |
| `POST /api/admin/purchase-orders/{id}/send` · `…/cancel` | ADMIN | — | PO | `409 PO_NOT_DRAFT`, `409 PO_HAS_RECEIPTS`, `409 PO_CANCELLED` |
| `POST /api/admin/purchase-orders/from-suggestion` | ADMIN | `{ supplierId, expectedDate?, note?, lines[{ ingredientId, packs }] }` | `201` PO nháp | 400 |
| `GET /api/admin/inventory/replenishment?nextDeliveryDate&supplierId` | ADMIN | — | Mỗi nguyên liệu: `available, incoming, demand, safety, suggestBase, suggestPacks, runOutDate, runsOutBeforeDelivery, enoughData, supplier` | 400 |
| `GET /api/admin/inventory/forecast/{ingredientId}` | ADMIN | — | `{ history[28 ngày], forecast[14 ngày] }` | 404 |
| `GET /api/admin/reports/cogs?from&to` | ADMIN | — | `{ items[{ name, qty, revenue, cogs, unknownQty, marginPct }], ingredients[{ name, qty, cost }] }` | `400 INVALID_RANGE` |
| `GET /api/admin/reports/loss?from&to` | ADMIN | — | `[{ consumption, standard, loggedWaste, stocktakeShortage, gap, abnormal, flagged, abnormalValue }]` | `400 INVALID_RANGE` |
| `GET /api/admin/reports/suppliers?from&to` | ADMIN | — | `{ prices[], performance[] }` | `400 INVALID_RANGE` |

### Giai đoạn 6 — trưởng ca, sổ quỹ, chấm công, nhật ký, lãi/lỗ

| Method & path | Quyền | Request (chính) | Response (chính) | Lỗi |
| --- | --- | --- | --- | --- |
| `GET /api/cash-categories` | NV | — | Danh mục đang dùng | — |
| `GET /api/cash-transactions?shiftId` | `cash.create` | — | Khoản thu chi của ca (mặc định ca đang mở) | — |
| `POST /api/cash-transactions` | `cash.create` | `{ categoryId, amount (> 0), reason }` | `201 { cashTxnId, status: APPROVED \| PENDING, … }`; phát `cash.created` | `409 NO_OPEN_SHIFT`, `400 CASH_CATEGORY_INVALID` |
| `PUT /api/cash-transactions/{id}/receipt` | `cash.create` (chỉ người ghi khoản, hoặc người có `cash.approve`) | Thân request là **ảnh** (`Content-Type: image/jpeg \| png \| webp`), ≤ 2 MB, không dùng multipart | Khoản (đã có ảnh) | `400 RECEIPT_TOO_LARGE`, `400 RECEIPT_INVALID` (kiểm chữ ký file), 403 |
| `GET /api/cash-transactions/{id}/receipt` | NV | — | File ảnh (`Cache-Control: private, no-store`) | 404 |
| `POST /api/cash-transactions/{id}/approve` | NV; người duyệt phải có `cash.approve` (nhân viên nhập tài khoản trưởng ca / quản lý) | `{ adminUsername?, adminPassword? }` | Khoản; phát `cash.reviewed` | `403 ADMIN_APPROVAL_REQUIRED` / `INVALID`, `403 SELF_APPROVAL` (trừ quản lý), `409 CASH_NOT_PENDING`, `409 NO_OPEN_SHIFT` |
| `POST /api/cash-transactions/{id}/reject` | Như trên | `{ rejectReason, adminUsername?, adminPassword? }` | Khoản; phát `cash.reviewed` | Như trên |
| `GET /api/attendance/me` | NV | — | `{ open }` (bản ghi đang mở hoặc `null`) | — |
| `GET /api/attendance?from&to&userId` · `GET /api/attendance/users` | `attendance.edit` | — | Bản ghi chấm công · người dùng đang hoạt động | 400 |
| `POST /api/attendance` | `attendance.edit` | `{ userId, clockIn, clockOut?, reason }` (ISO có múi giờ) | `201` bản ghi | `400` (thiếu lý do, giờ ở tương lai, > 24 giờ); `403 ATTENDANCE_NOT_TODAY` (trưởng ca sửa khác ngày hôm nay); `409 ATTENDANCE_OVERLAP` |
| `PUT /api/attendance/{id}` | `attendance.edit` | `{ clockIn, clockOut?, reason }` | Bản ghi | Như trên |
| `GET /api/admin/cash-transactions?from&to&categoryId&status&direction` | ADMIN | — | `{ from, to, rows, summary{ totalIn, totalOut, net, pending, byCategory[] } }` | 400 |
| `GET /api/admin/cash-transactions/export.csv?…` | ADMIN | — | CSV UTF-8 có BOM, chặn công thức Excel | 400 |
| `GET` / `POST /api/admin/cash-categories` · `PUT` / `DELETE …/{id}` | ADMIN | `{ name, direction: IN \| OUT, isExpense, requiresApproval, isActive, sortOrder }` | DELETE → `{ result }` (danh mục đã dùng → chuyển ngừng dùng) | 404 |
| `GET /api/admin/rosters?from&to` · `POST` · `PUT` / `DELETE …/{id}` | ADMIN | `{ userId, workDate, startTime, endTime, note? }` | Ca làm có trạng thái `ON_TIME` / `LATE` / `ABSENT` / `UPCOMING` | 400 |
| `POST /api/admin/rosters/copy-week` | ADMIN | `{ fromWeek, toWeek }` | Chép lịch tuần (bỏ qua ca đã có) | 400 |
| `GET /api/admin/reports/productivity?from&to` | ADMIN | — | `{ from, to, rows }` (tiền thu, đơn hoàn tất, giờ làm, tiền thu / giờ) | 400 |
| `GET /api/admin/audit-logs?from&to&userId&entity&entityId&action&page&pageSize` (≤ 200) · `GET /api/admin/audit-logs/facets` | ADMIN | — | Nhật ký phân trang (`BeforeJson` / `AfterJson`); không có API sửa / xóa | 400 |
| `GET` / `POST /api/admin/fixed-costs` · `PUT` / `DELETE …/{id}` | ADMIN | `{ name, monthlyAmount, effectiveFrom, effectiveTo? }` | Khoản chi phí cố định | `400` (ngày kết thúc trước ngày bắt đầu), 404 |
| `GET /api/admin/reports/pnl?from&to&groupBy=day\|month` | ADMIN | — | `{ revenueGross, discounts, refunds, revenueNet, cogs, grossMargin, grossMarginPct, cashExpenses, fixedCostsAllocated, fixedCostsPerDay, operatingProfit, breakEvenPerDay, estimatedCogsRows, expensesByCategory[], series[], note: "ước tính" }` | `400 INVALID_RANGE` (sai khoảng, > ~13 tháng) |

### Giai đoạn 7 — tích điểm & tem, giới thiệu bạn & voucher, chiến dịch

| Method & path | Quyền | Request (chính) | Response (chính) | Lỗi |
| --- | --- | --- | --- | --- |
| `GET /api/members/{id}/loyalty` | NV | — | `{ points, stampCards[], rewards[{ …, affordable }], vouchers[] }` | `404 MEMBER_NOT_FOUND` |
| `GET /api/members/{id}/vouchers` | NV | — | Voucher còn dùng được của hội viên | `404 MEMBER_NOT_FOUND` |
| `POST /api/vouchers/validate` | NV | `{ code, memberId? }` | `{ valid: true, voucher }` hoặc `{ valid: false, code, message }` (lỗi nghiệp vụ trả trong body) | `404 MEMBER_NOT_FOUND` |
| `GET` / `POST /api/admin/rewards` · `PUT` / `DELETE …/{id}` | ADMIN | `{ name, pointsCost, rewardType: DISCOUNT \| FREE_ITEM, discountAmount? \| menuItemId?, isActive, sortOrder }` | DELETE → `{ result }` (quà đã có người đổi → chuyển ngừng) | 400, 404 |
| `GET` / `POST /api/admin/stamp-programs` · `PUT` / `DELETE …/{id}` | ADMIN | `{ name, requiredStamps (2–50), menuItemIds[], rewardMenuItemId?, isActive }` | Chương trình tem | `400` (món tặng không thuộc danh sách), 404 |
| `GET /api/admin/members/{id}/loyalty` | ADMIN | — | `{ cards, pointHistory, vouchers, referrals }` | 404 |
| `POST /api/admin/members/{id}/points` | ADMIN | `{ delta (≠ 0), reason }` | `{ points }` | `409 POINTS_INSUFFICIENT` (làm điểm âm), `404 MEMBER_NOT_FOUND` |
| `GET /api/admin/vouchers?from&to&source` | ADMIN | — | Voucher trong kỳ (`REFERRAL` / `CAMPAIGN` / `MANUAL`) | 400 |
| `POST /api/admin/vouchers` | ADMIN | `{ percent \| amount, maxDiscount?, minOrderAmount, stackWithMember, days (1–365), memberId? }` | `201` voucher mã `QL…` (không gắn hội viên thì ai có mã cũng dùng được một lần) | 400 |
| `GET` / `POST /api/admin/segments` · `PUT` / `DELETE …/{id}` | ADMIN | `{ name, rule }`. `rule`: `tierIn[]`, `lastVisitDaysGte/Lte`, `visitCountGte/Lte`, `totalSpentGte`, `birthdayMonth`, `hasPointsGte` (khóa lạ → 400) | Phân khúc | `409 IN_USE` (đang được chiến dịch dùng) |
| `POST /api/admin/segments/preview` | ADMIN | `{ rule }` | `{ count, optedOut, recentlyContacted, sample[] }` (tên / SĐT đã che) | 400 |
| `GET` / `POST /api/admin/campaigns` · `GET` / `PUT` / `DELETE …/{id}` | ADMIN | `{ name, segmentId, channel: EXPORT \| ZALO_OA \| SMS, messageTemplate ({name} {voucher} {expires}), voucherPercent?, voucherDays?, voucherMinOrder, scheduledAt? }` | Chiến dịch | `409 CAMPAIGN_LOCKED` (đã chạy); `400 CHANNEL_NOT_CONFIGURED` (thiếu `ZALO_OA_TOKEN`), `400 CHANNEL_NOT_SUPPORTED` (SMS) |
| `POST /api/admin/campaigns/{id}/run` | ADMIN | — | `{ …campaign, result: { delivered, skipped, failed } }` | `409 CAMPAIGN_NOT_RUNNABLE` |
| `GET /api/admin/campaigns/{id}/export.csv` | ADMIN | — | CSV UTF-8 BOM (Họ tên, SĐT đầy đủ, Hạng, Mã voucher, Hạn dùng, Nội dung). Mỗi lần tải ghi nhật ký `campaigns.export` | 404 |
| `PATCH /api/admin/members/{id}/opt-out` | ADMIN | `{ optOut }` | Hội viên | 404 |

### Giai đoạn 8 — phân tích, dashboard chủ quán

| Method & path | Quyền | Request (chính) | Response (chính) | Lỗi |
| --- | --- | --- | --- | --- |
| `GET /api/admin/reports/menu-engineering?from&to&categoryId` | ADMIN | — (không truyền ngày → 30 ngày) | `{ items[{ menuItemId, name, categoryName, qty, revenue, cogs, margin, marginPerUnit, share, class: STAR \| PLOWHORSE \| PUZZLE \| DOG \| INSUFFICIENT, advice, estimatedQty }], medianQty, medianMarginPerUnit, estimatedCogs }` | `400 INVALID_RANGE` |
| `POST /api/admin/reports/menu-engineering/pin` | ADMIN | `{ menuItemId }` | Ghim món vào mục gợi ý (chế độ AUTO chuyển thành BOTH) | `400` (đã ghim đủ 20 món) |
| `GET /api/admin/reports/heatmap?from&to&metric=orders\|revenue` | ADMIN | — | `{ matrix[7][24], max }` (hàng 0 = Thứ Hai, giờ quán) | `400 INVALID_RANGE` |
| `GET /api/admin/reports/revenue-forecast?days=7` (1–14) | ADMIN | — | `{ today, history[{ date, revenue }], forecast[{ date, forecast, low, high, samples }] }` | 400 |
| `GET /api/admin/reports/compare?period=week\|month&offset=0` (0–24) | ADMIN | — | `{ current, previous, change, partial }` | 400 |
| `GET /api/admin/reports/tables?from&to` | ADMIN | — | `{ tables[{ code, name, sessions, revenue, avgMinutes, revenuePerHour, flag }], medianRevenuePerHour, medianMinutes }` | `400 INVALID_RANGE` |
| `GET /api/dashboard/today` | `dashboard.view` | — | `{ date, full, yesterday, sameDayLastWeek, revenueChange, today, lastShift, todos{ pendingCash, posDue, expiredLots, stocktakeAgeDays, stocktakeOverdue } }`. Với MANAGER (`full: false`), server bỏ `cogs`, `grossProfit` và tổng tiền chi chờ duyệt | `403` (STAFF) |
| `POST /api/dashboard/recompute` | `dashboard.view` | — | Tính lại hôm nay (và hôm qua nếu chưa có dòng tổng hợp) | 403 |

### Mã lỗi ứng dụng mới (ngoài mã SP)

`LINE_LOCKED` 409, `NO_SPLITS` 409, `UNIT_MISMATCH` 400, `RECIPE_CYCLE` 400, `RECIPE_TOO_DEEP` 400, `HAS_RECIPE` 409, `NO_RECIPE` 404, `PO_NOT_DRAFT` 409, `PO_CANCELLED` 409, `PO_HAS_RECEIPTS` 409, `RECEIPT_TOO_LARGE` 400, `RECEIPT_INVALID` 400, `SELF_APPROVAL` 403, `ATTENDANCE_NOT_TODAY` 403, `ATTENDANCE_OVERLAP` 409, `REFERRER_NOT_FOUND` 404, `SELF_REFERRAL` 400, `VOUCHER_NOT_FOUND` 404, `VOUCHER_USED` 409, `VOUCHER_EXPIRED` 409, `VOUCHER_NOT_OWNER` 409, `VOUCHER_MIN_ORDER` 409, `MEMBER_REQUIRED` 400, `REWARD_WITH_MANUAL` 400, `REWARD_ITEM_NOT_IN_BILL` 409, `CAMPAIGN_LOCKED` 409, `CAMPAIGN_NOT_RUNNABLE` 409, `CHANNEL_NOT_CONFIGURED` 400, `CHANNEL_NOT_SUPPORTED` 400. `IN_USE` 409 nay dùng thêm cho đơn vị tính và phân khúc.

### Nhật ký thao tác (không đổi request / response)

Middleware `src/middleware/audit.js` ghi vào `AuditLogs` các request sau, sau khi response trả về thành công (status < 400):

- mọi `POST` / `PUT` / `PATCH` / `DELETE` có Bearer dưới `/api/admin/*`, trừ `…/preview`;
- các route quầy trong bảng luật: thu tiền phiên / phần, đơn mang đi, hủy đơn, hoàn tiền, mở / đóng ca, `PUT /api/store`, sổ quỹ (tạo, duyệt, từ chối, gắn ảnh), sơ chế, hủy hàng, hủy lô, nhận PO, điều chỉnh kho / kiểm kê của trưởng ca, sửa chấm công; từ F-046: sửa / xóa món (`order.item-void`), xóa đơn (`order.void`), hủy bàn (`session.cancel`).

Tiếp nhận, hoàn tất và gọi món thường không được ghi.

## Bổ sung F-046 — sửa / xóa món, xóa đơn, hủy bàn (ADR-007, 18/10/2026)

Mã nguồn: route `src/routes/staff.js`, service `src/services/voidService.js`, repository `src/repositories/voidRepo.js`. Chi tiết nghiệp vụ: [FEATURE-046](../chức-năng/FEATURE-046.md), BR-066…BR-070. Mã lỗi SP `50181`…`50186` xem [data-model](data-model.md).

| Method & path | Quyền | Request (chính) | Response (chính) | Lỗi |
| --- | --- | --- | --- | --- |
| `POST /api/order-items/{id}/void` | NV (`pos.use`) | `{ quantity (SL **mới**, số nguyên 0…SL hiện tại − 1; 0 = xóa dòng), reason (1–200 ký tự), stockMode?: 'WASTE' \| 'RESTOCK', adminUsername?, adminPassword? }` | `{ order, cancelled, sessionClosed }` — `cancelled: true` khi đơn hết dòng (`CANCELLED`); `sessionClosed: true` khi phiên đã thu một phần tự đóng | `400 INVALID_QTY` (tăng / giữ nguyên số lượng — dùng "Gọi thêm món"), `400 VALIDATION_ERROR` (thiếu lý do); `403 ADMIN_APPROVAL_REQUIRED` / `ADMIN_APPROVAL_INVALID`; `404 ITEM_NOT_FOUND` (kể cả hai máy cùng xóa một dòng); `409 ITEM_NOT_EDITABLE` (dòng đã thu, đơn mang đi, đơn đã hủy / hoàn, phiên đã đóng) |
| `POST /api/orders/{id}/void` | NV (`pos.use`) | `{ reason, stockMode?, adminUsername?, adminPassword? }` | `{ order, sessionClosed }` — đơn tại bàn chưa thu → `CANCELLED`, dòng giữ lại làm lịch sử | `404 NOT_FOUND`; `409 ITEM_NOT_EDITABLE` (đơn đã thu / có dòng đã thu, mang đi, đã hủy); 400, 403 như trên |
| `POST /api/sessions/{id}/cancel` | NV (`pos.use`) | `{ reason, stockMode?, adminUsername?, adminPassword? }` | `{ session, cancelledOrders }` — mọi đơn chưa thu → `CANCELLED`, phiên `CLOSED`, không tạo lượt thu (người hủy + lý do ghi ở `Sessions.CancelledBy` / `CancelReason`, không trả trong `session`) | `409 SESSION_HAS_PAYMENTS` (đã thu một phần chia bill), `409 SESSION_CLOSED`, `404 NOT_FOUND`; 400, 403 như trên |
| `GET /api/sessions/{id}/voids` | NV (`pos.use`) | — | `[{ voidId, orderId, orderCode, itemName, qty, amount, orderStatus, stockMode: RELEASE \| WASTE \| RESTOCK, reason, createdAt, createdBy, approvedBy }]` — mới nhất trước; `createdBy` / `approvedBy` là họ tên | — |

- **Người duyệt (D-33):** đơn còn `PENDING` thì không cần. Đơn `PREPARING` / `COMPLETED` (hủy bàn: phiên có ít nhất một đơn như vậy): MANAGER / ADMIN tự duyệt; STAFF gửi `adminUsername` / `adminPassword` của **trưởng ca hoặc quản lý** — thiếu → `403 ADMIN_APPROVAL_REQUIRED`, sai mật khẩu / tài khoản không đủ vai → `403 ADMIN_APPROVAL_INVALID`. SP kiểm lại sau khi khóa: đơn vừa được tiếp nhận mà không có người duyệt → `403 ADMIN_APPROVAL_REQUIRED`.
- **`stockMode`** chỉ dùng khi đơn đã `COMPLETED`; không gửi = `WASTE` (ghi hủy hàng). Đơn chưa pha xong luôn trả phần đang giữ.
- **Realtime:** `order.status_changed` / `order.cancelled` sau mỗi lần sửa / xóa; `session.closed` khi hủy bàn hoặc khi phiên đã thu một phần tự đóng — xem [realtime-events](realtime-events.md).
- **Nhật ký thao tác:** `order.item-void` (OrderItem), `order.void` (Order), `session.cancel` (Session); khóa `adminPassword` bị bỏ khỏi bản ghi.

**Thay đổi trên endpoint đã có:** `POST /api/payments/{id}/refunds` có hoàn kho → không hoàn lại lượng đã `VOID_BACK` hoặc đã ghi hủy hàng khi xóa món (request / response không đổi).

## Bổ sung F-047 — hội viên tại bàn, Thẻ thành viên, quyền lợi trên bill (ADR-008, 18/10/2026)

Chi tiết nghiệp vụ: [FEATURE-047](../chức-năng/FEATURE-047.md), BR-071…BR-073. Không đổi schema. Mã nguồn: route `src/routes/engagement.js`, `sessionService.memberCard`, `loyaltyService.memberCard` / `receiptCard`; `loyaltyRepo.vouchersOf` nối thêm `Campaigns` để lấy `campaignName`.

**Dùng lại, không đổi request / response** (trang Gọi món tại bàn gọi bằng Bearer của nhân viên): `POST /api/members/lookup`, `POST /api/members` (thiếu đồng ý → `400 CONSENT_REQUIRED`), `POST` / `DELETE /api/sessions/{id}/member` (phát `session.member_changed`).

| Method & path | Quyền | Request (chính) | Response (chính) | Lỗi |
| --- | --- | --- | --- | --- |
| `GET /api/sessions/{id}/member-card` | Khách/NV (`optionalStaff`: khách phải thuộc phiên; nhân viên Bearer xem mọi phiên) | — | `{ member: { maskedName, maskedPhone, tierName, discountPercent, firstOrderPercent \| null }, points, pointHistory[≤ 10 mới nhất { delta, type, label, createdAt }], stampCards[{ programId, name, requiredStamps, stamps, rewardsAvailable, text }], rewards[{ rewardId, name, pointsCost, missing }], vouchers[{ percent, amount, maxDiscount, minOrderAmount, expiresAt, source, sourceLabel }] }`. `Cache-Control: no-store`. `label`: `EARN` "Tích điểm", `REDEEM` "Đổi quà", `ADJUST` "Quán điều chỉnh", `EXPIRE` "Điểm hết hạn", `REFUND` "Hoàn tiền — trả / trừ điểm". `vouchers` chỉ gồm voucher còn dùng được; `sourceLabel` = `Chiến dịch "<tên>"` nếu voucher thuộc chiến dịch, còn lại `REFERRAL` "Giới thiệu bạn", `MANUAL` "Quán tặng". **Không** có mã voucher, không có tên nhân viên | `403` (thiết bị không thuộc phiên), `404 NOT_FOUND` (không có phiên), `409 SESSION_CLOSED`, `404 NO_MEMBER` (phiên chưa gắn hội viên / hội viên ngừng hoạt động) |

**Thay đổi trên endpoint đã có** — dữ liệu bill thêm trường `memberCard`:

| Endpoint | Thay đổi |
| --- | --- |
| `GET /api/sessions/{id}/receipt?mode=final` · `GET /api/payments/{id}/receipt` (một phần chia bill) · `GET /api/orders/{id}/receipt` (mang đi) | Thêm `memberCard: { points, stampCards[text], vouchers[voucher như trên] } \| null` — có giá trị khi lượt thu có hội viên đang hoạt động, chưa ẩn danh; số liệu **lúc gọi API** (in lại sau thì là số mới). `mode=provisional` và bill không có hội viên → `null`. Không có mã voucher |

## Bổ sung F-048 — sửa / hủy phiếu nhập kho, phiếu kiểm kê (ADR-009, 21/10/2026)

Chi tiết nghiệp vụ: [FEATURE-048](../chức-năng/FEATURE-048.md), BR-074…BR-077.
- Mã nguồn:
  - route `src/routes/operations.js` (admin), `src/routes/ops.js` (quầy);
  - `stockService.updateReceipt / voidReceipt / updateStocktake / voidStocktake`;
  - SP `sp_ReviseStockReceipt`, `sp_VoidStocktake`.
- Mã lỗi `50190`…`50199`: xem [data-model](data-model.md).

| Method & path | Quyền | Request (chính) | Response (chính) | Lỗi |
| --- | --- | --- | --- | --- |
| `PUT /api/admin/stock-receipts/{id}` | ADMIN | `{ supplier?, note?, reason (1–200), confirmOver?, lines[] }` — dòng như tạo phiếu (`qty`/`unitCost` hoặc `packUnitCode`/`packQty`/`packPrice`, `expiryDate?`, `lotCode?`) | Phiếu sau sửa (giữ `receiptId`; `editedBy / editedAt / editReason`) | 400 VALIDATION_ERROR (thiếu lý do, dòng trùng), 400 INVALID_RECEIPT / UNIT_MISMATCH, 404, 409 RECEIPT_VOIDED / STOCKTAKE_LOCKED / RECEIPT_AFTER_STOCKTAKE / RECEIPT_STOCK_USED / RECEIPT_LOT_USED / OVER_RECEIPT (`details.items` = tên nguyên liệu) |
| `POST /api/admin/stock-receipts/{id}/void` | ADMIN | `{ reason }` | Phiếu `status: 'VOIDED'`, `voidedBy / voidedAt / voidReason`, dòng giữ nguyên | 400, 404, 409 như trên (trừ OVER_RECEIPT) |
| `GET /api/admin/stock-receipts?from&to` | ADMIN | — | Thêm `status`, `edited`, `poId` | — |
| `GET /api/admin/stock-receipts/{id}` | ADMIN | — | Thêm `status`, `poId`, `supplierId`, `voided* / edited*`; dòng có `lotCode` | 404 |
| `PUT /api/admin/stocktakes/{id}`, `PUT /api/ops/stocktakes/{id}` | ADMIN / `stocktake.post` | `{ ingredientIds[≥1], note? }` | Phiếu nháp sau sửa | 400 (rỗng / không còn nguyên liệu), 404, 409 STOCKTAKE_NOT_DRAFT |
| `POST /api/admin/stocktakes/{id}/void` | ADMIN | `{ reason }` | Phiếu `status: 'VOIDED'`, `voidedBy / voidedAt / voidReason` | 400, 404, 409 STOCKTAKE_NOT_POSTED / STOCKTAKE_NOT_LATEST / STOCKTAKE_SURPLUS_USED / STOCKTAKE_LOCKED |

- **Realtime:** sửa / hủy phiếu nhập phát `inventory.received` `{ receiptId, revised: true }` (room `staff`).
- **Nhật ký thao tác:**
  - action `stock-receipts.update`, `stock-receipts.void`, `stocktakes.update`, `stocktakes.void`, `stocktake.update` (quầy);
  - ảnh "trước" của phiếu nhập gồm cả các dòng.

**Thay đổi trên endpoint đã có:**
- `GET /api/admin/stocktakes[/{id}]` thêm trạng thái `VOIDED` và `voided*`.
- `POST /api/admin/purchase-orders/{id}/cancel` chỉ tính phiếu nhập còn hiệu lực.
- `GET /api/admin/reports/loss` và "lần kiểm kê gần nhất" (`/api/admin/today`) bỏ phiếu kiểm kê đã hủy.

## Bổ sung F-049 — chuyển bàn (ADR-010, 21/10/2026)

Chi tiết: [FEATURE-049](../chức-năng/FEATURE-049.md), BR-078. Mã nguồn: route `src/routes/staff.js`, `sessionService.moveSession`, SP `sp_MoveSession`.

| Method & path | Quyền | Request | Response | Lỗi |
| --- | --- | --- | --- | --- |
| `POST /api/sessions/{id}/move` | NV (`pos.use`) | `{ toTableId, fromTableId? }` | `{ session, fromTable, toTable }` | 400 SAME_TABLE, 404 NOT_FOUND / TABLE_NOT_FOUND, 409 SESSION_CLOSED / TABLE_INACTIVE / SESSION_MOVED (`fromTableId` khác bàn hiện tại) |

**Thay đổi trên endpoint đã có:**
- `GET /api/sessions/{id}`, `GET /api/sessions?status=…`, `GET /api/tables`: phiên có `lastMove { fromTable, movedAt }`.
- Khách trong nhóm: `table.qrToken` chỉ khi nhóm còn mở và đã chuyển bàn.
- Nhật ký thao tác: `session.move`.

## Bổ sung F-050 — hủy / sửa khoản sổ quỹ đã duyệt (ADR-010, 21/10/2026)

Chi tiết: [FEATURE-050](../chức-năng/FEATURE-050.md), BR-079, BR-080. Mã nguồn: route `src/routes/finance.js`, `cashService.voidTxn`, SP `sp_VoidCashTxn`.

| Method & path | Quyền | Request | Response | Lỗi |
| --- | --- | --- | --- | --- |
| `POST /api/cash-transactions/{id}/void` | NV đăng nhập + quyền duyệt (BR-080) | `{ reason (1–200), replacement?: { categoryId, amount, reason (1–180) }, adminUsername?, adminPassword? }` | `{ voided, replacement }` | 400 VALIDATION_ERROR / CASH_CATEGORY_INVALID, 403 ADMIN_APPROVAL_REQUIRED / ADMIN_APPROVAL_INVALID / SELF_APPROVAL, 404, 409 CASH_NOT_APPROVED / SHIFT_CLOSED |

**Thay đổi trên endpoint đã có:**
- `GET /api/cash-transactions`, `GET /api/admin/cash-transactions`: dòng có `status: 'VOIDED'`, `voidedBy / voidedAt / voidReason`, `replacedById`, `replacesId`, `shiftOpen`.
- Tổng `summary` vẫn chỉ tính `APPROVED`.
- Realtime dùng lại `cash.reviewed` (khoản bị hủy) + `cash.created` (khoản thay thế).
- Nhật ký: `cash.void`.

## Bổ sung F-051 — đánh giá sau khi dùng món (ADR-010, 21/10/2026)

Chi tiết: [FEATURE-051](../chức-năng/FEATURE-051.md), BR-081…BR-083. Mã nguồn: `reviewService`, `reviewsRepo`; route `engagement.js` (khách), `staff.js` (quầy), `operations.js` (quản lý).

| Method & path | Quyền | Request | Response | Lỗi |
| --- | --- | --- | --- | --- |
| `GET /api/sessions/{id}/review` | Điện thoại trong nhóm (cookie) | — | `{ canReview, reason: null \| 'SESSION_NOT_PAID' \| 'REVIEW_EXPIRED' \| 'ALREADY_REVIEWED', submitted, items[{ menuItemId, name }] }` | 403 |
| `POST /api/sessions/{id}/review` | Điện thoại trong nhóm | `{ items[{ menuItemId, stars 1–5 }] (≤ 50, mỗi món một lần), comment? (≤ 300) }` | 201 `{ reviewId, hasLow }` | 400 VALIDATION_ERROR, 403, 409 SESSION_NOT_PAID / REVIEW_EXPIRED / ALREADY_REVIEWED / REVIEW_LIMIT |
| `GET /api/reviews/alerts` | NV (`pos.use`) | — | Đánh giá thấp chưa xử lý trong 12 giờ gần nhất | — |
| `POST /api/reviews/{id}/handle` | NV (`pos.use`) | — | Đánh giá sau xử lý (`handledBy`, `handledAt`) | 404, 409 ALREADY_PROCESSED |
| `GET /api/admin/reviews?from&to` | ADMIN | — | `{ from, to, items[{ menuItemId, name, count, avg, dist[1★…5★] }], reviews[…] }` | 400 |

**Thay đổi trên endpoint đã có:**
- `GET /api/menu`: mỗi món có `rating: { avg, count } | null`.
- `GET/PUT /api/admin/settings`: thêm `reviewMenuMinCount` (1–100), `reviewMenuDays` (7–365).
- Nhật ký thao tác: `review.handle`.

## Bổ sung F-052 — tra cứu API trong Quản lý (ADR-011, 23/10/2026)

Chi tiết: [FEATURE-052](../chức-năng/FEATURE-052.md), BR-084. Mã nguồn: `routes/apiDocs.js` (đọc router lúc chạy, mức quyền theo middleware), `services/apiDocsService.js` (ghép mô tả từ file này); bảng router dưới `/api` ở `app.js` (`app.locals.apiRouters`).

| Method & path | Quyền | Request | Response | Lỗi |
| --- | --- | --- | --- | --- |
| `GET /api/admin/api-docs` | ADMIN | — | `{ generatedAt, contract: { file, found, documented }, total, endpoints[{ method, path, area: GUEST \| POS \| ADMIN, resource, access: PUBLIC \| CLIENT_OR_STAFF \| STAFF \| MANAGER \| ADMIN, roles[], permission, contract[{ section, fields[[tên cột, nội dung]] }] }] }` | 401, 403 |

**Cách ghép mô tả:** mọi dòng bảng trong file này có ô đầu nhắc tới endpoint, so khớp method + đường dẫn (`{id}` = `:id`, bỏ query). Hiểu các dạng viết gọn đang dùng: `` `PUT` / `DELETE /api/x/{id}` ``, `` `GET /api/x` · `POST` `` (cùng đường dẫn), `` `…/{id}` `` và `` `…/cancel` `` (nối vào đường dẫn đứng trước). Endpoint chỉ được nhắc trong đoạn văn (không nằm trong bảng) hiện "chưa có mô tả".

## Bổ sung F-053 — đổi tên quán và địa chỉ (TASK-067, 23/10/2026)

Chi tiết: [FEATURE-053](../chức-năng/FEATURE-053.md), BR-085. Không có endpoint mới.

**Thay đổi trên endpoint đã có:**
- `GET /api/admin/settings`: thêm `shopName`, `shopAddress` (chưa lưu → giá trị `SHOP_NAME` / `SHOP_ADDRESS` của `.env`).
- `PUT /api/admin/settings` (ADMIN): nhận thêm `shopName` (1–100 ký tự sau khi bỏ khoảng trắng hai đầu), `shopAddress` (0–200; rỗng = không in địa chỉ). Sai → `400 VALIDATION_ERROR` (`details.fields[].path` = `shopName` / `shopAddress`). Nhật ký thao tác: `settings.update` (trước = ảnh bảng `Settings`, sau = `{ input, result }`).
- `GET /api/auth/me` (`shop`), `GET /api/menu` (`shop.name`), hóa đơn `GET /api/sessions/{id}/receipt`, `GET /api/payments/{id}/receipt`, `GET /api/orders/{id}/receipt` (`shop`): đọc từ cài đặt thay vì `.env`.

## Bổ sung F-054 — đăng xuất phải đóng ca (ADR-014, 23/10/2026)

Chi tiết: [FEATURE-054](../chức-năng/FEATURE-054.md), BR-086. Không có endpoint mới.

**Thay đổi trên endpoint đã có:**
- `POST /api/auth/logout` (NV): người gọi là người mở ca đang chạy → `409 SHIFT_OPEN` `{ code, message: "Bạn đang giữ ca #N — đếm tiền và đóng ca trước khi đăng xuất", details: { shiftId, cashPending } }` (`cashPending` = số khoản chi chờ duyệt — còn thì phải duyệt / từ chối trước mới đóng được ca), không ghi giờ ra chấm công. Thành công không đổi: `200 { clockedOut }` (đóng ca bằng `POST /api/shifts/{id}/close` đã ghi giờ ra cho người đóng → đăng xuất sau đó trả `clockedOut: 0`).

## Bổ sung F-055 — chưa mở ca thì không nhận và không xử lý đơn (ADR-017, 23/10/2026)

Chi tiết: [FEATURE-055](../chức-năng/FEATURE-055.md), BR-087. Không có endpoint mới. Mã lỗi dùng lại `409 NO_OPEN_SHIFT` (F-018), lời nhắn theo việc.

**Thay đổi trên endpoint đã có:**

| Method & path | Thay đổi |
| --- | --- |
| `POST /api/orders` | Không có ca mở → `409 NO_OPEN_SHIFT` "Quán chưa mở ca nên chưa nhận đơn — vui lòng chờ nhân viên mở ca" (kiểm sau `503 STORE_CLOSED`); không tạo đơn |
| `GET /api/menu` · `GET /api/store` | `store` thêm `shiftOpen: boolean`. Khách gửi được đơn khi `acceptingOrders && shiftOpen` |
| `POST /api/orders/{id}/accept` · `POST /api/orders/{id}/complete` · `POST /api/orders/{id}/cancel` | Không có ca mở → `409 NO_OPEN_SHIFT` "Chưa mở ca — hãy mở ca trước khi xử lý đơn" |
| `POST /api/sessions/{id}/orders` | Như trên (gọi món tại bàn — đơn vào thẳng "Đang pha") |
| `POST /api/order-items/{id}/void` · `POST /api/orders/{id}/void` · `POST /api/sessions/{id}/cancel` | Như trên |
| `POST /api/sessions/{id}/move` | Như trên |
| `POST /api/sessions/{id}/splits` · `PUT /api/sessions/{id}/items/{orderItemId}/split` | Như trên (khách và quầy; khách nhận lời nhắn "Quán chưa mở ca nên chưa chia bill được …") |
| `POST /api/sessions/{id}/splits/merge` | Như trên (chỉ quầy) |
| `POST /api/shifts/open` · `POST /api/shifts/{id}/close` | Phát thêm `store.status_changed` (có `shiftOpen`) tới phòng `public` + `staff` |


## Bổ sung F-056 / F-057 / F-058 — chuyển khoản, thu chung nhiều bàn, tách hóa đơn (ADR-019, 24/10/2026)

Chi tiết: [FEATURE-056](../chức-năng/FEATURE-056.md), [FEATURE-057](../chức-năng/FEATURE-057.md), [FEATURE-058](../chức-năng/FEATURE-058.md); BR-088…BR-091.

**Endpoint mới:**

| Method & path | Quyền | Body | Kết quả | Lỗi |
| --- | --- | --- | --- | --- |
| `POST /api/sessions/{id}/splits/separate` | NV | `{ label (1–50), orderItemIds: int[1..100] }` | `201 { splitId, …view chia bill }` (bàn chưa chia: thêm phần "Phần còn lại") | 400 `VALIDATION_ERROR`; 404; 409 `SESSION_CLOSED`, `LINE_LOCKED`, `NO_OPEN_SHIFT` |

**Thay đổi trên endpoint đã có:**

| Method & path | Thay đổi |
| --- | --- |
| `POST /api/sessions/{id}/settle` · `POST /api/splits/{id}/settle` · `POST /api/orders/takeaway` | Body thêm `method: 'CASH' \| 'TRANSFER'` (mặc định `CASH`); `amountReceived` chỉ bắt buộc khi `CASH` (thiếu → `400 VALIDATION_ERROR` "Nhập tiền khách đưa"). Chuyển khoản lưu `amountReceived = amountDue`, `changeGiven = 0`. `payment.method` trong kết quả |
| `POST /api/sessions/{id}/settle/preview` · `POST /api/sessions/{id}/settle` | Body thêm `mergeSessionIds: uuid[0..10]` (thu chung). Preview trả thêm `mergedSessions[{ sessionId, table, ordersTotal }]`; settle trả thêm `mergedSessionIds`. Lỗi thêm: `400 VALIDATION_ERROR` (trùng / chọn chính bàn), `404`, `409 SESSION_CLOSED`, `409 SESSION_HAS_SPLITS` (bàn được chọn đang chia bill); `HAS_PENDING_ORDERS` / `AMOUNT_CHANGED` sau khi gộp → không gộp gì |
| `GET /api/sessions/{id}/receipt?mode=provisional&merge=id1,id2` | Phiếu tạm tính thu chung; bill có `tables[]`, `lines[].table`, `orders[].table`; phiên đã gộp → trả bill của phiên đích |
| `GET /api/sessions/{id}` (khách / quầy) | Phiên đã gộp có `mergedInto: { sessionId, table: { tableId, code, name } }` — **không** gửi mã QR bàn đích (AC-010-04); điện thoại lưu phiên đích cho URL bàn hiện tại |
| Sự kiện `session.settled` | Thêm `mergedSessionIds` (phòng `staff` + phiên đích); mỗi phiên được gộp nhận `session.settled { sessionId, table, mergedInto }` |
| `GET /api/shifts/current` · `GET /api/shifts/{id}/report` · `GET /api/admin/shifts` | `cashIn` chỉ tiền mặt; thêm `transferIn`, `transferCount`, `transferRefunds`; `cashOut` = hoàn tiền của lượt tiền mặt; `expectedCash` theo BR-089; lượt thu trong báo cáo ca có `method` |
| `GET /api/admin/reports/revenue` · `GET /api/admin/payments` | Thêm `byMethod: { CASH, TRANSFER: { collected, refunded, revenue, payments } }`; mỗi lượt thu có `method` |
| Bill (`/api/sessions/{id}/receipt`, `/api/payments/{id}/receipt`, `/api/orders/{id}/receipt`) | `payment.method` |

Mã lỗi SP mới: 50210 `VALIDATION_ERROR`, 50211 `NOT_FOUND`, 50212 `SESSION_CLOSED`, 50213 `SESSION_HAS_SPLITS` (thu chung).

## Bổ sung F-059 — QR Wi-Fi cho khách (TASK-074, 26/10/2026)

Chi tiết: [FEATURE-059](../chức-năng/FEATURE-059.md), BR-092.

**Endpoint mới:**

| Method & path | Quyền | Body | Kết quả | Lỗi |
| --- | --- | --- | --- | --- |
| `GET /api/admin/wifi-qr.png` | ADMIN | — | `200 image/png` — QR Wi-Fi chuẩn `WIFI:T:WPA;S:…;P:…;;` (mạng mở: `T:nopass`) để in cạnh QR bàn | 401; 403; 404 khi chưa nhập tên Wi-Fi |

**Thay đổi trên endpoint đã có:**
- `GET /api/admin/settings`: thêm `wifiSsid`, `wifiPassword` (chưa lưu → chuỗi rỗng).
- `PUT /api/admin/settings` (ADMIN): nhận thêm `wifiSsid` (bỏ khoảng trắng hai đầu, ≤ 32 byte UTF-8; rỗng = không in QR Wi-Fi), `wifiPassword` (rỗng hoặc 8–63 ký tự ASCII in được — không dấu; giữ nguyên khoảng trắng); cả hai không được kết thúc bằng `\`. Sai → `400 VALIDATION_ERROR` (`details.fields[].path` = `wifiSsid` / `wifiPassword`). Nhật ký thao tác `settings.update` không chứa mật khẩu Wi-Fi.

## Bổ sung F-060 — phát hiện bất thường, cảnh báo qua email (ADR-020, 27/10/2026)

Chi tiết: [FEATURE-060](../chức-năng/FEATURE-060.md), BR-093…BR-095. Mọi endpoint dưới đây chỉ ADMIN (`requireAdmin` của `/api/admin`).

**Endpoint mới:**

| Method & path | Quyền | Body | Kết quả | Lỗi |
| --- | --- | --- | --- | --- |
| `GET /api/admin/alerts` | ADMIN | query `status` = `NEW` (mặc định) \| `ALL`, `limit` 1–500 (mặc định 100) | `200 { alerts: [{ alertId, kind, severity, shiftId, user, title, detail, status, note, handledBy, handledAt, createdAt }], newCount }` — mới nhất trước; `detail` có giá trị, ngưỡng (`fixed`), mức bình thường (`normal`), người liên quan (`people`) | 400 VALIDATION_ERROR; 401; 403 |
| `PATCH /api/admin/alerts/{id}` | ADMIN | `{ status: 'SEEN' \| 'RESOLVED', note? (≤ 300) }` | `200 { alert }` — ghi người + giờ xử lý | 400 VALIDATION_ERROR; 401; 403; 404 NOT_FOUND |
| `GET /api/admin/alerts/mail-status` | ADMIN | — | `200 { configured, transport, from, pending, failed, lastSent: { subject, at } \| null, lastError: { subject, error, status, retryAt } \| null }` — **không** có mật khẩu hộp thư | 401; 403 |
| `POST /api/admin/alerts/test-email` | ADMIN | `{ emails: string[] }` (1–5, đúng dạng, không trùng) | `200 { ok: true }` hoặc `200 { ok: false, error }` (vd "Chưa cấu hình hộp thư gửi …", đã chạm giới hạn email / giờ, lỗi SMTP) — gửi thẳng, không qua hàng đợi, nhưng ghi một dòng `SENT` để tính vào giới hạn mỗi giờ | 400 VALIDATION_ERROR; 401; 403 |
| `POST /api/admin/alerts/mail-retry` | ADMIN | `{}` | `200 { requeued }` — mọi email `FAILED` về `PENDING`, đếm lượt lại từ đầu, gửi ngay | 401; 403 |

**Thay đổi trên endpoint đã có:**
- `GET /api/admin/settings`: thêm `alertEmails` (mảng, mặc định `[]`), `alertImmediate`, `alertShiftReport`, `alertDailyDigest`, `alertUseStats` (mặc định `true`), `alertDigestTime` (`'22:00'`), `alertQuietStart`, `alertQuietEnd` (`''` = tắt giờ yên lặng), `alertCashDiffMax` (20000), `alertTransferShareMax` (60), `alertVoidsMax` (3), `alertRefundsMax` (2), `alertRefundBig` (200000), `alertManualDiscountMax` (5).
- `PUT /api/admin/settings` (ADMIN): nhận các khóa trên. `alertEmails` 0–5 email (bỏ khoảng trắng, chữ thường, ≤ 100 ký tự / email, không trùng, cả danh sách ≤ 200 ký tự; mảng rỗng = không gửi email); giờ `HH:MM`; `alertCashDiffMax` 0–10.000.000; `alertTransferShareMax` 1–100; `alertVoidsMax`, `alertRefundsMax`, `alertManualDiscountMax` 0–100; `alertRefundBig` 1.000–100.000.000. Sai → `400 VALIDATION_ERROR` (`details.fields[].path` = tên khóa, `alertEmails.N` cho từng email), cài đặt không đổi. Đổi bất kỳ khóa cảnh báo nào (so giá trị cũ / mới; danh sách email so không kể thứ tự) → thư báo tới cả địa chỉ cũ lẫn mới, ghi Trước → Sau (lỗi gửi không làm lỗi việc lưu).
- `POST /api/shifts/{id}/close`, `POST /api/payments/{id}/refunds`, `POST /api/cash-transactions/{id}/void` (hủy / sửa khoản sổ quỹ đã duyệt): **request / response không đổi**; sau khi lưu xong app chạy phát hiện bất thường (lỗi phát hiện / gửi chỉ ghi log, không làm lỗi thao tác).

**Sự kiện realtime mới:** `alert.created` `{ alert }` — chỉ tới phòng `admin` (socket của tài khoản ADMIN tự vào phòng này khi kết nối); nhân viên / trưởng ca không nhận.

## Bổ sung F-061 / F-062 / F-063 — chế độ cơ bản, chính sách dữ liệu, cảnh báo QR (ADR-021, 29/10/2026)

Chi tiết: [FEATURE-061](../chức-năng/FEATURE-061.md), [FEATURE-062](../chức-năng/FEATURE-062.md), [FEATURE-063](../chức-năng/FEATURE-063.md), BR-096…BR-099.

**Endpoint mới:**

| Method & path | Quyền | Body | Kết quả | Lỗi |
| --- | --- | --- | --- | --- |
| `POST /api/auth/tour-seen` | Nhân viên | — | `200 { tourSeenAt }` — ghi lần đầu xem xong / bỏ qua hướng dẫn 5 bước; gọi lại giữ giờ cũ | 401 |
| `GET /api/shop` | Công khai | — | `200 { name, address }` — tên + địa chỉ quán (Cài đặt, chưa lưu → `.env`) cho trang Chính sách dữ liệu | — |
| `GET /api/qr-check` | Nhân viên | — | `200 { baseUrl, printedBaseUrl, printedAt, mismatch, localhost, unreachable, machineIps }` — `mismatch` = đã in và origin lúc in ≠ origin `PUBLIC_BASE_URL` đang chạy; `localhost` = host `localhost` / `127.x` / `::1`; `unreachable` = host là IPv4 không có trên card mạng nào của máy (`machineIps`) | 401; 403 tài khoản khóa |
| `POST /api/admin/qr-printed` | ADMIN | `{}` | `200` như `qr-check` — lưu `PUBLIC_BASE_URL` đang chạy + giờ làm địa chỉ đã in (trang In mã QR gọi khi bấm In / Ctrl+P) | 401; 403 |

**Thay đổi trên endpoint đã có:**
- `GET /api/auth/me`: thêm `modules` (mảng nhóm menu nâng cao đang bật, rỗng = chế độ cơ bản) và `user.tourSeenAt` (null = chưa xem hướng dẫn). `POST /api/auth/login`, `GET /api/admin/users` cũng có `tourSeenAt` trong đối tượng tài khoản.
- `GET /api/admin/settings`: thêm `uiModules` (mảng con của `inventory`, `customers`, `finance`, `analytics`, `advanced`), `qrPrintedBaseUrl`, `qrPrintedAt` (chỉ đọc). `PUT /api/admin/settings` nhận `uiModules` (không trùng; nhóm lạ → `400 VALIDATION_ERROR`). Ẩn nhóm **không** chặn API của nhóm đó.
- Trang mới (không phải API): `GET /chinh-sach-du-lieu` (SCR-48).
