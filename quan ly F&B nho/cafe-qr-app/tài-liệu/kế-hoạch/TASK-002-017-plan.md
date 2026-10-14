# Plan cho TASK-002 … TASK-017 (triển khai toàn bộ MVP)

## Hiện trạng và mục tiêu
- Đã có: DB `0001_init` + 7 SP + seed + 18 integration test SP pass (TASK-003, TASK-004, phần SP của TASK-015).
- Mục tiêu: một tiến trình Node (Express 5 + Socket.io) phục vụ REST `/api/*` và FE tĩnh `ứng-dụng/giao-diện/public`, phủ FEATURE-001…012 theo ADR-000…003.

## Thành phần và consumer bị ảnh hưởng
- BE: `ứng-dụng/máy-chủ/src/{routes,services,repositories,realtime,middleware}`. Consumer: FE 3 khu vực (`/t`, `/pos`, `/admin`) và test.
- Realtime: room `staff` (JWT), `session:{id}` (cookie `cf_client` thuộc phiên), `public`.

## Files thật cần sửa hoặc dự kiến tạo
- `ứng-dụng/máy-chủ/src/app.js`, `server.js`, `errors.js`, `middleware/*`, `routes/*`, `services/*`, `repositories/*`, `realtime/*`.
- `ứng-dụng/giao-diện/public/{t,pos,admin}/*.html`, `js/*.js`, `css/*.css`.
- `ứng-dụng/máy-chủ/tests/*.test.js` (API, quyền, realtime, luồng đầu-cuối).

## Tác động dữ liệu / API / UI / quyền
- Không đổi schema ngoài `0001_init`. Bổ sung contract (ghi vào `api-contract.md`):
  - `POST /api/sessions/{id}/join` nhận `{ qrToken }` để kiểm phiên thuộc đúng bàn;
  - `scan` trả `state: "MEMBER"` khi client đã thuộc một phiên mở của bàn;
  - `settle` nhận thêm `expectedAmountDue` (→ `409 AMOUNT_CHANGED`);
  - menu trả thêm `soldOut` (hết nguyên liệu, ADR-003);
  - mã lỗi mới: 404 `NOT_FOUND`, 409 `HAS_ORDERS`, 409 `BELOW_RESERVED`.
- Quyền: khách chỉ chạm phiên có `SessionClients(sessionId, cf_client)`; STAFF không gọi được `/api/admin/*`; khóa tài khoản có hiệu lực ngay ở request kế tiếp (kiểm DB mỗi request).

## Các bước thực hiện
1. Hạ tầng: config, db, errors (map mã SP), auth/client middleware, validate (zod), rate limit, static + route trang sạch, health.
2. Repositories (gọi SP/query) → services (use case, phát realtime sau commit) → routes.
3. Realtime: `io.use` xác thực handshake, join room, publisher; theo dõi trạng thái "hết món" để phát `menu.availability_changed`.
4. FE: shared (`api.js`, `socket.js`, `ui.js`, `cart.js`, `auth.js`, `print.js`, CSS) → khách → POS → admin.
5. Test API + quyền + realtime + luồng đầu-cuối; kiểm UI bằng trình duyệt headless nếu cài được.

## Test scenarios và lệnh validation đã xác minh
- `npm test` (node:test + supertest trên DB `CafeQrTest`). `npm run db:migrate`, `npm run db:seed` đã chạy được.
- Ma trận quyền: khách → endpoint quầy = 401; STAFF → admin = 403; khách phiên khác = 403.
- Realtime: client phiên khác không nhận sự kiện (AC-004-03); staff nhận `order.created`.

## Rủi ro, câu hỏi và cách phục hồi
- Rủi ro TVP/`mssql` trên tedious: đã kiểm qua test SP.
- Âm thanh POS: trình duyệt chặn audio khi chưa có tương tác, nên có nút "Bật âm thanh".
- Không có máy in nhiệt / Wi-Fi quán: in kiểm bằng print preview (NOT_RUN với máy thật).

## Docs cần đồng bộ
api-contract, realtime-events, data-model (bảng mã lỗi + OrderIngredients), tech-stack (phiên bản thật), local-development (lệnh đã xác minh), tasks (trạng thái), features (Status theo ADR).
