# Người dùng và quyền

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §4 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

## 4.1. Tác nhân chính

| Actor | Định danh | Hành động được phép | Phạm vi dữ liệu | Điều kiện | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| **Khách (CUSTOMER)** | Không đăng nhập; nhận **session token** (cookie/localStorage) khi quét QR | Quét QR, chọn gộp/tách phiên, xem menu, gửi đơn (nhiều lần), theo dõi đơn, **bấm Gọi thanh toán** (D-2) | Chỉ phiên mình đang tham gia và các đơn trong phiên đó | Token hợp lệ, phiên còn mở | CONFIRMED |
| **Nhân viên quầy (STAFF)** | Đăng nhập username/password | Xem **tất cả** đơn/phiên đang xử lý; tiếp nhận đơn (Q-004b); hoàn tất đơn; nhận yêu cầu thanh toán; **thu tiền mặt tại bàn & đóng phiên**; in bill; **bán mang đi** (D-3); hủy đơn PENDING (Q-010) | Toàn bộ đơn/phiên của quán | Tài khoản `IsActive = true` | CONFIRMED (hủy: PROPOSED) |
| **Quản lý (ADMIN)** | Đăng nhập | Mọi quyền của STAFF **+** CRUD menu/danh mục, bàn + QR, nguyên liệu, BOM, điều chỉnh kho, tài khoản nhân viên, báo cáo | Toàn bộ | Tài khoản `IsActive = true`, role ADMIN | CONFIRMED (ADMIN kế thừa STAFF: PROPOSED — Word không nói rõ, nhưng hợp lý cho quán nhỏ) |

## 4.2. Tác nhân hệ thống (secondary)

| Actor | Vai trò | Ghi chú |
| --- | --- | --- |
| ~~Cổng thanh toán VietQR~~ | — | Bỏ theo D-1; làm sau |
| SQL Server | Thực thi SP trừ kho trong transaction; rollback khi thiếu | Nơi giữ invariant BR-001/BR-002 |
| Realtime hub (Socket.io) | Phát sự kiện đến đúng nhóm client (quầy / phiên khách) | Không phải nguồn sự thật; client phải fetch lại khi reconnect |
| Máy in nhiệt | Nhận lệnh in từ trình duyệt máy POS | Khổ 58/80 mm |
| Cron job | Chốt ca, tổng hợp ngày, dọn giỏ rác | Làm sau (REQ-020) |
| Storage ảnh | Lưu/nén ảnh món | Làm sau (REQ-021) |

## 4.3. Câu hỏi quyền đã trả lời / chưa trả lời

| Câu hỏi | Trả lời | Trạng thái |
| --- | --- | --- |
| Khách có tự đăng ký tài khoản không? | Không. Khách không có tài khoản | CONFIRMED |
| Ai cấp tài khoản STAFF? | ADMIN | CONFIRMED |
| Tài khoản ADMIN đầu tiên tạo thế nào? | Seed khi khởi tạo DB (username/password đặt qua biến môi trường) | PROPOSED |
| Một người có nhiều vai trò không? | Không; mỗi tài khoản một role (STAFF/ADMIN) | PROPOSED |
| Khách A có xem được đơn của khách B không? | Chỉ khi cùng phiên (đã chọn "Gộp chung"). Phiên cá nhân trên cùng bàn **không** thấy nhau | CONFIRMED (suy trực tiếp từ US1) |
| Nhiều nhân viên dùng chung một tài khoản trên nhiều máy? | Word giả định có thể xảy ra (US5 AC2 bản 2) → hệ thống phải an toàn trong trường hợp đó, nhưng không khuyến khích | CONFIRMED |
| STAFF có sửa menu/kho không? | Không | PROPOSED |

> **Nguyên tắc bắt buộc:** Quyền được kiểm ở **server** cho mọi endpoint; ẩn/disable nút trên UI chỉ là trải nghiệm. Khách gọi thẳng API hoàn tất đơn phải bị từ chối 401/403.
