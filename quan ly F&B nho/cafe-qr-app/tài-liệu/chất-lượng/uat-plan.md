# Kế hoạch & biên bản nghiệm thu người dùng (UAT)

> Sổ tay 15 bước — bước 14, lớp **UAT**: "người đại diện Actor xác nhận nhu cầu". Kiểm thử tự động (355 test tích hợp, 54 E2E, ép tải) đã chứng minh từng AC — xem [traceability.md](traceability.md). UAT là bước **người thật** dùng thử trên **thiết bị thật** để xác nhận sản phẩm đúng nhu cầu, và kiểm các điểm máy không kiểm được.
>
> **Trạng thái:** CHỜ THỰC HIỆN — agent không được tự điền kết quả UAT (TASK-057, `.agent/rules.md`). Người đại diện điền cột Kết quả / Người / Ngày rồi chủ dự án ký ở cuối. Kết quả UAT là điều kiện của Gate G4 ([quality-gates.md](quality-gates.md)).

## 1. Chuẩn bị

| Hạng mục | Yêu cầu |
| --- | --- |
| Môi trường | Máy chủ chạy `npm start` trên máy quầy, dữ liệu dùng thử `CafeQrDev` (đã có menu, bàn, nguyên liệu). **Không** dùng dữ liệu khách thật — SĐT hội viên dùng số thử |
| Thiết bị | 2 điện thoại thật (1 Android Chrome, 1 iPhone Safari) cùng Wi-Fi với máy chủ; 1 máy tính quầy (Chrome / Edge); máy in hóa đơn 80 mm nếu có |
| Tài khoản | `admin` (ADMIN), `staff1` (STAFF), 1 tài khoản trưởng ca (MANAGER) tạo ở trang Tài khoản |
| In QR | Trang Quản lý → Bàn → In QR (hoặc `npm run qr:links`), đặt `PUBLIC_BASE_URL` theo địa chỉ LAN in ra khi khởi động |
| Người đại diện (NEEDS_CONFIRMATION — xem [actors.md](../nghiệp-vụ/actors.md)) | ACT-GUEST / ACT-MEMBER: 2 người ngoài nhóm đóng vai khách · ACT-STAFF: thành viên kiểm thử (Sáng) · ACT-LEAD, ACT-ADMIN: chủ dự án |

## 2. Kịch bản theo Actor

Mỗi dòng: làm theo bước, so với **Kỳ vọng**, ghi `Đạt` / `Không đạt` (+ mô tả, ảnh chụp nếu không đạt → ghi DEF mới trong [defect-log.md](defect-log.md)).

### ACT-GUEST / ACT-MEMBER — khách trên điện thoại thật

| UAT | Use Case | Bước | Kỳ vọng | Kết quả | Người | Ngày |
| --- | --- | --- | --- | --- | --- | --- |
| UAT-01 | UC-01 | Quét QR bàn trống bằng camera điện thoại | Mở thẳng menu đúng tên bàn, không cần cài app / đăng nhập | | | |
| UAT-02 | UC-01 | Người thứ hai quét cùng bàn | Hỏi "Gộp chung nhóm" / "Cá nhân"; Gộp → thấy đơn của nhóm | | | |
| UAT-03 | UC-02 | Chọn 2 món (1 món có Size), thêm ghi chú, gửi đơn | Gửi được trong ≤ 3 thao tác sau khi chọn món; màn theo dõi hiện "Chờ xác nhận" | | | |
| UAT-04 | UC-02 | Đang chọn món thì tải lại trang | Giỏ còn nguyên món, tùy chọn, ghi chú | | | |
| UAT-05 | UC-03 | Quầy tiếp nhận rồi hoàn tất đơn | Điện thoại tự đổi trạng thái (không F5), báo "Đã xong, vui lòng nhận tại quầy" | | | |
| UAT-06 | UC-10 | Nhập SĐT thử → đăng ký (tick đồng ý) → "Xem thẻ thành viên" | Thấy tên che, điểm, thẻ tem, voucher có hạn dùng; không thấy mã voucher | | | |
| UAT-07 | UC-18 | Bấm "Gọi nhân viên" | Quầy có dải gọi + chuông; quầy bấm Đã xử lý → khách được báo | | | |
| UAT-08 | UC-06 | 2 khách cùng bàn bấm "Chia bill", mỗi người nhận món của mình | Mỗi người thấy phần của mình; gõ tên phần không bị mất chữ khi người kia thao tác | | | |
| UAT-09 | UC-04 | Bấm "Gọi thanh toán" | Quầy có dải "Gọi thanh toán"; sau khi thu, điện thoại hiện cảm ơn | | | |
| UAT-10 | — | Dùng điện thoại màn hình nhỏ, chữ phóng to (cài đặt trợ năng) | Không phải cuộn ngang; chữ đọc rõ | | | |

### ACT-STAFF — nhân viên quầy

| UAT | Use Case | Bước | Kỳ vọng | Kết quả | Người | Ngày |
| --- | --- | --- | --- | --- | --- | --- |
| UAT-11 | UC-11 | Đăng nhập `staff1`, mở ca với tiền đầu ca | Thanh trên hiện ca đang mở; chưa mở ca thì nút thu tiền khóa | | | |
| UAT-12 | UC-03 | Đơn mới đến khi đang mở màn Đơn hàng | Có âm báo, thẻ hiện ≤ 2 giây ở cột "Mới" | | | |
| UAT-13 | UC-08 | Gọi món tại bàn: chọn bàn trống, nhập SĐT hội viên, gắn, nhập món, gửi | Bàn mở, đơn vào "Đang pha", phiếu ghi "Nhân viên nhập" | | | |
| UAT-14 | UC-09 | Ở drawer Thu tiền: ✎ giảm một món đã tiếp nhận | Bị hỏi tài khoản trưởng ca; nhập đúng → tổng giảm, có lịch sử | | | |
| UAT-15 | UC-04 | Thu tiền mặt, nhập tiền khách đưa, in bill | Tiền thừa đúng; bill in vừa khổ 80 mm, có điểm hiện có nếu là hội viên | | | |
| UAT-16 | UC-05 | Bán mang đi, khách đưa thiếu tiền | Ô bôi đỏ, không thu được; đủ tiền → đơn vào "Đang pha" | | | |
| UAT-17 | UC-03 | Rút mạng máy quầy 30 giây trong lúc khách gửi đơn, cắm lại | Tự tải lại đơn nhỡ + báo "Có đơn hàng bị trễ" | | | |

### ACT-LEAD / ACT-ADMIN — trưởng ca, quản lý

| UAT | Use Case | Bước | Kỳ vọng | Kết quả | Người | Ngày |
| --- | --- | --- | --- | --- | --- | --- |
| UAT-18 | UC-07 | Trưởng ca hoàn tiền một phần cho lượt thu trong ca | Hoàn được; lượt thu ca trước thì cần quản lý | | | |
| UAT-19 | UC-11 | Đóng ca, nhập tiền đếm được | Hiện chênh lệch đúng công thức (tiền đầu ca + thu − chi − hoàn) | | | |
| UAT-20 | UC-14 | Quản lý sửa món, BOM, bật / tắt "còn bán" | Menu khách đổi ngay (≤ 2 giây) | | | |
| UAT-21 | UC-13 | Nhập kho theo đơn đặt hàng, ghi phiếu hủy | Tồn kho, giá vốn cập nhật; lịch sử giao dịch đúng | | | |
| UAT-22 | UC-16 | Xem báo cáo doanh thu, lãi lỗ, "Hôm nay" trên điện thoại (trưởng ca) | Số khớp các lượt thu đã làm trong buổi UAT; trưởng ca không thấy lãi | | | |
| UAT-23 | UC-17 | Nhân viên mở đường dẫn `/admin` | Bị chuyển về quầy; nhật ký thao tác ghi các hoàn tiền / xóa món | | | |
| UAT-24 | UC-13 | Quản lý nhập một phiếu kho thử → **Chi tiết → Sửa** số lượng (nhập lý do) → **Hủy phiếu** (nhập lý do) | Tồn đổi đúng mỗi bước; phiếu hiện "Đã sửa" rồi "Đã hủy", vẫn còn trong danh sách; lịch sử kho ghi lý do | | | |
| UAT-25 | UC-13 | Trưởng ca tạo phiếu kiểm kê nháp → **Sửa** (bớt / thêm nguyên liệu) → **Xóa**; quản lý chốt một phiếu rồi **Hủy phiếu** | Nháp sửa / xóa được ngay trên danh sách; hủy phiếu đã chốt → tồn trở lại như trước khi chốt, nhãn "Đã hủy"; trưởng ca không thấy nút Hủy phiếu đã chốt | | | |
| UAT-26 | UC-04 | Khách thanh toán xong → ở màn cảm ơn chấm 2 sao một món + góp ý → Gửi | Quầy có dải "Đánh giá thấp" + chuông; nhân viên bấm Đã xử lý → dải ẩn; quản lý thấy ở trang Đánh giá món | | | |
| UAT-27 | UC-08 | Quầy chuyển một nhóm đang ngồi sang bàn khác trong lúc khách mở trang theo dõi đơn | Thẻ đơn ghi bàn mới; điện thoại khách tự sang bàn mới, gọi thêm được | | | |
| UAT-28 | UC-17 | Quản lý mở **Quản lý → Tra cứu API**, gõ "thu tiền", mở một dòng → **Sao chép lệnh curl**; rồi đăng nhập tài khoản nhân viên và mở `/admin/api-docs` | Thấy API thu tiền kèm quyền Nhân viên và mã lỗi; lệnh curl dán ra đúng địa chỉ máy; nhân viên bị chuyển về quầy, không xem được danh sách | | | |
| UAT-29 | UC-17 | Quản lý mở **Quản lý → Hệ thống → Cài đặt**, đổi **Tên quán** và **Địa chỉ**, bấm **Lưu cài đặt**; mở menu khách bằng QR, in phiếu tạm tính một bàn; rồi đổi lại tên cũ | Thanh bên đổi tên ngay; menu khách và phiếu in tên / địa chỉ mới; tên rỗng bị báo lỗi ngay dưới ô | | | |
| UAT-30 | UC-11 | Nhân viên A mở ca, bán vài đơn, bấm **Đăng xuất**; chọn **Ở lại**, rồi bấm lại và chọn **Đến trang đóng ca**, đếm tiền, đóng ca, in phiếu, **Đăng xuất**. Nhân viên B (không mở ca) đăng xuất khi ca của A còn mở | A không thể về khi chưa đóng ca; phiếu chốt ca ghi đúng chênh lệch; B đăng xuất bình thường, ca của A vẫn chạy | | | |
| UAT-31 | UC-02, UC-03 | Cuối ngày đóng ca. Sáng hôm sau, trước khi mở ca: khách quét QR một bàn và thử gửi đơn; nhân viên thử tiếp nhận đơn còn chờ. Sau đó nhân viên bấm **Mở ca** | Khách xem được menu nhưng nút gửi ghi "Quán chưa mở ca"; quầy thấy dải cảnh báo, nút Tiếp nhận khóa; mở ca xong điện thoại khách tự gửi được (không cần quét lại), quầy tiếp nhận được | | | |

## 3. Kiểm tra chỉ làm được bằng tay (NOT_RUN trong kiểm thử tự động)

| ID | Liên quan | Việc | Kỳ vọng | Kết quả | Người | Ngày |
| --- | --- | --- | --- | --- | --- | --- |
| MAN-01 | AC-006-04, F-047 | In bill thật trên máy in nhiệt 80 mm (và 58 mm nếu có) | Vừa khổ, không tràn chữ, có TẠM TÍNH ở phiếu tạm tính | | | |
| MAN-02 | NFR-001 | Đo trên Wi-Fi quán: 30 lần gửi đơn, ghi thời gian quầy nhận | p95 < 2 giây | | | |
| MAN-03 | NFR-CMP | Safari iOS + Chrome Android: chạy UAT-01…09 | Hoạt động như trên Chromium | | | |
| MAN-04 | F-007 | Âm báo đơn mới / gọi nhân viên trên loa máy quầy | Nghe rõ, không lặp vô hạn | | | |
| MAN-05 | F-037 | Gửi chiến dịch qua Zalo OA thật (chỉ khi quán có `ZALO_OA_TOKEN`) | Khách nhận tin; không có token → chỉ xuất CSV | | | |
| MAN-06 | NFR-A11Y | Dùng bàn phím (Tab / Enter) đi hết luồng quầy; thử trình đọc màn hình (NVDA / TalkBack) một màn | Thấy rõ ô đang chọn; nhãn được đọc đúng | | | |

## 4. Xác nhận

| Vai trò | Họ tên | Kết luận (Đạt / Đạt có điều kiện / Không đạt) | Ký | Ngày |
| --- | --- | --- | --- | --- |
| Đại diện khách (ACT-GUEST / MEMBER) | | | | |
| Đại diện nhân viên quầy (ACT-STAFF) | | | | |
| Trưởng ca / Quản lý (ACT-LEAD / ACT-ADMIN) | | | | |
| Chủ dự án (duyệt G4) | | | | |
