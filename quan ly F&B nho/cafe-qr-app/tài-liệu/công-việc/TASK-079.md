# TASK-079 — Báo động giá vốn khi nhập hàng giá cao hơn
Status: READY_FOR_REVIEW (02/11/2026)
Quyết định: [ADR-023](../quyết-định/ADR-023-bao-dong-gia-von.md) D-84…D-88 · Feature: [FEATURE-064](../chức-năng/FEATURE-064.md) · BR-100, BR-101
Module: MOD-INVENTORY, MOD-ADMIN · Màn hình: SCR-47 (Cảnh báo), SCR-33 (Cài đặt), SCR-21 (Thực đơn), SCR-27 (Combo)
Nguồn: chủ dự án 02/11/2026. · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-079-bao-dong-gia-von` tách từ `main` (`v1.0.0-rc.3`) · Kế hoạch: [TASK-079-plan.md](../kế-hoạch/TASK-079-plan.md)

## Mục tiêu
Nhập hàng giá cao hơn thì chủ quán biết ngay món nào tụt lãi, mất bao nhiêu mỗi tháng và nên bán giá nào, thay vì phát hiện sau nhiều tuần trong báo cáo.

## Phạm vi
1. Migration 0042: loại cảnh báo `COST_RISE`, bảng `CostAlertMarks`.
2. `domain/costImpact.js`, `repositories/costAlertRepo.js`, phần giá vốn trong `alertService`; gọi từ `stockService` (nhập tay, theo đơn đặt, sửa, hủy).
3. Ba ngưỡng trong Cài đặt; bảng món ở trang Cảnh báo; `?edit={id}` ở Thực đơn và Combo.
4. Test integration + E2E; tài liệu; skill `bao-dong-gia-von`.

## Không được sửa
- Giá bán (app chỉ gợi ý); giá vốn đã chốt trên đơn; cách tính `AvgCost`, `LastUnitCost` trong SP; request / response của API nhập kho.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run load:report` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).
