# Phân tích backend cafe-qr-app

> Phân tích trên mã nhánh `task/TASK-073-chuyen-khoan-gop-tach` (commit `fcee98e`, ngày 24/10/2026), là bản đang chạy ở `http://localhost:3000`.
> Mọi đường dẫn tính từ thư mục repo `cafe-qr-app/`. Tên hàm ghi theo đúng mã nguồn để tìm nhanh bằng Ctrl+Shift+F.

## Mục lục

1. [Kiến trúc tổng thể](#1-kiến-trúc-tổng-thể)
2. [Backend khởi động thế nào](#2-backend-khởi-động-thế-nào)
3. [Một request đi qua những hàm nào](#3-một-request-đi-qua-những-hàm-nào)
4. [Phân quyền](#4-phân-quyền)
5. [Backend kết nối với front-end](#5-backend-kết-nối-với-front-end)
6. [Hàm lấy và ghi dữ liệu database](#6-hàm-lấy-và-ghi-dữ-liệu-database)
7. [Chức năng nào dùng hàm nào](#7-chức-năng-nào-dùng-hàm-nào)
8. [Ví dụ: vòng đời một đơn hàng](#8-ví-dụ-vòng-đời-một-đơn-hàng)
9. [Phía database: khi có thay đổi thì chạy gì](#9-phía-database-khi-có-thay-đổi-thì-chạy-gì)
10. [Sự kiện realtime](#10-sự-kiện-realtime)
11. [Bộ nhớ đệm trong tiến trình](#11-bộ-nhớ-đệm-trong-tiến-trình)
12. [Job nền](#12-job-nền)
13. [Bảng tra file](#13-bảng-tra-file)
14. [Tài liệu liên quan](#14-tài-liệu-liên-quan)

---

## 1. Kiến trúc tổng thể

Toàn bộ backend là **một tiến trình Node.js**:

- **Express 5** phục vụ REST API (`/api/*`) và các trang HTML tĩnh.
- **Socket.io** gắn vào cùng HTTP server, cùng cổng, để đẩy thay đổi theo thời gian thực.
- **SQL Server** lưu dữ liệu. Thư viện `mssql` (driver tedious) dùng một pool kết nối chung.

Mỗi request đi qua 4 tầng, tầng trên chỉ gọi tầng ngay dưới:

```
Trình duyệt: khách /t/…, quầy /pos, quản lý /admin
   │  fetch JSON (js/api.js)                          ▲  socket.on('order.created', …)
   ▼                                                  │
routes/*.js        nhận request, kiểm quyền, kiểm dữ liệu (zod), gọi service
   ▼
services/*.js      nghiệp vụ: tính tiền, kiểm ca, chống bấm trùng, phát realtime ──► realtime/publisher.js ──► Socket.io
   ▼
repositories/*.js  SQL: SELECT để đọc; gọi stored procedure để ghi tiền / kho
   ▼
db.js              pool mssql ─────────────────────────────► SQL Server (bảng + 38 stored procedure)
```

Quy mô (bản TASK-073):

| Thành phần | Số lượng |
|---|---|
| File route (`routes/`) | 14 (13 file API + `pages.js`), khoảng 270 endpoint |
| File service (`services/`) | 32 |
| File repository (`repositories/`) | 33 |
| Stored procedure | 38 (trong 33 file ở `cơ-sở-dữ-liệu/thủ-tục/`) |
| Migration | 39 (`0001` … `0039` ở `cơ-sở-dữ-liệu/chuyển-đổi/`) |
| Loại sự kiện realtime | khoảng 30 |
| Job nền | 9 |

Nguyên tắc chính:

- **Front-end không tự tính tiền.** Giá, khuyến mãi, chiết khấu đều do backend tính bằng một bộ tính giá dùng chung.
- **Thay đổi tiền và kho chỉ đi qua stored procedure**, chạy trong transaction có khóa dòng.
- **Realtime chỉ phát sau khi database đã commit.** Realtime không phải nguồn dữ liệu: trang luôn tải lại dữ liệu qua REST khi kết nối lại.

---

## 2. Backend khởi động thế nào

Lệnh `npm start` chạy `node --env-file-if-exists=.env ứng-dụng/máy-chủ/src/server.js`.

Thứ tự trong `server.js`:

| Bước | Hàm / lệnh | Việc làm |
|---|---|---|
| 1 | `config` (`config.js`) | Đọc biến môi trường: cổng, DB, JWT, tên quán, thư mục ảnh… Đọc `config.jwtSecret` ngay để thiếu `JWT_SECRET` thì báo lỗi sớm. |
| 2 | `createApp()` (`app.js`) | Dựng Express: `helmet` (header bảo mật, CSP), `express.json({ limit: '100kb' })`, `cookieParser()`, rồi gắn các router dưới `/api`, trang HTML, file tĩnh, trang 404 và `errorHandler`. |
| 3 | `http.createServer(app)` | Tạo HTTP server. |
| 4 | `attachRealtime(server)` (`realtime/io.js`) | Gắn Socket.io vào cùng server, đăng ký middleware xác thực khi bắt tay, lưu `io` cho `publisher.js`. |
| 5 | `getPool()` (`db.js`) | Mở pool kết nối SQL Server. Lỗi thì in hướng dẫn rồi `process.exit(1)`. |
| 6 | `initAvailability()` (`menuService.js`) | Chụp trạng thái "món nào đang đặt được" làm mốc so sánh cho `menu.availability_changed`. |
| 7 | `server.listen(config.port)` | Nghe cổng (mặc định 3000), in địa chỉ localhost và các IP mạng LAN. |
| 8 | `startScheduler()` (`jobs/scheduler.js`) | Bật bộ lập lịch job nền, trừ khi `JOBS_ENABLED=false`. |
| Tắt | `shutdown(signal)` | Nhận Ctrl+C (SIGINT/SIGTERM): `io.close()`, `server.close()`, `closePool()`. |

Thứ tự gắn router trong `createApp()` (mảng `apiRouters`, cũng là nguồn cho trang Tra cứu API):

| Tiền tố | Router | Dành cho |
|---|---|---|
| `/api` | `publicRouter` (`public.js`) | Khách (cookie), đăng nhập, health |
| `/api` | `engagementRouter` (`engagement.js`) | Khách và quầy: gọi lại đơn, thời gian chờ, chia bill, đánh giá |
| `/api/admin` | `adminRouter` (`admin.js`) | Chỉ ADMIN. Bên trong gắn tiếp `marketing`, `operations`, `advanced`, `financeAdmin`, `analytics`, `apiDocs` |
| `/api` | `opsRouter` (`ops.js`) | Kho ở quầy: sơ chế, hủy hàng, lô, nhận hàng, kiểm kê |
| `/api` | `financeRouter` (`finance.js`) | Sổ quỹ, chấm công, đăng xuất |
| `/api` | `loyaltyRouter` (`loyalty.js`) | Điểm, tem, voucher khi thu tiền |
| `/api` | `dashboardRouter` (`analytics.js`) | Dashboard chủ quán (`/admin/today`) |
| `/api` | `staffRouter` (`staff.js`) | Quầy: đơn, bàn, thu tiền, ca, hoàn tiền |

---

## 3. Một request đi qua những hàm nào

Ví dụ `POST /api/orders/123/complete` (nhân viên bấm "Hoàn tất"):

| Bước | Hàm | File | Việc làm |
|---|---|---|---|
| 1 | `helmet`, `express.json`, `cookieParser` | `app.js` | Header bảo mật, đọc thân JSON, đọc cookie |
| 2 | `ensureClientToken` | `middleware/client.js` | Đọc hoặc cấp cookie HttpOnly `cf_client` (32 ký tự hex). Khách không có tài khoản nên cookie này là "danh tính" của điện thoại. |
| 3 | `auditTrail` | `middleware/audit.js` | Nếu route nằm trong bảng luật (tiền, kho, ca, quyền, mọi thao tác ghi dưới `/admin`): chụp ảnh dữ liệu "trước", rồi khi trả kết quả thành công thì ghi `AuditLogs`. Mật khẩu và token bị bỏ, số điện thoại bị che. |
| 4 | `requireStaff` / `requireAdmin` / `optionalStaff` / `requirePermission(...)` | `middleware/auth.js`, `auth/permissions.js` | Đọc `Authorization: Bearer <JWT>`. `userFromToken()` xác minh chữ ký rồi đọc lại user trong DB, nên tài khoản bị khóa mất quyền ngay lập tức. |
| 5 | `loginLimiter`, `orderLimiter`, `memberLimiters` | `middleware/rateLimit.js` | Chống spam (chỉ gắn ở một số route) |
| 6 | `parse(schema, data)`, `paramId(req)`, `paramGuid(req)` | `middleware/validate.js` | Kiểm dữ liệu bằng zod. Sai thì ném 400 `VALIDATION_ERROR` kèm danh sách trường sai. |
| 7 | `orderService.complete(orderId, user)` | `services/orderService.js` | Kiểm ca đang mở (`assertShiftOpen`), gọi repo, phát realtime, báo nguyên liệu sắp hết |
| 8 | `ordersRepo.complete(orderId, userId)` | `repositories/ordersRepo.js` | Gọi `dbo.sp_CompleteOrder` |
| 9 | `res.json(...)` | route | Trả JSON |
| Lỗi | `errorHandler` + `fromSqlError` | `middleware/errorHandler.js`, `errors.js` | Mọi lỗi thành `{ code, message, details }` |

Cách xử lý lỗi:

- Service ném `AppError` bằng các hàm `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `tooMany` (`errors.js`).
- Stored procedure báo lỗi bằng `THROW 500xx`. `fromSqlError(err)` tra bảng `SQL_ERRORS` để đổi sang HTTP và thông báo tiếng Việt. Ví dụ:

| Mã SQL | HTTP | `code` | Ý nghĩa |
|---|---|---|---|
| 50001 | 409 | `ALREADY_PROCESSED` | Đơn đã được nhân viên khác xử lý |
| 50002 | 409 | `OUT_OF_STOCK` | Không đủ nguyên liệu |
| 50020 | 400 | `INSUFFICIENT_AMOUNT` | Tiền khách đưa chưa đủ |
| 50034 | 409 | `AMOUNT_CHANGED` | Tổng tiền vừa thay đổi |
| 50070 | 409 | `NO_OPEN_SHIFT` | Chưa mở ca |
| 50213 | 409 | `SESSION_HAS_SPLITS` | Bàn được chọn để thu chung đang chia bill |

- Lỗi không nhận ra thì trả 500 `INTERNAL_ERROR` và in log ở server.
- Route không cần `try/catch`: Express 5 tự chuyển lỗi của hàm `async` sang `errorHandler`.

---

## 4. Phân quyền

Có 3 vai trò: **STAFF** (nhân viên) < **MANAGER** (trưởng ca) < **ADMIN** (quản lý). Khách không có tài khoản, chỉ có cookie `cf_client`.

| Cơ chế | Hàm | Ý nghĩa |
|---|---|---|
| Khách | `ensureClientToken` + `sessionsRepo.isMember(sessionId, clientToken)` | Khách chỉ đọc và ghi được phiên mà điện thoại mình thuộc về (bảng `SessionClients`) |
| Đăng nhập không bắt buộc | `optionalStaff` | Endpoint dùng chung. Có token thì là nhân viên, ví dụ thấy tên hội viên đầy đủ. |
| Bắt buộc nhân viên | `requireStaff` | Mọi route trong `staff.js` |
| Bắt buộc quản lý | `requireAdmin` | Mọi route dưới `/api/admin` |
| Theo quyền cụ thể | `requirePermission('cash.approve')`, `can(user, permission)` | Ma trận `PERMISSIONS` trong `auth/permissions.js`. Ví dụ `inventory.adjust`, `stocktake.post`, `cash.approve` chỉ dành cho MANAGER trở lên. |

Server kiểm quyền ở mọi endpoint; front-end chỉ ẩn hoặc hiện nút.

---

## 5. Backend kết nối với front-end

Có 3 kênh.

### 5.1. REST JSON (kênh chính)

**Phía front-end** (`ứng-dụng/giao-diện/public/js/api.js`):

| Hàm | Dùng cho |
|---|---|
| `call(path, { method, body, headers, staff })` | Hàm lõi bọc `fetch`: gửi và nhận JSON, đổi lỗi thành `ApiError { status, code, message, details }`. Mất mạng thì ra `code: 'NETWORK'`. |
| `api(path, opts)` | API khách (dùng cookie `cf_client`) |
| `staffApi(path, opts)` | API nhân viên: gắn `Authorization: Bearer <token>` (token lấy từ `auth-store.js`). Nhận 401 hoặc `ACCOUNT_LOCKED` thì xóa phiên đăng nhập và chuyển về `/pos/login`. |
| `staffUpload(path, file)` | Gửi ảnh, ví dụ ảnh hóa đơn sổ quỹ |
| `staffBlobUrl(path)` | Tải file có xác thực, ví dụ ảnh QR |

Ví dụ ở `js/pages/pos-dashboard.js`:

```js
await staffApi(`/api/orders/${o.orderId}/accept`, { method: 'POST' });
const list = await staffApi('/api/orders');
```

**Phía backend**: route trả về bằng `res.json(data)` hoặc `res.status(201).json(data)`.

Front-end không tự tính tiền:

- Giỏ hàng gọi `POST /api/orders/quote`.
- Quầy gọi `POST /api/sessions/:id/settle/preview` trước khi thu.
- Backend dùng cùng `pricingService.quote()` cho cả báo giá lẫn lúc gửi đơn, nên số hiển thị khớp với số ghi vào DB.

### 5.2. Socket.io (đẩy thay đổi theo thời gian thực)

**Phía backend:**

- `attachRealtime(httpServer)` (`realtime/io.js`) xác thực lúc bắt tay và xếp mỗi kết nối vào các room:

| Room | Ai vào |
|---|---|
| `public` | Mọi kết nối |
| `staff` | Kết nối gửi kèm `auth.token` là JWT nhân viên hợp lệ |
| `session:{id}` | Điện thoại khách gửi `auth.sessionId` và cookie `cf_client` thuộc phiên đó |

- `publish(rooms, event, payload)` và `publishOrderEvent(event, order, payload)` (`realtime/publisher.js`) phát sự kiện, tự thêm `emittedAt`. Service chỉ gọi hai hàm này **sau khi** transaction đã commit.

**Phía front-end** (`js/socket.js`):

- `connectRealtime({ token, sessionId, onOnline, onOffline, onAuthError })` mở kết nối.
  - Lần đầu sẵn sàng thì gọi `onOnline(false)`; mỗi lần kết nối lại thì gọi `onOnline(true)` để trang tải lại toàn bộ dữ liệu.
  - Tự đóng khi rời trang (`pagehide`) và mở lại khi trình duyệt khôi phục trang từ bộ nhớ đệm (`pageshow`).
- Các trang đăng ký sự kiện, ví dụ trong `pos-dashboard.js`:

```js
socket?.on('order.created', onOrderEvent);
socket?.on('session.settled', onSessionEvent);
socket?.on('inventory.low', (p) => toast(`Nguyên liệu sắp hết: ${p.name}…`));
```

### 5.3. Trang HTML

- `routes/pages.js` map URL sang file HTML trong `ứng-dụng/giao-diện/public`, ví dụ `/pos` thành `pos/index.html`, `/t/:qrToken/menu` thành `t/menu.html`, `/admin/reports` thành `admin/reports.html`.
- CSS, JS, ảnh đi qua `express.static(publicDir)`.
- HTML không chứa dữ liệu; trang tự gọi `/api/*` sau khi tải.

---

## 6. Hàm lấy và ghi dữ liệu database

### 6.1. Các hàm lõi trong `db.js`

| Hàm | Dùng để |
|---|---|
| `getPool()` | Tạo một `ConnectionPool` dùng chung cho cả tiến trình (tối đa `DB_POOL_MAX`, mặc định 20). Lỗi kết nối thì reset để lần sau thử lại. |
| `closePool()` | Đóng pool khi tắt server |
| `request()` | Tạo request mới. Dùng khi gọi stored procedure: `.input(...)`, `.output(...)`, `.execute('dbo.sp_…')` |
| `query(text, params)` | Chạy SQL có tham số kiểu, ví dụ `query('SELECT … WHERE OrderId = @id', { id: [sql.Int, 5] })`. Tham số luôn tách khỏi câu SQL nên chống được SQL injection. |
| `inTransaction(fn)` | Chạy `fn(tx)` trong một transaction; lỗi thì rollback. Ví dụ thu chung nhiều bàn. |
| `txQuery(tx, text, params)` | Như `query` nhưng chạy trong transaction `tx` |
| `sqlErrorNumber(err)` | Lấy số lỗi SQL Server (500xx, 1205 deadlock, 2627/2601 trùng khóa…) |
| `withDeadlockRetry(fn, attempts = 3)` | Bị chọn làm nạn nhân deadlock (1205) thì chờ ngắn rồi chạy lại, tối đa 3 lần |

### 6.2. Quy ước trong repository

**Đọc** bằng `SELECT` qua `query()`, rồi đổi tên cột PascalCase (`OrderId`) thành object camelCase (`orderId`). Ví dụ `ordersRepo`:

| Hàm | Việc làm |
|---|---|
| `getById(orderId)` | `ORDER_SELECT … WHERE o.OrderId = @id`, rồi `mapOrder`, rồi `attachItems` |
| `attachItems(orders)` | Một lần gọi DB trả 2 recordset (dòng món và tùy chọn món) cho nhiều đơn cùng lúc, dùng `STRING_SPLIT(@ids, ',')`. Gắn combo con vào dòng cha. |
| `listActive({ statuses, since, completedSince, type })` | Danh sách đơn cho màn quầy |
| `listBySession(sessionId)` | Các đơn của một phiên |
| `history({ fromUtc, toUtc, … })` | Lịch sử đơn có phân trang (`COUNT(*) OVER ()`) |

Ví dụ khác: `sessionsRepo.findById`, `sessionsRepo.isMember`, `menuRepo.orderableStates`, `catalogRepo` (nạp toàn bộ món, combo, tùy chọn cho bộ tính giá trong một lần gọi).

**Ghi đơn giản** (CRUD trang quản lý, tiếp nhận đơn, mở ca) bằng `INSERT`/`UPDATE` trực tiếp:

- `ordersRepo.accept`: `UPDATE Orders SET Status='PREPARING' WHERE OrderId=@id AND Status='PENDING'` rồi đọc `@@ROWCOUNT`. Hai máy bấm cùng lúc thì chỉ một máy đổi được.
- `shiftsRepo.open`: `INSERT Shifts …`. Unique index `UX_Shifts_OneOpen` chặn hai ca cùng mở; lỗi 2627/2601 được đổi thành 409 `SHIFT_ALREADY_OPEN`.

**Ghi liên quan tiền hoặc kho** luôn gọi stored procedure. Ví dụ `ordersRepo.submit(...)`:

- Đóng gói dòng món thành bảng TVP `dbo.OrderLineInput`, tùy chọn thành `dbo.OrderLineOptionInput`.
- Truyền khoảng 25 tham số (giá, khuyến mãi, hội viên, giảm tay, ca…).
- Gọi `.execute('dbo.sp_SubmitOrder')`, nhận lại `OrderId`, `OrderCode`, `SessionReopened` qua tham số output.

---

## 7. Chức năng nào dùng hàm nào

### 7.1. Khách (không đăng nhập)

| Chức năng | Endpoint | Service | Repo → SQL / SP | Realtime |
|---|---|---|---|---|
| Kiểm tra sống | `GET /api/health` | (trong route) | `SELECT 1` | – |
| Quét QR | `POST /api/sessions/scan` | `sessionService.scan` | `sessionsRepo` (SELECT) | – |
| Mở phiên mới / vào phiên | `POST /api/sessions`, `POST /api/sessions/:id/join` | `sessionService.createSession`, `join` | `sessionsRepo` (INSERT `Sessions`, `SessionClients`) | – |
| Xem phiên | `GET /api/sessions/:id` | `sessionService.getDetail` | `sessionsRepo`, `ordersRepo.listBySession` | – |
| Xem menu | `GET /api/menu` | `menuService.getPublicMenu` | `menuRepo`, `scheduleService.visibility` | – |
| Báo giá giỏ | `POST /api/orders/quote` | `orderService.quoteItems` → `pricingService.quote` | `catalogRepo`, `promotionsRepo` | – |
| Gửi đơn | `POST /api/orders` | `orderService.submitDineIn` → `submitToSession` | `ordersRepo.submit` → **`sp_SubmitOrder`** (giữ kho) | `order.created` |
| Gọi thanh toán | `POST /api/sessions/:id/request-payment` | `sessionService.requestPayment` | **`sp_RequestPayment`** | `session.payment_requested` |
| Gọi nhân viên | `POST /api/sessions/:id/call-staff` | `staffCallService.call` | `staffCallsRepo` | `session.staff_called` |
| Gắn thẻ hội viên | `POST /api/sessions/:id/member` | `memberService.attachToSession` | `membersRepo` | `session.member_changed` |
| Đánh giá món | `POST /api/sessions/:id/review` | `reviewService.submit` | `reviewsRepo` | `review.low` (khi ≤ 2 sao) |

### 7.2. Quầy (nhân viên)

| Chức năng | Endpoint | Service | Repo → SQL / SP | Realtime |
|---|---|---|---|---|
| Đăng nhập | `POST /api/auth/login` | `userService.login`: `bcrypt.compare`, `signToken` | `usersRepo.findByUsernameWithHash`. Chấm công vào: `attendanceService.onLogin` → `attendanceRepo.clockIn` → **`sp_ClockIn`** | – |
| Đăng xuất | `POST /api/auth/logout` | `shiftService.assertCanLogout` (người mở ca phải đóng ca trước) | chấm công ra | – |
| Màn đơn hàng | `GET /api/orders` | `orderService.listForDashboard` | `ordersRepo.listActive` | – |
| Mở bàn | `POST /api/tables/:id/sessions` | `sessionService.openTable` | `sessionsRepo` (INSERT) | `session.opened` |
| Gọi món tại bàn | `POST /api/sessions/:id/orders` | `orderService.submitByStaff` | **`sp_SubmitOrder`** (`AcceptNow`, vào thẳng PREPARING) | `order.created` |
| Tiếp nhận đơn | `POST /api/orders/:id/accept` | `orderService.accept` | `ordersRepo.accept` (UPDATE có điều kiện) | `order.status_changed` |
| Hoàn tất đơn | `POST /api/orders/:id/complete` | `orderService.complete` | **`sp_CompleteOrder`** (trừ kho, tính giá vốn) | `order.status_changed`, `inventory.low` |
| Hủy đơn chờ | `POST /api/orders/:id/cancel` | `orderService.cancel` | **`sp_CancelOrder`** (trả kho đã giữ) | `order.cancelled` |
| Bán mang đi | `POST /api/orders/takeaway` (+ `/quote`) | `orderService.takeaway`, `takeawayQuote` | **`sp_SubmitOrder`** (`TAKE_AWAY`, thu tiền luôn) | `order.created` |
| Xem trước tiền bàn | `POST /api/sessions/:id/settle/preview` | `sessionService.settlePreview` | đọc phiên, hội viên, voucher | – |
| Thu tiền bàn (tiền mặt / chuyển khoản) | `POST /api/sessions/:id/settle` | `sessionService.settle` | `sessionsRepo.settle` → **`sp_SettleSession`** | `session.settled` |
| Thu chung nhiều bàn | cùng endpoint, thêm `mergeSessionIds` | `sessionService.settle` | `sessionsRepo.mergeAndSettle`: **`sp_MergeSessions`** + **`sp_SettleSession`** trong một `inTransaction` | `session.settled` (cả các bàn được gộp) |
| Chia bill / tách hóa đơn | `PUT /api/sessions/:id/items/:orderItemId/split`, `POST /api/sessions/:id/splits/separate`, `POST /api/splits/:id/settle` | `splitService.separate`, `settle`, `merge` | `splitsRepo` → **`sp_SettleSplit`** | `session.split_changed` |
| Sửa / xóa món đã gọi | `POST /api/order-items/:id/void` | `voidService.voidItem` | **`sp_VoidOrderItem`** | – |
| Xóa đơn / hủy bàn | `POST /api/orders/:id/void`, `POST /api/sessions/:id/cancel` | `voidService.voidOrder`, `cancelSession` | **`sp_CancelOrders`** | `session.closed` |
| Chuyển bàn | `POST /api/sessions/:id/move` | `sessionService.moveSession` | **`sp_MoveSession`** | `session.table_changed` |
| Đóng bàn trống | `POST /api/sessions/:id/close` | `sessionService.closeEmpty` | **`sp_CloseEmptySession`** | `session.closed` |
| Ghi chú bàn | `PUT /api/sessions/:id/note` | `sessionService.setNote` | `sessionsRepo` | `session.note_changed` |
| Mở ca | `POST /api/shifts/open` | `shiftService.open` | `shiftsRepo.open` (INSERT) | `shift.opened`, `store.status_changed` |
| Đóng ca | `POST /api/shifts/:id/close` | `shiftService.close` | **`sp_CloseShift`** | `shift.closed` |
| Hoàn tiền | `POST /api/payments/:id/refunds` | `refundService.refund` | **`sp_RefundPayment`** (+ `sp_ReverseLoyalty`) | `payment.refunded` |
| Sổ quỹ | `POST /api/cash-transactions`, `…/approve`, `…/reject`, `…/void` | `cashService.create`, `review`, `voidTxn` | **`sp_CreateCashTxn`**, **`sp_ReviewCashTxn`**, **`sp_VoidCashTxn`** | `cash.created`, `cash.reviewed` |
| Sơ chế | `POST /api/prep/batches` | `inventoryService.postBatch` | **`sp_PostPrepBatch`** | `inventory.prepared` |
| Hủy hàng / hủy lô | `POST /api/waste`, `POST /api/lots/:id/write-off` | `inventoryService.logWaste`, `writeOffLot` | **`sp_LogWaste`** | – |
| Nhận hàng theo PO | `POST /api/receiving/purchase-orders/:id/receive` | `purchasingService.receivePo` | **`sp_ReceiveStock`** | `inventory.received` |
| Điều chỉnh kho (trưởng ca) | `POST /api/ops/ingredients/:id/adjust` | `adminService.adjustIngredient` | **`sp_AdjustInventory`** | – |
| Kiểm kê (trưởng ca) | `POST /api/ops/stocktakes/:id/post` | `stockService.post` | **`sp_PostStocktake`** | – |

### 7.3. Quản lý (`/api/admin/*`)

| Chức năng | Service | Repo → SQL / SP |
|---|---|---|
| Thêm / sửa món, danh mục, bàn, nguyên liệu, BOM | `adminService.createItem`, `updateItem`, `replaceBom`, `createTable`… | `menuRepo`, `tablesRepo`, `ingredientsRepo` (INSERT / UPDATE). Đổi menu thì gọi `menuService.menuChanged()` → `menu.updated` |
| Xóa món / danh mục / nguyên liệu / bàn / tài khoản | `adminService.deleteItem`, `deleteCategory`, `deleteIngredient`, `deleteTable`, `userService.remove` | **`sp_DeleteMenuItem`**, **`sp_DeleteCategory`**, **`sp_DeleteIngredient`**, **`sp_DeleteTable`**, **`sp_DeleteUser`** (đã có lịch sử thì xóa mềm) |
| Nhập kho, sửa / hủy phiếu nhập | `stockService` | **`sp_ReceiveStock`**, **`sp_ReviseStockReceipt`** |
| Hủy phiếu kiểm kê | `stockService` | **`sp_VoidStocktake`** |
| Bật / tắt theo dõi lô | `inventoryService` | **`sp_SetTrackLots`** |
| Cộng / trừ điểm hội viên | `loyaltyService` | **`sp_AdjustPoints`** |
| Báo cáo doanh thu, lãi lỗ, phân tích, dashboard | `adminService.revenueReport`, `pnlService`, `analyticsService`, `dashboardService` | `reportsRepo`, `pnlRepo`, `analyticsRepo`, `dashboardRepo` (chỉ SELECT) |
| Nhật ký thao tác | – | `auditRepo` (chỉ thêm và đọc) |
| Tra cứu API | `apiDocsService` | Đọc router Express lúc chạy và `tài-liệu/kiến-trúc/api-contract.md` |

Danh sách đầy đủ khoảng 270 endpoint có ngay trong app ở trang **Tra cứu API**: `/admin/api-docs`.

---

## 8. Ví dụ: vòng đời một đơn hàng

Khách ngồi bàn 5, quét QR, gọi một ly cà phê sữa, rồi thanh toán.

```
Điện thoại khách            Backend (Node)                                  SQL Server
────────────────            ──────────────                                  ──────────
1. Mở /t/<qr>     ──► POST /api/sessions/scan → sessionService.scan ───────► SELECT phiên của bàn
                  ──► POST /api/sessions      → createSession ─────────────► INSERT Sessions, SessionClients
2. Chọn món       ──► POST /api/orders/quote  → pricingService.quote ──────► SELECT giá, khuyến mãi
3. Gửi đơn        ──► POST /api/orders        → orderService.submitDineIn
                        ├ kiểm quán nhận đơn, ca mở, điện thoại thuộc phiên
                        ├ idempotent(): bấm 2 lần trong 60 giây → 1 đơn
                        └ ordersRepo.submit ───────────────────────────────► sp_SubmitOrder
                                                                              ├ khóa Sessions
                                                                              ├ giữ kho: ReservedQty += …
                                                                              └ INSERT Orders, OrderItems…
                        publish('order.created') ──► quầy + điện thoại khách
Màn quầy
4. Tiếp nhận      ──► POST /api/orders/:id/accept → ordersRepo.accept ─────► UPDATE … WHERE Status='PENDING'
                        publish('order.status_changed')
5. Hoàn tất       ──► POST /api/orders/:id/complete → ordersRepo.complete ─► sp_CompleteOrder
                                                                              ├ StockQty −= …, ReservedQty −= …
                                                                              ├ sp_LotConsume (lô hết hạn sớm trước)
                                                                              ├ INSERT InventoryTransactions (DEDUCT)
                                                                              └ chia giá vốn cho từng món
                        publish('order.status_changed'), có thể 'inventory.low'
6. Khách bấm "Gọi thanh toán" → sessionService.requestPayment ─────────────► sp_RequestPayment
7. Thu tiền       ──► POST /api/sessions/:id/settle → sessionService.settle
                        ├ sessionTotals(): hội viên, voucher, giảm tay, làm tròn
                        ├ requireOpenShift(), approvalFor() (giảm tay lớn cần duyệt)
                        └ sessionsRepo.settle ─────────────────────────────► sp_SettleSession
                                                                              ├ kiểm tổng không đổi, đủ tiền, ca mở
                                                                              ├ INSERT Payments, đóng phiên
                                                                              ├ sp_ApplyMemberPayment
                                                                              └ sp_ApplyLoyalty (điểm, tem, voucher)
                        publish('session.settled') ──► quầy + điện thoại khách
```

Chi tiết từng bước:

1. **Gửi đơn** (`orderService.submitToSession`):
   - `pricingService.quote(items, { exclude })` tính giá từng dòng. Khuyến mãi được khóa tại lúc gửi.
   - Nếu không phải nhân viên gọi món, `assertSellHours` chặn món ngoài giờ bán.
   - `toSpLines(priced)` đổi kết quả thành các dòng cho SP.
   - `submitWithRetry` gọi `ordersRepo.submit`:
     - Deadlock thì `withDeadlockRetry` chạy lại.
     - Trùng mã đơn (2627) thì thử mã khác.
     - `OUT_OF_STOCK` hoặc `ITEM_UNAVAILABLE` thì đổi thành thông báo có tên món.
   - Khuyến mãi vừa hết lượt (`PROMO_EXHAUSTED`) thì tính lại không có khuyến mãi đó, tối đa 3 lần.
   - Thành công thì `invalidateQueue()` (thời gian chờ), `publishOrderEvent('order.created')`, `refreshAvailability()`.
2. **Giữ kho khi gửi, trừ kho khi hoàn tất.**
   - Lúc gửi chỉ tăng `ReservedQty`, để hai đơn đồng thời không cùng lấy một phần kho.
   - Lúc hoàn tất mới trừ thật `StockQty`.
   - Hủy đơn chờ thì trả lại phần đã giữ.
3. **Thu tiền** kiểm `expectedAmountDue`. Nếu trong lúc nhân viên đang thu có đơn mới vào, số trên màn hình khác số thật, thì trả 409 `AMOUNT_CHANGED` để nhân viên kiểm lại.

---

## 9. Phía database: khi có thay đổi thì chạy gì

### 9.1. Điểm quan trọng nhất

**Database không tự chạy logic nghiệp vụ khi dữ liệu thay đổi.** Không có trigger nghiệp vụ và không có view.

- Mọi thay đổi tiền hoặc kho đều do backend **gọi tường minh** một stored procedure.
- Nhật ký thao tác do middleware Node `auditTrail` ghi, không phải trigger.
- Realtime do Node phát (`publish`) sau commit, không phải database.

### 9.2. Các đối tượng trong database

**Stored procedure backend gọi trực tiếp (31):**

| Nhóm | Stored procedure | Repo gọi |
|---|---|---|
| Đơn hàng | `sp_SubmitOrder`, `sp_CompleteOrder`, `sp_CancelOrder` | `ordersRepo` |
| Sửa / xóa món, hủy bàn | `sp_VoidOrderItem`, `sp_CancelOrders` | `voidRepo` |
| Phiên / bàn | `sp_RequestPayment`, `sp_SettleSession`, `sp_MergeSessions`, `sp_MoveSession`, `sp_CloseEmptySession` | `sessionsRepo` |
| Chia bill | `sp_SettleSplit` | `splitsRepo` |
| Ca | `sp_CloseShift` | `shiftsRepo` |
| Hoàn tiền | `sp_RefundPayment` | `refundsRepo` |
| Sổ quỹ | `sp_CreateCashTxn`, `sp_ReviewCashTxn`, `sp_VoidCashTxn` | `cashRepo` |
| Kho | `sp_ReceiveStock`, `sp_ReviseStockReceipt`, `sp_PostStocktake`, `sp_VoidStocktake` | `stockRepo` |
| Kho nâng cao | `sp_PostPrepBatch`, `sp_LogWaste`, `sp_SetTrackLots` | `inventoryRepo` |
| Kho tay | `sp_AdjustInventory`, `sp_DeleteIngredient` | `ingredientsRepo` |
| Xóa ở trang quản lý | `sp_DeleteMenuItem`, `sp_DeleteCategory`, `sp_DeleteTable`, `sp_DeleteUser` | `menuRepo`, `tablesRepo`, `usersRepo` |
| Chấm công | `sp_ClockIn` | `attendanceRepo` |
| Tích điểm | `sp_AdjustPoints` | `loyaltyRepo` |

**Stored procedure con, chỉ SP khác gọi (7):**

| SP con | Được gọi bởi | Việc làm |
|---|---|---|
| `sp_LotConsume` | `sp_CompleteOrder`, `sp_AdjustInventory`, `sp_LogWaste`, `sp_PostPrepBatch`, `sp_PostStocktake`, `sp_VoidStocktake` | Trừ kho theo lô, lô hết hạn sớm trước |
| `sp_ApplyMemberPayment` | `sp_SettleSession`, `sp_SettleSplit`, `sp_SubmitOrder` | Cộng tổng chi tiêu và số lần ghé của hội viên |
| `sp_ApplyLoyalty` | `sp_SettleSession`, `sp_SettleSplit`, `sp_SubmitOrder` | Tích điểm, tem, dùng voucher, thưởng giới thiệu |
| `sp_ReverseLoyalty` | `sp_RefundPayment` | Hoàn lại điểm, tem, voucher khi hoàn tiền |
| `sp_VoidLineCore` | `sp_VoidOrderItem`, `sp_CancelOrders` | Bỏ một phần hoặc cả dòng món. Món chưa pha xong thì trả phần kho đang giữ; đã pha xong thì nhập lại kho hoặc ghi hủy hàng. Giảm giá vốn dòng. |
| `sp_RecalcOrder` | `sp_VoidOrderItem` | Tính lại tổng đơn và khuyến mãi theo các dòng còn lại; hết dòng thì đơn thành `CANCELLED` |
| `sp_CloseIfSettled` | `sp_VoidOrderItem`, `sp_CancelOrders` | Bàn đã thu một phần (chia bill): bỏ nốt dòng chưa thu thì đóng phiên như lượt thu cuối |

Các SP con chạy trong transaction của SP cha: lỗi ở SP con thì rollback cả thao tác.

**Đối tượng khác:**

| Loại | Tên | Ghi chú |
|---|---|---|
| Hàm trả bảng | `tvf_ExpiredLotQty()` | Lượng còn trong các lô đã hết hạn. Lượng bán được = `StockQty − ReservedQty − ExpiredQty`. Dùng trong `sp_SubmitOrder`, `sp_PostPrepBatch`. |
| Kiểu bảng (TVP) | `OrderLineInput`, `OrderLineOptionInput`, `StockLineInput`, `OrderItemInput` (kiểu cũ) | Truyền nhiều dòng vào SP trong một lần gọi |
| Trigger | `TR_AuditLogs_ReadOnly` (migration `0027`) | `INSTEAD OF UPDATE` trên `AuditLogs`, `THROW 50160`: nhật ký không sửa được |
| Bảng nhật ký kho | `InventoryTransactions` | Mọi biến động kho đều có một dòng: `IMPORT`, `DEDUCT`, `ADJUST`, `PREP_IN`, `PREP_OUT`… |

### 9.3. Khuôn chung của một stored procedure ghi dữ liệu

```sql
CREATE OR ALTER PROCEDURE dbo.sp_CompleteOrder @OrderId INT, @UserId INT AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;          -- lỗi giữa chừng → rollback toàn bộ
  BEGIN TRAN;
  UPDATE dbo.Orders SET Status = 'COMPLETED', …
   WHERE OrderId = @OrderId AND Status = 'PREPARING';   -- đổi trạng thái có điều kiện
  IF @@ROWCOUNT = 0                                      -- máy khác đã làm trước
  BEGIN ROLLBACK; … THROW 50001, 'ALREADY_PROCESSED', 1; END
  UPDATE ing SET StockQty = …, ReservedQty = …
  FROM dbo.Ingredients ing WITH (UPDLOCK, HOLDLOCK) …    -- khóa dòng kho
  INSERT dbo.InventoryTransactions …                     -- ghi nhật ký kho
  COMMIT;
END
```

1. `SET XACT_ABORT ON` và `BEGIN TRAN`: lỗi giữa chừng thì rollback toàn bộ.
2. Khóa dòng theo thứ tự cố định (`Sessions` → `Shifts` → `Promotions` → `Ingredients`) bằng `UPDLOCK, HOLDLOCK`, để các thao tác đồng thời xếp hàng thay vì đè nhau, và giảm deadlock.
3. `UPDATE` có điều kiện rồi kiểm `@@ROWCOUNT`, để chỉ một máy thắng.
4. Ghi nhật ký (`InventoryTransactions`, `OrderItemVoids`…) trong cùng transaction.
5. Vi phạm quy tắc thì `THROW 500xx`. Node đổi mã này thành HTTP qua `fromSqlError` (xem mục 3).

### 9.4. Cách đưa thay đổi lên database

Lệnh `npm run db:migrate` (`kịch-bản/db-migrate.js`):

- `cơ-sở-dữ-liệu/chuyển-đổi/NNNN_*.sql`: mỗi file chạy **đúng một lần**, ghi tên vào bảng `dbo.SchemaMigrations`. Không sửa file đã chạy; muốn đổi thì thêm migration mới.
- `cơ-sở-dữ-liệu/thủ-tục/*.sql`: dạng `CREATE OR ALTER`, **chạy lại mỗi lần** migrate, nên sửa stored procedure chỉ cần sửa file rồi migrate.

---

## 10. Sự kiện realtime

Danh sách đầy đủ và payload ở `tài-liệu/kiến-trúc/realtime-events.md`. Các sự kiện chính:

| Sự kiện | Service phát | Màn hình phản ứng |
|---|---|---|
| `order.created`, `order.status_changed`, `order.cancelled` | `orderService` (`publishOrderEvent`: room `staff` + phiên của đơn) | Quầy cập nhật thẻ đơn; điện thoại khách cập nhật trạng thái |
| `session.opened`, `session.note_changed` | `sessionService.openTable`, `setNote` | Quầy |
| `session.payment_requested`, `session.payment_cancelled` | `sessionService.requestPayment`; `orderService` (gọi thêm món sau khi đã gọi thanh toán) | Quầy báo bàn chờ thu |
| `session.settled` | `sessionService.settle` | Quầy; điện thoại khách hiện "đã thanh toán" |
| `session.closed` | `sessionService.closeEmpty`, `voidService` | Quầy; điện thoại khách |
| `session.table_changed` | `sessionService.moveSession` | Quầy tải lại; điện thoại khách nhận QR bàn mới |
| `session.split_changed` | `splitService` | Quầy |
| `session.member_changed` | `memberService` | Quầy |
| `session.staff_called`, `session.staff_call_handled` | `staffCallService` | Quầy |
| `menu.availability_changed` | `menuService.refreshAvailability` (room `public` + `staff`) | Menu khách ẩn hoặc hiện món hết / còn |
| `menu.updated` | `menuService.menuChanged` | Menu khách tải lại |
| `inventory.low` | `orderService.complete` (khi khả dụng ≤ ngưỡng) | Quầy hiện cảnh báo nguyên liệu sắp hết |
| `inventory.received`, `inventory.prepared`, `inventory.runout` | `stockService` (nhập hàng), `inventoryService` (sơ chế), `forecastService` (sắp hết trước ngày giao) | Quầy |
| `inventory.expiring`, `inventory.expired` | job `lot-expiry` (`jobs/index.js`) | Quầy hiện cảnh báo lô hết hạn |
| `shift.opened`, `shift.closed`, `store.status_changed` | `shiftService`, `settingsService` | Quầy, menu khách (quán mở / đóng nhận đơn) |
| `payment.refunded` | `refundService` | Quầy |
| `cash.created`, `cash.reviewed` | `cashService` | Quầy, quản lý |
| `member.vouchers_issued` | `loyaltyService` | Quầy |
| `review.low`, `review.handled` | `reviewService` | Quầy hiện dải cảnh báo đánh giá thấp |

Cách một thay đổi lan ra màn hình:

1. Stored procedure commit trong SQL Server.
2. Service gọi `publish(rooms, event, payload)`.
3. Socket.io gửi tới các máy trong room.
4. Trang nhận `socket.on(event, handler)`, rồi thường gọi lại REST để lấy dữ liệu mới nhất.

---

## 11. Bộ nhớ đệm trong tiến trình

Vì chỉ chạy một tiến trình, một số dữ liệu được giữ trong RAM cho nhanh:

| Bộ đệm | Ở đâu | Làm mới khi |
|---|---|---|
| Trạng thái "đặt được" của từng món (`lastStates`) | `menuService` | `refreshAvailability()` chạy sau mỗi lần gửi, hoàn tất hoặc hủy đơn, so sánh với lần trước, chỉ phát những món đổi trạng thái |
| Khóa chống bấm trùng (`Idempotency-Key`, 60 giây) | `orderService.idempotent` | Hết hạn sau 60 giây, hoặc khi lần gửi lỗi |
| Khuyến mãi | `pricingService` | `invalidatePromotions()` sau đơn có dùng khuyến mãi hoặc khi quản lý sửa khuyến mãi |
| Cài đặt quán | `settingsService` | Cache ngắn, xóa khi lưu cài đặt |
| Hàng chờ pha chế (thời gian chờ) | `etaService` | Cache 10 giây; `invalidateQueue()` khi đơn đổi trạng thái |

---

## 12. Job nền

`jobs/scheduler.js` là bộ lập lịch duy nhất:

- `setInterval` 30 giây một lần, giờ theo giờ quán (UTC+7).
- Trước khi chạy, khóa trong `Settings` (`job.<tên>.running`, hết hạn 30 phút) để không chạy trùng.
- Ghi kết quả vào bảng `JobRuns`: `RUNNING`, rồi `OK` / `FAILED`, hoặc `SKIPPED`.
- Hàm chính: `registerJob(name, { label, everyMinutes | at }, run)`, `startScheduler()`, `runJob()` (nút "Tính lại" và test gọi).

Các job đăng ký trong `jobs/index.js`:

| Job | Lịch | Hàm |
|---|---|---|
| `refresh-caches`: làm mới gợi ý và thời gian chờ | mỗi 15 phút | `invalidateSuggestions()`, `etaService.invalidateItems()` |
| `prep-stats`: thống kê thời gian pha | 02:00 | `etaService.recomputeStats` |
| `demand-forecast`: dự báo nhập hàng 14 ngày | 02:00 | `forecastService.computeForecasts` |
| `lot-expiry`: cảnh báo lô hết hạn | 06:00 | `inventoryService` → `inventory.expiring` / `inventory.expired` |
| `runout-alert`: cảnh báo sắp hết trước ngày giao | 06:05 | `forecastService.runOutAlert` |
| `attendance-autoclose`: đóng chấm công quên đăng xuất | mỗi 15 phút | `attendanceService.autoClose` |
| `audit-retention`: xóa nhật ký thao tác quá 12 tháng | 03:00 | `auditRepo.purgeOlderThan(12)` |
| `campaigns-due`: chạy chiến dịch đã hẹn giờ | mỗi 5 phút | `campaignService.runDue` |
| `daily-summary`: tổng hợp ngày cho dashboard | 00:30 | `dashboardService.computeYesterday` |

---

## 13. Bảng tra file

Gốc backend: `ứng-dụng/máy-chủ/src/`.

### 13.1. Lõi

| File | Vai trò |
|---|---|
| `server.js` | Điểm vào: tạo HTTP server, Socket.io, kết nối DB, bật job, tắt êm |
| `app.js` | `createApp()`: middleware, gắn router, trang tĩnh, xử lý lỗi |
| `config.js` | Đọc biến môi trường |
| `db.js` | Pool mssql, `query`, `inTransaction`, `withDeadlockRetry` |
| `errors.js` | `AppError`, bảng mã lỗi SP → HTTP, `fromSqlError` |
| `realtime/io.js` | Socket.io: xác thực, xếp room |
| `realtime/publisher.js` | `publish`, `publishOrderEvent`, `ROOMS` |
| `middleware/auth.js` | JWT: `signToken`, `userFromToken`, `requireStaff`, `requireAdmin`, `optionalStaff` |
| `auth/permissions.js` | Ma trận quyền STAFF / MANAGER / ADMIN, `requirePermission`, `can` |
| `middleware/client.js` | Cookie khách `cf_client` |
| `middleware/validate.js` | zod: `parse`, `zId`, `zGuid`, `zMoney`, `zOrderItems`, `parseRange`… |
| `middleware/audit.js` | Nhật ký thao tác (`auditTrail`, `matchRule`, `sanitize`) |
| `middleware/rateLimit.js` | Giới hạn tần suất đăng nhập, gửi đơn, tra hội viên |
| `middleware/errorHandler.js` | `errorHandler`, `notFoundApi` |
| `pricing/pricing.js` | Bộ tính giá thuần (không chạm DB): khuyến mãi, combo, tùy chọn, `toSpLines` |
| `domain/*.js` | Logic thuần: tồn kho, thời gian chờ, lịch thực đơn, phân tích |
| `jobs/scheduler.js`, `jobs/index.js` | Bộ lập lịch và danh sách job |
| `channels/zaloOa.js` | Gửi tin Zalo OA cho chiến dịch (nếu có token) |
| `utils/time.js`, `utils/csv.js`, `utils/tokens.js` | Giờ quán (UTC+7), xuất CSV, sinh mã QR bàn |

### 13.2. Service

Mỗi service thường có repository cùng tên trong `repositories/`.

| Service | Phụ trách |
|---|---|
| `orderService` | Gửi đơn (khách, nhân viên, mang đi), tiếp nhận, hoàn tất, hủy, hóa đơn |
| `sessionService` | Phiên trên bàn: quét QR, mở / vào phiên, gọi thanh toán, thu tiền, thu chung, chuyển bàn, đóng bàn |
| `billingService` | Tính tiền cấp thanh toán (hội viên, voucher, giảm tay, làm tròn), dùng chung cho thu bàn và mang đi |
| `pricingService` | Nạp dữ liệu cho bộ tính giá, báo giá giỏ |
| `splitService` | Chia bill, tách hóa đơn theo món |
| `voidService` | Sửa / xóa món đã gọi, xóa đơn, hủy bàn |
| `shiftService` | Mở / đóng ca, chặn thao tác khi chưa mở ca |
| `refundService` | Hoàn tiền |
| `cashService` | Sổ quỹ thu chi ngoài bán hàng |
| `menuService` | Menu khách, theo dõi món đặt được |
| `scheduleService` | Lịch thực đơn theo mùa / khung giờ |
| `modifierService` | Tùy chọn món (size, đường, đá, topping) |
| `marketingService` | Combo, khuyến mãi, gợi ý |
| `memberService` | Hội viên: tra cứu, đăng ký, gắn vào phiên |
| `loyaltyService` | Điểm, tem, quà, voucher, giới thiệu bạn |
| `campaignService` | Phân khúc khách và chiến dịch |
| `recallService` | "Lần trước bạn gọi…", món yêu thích |
| `reviewService` | Đánh giá sau khi dùng món |
| `staffCallService` | Khách gọi nhân viên |
| `etaService` | Thời gian chờ ước tính |
| `stockService` | Nhập kho, kiểm kê, báo cáo giá vốn |
| `inventoryService` | Kho nâng cao: đơn vị, sơ chế, hủy hàng, lô |
| `purchasingService` | Nhà cung cấp, đơn đặt hàng |
| `forecastService` | Dự báo nhập hàng |
| `adminService` | Quản trị danh mục, món, BOM, bàn + QR, nguyên liệu, báo cáo doanh thu |
| `userService` | Đăng nhập, tài khoản nhân viên |
| `attendanceService` | Chấm công, lịch làm |
| `settingsService` | Cài đặt quán, tên / địa chỉ quán |
| `dashboardService` | Dashboard chủ quán |
| `analyticsService` | Menu engineering, giờ cao điểm, dự báo doanh thu |
| `pnlService` | Lãi / lỗ ước tính |
| `apiDocsService` | Trang Tra cứu API |

### 13.3. Front-end liên quan đến kết nối

Gốc: `ứng-dụng/giao-diện/public/`.

| File | Vai trò |
|---|---|
| `js/api.js` | `api`, `staffApi`, `staffUpload`, `staffBlobUrl` |
| `js/socket.js` | `connectRealtime` |
| `js/auth-store.js` | Lưu token đăng nhập |
| `js/pages/*.js` | Mỗi trang một file, ví dụ `pos-dashboard.js` (màn quầy), `t-entry.js` (khách quét QR) |

---

## 14. Tài liệu liên quan

Có sẵn trong repo:

| Tài liệu | Nội dung |
|---|---|
| `tài-liệu/kiến-trúc/system-overview.md` | Tổng quan hệ thống |
| `tài-liệu/kiến-trúc/module-map.md` | Bản đồ module |
| `tài-liệu/kiến-trúc/data-model.md` | Mô hình dữ liệu, bảng mã lỗi SP |
| `tài-liệu/kiến-trúc/api-contract.md` | Hợp đồng API: request, response, mã lỗi |
| `tài-liệu/kiến-trúc/realtime-events.md` | Danh sách sự kiện realtime và payload |
| `tài-liệu/kiến-trúc/security-model.md` | Mô hình bảo mật |
| `tài-liệu/nghiệp-vụ/business-rules.md` | Quy tắc nghiệp vụ (BR-xxx) |
| Trang `/admin/api-docs` trong app | Danh sách endpoint đọc trực tiếp từ mã đang chạy |
