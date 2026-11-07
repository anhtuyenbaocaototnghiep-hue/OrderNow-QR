---
name: ban-khi-mat-mang
description: Bán tiếp khi mất mạng cho cafe-qr-app (FEATURE-074, ADR-032, TASK-091) — máy quầy mất kết nối tự chuyển "bán tạm" ở màn Bán mang đi (giá niêm yết, lưu đơn trong localStorage, mã tạm T-0001, in bill bằng iframe srcdoc), có mạng lại tự gửi bù POST /api/offline-sales (đúng giờ bán, đúng giá đã thu, đơn Đã xong, kho chỉ trừ phần còn có — không âm), mã lượt thu ClientRef chống ghi hai lần (cả lúc thu online), việc cần kiểm PRICE_DIFF / STOCK_SHORT / SHIFT_LATE / TRANSFER_CHECK / MEMBER_NOT_FOUND + cảnh báo OFFLINE_SALE, thẻ "Đơn bán lúc mất mạng" ở Ca & hoàn tiền, phiếu bán tay (in trống, trưởng ca nhập lại). Dùng khi task giao F-074 / ADR-032 / TASK-091 / AC-074-xx, hoặc nhắc "mất mạng", "offline", "máy chủ sập", "bán tạm", "gửi bù", "phiếu bán tay", "ClientRef", "tính hai lần", "SaleSource".
---

# Mục đích

Ghi lại **bán tiếp khi mất mạng** (làm ngày 06/11/2026, TASK-091) để agent sau sửa, mở rộng hoặc làm lại mà không: ghi một lượt thu hai lần, làm tồn kho âm / lệch lô, để tiền rơi sai ca, hay làm hỏng luồng bán mang đi đang chạy.

Nguồn chính là tài liệu trong repo; lệch nhau → làm theo tài liệu, ghi câu hỏi vào `tài-liệu/open-questions.md`.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-032-ban-khi-mat-mang.md` (D-140…D-146) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-074.md` (AC-074-01…05, giới hạn đã biết) |
| Business rule | `tài-liệu/nghiệp-vụ/business-rules.md` BR-112 |
| Task, kế hoạch | `tài-liệu/công-việc/TASK-091.md`, `tài-liệu/kế-hoạch/TASK-091-plan.md` |
| API, dữ liệu, màn hình | `api-contract.md`, `data-model.md`, `screens-flows.md` — mục "F-074" |
| Nền | F-008 bán mang đi, F-018 ca, F-028 lô / FEFO, F-031 giá vốn, F-056 chuyển khoản, F-060 cảnh báo, ADR-016 (chạy LAN, http) |

# Khi dùng

- Mở rộng bán tạm sang màn khác (Gọi món tại bàn, Đơn hàng), thêm khuyến mãi lúc mất mạng, đổi hạn 72 giờ / 7 ngày.
- Chủ quán báo "mất mạng không bán được", "đơn bị tính hai lần", "két lệch sau khi mất mạng", "kho âm", "đơn tạm không gửi lên" (mục 6).
- Đưa app lên https (VPS) và muốn thêm service worker để tải lại trang lúc máy chủ tắt — đọc mục 5.

# Điều kiện trước

- Có ca mở lúc bán (F-018 / F-055) — bán tạm cũng cần `shell.shift` đã tải.
- Không đổi nguyên tắc: tồn kho không âm (`CK_Ingredients_Stock`), Σ lô = tồn, một mã lượt thu = một đơn. Đổi → ADR mới + chủ dự án duyệt.

# 1. Bước 0: khảo sát rồi mới sửa

Đọc: `cơ-sở-dữ-liệu/thủ-tục/sp_SubmitOrder.sql` (khối `@Backfill`, bước 6 giữ kho), `sp_CompleteOrder.sql` (`@CompletedAt`), `services/orderService.js` (`submitWithRetry`, `isDuplicateSale`, `takeaway` + `existingSale`), `services/offlineSaleService.js` (`record`, `finish` — tự làm nốt khi gửi lại sau sự cố), `repositories/offlineSalesRepo.js`, `routes/offlineSales.js`, `alertService.onOfflineSale`; giao diện `js/offline-sales.js`, `js/pages/pos-takeaway.js` (khối "F-074"), `js/pages/pos-shift.js` (`offlineCard`, đầu `closeShift`).

# 2. Quy tắc (BR-112)

- **Vào bán tạm:** báo giá / thu tiền lỗi `NETWORK`, hoặc realtime mất > 4 giây, hoặc `window` `offline`. **Ra:** realtime nối lại, hoặc `GET /api/health` (mỗi 8 giây khi đang bán tạm) trả OK, rồi tự gửi bù.
- **Giá lúc bán tạm:** `item.listPrice` (MenuItems.Price) + `optionDelta` — đúng bằng `priceOrder(items, catalog, [] /* không khuyến mãi */)` ở máy chủ. Không hội viên giảm giá / giảm tay / voucher / làm tròn.
- **Mã lượt thu:** `cf_takeaway_ref` theo giỏ — tạo khi thu, giữ khi thu lại, xóa khi giỏ đổi hoặc thu xong. Gửi kèm cả lúc thu online. Máy chủ: đã có → trả đơn cũ (`duplicate` / `DUPLICATE`).
- **Gửi bù:** 72 giờ (`PAPER`: 7 ngày, chỉ MANAGER / ADMIN); `soldAt` không quá tương lai 5 phút; tổng = Σ giá × SL; tiền mặt ≥ tổng. Đơn `TAKE_AWAY`, `SaleSource`, giờ đơn / lượt thu / hoàn tất = `soldAt`, `CreatedBy` = người bán, `CompletedBy` = người gửi.
- **Kho:** `@Backfill = 1` → nguyên liệu không đủ bị bỏ khỏi `@Need` (không giữ, không trừ), trả qua `@StockShort`; món / tùy chọn đang tắt không chặn; món đã xóa → `OFFLINE_ITEM_MISSING`.
- **Ca:** ca đang mở; khác `shiftId` lúc bán → `SHIFT_LATE`; không có ca → `409 NO_OPEN_SHIFT` (máy giữ lại).
- **Cảnh báo:** `PRICE_DIFF` / `STOCK_SHORT` / `SHIFT_LATE` → `OFFLINE_SALE`, `dedupeKey OFFLINE:<shiftId>` (một mỗi ca).

# 3. Dữ liệu

- Migration `0051`: `Orders.ClientRef` + `UX_Orders_ClientRef` (lọc NOT NULL — lỗi trùng là 2601, có tên chỉ mục trong message), `Orders.SaleSource`, `OfflineSales` (+ trigger chặn xóa 50250), `CK_Alerts_Kind` thêm `OFFLINE_SALE`.
- Trình duyệt: `cf_offline_sales` (hàng chờ — mảng đơn tạm: clientRef, localCode, soldAt, soldBy, shiftId, method, amountReceived, total, memberPhone, device, items[{ menuItemId, name, quantity, note, optionIds, optionLabels, unitPrice }], error), `cf_offline_seq`, `cf_takeaway_ref`, `cf_device_name`. Mọi đọc / ghi bọc `try`.

# 4. API

`POST /api/offline-sales` (201 SYNCED / 200 DUPLICATE), `GET /api/offline-sales?shiftId=`, `POST /api/orders/takeaway` + `clientRef`. Bảng đầy đủ: `api-contract.md` mục F-074.

# 5. Mở rộng — chỗ dễ sai

- **Đừng** cho tồn kho âm hay bỏ qua lô — phá bất biến kho (test `close()` của harness kiểm `inventoryViolations`).
- **Đừng** để `submitWithRetry` thử lại khi lỗi trùng là `UX_Orders_ClientRef` (khác trùng `OrderCode`).
- **Đừng** dùng `crypto.randomUUID` / service worker ở máy quầy LAN (http) — không có. Khi có https (VPS, ADR-016 dự phòng): có thể thêm service worker để mở trang lúc máy chủ tắt; vẫn giữ localStorage làm hàng chờ.
- Mở rộng sang **Gọi món tại bàn** (phiên dine-in): phiên / bàn sống ở máy chủ — cần thiết kế riêng (ADR), đừng ghép vào `offline-sales` hiện tại. Hiện khách ngồi bàn thu ở Bán mang đi (ghi chú số bàn).
- Thêm khuyến mãi lúc mất mạng: phải tính giống hệt `priceOrder` ở cả hai phía + gửi kèm `promotionId` — nếu không sẽ báo `PRICE_DIFF` hàng loạt.
- In bill lúc mất mạng không gọi trang `/pos/orders/:id/receipt` (cần máy chủ) — dùng `printOfflineReceipt` (CSS kèm sẵn trong module).
- E2E: `context.setOffline(true)` — realtime có thể không báo mất ngay; test dựa vào báo giá lỗi `NETWORK` để vào bán tạm. Món "Nước suối" nằm ở tab "Trà & đồ uống khác" (bấm tab trước).

# 6. Xử lý thắc mắc của chủ quán

| Thắc mắc | Trả lời / kiểm |
| --- | --- |
| "Mất mạng có bán được không?" | Mất Internet: bán bình thường (app chạy trong quán). Router / máy chủ sự cố: màn Bán mang đi tự chuyển "bán tạm" — thu tiền, in bill, có mạng lại tự gửi. Khách không tự quét QR được lúc đó |
| "Lỡ tải lại trang khi mất mạng" | Trang không mở được tới khi có mạng; đơn đã lưu không mất — có mạng lại mở Bán mang đi là tự gửi |
| "Đơn tạm không gửi lên" | Máy đã bán phải mở lại Bán mang đi (hoặc bấm Gửi ngay); chưa mở ca → mở ca; lỗi "món không còn trong thực đơn" → trưởng ca nhập bằng phiếu bán tay với món thay thế |
| "Két lệch sau khi mất mạng" | Ca & hoàn tiền → Đơn bán lúc mất mạng: đơn "ghi vào ca khác" (đóng ca khi máy khác còn đơn tạm) — lệch đúng số đó |
| "Kho báo chưa trừ" | Đơn bán lúc kho trên sổ không đủ — kiểm kê nguyên liệu đó và điều chỉnh |
| "Có tính hai lần không?" | Không — mỗi lượt thu có mã riêng, gửi lại bao nhiêu lần cũng một đơn |
| "Máy quầy hỏng luôn" | Dùng phiếu bán tay đã in sẵn; trưởng ca nhập lại trong 7 ngày (Bán mang đi → Nhập đơn từ phiếu bán tay) |

# 7. Làm lại từ đầu (bản code chưa có F-074)

1. Docs: ADR-032, FEATURE-074, BR-112, US-074-1/2, tc-map, api-contract, data-model, screens (SCR-54), UAT-43.
2. Migration 0051 + tham số mặc định tắt cho `sp_SubmitOrder` / `sp_CompleteOrder` (mục 2, 3) — chạy lại toàn bộ test cũ để chắc luồng cũ không đổi.
3. `ordersRepo` (`clientRef`, `backfill`, `orderIdByClientRef`, `complete(..., completedAt)`), `submitWithRetry` (trùng mã lượt thu), `takeaway` (`clientRef`), `pricingService.quote({ withPromotions })`, `offlineSaleService`, `offlineSalesRepo`, route + nhật ký, `alertService.onOfflineSale`, loại `SaleSource` khỏi ETA.
4. Giao diện: `js/offline-sales.js`, khối F-074 trong `pos-takeaway.js`, `pos-shift.js`, nhãn cảnh báo `admin-alerts.js`, CSS (`.offline-note`, `.offline-card`, `.paper-box`).
5. Test `offline-sales.test.js` (AC-074-01…04) + E2E "bán khi mất mạng…" (AC-074-05); chụp 1366 / 390 px.

# 8. Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm). Số liệu lần làm: xem `TASK-091.md`.
