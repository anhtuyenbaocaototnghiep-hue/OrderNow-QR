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
| [TASK-023](TASK-023.md) | Hội viên SĐT + họ tên (tra cứu, đăng ký, chiết khấu khi thu tiền, quản lý, ẩn danh) | FEATURE-014 | — | Agent | — | extend-features | READY_FOR_REVIEW |
| [TASK-024](TASK-024.md) | Gợi ý / bán chạy / ghim trên menu khách | FEATURE-017 | TASK-023 (Settings) | Agent | — | extend-features | READY_FOR_REVIEW |
| [TASK-025](TASK-025.md) | Combo cố định + bộ tính giá dùng chung `pricing` | FEATURE-015 | TASK-023 | Agent | — | extend-features | READY_FOR_REVIEW |
| [TASK-026](TASK-026.md) | Khuyến mãi theo lịch (giá đặc biệt, theo đơn, lượt/ngày) | FEATURE-016 | TASK-025 | Agent | — | extend-features | READY_FOR_REVIEW |
| [TASK-027](TASK-027.md) | Quản lý "Marketing & Khách hàng" + báo cáo marketing | FEATURE-014…017 | TASK-023…026 | Agent | — | extend-features | READY_FOR_REVIEW |
| [TASK-028](TASK-028.md) | Tùy chọn món (size, topping) có phụ thu + BOM cộng thêm | FEATURE-013 | TASK-025 | Agent | — | extend-features | READY_FOR_REVIEW |
| [TASK-029](TASK-029.md) | Chốt ca tiền mặt (mở/đóng ca, phiếu chốt ca) | FEATURE-018 | — | Agent | — | extend-features | READY_FOR_REVIEW |
| [TASK-030](TASK-030.md) | Giảm giá tay trên bill có ngưỡng + quản lý duyệt | FEATURE-022 | TASK-023, TASK-029 | Agent | — | extend-features | READY_FOR_REVIEW |
| [TASK-031](TASK-031.md) | Tự hết món + công tắc nhận đơn QR + giờ bán theo danh mục | FEATURE-020 | — | Agent | — | extend-features | READY_FOR_REVIEW |
| [TASK-032](TASK-032.md) | Khách gọi nhân viên | FEATURE-021 | — | Agent | — | extend-features | READY_FOR_REVIEW |
| [TASK-033](TASK-033.md) | Hoàn tiền sau thu + nhập kho & kiểm kê + giá vốn | FEATURE-019, FEATURE-023 | TASK-029 | Agent | — | extend-features | READY_FOR_REVIEW |
| [TASK-034](TASK-034.md) | Gọi món tại bàn (nhân viên nhập giúp) + ghi chú bàn | FEATURE-024 | TASK-023…033 | Agent | — | yêu cầu chủ dự án 16/10 | READY_FOR_REVIEW |
| [TASK-035](TASK-035.md) | Gọi lại đơn lần trước & món yêu thích | FEATURE-045 (skill F-024) | TASK-016, TASK-023, TASK-025, TASK-028 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-036](TASK-036.md) | Thực đơn theo mùa / khung giờ tự động | FEATURE-040 | TASK-031, TASK-035 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-037](TASK-037.md) | Thời gian chờ ước tính + bộ lập lịch job nền | FEATURE-025 | TASK-012, TASK-013, TASK-036 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-038](TASK-038.md) | Chia bill theo người trong phiên gộp | FEATURE-026 | TASK-015, TASK-023, TASK-025, TASK-030, TASK-033 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-039](TASK-039.md) | Đổi đơn vị & giá vốn bình quân / FIFO | FEATURE-031 | TASK-013, TASK-033 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-040](TASK-040.md) | Bán thành phẩm / BOM 2 cấp / phiếu sơ chế | FEATURE-027 | TASK-007, TASK-039 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-041](TASK-041.md) | Hao hụt định mức & phiếu hủy hàng | FEATURE-032 | TASK-033, TASK-039, TASK-040 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-042](TASK-042.md) | Lô & hạn sử dụng (FEFO) | FEATURE-028 | TASK-037, TASK-039, TASK-040, TASK-041 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-043](TASK-043.md) | Nhà cung cấp & đơn đặt hàng (PO) | FEATURE-030 | TASK-039, TASK-042 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-044](TASK-044.md) | Dự báo nhập hàng | FEATURE-029 | TASK-037, TASK-041, TASK-043 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-045](TASK-045.md) | Vai Trưởng ca (MANAGER) và ma trận quyền | FEATURE-036 | TASK-017, TASK-030, TASK-033 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-046](TASK-046.md) | Sổ quỹ (thu / chi tiền mặt ngoài bán hàng) | FEATURE-033 | TASK-029, TASK-045 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-047](TASK-047.md) | Chấm công, lịch làm, năng suất, nhật ký thao tác | FEATURE-035 | TASK-037, TASK-045, TASK-046 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-048](TASK-048.md) | Lãi / lỗ đơn giản & điểm hòa vốn | FEATURE-034 | TASK-033, TASK-039, TASK-046 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-049](TASK-049.md) | Tích điểm đổi quà & tem | FEATURE-039 | TASK-023, TASK-033, TASK-038 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-050](TASK-050.md) | Giới thiệu bạn & voucher | FEATURE-038 | TASK-023, TASK-049 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-051](TASK-051.md) | Chiến dịch theo phân khúc | FEATURE-037 | TASK-037, TASK-047, TASK-050 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-052](TASK-052.md) | Menu engineering | FEATURE-041 | TASK-024, TASK-026, TASK-039 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-053](TASK-053.md) | Giờ cao điểm, dự báo doanh thu, so sánh kỳ, doanh thu theo bàn | FEATURE-042 | TASK-044, TASK-048, TASK-052 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-054](TASK-054.md) | Dashboard chủ quán ("Hôm nay") | FEATURE-043 | TASK-037, TASK-042, TASK-043, TASK-045, TASK-046, TASK-048 | Agent | — | advanced-features | READY_FOR_REVIEW |
| [TASK-055](TASK-055.md) | Sửa / xóa món đã gọi, xóa đơn, hủy lượt phục vụ bàn | FEATURE-046 (ADR-007) | TASK-013, TASK-033, TASK-038, TASK-039, TASK-041, TASK-042, TASK-045, TASK-047 | Agent | — | yêu cầu chủ dự án 18/10 | READY_FOR_REVIEW |
| [TASK-056](TASK-056.md) | Hội viên khi gọi món tại bàn, Thẻ thành viên, quyền lợi trên bill | FEATURE-047 (ADR-008) | TASK-023, TASK-034, TASK-049, TASK-050, TASK-051 | Agent | — | yêu cầu chủ dự án 18/10 | READY_FOR_REVIEW |

**Cập nhật 14/10/2026:** chủ dự án yêu cầu triển khai hoàn chỉnh không theo tiến độ 8 tuần → TASK-002…017 và 019 đã làm xong (READY_FOR_REVIEW, có bằng chứng ở `tài-liệu/chất-lượng/test-strategy.md`). Báo cáo bàn giao: [`tài-liệu/chất-lượng/handover-2026-10-14.md`](../chất-lượng/handover-2026-10-14.md). So với bảng ở tài liệu nguồn, có hai chỗ thay đổi: TASK-004 phụ thuộc thêm **Q-013** (mới phát hiện), và TASK-018 ghi rõ phụ thuộc **Q-008** (trước đây chỉ nhắc trong Q-008).

**Cập nhật 16/10/2026:** chủ dự án giao skill `extend-features` → TASK-023…033 (FEATURE-013…023, ADR-005) đã làm theo thứ tự giai đoạn 1 → 2 → 3 của skill, mỗi feature một migration; bàn giao: [`handover-2026-10-16.md`](../chất-lượng/handover-2026-10-16.md).

**Cập nhật 18/10/2026:** chủ dự án giao skill `advanced-features` (17/10/2026) → TASK-035…054 (20 feature, ADR-006, migration `0015`…`0032`) đã làm theo thứ tự giai đoạn 4 → 8 của [plan](../kế-hoạch/TASK-035-054-plan.md); mã skill F-024 "Gọi lại đơn / yêu thích" đổi thành **FEATURE-045** (FEATURE-024 đã là "Gọi món tại bàn"). Bằng chứng 18/10/2026: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS. Hướng dẫn cho quán: [`chức-năng-mới/`](../../chức-năng-mới/README.md) mục 14…24. Lệch ma trận quyền skill ↔ docs ghi ở Q-022.

**Cập nhật 18/10/2026 (sau giai đoạn 4–8):** chủ dự án yêu cầu sửa / xóa món và "xóa bàn" ở drawer Thu tiền → [ADR-007](../quyết-định/ADR-007-sua-xoa-mon-huy-ban.md) (D-33…D-35) → TASK-055 (FEATURE-046, migration `0033`). Bằng chứng: `npm test` 229/229, `npm run test:e2e` 28/28, `npm run load` 10/10, lint + prettier PASS; bàn giao ở [`handover-2026-10-18.md`](../chất-lượng/handover-2026-10-18.md) mục "Bổ sung F-046". Hướng dẫn cho quán: mục 25 trong `chức-năng-mới/`. Phát hiện ngoài phạm vi (E2E chia bill không ổn định) ghi ở Q-023.

**Cập nhật 18/10/2026 (sau F-046):** chủ dự án yêu cầu gắn SĐT hội viên ở Gọi món tại bàn và cho hội viên thấy điểm / voucher / chiến dịch → [ADR-008](../quyết-định/ADR-008-hoi-vien-tai-ban-the-thanh-vien.md) (D-36…D-38) → TASK-056 (FEATURE-047, không migration). Bằng chứng: `npm test` 234/234, `npm run test:e2e` 29/29, lint + prettier PASS (`npm run load` không chạy lại — không đổi luồng gửi đơn / thu tiền); bàn giao ở [`handover-2026-10-18.md`](../chất-lượng/handover-2026-10-18.md) mục "Bổ sung F-047". Hướng dẫn cho quán: mục 26 trong `chức-năng-mới/`.

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
