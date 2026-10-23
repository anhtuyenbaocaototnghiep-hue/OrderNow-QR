# Hướng dẫn làm việc trong cafe-qr-app

Web-app quán cà phê: khách quét QR gọi món, quầy nhận đơn realtime, hoàn tất → trừ kho BOM,
in bill; admin quản lý menu/bàn/kho/báo cáo. Một quán, một kho. Chi tiết: `tài-liệu/`.

## Bắt đầu
- Đọc `.agent/rules.md` và task được giao trong `tài-liệu/công-việc/`.
- Tìm tài liệu theo Task ID: TASK-xxx → FEATURE / US / AC / BR / UC / MOD / SCR ghi ở đầu task; tra chéo bằng
  `tài-liệu/chất-lượng/traceability.md` (AC → Story → Module → Màn hình → Test). Chỉ mở tài liệu phụ khi cần.
- **Thứ tự ưu tiên khi tài liệu mâu thuẫn:** ADR mới nhất (`tài-liệu/quyết-định/`) > `business-rules.md` > FEATURE / TASK
  > kiến-trúc (api-contract, data-model) > hướng dẫn / bàn giao > `tài-liệu/nguồn/`. Mâu thuẫn mới → ghi Q-xxx, không tự chọn.
- Dùng `tài-liệu/README.md` để tìm context. Không load toàn bộ tài-liệu/skills nếu task không cần.
- Chỉ triển khai phạm vi đã giao và đủ rõ. Gặp Q-xxx đang NEEDS_CONFIRMATION liên quan
  → dừng phần đó, làm phần độc lập, ghi vào báo cáo.

## Bản đồ
- Mã nguồn: `ứng-dụng/máy-chủ/src` (routes → services → repositories/SP), `ứng-dụng/giao-diện/public` (FE thuần), `cơ-sở-dữ-liệu/` (migration + SP); lệnh chạy/test: `tài-liệu/vận-hành/local-development.md`
- Phạm vi / MVP: `tài-liệu/sản-phẩm/overview.md`
- Nghiệp vụ, quyền, trạng thái: `tài-liệu/nghiệp-vụ/`
- Đặc tả chức năng + AC: `tài-liệu/chức-năng/FEATURE-xxx.md`
- Kiến trúc, stack, dữ liệu, SP, API, realtime: `tài-liệu/kiến-trúc/`
- UI: `tài-liệu/giao-diện/screens-flows.md`
- Kiểm thử, DoD: `tài-liệu/chất-lượng/test-strategy.md`
- Lệnh chạy đã xác minh: `tài-liệu/vận-hành/local-development.md` (lệnh ghi CHƯA XÁC MINH thì chưa được dùng như lệnh đã chạy)
- Quy trình 15 bước (bản đồ bước → tài liệu, Gate G1–G4): `tài-liệu/quy-trình-15-bước.md`; ID: ACT / AF / US / AC / BR / UC / MOD / SCR / TC — quy ước ở `tài-liệu/công-việc/TASK-057.md`
- Câu hỏi chưa chốt: `tài-liệu/open-questions.md` · Quyết định: `tài-liệu/quyết-định/` (ADR-000: chỉ tiền mặt — D-1/D-2/D-3)
- Task và kế hoạch: `tài-liệu/công-việc/README.md` · Plan: `tài-liệu/kế-hoạch/README.md` · Prompt giao việc: `tài-liệu/vận-hành/agent-prompts.md`
- Nguồn gốc yêu cầu (chỉ đọc khi đối chiếu): `tài-liệu/source-map.md`, `tài-liệu/nguồn/`
- Skills: `.agent/skills/` (nguồn) → đồng bộ sang `.claude/skills/` bằng `bash kịch-bản/sync-skills.sh`
  (Codex: `.agents/skills`, Cursor: `.cursor/skills` — truyền làm tham số). Không sửa tay bản đồng bộ.

## Đọc theo loại việc
- API/backend: feature → business-rules + roles-permissions → api-contract → system-overview (tầng) → data-model nếu chạm DB.
- Database/SP: feature + rule → data-model → skill `change-database`.
- Frontend: feature → screens-flows → api-contract + realtime-events → roles-permissions (ẩn/hiện UI).
- Realtime: realtime-events → feature liên quan.
- Thanh toán tiền mặt / gọi thanh toán: FEATURE-005/006 → workflows-states (phiên) → api-contract (`request-payment`, `settle`) → data-model (`sp_SettleSession`).

## Thực hiện
- Khảo sát nguồn/tests thật trước khi sửa; không đoán tên file.
- Thay đổi chạm DB, quyền, contract API/realtime hoặc ≥ 2 module → viết `tài-liệu/kế-hoạch/TASK-xxx-plan.md` trước.
- Dùng skill khi trigger khớp: `implement-feature`, `change-database`, `verify-change`, `extend-features` (chức năng giai đoạn 2 — hội viên, combo, khuyến mãi, ca…, ADR-005); `advanced-features` (giai đoạn 4–8 — chia bill, kho nâng cao, trưởng ca, sổ quỹ, CRM, phân tích…, ADR-006); `do-an-cafe-reviewer` khi đã có trong repo
  (hiện chưa có — xem `tài-liệu/vận-hành/local-development.md` mục Skills).
- Mọi đổi trạng thái đơn + kho đi qua SP trong `cơ-sở-dữ-liệu/thủ-tục/`; không "SELECT rồi UPDATE" ngoài transaction.
- Phát realtime sau commit. Kiểm quyền ở server cho mọi endpoint.
- Đồng bộ docs bị ảnh hưởng (api-contract, data-model, feature) trong cùng task.

## Lệnh kiểm chứng (đã xác minh — chi tiết `tài-liệu/vận-hành/local-development.md`)
`npm run lint` · `npm run format:check` · `npm test` (SQL Server thật, DB `CafeQrTest`) · `npm run test:e2e` (Chromium, gồm kiểm tra
khả năng tiếp cận) · `npm run load` · `npm run trace` (ma trận truy vết từ kết quả chạy thật; `-- --check` để chặn khi thiếu bằng chứng).

## Git
- Mỗi task một nhánh `task/TASK-xxx-<mô-tả>` tách từ `main`; commit ghi Task ID ở đầu (`feat(TASK-xxx): …`, `fix(TASK-xxx): …`,
  `docs(TASK-xxx): …`) kèm FEATURE / AC liên quan. Không commit `.env`, dữ liệu thật, kết quả chạy (`kiểm-thử/kết-quả/`).
- Gộp vào `main` chỉ sau khi: lint + format + test liên quan PASS, có review độc lập (agent review hoặc người), cập nhật docs.
- Không `push`, không đổi lịch sử đã gộp, không xóa nhánh của người khác nếu chưa được duyệt.

## Bàn giao
Theo mẫu `tài-liệu/chất-lượng/test-strategy.md#ban-giao`: thay đổi, AC đạt/chưa, checks thực chạy
(lệnh + kết quả), NOT_RUN + lý do, docs cập nhật, blocker/Q mới, trạng thái đề xuất.
