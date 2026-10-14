# Tech stack

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §10 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

| Lớp | Lựa chọn | Trạng thái | Ghi chú / lý do |
| --- | --- | --- | --- |
| Frontend | **HTML5 + CSS3 + JavaScript (ES2020+, ES modules)**, không framework, không bước build bắt buộc | CONFIRMED (D-4) | Mobile-first; CSS biến (`--color-*`) + layout flex/grid; mỗi trang một file HTML, JS tách theo module |
| Gọi API / state | `fetch` + wrapper `api.js` (gắn token, map lỗi `{code}`); giỏ hàng lưu `localStorage` theo `sessionId`; không thư viện state | PROPOSED | Khi Socket.io `reconnect` → gọi lại hàm `loadSnapshot()` (REQ-017) |
| Realtime client | `socket.io-client` nạp từ `/socket.io/socket.io.js` do server phát | PROPOSED | Không cần bundler |
| Thư viện FE tối thiểu | Không bắt buộc. Tùy chọn: Chart.js (biểu đồ báo cáo S-25) qua CDN hoặc copy vào `public/vendor/` | PROPOSED | Không thêm jQuery/Bootstrap nếu không có lý do ghi trong tech-stack |
| QR bàn | `qrcode` (npm) sinh PNG/SVG | PROPOSED | DEC-008 |
| Backend | **Node.js 20 LTS** + **Express** (REST API, serve file tĩnh FE) + `mssql` (driver tedious; hỗ trợ TVP và gọi SP) + **Socket.io** | CONFIRMED (Node, D-4) / PROPOSED (Express, mssql) | Cấu trúc thư mục theo tầng 9.2: `routes/` → `services/` → `repositories/` (gọi SP) |
| Validation / auth BE | `zod` hoặc `joi` cho DTO; `jsonwebtoken` + `bcrypt`; `helmet`, `cors`, `express-rate-limit` | PROPOSED | — |
| Database | **SQL Server** 2022 (Docker `mcr.microsoft.com/mssql/server:2022-latest` khi dev; Azure SQL/VPS khi deploy) | CONFIRMED | DEC-001 |
| Migration | File SQL đánh số `cơ-sở-dữ-liệu/chuyển-đổi/0001_init.sql` … chạy bằng script (`dbup`/`sqlcmd`/script Node); **không** sửa migration đã chạy | PROPOSED | Giữ SP trong `cơ-sở-dữ-liệu/thủ-tục/*.sql`, idempotent `CREATE OR ALTER` |
| Auth | JWT (HS256, secret từ env) cho staff/admin; cookie `cf_client` cho khách | PROPOSED | DEC-009: bcrypt cost 10 |
| Thanh toán | Không tích hợp cổng; tiền mặt ghi nhận trên POS | CONFIRMED (D-1) | Schema để mở rộng `TRANSFER` sau |
| Realtime | Socket.io (server + client) | CONFIRMED (D-4) | Rooms `staff`, `session:{id}`, `public` |
| In | `window.print()` + CSS `@media print`, `@page size 80mm` | CONFIRMED | DEC-007 |
| Test | BE: Jest + supertest (API) + integration test SP chạy SQL Server Docker; FE/E2E: Playwright; tải: **k6** | PROPOSED | NFR-002 cần test chạy trên SQL Server thật, không mock |
| Chất lượng code | ESLint + Prettier cho cả FE và BE (cùng `package.json` gốc) | PROPOSED | — |
| Hosting | Vì Express serve luôn FE tĩnh → **một tiến trình Node + một SQL Server**: Render/Railway/Fly (Docker) hoặc Azure (App Service + Azure SQL free tier) hoặc VPS; **hoặc** một máy trong quán chạy Docker (LAN) vì không cần webhook | UNKNOWN (Q-008) | Chọn trước tuần 6 |

> Phiên bản thư viện cụ thể do người setup chọn tại thời điểm `TASK-001/002`, kiểm với môi trường thật và ghi vào manifest (`package.json`) + `tài-liệu/kiến-trúc/tech-stack.md`. **Không ghi phiên bản "đã cài" khi chưa cài.**

## Đã cài thực tế (14/10/2026) — theo ADR-002

Nguồn: `package.json` / `package-lock.json`. Phiên bản dưới đây là bản **đã cài và đã chạy test**.

| Lớp | Thành phần | Phiên bản | Ghi chú |
| --- | --- | --- | --- |
| Runtime | Node.js | 24.19.0 (máy dev); `engines` ≥ 22.9 | Cần `--env-file-if-exists` (Node ≥ 22.9) |
| HTTP | express | 5.3.0 | Serve REST `/api/*` + FE tĩnh `ứng-dụng/giao-diện/public` + route trang sạch |
| Realtime | socket.io / socket.io-client | 4.8.4 | Client nạp từ `/socket.io/socket.io.min.js` (47 KB) do server phát |
| SQL Server | mssql (tedious 20.3.7) | 12.7.6 | Gọi SP + TVP `dbo.OrderItemInput` |
| Validation | zod | 4.6.7 | |
| Auth | jsonwebtoken / bcryptjs | 9.0.3 / 3.0.3 | bcryptjs thuần JS (không cần build native trên Windows), cost 10 |
| Bảo mật | helmet / express-rate-limit / cookie-parser | 8.3.0 / 8.7.1 / 1.4.7 | CSP chặn script ngoài; tắt `upgrade-insecure-requests` để chạy http trong LAN |
| QR | qrcode | 1.5.4 | PNG cho từng bàn |
| Test | `node --test` + supertest | Node 24 / 7.3.1 | Thay Jest vì code là ES modules (ADR-002) |
| E2E | @playwright/test + Chromium | 1.64.0 | `npm run test:e2e` |
| Chất lượng | eslint / prettier | 9.39.5 / 3.9.10 | ESLint 9 (flat config) thay vì 10 vừa ra |
| FE | HTML5/CSS3/ES modules | — | Không framework, không build; biểu đồ báo cáo vẽ bằng SVG tự viết (không Chart.js) |
| DB dev | SQL Server 2019 Developer (15.0.2000.5) | — | Instance cài sẵn trên máy dev; `docker-compose.yml` cho máy có Docker (2022) |
