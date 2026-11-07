# TASK-091 — Kế hoạch: bán tiếp khi mất mạng (F-074, ADR-032)

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Bán mang đi | `pos-takeaway.js` → `POST /api/orders/takeaway` → `orderService.takeaway` → `sp_SubmitOrder` (đơn PREPARING / PAID + lượt thu, giữ kho) → "Hoàn tất" `sp_CompleteOrder` (trừ kho FEFO, giá vốn) | Mất kết nối → lỗi "Mất kết nối mạng", không thu được; gửi lại sau lỗi mạng có thể ghi hai lần (Idempotency-Key chỉ trong bộ nhớ 60 giây) |
| Giá | `pricingService.quote` → `priceOrder` (khuyến mãi theo giờ), `billingService.computeTotals` (hội viên, giảm tay, voucher, làm tròn) | Chỉ máy chủ tính được |
| Ràng buộc kho | `CK_Ingredients_Stock` (≥ 0), `CK_Ingredients_Reserved`, Σ lô = tồn (`sp_LotConsume` → `LOT_SHORT`) | `sp_SubmitOrder` từ chối đơn khi thiếu kho / món tắt |
| Mất kết nối | `socket.js` `onOffline` → dải "Mất kết nối" | Không có chế độ bán |
| Trình duyệt | Máy quầy vào `http://<IP LAN>:3000` | Không phải "secure context" → không service worker, không `crypto.randomUUID` |

## Thiết kế
- **Mã lượt thu** (`Orders.ClientRef`, chỉ mục duy nhất có lọc) truyền qua `sp_SubmitOrder` → mọi đường ghi (thu online, gửi lại, gửi bù) chỉ ghi một lần; `submitWithRetry` nhận ra lỗi trùng `UX_Orders_ClientRef` → `DUPLICATE_SALE` (không thử lại như trùng `OrderCode`).
- **Gửi bù** dùng lại `sp_SubmitOrder` + `sp_CompleteOrder` (không chép logic đơn / lượt thu / FEFO / giá vốn): thêm tham số mặc định tắt `@SaleSource`, `@SoldAt`, `@StockShort OUTPUT`, `@CompletedAt`. Giá: `quote(..., { withPromotions: false })` (giá niêm yết như máy quầy) rồi ghi đúng giá đã thu, so lệch.
- **Máy quầy**: `js/offline-sales.js` (hàng chờ localStorage, UUID bằng `getRandomValues`, gửi bù tuần tự, in bill / phiếu trống bằng `iframe.srcdoc` + CSS kèm sẵn); `pos-takeaway.js` (chế độ bán tạm, mã lượt thu theo giỏ, hỏi `/api/health` mỗi 8 giây, sự kiện `online` / `offline`, phiếu bán tay); `pos-shift.js` (thẻ đơn bán lúc mất mạng, nhắc khi đóng ca).
- **Kiểm soát**: `OfflineSales` (không xóa được), nhật ký `order.offline-sale`, cảnh báo `OFFLINE_SALE` một lần mỗi ca.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Ghi hai lần (máy chủ đã nhận nhưng mạng rớt trước khi trả lời) | Mã lượt thu giữ nguyên với giỏ; lưu đơn tạm dùng cùng mã → gửi bù trả `DUPLICATE` (AC-074-01) |
| Tồn kho âm / lệch lô | Gửi bù chỉ giữ phần còn có; `sp_CompleteOrder` trừ đúng phần đã giữ; test kết thúc kiểm bất biến kho (`inventoryViolations`) |
| Nhân viên sửa giá trong bộ nhớ trình duyệt | Máy chủ so với bảng giá → `PRICE_DIFF` + cảnh báo chủ quán; ghi tên người bán + máy |
| Tiền về sai ca | Ghi ca đang mở + `SHIFT_LATE`; nhắc trước khi đóng ca trên máy còn đơn tạm |
| Đơn gửi bù làm sai thời gian pha (ETA) | Loại `SaleSource` khỏi thống kê thời gian pha |
| Tải lại trang lúc máy chủ tắt | Không có service worker trên http — ghi rõ trong dải vàng và tài liệu; đơn đã lưu không mất |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm — migration 0051 + thủ tục).
