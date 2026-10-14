# Bộ tài liệu cafe-qr-app

Web-app quán cà phê: khách quét QR gọi món, quầy nhận đơn realtime, hoàn tất món thì trừ kho theo BOM; **chỉ thu tiền mặt** (khách bấm "Gọi thanh toán", nhân viên ra bàn thu); có mục Bán mang đi; admin quản lý menu, bàn, kho và báo cáo. Một quán, một kho.

**Trạng thái (14/10/2026):** đã triển khai hoàn chỉnh MVP theo `nguồn/huong-dan-web-app-v1.2.md` và ADR-000…003. Còn mở **Q-000** (người ký chốt) và **Q-008** (hosting online). Kết quả test: [chất-lượng/test-strategy.md](chất-lượng/test-strategy.md); bàn giao: [chất-lượng/handover-2026-10-14.md](chất-lượng/handover-2026-10-14.md).

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
| [nghiệp-vụ/glossary.md](nghiệp-vụ/glossary.md) | Thuật ngữ ↔ tên trong code | Gặp thuật ngữ |
| [nghiệp-vụ/business-rules.md](nghiệp-vụ/business-rules.md) | BR-001…BR-020 kèm trạng thái | Sửa hành vi |
| [nghiệp-vụ/roles-permissions.md](nghiệp-vụ/roles-permissions.md) | Actor, hành động, phạm vi dữ liệu, điều kiện | Sửa auth/quyền |
| [nghiệp-vụ/workflows-states.md](nghiệp-vụ/workflows-states.md) | Máy trạng thái đơn / thanh toán / phiên | Đổi trạng thái |
| [chức-năng/](chức-năng/README.md) | FEATURE-001…012, mỗi feature một file, có AC | Trước khi làm feature |
| [kiến-trúc/system-overview.md](kiến-trúc/system-overview.md) | Thành phần, tầng, hướng phụ thuộc, mapping module | Quyết định đặt logic ở đâu |
| [kiến-trúc/tech-stack.md](kiến-trúc/tech-stack.md) | Stack, trạng thái lựa chọn | Cài dependency |
| [kiến-trúc/data-model.md](kiến-trúc/data-model.md) | DDL, SP, bảng mã lỗi, ghi chú đối chiếu | Sửa dữ liệu/SP |
| [kiến-trúc/api-contract.md](kiến-trúc/api-contract.md) | Endpoint, auth, request/response, lỗi | Sửa API / nối UI |
| [kiến-trúc/realtime-events.md](kiến-trúc/realtime-events.md) | Sự kiện, room, quy tắc client | Sửa realtime |
| [giao-diện/screens-flows.md](giao-diện/screens-flows.md) | Màn hình S-01…S-25, UI states, điều hướng | Làm UI |
| [chất-lượng/test-strategy.md](chất-lượng/test-strategy.md) | Kiểm thử theo rủi ro, kịch bản ép tải, DoD, **mẫu bàn giao** | Lập plan / verify / bàn giao |
| [vận-hành/local-development.md](vận-hành/local-development.md) | Môi trường, biến env, lệnh (đã/chưa xác minh), skills, kiểm thiết lập agent | Setup / debug |
| [vận-hành/agent-prompts.md](vận-hành/agent-prompts.md) | Prompt giao task, áp ADR, nhận Word mới | Giao việc cho agent |
| [công-việc/README.md](công-việc/README.md) | TASK-000…022, phụ thuộc, trạng thái, lịch 8 tuần, checklist | Chọn việc |
| [kế-hoạch/README.md](kế-hoạch/README.md) | Mẫu plan cho task rủi ro | Trước khi sửa lớn |
| [quyết-định/README.md](quyết-định/README.md) | ADR đã có và ADR chờ chốt | Chạm vào quyết định |
| [open-questions.md](open-questions.md) | Q-000…Q-018 | Gặp điểm chưa rõ |
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
