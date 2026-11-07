# TASK-092 — Kế hoạch: hạn dùng nguyên liệu (F-075, ADR-033)

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Lô + hạn in trên bao bì | `IngredientLots (ExpiryDate DATE)`, `sp_LotConsume` (FEFO), `sp_ReceiveStock` (hạn = nhập tay hoặc hôm nay + `ShelfLifeHours`) | Một lô = một dòng phiếu nhập, thường nhiều hộp |
| Khả dụng | `tvf_ExpiredLotQty` (dùng ở `sp_SubmitOrder`, `sp_PostPrepBatch`, `menuRepo`, `ingredientsRepo`, `inventoryRepo`, `forecastRepo`) | Chỉ lô hết hạn |
| Trừ kho do dùng | `sp_CompleteOrder` (bán), `sp_PostPrepBatch` (sơ chế) | Không biết hộp nào đang mở |
| Báo hạn | Job 06:00 `lot-expiry` (realtime cho quầy), trang Hôm nay (`DailySummaries.expiring` — chỉ tên + số ngày), quầy tab Hạn dùng (`/api/lots/expiring?days=3`) | Không có tiền, không có email, không gợi ý dùng kịp |
| Hủy | `sp_LogWaste` (lý do `EXPIRED`, giá vốn vào `InventoryTransactions.CostAmount`, theo lô FEFO) | — |

## Thiết kế
- Trạng thái "hộp đang mở" trên `Ingredients` (không trên lô — lô nhiều hộp). Một công thức trong `sp_TrackOpenPacks` đọc `#PackUse` (cách `#LotUse` sẵn có) — gọi trong transaction của hai thủ tục trừ kho do dùng; đơn gửi bù (F-074) đi qua `sp_CompleteOrder` nên tự có.
- Quá hạn sau khi mở → thêm vào `tvf_ExpiredLotQty` (một nguồn cho mọi chỗ tính khả dụng), gộp với lô bằng MAX để không trừ hai lần.
- `expiryService.risk()` tính trực tiếp (hộp mở đổi theo giờ, không lưu vào `DailySummaries`); `withoutMoney` cho nhân viên / trưởng ca.
- Cảnh báo `EXPIRY_RISK` khóa theo ngày; tiền hủy theo tháng từ nhật ký kho (không thêm bảng).

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Sửa thủ tục trừ kho làm hỏng bán / sơ chế | Chỉ thêm bước sau khi trừ, chỉ chạm nguyên liệu có cấu hình; chạy lại toàn bộ test kho / bán / sơ chế + kiểm bất biến kho cuối bộ test |
| Hộp mở lệch thực tế (đổ bỏ / làm đổ ngoài app) | "Bỏ phần còn" + phiếu hủy đưa về đúng; tắt / bật lại cấu hình xóa trạng thái |
| Khả dụng giảm làm món "Hết món" bất ngờ | Đúng ý (phần quá hạn không được bán); quầy thấy ngay mục hộp đang mở + nút bỏ |
| Lộ giá vốn cho nhân viên | `withoutMoney` ở API rủi ro và trang Hôm nay của trưởng ca; test kiểm |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm — migration 0052 + thủ tục).
