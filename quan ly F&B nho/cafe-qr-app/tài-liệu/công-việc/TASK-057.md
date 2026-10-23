# TASK-057 — Hoàn thiện hồ sơ theo quy trình 15 bước (bước 01–14)
Status: READY_FOR_REVIEW (20/10/2026) — hồ sơ Gate G1–G4 chờ chủ dự án ký; UAT chờ người thật
Nguồn: yêu cầu chủ dự án 20/10/2026 — "làm hoàn chỉnh (đạt) từ bước 1 tới bước 14" theo `So_tay_quy_trinh_AI_Agent_Web_App_15_buoc.pdf` (Playbook v1.0, 09/10/2026)
Module: toàn dự án (tài liệu + kiểm thử) · Agent: Claude (lead) + agent phụ viết tài liệu · Reviewer: agent review độc lập + chủ dự án (duyệt Gate)
Nhánh: `task/TASK-057-quy-trinh-15-buoc` (tách từ mốc `v1.0-baseline`)

## Mục tiêu
Mỗi bước 01–14 của sổ tay có đầu ra bắt buộc, có mã ID ổn định, truy vết được từ yêu cầu tới test; hồ sơ Gate G1–G4 sẵn sàng để chủ dự án duyệt. Bước 15 (triển khai) ngoài phạm vi theo yêu cầu.

## Đầu vào
Sổ tay 15 bước (mục A–H, Mẫu 01–10) · FEATURE-001…047 · BR-001…073 · ADR-000…008 · TASK-001…056 · test hiện có (`npm test` 234, E2E 29).

## Quy ước ID dùng chung (chốt trong task này)
- Actor: `ACT-GUEST`, `ACT-MEMBER`, `ACT-STAFF`, `ACT-LEAD`, `ACT-ADMIN`; hệ thống ngoài `EXT-ZALO`, `EXT-PRINTER`, `EXT-SCHEDULER`.
- Chức năng theo Actor: `AF-<ACTOR>-<nn>` (ví dụ `AF-GUEST-01`).
- User Story: `US-<FFF>-<n>` (FFF = số FEATURE; giữ nguyên US-046-*, US-047-* đã có).
- AC: `AC-<FFF>-<nn>` (giữ nguyên). Test case: `TC-<FFF>-<nn>` = (các) test chứng minh `AC-<FFF>-<nn>`.
- Use Case: `UC-01`…`UC-19`. Module: `MOD-AUTH`, `MOD-TABLE`, `MOD-MENU`, `MOD-ORDER`, `MOD-BILLING`, `MOD-INVENTORY`, `MOD-LOYALTY`, `MOD-MARKETING`, `MOD-SHIFT`, `MOD-REPORT`, `MOD-ADMIN`, `MOD-NOTIFY`, `MOD-JOBS`.
- Màn hình: `SCR-xx` = mã `S-xx` đã dùng trong `giao-diện/screens-flows.md` (không đổi số). API: định danh bằng `METHOD /đường-dẫn` (ổn định như operationId).
- Gate: `G1`…`G4`; lỗi: `DEF-<nnn>`.

## Phạm vi sửa
- Tài liệu mới / cập nhật dưới `tài-liệu/` (brief, actor, user story, use case, module map, NFR, sitemap, design system, security model, traceability, gate, defect log, UAT, DoD) và `AGENTS.md`.
- Script `kịch-bản/traceability.js` (sinh ma trận truy vết từ tài liệu + kết quả test thật).
- Test mới: `kiểm-thử/e2e/a11y.spec.js` (kiểm tra khả năng tiếp cận tự động, không thêm thư viện).
- Không đổi logic nghiệp vụ. Lỗi Q-023 sửa ở task riêng (TASK-058).
- Sửa lỗi khả năng tiếp cận do test a11y phát hiện (token màu CSS, nhãn ô nhập) — không đổi hành vi.
- Test tích hợp mới `ứng-dụng/máy-chủ/tests/acceptance.test.js` + test E2E bổ sung cho AC chưa có bằng chứng.

## Không được sửa
- Business rule, API contract, migration, dữ liệu `CafeQrDev`.
- Test hiện có chỉ để "xanh" (chỉ được thêm test).
- Không thêm dependency; không push ra ngoài.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `node kịch-bản/traceability.js` · kiểm tra link tài liệu.

## Cần hỏi duyệt nếu
Đổi BR / API / migration; nâng hay hạ chỉ tiêu NFR đã CONFIRMED; duyệt Gate (chỉ chủ dự án duyệt).

## Bàn giao
File thay đổi; lệnh + kết quả thật; AC chưa có bằng chứng (NOT_RUN + lý do); hồ sơ Gate chờ duyệt.

## Kết quả thực chạy (20/10/2026)

| Lệnh / việc | Kết quả |
| --- | --- |
| `npm run lint`, `npm run format:check`, `npm run skills:check` | PASS |
| `npm test` | 255/255 PASS (19 file) |
| `npm run test:e2e` | 34/34 PASS (31 luồng + 3 a11y) |
| `npm run load` | 10/10 vòng PASS, NFR-001 p95 239 ms |
| `npm run trace -- --check` | 115 US · 289 / 289 AC PASS · 0 GAP · 0 bằng chứng hỏng |
| `npm audit` | 0 lỗ hổng |
| Review độc lập | xem [handover-2026-10-20.md](../chất-lượng/handover-2026-10-20.md) §4 |

## Lệch phạm vi
- Thêm 73 AC (lỗi / quyền / biên) và viết lại 25 AC cho kiểm được — đúng yêu cầu bước 05, có ghi chú ngày trong từng FEATURE; cần chủ dự án duyệt ở G1.
- Sửa màu / nhãn giao diện (DEF-006…008) và `el()` tự gắn `<label for>` / `role="alert"` cho khối lỗi (NFR-A11Y-08) — không đổi chức năng.
- `business-rules.md` BR-007: bổ sung vai trưởng ca theo ADR-006 D-24 (đồng bộ tài liệu với quyết định đã có, không đổi hành vi) — cần duyệt ở G1.
- `.gitattributes`: mã + tài liệu luôn LF (Prettier kiểm LF; Windows `core.autocrlf` làm checkout ra CRLF → `format:check` lỗi trên máy local).

## Bàn giao
[handover-2026-10-20.md](../chất-lượng/handover-2026-10-20.md) · [quality-gates.md](../chất-lượng/quality-gates.md) · [quy-trình-15-bước.md](../quy-trình-15-bước.md)
