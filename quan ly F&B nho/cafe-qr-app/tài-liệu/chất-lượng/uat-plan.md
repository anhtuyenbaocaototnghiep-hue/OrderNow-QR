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
| UAT-32 | UC-13, UC-17 | Quản lý nhập phiếu kho cho **Sữa tươi** với giá cao hơn lần trước khoảng 20%; mở **Quản lý → Cảnh báo** và hộp thư đã cài, đọc các món tụt lãi và giá gợi ý, bấm **Đổi giá**; rồi sửa giá trên phiếu về mức cũ. | Có cảnh báo "Giá vốn tăng" và một email; số liệu khớp định lượng; giá món chỉ đổi khi tự sửa; sau khi sửa phiếu, cảnh báo cũ "Đã xử lý" và có thư đính chính. | | |
| UAT-33 | UC-16 | Chủ quán mở **Quản lý → Lãi / lỗ** lần đầu, không ai hướng dẫn: trả lời 3 câu "tháng này lãi hay lỗ bao nhiêu", "tiền đi đâu nhiều nhất", "mỗi ngày cần bán bao nhiêu"; khai một khoản chi phí cố định bằng nút thêm nhanh. | Trả lời đúng cả 3 câu trong khoảng 1 phút; khai được chi phí; hiểu các câu trong "Cần để ý". | | |
| UAT-34 | UC-10 | Chủ quán bật **Vòng quay may mắn** (Tích điểm & voucher), giữ ô mẫu. Thu tiền một bàn 40.000đ, in hóa đơn; khách quét QR trên hóa đơn bằng điện thoại, quay; lần sau đọc mã voucher cho nhân viên khi thu. | Hóa đơn có QR; trang quay chạy trên điện thoại, kết quả rõ ràng; voucher dùng được một lần ở lần thu sau; quét lại QR chỉ thấy kết quả cũ. | | |
| UAT-35 | UC-02, UC-03 | Khách tới trước gọi 2 món, chọn **Khi bạn tới**; 5 phút sau bạn tới, khách bấm **Bạn đã tới — làm món**. Thử thêm một đơn **Sau 10 phút**. | Quầy không kêu lúc gửi, phiếu nằm cuối cột Mới; bấm "Bạn đã tới" thì quầy kêu và phiếu thành đơn mới; đơn 10 phút tự thành đơn mới đúng giờ; nguyên liệu vẫn được giữ trong lúc chờ. | | |
| UAT-36 | UC-04, UC-10 | Quản lý bật **Quà sinh nhật** (giảm 20%), sửa ngày sinh một hội viên thành hôm nay. Khách đó ngồi bàn, đọc SĐT; nhân viên mở Thu tiền bàn, thử "Không dùng quà lần này" rồi "Dùng quà", thu tiền. Một khách khác tự thêm ngày sinh ở Thẻ thành viên. | Điện thoại khách có lời chúc; quầy thấy dải "Sinh nhật khách", tổng đã trừ quà; hóa đơn có dòng "Quà sinh nhật"; lần ghé sau trong tuần không được quà thứ hai; khách tự thêm ngày sinh sát ngày không nhận quà năm nay. | | |
| UAT-37 | UC-04, UC-10 | Quà sinh nhật đang bật. Nhân viên đăng ký nhanh một khách mới, chọn ngày + tháng sinh, để trống năm. Gắn một khách quen chưa có ngày sinh: đọc câu mẫu, lưu ngày sinh; một khách khác bấm "Khách không muốn cho". Khách tự đăng ký trên điện thoại. Quản lý xem tab Quà sinh nhật → Thu thập ngày sinh, mở "Chưa có ngày sinh"; in QR bàn. | Ngày sinh không năm hiện "dd/mm"; dòng nhắc chỉ hiện với khách chưa có ngày sinh và mất sau khi lưu / từ chối; số "Đã có ngày sinh" tăng; thẻ QR có dòng mời thêm ngày sinh. | | |
| UAT-38 | UC-04, UC-10 | Quản lý bật **Mừng khách quay lại** (giảm 15%). Một hội viên đã ghé lần cuối hơn 45 ngày trước tới quán, đọc SĐT; nhân viên mở Thu tiền, thử "Không dùng quà lần này" rồi "Dùng quà", thu tiền. | Quầy thấy "Khách quay lại sau N ngày", tổng đã trừ quà; điện thoại khách "Lâu rồi mới gặp lại bạn!"; hóa đơn có "Quà quay lại"; lần ghé sau không còn dải; tab quản lý tăng số khách quay lại. | | |
| UAT-39 | UC-04, UC-10 | Quản lý bật **Ly tặng**. Khách A ở quầy mua tặng 1 Cà phê sữa (tiền mặt), quét QR trên màn quầy, bấm "Gửi cho bạn" gửi qua Zalo. Bạn B mở link, tới quán gọi Cà phê sữa, đọc mã; nhân viên nhập mã, thu tiền. Cuối ca chốt két. | Trang quà có lời nhắn + mã; bill của B trừ đúng ly đó, quầy nhắc mời đăng ký; két khớp (có dòng sổ quỹ "Bán ly tặng"); tab Ly tặng ghi "Đã dùng"; Lãi/lỗ không coi ly tặng là giảm giá. | | |
| UAT-40 | UC-12, UC-17 | Trưởng ca mở màn Ca thử sửa giờ vào của chính mình; nhân viên ở quầy gõ sai tài khoản duyệt của trưởng ca 5 lần rồi gõ đúng; quản lý mở Cảnh báo bất thường. | Dòng của trưởng ca không có nút Sửa (gọi thẳng API → 403); lần thứ 6 báo tạm khóa 15 phút, khoản không được duyệt; nhân viên khác vẫn nhờ trưởng ca duyệt được; trang Cảnh báo có 1 cảnh báo "Sai mật khẩu nhiều lần" ghi tên nhân viên đã nhập. | | |
| UAT-41 | UC-11, UC-12, UC-17 | Quản lý để "Màn chấm công chung". Hai nhân viên tự đặt PIN; vào ca ở màn chung; một người chi 20.000đ mua đá (hỏi PIN); đổi người đứng máy; người đóng ca chấm ra hộ người quên. Cuối tháng quản lý nhập hồ sơ lương, xử lý việc chờ, chốt lương, trả bằng VietQR. | Giờ vào / ra đúng người; khoản chi ghi đúng người đã nhập PIN; người được chấm ra hộ nằm trong việc chờ; bảng lương khớp giờ được tính; app ngân hàng hiện đúng tên người nhận; nhân viên thấy phiếu lương và bấm Đã xem. | | |
| UAT-42 | UC-12 | Màn chấm công chung. Một nhân viên có lịch từ 30 phút trước mà chưa chấm; một người khác hết lịch 30 phút vẫn đang làm. Một nhân viên quên PIN. Hôm qua một người có lịch mà quên chấm công cả ngày. | Máy quầy hiện dải nhắc đúng tên và giờ lịch, chấm xong thì hết; người quên PIN đặt lại bằng mật khẩu ngay ở màn chung, không phải đăng xuất máy và không bị khóa thêm 15 phút; người quên chấm cả ngày tự báo ở Giờ công của tôi, quản lý thấy trong Việc chờ, duyệt thì ngày đó hết vắng và giờ được tính theo lịch; chưa xử lý thì không chốt được lương. | | |
| UAT-43 | UC-05, UC-11 | Đang bán, rút dây mạng / tắt Wi-Fi máy quầy (hoặc tắt máy chủ); bán 3 đơn mang đi (2 tiền mặt, 1 chuyển khoản, 1 đơn có SĐT hội viên); cắm lại mạng. Lần khác: in phiếu bán tay trống, ghi tay 2 đơn, trưởng ca nhập lại. | Máy quầy tự chuyển "bán tạm", in được bill có chữ "BÁN LÚC MẤT MẠNG"; có mạng lại 3 đơn tự về hệ thống đúng giờ bán, không trùng; Ca & hoàn tiền liệt kê 3 đơn, đơn chuyển khoản ghi "đối chiếu"; két cuối ca khớp; hội viên được cộng điểm; 2 đơn phiếu tay vào ca với đúng giờ ghi trên phiếu. | | |
| UAT-44 | UC-13, UC-16 | Quản lý đặt Sữa tươi "hộp 1000 ml, mở rồi dùng 72 giờ". Bán vài ly Latte. Nhập một lô sữa đặc hạn ngày mai. Hôm sau xem trang Hôm nay và màn quầy. Để hộp sữa quá 72 giờ. | Dòng Sữa tươi ghi hộp đang mở còn bao nhiêu; trang Hôm nay có tiền sắp mất + món nên mời; máy quầy có dải "Nên mời khách hôm nay"; quá 72 giờ phần còn không tính là còn hàng, quầy bấm "Bỏ phần còn" ghi đúng phiếu hủy; cuối tháng thấy tiền đã hủy theo nguyên liệu và nhà cung cấp. | | |
| UAT-45 | UC-03 | Bật "Quy trình 1 chạm". Giờ đông: khách quét QR gọi 3 đơn, quầy bán 2 đơn mang đi; nhân viên làm món và bấm Xong từng đơn. Hôm sau xem thời gian chờ báo khách. | Chỉ một cột "Cần làm", mỗi đơn một lần bấm; kho trừ đúng; điện thoại khách hiện "Món đã xong"; không còn đơn tồn ở bước giữa; thời gian chờ báo khách hợp lý (không ra 0 phút). | | |
| UAT-46 | UC-17 | Chủ quán tạo tài khoản "Quản lý cửa hàng" cho người quản lý thật. Người đó làm một ngày: đổi giá một món, nhập hàng, lập lịch tuần, duyệt một khoản chi 3 triệu, sửa giờ công hôm qua của một nhân viên; thử mở Lương, Lãi / lỗ, Tài khoản. | Làm được các việc vận hành; không thấy / không mở được Lương, Lãi / lỗ, Tài khoản, Cài đặt chung; chủ quán thấy cảnh báo đổi giá; khoản chi > 6 triệu vẫn chờ chủ quán. Chủ quán thấy phân quyền dễ hiểu, đủ để giao việc. | | |
| UAT-47 | UC-17 | Chủ quán đặt vị trí cho từng nhân viên thật (một thu ngân, một pha chế, một phục vụ, một người mới để "Thử việc"). Một buổi bán: phục vụ gọi món tại bàn, pha chế bấm Xong, thu ngân thu tiền; người thử việc thử giảm giá 5 % và ghi chi 20.000đ. | Mỗi người chỉ thấy trang của mình, không ai bấm nhầm việc người khác; tiền chỉ qua thu ngân; giảm giá và khoản chi của người thử việc chờ trưởng ca duyệt. Chủ quán thấy cách chia hợp với quán. | | |
| UAT-48 | UC-17 | Chủ quán ở nhà. Thu ngân nghỉ: bạn phục vụ mở Bán mang đi, bấm Xin quyền (lý do "thu ngân nghỉ"); chủ quán duyệt "Hết hôm nay" trên điện thoại. Hôm sau kiểm tra bạn đó không còn thu tiền được. Chủ quán đặt "Không cho" Thực đơn & giá với quản lý cửa hàng một tuần. | Duyệt xong bạn phục vụ tải lại là thu tiền được; hết ngày tự mất quyền; chủ quán có cảnh báo "cấp quyền Thu tiền"; quản lý cửa hàng không vào được Thực đơn trong tuần đó. Chủ quán thấy cách cấp / thu quyền dễ hiểu. | | |

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
