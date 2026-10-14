# Quy tắc nghiệp vụ

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §7 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

> **14/10/2026:** mọi rule trong bảng đã được triển khai và có test (xem `tài-liệu/chất-lượng/test-strategy.md` → "Bộ test hiện có"). BR-010 → CONFIRMED (ADR-001). Các rule còn ghi PROPOSED được triển khai **đúng nội dung đề xuất** (ADR-003); nhóm xác nhận lại khi review.

Mỗi rule có ID để feature/test tham chiếu. **Không chép lại nội dung rule vào skill hay feature; chỉ link ID.**

| ID | Rule | Điều kiện áp dụng | Ví dụ đúng / sai | Ngoại lệ | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| BR-001 | Tồn kho mỗi nguyên liệu luôn `≥ 0` sau mọi giao dịch. Giao dịch làm kho âm phải rollback toàn bộ và báo tên món/nguyên liệu thiếu | Mọi lệnh trừ kho | Kho còn 25 ml cốt cà phê, BOM cần 25 ml → OK (còn 0). Cần 30 ml → rollback | Không | CONFIRMED |
| BR-002 | Mỗi đơn chỉ được trừ kho **đúng một lần**, bất kể bao nhiêu client bấm hoàn tất | Hoàn tất đơn | Hai máy bấm cùng lúc → một thành công, một nhận "đã được nhân viên khác xử lý" | Không | CONFIRMED |
| BR-003 | Định lượng BOM `> 0`; mỗi dòng BOM phải có nguyên liệu; một món có thể có 0 dòng BOM (món không quản lý kho) | Lưu BOM | `-10 ml` → từ chối; `0` → từ chối | Món không có BOM thì hoàn tất không trừ gì | CONFIRMED (món 0 BOM: PROPOSED) |
| BR-004 | `Username` duy nhất (không phân biệt hoa/thường) | Tạo/sửa tài khoản | Có `staff1` → tạo `Staff1` bị từ chối | Không | CONFIRMED |
| BR-005 | Báo cáo: `from ≤ to`, `to ≤ hôm nay` | Xem báo cáo | 01/10–10/10/2026 OK; 01/12–10/12/2026 từ chối | Không | CONFIRMED |
| BR-006 | Đơn mang đi chỉ được tạo khi nhân viên xác nhận đã thu tiền mặt (`amountReceived ≥ TotalAmount`); đơn sinh ra ở trạng thái `PAID` | Tạo đơn mang đi | Chưa bấm "Đã nhận tiền" → chặn, bôi đỏ; `amountReceived` < tổng → từ chối | Không | CONFIRMED (D-3) |
| BR-007 | Chỉ STAFF/ADMIN đăng nhập mới ghi nhận được thanh toán (thu tiền phiên, tạo đơn mang đi); khách không có API nào đổi `PaymentStatus` | Mọi thao tác thu tiền | Khách gọi `settle` → 401 | Không | CONFIRMED (D-1/D-2) |
| BR-018 | Khách chỉ Gọi thanh toán được khi phiên `OPEN` và có ≥ 1 đơn không `CANCELLED`; bấm lặp lại không tạo thêm yêu cầu (idempotent, cập nhật thời gian gọi lại) | Gọi thanh toán | Phiên chưa có đơn → nút ẩn/409 | Không | CONFIRMED (D-2) / chi tiết PROPOSED |
| BR-019 | Thu tiền phiên = Σ `TotalAmount` của **mọi** đơn trong phiên trừ đơn `CANCELLED`; một phiên chỉ thu tiền **một lần**; phiên không còn đơn `PENDING` (phải tiếp nhận hoặc hủy trước) | Thu tiền phiên | Hai máy cùng bấm Đã thu tiền → một thành công, một 409 | Không | CONFIRMED (D-2) / "không còn PENDING": PROPOSED |
| BR-020 | Sau khi phiên `CLOSED`, khách trong phiên không gửi thêm đơn được; muốn gọi thêm phải quét QR tạo phiên mới | Gửi đơn | — | Không | PROPOSED |
| BR-008 | Gộp phiên chỉ khi phiên `OPEN`; nếu phiên đã `CLOSED` → tạo phiên mới và báo khách | Quét QR bàn có phiên | Phiên vừa thanh toán xong 3 giây trước → tạo mới | Không | CONFIRMED |
| BR-009 | Gửi đơn: nếu **bất kỳ** món nào không đủ nguyên liệu khả dụng hoặc `IsAvailable = false` → từ chối toàn bộ đơn, trả danh sách món thiếu | Gửi đơn | Giỏ [Trà đào, Cà phê sữa], trà đào hết → từ chối cả đơn, báo "Trà đào" | Không | CONFIRMED (xem Q-005) |
| BR-010 | Giữ kho khi gửi đơn (`ReservedQty += cần`), trừ thật khi hoàn tất, trả lại khi hủy | Nếu Q-001 = A | Kho 100 ml, đơn 1 giữ 60, đơn 2 cần 60 → đơn 2 bị từ chối dù `StockQty` vẫn 100 | Nếu Q-001 ≠ A rule này N/A | CONFIRMED (ADR-001) |
| BR-011 | Đơn giá dòng đơn (`UnitPrice`) được **chốt tại thời điểm đặt**; đổi giá menu sau đó không ảnh hưởng đơn cũ | Tạo đơn | — | Không | PROPOSED |
| BR-012 | `TotalAmount` = Σ(`Quantity × UnitPrice`) tính ở server; client gửi giá bị bỏ qua | Tạo đơn | — | Không | PROPOSED |
| BR-013 | Chỉ đơn `PREPARING` mới được hoàn tất; chỉ đơn `PENDING` mới được hủy | Đổi trạng thái | Bấm hoàn tất đơn `PENDING` (chưa tiếp nhận) → 409 | Theo Q-004b (Q-004 đã chốt trả sau — ADR-000) | PROPOSED |
| BR-014 | Hóa đơn chính thức chỉ in cho phiên/đơn đã `PAID`; trước đó chỉ in được "Phiếu tạm tính" (ghi rõ chữ TẠM TÍNH) — nhân viên có thể mang ra bàn khi khách gọi thanh toán | In bill | — | — | CONFIRMED (US7 Given) / tạm tính: PROPOSED |
| BR-015 | Số lượng mỗi dòng đơn: số nguyên `1..50` | Tạo đơn | — | Giới hạn 50 là PROPOSED | PROPOSED |
| BR-016 | Cảnh báo "sắp hết" khi `Available ≤ LowStockThreshold` của nguyên liệu | Báo cáo/kho | — | — | PROPOSED (Word chỉ nói "cảnh báo nguyên liệu sắp hết", chưa định nghĩa ngưỡng) |
| BR-017 | Khóa tài khoản (`IsActive = false`) → mọi token hiện có bị từ chối ở request kế tiếp | Auth | — | — | PROPOSED |
