# Mô hình bảo mật (Security Model) — bước 10

> **Nguồn:** sổ tay quy trình 15 bước (Playbook v1.0) bước 10; code thực tế `ứng-dụng/máy-chủ/src/` (`app.js`, `config.js`, `middleware/*`, `auth/permissions.js`, `realtime/io.js`, `services/userService.js`, `services/cashService.js`), `cơ-sở-dữ-liệu/` và test trong `ứng-dụng/máy-chủ/tests/`, đối chiếu ngày 20/10/2026. Header HTTP đo bằng cách chạy `createApp()` trong tiến trình và gửi `GET /` (20/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — chờ chủ dự án duyệt ở Gate G2.

Tài liệu mô tả **cơ chế đang có trong code** và đánh giá thật thà theo OWASP ASVS 4.0. Ma trận quyền chính thức là [roles-permissions.md](../nghiệp-vụ/roles-permissions.md). Phân quyền theo module: [module-map.md](module-map.md). Chỉ tiêu bảo mật đo được: [nfr.md](../sản-phẩm/nfr.md) (nhóm Security, Privacy).

## 1. Phạm vi, tài sản, giả định

| Mục | Nội dung |
| --- | --- |
| Hệ thống | Một tiến trình Node.js (Express 5 + Socket.io) + một SQL Server; một quán, một kho; chạy trong LAN quán qua HTTP; hosting online chờ Q-008 |
| Tài sản cần bảo vệ | Tiền (`Payments`, `Refunds`, `CashTransactions`, `Shifts`); tồn kho và giá vốn; dữ liệu hội viên (SĐT, họ tên, ngày sinh, điểm, voucher); tài khoản và mật khẩu nhân viên; nhật ký thao tác; ảnh hóa đơn sổ quỹ |
| Tác nhân đe dọa | Khách tò mò / phá trong Wi-Fi quán (có cookie, biết `sessionId` của mình); nhân viên muốn vượt quyền (giảm giá, hoàn tiền, xóa món); người lạ trong cùng mạng; máy quầy bị bỏ quên khi đang đăng nhập |
| Ngoài phạm vi | Thanh toán online (D-1 — chỉ tiền mặt, không webhook vào); chuỗi nhiều chi nhánh; bảo mật hạ tầng máy chủ, TLS, sao lưu, xoay vòng secret (bước 15 / Gate G5) |

## 2. Xác thực (Authentication)

### 2.1. Nhân viên — JWT Bearer

| Khía cạnh | Cách làm trong code | Nguồn |
| --- | --- | --- |
| Đăng nhập | `POST /api/auth/login` `{ username ≤ 50, password ≤ 100 }` (zod). Tìm user theo username (không phân biệt hoa thường, `DeletedAt IS NULL`), so mật khẩu bằng `bcrypt.compare`. Username không tồn tại vẫn so với `DUMMY_HASH` để thời gian phản hồi như nhau. Thông báo chung "Sai tên đăng nhập hoặc mật khẩu" (401) | `routes/public.js`, `services/userService.js` |
| Băm mật khẩu | `bcryptjs`, `BCRYPT_COST = 10`; tạo / đặt lại mật khẩu đều băm | `userService.js` |
| Chính sách mật khẩu | Tối thiểu 6, tối đa 100 ký tự; không kiểm mật khẩu phổ biến / đã lộ | `routes/admin.js` (`password()`) |
| Giới hạn thử | 5 lần **sai** / phút / IP (`skipSuccessfulRequests`), trả 429 `RATE_LIMITED` | `middleware/rateLimit.js` (`loginLimiter`) |
| Cấp token | `jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })` — mặc định `8h`, thuật toán mặc định HS256; không có refresh token | `middleware/auth.js` (`signToken`), `config.js` |
| Lưu token phía trình duyệt | `localStorage` (`js/auth-store.js`), gửi qua header `Authorization: Bearer` | `js/api.js` |
| Kiểm mỗi request | `userFromToken`: kiểm chữ ký + hạn → đọc lại user trong DB (`findById`, bỏ tài khoản đã xóa) → `isActive`. Vai trò lấy **từ DB**, không tin `role` trong token. Kết quả: khóa tài khoản → 403 `ACCOUNT_LOCKED`; xóa → 401; đổi vai trò có hiệu lực ngay ở request kế tiếp | `middleware/auth.js`; test `api.test.js` "khóa → token cũ 403", `delete.test.js` "token cũ 401" |
| Tài khoản bị khóa đăng nhập | Mật khẩu đúng nhưng tài khoản khóa → 403 `ACCOUNT_LOCKED` (chỉ báo sau khi mật khẩu đúng) | `userService.login` |
| Đăng xuất | `POST /api/auth/logout`: chấm công ra (F-035); trình duyệt xóa token. **Server không thu hồi token** — token còn dùng được tới khi hết hạn | `routes/finance.js`, `js/auth.js` |
| Đặt lại mật khẩu | Quản lý đặt lại; **token cũ của tài khoản đó vẫn hợp lệ** tới khi hết hạn | `userService.resetPassword` |
| Tài khoản quản lý đầu tiên | Seed bằng `ADMIN_SEED_USERNAME` / `ADMIN_SEED_PASSWORD` trong `.env` | `.env.example`, `kịch-bản/db-seed.js` |
| Đa yếu tố (MFA) | Không có | — (chưa có yêu cầu) |

### 2.2. Khách — cookie `cf_client` và tư cách thành viên phiên

- `ensureClientToken` chạy ở mọi request `/api/*`: cookie `cf_client` thiếu hoặc sai dạng thì tạo 16 byte ngẫu nhiên (32 ký tự hex) và đặt cookie `HttpOnly; SameSite=Lax; Path=/; Max-Age=1 năm`, thêm `Secure` khi request là HTTPS (`req.secure`). Đã xác nhận header `Set-Cookie` khi chạy thử 20/10/2026.
- Quét QR: `Tables.QrToken` là 32 hex ngẫu nhiên (`utils/tokens.js`), không phải số bàn đếm được. "Tạo lại QR" làm QR cũ trả 404 (`api.test.js`).
- Tư cách thành viên phiên: bảng `SessionClients (SessionId, ClientToken)` ghi khi quét / gộp / tạo phiên. `sessionsRepo.isMember(sessionId, clientToken)` là điều kiện cho mọi thao tác của khách trên phiên. `sessionId` là GUID, client lưu trong `localStorage` theo từng mã QR.
- Hội viên nhận diện bằng SĐT, **không OTP** (D-6, chấp nhận rủi ro có chủ đích): người biết SĐT có thể gắn hội viên vào phiên của mình. Giảm thiểu: tên che, giới hạn tra cứu, Thẻ thành viên không có mã voucher, voucher chỉ dùng được khi nhân viên thu tiền.

## 3. Phân quyền (Authorization)

### 3.1. Vai trò và bảng quyền

Thứ bậc `STAFF < MANAGER (Trưởng ca) < ADMIN` (`ROLES` trong `auth/permissions.js`; DB có `CK_Users_Role`). Bảng `PERMISSIONS` thật trong code:

| Quyền | STAFF | MANAGER | ADMIN | Endpoint dùng |
| --- | --- | --- | --- | --- |
| `pos.use` | ✔ | ✔ | ✔ | Toàn bộ `staff.js` (`requireStaff` — tương đương) |
| `shift.manage` | ✔ | ✔ | ✔ | Mở / đóng ca (Q-022) |
| `cash.create` | ✔ | ✔ | ✔ | `GET/POST /api/cash-transactions`, `PUT …/receipt` |
| `cash.approve` | ✘ | ✔ (≤ ngưỡng) | ✔ | Kiểm trong `cashService` (người gắn ảnh không phải người tạo) và qua `resolveApproval` khi duyệt |
| `attendance.edit` | ✘ | ✔ (hôm nay) | ✔ | `/api/attendance*` |
| `prep.post`, `waste.create`, `po.receive` | ✔ | ✔ | ✔ | `ops.js` (`requireStaff`) |
| `inventory.adjust`, `stocktake.post` | ✘ | ✔ | ✔ | `/api/ops/ingredients/{id}/adjust`, `/api/ops/stocktakes*` |
| `dashboard.view` | ✘ | ✔ (rút gọn) | ✔ | `/api/dashboard/*` |
| `admin.all` | ✘ | ✘ | ✔ | Toàn bộ `/api/admin/*` (`adminRouter.use(requireAdmin)`) |

### 3.2. Nơi kiểm quyền

| Tầng | Cơ chế | Ví dụ |
| --- | --- | --- |
| Router | `adminRouter.use(requireAdmin)`; `staffRouter.use(requireStaff)`; `requirePermission('…')` từng route; `optionalStaff` cho endpoint cả khách và quầy cùng gọi | `routes/admin.js`, `staff.js`, `finance.js`, `ops.js`, `analytics.js`, `engagement.js` |
| Service — tài nguyên | Khách phải thuộc phiên (`assertViewer` → `isMember`); hội viên chỉ của phiên còn mở của thiết bị | `sessionService`, `orderService`, `splitService`, `memberService`, `recallService` |
| Service — ngưỡng theo vai | `discountLimits(role, settings)`; trưởng ca duyệt chi ≤ `manager.cash_out_approve_max`; hoàn tiền ca đang mở; sửa chấm công trong ngày (`ATTENDANCE_NOT_TODAY`); dashboard bỏ giá vốn / lãi cho trưởng ca | `billingService`, `cashService`, `refundService`, `attendanceService`, `dashboardService` |
| SP | Kiểm lại trạng thái **sau khi khóa dòng**, ví dụ `sp_VoidOrderItem` trả 50183 nếu đơn vừa được tiếp nhận mà chưa có người duyệt | `cơ-sở-dữ-liệu/thủ-tục/sp_VoidOrderItem.sql` |
| Giao diện | `requireStaffPage`, `mountAdminShell` chuyển trang; ẩn nút. **Chỉ là trải nghiệm** | `js/auth.js`, `js/admin-shell.js` |

Mã lỗi: chưa đăng nhập / token sai → 401 `UNAUTHORIZED`; tài khoản khóa → 403 `ACCOUNT_LOCKED`; không đủ quyền → 403 `FORBIDDEN` (hoặc mã riêng như `SELF_APPROVAL`, `ATTENDANCE_NOT_TODAY`).

### 3.3. Duyệt bởi người có thẩm quyền (`resolveApproval`)

Áp cho giảm giá tay vượt ngưỡng (D-14, D-24), hoàn tiền (D-15), duyệt / từ chối chi quỹ (D-23), sửa / xóa món đã tiếp nhận / đã pha và hủy bàn (D-33):

1. Người thao tác là ADMIN, hoặc là MANAGER khi thao tác cho phép trưởng ca → tự duyệt.
2. Nếu không: request phải kèm `adminUsername` + `adminPassword`. Server kiểm bằng bcrypt, người duyệt phải đang hoạt động và có vai trò đủ (ADMIN, hoặc MANAGER khi `allowManager`). **Không** dùng token của người đang đứng quầy.
3. Thiếu → 403 `ADMIN_APPROVAL_REQUIRED`; sai → 403 `ADMIN_APPROVAL_INVALID`. Người duyệt được ghi vào `Payments.ApprovedBy`, `Refunds.ApprovedBy`, `CashTransactions.ApprovedBy`, `OrderItemVoids.ApprovedBy`; nhật ký thao tác bỏ trường mật khẩu.
4. Không tự duyệt khoản chi do chính mình tạo (`403 SELF_APPROVAL`), trừ ADMIN.

Bằng chứng: `members.test.js` (giảm tay vượt ngưỡng), `finance.test.js` (trưởng ca duyệt 15 % / không duyệt 25 %, sổ quỹ), `operations.test.js` (hoàn tiền), `void.test.js` (AC-046-02, đua với tiếp nhận đơn).

### 3.4. Bằng chứng phân quyền tự động

- `finance.test.js` — "ma trận actor × endpoint sinh từ PERMISSIONS": mỗi quyền có một request đại diện (`PROBES`), test **fail nếu thêm quyền mà chưa có probe**; vai được phép không nhận 401 / 403, vai khác nhận đúng 403. Thêm "khách (không token) không gọi được endpoint quầy / trưởng ca / quản lý → 401".
- `api.test.js` — "ma trận quyền: khách → API quầy / admin 401; STAFF → admin 403".
- `delete.test.js` — "STAFF không xóa được; khách không có token → 401".

## 4. Sở hữu tài nguyên và dữ liệu chỉ dành cho nhân viên

| Dữ liệu | Khách (`ACT-GUEST` / `ACT-MEMBER`) | Nhân viên | Cơ chế |
| --- | --- | --- | --- |
| Phiên, đơn, tổng tiền, chia bill, ETA | Chỉ phiên mà thiết bị thuộc `SessionClients` (khác → 403) | Mọi phiên | `assertViewer`, `isMember` |
| Ghi chú bàn, người mở bàn | **Không thấy** | Thấy | `customerView` trong `sessionService`; sự kiện `session.note_changed` chỉ vào room `staff` |
| Tên / SĐT hội viên | Tên che "Nguyễn V. A.", SĐT che "09xx***543" | Tên đầy đủ, SĐT | `maskName`, `maskPhone`, `publicMember({ staff })` |
| Mã voucher | Không thấy (chỉ số lượng / giá trị / hạn) | Thấy | `member.vouchers_issued` gửi room phiên **không có mã**; Thẻ thành viên không có mã |
| Gọi lại đơn, món yêu thích | Chỉ hội viên đang gắn với phiên **còn mở** của chính thiết bị | Mọi hội viên | `recallService` (403 nếu khác) |
| Thẻ thành viên | Thiết bị thuộc phiên còn mở có hội viên (403 / 404 `NO_MEMBER` / 409) | Có | `sessionService.memberCard` |
| Giá vốn, lãi gộp | — | Trưởng ca: **server bỏ** khỏi dashboard; ADMIN: có | `dashboardService` |
| Danh sách hội viên (quản lý) | — | ADMIN thấy SĐT che, tìm được bằng SĐT đầy đủ | `memberService` (`adminView`) |

## 5. Kiểm dữ liệu vào

- Mọi route parse body / query / param bằng **zod** (`middleware/validate.js` → `parse`), lỗi trả 400 `VALIDATION_ERROR` kèm `details.fields`. Bộ dựng sẵn: `zId` (số nguyên dương), `zGuid`, `zQrToken` (32 hex), `zMoney` (0…1.000.000.000), `zText(max)` (cắt khoảng trắng, giới hạn độ dài), `zDate` (ngày có thật), `zOrderItems` (1–30 dòng, SL 1–50, ghi chú ≤ 200, ≤ 20 tùy chọn), `zManualDiscount` (% ≤ 100).
- Body JSON giới hạn `100kb` (`app.js`); JSON hỏng → 400; quá lớn → 413 `PAYLOAD_TOO_LARGE`.
- Số tiền **không bao giờ lấy từ client**: server nạp giá từ DB và tính bằng `pricing/pricing.js`; SP thu tiền nhận `@OrdersTotal` và trả 50034 `AMOUNT_CHANGED` nếu lệch.
- Xuất CSV (sổ quỹ, chiến dịch): ô bắt đầu bằng `=`, `+`, `-`, `@` được thêm `'` để chặn công thức Excel (`utils/csv.js`; `finance-unit.test.js`).
- Đầu ra giao diện: dữ liệu người dùng chèn qua `textContent` (`el`, `clear` trong `js/ui.js`); 0 lần dùng `innerHTML` (quét 20/10/2026).

## 6. Chống SQL injection

- Mọi truy vấn qua `mssql` có tham số kiểu rõ ràng (`query(text, { name: [sql.Type, value] })`), SP nhận tham số và TVP (`OrderLineInput`, `StockLineInput`…).
- Rà soát `repositories/*.js` ngày 20/10/2026: các đoạn `${…}` trong chuỗi SQL chỉ chèn **hằng** hoặc **danh sách trắng** — tên bảng / khóa chính trong `auditRepo` lấy từ bảng cố định `SNAP`; luật phân khúc trong `campaignRepo` được dịch thành tham số (`OPENJSON(@tiers)`, `@lvGte`…). Không thấy chỗ nối input người dùng.
- Login ứng dụng trên DB được cấp **`db_owner`** (`cơ-sở-dữ-liệu/cài-đặt/local-sql-setup.sql`) — xem Gap G-07.

## 7. Giới hạn tần suất (rate limiting)

| Đối tượng | Giới hạn | Khóa | Nguồn |
| --- | --- | --- | --- |
| `POST /api/auth/login` | 5 lần sai / phút | IP | `loginLimiter` |
| `POST /api/orders` (khách) | 10 / phút | `cf_client` | `orderLimiter` |
| `POST /api/members/lookup`, `POST /api/members`, `POST /api/sessions/{id}/member` (khách) | 10 / phút / IP **và** 20 / phút / thiết bị; nhân viên đăng nhập không bị giới hạn | IP, `cf_client` | `memberLimiters` (D-6) |
| `POST /api/sessions/{id}/call-staff` | 1 lần / 60 giây / phiên (429 `TOO_SOON`) | Phiên (kiểm trong DB) | `staffCallService` |
| Gửi đơn lặp | Cùng `Idempotency-Key` trong 60 giây → trả lại cùng đơn | `cf_client` + key | `orderService` |

Bộ đếm `express-rate-limit` và cache `Idempotency-Key` nằm **trong bộ nhớ tiến trình** (mất khi khởi động lại, không chia sẻ nếu chạy nhiều tiến trình). `RATE_LIMIT=off` chỉ dùng khi test. Sau reverse proxy phải đặt `TRUST_PROXY=true`, nếu không mọi request có cùng IP của proxy. Ô duyệt `adminUsername` / `adminPassword` **không** bị giới hạn số lần (Gap G-03).

## 8. Nhật ký thao tác (audit log)

- Middleware `auditTrail` gắn ở `/api` trước mọi router (`middleware/audit.js`). Ghi: mọi request đổi dữ liệu dưới `/api/admin/*` và các route quầy theo bảng luật (thu tiền, hoàn tiền, hủy / xóa món / hủy bàn, mang đi, ca, sổ quỹ, sơ chế, hủy hàng, hủy lô, nhận PO, điều chỉnh kho, kiểm kê, chấm công, công tắc nhận đơn). Không ghi thao tác đơn thường (gửi, tiếp nhận, hoàn tất) và không ghi đăng nhập.
- Nội dung: người làm (id, tên, vai trò), hành động, thực thể, ảnh **trước** (chụp dòng DB trước khi xử lý), ảnh **sau** (input + kết quả), IP, User-Agent, thời điểm. `sanitize` bỏ mọi khóa chứa `pass`, `hash`, `token`, `secret`, `otp`; SĐT còn 3 số cuối.
- Chỉ ghi khi response hoàn tất với status < 400 (tức sau commit); lỗi ghi nhật ký không làm hỏng thao tác chính.
- `AuditLogs.UserId` không có FK (giữ nhật ký khi tài khoản bị xóa hẳn). Trigger `TR_AuditLogs_ReadOnly` (INSTEAD OF UPDATE) chặn sửa → 50160 `AUDIT_READONLY`. Xóa chỉ do job `audit-retention` (giữ 12 tháng); **DB không chặn DELETE**. Chỉ ADMIN đọc (`GET /api/admin/audit-logs`), không có API sửa / xóa.
- Log ứng dụng: lỗi 500 ghi `console.error` kèm method + URL (tắt khi test); không có log có cấu trúc, không có cảnh báo / giám sát tập trung.

## 9. Secret và cấu hình

| Secret | Nơi lưu | Ghi chú |
| --- | --- | --- |
| `JWT_SECRET` | `.env` | Bắt buộc: `config.js` ném lỗi nếu thiếu, `server.js` kiểm ngay khi khởi động |
| `DB_PASSWORD` (login `cafe_app`) | `.env` | Kết nối mặc định `DB_ENCRYPT=true`, `DB_TRUST_SERVER_CERT=false` (máy dev đặt `true` cho chứng chỉ tự ký) |
| `ADMIN_SEED_PASSWORD` | `.env` | Chỉ dùng khi seed |
| `ZALO_OA_TOKEN` | `.env` | Không có thì kênh Zalo tắt |

- `.gitignore` chặn `.env` và `.env.*` (trừ `.env.example`); `.env.example` không chứa giá trị thật.
- `.github/workflows/ci.yml` có mật khẩu SA và `JWT_SECRET` **chỉ dùng cho CI** (container SQL Server tạm) — không dùng cho môi trường thật.
- Quy tắc dự án: không đưa secret thật vào source, client bundle, docs, log, test fixture (`.agent/rules.md`, DoD). Chưa có công cụ quét secret tự động; quy trình xoay vòng secret thuộc bước 15.

## 10. Tải file lên (ảnh hóa đơn sổ quỹ)

- `PUT /api/cash-transactions/{id}/receipt` (quyền `cash.create`; người gắn ảnh phải là người tạo khoản hoặc có `cash.approve`). Thân request là ảnh thô (`express.raw`, type `image/*` hoặc `application/octet-stream`), giới hạn **2 MB** → 400 `RECEIPT_TOO_LARGE`.
- Server kiểm **chữ ký file** (magic bytes) JPEG / PNG / WebP, không tin `Content-Type` → sai thì 400. Tên file do server sinh `<id>-<ngẫu nhiên>.<đuôi>`, lưu ở `<UPLOADS_DIR>/receipts/` (ngoài thư mục `public`).
- **Không serve tĩnh.** Xem qua `GET /api/cash-transactions/{id}/receipt` (cần đăng nhập), trả `Content-Type` theo đuôi đã kiểm và `Cache-Control: private, no-store`.
- Bằng chứng: `finance.test.js` "ảnh > 2 MB / không phải ảnh / png đúng byte".

## 11. Header HTTP, CORS, cookie, CSRF

Đo ngày 20/10/2026 (chạy `createApp()` trong tiến trình, `GET /`):

| Header | Giá trị |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'; base-uri 'self'; font-src 'self' https: data:; form-action 'self'; frame-ancestors 'self'; img-src 'self' data: blob: https:; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `no-referrer` |
| `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` | `same-origin` / `same-origin` |
| Khác | `Origin-Agent-Cluster: ?1`, `X-DNS-Prefetch-Control: off`, `X-Download-Options: noopen`, `X-Permitted-Cross-Domain-Policies: none`, `X-XSS-Protection: 0`; đã tắt `X-Powered-By` |
| `Strict-Transport-Security` | **Không gửi** (cố ý: quán chạy HTTP trong LAN; `upgrade-insecure-requests` cũng tắt) |

- Cấu hình ở `app.js` bằng `helmet` 8. Chưa có test tự động kiểm header.
- **CORS:** không có middleware CORS và Socket.io không bật `cors`, nên không gửi `Access-Control-Allow-Origin`; trình duyệt chặn trang khác origin đọc API.
- **CSRF:** API nhân viên dùng header Bearer (không dùng cookie) nên không bị CSRF. API khách dựa vào cookie `cf_client` (`SameSite=Lax`) và chỉ nhận body JSON (`express.json`); request khác origin mang JSON cần preflight CORS và bị chặn. Không có token CSRF riêng.
- **Truyền tải:** HTTP thường trong LAN, nên JWT, mật khẩu nhân viên và mật khẩu người duyệt đi dạng rõ trên Wi-Fi. HTTPS dự kiến qua reverse proxy (`TRUST_PROXY=true`, cookie tự thêm `Secure`) — thuộc bước 15.

## 12. Xác thực realtime (Socket.io)

- Handshake (`realtime/io.js`): mọi kết nối vào room `public`; có `auth.token` → `userFromToken` (cùng kiểm như HTTP) → room `staff`; có `auth.sessionId` → phải là GUID **và** cookie `cf_client` trong header handshake thuộc phiên (`isMember`) → room `session:{id}`; sai → lỗi `FORBIDDEN` / `UNAUTHORIZED` / `ACCOUNT_LOCKED`, client không tự kết nối lại.
- Server **không nhận sự kiện nào từ client** (không đăng ký listener ngoài `connection`), nên socket chỉ là kênh nhận; mọi thao tác đi qua REST có kiểm quyền.
- Service chọn room và payload: `session.note_changed` chỉ vào `staff`; `member.vouchers_issued` vào room phiên **không có mã**. Phát **sau commit**.
- Bằng chứng: `api.test.js` (socket phiên khác không nhận sự kiện), `table-order.test.js` (`session.note_changed` không tới khách).
- Hạn chế: quyền chỉ kiểm lúc handshake. Token hết hạn hoặc tài khoản bị khóa sau đó **không** ngắt kết nối đang mở (Gap G-02). Room `staff` là một room chung cho STAFF / MANAGER / ADMIN.

## 13. Bảng mối đe dọa ↔ OWASP ASVS 4.0

Đánh giá: **Đạt** = có biện pháp và có bằng chứng (test hoặc rà soát code); **Một phần** = có biện pháp nhưng còn lỗ hổng / chưa kiểm tự động; **Gap** = chưa có biện pháp.

| # | Mối đe dọa | ASVS | Biện pháp hiện có | Bằng chứng | Đánh giá |
| --- | --- | --- | --- | --- | --- |
| T-01 | Đoán mật khẩu nhân viên (brute force) | V2.2 | 5 lần sai / phút / IP; bcrypt | Code; limiter đăng nhập chưa có test tự động | Một phần |
| T-02 | Mật khẩu yếu | V2.1 | Tối thiểu 6 ký tự | `routes/admin.js` | Gap (ASVS L1 yêu cầu ≥ 12; xem NFR-SEC-15) |
| T-03 | Lộ mật khẩu khi lộ DB | V2.4 | bcrypt cost 10 | `api.test.js` "mật khẩu là hash" | Đạt |
| T-04 | Dò username qua thông báo / thời gian | V2.2 | Thông báo chung; so với `DUMMY_HASH` | Code | Đạt (thông báo "đã bị khóa" chỉ hiện khi mật khẩu đúng) |
| T-05 | Dò mật khẩu trưởng ca / quản lý qua ô duyệt | V2.2 | Chỉ nhân viên đã đăng nhập gọi được; bcrypt | Code | Gap — không giới hạn số lần (G-03) |
| T-06 | Secret nằm trong mã nguồn | V2.10 | `.env` bị gitignore, `required('JWT_SECRET')` | Rà soát tay | Đạt (chưa có công cụ quét) |
| T-07 | Token bị lấy và dùng tiếp sau khi đăng xuất / đặt lại mật khẩu | V3.3 | Hết hạn sau 8 giờ | Code | Gap — không thu hồi phía server (G-01) |
| T-08 | Tài khoản bị khóa / xóa vẫn thao tác | V3.3 | Đọc lại user mỗi request | `api.test.js`, `delete.test.js` | Đạt (HTTP); Một phần (socket đang mở — G-02) |
| T-09 | XSS lấy token trong `localStorage` | V3.4, V5.3 | CSP `script-src 'self'`; chỉ dùng `textContent` | Header đo 20/10; quét `innerHTML` = 0 | Một phần (token vẫn ở `localStorage`) |
| T-10 | Cookie khách bị đọc / gửi chéo site | V3.4 | `HttpOnly`, `SameSite=Lax`, `Secure` khi HTTPS | Header đo 20/10 | Một phần (chạy HTTP nên chưa có `Secure`) |
| T-11 | Khách gọi API quầy / quản lý | V4.1 | `requireStaff`, `requireAdmin`, `requirePermission` | `finance.test.js` (ma trận), `api.test.js` | Đạt |
| T-12 | Nhân viên vượt quyền (giảm lớn, hoàn tiền, duyệt chi, sửa món đã pha, kiểm kê) | V4.1, V4.2 | Bảng quyền + ngưỡng theo vai + `resolveApproval` + SP kiểm lại sau khóa | `finance.test.js`, `members.test.js`, `operations.test.js`, `void.test.js` | Đạt |
| T-13 | Khách đọc / ghi phiên của người khác (IDOR) | V4.2 | `SessionClients` + `isMember`; `sessionId` là GUID | `api.test.js`, `phase4.test.js`, `member-card.test.js` | Đạt |
| T-14 | Tự duyệt khoản chi của mình | V4.2 | `403 SELF_APPROVAL` | `finance.test.js` | Đạt |
| T-15 | CSRF trên API khách | V4.2 | `SameSite=Lax` + chỉ nhận JSON + không mở CORS | Code | Một phần (không có token CSRF) |
| T-16 | Sửa giá / số tiền từ client | V5.1 | Server tính tiền (`pricing.js`); `AMOUNT_CHANGED` | `pricing.test.js`, `sp.test.js` | Đạt |
| T-17 | Dữ liệu vào sai kiểu / quá lớn | V5.1 | zod ở mọi route; JSON ≤ 100 KB | Nhiều test 400 | Đạt |
| T-18 | SQL injection | V5.3 | Truy vấn tham số; đoạn động là hằng / danh sách trắng | Rà soát 20/10 | Đạt |
| T-19 | XSS lưu trữ (tên món, ghi chú, tên hội viên…) | V5.3 | `textContent`; CSP | Quét tĩnh | Đạt (chưa có test tự động) |
| T-20 | Chèn công thức vào CSV | V5.3 | Thêm `'` trước `= + - @` | `finance-unit.test.js` | Đạt |
| T-21 | Không truy vết được thao tác nhạy cảm | V7.1, V7.2 | `auditTrail` theo bảng luật | `finance.test.js`, `finance-unit.test.js` | Một phần (không ghi đăng nhập thành công / thất bại) |
| T-22 | Nhật ký chứa mật khẩu / SĐT đầy đủ | V7.1 | `sanitize` | `finance-unit.test.js`, `void.test.js` | Đạt |
| T-23 | Nhật ký bị sửa / xóa | V7.3 | Trigger chặn UPDATE; không có API sửa | `finance.test.js` | Một phần (DB không chặn DELETE; login ứng dụng là `db_owner` — G-07) |
| T-24 | Không phát hiện sự cố | V7.1 | `console.error` cho lỗi 500 | Code | Gap (không có log tập trung / cảnh báo — bước 15) |
| T-25 | Lộ SĐT / tên hội viên cho khách khác | V8.3 | Che tên / SĐT; không trả mã voucher | `members.test.js`, `member-card.test.js` | Đạt |
| T-26 | Thu thập / giữ dữ liệu cá nhân không có căn cứ | V8.3 | Bắt buộc đồng ý; ẩn danh theo yêu cầu; nhật ký giữ 12 tháng | `members.test.js` | Một phần (chưa có thời hạn lưu cho hội viên / đơn — NFR-PRV-05) |
| T-27 | Dữ liệu nhạy cảm bị cache ở trình duyệt / máy quầy dùng chung | V8.2 | Ảnh hóa đơn `no-store`; trang `no-cache` | Code | Một phần (JSON API không đặt `no-store`; token ở `localStorage`) |
| T-28 | Nghe lén trên Wi-Fi quán | V9.1 (ngoài 7 chương yêu cầu) | — | — | Gap — HTTP thường (G-05) |
| T-29 | File tải lên độc hại / quá lớn | V12.1, V12.2 | ≤ 2 MB; kiểm magic bytes; tên ngẫu nhiên | `finance.test.js` | Đạt |
| T-30 | Truy cập file tải lên trái phép / thực thi | V12.4, V12.5 | Lưu ngoài `public`; không serve tĩnh; xem cần đăng nhập; `no-store` | Code | Đạt |
| T-31 | Nghe sự kiện realtime của phiên khác | V4.2 | Kiểm `isMember` lúc handshake | `api.test.js` | Đạt |
| T-32 | Clickjacking | V14.4 (ngoài 7 chương yêu cầu) | `frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN` | Header đo 20/10 | Đạt |

Tổng hợp 32 mối đe dọa: **Đạt 19**, **Một phần 8**, **Gap 5**. T-08 được tính "Đạt" ở HTTP, phần socket nằm ở G-02.

## 14. Danh sách gap (đề xuất xử lý — chưa sửa trong TASK-057)

| ID | Gap | Mức | Đề xuất | Trạng thái |
| --- | --- | --- | --- | --- |
| G-01 | Đăng xuất / đặt lại mật khẩu không thu hồi JWT (còn dùng được tới 8 giờ) | Trung bình | Thêm `TokenVersion` (hoặc `PasswordChangedAt`) trên `Users`, so khi `userFromToken`; tăng khi đăng xuất / đặt lại mật khẩu — cần migration `0034`, phải hỏi duyệt | PROPOSED |
| G-02 | Socket đang mở không bị ngắt khi token hết hạn / tài khoản bị khóa | Thấp | Kiểm lại định kỳ hoặc ngắt socket của user khi khóa / xóa | PROPOSED |
| G-03 | Ô duyệt (`adminUsername` / `adminPassword`) không giới hạn số lần thử | Trung bình | Áp limiter theo tài khoản người duyệt + IP cho các route có `resolveApproval` | PROPOSED |
| G-04 | Mật khẩu tối thiểu 6 ký tự | Trung bình | Nhóm chọn độ dài (NFR-SEC-15) | NEEDS_CONFIRMATION |
| G-05 | HTTP thường trong LAN: JWT, mật khẩu đi dạng rõ; cookie không `Secure` | Cao khi Wi-Fi khách và máy quầy dùng chung mạng | Reverse proxy HTTPS + `TRUST_PROXY=true`, hoặc tách Wi-Fi khách / quầy — bước 15 | PROPOSED |
| G-06 | Không ghi nhật ký đăng nhập (thành công / thất bại); không có log tập trung, cảnh báo | Thấp | Thêm luật nhật ký cho `POST /api/auth/login`; giám sát ở bước 15 | PROPOSED |
| G-07 | Login ứng dụng trên DB là `db_owner` (có thể tắt trigger, xóa nhật ký) | Trung bình | Tách login chạy migration (`db_owner`) và login chạy ứng dụng (chỉ `EXECUTE` + đọc / ghi bảng cần thiết; `DENY DELETE` trên `AuditLogs` trừ job) | PROPOSED |
| G-08 | Chưa có test tự động cho header bảo mật, limiter đăng nhập / gửi đơn | Thấp | Thêm test (không cần thư viện mới) | PROPOSED |
| G-09 | Token nhân viên lưu trong `localStorage`; JSON API không đặt `Cache-Control: no-store` | Thấp | Giữ CSP chặt; cân nhắc `no-store` cho `/api/*` có dữ liệu cá nhân | PROPOSED |
| G-10 | `npm run db:seed` tạo sẵn tài khoản `staff1` với mật khẩu cố định ghi trong `kịch-bản/db-seed.js` (dữ liệu mẫu cho máy dev) | Trung bình nếu seed lên máy thật | Không chạy seed mẫu ở môi trường thật, hoặc khóa / đổi mật khẩu `staff1` ngay — đưa vào checklist bước 15 | PROPOSED |

Rủi ro chấp nhận có chủ đích (không phải gap): hội viên nhận diện bằng SĐT không OTP (D-6); nhiều nhân viên có thể dùng chung tài khoản trên nhiều máy (roles-permissions §4.3) — hệ thống an toàn trong trường hợp đó nhờ khóa dòng trong SP, nhưng nhật ký không phân biệt được người thật.
