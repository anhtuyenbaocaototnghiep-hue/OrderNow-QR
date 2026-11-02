# TASK-079 — Kế hoạch: báo động giá vốn (FEATURE-064, ADR-023)

## Khảo sát (tên thật)
| Thứ | Ở đâu |
| --- | --- |
| Nhập kho | `stockService.receive` (nhận theo đơn đặt `purchasingService.receivePo` cũng gọi hàm này), `updateReceipt`, `voidReceipt`; SP `sp_ReceiveStock`, `sp_ReviseStockReceipt` |
| Giá | `StockReceiptLines.UnitCost` (theo đơn vị gốc, DECIMAL 18,4), `Ingredients.LastUnitCost`, `Ingredients.AvgCost`; SP ghi đè `LastUnitCost` trước khi hook chạy → giá cũ phải đọc từ phiếu trước |
| Định lượng | `BomItems`, `ModifierOptionBom`, `ComboComponents`, `SemiRecipes` + `SemiRecipeLines` (lồng tối đa 3 cấp) |
| Cảnh báo | `alertService` (`newAlert`, `immediateAlert`, `enqueueImmediate`, `WATCHED`), `alertsRepo`, `CK_Alerts_Kind`, `pages/admin-alerts.js` |
| Báo cáo cùng cách tính | `stockRepo.cogs` (Σ định lượng × `LastUnitCost`, thiếu giá → null, không tính hao hụt) |

## Thiết kế
- `domain/costImpact.js` (hàm thuần, unit test): `referencePrice`, `classifyLines`, `menuImpact`, `suggestPrices`.
- `repositories/costAlertRepo.js`: `priceHistory`, `snapshot`, `addMarks`, `retireForReceipt`.
- `alertService`: `onStockReceived(receipt)`, `onReceiptRevised(before, after, user)`; khóa `COST:{receiptId}:{EditedAt ms | 0}`; thư đính chính `COSTFIX:{receiptId}:{ms}`.
- `stockService`: gọi hook sau commit, `.catch(log)` như F-060.
- `settingsService` + route + trang Cài đặt: 3 ngưỡng; `WATCHED` thêm 3 dòng.
- `admin-alerts.js`: bảng món; `admin-menu.js`, `admin-combos.js`: `?edit={id}`.

## Dữ liệu
Migration 0042: đổi `CK_Alerts_Kind`; `CostAlertMarks (AlertId, IngredientId, ReceiptId, UnitCost)`. Nguyên liệu đã có dòng phiếu nhập chỉ bị xóa mềm (`sp_DeleteIngredient`) nên khóa ngoại không chặn thao tác nào.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Chạy lại do deadlock tạo trùng / gỡ nhầm cảnh báo vừa tạo | `DedupeKey` theo lần sửa; `retireForReceipt` loại trừ khóa hiện tại; mốc `IF NOT EXISTS` |
| Lỗi cảnh báo làm hỏng phiếu nhập | Hook sau commit + `.catch`; test ép lỗi |
| Nhân viên thấy giá vốn | Phản hồi nhập kho không đổi; realtime chỉ phòng `admin`; test quyền |
| Nghi nhầm giá làm sai lãi món khác | Giá nghi nhầm dùng mốc cho cả cũ và mới |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run load:report` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).
