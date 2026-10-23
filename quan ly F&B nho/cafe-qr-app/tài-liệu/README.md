# Bộ tài liệu cafe-qr-app

Web-app quán cà phê: khách quét QR gọi món, quầy nhận đơn realtime, hoàn tất món thì trừ kho theo BOM; **chỉ thu tiền mặt** (khách bấm "Gọi thanh toán", nhân viên ra bàn thu); có mục Bán mang đi; admin quản lý menu, bàn, kho và báo cáo. Một quán, một kho.

**Trạng thái (18/10/2026):** đã triển khai thêm **giai đoạn 4–8** (FEATURE-025…043 + FEATURE-045, ADR-006 — gọi lại đơn, lịch thực đơn, thời gian chờ, chia bill, kho nâng cao, trưởng ca, sổ quỹ, chấm công/nhật ký, lãi/lỗ, điểm/tem/voucher/giới thiệu, chiến dịch, phân tích, dashboard; bàn giao: [chất-lượng/handover-2026-10-18.md](chất-lượng/handover-2026-10-18.md)) và FEATURE-024 gọi món tại bàn (16/10). Sau giai đoạn 4–8 (18/10): **FEATURE-046** sửa / xóa món đã gọi, xóa đơn, hủy lượt phục vụ bàn ([ADR-007](quyết-định/ADR-007-sua-xoa-mon-huy-ban.md), TASK-055, migration `0033`) và **FEATURE-047** hội viên khi gọi món tại bàn, Thẻ thành viên cho khách, quyền lợi trên bill ([ADR-008](quyết-định/ADR-008-hoi-vien-tai-ban-the-thanh-vien.md), TASK-056, không migration). Trước đó: **giai đoạn 2** (FEATURE-013…023, ADR-005 — hội viên, combo, khuyến mãi, gợi ý, tùy chọn món, chốt ca, giảm tay, hoàn tiền, nhận đơn/giờ bán, gọi nhân viên, nhập kho/kiểm kê; bàn giao: [chất-lượng/handover-2026-10-16.md](chất-lượng/handover-2026-10-16.md)). Trước đó: đã triển khai hoàn chỉnh MVP theo `nguồn/huong-dan-web-app-v1.2.md` và ADR-000…003. Còn mở **Q-000** (người ký chốt) và **Q-008** (hosting online). Kết quả test: [chất-lượng/test-strategy.md](chất-lượng/test-strategy.md); bàn giao: [chất-lượng/handover-2026-10-14.md](chất-lượng/handover-2026-10-14.md).

**Cập nhật 20/10/2026 — quy trình 15 bước (bước 01–14):** hoàn thiện hồ sơ theo Playbook AI Agent ([quy-trình-15-bước.md](quy-trình-15-bước.md) — bước → tài liệu → trạng thái). Mới: Project Brief, Actor + AF, User Story backlog, Use Case, Module Map, NFR, sitemap + ảnh chuẩn, design system, security model, ma trận truy vết (289 / 289 AC PASS từ lần chạy thật), Defect Log, Security / Accessibility check, DoD, kế hoạch UAT và hồ sơ Gate G1–G4 **chờ chủ dự án ký** ([quality-gates.md](chất-lượng/quality-gates.md)). TASK-057, TASK-058.

## Quy ước

**Trạng thái** (dùng thống nhất trong mọi bảng):

- `CONFIRMED`: Word ghi rõ là yêu cầu/quyết định, hoặc đã có ADR. Nhóm có thể triển khai.
- `PROPOSED`: tài liệu đề xuất (hoặc Word chỉ nói "ví dụ", "hoặc"). Chưa có hiệu lực cho đến khi nhóm chốt.
- `NEEDS_CONFIRMATION`: Word mâu thuẫn hoặc có nhiều cách hiểu, cần có người quyết định.
- `UNKNOWN`: Word không nói, chưa có thông tin.
- `N/A`: không áp dụng (kèm lý do).

**ID:** `REQ-` phạm vi/yêu cầu chung · `BR-` quy tắc nghiệp vụ · `DEC-` quyết định kỹ thuật · `NFR-` chất lượng/hiệu năng · `FEATURE-`/`F-` chức năng · `AC-` tiêu chí nghiệm thu · `Q-` câu hỏi chưa chốt · `TASK-` công việc · `ADR-` quyết định đã chốt · `S-` màn hình. ID không mang ý nghĩa ưu tiên.

## Bản đồ tài liệu

| File | Nội dung | Đọc khi |
| --- | --- | --- |
| [sản-phẩm/overview.md](sản-phẩm/overview.md) | Vấn đề, mục tiêu, MVP / làm sau / không làm, nhóm, NFR | Xác định phạm vi |
| [quy-trình-15-bước.md](quy-trình-15-bước.md) | Bản đồ quy trình 15 bước → tài liệu → trạng thái, bảng kiểm cuối | Kiểm tuân thủ quy trình |
| [sản-phẩm/project-brief.md](sản-phẩm/project-brief.md) | Project Brief (bước 01): mục tiêu đo được, phạm vi hiện hành, rủi ro | Xác định phạm vi |
| [sản-phẩm/nfr.md](sản-phẩm/nfr.md) | 59 NFR / 7 nhóm có cách đo + ngưỡng (bước 08) | Đặt chỉ tiêu chất lượng |
| [nghiệp-vụ/actors.md](nghiệp-vụ/actors.md) | Actor Register (ACT-*) + Actor Function Matrix (AF-*) (bước 02–03) | Biết ai làm gì |
| [nghiệp-vụ/user-stories.md](nghiệp-vụ/user-stories.md) | Backlog US-* có ưu tiên, ánh xạ AC / BR / UC / MOD / SCR (bước 04–05) | Chọn / nghiệm thu story |
| [nghiệp-vụ/use-cases.md](nghiệp-vụ/use-cases.md) | UC-01…UC-19: luồng chính / thay thế / ngoại lệ, User Flow (bước 06) | Hiểu luồng + ngoại lệ |
| [nghiệp-vụ/glossary.md](nghiệp-vụ/glossary.md) | Thuật ngữ ↔ tên trong code | Gặp thuật ngữ |
| [nghiệp-vụ/business-rules.md](nghiệp-vụ/business-rules.md) | BR-001…BR-073 kèm trạng thái | Sửa hành vi |
| [nghiệp-vụ/roles-permissions.md](nghiệp-vụ/roles-permissions.md) | Actor, hành động, phạm vi dữ liệu, điều kiện | Sửa auth/quyền |
| [nghiệp-vụ/workflows-states.md](nghiệp-vụ/workflows-states.md) | Máy trạng thái đơn / thanh toán / phiên | Đổi trạng thái |
| [chức-năng/](chức-năng/README.md) | FEATURE-001…043, 045…047, mỗi feature một file, có AC | Trước khi làm feature |
| [kiến-trúc/module-map.md](kiến-trúc/module-map.md) | 13 module MOD-*: trách nhiệm, dữ liệu, API, quyền, Story → Module (bước 07) | Đặt chức năng vào module |
| [kiến-trúc/security-model.md](kiến-trúc/security-model.md) | Xác thực, phân quyền, sở hữu dữ liệu, đối chiếu OWASP ASVS (bước 10) | Sửa auth / bảo mật |
| [kiến-trúc/system-overview.md](kiến-trúc/system-overview.md) | Thành phần, tầng, hướng phụ thuộc, mapping module | Quyết định đặt logic ở đâu |
| [kiến-trúc/tech-stack.md](kiến-trúc/tech-stack.md) | Stack, trạng thái lựa chọn | Cài dependency |
| [kiến-trúc/data-model.md](kiến-trúc/data-model.md) | DDL, SP, bảng mã lỗi, ghi chú đối chiếu | Sửa dữ liệu/SP |
| [kiến-trúc/api-contract.md](kiến-trúc/api-contract.md) | Endpoint, auth, request/response, lỗi | Sửa API / nối UI |
| [kiến-trúc/realtime-events.md](kiến-trúc/realtime-events.md) | Sự kiện, room, quy tắc client | Sửa realtime |
| [giao-diện/screens-flows.md](giao-diện/screens-flows.md) | Màn hình S-01…S-42, UI states, điều hướng | Làm UI |
| [giao-diện/sitemap.md](giao-diện/sitemap.md) | Sitemap route → SCR-* → actor → FEATURE, ảnh chuẩn từng màn (bước 09) | Làm UI / nghiệm thu giao diện |
| [giao-diện/design-system.md](giao-diện/design-system.md) | Token màu (đạt tương phản WCAG), chữ, khoảng cách, thành phần (bước 09) | Làm UI |
| [chất-lượng/test-strategy.md](chất-lượng/test-strategy.md) | Kiểm thử theo rủi ro, kịch bản ép tải, DoD, **mẫu bàn giao** | Lập plan / verify / bàn giao |
| [chất-lượng/traceability.md](chất-lượng/traceability.md) · [tc-map.md](chất-lượng/tc-map.md) | Ma trận truy vết tự sinh (`npm run trace`) · AC → test case | Nghiệm thu / kiểm bao phủ |
| [chất-lượng/quality-gates.md](chất-lượng/quality-gates.md) · [dod.md](chất-lượng/dod.md) | Hồ sơ duyệt Gate G1–G4 · Definition of Done | Duyệt / đóng task |
| [chất-lượng/security-check.md](chất-lượng/security-check.md) · [defect-log.md](chất-lượng/defect-log.md) · [uat-plan.md](chất-lượng/uat-plan.md) | Kiểm tra bảo mật + sổ rủi ro · Nhật ký lỗi · Kế hoạch & biên bản UAT | Bước 14 |
| [vận-hành/local-development.md](vận-hành/local-development.md) | Môi trường, biến env, lệnh (đã/chưa xác minh), skills, kiểm thiết lập agent | Setup / debug |
| [vận-hành/agent-prompts.md](vận-hành/agent-prompts.md) | Prompt giao task, áp ADR, nhận Word mới | Giao việc cho agent |
| [vận-hành/README.md](vận-hành/README.md) | Bước 15: phát hành, checklist triển khai, sổ bí mật, sao lưu & khôi phục, giám sát, sự cố | Đưa app vào chạy thật / khi có sự cố |
| [công-việc/README.md](công-việc/README.md) | TASK-000…058, phụ thuộc, trạng thái, lịch 8 tuần, checklist | Chọn việc |
| [kế-hoạch/README.md](kế-hoạch/README.md) | Mẫu plan cho task rủi ro | Trước khi sửa lớn |
| [quyết-định/README.md](quyết-định/README.md) | ADR đã có và ADR chờ chốt | Chạm vào quyết định |
| [open-questions.md](open-questions.md) | Q-000…Q-023 | Gặp điểm chưa rõ |
| [source-map.md](source-map.md) | REQ/BR/DEC/NFR → file docs; kết quả đối chiếu Word | Kiểm bao phủ |
| [nguồn/](nguồn/README.md) | `demo.docx`, văn bản trích, tài liệu hướng dẫn gốc (baseline, chỉ đọc) | Đối chiếu nguồn |

## Đọc gì theo loại việc

- **API/backend:** feature → business-rules + roles-permissions → api-contract → system-overview (tầng) → data-model nếu chạm DB.
- **Database/SP:** feature + rule → data-model → skill `change-database`.
- **Frontend:** feature → screens-flows → api-contract + realtime-events → roles-permissions (ẩn/hiện UI).
- **Realtime:** realtime-events → feature liên quan.
- **Thanh toán tiền mặt / gọi thanh toán:** FEATURE-005/006 → workflows-states (phiên) → api-contract (`request-payment`, `settle`) → data-model (`sp_SettleSession`).

Không đọc toàn bộ docs cho mỗi task. Mỗi task đã liệt kê sẵn phần "Context cần đọc".

## Cấu trúc repo

```text
cafe-qr-app/
├── AGENTS.md, CLAUDE.md, README.md
├── .agent/rules.md, .agent/skills/          # nguồn chính của skills
├── .claude/skills/                          # bản đồng bộ (kịch-bản/sync-skills.sh)
├── ứng-dụng/
│   ├── máy-chủ/src/                         # Node.js + Express + Socket.io (ADR-002)
│   │   ├── server.js, app.js, config.js, db.js, errors.js
│   │   ├── routes/      public.js (khách + đăng nhập), staff.js (quầy), admin.js, pages.js
│   │   ├── services/    sessionService, orderService, menuService, userService, adminService
│   │   ├── repositories/ gọi SP/truy vấn qua mssql
│   │   ├── realtime/    io.js (handshake, room), publisher.js (phát sau commit)
│   │   └── middleware/  auth, client (cookie cf_client), validate (zod), rateLimit, errorHandler
│   ├── máy-chủ/tests/                       # node:test + supertest + socket.io-client (SQL Server thật)
│   └── giao-diện/public/                    # FE HTML/CSS/JS thuần: t/, pos/, admin/, js/, js/pages/, css/
├── cơ-sở-dữ-liệu/chuyển-đổi/0001_init.sql, cơ-sở-dữ-liệu/thủ-tục/*.sql, cơ-sở-dữ-liệu/cài-đặt/local-sql-setup.sql
├── kịch-bản/      db-migrate.js, db-seed.js, seed-data.js, e2e-server.js, load-concurrency.js, sync-skills.sh
├── kiểm-thử/e2e/flow.spec.js                   # Playwright
├── playwright.config.js, eslint.config.js, .prettierrc.json
├── docker-compose.yml, .github/workflows/ci.yml   # chưa xác minh trên máy thiết lập
└── tài-liệu/
```

## Giữ Word và Markdown nhất quán

- `nguồn/demo.docx` là **đầu vào lịch sử** (baseline phiên bản 1, đọc ngày 13/10/2026). Từ khi nhóm xác nhận `tài-liệu/`, thì **`tài-liệu/` là đặc tả hiện hành**; không sửa tay Word song song.
- Mọi thay đổi nghiệp vụ sau này đều phải ghi ADR, hoặc sửa feature/rule trong `tài-liệu/` kèm trạng thái. Nếu cần nộp Word cho đồ án thì **xuất từ `tài-liệu/`** (ví dụ pandoc `tài-liệu/**/*.md` → `.docx`) thay vì duy trì hai bản.
- Khi nhận Word mới: so với baseline → liệt kê thay đổi → phân tích tác động (feature, data, API, task) → chỉ cập nhật tài-liệu/task sau khi được chấp thuận. **Không** sinh lại toàn bộ docs và ghi đè quyết định đã có.
- Khi source, test và docs mâu thuẫn nhau: điều tra ý định và nguồn quyết định (ADR, task), không mặc định bên nào đúng.
- Người quyết định (đề xuất, chờ Q-000): nghiệp vụ/phạm vi do cả nhóm; backend/DB do Nhật Anh; FE do Tuyến; chất lượng/DoD do Sáng. Agent chỉ phân tích, soạn, triển khai và cập nhật, không tự chốt.
