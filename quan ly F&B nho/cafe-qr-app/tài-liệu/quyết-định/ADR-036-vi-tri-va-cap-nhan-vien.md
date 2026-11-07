# ADR-036 — Phân quyền rõ ràng, đợt 2: vị trí và cấp của nhân viên

- **Trạng thái:** ACCEPTED (07/11/2026). Chủ dự án: "…và nhân viên chia ra từng cấp để dễ giải quyết công việc của mỗi người một cách hiệu quả tối ưu công việc"; duyệt cả hai đợt: "tiến hành làm những cái tôi vừa nhắn". Đợt 1: [ADR-035](ADR-035-phan-quyen-quan-ly-cua-hang.md).
- **Bối cảnh:** mọi nhân viên (vai STAFF) dùng được mọi việc ở quầy: thu tiền, bán mang đi, mở / đóng ca, làm đơn, kho, gọi món tại bàn. Quán thuê người theo việc (thu ngân, pha chế, phục vụ) và có người mới thử việc; chủ quán muốn mỗi người chỉ thấy và làm phần của mình (đỡ rối, đỡ bấm nhầm, tiền chỉ qua tay thu ngân) và người mới không tự giảm giá / chi tiền.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-162 | Vị trí của **nhân viên** (vai STAFF): **Thu ngân** (`CASHIER`), **Pha chế** (`BARISTA`), **Phục vụ** (`SERVER`); một người chọn được nhiều vị trí; **để trống = mọi vị trí** (tài khoản cũ giữ nguyên). Trưởng ca trở lên không bị giới hạn vị trí (gửi lên cũng bị bỏ qua). Chỉ chủ quán đặt ở Tài khoản. |
| D-163 | Máy chủ chặn việc theo vị trí (`requirePosition`, `403 POSITION_REQUIRED`): **Thu ngân** — bán mang đi, thu tiền bàn / phần chia bill, mở / đóng ca, hoàn tiền, ghi thu chi quỹ, bán ly treo; **Pha chế** — tiếp nhận / hoàn tất đơn (cả "Xong" 1 chạm), sơ chế, hủy hàng, hủy lô, nhận hàng theo PO; **Phục vụ** — mở bàn, gọi món tại bàn, chuyển bàn. Mọi người: xem đơn / bàn / bill, hủy đơn mới, sửa / xóa món (theo luật duyệt), đóng bàn trống, ghi chú bàn, xử lý gọi nhân viên / đánh giá thấp, chấm công, Giờ công, bật / tắt nhận đơn QR. Gửi bù đơn bán lúc mất mạng không chặn theo vị trí (đơn đã bán thật). |
| D-164 | Máy quầy theo vị trí: menu chỉ hiện trang của mình (Gọi món tại bàn — Phục vụ; Bán mang đi, Ca & hoàn tiền — Thu ngân; Kho & sơ chế — Pha chế; Đơn hàng, Giờ công — mọi người); mở thẳng trang khác → về Đơn hàng kèm lời nhắc. Ở Đơn hàng: không phải Pha chế thì không có nút Tiếp nhận / Hoàn tất / Xong / Làm ngay; không phải Thu ngân thì "Thu tiền" thành "Xem bill" (nút thu khóa), không mở ca được ("Nhờ thu ngân mở ca"); không phải Phục vụ thì không có "Gọi món" ở thẻ bàn. |
| D-165 | Cấp **Thử việc** (`PROBATION`) / **Chính thức** (`OFFICIAL`, mặc định) cho nhân viên. Thử việc: giảm giá tay bất kỳ cần trưởng ca trở lên duyệt (ngưỡng 0); mọi khoản chi quỹ chờ duyệt; mọi lần sửa / xóa món (kể cả đơn chưa tiếp nhận) cần người duyệt. Nhãn "Thử việc" cạnh tên ở máy quầy để trưởng ca biết. |
| D-166 | Dữ liệu: `Users.Positions` (`'CASHIER,BARISTA'`, NULL = mọi vị trí), `Users.StaffLevel` (mặc định `OFFICIAL`) — migration 0054, chỉ thêm. `/auth/me`, danh sách tài khoản trả `positions`, `level`; Tra cứu API ghi vị trí cần cho từng việc. |

## Phương án đã cân nhắc

- **Vị trí là vai riêng (CASHIER thay STAFF):** một người làm hai việc phải có hai tài khoản, vai trộn với cấp quản lý — rối.
- **Chỉ ẩn ở giao diện, không chặn ở máy chủ:** gọi thẳng API vẫn làm được, trái nguyên tắc "server kiểm mọi endpoint".
- **Chặn cả xem đơn / bill theo vị trí:** quán nhỏ cần nhìn chung một màn; chỉ chặn việc làm thay đổi tiền / đơn / kho.

## Hệ quả

- `auth/permissions.js`: `POSITIONS`, `hasPosition`, `isProbation`, `discountRole`, `requirePosition`; `discountLimits('PROBATION')` = 0. `cashService.create` (ngưỡng 0), `voidService.approverFor` (thử việc luôn cần duyệt), `orderService` / `sessionService` / `splitService` (ngưỡng giảm tay theo cấp).
- Giao diện: `js/roles.js` (`hasPosition`, `canOpenPosPage`, nhãn vị trí / cấp), `pos-shell.js`, `pos-dashboard.js`, Tài khoản (ô vị trí + cấp, cột vai trò ghi vị trí / "Thử việc").
- Quán không đặt vị trí cho ai thì không đổi gì.
