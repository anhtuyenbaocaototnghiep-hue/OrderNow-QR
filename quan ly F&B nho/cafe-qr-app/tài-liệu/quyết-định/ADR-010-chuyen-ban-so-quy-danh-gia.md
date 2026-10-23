# ADR-010 — Chuyển bàn, hủy / sửa khoản sổ quỹ đã duyệt, đánh giá sau khi dùng món

- **Trạng thái:** ACCEPTED (21/10/2026). Chủ dự án chọn các phương án dưới đây trong phiên làm việc ngày 21/10/2026, trả lời câu hỏi trước khi code. Chọn phương án khuyến nghị ở mọi câu; riêng câu đánh giá chọn thêm "hiện sao trung bình trên menu".
- **Bối cảnh:** chủ dự án hỏi góp ý "chuyên gia F&B" cho đồ án, rồi chọn làm 3 việc: "chuyển bàn, sửa hủy khoản sổ quỹ đã duyệt, đánh giá sau khi dùng món".
  - **Chuyển bàn:** khách đổi chỗ xảy ra hằng ngày nhưng app chưa có. Đơn và tên bàn trên thẻ đơn cứ gắn với bàn cũ nên dễ mang món ra nhầm.
  - **Sổ quỹ (F-033):** khoản đã duyệt không có cách sửa / hủy. Ghi nhầm số tiền thì két lệch tới cuối ca.
  - **Đánh giá:** chưa có kênh nghe khách. Menu engineering (F-041) chỉ dựa trên số bán và lãi gộp.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-43 | **Chuyển bàn.** <br>• Nhân viên (`pos.use`) chuyển **cả nhóm** (phiên chưa đóng) sang **bàn bất kỳ đang dùng**: bàn trống, hoặc bàn đang có nhóm khác. Khi đó hai nhóm ngồi chung bàn nhưng **bill vẫn riêng**, như khách chọn "Cá nhân". <br>• Đi theo nhóm: đơn, chia bill, hội viên, gọi nhân viên, gọi thanh toán. Đơn của nhóm đổi bàn, nên thẻ đơn ở quầy hiện bàn mới. <br>• Điện thoại khách trong nhóm tự chuyển sang bàn mới. <br>• Có lịch sử chuyển bàn và nhật ký thao tác. <br>• **Không gộp bill.** |
| D-44 | **Sổ quỹ — khoản đã duyệt nhập sai.** <br>• Nút **Hủy** (bắt buộc lý do): khoản → "Đã hủy", vẫn còn trong sổ; két cộng / trừ lại vì tiền dự kiến chỉ tính khoản đã duyệt. <br>• Nút **Sửa** = hủy khoản cũ + ghi khoản thay thế, **cùng một thao tác**. Khoản mới đi qua quy tắc duyệt như thường (vượt ngưỡng / danh mục cần duyệt → chờ duyệt) và ghi "Thay khoản #N". <br>• **Chỉ khi ca của khoản còn mở.** Ca đã đóng → `409 SHIFT_CLOSED`: số đã chốt giữ nguyên. <br>• Khoản đang chờ duyệt vẫn dùng **Từ chối** như cũ. |
| D-45 | **Quyền hủy / sửa khoản đã duyệt = quyền duyệt hiện có.** <br>• Trưởng ca: khoản ≤ `manager.cash_out_approve_max` (2.000.000đ). Quản lý: mọi khoản. <br>• Không ai tự hủy khoản do chính mình ghi, trừ quản lý → `403 SELF_APPROVAL`. <br>• Nhân viên đứng máy: trưởng ca / quản lý nhập tài khoản. |
| D-46 | **Đánh giá sau khi dùng món.** <br>• Ở **màn cảm ơn** sau khi thanh toán, trên điện thoại thuộc nhóm: chấm **1–5 sao từng món** nhóm đã gọi (không tính món đã hủy / xóa) + **góp ý chung** (≤ 300 ký tự). Không bắt buộc chấm mọi món, nhưng phải có ít nhất 1 món được chấm hoặc có góp ý. <br>• Mỗi điện thoại đánh giá **1 lần / lượt**, trong **24 giờ** sau khi nhóm thanh toán. <br>• Quản lý xem trang **Đánh giá**: sao trung bình theo món, phân bố sao, góp ý, lọc theo ngày. |
| D-47 | **Báo quầy khi đánh giá thấp:** có món ≤ 2 sao → quầy nhận báo realtime (dải "Đánh giá thấp" + âm báo, có bàn, món, góp ý) để nhân viên ra xử lý khi khách còn ở quán. Nhân viên bấm **Đã xử lý** để ẩn. |
| D-48 | **Sao trung bình trên menu khách:** món có **≥ 5 đánh giá trong 90 ngày gần nhất** hiện "★ 4,6 (12)" (một chữ số lẻ). Ngưỡng và số ngày chỉnh ở Cài đặt (`review.menu_min_count`, `review.menu_days`). Món mới / ít đánh giá không hiện sao, để không bị thiệt. |

Chủ dự án **không chọn**:
- gộp bill khi chuyển bàn;
- sửa trực tiếp khoản sổ quỹ;
- hủy khoản của ca đã đóng;
- chỉ quản lý được hủy khoản sổ quỹ;
- tặng điểm hội viên khi đánh giá;
- chuyển chỉ sang bàn trống.

## Thích nghi kỹ thuật

| Vấn đề | Cách làm | Lý do |
| --- | --- | --- |
| Chuyển bàn đụng nhiều dữ liệu | SP `sp_MoveSession`, một transaction: <br>• khóa phiên, bàn đích; <br>• đổi `Sessions.TableId` và `Orders.TableId` mọi đơn của phiên; <br>• ghi `SessionTableMoves (SessionId, FromTableId, ToTableId, MovedBy, MovedAt)`. <br>Gọi nhân viên / chia bill gắn theo phiên nên tự đi theo | Thẻ đơn, phiếu pha, bill lấy tên bàn từ đơn / phiên. Báo cáo theo bàn (F-042) tính theo bàn cuối cùng của phiên |
| Điện thoại khách đang ở URL bàn cũ (`/t/{qr}`) | Sự kiện `session.table_changed` tới room phiên kèm mã QR bàn mới: điện thoại chuyển `sessionId` sang khóa của bàn mới rồi mở lại trang ở `/t/{qr mới}/…`. Điện thoại mất mạng lúc chuyển: khi tải lại thấy phiên đã ở bàn khác thì tự chuyển | Khách đang ngồi bàn mới (có QR in sẵn) nên nhận mã QR bàn mới là hợp lý; khách khác quét QR bàn mới thấy nhóm này để Gộp |
| Hủy khoản sổ quỹ | `CashTransactions.Status` thêm `VOIDED` + `VoidedBy / VoidedAt / VoidReason / ReplacedById`. SP `sp_VoidCashTxn` (khóa ca → chạy tuần tự với `sp_CloseShift`), khoản thay thế tạo trong cùng transaction | Tiền dự kiến / chốt ca / sổ quỹ / lãi lỗ vốn chỉ tính `APPROVED`, nên khoản đã hủy tự ra khỏi mọi tổng |
| Lưu đánh giá | `Reviews (SessionId, ClientToken, Comment, HasLow, HandledBy / HandledAt, CreatedAt)`, `ReviewItems (ReviewId, MenuItemId, Stars 1–5)`. Duy nhất `(SessionId, ClientToken)` | Một điện thoại một lần / lượt; không lưu SĐT / tên khách |
| Sao trên menu | Tính khi tải menu (truy vấn gộp theo món), ngưỡng trong Settings | Số lượt nhỏ, một quán; không cần bảng tổng hợp |
| Chống spam | Chỉ điện thoại thuộc phiên (cookie), phiên đã thanh toán ≤ 24 giờ, sao 1–5, món phải thuộc phiên; giới hạn tần suất như các API khách | Không đăng nhập / OTP (D-6) |

## Hệ quả

- Migration:
  - `0036_chuyen_ban.sql`: `SessionTableMoves`;
  - `0037_huy_khoan_so_quy.sql`: `CashTransactions` thêm `VOIDED` + cột;
  - `0038_danh_gia.sql`: `Reviews`, `ReviewItems`, Settings `review.menu_min_count = 5`, `review.menu_days = 90`.
- Feature:
  - [FEATURE-049](../chức-năng/FEATURE-049.md) chuyển bàn — [TASK-061](../công-việc/TASK-061.md);
  - [FEATURE-050](../chức-năng/FEATURE-050.md) hủy / sửa khoản sổ quỹ — [TASK-062](../công-việc/TASK-062.md);
  - [FEATURE-051](../chức-năng/FEATURE-051.md) đánh giá — [TASK-063](../công-việc/TASK-063.md).
- Business rule: BR-078 … BR-083.
