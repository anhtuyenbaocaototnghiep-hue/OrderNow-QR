# TASK-091 — Bán tiếp khi mất mạng (F-074)
Status: READY_FOR_REVIEW (06/11/2026)
Quyết định: [ADR-032](../quyết-định/ADR-032-ban-khi-mat-mang.md) D-140…D-146 · Feature: [FEATURE-074](../chức-năng/FEATURE-074.md) (US-074-1/2, AC-074-01…05) · BR-112
Module: MOD-ORDER, MOD-BILLING, MOD-SHIFT, MOD-INVENTORY · Màn hình: SCR-13 (Bán mang đi), SCR-15 / SCR-54 (Ca & hoàn tiền → Đơn bán lúc mất mạng), SCR-47 (Cảnh báo)
Nguồn: chủ dự án 06/11/2026 — nhờ chuyên gia F&B nhận xét bài; chọn "bán tiếp khi mất mạng", nghe giải thích cách làm rồi: "tiến hành làm khi làm xong làm thành file skill.md". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-091-ban-khi-mat-mang` chồng lên `task/TASK-090-nhac-va-bao-quen-cham-cong` (chưa gộp `main`) · Kế hoạch: [TASK-091-plan.md](../kế-hoạch/TASK-091-plan.md)

## Mục tiêu
Máy chủ / router / Wi-Fi máy quầy sự cố thì quán vẫn thu tiền và in bill; có mạng lại đơn tự về hệ thống, không tính hai lần, không làm sai kho / ca, chủ quán thấy rõ đơn nào cần kiểm. Máy quầy cũng hỏng thì có phiếu bán tay để nhập lại.

## Phạm vi
1. Migration 0051; `sp_SubmitOrder` (`@ClientRef`, `@SaleSource`, `@SoldAt`, `@StockShort OUTPUT`), `sp_CompleteOrder` (`@CompletedAt`) — tham số mặc định tắt.
2. Máy chủ: `ordersRepo` (mã lượt thu, gửi bù, `orderIdByClientRef`, `complete(…, completedAt)`), `orderService` (`submitWithRetry` nhận lỗi trùng mã, `takeaway` + `clientRef`), `pricingService.quote({ withPromotions })`, `offlineSaleService`, `offlineSalesRepo`, `routes/offlineSales.js`, nhật ký `order.offline-sale`, `alertService.onOfflineSale`, ETA bỏ đơn gửi bù.
3. Giao diện: `js/offline-sales.js` (hàng chờ, mã lượt thu, gửi bù, in bill / phiếu trống), `pos-takeaway.js` (bán tạm, phiếu bán tay), `pos-shift.js` (thẻ đơn bán lúc mất mạng, nhắc khi đóng ca), `admin-alerts.js` (nhãn), CSS.
4. Test integration + E2E; tài liệu; skill `ban-khi-mat-mang`.

## Không được sửa
Luồng bán mang đi / gửi đơn / hoàn tất khi không gửi bù (mọi tham số mới mặc định tắt); ràng buộc kho (`CK_Ingredients_Stock`, Σ lô = tồn); luật giá / khuyến mãi; F-055 (cần ca mở).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

## Kết quả thực chạy (06/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **438/438 PASS** (46 file; thêm `offline-sales.test.js` 4 test — AC-074-01…04; test cũ của bán mang đi / gửi đơn / hoàn tất / kho vẫn qua sau khi sửa hai thủ tục; bước dọn của bộ test kiểm bất biến kho / lô) |
| `npm run test:e2e` | **67/67 PASS** (thêm E2E "bán khi mất mạng…" — AC-074-05: `context.setOffline` → bán tạm → có mạng lại tự gửi → Ca & hoàn tiền; quản lý nhập phiếu bán tay) |
| `npm run trace -- --check` | 169 US, 459 AC — PASS 459, GAP 0 |
| Chụp màn hình 1366 / 390 px (CafeQrTest) | Bán mang đi lúc mất mạng (dải vàng, giỏ giá niêm yết, nút lưu đơn tạm), thẻ "Đơn bán tạm chờ gửi", Ca & hoàn tiền → Đơn bán lúc mất mạng (tiền đơn gửi bù vào "Tiền mặt đã thu" + két dự kiến), ô Nhập đơn từ phiếu bán tay. Trang Ca 390 px không cuộn ngang. Trang Bán mang đi ở 390 px cuộn ngang 133 px — **có từ trước** (lưới ô món 3 cột), bỏ hết phần F-074 vẫn vậy; màn này dùng ở máy quầy ≥ máy tính bảng — ghi lại, không sửa trong task này |
| `npm run lint`, `npm run format:check` | PASS |
| `npm run db:migrate` (CafeQrDev) | 0051 + `sp_SubmitOrder`, `sp_CompleteOrder` đã áp; máy chủ thử nghiệm chạy lại ở `http://10.0.143.11:3000` |
| Lỗi tìm được khi làm | (1) Test: món đã xóa lọt qua bước tính giá (bảng giá trong bộ nhớ máy chủ còn món) rồi bị thủ tục từ chối với mã `ITEM_UNAVAILABLE` → đổi thành `OFFLINE_ITEM_MISSING` để máy quầy giữ đơn lại cho trưởng ca. (2) E2E: món "Nước suối" ở tab khác — sửa test. (3) Chủ dự án mở trang Ca & hoàn tiền khi máy chủ thử nghiệm còn chạy bản cũ (giao diện mới gọi `/api/offline-sales` chưa có → "Không tìm thấy endpoint", cả trang hỏng) → trang Ca bỏ qua lỗi của phần danh sách này thay vì hỏng cả trang; đã áp migration và chạy lại máy chủ bản mới |

Chưa có review G3 độc lập; chưa gộp `main` ở máy; chưa đẩy GitHub.
