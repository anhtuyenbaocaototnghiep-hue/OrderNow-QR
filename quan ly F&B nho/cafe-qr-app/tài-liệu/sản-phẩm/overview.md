# Tổng quan sản phẩm

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §1 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

## 1.1. Vấn đề và mục tiêu (nguồn: demo.docx, mục I–II)

| Nội dung | Mô tả | Trạng thái |
| --- | --- | --- |
| Hệ thống | Web-App khép kín cho quán cà phê vừa và nhỏ: khách quét QR tại bàn để xem menu và gọi món trên trình duyệt điện thoại (không cài app); nhân viên quầy nhận đơn realtime, thu tiền, bấm hoàn tất, in hóa đơn; quản lý cấu hình menu/bàn/BOM, xem kho và báo cáo | CONFIRMED |
| Vấn đề phía khách | Chờ nhân viên ghi order giờ cao điểm; sai món do ghi tay | CONFIRMED |
| Vấn đề phía vận hành | Nghẽn thông tin giữa bàn khách và quầy pha chế | CONFIRMED |
| Vấn đề phía quản lý | Thất thoát nguyên liệu, khó kiểm soát định lượng; cần trừ kho tự động theo BOM | CONFIRMED |
| Mục tiêu dài hạn | Luồng Khách → Thu ngân → Pha chế liền mạch; dữ liệu toàn vẹn (không âm kho, không lệch doanh thu); đủ ổn định để chạy thử tại một quán thật | CONFIRMED |
| Sản phẩm bàn giao | 01 web-app chạy online (Front-end **HTML/CSS/JS thuần**, Back-end **Node.js**, **SQL Server**, REST API — D-4) + bộ tài liệu đồ án (đặc tả, UI/UX, sơ đồ CSDL) | CONFIRMED (D-4 thay "Next.js, Node.js/C#" trong Word) |

## 1.2. Phạm vi (nguồn: demo.docx, mục IV.3 và module 1–5)

> **Cập nhật 20/10/2026 — bảng dưới là phạm vi bản đầu (14/10/2026), giữ lại làm lịch sử.** Phạm vi hiện hành (CURRENT) nằm ở [project-brief.md](project-brief.md) mục 5–6 (TASK-057). Sau bản đầu, chủ dự án đã duyệt mở rộng: hội viên, khuyến mãi, chốt ca… ([ADR-005](../quyết-định/ADR-005-mo-rong-giai-doan-2.md)); chấm công, tích điểm / tem / voucher / chiến dịch (CRM), kho nâng cao, tổng hợp số liệu ngày bằng job nền ([ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md)); sửa / xóa món, hủy bàn ([ADR-007](../quyết-định/ADR-007-sua-xoa-mon-huy-ban.md)); hội viên tại bàn, Thẻ thành viên ([ADR-008](../quyết-định/ADR-008-hoi-vien-tai-ban-the-thanh-vien.md)) — tất cả đã triển khai. Các ô bị ảnh hưởng ghi "đã thay đổi bởi ADR-006" ngay tại chỗ. **Vẫn không làm:** lương, nhiều chi nhánh / nhiều kho, thanh toán chuyển khoản / VietQR (D-1).

| Nhóm | Nội dung |
| --- | --- |
| **Làm trong bản đầu (MVP)** | Luồng cốt lõi **Order QR → Realtime quầy → Hoàn tất & trừ kho → Gọi thanh toán → Thu tiền mặt tại bàn → In bill**, cụ thể: (1) quét QR định danh bàn, tách/gộp phiên; (2) xem menu, giỏ hàng, gửi đơn; (3) theo dõi trạng thái đơn realtime phía khách + nút **Gọi thanh toán** (D-2); (4) dashboard nhân viên: nhận đơn realtime, tiếp nhận, hoàn tất món, nhận yêu cầu thanh toán, **thu tiền mặt tại bàn**, in hóa đơn, đóng bàn; (5) **mục Bán mang đi** riêng, thu tiền mặt tại quầy (D-3); (6) admin: menu, bàn + QR, nguyên liệu, BOM, tài khoản nhân viên, báo cáo doanh thu |
| **Làm sau** | Thanh toán chuyển khoản/VietQR qua cổng (PayOS/SePay/MoMo) — D-1 đã bỏ khỏi MVP; cron job chốt ca / tổng hợp doanh thu cuối ngày; hệ thống lưu trữ & nén ảnh món; mở ngăn kéo tiền (xem Q-007) — **đã thay đổi bởi ADR-006 (20/10/2026):** "tổng hợp doanh thu cuối ngày" đã làm bằng job nền `daily-summary` 00:30 (F-043, D-32); chốt ca vẫn thủ công (F-018); các mục còn lại vẫn làm sau — xem [project-brief.md](project-brief.md) mục 6 |
| **Không làm** | Quản lý nhân sự (chấm công, lương), CRM khách hàng, chuỗi nhiều chi nhánh — Word ghi "kiên quyết cắt giảm" — **đã thay đổi bởi ADR-006 (20/10/2026):** chấm công (F-035) và CRM — hội viên (F-014, ADR-005), tích điểm / tem (F-039), giới thiệu bạn & voucher (F-038), chiến dịch (F-037) — đã được chủ dự án duyệt và triển khai. **Lương** và **nhiều chi nhánh** vẫn không làm — xem [project-brief.md](project-brief.md) mục 6 |
| **Giới hạn tổ chức** | **Một quán, một cơ sở, một kho nguyên liệu**. Không có khái niệm chi nhánh, không có dữ liệu riêng từng tổ chức |

> Agent không được tự thêm chọn chi nhánh, nhiều kho, tích điểm/CRM, chấm công dù "tiện tay" làm được.
>
> **Cập nhật 20/10/2026 (đã thay đổi bởi ADR-006):** tích điểm / CRM và chấm công **không còn bị cấm** vì chủ dự án đã yêu cầu và duyệt ([ADR-005](../quyết-định/ADR-005-mo-rong-giai-doan-2.md), [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md)), không phải agent tự thêm. Nguyên tắc vẫn giữ: agent **không tự thêm** chức năng ngoài [project-brief.md](project-brief.md) mục 5; chi nhánh, nhiều kho, lương vẫn cấm. Mọi mở rộng mới phải có yêu cầu của chủ dự án và ADR.

## 1.3. Nguồn lực và thời gian (nguồn: demo.docx, mục IV)

| Hạng mục | Nội dung | Trạng thái |
| --- | --- | --- |
| Nhóm | Tuyến – Front-end; Nhật Anh – Back-end/Database; Sáng – Testing | CONFIRMED |
| Thời gian | 8 tuần; **tối thiểu 2 tuần cuối dành cho kiểm thử** (đặc biệt kịch bản ép tải/tranh chấp kho) | CONFIRMED |
| Chi phí | Dùng hosting/API miễn phí cho mục đích học tập | CONFIRMED (nhà cung cấp cụ thể: UNKNOWN) |
| Công cụ AI | Đã có skill `do-an-cafe-reviewer` hỗ trợ rà soát mã nguồn | CONFIRMED (nội dung skill chưa được đọc trong tài liệu này — cần đối chiếu khi đưa skill vào `.agent/skills/` — xem `vận-hành/local-development.md` mục Skills) |

## 1.4. Chỉ tiêu định lượng đã nêu trong Word

| ID | Chỉ tiêu | Cách kiểm chứng đề xuất | Trạng thái |
| --- | --- | --- | --- |
| NFR-001 | Đồng bộ trạng thái đơn giữa các thiết bị **< 2 giây** (từ lúc khách bấm gửi đến khi quầy thấy) | Đo timestamp client gửi → timestamp quầy nhận sự kiện realtime, trên mạng Wi-Fi quán, lặp ≥ 30 lần, lấy p95 | CONFIRMED (chỉ tiêu) / PROPOSED (cách đo) |
| NFR-002 | **100 %** kịch bản ép tải tranh chấp tồn kho pass: nhiều bàn order cùng lúc, kho không bao giờ âm, tổng trừ = tổng BOM của các đơn thành công | Script bắn N request đồng thời (k6/Artillery/script Node) vào API hoàn tất/đặt món với kho chỉ đủ M suất; assert: đúng M thành công, N–M bị từ chối, `StockQty ≥ 0`, tổng `InventoryTransactions` khớp | CONFIRMED (chỉ tiêu) / PROPOSED (cách đo) |
| NFR-003 | Khách order trong **≤ 3 thao tác** sau khi quét QR | Đếm số tap trên luồng chuẩn: chọn món → giỏ → gửi | CONFIRMED (chỉ tiêu, cần định nghĩa "thao tác"). Word ghi "**dưới** 3 thao tác" → xem Q-016 |
| NFR-004 | Giao diện khách mobile-first, "siêu nhẹ" | Chưa có số cụ thể; đề xuất: trang menu load được trên 4G trong < 3 s, bundle trang khách < 300 KB gzip | UNKNOWN (số) / PROPOSED (ngưỡng) |

> Theo phương pháp: agent **không** tự thêm cam kết hiệu năng/quy mô khác (ví dụ "chịu 10.000 user") nếu nhóm chưa quyết định.
