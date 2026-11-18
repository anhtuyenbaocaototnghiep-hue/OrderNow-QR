# TASK-127 — Kế hoạch: đi riêng, hóa đơn riêng (F-097, ADR-065)

## Các bước

1. **CSDL:** `0063_di_rieng_hoa_don_rieng.sql` — `SessionClients.OrderedAt` (chỉ thêm cột).
2. **Máy chủ:**
   - `sessionsRepo.separate`: một giao dịch, khóa dòng thành viên;
   - `sessionsRepo.markClientOrdered`;
   - `sessionService.separate`: lỗi `404` / `409 SESSION_CLOSED` / `403 NOT_IN_GROUP` / `409 ALREADY_ORDERED`, phát `session.opened`;
   - `orderService.submitDineIn`: đánh dấu đã gửi món;
   - route `POST /api/sessions/{id}/separate`.
3. **Giao diện:**
   - `js/join-notice.js` (mới): nhớ "vừa vào nhóm" theo thẻ trình duyệt, khung thông báo, gọi đi riêng, chuyển giỏ sang nhóm mới;
   - `t-entry.js`: ghi nhớ sau khi vào nhóm, khung ở màn chào, nút ở màn chọn nhóm;
   - `t-menu.js`: khung đầu thực đơn, bỏ ghi nhớ khi gửi món;
   - `customer.css`.
4. **Test:**
   - `group-separate.test.js`;
   - E2E "đi riêng";
   - E2E AC-097-01 (dòng thông báo).
5. **Tài liệu:**
   - ADR-065, FEATURE-097, US-097-1;
   - api-contract, data-model, screens-flows, tc-map;
   - mục lục.

## Rủi ro

1. **Gọi món rồi "đi riêng"** để nhóm kia trả: máy chủ chặn bằng `OrderedAt`, khóa dòng trong giao dịch.
2. **Khách lạ vẫn xem được món nhóm kia** sau khi đi riêng: xóa dòng thành viên ở nhóm cũ, nên xem lại → `403`.
3. **Quét lại QR vào nhầm nhóm cũ:** điện thoại không còn ở nhóm cũ, nên quét lại vào nhóm riêng (`MEMBER`).
4. **Migration CafeQrDev:** chỉ thêm cột (sao lưu trước).
