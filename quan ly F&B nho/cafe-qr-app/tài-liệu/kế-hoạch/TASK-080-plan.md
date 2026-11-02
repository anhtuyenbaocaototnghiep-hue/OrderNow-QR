# TASK-080 — Kế hoạch: trang Lãi / lỗ dễ hiểu (FEATURE-034)

## Khảo sát (tên thật)
| Thứ | Ở đâu |
| --- | --- |
| Trang | `public/admin/pnl.html`, `js/pages/admin-pnl.js` (7 ô KPI, bộ lọc ngày + "Nhóm theo", biểu đồ SVG `chart-kit.js`, bảng theo kỳ, chi quỹ theo danh mục, thẻ chi phí cố định) |
| Công thức | `services/pnlService.js` (`finalize`, `report`, hòa vốn), `repositories/pnlRepo.js` (`daily`) |
| Hao hụt | `InventoryTransactions.Type = 'ADJUST'` (điều chỉnh tay, `sp_LogWaste`, `sp_PostStocktake`, `sp_VoidStocktake`), có `UnitCost` |
| Test | `tests/finance.test.js` (F-034), E2E flow (trang Lãi / lỗ trong "trưởng ca + sổ quỹ"), a11y (biểu đồ, 320 / 390 px) |

## Thiết kế
- Một lần tải gọi song song: khoảng đã chọn, khoảng trước cùng độ dài (so sánh — lỗi thì bỏ), hôm nay (thanh tiến độ), chi phí cố định.
- Không thêm endpoint; `lossValue` = Σ(−Delta × giá) các dòng `ADJUST` trong kỳ, ≥ 0, không trừ vào lợi nhuận.
- Lưu ý là quy tắc hiển thị ở giao diện (không phải business rule mới): chỉ gợi ý kiểm tra, không đổi số.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Đổi chữ làm bài báo cáo đồ án lệch thuật ngữ | Giữ thuật ngữ kế toán trong ngoặc, chữ nhỏ |
| 3 yêu cầu thay 1 làm chậm trang | Song song; dữ liệu một quán nhỏ |
| Màn điện thoại | Kiểm 320 / 390 px ở E2E và a11y |
