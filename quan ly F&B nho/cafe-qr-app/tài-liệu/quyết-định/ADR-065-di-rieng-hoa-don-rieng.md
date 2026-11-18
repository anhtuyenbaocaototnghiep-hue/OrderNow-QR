# ADR-065 — "Tôi đi riêng — hóa đơn riêng": khách lạ ngồi ghép bàn tách nhóm một chạm

- **Trạng thái:** ACCEPTED (18/11/2026).
- **Chủ dự án duyệt:**
  1. Hỏi: "sao khách hàng oder không còn thấy cái gộp nhóm với cá nhân vậy bạn kiểm tra lại".
  2. Claude giải thích đã bỏ theo ADR-059, rồi đề xuất: giữ tự vào nhóm, thêm một nút nhỏ "Tôi đi riêng — hóa đơn riêng" ngay dưới dòng "Đã vào nhóm…".
  3. Chủ dự án: "ok".
- **Thay một phần:** [ADR-059](ADR-059-tu-vao-nhom-cua-ban.md) D-238 ("không còn nút Tạo đơn cá nhân"). Tự vào nhóm (D-238) và chia bill (D-239) giữ nguyên.
- **Bối cảnh:**
  - Từ ADR-059, khách quét QR ở bàn đang có nhóm sẽ tự vào nhóm đó; muốn trả riêng thì phải "Chia bill theo người".
  - Khách lạ ngồi ghép bàn (thường gặp ở quán nhỏ giờ đông) bị vào chung hóa đơn với nhóm lạ, lại xem được món của nhóm kia.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-255 | **Sau khi tự vào nhóm của bàn, khách thấy dòng thông báo kèm nút nhỏ "Tôi đi riêng — hóa đơn riêng".**<ul><li>**Dòng thông báo:** "Bạn đã vào nhóm của Bàn … — Món cả nhóm gọi chung một hóa đơn." Hiện ở màn chào và đầu thực đơn, thay thông báo nổi cũ.</li><li>**Hiện tới khi:** điện thoại này gửi món đầu tiên trong nhóm, hoặc khách bấm ✕.</li><li>**Bấm "Tôi đi riêng":** điện thoại **rời nhóm** (không còn xem món / hóa đơn của nhóm đó) và có **nhóm riêng ở cùng bàn**, hóa đơn riêng. Món đang chọn trong giỏ đi theo. Quầy thấy bàn có thêm một nhóm (`session.opened`).</li><li>**Màn chọn nhóm** (bàn có ≥ 2 nhóm) có thêm nút "Tôi đi riêng — hóa đơn riêng" ở cuối.</li><li>**Máy chủ chỉ cho đi riêng khi điện thoại này chưa gửi món nào trong nhóm.** Món đã gửi nằm trong hóa đơn của nhóm, muốn trả riêng thì "Chia bill theo người". Lỗi:<ul><li>`409 ALREADY_ORDERED`;</li><li>không ở nhóm → `403 NOT_IN_GROUP`;</li><li>nhóm đã đóng → `409 SESSION_CLOSED`.</li></ul>Vì đơn không lưu điện thoại nào gọi, ghi mốc gửi món đầu tiên trên dòng thành viên nhóm (`SessionClients.OrderedAt`, migration 0063).</li><li>Rời nhóm + mở nhóm mới nằm trong **một giao dịch** có khóa dòng.</li></ul> |

## Phương án đã cân nhắc

- **Trả lại hai nút "Gộp chung / Tạo đơn cá nhân" như trước:** thêm một chạm cho mọi khách, trong khi phần lớn khách ngồi cùng bàn là cùng nhóm. Bỏ.
- **Cho đi riêng cả khi đã gửi món:** món đã gửi vẫn nằm trong hóa đơn nhóm kia, người lạ có thể gọi món rồi "đi riêng" để nhóm kia trả. Bỏ: chỉ cho trước khi gửi món.
- **Ghi điện thoại nào gọi trên từng đơn** (sửa `sp_SubmitOrder`): đụng thủ tục gửi đơn trung tâm. Một cột trên dòng thành viên nhóm là đủ cho quy tắc này.

## Hệ quả

- **Mã nguồn:**
  - `sessionsRepo.separate` / `markClientOrdered`;
  - `sessionService.separate`;
  - `orderService.submitDineIn` (đánh dấu đã gửi món);
  - route `POST /api/sessions/{id}/separate`;
  - giao diện: `js/join-notice.js` (mới), `t-entry.js` (dòng ở màn chào, nút ở màn chọn nhóm), `t-menu.js` (dòng đầu thực đơn, bỏ dòng khi gửi món), `customer.css`.
- **CSDL:** `0063_di_rieng_hoa_don_rieng.sql` (`SessionClients.OrderedAt`, chỉ thêm cột).
- **Tài liệu:** FEATURE-097 (quy tắc, AC-097-05…07), US-097-1, api-contract, data-model, screens-flows, tc-map.
- **Test:**
  - `group-separate.test.js` (AC-097-05, AC-097-06);
  - E2E "đi riêng: …" (AC-097-07);
  - E2E AC-097-01 kiểm dòng thông báo thay thông báo nổi.
