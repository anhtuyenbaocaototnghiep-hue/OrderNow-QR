# Definition of Done (DoD)

> Sổ tay 15 bước — bước 14 (DoD đề xuất) + Mẫu 08. Áp cho **mọi task** từ TASK-057; dưới đây là bảng tự đánh giá cho bản hiện tại (mốc `v1.0-baseline` + TASK-057, TASK-058), ngày 20/10/2026. Task mới chép bảng "Checklist cho mỗi task" vào phần Bàn giao của task packet.

## Checklist cho mỗi task (Mẫu 08)

- [ ] AC đạt — mọi AC của task có TC trong [tc-map.md](tc-map.md), `npm run trace -- --check` không báo lỗi
- [ ] BR tuân thủ — không thêm / đổi BR ngoài ADR
- [ ] Đúng UI — theo [screens-flows.md](../giao-diện/screens-flows.md) (kể cả UI states), viewport mục tiêu
- [ ] Permission test — có test 401 / 403 / sở hữu dữ liệu cho endpoint mới
- [ ] Test tự động — `npm test`, `npm run test:e2e` (gồm a11y) chạy thật, đính kèm kết quả
- [ ] Review — agent review độc lập hoặc người, trên diff có Task ID
- [ ] Cập nhật tài liệu — FEATURE, US, tc-map, api-contract / data-model nếu chạm
- [ ] Tích hợp thành công — gộp vào `main`, chạy lại toàn bộ sau gộp
- [ ] Không có lỗ hổng nghiêm trọng chưa giải quyết — [security-check.md](security-check.md), [defect-log.md](defect-log.md)

## Đánh giá bản hiện tại

| Tiêu chí DoD (sổ tay) | Bằng chứng | Kết quả |
| --- | --- | --- |
| Story, AC, BR và liên kết traceability đã cập nhật | [user-stories.md](../nghiệp-vụ/user-stories.md), [tc-map.md](tc-map.md), [traceability.md](traceability.md) — 115 US, 289 AC, mọi kiểm tra mục E = 0 | Đạt |
| Đúng giao diện / trạng thái theo UI Spec; hoạt động trên viewport mục tiêu | [sitemap.md](../giao-diện/sitemap.md) (ảnh chuẩn), E2E khách 390 px + kiểm không cuộn ngang 320 / 390 px, quầy / quản lý 1366 px | Đạt (Chromium); Safari / Android thật: UAT MAN-03 |
| Code, migration, API tuân thủ kiến trúc đã duyệt | Không đổi migration / API / BR trong TASK-057, 058; lệch tầng cũ ghi ở system-overview §9.5 chờ G2 | Đạt |
| Build, lint, unit / integration / E2E đã chạy, kết quả thật | `npm run lint`, `npm run format:check`, `npm test`, `npm run test:e2e`, `npm run load` — số liệu ở [traceability.md](traceability.md) / [handover-2026-10-20.md](handover-2026-10-20.md) | Đạt |
| Phân quyền và bảo vệ dữ liệu đã kiểm; không có secret trong repo | Test ma trận quyền, sở hữu phiên; `git grep` secret / `.env` không bị commit ([security-check.md](security-check.md)) | Đạt |
| Review độc lập, demo / UAT, tài liệu vận hành nếu đổi hành vi | Review: agent riêng (G3); UAT: [uat-plan.md](uat-plan.md) **chờ người thật**; tài liệu vận hành: [local-development.md](../vận-hành/local-development.md) đã cập nhật lệnh mới | Đạt trừ UAT |
