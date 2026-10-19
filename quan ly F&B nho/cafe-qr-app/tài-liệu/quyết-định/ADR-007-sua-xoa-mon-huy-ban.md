# ADR-007 — Sửa / xóa món đã gọi và hủy lượt phục vụ bàn

- **Trạng thái:** ACCEPTED (18/10/2026) — chủ dự án chọn 3 phương án dưới đây trong phiên làm việc ngày 18/10/2026 (trả lời câu hỏi trước khi code). Triển khai xong 18/10/2026 (TASK-055 READY_FOR_REVIEW — [bàn giao](../chất-lượng/handover-2026-10-18.md), mục "Bổ sung F-046").
- **Bối cảnh:** chủ dự án yêu cầu ở drawer **Thu tiền bàn**: "có thể sửa, xóa món và có thể xóa bàn".
  - Trước đây (ADR-003 Q-010) quầy chỉ hủy được **đơn chờ tiếp nhận** (`PENDING`);
  - "Đóng bàn trống" chỉ làm được khi bàn chưa có đơn nào (Q-018).
  - Nên đơn "Đang chuẩn bị" / đã pha xong gọi nhầm hoặc khách đổi ý thì không xử lý được trước khi thu tiền.
- **Thay đổi so với:** ADR-003 Q-010 (chỉ hủy `PENDING`) — mở rộng thêm sửa / xóa món ở mọi trạng thái **chưa thu tiền**, có phân quyền.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-33 | **Phân cấp quyền.** Món thuộc đơn `PENDING`: nhân viên tự sửa / xóa. Món thuộc đơn đã tiếp nhận (`PREPARING`) hoặc đã pha xong (`COMPLETED`): trưởng ca / quản lý tự làm; nhân viên phải nhờ trưởng ca / quản lý nhập tài khoản duyệt. **Luôn bắt buộc lý do**; mọi lần sửa / xóa ghi nhật ký thao tác + bảng lịch sử `OrderItemVoids` |
| D-34 | **Kho khi xóa món đã pha xong** (kho đã trừ): người xóa chọn **Ghi hủy hàng** (mặc định — nguyên liệu đã dùng, ghi vào danh sách hủy hàng) hoặc **Hoàn kho** (nhập nhầm, thực ra chưa làm — cộng lại kho theo đúng lượng và giá vốn đã trừ). Món chưa pha xong (`PENDING`/`PREPARING`): chỉ trả phần kho đang giữ |
| D-35 | **"Xóa bàn" = hủy lượt phục vụ:** hủy mọi đơn chưa thu của phiên, đóng phiên (không tạo lượt thu), bàn trống lại. Bàn vẫn còn trong danh sách bàn. Không áp dụng khi phiên đã thu một phần (chia bill) — khi đó xóa từng món chưa thu |

## Thích nghi kỹ thuật

| Vấn đề | Cách làm | Lý do |
| --- | --- | --- |
| "Sửa món" | Giảm số lượng (về 0 = xóa dòng). Tăng số lượng / thêm món = "Gọi thêm món" (đã có) | Tăng số lượng cần giữ kho + giá mới — đã có luồng gọi món |
| Dòng bị xóa hẳn | Xóa dòng khỏi đơn; ảnh chụp (tên, SL, giá, lý do, người duyệt) lưu ở `OrderItemVoids` | Mọi báo cáo / bill / chia bill / tem đang tính theo dòng còn lại — không phải sửa từng chỗ lọc "dòng đã hủy" |
| Khuyến mãi đơn | Tính lại theo chính khuyến mãi đơn đã áp (bỏ nếu không còn đạt đơn tối thiểu); khuyến mãi dòng đi theo số lượng | Khách không được lợi / thiệt so với lúc gọi |
| Hoàn kho món đã pha | Giao dịch kho mới `VOID_BACK` (gắn đơn), giá = giá vốn đã trừ; giá vốn dòng (`CogsAmount`) giảm đúng phần hoàn; lô mới nguồn `RESTOCK` nếu nguyên liệu theo lô; hoàn tiền sau đó không hoàn kho lần hai | Giữ bất biến Σ lô = tồn, giá vốn khớp kho |
| Ghi hủy hàng món đã pha | Dòng `WasteLogs` (lý do Khác, ghi chú "Xóa món đã pha …"), **không** trừ kho lần nữa | Kho đã trừ lúc hoàn tất |
| Kiểm quyền đồng thời | SP khóa dòng đơn và kiểm lại trạng thái: nếu đơn vừa được tiếp nhận trong lúc nhân viên bấm xóa (không có người duyệt) → `403` | Không lách được quyền bằng tranh chấp thời điểm |
| Bàn đã thu một phần (chia bill) | Không hủy bàn được (`409 SESSION_HAS_PAYMENTS`), nhưng xóa từng món / đơn chưa thu được. Bỏ nốt món chưa thu cuối cùng → đơn còn toàn dòng đã thu thành `PAID`, phiên tự đóng như lượt thu phần cuối (`sp_CloseIfSettled`, phát `session.closed`) | Không để bàn kẹt ở trạng thái mở khi không còn gì để thu; cùng kết quả với `sp_SettleSplit` khi thu phần cuối |
| Hoàn tiền sau khi đã xóa món đã pha | `sp_RefundPayment` khi hoàn kho trừ ra phần đã hoàn (`VOID_BACK`) **và** phần đã ghi hủy hàng (`WasteLogs` gắn `VoidId`) ở lần xóa món trước đó | Nguyên liệu đã cộng lại hoặc đã ghi là bỏ đi thì không cộng kho lần nữa (bất biến `OVER_RESTOCK`) |

## Hệ quả

- Migration `0033_sua_xoa_mon.sql`; SP mới `sp_VoidOrderItem` (cùng file: `sp_VoidLineCore`, `sp_RecalcOrder`, `sp_CloseIfSettled`), `sp_CancelOrders`; sửa `sp_RefundPayment` (không hoàn kho phần đã `VOID_BACK` hoặc đã ghi hủy hàng khi xóa món).
- Bất biến mới: `ORDER_LINES_MISMATCH`, `OVER_RESTOCK`; `COGS_MISMATCH` trừ phần giá vốn đã hoàn.
- Rule mới: BR-066…BR-070 ([business-rules](../nghiệp-vụ/business-rules.md)). Hướng dẫn cho quán: [`chức-năng-mới/25-sửa-xóa-món-hủy-bàn.md`](../../chức-năng-mới/25-sửa-xóa-món-hủy-bàn.md).
- Chi tiết: [FEATURE-046](../chức-năng/FEATURE-046.md), [TASK-055](../công-việc/TASK-055.md).
