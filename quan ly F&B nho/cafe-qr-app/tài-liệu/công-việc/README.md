# Danh sách task và kế hoạch 8 tuần

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §18 và §20 (bản 1.2, 14/10/2026). Trạng thái task cập nhật ngày 13/10/2026.

**Trạng thái task:** `TODO` (sẵn sàng khi xong phụ thuộc) · `BLOCKED` (chờ task hoặc Q) · `IN_PROGRESS` · `READY_FOR_REVIEW` · `DONE` (có bằng chứng theo DoD) · `BACKLOG` (làm sau).

## Nguyên tắc chia task

- Mỗi task là một **kết quả nghiệm thu được** (có AC), không phải "làm xong backend".
- Thứ tự theo **dependency thật**: chạy được → DB + SP (vì SP là lõi) → auth → dữ liệu nền (menu/bàn/nguyên liệu/BOM) → luồng khách → luồng quầy → thanh toán → admin còn lại → deploy → test ép tải.
- Ba người làm song song theo cột "Owner"; agent được giao task theo cùng ID (prompt ở `tài-liệu/vận-hành/agent-prompts.md`).
- **Tuần 7–8 chỉ kiểm thử, sửa lỗi, tài liệu đồ án** (Word mục IV.3).

## Bảng task

| ID | Task | Feature / AC | Phụ thuộc | Owner | Tuần | Skill | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [TASK-000](TASK-000.md) | Ghi ADR-000…003 (D-1…D-4 + phương án đề xuất cho các Q) | — | — | Cả nhóm | 1 | — | DONE |
| [TASK-001](TASK-001.md) | Khung FE HTML/CSS/JS, lint, CI, SQL Server dev, `.env.example`, kiểm thiết lập agent | — | — | Tuyến + Nhật Anh | 1 | — | DONE |
| [TASK-002](TASK-002.md) | Backend Node.js + Express (D-4), health, map lỗi, Socket.io | — | TASK-001 | Nhật Anh | 1 | — | READY_FOR_REVIEW |
| [TASK-003](TASK-003.md) | Migration `0001_init`, migrate/seed | — | TASK-002, Q-001 | Nhật Anh | 1–2 | change-database | READY_FOR_REVIEW |
| [TASK-004](TASK-004.md) | `sp_SubmitOrder`, `sp_CompleteOrder`, `sp_CancelOrder` + test đồng thời | F-003 AC-04, F-007 AC-03/04, BR-001/002 | TASK-003, Q-013 | Nhật Anh (+ Sáng) | 2 | change-database | READY_FOR_REVIEW |
| [TASK-005](TASK-005.md) | Auth: login, JWT, guard, cookie khách | F-009 AC-01/03/04 | TASK-002 | Nhật Anh | 2 | implement-feature | READY_FOR_REVIEW |
| [TASK-006](TASK-006.md) | Admin menu/danh mục/bàn/QR | F-010 | TASK-003, TASK-005 | Nhật Anh + Tuyến | 2–3 | implement-feature | READY_FOR_REVIEW |
| [TASK-007](TASK-007.md) | Admin nguyên liệu/BOM/kho | F-011 | TASK-003, TASK-005 | Nhật Anh + Tuyến | 3 | implement-feature | READY_FOR_REVIEW |
| [TASK-008](TASK-008.md) | Khách quét QR, tách/gộp phiên | F-001 | TASK-003 | Nhật Anh + Tuyến | 3 | implement-feature | READY_FOR_REVIEW |
| [TASK-009](TASK-009.md) | Khách menu + giỏ | F-002 | TASK-006 | Tuyến | 3 | implement-feature | READY_FOR_REVIEW |
| [TASK-010](TASK-010.md) | Khách gửi đơn (`sp_SubmitOrder`) | F-003 | TASK-004, TASK-008, TASK-009 | Nhật Anh + Tuyến | 3–4 | implement-feature | READY_FOR_REVIEW |
| [TASK-011](TASK-011.md) | Hạ tầng realtime | realtime-events | TASK-005, TASK-010 | Nhật Anh + Tuyến | 4 | implement-feature | READY_FOR_REVIEW |
| [TASK-012](TASK-012.md) | Dashboard quầy, Tiếp nhận, Hủy | F-007 AC-01/02/05/07, Q-010 | TASK-011 | Tuyến + Nhật Anh | 4 | implement-feature | READY_FOR_REVIEW |
| [TASK-013](TASK-013.md) | Hoàn tất & trừ kho | F-007 AC-03/04 | TASK-004, TASK-012 | Nhật Anh + Tuyến | 4–5 | implement-feature | READY_FOR_REVIEW |
| [TASK-014](TASK-014.md) | Khách theo dõi đơn (S-05) | F-004 | TASK-011 | Tuyến | 5 | implement-feature | READY_FOR_REVIEW |
| [TASK-015](TASK-015.md) | Gọi thanh toán + thu tiền tại bàn + in bill + đóng bàn trống | F-005, F-006 | TASK-010, TASK-011, TASK-012 | Nhật Anh + Tuyến | 5 | implement-feature, change-database | READY_FOR_REVIEW |
| [TASK-016](TASK-016.md) | Mục Bán mang đi (S-13) | F-008 | TASK-010, TASK-013, TASK-015 | Tuyến + Nhật Anh | 5–6 | implement-feature | READY_FOR_REVIEW |
| [TASK-017](TASK-017.md) | Admin tài khoản (UI) + báo cáo | F-009 AC-02/05, F-012 | TASK-005, TASK-013 | Nhật Anh + Tuyến | 6 | implement-feature | READY_FOR_REVIEW |
| [TASK-018](TASK-018.md) | Deploy staging | — | TASK-015, Q-008 | Nhật Anh | 6 | — | BLOCKED (Q-008) |
| [TASK-019](TASK-019.md) | E2E + k6 + đo NFR-001 | NFR-001/002 | TASK-016, TASK-018 | Sáng | 6–7 | verify-change | READY_FOR_REVIEW |
| [TASK-020](TASK-020.md) | Chạy thử tại quán | — | TASK-019 | Cả nhóm | 7 | verify-change | TODO |
| [TASK-021](TASK-021.md) | Tài liệu đồ án xuất từ `tài-liệu/` | — | TASK-019 | Sáng + cả nhóm | 7–8 | — | TODO |
| [TASK-022](TASK-022.md) | Làm sau: cron, ảnh, ngăn kéo, VietQR, KDS… | REQ-020/021/022 | TASK-020 | — | 8+ | — | BACKLOG |

**Cập nhật 14/10/2026:** chủ dự án yêu cầu triển khai hoàn chỉnh không theo tiến độ 8 tuần → TASK-002…017 và 019 đã làm xong (READY_FOR_REVIEW, có bằng chứng ở `tài-liệu/chất-lượng/test-strategy.md`). Báo cáo bàn giao: [`tài-liệu/chất-lượng/handover-2026-10-14.md`](../chất-lượng/handover-2026-10-14.md). So với bảng ở tài liệu nguồn, có hai chỗ thay đổi: TASK-004 phụ thuộc thêm **Q-013** (mới phát hiện), và TASK-018 ghi rõ phụ thuộc **Q-008** (trước đây chỉ nhắc trong Q-008).

## Lịch 8 tuần theo người

| Tuần | Tuyến (FE) | Nhật Anh (BE/DB) | Sáng (Test) |
| --- | --- | --- | --- |
| 1 | TASK-001 (Next.js, CI, cấu trúc `/t` `/pos` `/admin`), wireframe S-01…S-05 | TASK-000 dẫn chốt Q; TASK-002, bắt đầu TASK-003 | Đọc docs, viết test plan từ test-strategy, chuẩn bị SQL Server + k6 |
| 2 | TASK-006 UI (menu/bàn/QR), layout admin | TASK-003, TASK-004 (SP + test), TASK-005 | Viết integration test cho SP cùng Nhật Anh; ma trận quyền |
| 3 | TASK-008/009 UI khách (S-01/02/03), TASK-007 UI kho/BOM | TASK-006/007 API, TASK-008 API, bắt đầu TASK-010 | Test API admin, test validation BOM (AC-011-02) |
| 4 | TASK-012 dashboard quầy UI | TASK-010 hoàn tất, TASK-011 realtime, TASK-012 API | Test gửi đơn + OUT_OF_STOCK; test reconnect |
| 5 | TASK-014 theo dõi đơn + Gọi thanh toán (khách), TASK-015 dải Gọi thanh toán + drawer Thu tiền + trang in | TASK-013 SP wiring, TASK-015 `request-payment`, `sp_SettleSession`, receipt API | Test settle (đồng thời/còn PENDING/tiền thiếu); đo NFR-001 trên dev |
| 6 | TASK-016 take-away, TASK-017 UI báo cáo/tài khoản | TASK-017 API, TASK-018 deploy staging | TASK-019 bắt đầu: E2E + k6 trên staging |
| 7 | Sửa lỗi từ test; in thử máy thật (TASK-020) | Sửa lỗi; tối ưu SP nếu k6 lộ vấn đề | TASK-019 hoàn tất; TASK-020; báo cáo test |
| 8 | TASK-021 (phần UI/UX) | TASK-021 (sơ đồ CSDL, kiến trúc) | TASK-021 (đặc tả, kết quả test); buffer |

**Cột mốc nghiệm thu nội bộ:** **cuối tuần 2**: `sp_SubmitOrder`/`sp_CompleteOrder` pass concurrency test. **Cuối tuần 4**: khách gửi đơn → quầy thấy realtime → tiếp nhận → hoàn tất trừ kho. **Cuối tuần 6**: luồng đầy đủ (gọi thanh toán → thu tiền → in bill; bán mang đi) chạy trên staging. **Cuối tuần 7**: chạy tại quán.

## Checklist

### Trước khi giao agent task đầu tiên (cập nhật 14/10/2026)

- [x] Q-001, Q-002, Q-004b, Q-005, Q-006 đã có ADR (ADR-001…003); D-1…D-4 ghi ở ADR-000/ADR-002.
- [x] Q-013 có quyết định trước TASK-004 (ADR-003: khóa `Sessions` trong SP, cho gọi thêm).
- [x] `tài-liệu/` đã tách và cập nhật trạng thái theo ADR.
- [x] FEATURE-003 và FEATURE-007 không còn "chặn bởi".
- [x] Data model + SP khớp phương án Q-001 = A; api-contract khớp mã lỗi SP (bảng ở data-model).
- [x] `AGENTS.md` link đúng file có thật; Claude Code liệt kê được 3 skill; đã chạy task thật theo skill.
- [ ] SQL Server dev + migrate + seed chạy được trên **máy ít nhất 2 người** — mới xác minh trên 1 máy (Windows, SQL Server 2019 cài sẵn).
- [x] Q-004b và "gọi thêm món sau khi đã gọi thanh toán" đã thống nhất (ADR-003).
- [ ] Sáng có test plan + k6 — đã có `npm run load` thay k6; test plan nằm trong `tài-liệu/chất-lượng/test-strategy.md`.

### Mỗi task

- [ ] Task có mục tiêu, scope, dependency, AC IDs, validation.
- [ ] Agent đọc đúng context (không load toàn bộ).
- [ ] Có plan cho thay đổi rủi ro (`tài-liệu/kế-hoạch/`).
- [ ] Báo cáo bàn giao có PASS/FAIL/NOT_RUN thật.
- [ ] Reviewer (người, hoặc `do-an-cafe-reviewer` khi đã có trong repo) kiểm diff theo kiến trúc, không chỉ nhìn tên thư mục.

### Cột mốc

- [x] Tuần 2: concurrency test SP pass trên SQL Server thật (đạt 14/10/2026).
- [x] Tuần 4: luồng QR → quầy → hoàn tất → kho giảm (E2E 14/10/2026).
- [ ] Tuần 6: **staging online** chạy đầy đủ luồng — luồng đầy đủ đã chạy local (E2E); staging chờ Q-008. NFR-001 đo được trên máy local (p95 165 ms).
- [ ] Tuần 7: chạy tại quán với máy in thật.
- [ ] Tuần 8: tài liệu đồ án xuất từ `tài-liệu/` — báo cáo test NFR-002 = 100 % đã có (`npm run load`).
