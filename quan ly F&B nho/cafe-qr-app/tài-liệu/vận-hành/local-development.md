# Vận hành, môi trường và phát triển local

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §12, §14.3, §17.4 (bản 1.2, 14/10/2026), cộng với kết quả kiểm tra thực tế ngày 13/10/2026 (ghi rõ ở từng mục).
> **Quy ước:** lệnh nào **chưa chạy thật** thì ghi `CHƯA XÁC MINH`. Chỉ đổi sang `ĐÃ XÁC MINH (ngày, máy, kết quả)` sau khi đã chạy được.

## Vận hành, bảo mật, môi trường

| Hạng mục | Quyết định | Trạng thái |
| --- | --- | --- |
| Môi trường | `dev` (máy cá nhân + SQL Server), `staging` (deploy thử, dữ liệu giả), `prod` (quán thử nghiệm) | PROPOSED |
| Secrets | `.env` không commit; `.env.example` liệt kê tên biến: `DB_CONNECTION`, `JWT_SECRET`, `PUBLIC_BASE_URL` (URL in trong QR bàn), `SHOP_NAME`, `SHOP_ADDRESS` (tên / địa chỉ quán mặc định — từ F-053 đổi được ở Quản lý → Cài đặt; đã lưu ở đó thì `.env` không còn tác dụng), `ADMIN_SEED_USERNAME`, `ADMIN_SEED_PASSWORD` | PROPOSED (`.env.example` tạo ở TASK-001) |
| Dữ liệu nhạy cảm | Mật khẩu (hash); JWT secret; số liệu doanh thu/kho chỉ ADMIN xem | PROPOSED |
| Audit | `CreatedBy/CompletedBy/CancelledAt` trên đơn; `InventoryTransactions` cho kho. Từ ADR-006 (F-035, D-26) có bảng `AuditLogs` chỉ đọc cho mọi thao tác đổi tiền/kho/quyền/giá, giữ 12 tháng (job `audit-retention`) | CONFIRMED (D-26) |
| Rate limit | `POST /api/orders` 10 req/phút/clientToken; `POST /api/auth/login` 5 req/phút/IP | PROPOSED |
| CORS | Chỉ domain FE | PROPOSED |
| Sao lưu | Backup DB hàng ngày khi chạy prod thử nghiệm (Azure SQL tự động / script `BACKUP DATABASE` cron) | PROPOSED |
| Dữ liệu thật để test | Không; dùng seed giả | PROPOSED |
| Seed | Admin đầu tiên; 2 danh mục, 8 món, 6 nguyên liệu, BOM mẫu, 6 bàn | PROPOSED |

## Môi trường máy đã kiểm (13/10/2026)

Kiểm trên máy Windows 11 nơi thiết lập repo này. Đây **không** phải yêu cầu phiên bản; phiên bản chính thức chốt ở TASK-001/002 và ghi vào `tài-liệu/kiến-trúc/tech-stack.md`.

| Công cụ | Kết quả |
| --- | --- |
| Node.js / npm | v24.19.0 / 11.17.0 |
| .NET SDK | 9.0.312 |
| Git | 2.53.0 |
| Python | 3.14 (chỉ dùng cho script tách docs, không thuộc stack) |
| SQL Server | **Có instance cài sẵn** `MSSQLSERVER` (dịch vụ Running), 15.0.2000.5 = SQL Server 2019 Developer, collation `SQL_Latin1_General_CP1_CI_AS`; có `sqlcmd` (ODBC 17 Tools) và LocalDB `MSSQLLocalDB` |
| Docker | **Chưa cài**. Phương án `docker compose up -d mssql` chưa dùng được trên máy này |
| k6, pandoc | Chưa cài |

Hệ quả: TASK-001 phải chọn (và ghi lại) cách dựng SQL Server dev: cài Docker Desktop để dùng image `mcr.microsoft.com/mssql/server:2022-latest` như tech-stack, **hoặc** dùng instance SQL Server 2019 có sẵn. DDL/SP đề xuất dùng `STRING_AGG` và `CREATE OR ALTER`, cả hai đều chạy được trên 2019. Test đồng thời (NFR-002) chạy được trên cả hai cách, miễn là SQL Server thật, không mock.

Lệnh đã chạy để kiểm (chỉ đọc, không tạo database):

```bash
sqlcmd -S . -E -C -Q "SELECT SERVERPROPERTY('ProductVersion'), SERVERPROPERTY('Edition'), SERVERPROPERTY('Collation')"
```

> **Cách nhanh nhất:** thư mục [`hướng-dẫn/`](../../hướng-dẫn/README.md) có file bấm đúp cho cài đặt (`npm run setup` — tự tạo `.env`, database, login SQL, migrate, seed), mở app và chạy từng loại test. Phần dưới là các bước thủ công tương đương.

## Cài đặt lần đầu — ĐÃ XÁC MINH (14/10/2026, Windows 11, SQL Server 2019 Developer cài sẵn)

1. **SQL Server** phải bật *Mixed Mode* và *TCP/IP* (cổng 1433). Ứng dụng Node kết nối qua TCP bằng **SQL login**, vì driver `tedious` không dùng được Windows Authentication. Chạy một lần bằng tài khoản Windows có quyền sysadmin:

   ```bash
   sqlcmd -S . -E -C -i cơ-sở-dữ-liệu/cài-đặt/local-sql-setup.sql -v DB_NAME="CafeQrDev"  APP_LOGIN="cafe_app" APP_PASSWORD="<mật khẩu mạnh>"
   sqlcmd -S . -E -C -i cơ-sở-dữ-liệu/cài-đặt/local-sql-setup.sql -v DB_NAME="CafeQrTest" APP_LOGIN="cafe_app" APP_PASSWORD="<cùng mật khẩu>"
   ```

   Lệnh này tạo DB (collation `Vietnamese_CI_AS`), tạo login `cafe_app` và cấp `db_owner`. Máy có Docker thì thay bằng `docker compose up -d mssql` rồi dùng `DB_USER=sa` (CHƯA XÁC MINH trên máy này vì không có Docker).
2. `cp .env.example .env` rồi điền `DB_PASSWORD`, `JWT_SECRET`, `ADMIN_SEED_PASSWORD` (và `PUBLIC_BASE_URL` = IP LAN nếu cho điện thoại quét QR).
3. Cài và tạo dữ liệu:

   ```bash
   npm install
   npm run db:migrate          # áp cơ-sở-dữ-liệu/chuyển-đổi (một lần) + cơ-sở-dữ-liệu/thủ-tục (mỗi lần) — chạy lại không lỗi
   npm run db:seed             # admin (từ .env), staff1/Staff@123, 2 danh mục, 8 món, 6 nguyên liệu, BOM, 6 bàn; in URL QR từng bàn
   npm run db:seed:demo        # (tùy chọn) 55 đơn đã thu 01–10/10/2026 để xem báo cáo
   npm run db:seed:mau2        # (tùy chọn) mẫu giai đoạn 2: tùy chọn Size/Topping, combo, khuyến mãi, món ghim (ADR-005)
   ```

## Lệnh hằng ngày — ĐÃ XÁC MINH (16/10/2026; test, E2E, lint, ép tải chạy lại 20/10/2026)

| Lệnh | Việc | Kết quả lần chạy gần nhất |
| --- | --- | --- |
| `npm run dev` | Chạy API + Socket.io + FE tĩnh tại `http://localhost:3000`, tự khởi động lại khi sửa `ứng-dụng/máy-chủ/src` (FE không cần build: sửa file trong `ứng-dụng/giao-diện/public` rồi F5) | Chạy được; in ra các địa chỉ LAN |
| `npm start` | Như trên, không watch (dùng khi chạy thật ở quán) | Chạy được |
| `npm test` | 355 test (33 file): unit (bộ tính giá, lịch thực đơn, ETA, đơn vị / dự báo / hao hụt, nhật ký / lãi lỗ / quyền, phân tích) + integration (SP, API, quyền, realtime, xóa, hội viên, combo, khuyến mãi, tùy chọn, ca, giảm tay, hoàn tiền, kho, gọi món tại bàn, giai đoạn 4–8, F-046 / F-047 và `acceptance.test.js` — AC bổ sung ở TASK-057) trên DB `CafeQrTest` thật — **xóa sạch DB test mỗi lần**; chi tiết ở `chất-lượng/test-strategy.md` | 304/304 PASS (23/10/2026, thêm `shift-required.test.js` — TASK-071); ghi thêm báo cáo JUnit `kiểm-thử/kết-quả/node-junit.xml` cho ma trận truy vết |
| `npm run test:e2e` | 54 test Playwright Chromium: project `flow` (51 — điện thoại 390px + máy quầy + quản lý) rồi `a11y` (3 — kiểm khả năng tiếp cận WCAG 2.2 AA máy kiểm được + chụp ảnh chuẩn vào `kiểm-thử/kết-quả/ảnh/`), server riêng cổng 3100, DB test sạch, `JOBS_ENABLED=false`; ghi `kiểm-thử/kết-quả/e2e.json` | 43/43 PASS (23/10/2026, TASK-071) |
| `npm run load` | Kịch bản §13.2 qua HTTP thật, 10 vòng × 30 khách (NFR-002) + đo độ trễ realtime (NFR-001). `npm run load:report` ghi kết quả vào `kiểm-thử/kết-quả/load.txt` | 10/10 vòng PASS; NFR-001 p50 79 ms, p95 239 ms (20/10/2026, ngưỡng < 2.000 ms) |
| `npm run db:seed:mau2` | Thêm dữ liệu mẫu giai đoạn 2 (chỉ khi chưa có tùy chọn/combo/khuyến mãi) | Đã chạy trên DB test, chạy lại tự bỏ qua |
| `npm run lint` / `npm run format:check` | ESLint 9 / Prettier 3 | 0 lỗi (20/10/2026) |
| `npm run trace` | Sinh `tài-liệu/chất-lượng/traceability.md` (AC → Story → Module → Màn hình → Test → kết quả) từ `tc-map.md` + kết quả chạy thật trong `kiểm-thử/kết-quả/`. `npm run trace -- --check` thoát lỗi nếu có AC chưa có test / bằng chứng hỏng / test FAIL. Chạy **sau** `npm test`, `npm run test:e2e`, `npm run load:report` | 289 / 289 AC PASS (20/10/2026) |
| `npm run skills:check` | Kiểm `.claude/skills` khớp `.agent/skills` | OK |
| `npm run setup` | Cài đặt lần đầu có hỏi đáp (tạo `.env`, DB + login qua `sqlcmd -E`, migrate, seed, Chromium) — chạy lại an toàn | Đã chạy trên máy có sẵn và máy giả lập chưa có `.env` |
| `npm run qr:links` | In link QR các bàn đang hoạt động (chỉ đọc) | OK |
| `npm run db:backup` | Sao lưu CSDL (`DB_NAME`) + ảnh hóa đơn vào `BACKUP_DIR` (bước 15 — [backup-restore.md](backup-restore.md)) | Thử trên `CafeQrDev` 23/10/2026 vào thư mục thử: 14,1 MB / 0,2 giây; thiếu quyền ghi → báo lệnh `icacls` |
| `npm run db:restore -- --drill` | Diễn tập khôi phục vào `CafeQrRestoreDrill` rồi xóa (cần quyền quản trị SQL Server, gọi `sqlcmd -E`) | ĐẠT 23/10/2026 (0,4 giây) |
| `npm run ops:health` | Kiểm tra app + CSDL, ổ đĩa, sao lưu, job nền, dung lượng CSDL; mã thoát 0 / 1 / 2 ([monitoring.md](monitoring.md)) | ỔN khi app chạy, LỖI khi app tắt (23/10/2026) |

Lần đầu chạy E2E cần cài trình duyệt: `node node_modules/@playwright/test/cli.js install chromium`.

### Sao lưu & khôi phục khi chạy migration (bước 13 — TASK-057)

Migration chỉ **cộng thêm** (bảng / cột mới, `IF NOT EXISTS`, SP `CREATE OR ALTER`), không có script "down". Phương án khôi phục là **sao lưu trước, khôi phục nếu lỗi**:

```bash
# 1. Sao lưu DB thật trước khi migrate (Windows auth; đổi đường dẫn theo máy)
sqlcmd -S localhost -E -Q "BACKUP DATABASE CafeQrDev TO DISK = N'C:\SaoLuu\CafeQrDev-truoc-0034.bak' WITH INIT, COPY_ONLY"
# 2. Chạy migration
npm run db:migrate
# 3. Nếu lỗi: dừng app (npm start / dev) rồi khôi phục bản vừa sao lưu
sqlcmd -S localhost -E -Q "ALTER DATABASE CafeQrDev SET SINGLE_USER WITH ROLLBACK IMMEDIATE; RESTORE DATABASE CafeQrDev FROM DISK = N'C:\SaoLuu\CafeQrDev-truoc-0034.bak' WITH REPLACE; ALTER DATABASE CafeQrDev SET MULTI_USER"
```

Kiểm thử luôn chạy trên `CafeQrTest` (bị xóa sạch mỗi lần), không bao giờ trên `CafeQrDev`. Sao lưu định kỳ, khôi phục, diễn tập trên máy chạy thật: [backup-restore.md](backup-restore.md) (bước 15, TASK-070). Lệnh `sqlcmd` ở trên vẫn dùng được khi cần làm tay.

### Lưu ý môi trường

- **Đường dẫn có ký tự `&`** (ví dụ thư mục "quan ly F&B nho"): các file shim `.cmd` của npm trên Windows hỏng (`npx …` báo "'B' is not recognized…"). Các script trong `package.json` đã gọi thẳng `node node_modules/...` nên vẫn chạy được. Khi cần dùng `npx`, nên đặt repo ở đường dẫn không có `&`.
- **Điện thoại khách quét QR**: máy chủ và điện thoại phải cùng Wi-Fi; đặt `PUBLIC_BASE_URL=http://<IP-LAN>:3000` (khi khởi động, server in danh sách IP), mở port 3000 trên Windows Firewall, rồi **in lại QR** (trang Quản lý → Bàn & mã QR → In tất cả QR).
- Trên http trong LAN, trình duyệt điện thoại không có `crypto.randomUUID`; FE đã có phương án dự phòng.
- Âm thanh POS: bấm nút "Bật âm thanh" một lần sau khi mở trang (trình duyệt chặn tự phát âm thanh).
- **Thu tiền cần ca đang mở** (ADR-005, F-018): mỗi ngày bấm "⚠ Chưa mở ca" trên thanh quầy để mở ca; cuối ngày Quầy → Ca & hoàn tiền → Đóng ca.
- Migration `0003`…`0014` đã áp lên DB dev có sẵn dữ liệu ngày 16/10/2026 (chỉ thêm bảng/cột; dữ liệu cũ giữ nguyên).
- Migration giai đoạn 4–8 (ADR-006): `0015_goi_lai_don.sql` … `0032_tong_hop_ngay.sql`, mỗi feature có đổi schema một file; `npm run db:migrate` áp các file chưa chạy. Lưu ý `0029_tich_diem.sql`: số dư điểm cũ được ghi thành một dòng `ADJUST` "Số dư trước F-039", từ đó tích 1 điểm / 10.000đ (D-27).
- Migration `0033_sua_xoa_mon.sql` (ADR-007, F-046 sửa / xóa món, hủy bàn) đã áp lên `CafeQrDev` ngày 18/10/2026 (chỉ thêm bảng / cột). Migration mới tiếp theo dùng số **`0034`**.
- Dữ liệu dev hiện có thêm vài đơn chạy thử từ lượt kiểm giao diện ngày 14/10/2026.

### Giai đoạn 4–8: biến môi trường, job nền, ảnh tải lên (ADR-006, 18/10/2026)

**Biến môi trường mới / đổi ý nghĩa** (khai báo mẫu trong `.env.example`, đọc ở `ứng-dụng/máy-chủ/src/config.js` và `src/jobs/scheduler.js`):

| Biến | Mặc định | Tác dụng |
| --- | --- | --- |
| `JOBS_ENABLED` | bật (`.env.example` ghi `true`) | Chỉ giá trị `false` mới tắt bộ lập lịch: job không tự chạy, nhưng vẫn chạy thủ công được. Test (`tests/helpers/testDb.js`) và E2E (`kịch-bản/e2e-server.js`) tự đặt `false` |
| `UPLOADS_DIR` | `<repo>/uploads` (khi `NODE_ENV=test`: thư mục tạm `cafe-qr-test-uploads` của hệ điều hành) | Nơi lưu ảnh hóa đơn sổ quỹ (F-033), file nằm ở `<UPLOADS_DIR>/receipts/` |
| `ZALO_OA_TOKEN` | trống | Có token → bật kênh `ZALO_OA` cho chiến dịch (F-037). Trống → chỉ dùng "Xuất danh sách (CSV)"; chọn Zalo OA báo `400 CHANNEL_NOT_CONFIGURED`, không gửi gì ra ngoài |
| `ZALO_OA_URL` | `https://openapi.zalo.me/v3.0/oa/message/cs` | Cổng gửi tin Zalo OA; đổi khi tài khoản OA của quán dùng cổng khác |
| `JWT_EXPIRES_IN` (đã có) | `8h` | Ngoài thời hạn token, nay còn là mốc job `attendance-autoclose` đóng chấm công quên đăng xuất: `ClockOut = ClockIn + thời hạn`. Nhận `8h`, `45m`, `1d` hoặc số giây; không đọc được → 8 giờ |
| `BACKUP_DIR`, `BACKUP_COPY_DIR` | trống | Bước 15: thư mục bản sao lưu (đường dẫn đầy đủ; SQL Server phải có quyền ghi) và bản chép ngoài máy — [backup-restore.md](backup-restore.md). Trống `BACKUP_DIR` → `db:backup` báo lỗi, `ops:health` báo cần để ý |
| `BACKUP_KEEP_DAYS`, `BACKUP_KEEP_MONTHS` | `14`, `12` | Giữ bản hằng ngày / bản đầu tháng (và bản có nhãn) |
| `LOG_DIR` | `<repo>/nhật-ký` | Nơi `ops:health` ghi `health-latest.json`, `health-YYYYMM.log`; file `11-chạy-máy-chủ-quán.cmd` ghi `server-YYYYMMDD.log` vào `nhật-ký\` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | trống; cổng `587`; `SMTP_SECURE` tự bật khi cổng `465` | F-060: hộp thư **gửi** email cảnh báo bất thường (người nhận đặt ở Cài đặt). Gmail: `smtp.gmail.com`, cổng 587, `SMTP_PASS` = **mật khẩu ứng dụng** (sổ bí mật S-11). Thiếu host / user / pass → email nằm chờ trong `AlertOutbox`, Cài đặt báo "Chưa cấu hình hộp thư gửi"; sửa xong khởi động lại app → tự gửi. Kiểm bằng nút "Gửi email thử" |
| `MAIL_HOURLY_MAX` | `20` | Tối đa email gửi trong một giờ (chống dội bom); test cảnh báo đặt cao hơn |
| `MAIL_TRANSPORT` | trống (= SMTP) | `json` = dựng email nhưng **không gửi ra ngoài** — E2E (`kịch-bản/e2e-server.js`) luôn đặt. Bộ gửi nền `src/jobs/alertMailer.js` chạy mỗi 60 giây khi `JOBS_ENABLED` khác `false` |
| `RESTORE_SQL_SERVER`, `RESTORE_SQL_USER`, `RESTORE_SQL_PASSWORD` | `.` + đăng nhập Windows | `db:restore` trên VPS / Docker (không có đăng nhập Windows) hoặc bản Express (`.\SQLEXPRESS`) |

**Job nền** (`src/jobs/index.js` đăng ký, `src/jobs/scheduler.js` chạy; giờ quán UTC+7):

| Job | Lịch | Việc | Feature |
| --- | --- | --- | --- |
| `refresh-caches` | Mỗi 15 phút | Làm mới thống kê gợi ý + bảng thời gian pha chuẩn | F-017, F-025 |
| `attendance-autoclose` | Mỗi 15 phút | Đóng chấm công mở quá thời hạn token | F-035 |
| `campaigns-due` | Mỗi 5 phút | Chạy chiến dịch `SCHEDULED` đã đến giờ hẹn | F-037 |
| `daily-summary` | 00:30 | Tổng hợp số liệu **hôm qua** cho `/admin/today` | F-043 |
| `prep-stats` | 02:00 | Trung vị thời gian pha thực tế 30 ngày theo món | F-025 |
| `demand-forecast` | 02:00 | Dự báo tiêu thụ 14 ngày tới | F-029 |
| `audit-retention` | 03:00 | Xóa nhật ký thao tác quá 12 tháng (lô 5.000 dòng) | F-035 |
| `lot-expiry` | 06:00 | Phát `inventory.expiring` (≤ 2 ngày) / `inventory.expired` tới quầy | F-028 |
| `runout-alert` | 06:05 | Phát `inventory.runout`: nguyên liệu sẽ hết trước ngày giao kế tiếp | F-029 |

Cách chạy:

- Bộ lập lịch là một `setInterval` 30 giây trong tiến trình `npm start` / `npm run dev`; không cần cron của hệ điều hành.
- Job theo chu kỳ chờ đủ một chu kỳ sau khi khởi động. Job theo giờ chạy khi đã qua mốc giờ trong ngày mà chưa có lần chạy `OK`/`RUNNING` từ mốc đó, nên máy tắt lúc 02:00 thì bật lên sẽ chạy bù.
- Khóa trong DB (`Settings` `job.<name>.running`, hết hạn 30 phút) → nhiều tiến trình không chạy trùng; lần bị trùng ghi `SKIPPED`. Mỗi lần chạy ghi bảng `JobRuns` (`RUNNING` → `OK` / `FAILED` / `SKIPPED`). Job idempotent (chạy lại không nhân đôi).

Chạy thủ công một job:

- **Giao diện quản lý:** S-34 tab "Thời gian pha & hàng chờ" → **Tính lại thống kê** (`prep-stats`); S-35 tab "Đề xuất nhập hàng" → **Tính lại dự báo** (`demand-forecast`); S-42 → **Tính lại hôm nay** (gọi `POST /api/dashboard/recompute`, tính lại hôm nay và hôm qua nếu chưa có).
- **API (chỉ ADMIN):** `GET /api/admin/jobs` (danh sách job, lịch, lần chạy gần nhất); `POST /api/admin/jobs/{name}/run` → `{ name, status: OK | SKIPPED | FAILED, info | error }`, ghi `JobRuns` "Chạy thủ công" và nhật ký thao tác `jobs.run`. Endpoint đã có test (`phase4`, `inventory2`, `finance`, `loyalty`, `analytics`); lệnh `curl` dưới đây **CHƯA XÁC MINH**:

  ```bash
  curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"<mật khẩu>"}'
  # dán accessToken vào <token>
  curl -s -X POST http://localhost:3000/api/admin/jobs/daily-summary/run -H "Authorization: Bearer <token>"
  ```

**Ảnh tải lên:** thư mục `uploads/` đã có trong `.gitignore` (ảnh hóa đơn không vào git). DB chỉ lưu đường dẫn ảnh, nên khi chuyển máy hoặc sao lưu cần chép kèm thư mục `UPLOADS_DIR`. Test dùng thư mục tạm, không đụng `uploads/` thật.

### Chưa xác minh

- `docker-compose.yml` và `.github/workflows/ci.yml` (máy thiết lập không có Docker và repo chưa đẩy lên GitHub).
- Deploy online (Q-008 còn mở), k6 (không cài; `npm run load` thay thế), in trên máy in nhiệt thật, đo NFR-001 trên Wi-Fi quán.
- Gửi tin Zalo OA thật (F-037): test chỉ dùng kênh giả; cổng gửi phụ thuộc cấu hình tài khoản OA / ZNS của quán.
- Gửi email cảnh báo qua Gmail thật (F-060): test dùng bộ gửi giả, E2E dùng `MAIL_TRANSPORT=json`; cần chủ quán điền `SMTP_*` vào `.env` rồi bấm "Gửi email thử".

## Skills

Nguồn chính của skills là `.agent/skills/<name>/SKILL.md`. Công cụ AI không tự đọc thư mục này, nên phải đồng bộ sang thư mục mà công cụ nhận diện:

| Công cụ | Thư mục skill | Cách đồng bộ |
| --- | --- | --- |
| Claude Code (đang dùng) | `.claude/skills/` | `bash kịch-bản/sync-skills.sh` (mặc định) |
| Codex | `.agents/skills/` | `bash kịch-bản/sync-skills.sh .agents/skills` |
| Cursor | `.cursor/skills/` | `bash kịch-bản/sync-skills.sh .cursor/skills` |

- Sau mỗi lần sửa skill trong `.agent/skills/`, chạy lại script. `bash kịch-bản/sync-skills.sh --check` báo `DRIFT` nếu bản copy lệch so với nguồn, nên đưa lệnh này vào CI ở TASK-001.
- Repo dùng copy có kiểm tra thay vì symlink, vì symlink trên Windows cần Developer Mode hoặc quyền admin.
- Không sửa tay file trong `.claude/skills/` (hay `.agents/`, `.cursor/`) vì lần đồng bộ sau sẽ ghi đè.

| Skill | Trạng thái |
| --- | --- |
| `implement-feature` | Có. Đã đổi các tham chiếu "mẫu 19.4/19.5" thành đường dẫn thật (`tài-liệu/kế-hoạch/README.md`, `tài-liệu/chất-lượng/test-strategy.md#ban-giao`) |
| `change-database` | Có. Thêm tham chiếu tới bảng mã lỗi và "ghi chú đối chiếu" trong data-model |
| `verify-change` | Có. Đổi tham chiếu mẫu bàn giao thành đường dẫn thật |
| `them-gop-tach-chuyen-khoan` | Có (24/10/2026, TASK-073). Ghi lại F-056 thu bằng chuyển khoản, F-057 gộp hóa đơn (thu chung nhiều bàn), F-058 tách hóa đơn theo món: quyết định ADR-019, dữ liệu / SP / API / giao diện, bẫy đã gặp, test, cách làm lại |
| `canh-bao-bat-thuong-email` | Có (27/10/2026, TASK-075). Ghi lại F-060 phát hiện bất thường (5 dấu hiệu lúc đóng ca + 2 tức thì, ngưỡng cố định / mức bình thường), cảnh báo trong app + email SMTP qua hàng đợi `AlertOutbox`: quyết định ADR-020, dữ liệu / API / giao diện, bẫy đã gặp, cách mở rộng, xử lý "không nhận được email", cách làm lại |
| `che-do-co-ban-va-phat-hanh` | Có (29/10/2026, TASK-076/077). Gộp chuỗi nhánh chồng vào `main` thành ứng viên `v1.0.0-rc.N`; F-061 chế độ cơ bản (5 nhóm menu ẩn / hiện) + hướng dẫn 5 bước ở màn quầy, F-062 trang Chính sách dữ liệu, F-063 cảnh báo QR sai địa chỉ: ADR-021, dữ liệu / API / giao diện, bẫy đã gặp, cách thêm trang / nhóm / bước, xử lý "khách quét QR không vào được" |
| `do-an-cafe-reviewer` | **CHƯA CÓ trong repo.** Đã tìm trên máy thiết lập (`~/.claude/skills`, Downloads, Documents, Desktop) nhưng không thấy. Việc cần làm: thành viên đang giữ skill copy `SKILL.md` vào `.agent/skills/do-an-cafe-reviewer/`, chạy `kịch-bản/sync-skills.sh`, rồi đối chiếu với `rules.md` và `verify-change`: rule nghiệp vụ/quyền viết tay trong skill thì thay bằng link `tài-liệu/nghiệp-vụ/*`; phần trùng `verify-change` thì gộp. Ghi kết quả đối chiếu vào bảng này |

## Kiểm tra thiết lập agent

| Kiểm tra | Kết quả (13/10/2026) |
| --- | --- |
| `AGENTS.md`, `CLAUDE.md`, `.agent/rules.md` tồn tại; mọi link tương đối trong `AGENTS.md` và `tài-liệu/` trỏ tới file có thật | PASS — kiểm bằng script lúc thiết lập |
| `kịch-bản/sync-skills.sh` đồng bộ `.agent/skills` → `.claude/skills` và `--check` không báo lệch | PASS — xem báo cáo thiết lập |
| Claude Code liệt kê được 3 skill của dự án | **PASS (14/10/2026)** — Claude Code liệt kê `implement-feature`, `change-database`, `verify-change` từ `cafe-qr-app/.claude/skills` và agent đã dùng `change-database` + `implement-feature` khi triển khai |
| `CLAUDE.md` nạp `AGENTS.md` và `rules.md` | **NOT_RUN.** Cùng lý do trên. Cách kiểm: trong phiên mới, hỏi "liệt kê các rule MUST về thanh toán" và đối chiếu câu trả lời với `.agent/rules.md` |
| Chạy thử một task nhỏ | **PASS (14/10/2026)** — đã chạy task thật (TASK-002…017) theo skill, có plan `tài-liệu/kế-hoạch/TASK-002-017-plan.md` |
