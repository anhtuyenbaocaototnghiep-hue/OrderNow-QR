# Hồ sơ duyệt Quality Gates G1–G5

> Sổ tay 15 bước — "5 điểm phê duyệt". Lập 20/10/2026 trong [TASK-057](../công-việc/TASK-057.md). **Agent không tự duyệt Gate** (`.agent/rules.md`): agent chuẩn bị bằng chứng và tự kiểm, **chủ dự án** đọc, quyết các điểm "Cần chủ dự án quyết", rồi ký. G5 (phát hành) thuộc bước 15 — **ngoài phạm vi** đợt này (chủ dự án yêu cầu làm bước 01–14).
>
> Bản đồ bước → tài liệu: [quy-trình-15-bước.md](../quy-trình-15-bước.md). Số liệu kiểm thử luôn lấy từ lần chạy mới nhất trong [traceability.md](traceability.md).

## G1 — Nghiệp vụ (sau bước 01–06)

**Điều kiện (sổ tay):** Actor, Story, AC, BR, Use Case đầy đủ và nhất quán trong phạm vi MVP; điểm chưa quyết nằm trong Decision / Open Questions Log.

| Hạng mục | Bằng chứng | Agent tự kiểm |
| --- | --- | --- |
| Project Brief, phạm vi, ngoài phạm vi, mục tiêu đo được | [project-brief.md](../sản-phẩm/project-brief.md) (MT-1…MT-5), [overview.md](../sản-phẩm/overview.md) (đã ghi chú phạm vi đổi theo ADR-006) | Đạt |
| Actor Register + Actor Function Matrix | [actors.md](../nghiệp-vụ/actors.md) — 8 actor, 112 AF, mọi FEATURE có AF | Đạt |
| User Story backlog có ưu tiên | [user-stories.md](../nghiệp-vụ/user-stories.md) — 115 US (Must 34 / Should 80 / Could 1) | Đạt |
| AC kiểm thử được, BR có ID | 289 AC trong `chức-năng/FEATURE-*.md` (25 AC viết lại cho kiểm được, 73 AC bổ sung cho lỗi / quyền / biên); BR-001…073 trong [business-rules.md](../nghiệp-vụ/business-rules.md) | Đạt |
| Use Case + User Flow + ngoại lệ | [use-cases.md](../nghiệp-vụ/use-cases.md) — UC-01…UC-19 (luồng chính, thay thế, ngoại lệ có mã lỗi thật, User Flow theo SCR) | Đạt |
| Nhất quán | Mâu thuẫn cũ đã sửa (DEF-009: FEATURE-006/012/014/019, BR-007); [traceability.md](traceability.md): mọi Story có AC, mọi AC thuộc Story, mọi BR có Story | Đạt |
| Decision / Open Questions Log | [open-questions.md](../open-questions.md) (bảng tóm tắt đã cập nhật tới Q-023), ADR-000…008 | Đạt |

**Cần chủ dự án quyết khi duyệt G1:**
1. Q-000 — người chốt nghiệp vụ / kỹ thuật (đề xuất: chữ ký dưới đây là câu trả lời).
2. Xác nhận các phương án đang chạy theo đề xuất: Q-019 (ngưỡng giảm tay), Q-020 (hoàn tiền trong ngày), Q-021 (mặc định gọi món tại bàn), Q-022 (lệch ma trận D-24).
3. BR còn PROPOSED: BR-011, BR-012, BR-013, BR-015, BR-016, BR-017, BR-020, BR-031, BR-032 → CONFIRMED hay sửa.
4. Chưa quyết (không chặn): hoàn tiền có trả lại voucher không (Q-022 ý 6); F-040 quy tắc 5 chỉ chặn ở giao diện.
5. Tên người đại diện từng Actor cho UAT ([actors.md](../nghiệp-vụ/actors.md) — NEEDS_CONFIRMATION).

## G2 — Thiết kế (sau bước 07–10)

**Điều kiện:** Module ownership, Permission Matrix, UI screens, Architecture, ERD, API Contract và NFR quan trọng nhất quán. Thay đổi sau G2 cần đánh giá tác động.

| Hạng mục | Bằng chứng | Agent tự kiểm |
| --- | --- | --- |
| Module Map + spec + Story → Module | [module-map.md](../kiến-trúc/module-map.md) — 13 module MOD-*, mọi FEATURE có module chính | Đạt |
| Permission Matrix (thực thi ở server) | [roles-permissions.md](../nghiệp-vụ/roles-permissions.md) + ma trận Module × Actor trong module-map; test ma trận actor × endpoint PASS | Đạt |
| NFR có cách đo + ngưỡng | [nfr.md](../sản-phẩm/nfr.md) — 59 NFR / 7 nhóm (26 ngưỡng mới ở trạng thái PROPOSED) | Đạt (chờ duyệt ngưỡng) |
| Sitemap, Screen Inventory, Design System, UI states, ảnh chuẩn | [sitemap.md](../giao-diện/sitemap.md) (SCR-01…44 + 39 ảnh chuẩn), [screens-flows.md](../giao-diện/screens-flows.md) (mục UI states), [design-system.md](../giao-diện/design-system.md) | Đạt |
| Kiến trúc, ADR | [system-overview.md](../kiến-trúc/system-overview.md) §9.5 (sơ đồ), ADR-000…008 | Đạt |
| ERD, Data Dictionary | [data-model.md](../kiến-trúc/data-model.md) — ERD đủ 70 bảng (0001…0033) | Đạt |
| API Contract | [api-contract.md](../kiến-trúc/api-contract.md), [realtime-events.md](../kiến-trúc/realtime-events.md) | Đạt |
| Security Model | [security-model.md](../kiến-trúc/security-model.md) — 32 mối đe dọa đối chiếu OWASP ASVS (19 Đạt, 8 Một phần, 5 Gap) | Đạt (gap → G4) |

**Cần chủ dự án quyết khi duyệt G2:**
1. Duyệt 26 ngưỡng NFR PROPOSED (trong đó 9 NFR-A11Y mức WCAG 2.2 AA — đã có test tự động PASS).
2. Chấp nhận các chỗ code lệch quy tắc tầng (4 route gọi repository trực tiếp — ghi trong system-overview §9.5) hay mở task sửa.
3. MOD-ADMIN / MOD-NOTIFY / MOD-JOBS không "sở hữu" FEATURE riêng (module hạ tầng) — đồng ý.

## G3 — Code (bước 11–13)

**Điều kiện:** Có diff / PR, build / test đạt, không tự ý sửa phạm vi, có review.

| Hạng mục | Bằng chứng | Agent tự kiểm |
| --- | --- | --- |
| Quy tắc cho AI agent | [AGENTS.md](../../AGENTS.md) (thứ tự ưu tiên tài liệu, tìm theo Task ID, lệnh kiểm chứng, Git), [.agent/rules.md](../../.agent/rules.md) (việc phải xin duyệt, cấm secret / PII) | Đạt |
| Task Packet theo Mẫu 07 | `công-việc/TASK-001…058` (phạm vi sửa / không được sửa / cần hỏi duyệt / bàn giao) | Đạt |
| Diff gắn Task ID | Git: mốc `v1.0-baseline` (`a2d18a9`), `fix(TASK-058)` (`512c199`), `docs/test(TASK-057)`; mỗi task một nhánh `task/TASK-xxx-…` | Đạt (lịch sử trước 20/10 gom trong mốc gốc — repo chưa commit trước đó) |
| Build / lint / format / test | Xem [traceability.md](traceability.md) "Lần chạy làm bằng chứng" + [test-strategy.md](test-strategy.md) | Đạt |
| Review độc lập | Agent review riêng (chỉ đọc) trên diff từ `v1.0-baseline`: Request changes 4 điểm → đã sửa hết, chạy lại toàn bộ ([handover-2026-10-20.md](handover-2026-10-20.md) §4) | Đạt |
| Không tự sửa phạm vi | Không đổi BR / API / migration / dependency; thay đổi giao diện chỉ để sửa khả năng tiếp cận (DEF-006…008) | Đạt |

**Cần chủ dự án:** đọc diff (`git log v1.0-baseline..main`), xác nhận gộp. CI GitHub Actions chưa chạy vì repo chưa có remote — các bước của `.github/workflows/ci.yml` đã chạy tương đương trên máy local (NOT_RUN trên GitHub có lý do).

## G4 — Nghiệm thu (bước 14)

**Điều kiện:** Đủ bằng chứng đạt AC; kiểm thử luồng chính + ngoại lệ + phân quyền; không có lỗi nghiêm trọng bị che giấu.

| Hạng mục | Bằng chứng | Agent tự kiểm |
| --- | --- | --- |
| Test Plan | [test-strategy.md](test-strategy.md) | Đạt |
| Mọi AC có bằng chứng | [traceability.md](traceability.md) — 289 / 289 AC PASS ở lần chạy thật; 0 GAP; 0 bằng chứng hỏng | Đạt |
| Các lớp kiểm thử | Unit, Integration (SQL Server thật), E2E (Chromium), ép tải (NFR-002), bảo mật, khả năng tiếp cận | Đạt |
| Security Check | [security-check.md](security-check.md) — `npm audit` 0 lỗ hổng, ma trận quyền PASS; rủi ro SEC-R1…R10 chờ quyết | Đạt (chờ quyết rủi ro) |
| Accessibility Check | `kiểm-thử/e2e/a11y.spec.js` — 3 nhóm màn hình (khách / quầy / quản lý, 30+ trang) PASS theo tiêu chí WCAG 2.2 AA máy kiểm được | Đạt |
| Defect Log | [defect-log.md](defect-log.md) — 10 lỗi, đều ĐÃ SỬA, không lỗi Nghiêm trọng / Cao còn mở | Đạt |
| UAT | [uat-plan.md](uat-plan.md) — kịch bản UAT-01…23 + MAN-01…06 | **CHỜ NGƯỜI THẬT THỰC HIỆN** |
| DoD | [dod.md](dod.md) | Đạt trừ mục UAT |

**Cần chủ dự án / nhóm:** (1) thực hiện UAT trên điện thoại thật + máy in thật và ký biên bản trong uat-plan.md; (2) điền cột "Quyết định" cho SEC-R1…R10 (chấp nhận / mở task); (3) ký G4.

## G5 — Phát hành (bước 15)

**Điều kiện:** Có kế hoạch phát hành và quay lui, máy chạy thật đã cài theo checklist, sao lưu tự động chạy và khôi phục được, bí mật có nơi giữ, có giám sát và người trực. Lập 23/10/2026 trong [TASK-070](../công-việc/TASK-070.md) ([ADR-016](../quyết-định/ADR-016-trien-khai-van-hanh.md)).

| Hạng mục | Bằng chứng | Agent tự kiểm |
| --- | --- | --- |
| Release Plan + quay lui | [release-plan.md](../vận-hành/release-plan.md) | Đạt (tài liệu) |
| Deployment Checklist | [deployment-checklist.md](../vận-hành/deployment-checklist.md) — A (máy tại quán), B (VPS dự phòng) | Đạt (tài liệu); **chưa cài máy thật** |
| Secrets Register | [secrets-register.md](../vận-hành/secrets-register.md) — S-01…S-10 | Đạt (tài liệu); §3 nơi giữ **chờ chủ quán điền** |
| Backup / Restore | [backup-restore.md](../vận-hành/backup-restore.md); `npm run db:backup`, `npm run db:restore`; diễn tập trên máy dev 23/10/2026 ĐẠT | Đạt trên máy dev; **diễn tập trên máy quán chờ** |
| Monitoring | [monitoring.md](../vận-hành/monitoring.md); `npm run ops:health` thử trên máy dev (ổn / lỗi đúng) | Đạt (công cụ); lịch Task Scheduler chờ cài |
| Incident | [incident-runbook.md](../vận-hành/incident-runbook.md) — mức độ, người trực, S1…S11, bán bằng giấy | Đạt (tài liệu); **tên người trực chờ điền** |
| Test công cụ | `tests/ops.test.js` (tên file, quy tắc giữ bản, đánh giá kiểm tra) | Đạt |

**Cần chủ dự án / nhóm:** (1) chốt RPO ≤ 24 giờ / RTO ≤ 2 giờ (NFR-AVL-06) và nơi để bản sao lưu ngoài máy; (2) chọn ngày go-live, người kỹ thuật; (3) cài máy quán theo checklist A, chạy diễn tập khôi phục trên máy đó; (4) điền nơi giữ bí mật + người trực; (5) ký G5 — sau khi G1–G4 đã ký.

## Ký duyệt

| Gate | Kết luận (Duyệt / Duyệt có điều kiện / Chưa duyệt) | Điều kiện kèm theo | Người duyệt | Ngày |
| --- | --- | --- | --- | --- |
| G1 — Nghiệp vụ | | | | |
| G2 — Thiết kế | | | | |
| G3 — Code | | | | |
| G4 — Nghiệm thu | | | | |
| G5 — Phát hành | | | | |
