# Vận hành, môi trường và phát triển local

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §12, §14.3, §17.4 (bản 1.2, 14/10/2026), cộng với kết quả kiểm tra thực tế ngày 13/10/2026 (ghi rõ ở từng mục).
> **Quy ước:** lệnh nào **chưa chạy thật** thì ghi `CHƯA XÁC MINH`. Chỉ đổi sang `ĐÃ XÁC MINH (ngày, máy, kết quả)` sau khi đã chạy được.

## Vận hành, bảo mật, môi trường

| Hạng mục | Quyết định | Trạng thái |
| --- | --- | --- |
| Môi trường | `dev` (máy cá nhân + SQL Server), `staging` (deploy thử, dữ liệu giả), `prod` (quán thử nghiệm) | PROPOSED |
| Secrets | `.env` không commit; `.env.example` liệt kê tên biến: `DB_CONNECTION`, `JWT_SECRET`, `PUBLIC_BASE_URL` (URL in trong QR bàn), `SHOP_NAME`, `SHOP_ADDRESS` (in bill), `ADMIN_SEED_USERNAME`, `ADMIN_SEED_PASSWORD` | PROPOSED (`.env.example` tạo ở TASK-001) |
| Dữ liệu nhạy cảm | Mật khẩu (hash); JWT secret; số liệu doanh thu/kho chỉ ADMIN xem | PROPOSED |
| Audit | `CreatedBy/CompletedBy/CancelledAt` trên đơn; `InventoryTransactions` cho kho; đủ cho đồ án, chưa làm bảng audit tổng quát | PROPOSED |
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
   ```

## Lệnh hằng ngày — ĐÃ XÁC MINH (14/10/2026)

| Lệnh | Việc | Kết quả lần chạy gần nhất |
| --- | --- | --- |
| `npm run dev` | Chạy API + Socket.io + FE tĩnh tại `http://localhost:3000`, tự khởi động lại khi sửa `ứng-dụng/máy-chủ/src` (FE không cần build: sửa file trong `ứng-dụng/giao-diện/public` rồi F5) | Chạy được; in ra các địa chỉ LAN |
| `npm start` | Như trên, không watch (dùng khi chạy thật ở quán) | Chạy được |
| `npm test` | 46 integration test (SP + API + quyền + realtime + xóa) trên DB `CafeQrTest` thật — **xóa sạch DB test mỗi lần** | 46/46 PASS |
| `npm run test:e2e` | 15 test Playwright Chromium (điện thoại 390px + máy quầy + quản lý) trên server riêng cổng 3100, DB test sạch | 15/15 PASS |
| `npm run load` | Kịch bản §13.2 qua HTTP thật, 10 vòng × 30 khách (NFR-002) + đo độ trễ realtime (NFR-001) | 10/10 vòng PASS; p95 165 ms |
| `npm run lint` / `npm run format:check` | ESLint 9 / Prettier 3 | 0 lỗi |
| `npm run skills:check` | Kiểm `.claude/skills` khớp `.agent/skills` | OK |
| `npm run setup` | Cài đặt lần đầu có hỏi đáp (tạo `.env`, DB + login qua `sqlcmd -E`, migrate, seed, Chromium) — chạy lại an toàn | Đã chạy trên máy có sẵn và máy giả lập chưa có `.env` |
| `npm run qr:links` | In link QR các bàn đang hoạt động (chỉ đọc) | OK |

Lần đầu chạy E2E cần cài trình duyệt: `node node_modules/@playwright/test/cli.js install chromium`.

### Lưu ý môi trường

- **Đường dẫn có ký tự `&`** (ví dụ thư mục "quan ly F&B nho"): các file shim `.cmd` của npm trên Windows hỏng (`npx …` báo "'B' is not recognized…"). Các script trong `package.json` đã gọi thẳng `node node_modules/...` nên vẫn chạy được. Khi cần dùng `npx`, nên đặt repo ở đường dẫn không có `&`.
- **Điện thoại khách quét QR**: máy chủ và điện thoại phải cùng Wi-Fi; đặt `PUBLIC_BASE_URL=http://<IP-LAN>:3000` (khi khởi động, server in danh sách IP), mở port 3000 trên Windows Firewall, rồi **in lại QR** (trang Quản lý → Bàn & mã QR → In tất cả QR).
- Trên http trong LAN, trình duyệt điện thoại không có `crypto.randomUUID`; FE đã có phương án dự phòng.
- Âm thanh POS: bấm nút "Bật âm thanh" một lần sau khi mở trang (trình duyệt chặn tự phát âm thanh).
- Dữ liệu dev hiện có thêm vài đơn chạy thử từ lượt kiểm giao diện ngày 14/10/2026.

### Chưa xác minh

- `docker-compose.yml` và `.github/workflows/ci.yml` (máy thiết lập không có Docker và repo chưa đẩy lên GitHub).
- Deploy online (Q-008 còn mở), k6 (không cài; `npm run load` thay thế), in trên máy in nhiệt thật, đo NFR-001 trên Wi-Fi quán.

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
| `do-an-cafe-reviewer` | **CHƯA CÓ trong repo.** Đã tìm trên máy thiết lập (`~/.claude/skills`, Downloads, Documents, Desktop) nhưng không thấy. Việc cần làm: thành viên đang giữ skill copy `SKILL.md` vào `.agent/skills/do-an-cafe-reviewer/`, chạy `kịch-bản/sync-skills.sh`, rồi đối chiếu với `rules.md` và `verify-change`: rule nghiệp vụ/quyền viết tay trong skill thì thay bằng link `tài-liệu/nghiệp-vụ/*`; phần trùng `verify-change` thì gộp. Ghi kết quả đối chiếu vào bảng này |

## Kiểm tra thiết lập agent

| Kiểm tra | Kết quả (13/10/2026) |
| --- | --- |
| `AGENTS.md`, `CLAUDE.md`, `.agent/rules.md` tồn tại; mọi link tương đối trong `AGENTS.md` và `tài-liệu/` trỏ tới file có thật | PASS — kiểm bằng script lúc thiết lập |
| `kịch-bản/sync-skills.sh` đồng bộ `.agent/skills` → `.claude/skills` và `--check` không báo lệch | PASS — xem báo cáo thiết lập |
| Claude Code liệt kê được 3 skill của dự án | **PASS (14/10/2026)** — Claude Code liệt kê `implement-feature`, `change-database`, `verify-change` từ `cafe-qr-app/.claude/skills` và agent đã dùng `change-database` + `implement-feature` khi triển khai |
| `CLAUDE.md` nạp `AGENTS.md` và `rules.md` | **NOT_RUN.** Cùng lý do trên. Cách kiểm: trong phiên mới, hỏi "liệt kê các rule MUST về thanh toán" và đối chiếu câu trả lời với `.agent/rules.md` |
| Chạy thử một task nhỏ | **PASS (14/10/2026)** — đã chạy task thật (TASK-002…017) theo skill, có plan `tài-liệu/kế-hoạch/TASK-002-017-plan.md` |
