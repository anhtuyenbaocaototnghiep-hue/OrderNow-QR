# Áp dụng quy trình 15 bước (Playbook AI Agent Web/App v1.0)

> Nguồn: `So_tay_quy_trinh_AI_Agent_Web_App_15_buoc.pdf` (09/10/2026). Đối chiếu và hoàn thiện ngày 20/10/2026 — [TASK-057](công-việc/TASK-057.md) (hồ sơ bước 01–14), [TASK-058](công-việc/TASK-058.md) (sửa lỗi còn tồn). Chủ dự án yêu cầu làm **bước 01–14**; **bước 15** làm ngày 23/10/2026 — [TASK-070](công-việc/TASK-070.md), [ADR-016](quyết-định/ADR-016-trien-khai-van-hanh.md) (tài liệu + công cụ đã thử trên máy dev; cài máy quán thật và ký G5 chờ chủ dự án).
>
> "Đạt" = đầu ra bắt buộc của bước đã có trong repo, có ID ổn định và bằng chứng; **duyệt Gate** là việc của chủ dự án ([quality-gates.md](chất-lượng/quality-gates.md)).

## Quy ước ID

ACT (Actor) · AF (chức năng theo Actor) · US · AC · BR · UC · MOD · SCR (= mã S-xx cũ) · API (`METHOD /đường-dẫn`) · TC (`TC-xxx-yy` chứng minh `AC-xxx-yy`) · TASK · DEF (lỗi) · Gate G1–G5. Chi tiết: TASK-057.

## Bước → đầu ra → tài liệu

| Bước | Đầu ra bắt buộc (sổ tay) | Ở đâu trong repo | Trạng thái |
| --- | --- | --- | --- |
| 01 Idea / Problem | Project Brief, mục tiêu, nhóm người dùng, MVP, ngoài phạm vi, giả định, rủi ro | [project-brief.md](sản-phẩm/project-brief.md), [overview.md](sản-phẩm/overview.md) | Đạt — chờ ký G1 |
| 02 Actor | Actor Register (ID, mô tả, mục tiêu, quyền, liên hệ) | [actors.md](nghiệp-vụ/actors.md) §Actor Register | Đạt |
| 03 Actor Functions | Actor Function Matrix (Actor → hành động → dữ liệu → quyền → ưu tiên) | [actors.md](nghiệp-vụ/actors.md) §AF (127 AF) | Đạt |
| 04 User Story | Backlog có ID, Actor, mục tiêu, lý do, ưu tiên, ràng buộc / giả định | [user-stories.md](nghiệp-vụ/user-stories.md) (144 US) | Đạt |
| 05 AC & BR | AC kiểm thử được; BR có ID, phạm vi, ngoại lệ | `chức-năng/FEATURE-*.md` (375 AC), [business-rules.md](nghiệp-vụ/business-rules.md) (BR-001…099), kiểm tra AC mơ hồ ở user-stories §4 | Đạt — 9 BR PROPOSED chờ G1 |
| 06 Use Case & User Flow | Use Case Spec + User Flow + trạng thái | [use-cases.md](nghiệp-vụ/use-cases.md) (UC-01…19), [workflows-states.md](nghiệp-vụ/workflows-states.md) | Đạt — **Gate G1** |
| 07 Modules | Module Map, Module Spec, Permission Matrix, Story → Module | [module-map.md](kiến-trúc/module-map.md), [roles-permissions.md](nghiệp-vụ/roles-permissions.md) | Đạt |
| 08 NFR | Security, Performance, Availability, Privacy, Accessibility, Maintainability, Compatibility — có cách đo + ngưỡng | [nfr.md](sản-phẩm/nfr.md) (60 NFR) | Đạt — 28 ngưỡng PROPOSED chờ G2 / G5 |
| 09 UI / UX | Sitemap, Screen Inventory (SCR), wireframe / ảnh chuẩn, Design System, UI states & responsive | [sitemap.md](giao-diện/sitemap.md) (+ 39 ảnh chuẩn), [screens-flows.md](giao-diện/screens-flows.md), [design-system.md](giao-diện/design-system.md) | Đạt |
| 10 System Design | ADR, sơ đồ kiến trúc, ERD, API Contract, Data Dictionary, Security Model | `quyết-định/ADR-000…019`, [system-overview.md](kiến-trúc/system-overview.md), [data-model.md](kiến-trúc/data-model.md), [api-contract.md](kiến-trúc/api-contract.md), [realtime-events.md](kiến-trúc/realtime-events.md), [security-model.md](kiến-trúc/security-model.md) | Đạt — **Gate G2** |
| 11 Agent Rules | AGENTS.md (nguồn chuẩn + thứ tự ưu tiên, kiến trúc, lệnh, tìm theo Task ID, cấm secret / PII, việc phải xin duyệt, mẫu bàn giao) | [AGENTS.md](../AGENTS.md), [.agent/rules.md](../.agent/rules.md), skills `.agent/skills/` | Đạt |
| 12 Implementation Plan | Task Packet, dependency map, quy tắc branch, owner / reviewer | `công-việc/TASK-001…078` (Mẫu 07), [công-việc/README.md](công-việc/README.md), `kế-hoạch/`, AGENTS.md §Git | Đạt |
| 13 Development | Lát cắt UI + API + nghiệp vụ + dữ liệu + test; commit / PR gắn Task ID; log thay đổi; migration có phương án khôi phục | Git (`v1.0-baseline`, `fix(TASK-058)`, `…(TASK-057)`), bàn giao `chất-lượng/handover-*.md`, migration cộng dồn có `IF NOT EXISTS` | Đạt — **Gate G3** |
| 14 Testing & Acceptance | Test Plan, CI results, Security / Accessibility Check, UAT evidence, Defect Log, DoD | [test-strategy.md](chất-lượng/test-strategy.md), [traceability.md](chất-lượng/traceability.md), [tc-map.md](chất-lượng/tc-map.md), [security-check.md](chất-lượng/security-check.md), `kiểm-thử/e2e/a11y.spec.js`, [defect-log.md](chất-lượng/defect-log.md), [dod.md](chất-lượng/dod.md), [uat-plan.md](chất-lượng/uat-plan.md) | Đạt phần máy làm được — **UAT chờ người thật**, **Gate G4** |
| 15 Deployment & Operations | Release Plan, Deployment Checklist, Secrets Register, Backup, Monitoring, Incident | [release-plan.md](vận-hành/release-plan.md), [deployment-checklist.md](vận-hành/deployment-checklist.md), [secrets-register.md](vận-hành/secrets-register.md), [backup-restore.md](vận-hành/backup-restore.md), [monitoring.md](vận-hành/monitoring.md), [incident-runbook.md](vận-hành/incident-runbook.md); công cụ `npm run db:backup` / `db:restore` / `ops:health` (diễn tập khôi phục trên máy dev ĐẠT) | Đạt phần tài liệu + công cụ — **cài máy quán thật, diễn tập trên máy đó, Gate G5** chờ chủ dự án |

## Bảng kiểm cuối (sổ tay trang 16)

| Nhóm kiểm soát | Bằng chứng | Đánh dấu |
| --- | --- | --- |
| Yêu cầu — MVP, Actor, Story, AC, BR, Use Case đã được duyệt | Có đủ tài liệu; **chờ chủ dự án ký G1** | [x] tài liệu · [ ] duyệt |
| Ranh giới — Module ownership, quyền, UI Spec, ERD, API Contract | module-map, roles-permissions, sitemap / screens-flows, data-model, api-contract | [x] tài liệu · [ ] duyệt G2 |
| Tài liệu AI — AGENTS.md, Task Packet, chuẩn review, danh mục lệnh test | AGENTS.md, `.agent/rules.md`, TASK-xxx, DoD | [x] |
| An toàn — giới hạn quyền Agent, không lộ secret / dữ liệu thật | `.agent/rules.md` (việc phải xin duyệt, cấm PII), `.gitignore`, security-check | [x] |
| Nghiệm thu — Traceability, TC, DoD, người duyệt & bằng chứng đạt | traceability (375 / 375 AC PASS), tc-map, dod, defect-log; **UAT + ký G4 chờ người thật** | [x] máy · [ ] UAT / duyệt |
| Triển khai — Release, backup / restore, rollback, monitoring, người trực | release-plan (phát hành + quay lui), backup-restore (diễn tập máy dev ĐẠT), monitoring, incident-runbook (người trực chờ điền), secrets-register | [x] tài liệu + công cụ · [ ] cài máy quán / ký G5 |

**Người xác nhận:** …………………… **Ngày:** …………………… **Phiên bản tài liệu:** quy trình áp dụng lần 1 (20/10/2026)
