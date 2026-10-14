# cafe-qr-app

Web-app cho quán cà phê vừa và nhỏ (đồ án):

- **Khách** quét QR tại bàn, xem menu, gọi món trên trình duyệt điện thoại (không cài app). Có thể gộp nhóm hoặc gọi riêng, theo dõi đơn realtime, rồi bấm **Gọi thanh toán**.
- **Nhân viên quầy** nhận đơn realtime (có âm thanh), tiếp nhận, **hoàn tất món** (lúc này trừ kho theo BOM bằng stored procedure, không bao giờ âm kho), ra bàn **thu tiền mặt**, in bill khổ 58/80 mm, đóng bàn. Có mục **Bán mang đi** riêng.
- **Quản lý** thêm/sửa/xóa thực đơn, định lượng (BOM), kho nguyên liệu, bàn + mã QR, tài khoản; xem báo cáo doanh thu và lịch sử đơn.

Stack (ADR-002): **HTML/CSS/JS thuần** (không framework) · **Node.js + Express** (REST) · **Socket.io** · **SQL Server** (SP + transaction). Nhóm: Tuyến (Front-end) · Nhật Anh (Back-end/Database) · Sáng (Testing).

> **Mới dùng lần đầu?** Mở thư mục [`hướng-dẫn/`](hướng-dẫn/README.md): bấm đúp `1-cài-đặt-lần-đầu.cmd`, rồi `2-mở-app.cmd`. Các file `3`…`8` để chạy test và xem link QR.

## Chạy nhanh

Yêu cầu: Node.js ≥ 22.9; SQL Server 2019+ đã bật Mixed Mode + TCP/IP (hoặc Docker). Chi tiết từng bước: [tài-liệu/vận-hành/local-development.md](tài-liệu/vận-hành/local-development.md).

```bash
# 1. Một lần: tạo DB + login ứng dụng (tài khoản Windows có quyền sysadmin)
sqlcmd -S . -E -C -i cơ-sở-dữ-liệu/cài-đặt/local-sql-setup.sql -v DB_NAME="CafeQrDev"  APP_LOGIN="cafe_app" APP_PASSWORD="<mật khẩu>"
sqlcmd -S . -E -C -i cơ-sở-dữ-liệu/cài-đặt/local-sql-setup.sql -v DB_NAME="CafeQrTest" APP_LOGIN="cafe_app" APP_PASSWORD="<mật khẩu>"

# 2. Cấu hình: sao chép .env.example → .env, điền DB_PASSWORD, JWT_SECRET, ADMIN_SEED_PASSWORD
npm install
npm run db:migrate
npm run db:seed          # in ra URL QR của 6 bàn
npm run db:seed:demo     # (tùy chọn) dữ liệu báo cáo 01–10/10/2026

# 3. Chạy
npm run dev              # http://localhost:3000
```

| Trang | Địa chỉ | Tài khoản mẫu |
| --- | --- | --- |
| Khách (mở bằng URL QR in ra khi seed) | `/t/<qrToken>` | — |
| Quầy | `/pos` | `staff1` / `Staff@123` |
| Quản lý | `/admin` | `admin` / mật khẩu `ADMIN_SEED_PASSWORD` trong `.env` |

Muốn điện thoại thật quét QR được: đặt `PUBLIC_BASE_URL=http://<IP-LAN>:3000` trong `.env`, mở port 3000 trên firewall, rồi in lại QR ở Quản lý → Bàn & mã QR.

## Kiểm thử

```bash
npm test            # 46 integration test SP + API + quyền + realtime trên SQL Server thật (DB CafeQrTest bị xóa sạch mỗi lần)
npm run test:e2e    # 15 test giao diện Playwright/Chromium (lần đầu: node node_modules/@playwright/test/cli.js install chromium)
npm run load        # ép tải tranh chấp kho §13.2 (NFR-002) + đo độ trễ realtime (NFR-001)
npm run lint && npm run format:check
```

Kết quả gần nhất (14/10/2026): 46/46 · 15/15 · 10/10 vòng · lint 0 lỗi. Chi tiết: [tài-liệu/chất-lượng/test-strategy.md](tài-liệu/chất-lượng/test-strategy.md).

## Tài liệu

- Người: [tài-liệu/README.md](tài-liệu/README.md) → [tài-liệu/công-việc/README.md](tài-liệu/công-việc/README.md) → [báo cáo bàn giao](tài-liệu/chất-lượng/handover-2026-10-14.md)
- AI agent: [AGENTS.md](AGENTS.md) (Claude Code nạp qua [CLAUDE.md](CLAUDE.md)); skills trong `.agent/skills/` → `bash kịch-bản/sync-skills.sh`
- Quyết định: [tài-liệu/quyết-định/](tài-liệu/quyết-định/README.md) · Câu hỏi còn mở: Q-000, Q-008 ([tài-liệu/open-questions.md](tài-liệu/open-questions.md))
