# cafe-qr-app

Web-app cho quán cà phê vừa và nhỏ (đồ án):

- **Khách** quét QR tại bàn, xem menu, gọi món trên trình duyệt điện thoại (không cài app). Có thể gộp nhóm hoặc gọi riêng, theo dõi đơn realtime, rồi bấm **Gọi thanh toán**.
- **Nhân viên quầy** nhận đơn realtime (có âm thanh), tiếp nhận, **hoàn tất món** (lúc này trừ kho theo BOM bằng stored procedure, không bao giờ âm kho), ra bàn **thu tiền mặt**, in bill khổ 58/80 mm, đóng bàn. Có mục **Bán mang đi** riêng.
- **Quản lý** thêm/sửa/xóa thực đơn, định lượng (BOM), kho nguyên liệu, bàn + mã QR, tài khoản; xem báo cáo doanh thu và lịch sử đơn.
- **Giai đoạn 2 (ADR-005):** hội viên bằng SĐT (hạng + chiết khấu, đơn đầu −10%), combo, khuyến mãi theo lịch, mục Gợi ý/Bán chạy, tùy chọn món (size/topping), chốt ca tiền mặt, giảm giá tay có duyệt, hoàn tiền sau thu, tạm ngưng nhận đơn QR + giờ bán theo danh mục, khách gọi nhân viên, nhập kho & kiểm kê + giá vốn. Thêm 16/10: gọi món tại bàn (nhân viên nhập giúp) + ghi chú bàn.
- **Giai đoạn 4–8 (ADR-006, 18/10/2026):** gọi lại đơn lần trước & món yêu thích, thực đơn theo lịch, thời gian chờ ước tính, chia bill theo người; đơn vị & giá vốn bình quân, bán thành phẩm / phiếu sơ chế, phiếu hủy & hao hụt, lô hạn dùng (FEFO), nhà cung cấp & đơn đặt hàng, dự báo nhập hàng; vai Trưởng ca, sổ quỹ, chấm công + lịch làm + nhật ký thao tác, lãi / lỗ ước tính; tích điểm & tem, giới thiệu bạn + voucher, chiến dịch theo phân khúc; menu engineering, phân tích (giờ cao điểm, dự báo doanh thu, so sánh kỳ, theo bàn), màn "Hôm nay" cho chủ quán. Job nền chạy trong cùng tiến trình (`ứng-dụng/máy-chủ/src/jobs/`).

Stack (ADR-002): **HTML/CSS/JS thuần** (không framework) · **Node.js + Express** (REST) · **Socket.io** · **SQL Server** (SP + transaction). Nhóm: Tuyến (Front-end) · Nhật Anh (Back-end/Database) · Sáng (Testing).

> **Mới dùng lần đầu?** Mở thư mục [`hướng-dẫn/`](hướng-dẫn/README.md): bấm đúp `1-cài-đặt-lần-đầu.cmd`, rồi `2-mở-app.cmd`. Các file `3`…`8` để chạy test và xem link QR.
>
> **Chức năng mới (16/10/2026)** — hội viên, combo, khuyến mãi, chốt ca, hoàn tiền…: xem thư mục [`chức-năng-mới/`](chức-năng-mới/README.md) (có ảnh từng bước). **Giai đoạn 4–8 (18/10/2026)** — chia bill, kho nâng cao, trưởng ca, sổ quỹ, chấm công, lãi / lỗ, tích điểm & voucher, phân tích, màn Hôm nay…: mục 14…24 cùng thư mục.

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
npm run db:seed:mau2     # (tùy chọn) mẫu giai đoạn 2: tùy chọn Size/Topping, combo, khuyến mãi, món ghim

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
npm test            # 217 test: bộ tính giá + hàm thuần + integration SP/API/quyền/realtime/job trên SQL Server thật (DB CafeQrTest bị xóa sạch mỗi lần)
npm run test:e2e    # 27 test giao diện Playwright/Chromium (lần đầu: node node_modules/@playwright/test/cli.js install chromium)
npm run load        # ép tải tranh chấp kho §13.2 (NFR-002) + đo độ trễ realtime (NFR-001)
npm run lint && npm run format:check
```

Kết quả gần nhất (18/10/2026): 217/217 · 27/27 · 10/10 vòng (p95 92 ms) · lint + prettier PASS. **Lưu ý:** thu tiền cần **mở ca** trước (nút "⚠ Chưa mở ca" trên thanh quầy). Chi tiết: [tài-liệu/chất-lượng/test-strategy.md](tài-liệu/chất-lượng/test-strategy.md).

## Tài liệu

- Người: [tài-liệu/README.md](tài-liệu/README.md) → [tài-liệu/công-việc/README.md](tài-liệu/công-việc/README.md) → báo cáo bàn giao [MVP](tài-liệu/chất-lượng/handover-2026-10-14.md) · [giai đoạn 2](tài-liệu/chất-lượng/handover-2026-10-16.md)
- AI agent: [AGENTS.md](AGENTS.md) (Claude Code nạp qua [CLAUDE.md](CLAUDE.md)); skills trong `.agent/skills/` → `bash kịch-bản/sync-skills.sh`
- Quyết định: [tài-liệu/quyết-định/](tài-liệu/quyết-định/README.md) · Câu hỏi còn mở: Q-000, Q-008 ([tài-liệu/open-questions.md](tài-liệu/open-questions.md))
