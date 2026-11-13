# Thiết kế hệ thống bán cà phê cho quán nhỏ

**Gọi món và trả tiền bằng QR · một màn hình quầy · 1 chủ, 1 quản lý, 2 nhân viên mỗi ca**

| | |
|---|---|
| Phiên bản | 1.0 · 13/11/2026 |
| Loại tài liệu | Ý tưởng và thiết kế hệ thống. Thiết kế mới, không dựa trên project `cafe-qr-app` |
| Người đọc | Chủ quán, người phân tích và lập trình hệ thống, giảng viên chấm đồ án |

## Mục lục

1. [Tóm tắt](#1-tóm-tắt)
2. [Bối cảnh và bài toán](#2-bối-cảnh-và-bài-toán)
3. [Nguyên tắc thiết kế](#3-nguyên-tắc-thiết-kế)
4. [Vai trò và phân quyền](#4-vai-trò-và-phân-quyền)
5. [Thiết bị và bố trí quầy](#5-thiết-bị-và-bố-trí-quầy)
6. [Kiến trúc hệ thống](#6-kiến-trúc-hệ-thống)
7. [Use case](#7-use-case)
8. [Luồng nghiệp vụ chi tiết](#8-luồng-nghiệp-vụ-chi-tiết)
9. [Vòng đời trạng thái](#9-vòng-đời-trạng-thái)
10. [Quản lý phía sau](#10-quản-lý-phía-sau)
11. [Chủ quán và chống thất thoát](#11-chủ-quán-và-chống-thất-thoát)
12. [Thiết kế dữ liệu](#12-thiết-kế-dữ-liệu)
13. [Giao diện](#13-giao-diện)
14. [API và sự kiện realtime](#14-api-và-sự-kiện-realtime)
15. [Công nghệ và hạ tầng](#15-công-nghệ-và-hạ-tầng)
16. [Yêu cầu phi chức năng](#16-yêu-cầu-phi-chức-năng)
17. [Bảo mật và dữ liệu cá nhân](#17-bảo-mật-và-dữ-liệu-cá-nhân)
18. [Xử lý sự cố](#18-xử-lý-sự-cố)
19. [Cấu hình mặc định](#19-cấu-hình-mặc-định)
20. [Lộ trình triển khai](#20-lộ-trình-triển-khai)
21. [Rủi ro và cách giảm](#21-rủi-ro-và-cách-giảm)
22. [Kịch bản nghiệm thu](#22-kịch-bản-nghiệm-thu)
23. [Thuật ngữ](#23-thuật-ngữ)

---

## 1. Tóm tắt

Quán nhỏ, mỗi ca chỉ có hai nhân viên, nên hệ thống được thiết kế để **khách tự gọi món và tự trả tiền** bằng điện thoại. Nhân viên chỉ còn **pha, mang ra, dọn** và xử lý ngoại lệ.

- **Hai loại QR.** QR dán bàn và QR "mang đi" để gọi món; VietQR động (có sẵn số tiền và mã thanh toán) để trả tiền. Ngân hàng báo tiền về thì hệ thống tự xác nhận.
- **Một màn hình quầy duy nhất**, chia hai vùng độc lập: *Hàng pha* cho người đứng Bar, *Quầy* cho người thu ngân. Một máy in nhiệt in phiếu pha và bill, làm "màn hình thứ hai bằng giấy" cho Bar.
- **Kiểm soát chặt mà nhẹ.** Tiền và hàng ghi theo sổ cái chỉ thêm; hủy, giảm, hoàn phải có lý do và người duyệt; tiền mặt đếm mù khi giao ca; chủ nhận cảnh báo và duyệt từ xa.
- **Web chạy trên cloud.** Không cài app; màn quầy vẫn bán tiền mặt khi mất mạng.

---

## 2. Bối cảnh và bài toán

### 2.1. Quán giả định

| Mục | Giả định |
|---|---|
| Quy mô | 12 bàn, khoảng 45 chỗ ngồi |
| Giờ mở cửa | 6:30–22:00, mỗi ngày |
| Ca | Sáng 6:30–14:30, chiều 14:00–22:00 (chồng 30 phút để giao ca) |
| Thực đơn | Khoảng 30 món: cà phê phin và pha máy, trà trái cây, đá xay, bánh đóng sẵn |
| Kênh bán | Tại bàn, mang đi tại quầy, đặt trước đến lấy, app giao hàng |
| Giờ cao điểm | 7:00–9:00 (dân văn phòng, chủ yếu mang đi), 19:00–21:00 (ngồi tại quán) |

### 2.2. Nhân sự

| Người | Lịch | Việc |
|---|---|---|
| Chủ | Không đứng quán hằng ngày | Chính sách, tài chính, lương, duyệt khoản lớn |
| Quản lý | Giờ hành chính, thứ 2 đến thứ 7 | Vận hành, nhập hàng, xếp ca, duyệt ngoại lệ |
| Nhân viên, 2 người mỗi ca | Theo lịch ca | Một người đứng **Quầy** (thu ngân, phục vụ, dọn bàn), một người đứng **Bar** (pha chế, đóng gói) |

Ca chiều tối và Chủ nhật thường **không có quản lý ở quán**, nên mọi việc cần duyệt phải làm được từ xa.

### 2.3. Vấn đề cần giải

| Vấn đề ở quán | Hậu quả | Hướng giải |
|---|---|---|
| Giờ cao điểm khách xếp hàng chờ gọi món và trả tiền | Khách bỏ đi, nhân viên quá tải | Khách tự gọi và trả bằng QR |
| Sai món, đưa nhầm ly | Làm lại, khách phàn nàn | Phiếu pha in số đơn và tùy chọn rõ ràng |
| Khách chuyển khoản, nhân viên phải mở điện thoại kiểm tra | Chậm; dễ bị lừa bằng ảnh chụp màn hình giả | VietQR động, chỉ báo tiền từ ngân hàng mới được tính |
| Thất thoát tiền: hủy bill sau khi thu, đưa QR cá nhân, lệch két | Mất tiền, khó truy | Sổ cái, duyệt ngoại lệ, đếm két mù |
| Thất thoát nguyên liệu: pha ngoài bill, hao hụt | Giá vốn tăng âm thầm | Kho theo công thức, kiểm nhanh mỗi ca |
| Chủ không có mặt | Không biết quán đang ra sao | Màn "Hôm nay", cảnh báo, báo cáo cuối ngày qua Zalo |
| Chấm công, tính lương bằng tay | Sai giờ, tranh cãi | Chấm công PIN, bảng lương tự tính |

### 2.4. Phạm vi

- **Trong phạm vi:** bán tại bàn, mang đi, đặt trước đến lấy, ghi đơn app giao hàng; tiền mặt và chuyển khoản; ca và két; kho theo công thức; chấm công, lịch ca, lương; khách hàng thân thiết; báo cáo và cảnh báo.
- **Ngoài phạm vi giai đoạn này:** quán tự giao hàng; kế toán thuế đầy đủ (chỉ xuất dữ liệu cho kế toán); nhiều chi nhánh (dữ liệu đã chừa sẵn).

---

## 3. Nguyên tắc thiết kế

1. **Khách tự gọi và tự trả.** Nhân viên chỉ xử lý ngoại lệ: khách không dùng điện thoại, tiền mặt, hủy, đổi món.
2. **Tiền ít qua tay người nhất có thể.** Ưu tiên chuyển khoản tự xác nhận; tiền mặt đếm mù khi giao ca.
3. **Sổ cái chỉ ghi thêm.** Tiền, kho, tem tích lũy không sửa, không xóa; hủy hay hoàn là một dòng mới có lý do và người duyệt.
4. **Mỗi thao tác gắn với một người.** Màn quầy dùng chung, người làm được xác định theo vùng và PIN.
5. **Một màn hình, hai vùng độc lập.** Người Bar và người Quầy dùng cùng lúc không cản nhau; giấy in là màn hình thứ hai của Bar.
6. **Web, không cài app, chịu được mất mạng.** Thiết bị rẻ vẫn chạy được; mất mạng vẫn bán tiền mặt.

---

## 4. Vai trò và phân quyền

### 4.1. Vai trò

| Vai trò | Thiết bị | Việc chính |
|---|---|---|
| Khách | Điện thoại của khách, không cần cài app hay tạo tài khoản | Gọi món, trả tiền, theo dõi đơn, gọi nhân viên, tích tem, đánh giá |
| Nhân viên đứng Quầy | Màn quầy, vùng Quầy | Xác nhận bàn mới, bán tại quầy, thu tiền, mang món, dọn bàn, ghi đơn app giao hàng |
| Nhân viên đứng Bar | Màn quầy, vùng Hàng pha, cùng phiếu pha in | Pha theo hàng đợi, báo xong, báo hết món, ghi mẻ pha cốt |
| Quản lý | Điện thoại của mình; màn quầy lúc vắng khách | Thực đơn, công thức, nhập hàng, kiểm kho, xếp ca, duyệt ngoại lệ, báo cáo vận hành |
| Chủ | Điện thoại và máy tính của mình | Theo dõi từ xa, tài chính, lương, phân quyền, chính sách, duyệt vượt hạn mức |

"Quầy" và "Bar" là **vị trí trong ca**, không phải cấp quyền. Hai nhân viên có cùng quyền, chọn vị trí lúc chấm công và đổi được giữa ca.

### 4.2. Ma trận quyền

| Chức năng | Khách | Nhân viên | Quản lý | Chủ |
|---|:-:|:-:|:-:|:-:|
| Gọi món, trả tiền, gọi nhân viên, đánh giá | ✓ | – | – | – |
| Xác nhận bàn mới, bán tại quầy, thu tiền, mang món, dọn bàn | – | ✓ | ✓ | ✓ |
| Pha chế: báo xong, báo hết món, ghi mẻ pha cốt | – | ✓ | ✓ | ✓ |
| Mở ca, giao ca, đóng ca, đếm két | – | ✓ | ✓ | ✓ |
| Hủy món chưa pha, có ghi lý do | – | ✓ | ✓ | ✓ |
| Hủy món đã pha hoặc đã thu tiền | – | Yêu cầu | Duyệt | Duyệt |
| Giảm giá tay, hoàn tiền, chi quỹ | – | Yêu cầu | Duyệt trong hạn mức | Duyệt |
| Mở két không bán | – | ✓ (PIN và lý do) | ✓ | ✓ |
| Kiểm kho nhanh khi giao ca, ghi hàng hỏng | – | ✓ | ✓ | ✓ |
| Nhập hàng, kiểm kho toàn bộ | – | Nhận hàng khi quản lý vắng | ✓ | ✓ |
| Thực đơn, giá, công thức, khuyến mãi | – | – | ✓ | ✓ |
| Xếp ca, duyệt tăng ca, sửa chấm công | – | Đăng ký lịch rảnh | ✓ | ✓ |
| Báo cáo vận hành: doanh thu, món bán, tồn kho, giờ công | – | – | ✓ | ✓ |
| Báo cáo tài chính, lương, lãi lỗ | – | Xem phiếu lương của mình | – | ✓ |
| Thiết bị, phân quyền, hạn mức, chính sách | – | – | – | ✓ |
| Nhật ký thao tác | – | – | Phần vận hành | ✓ |

### 4.3. Hạn mức duyệt mặc định

| Việc | Quản lý duyệt được | Vượt mức thì |
|---|---|---|
| Giảm giá tay trên một bill | Đến 10% | Chủ duyệt |
| Hoàn tiền | Đến 200.000đ | Chủ duyệt |
| Chi quỹ (mua đá, ga, sửa nhỏ) | Đến 500.000đ | Chủ duyệt |
| Hủy món đã pha hoặc đã thu | Mọi giá trị, có lý do | Chủ nhận cảnh báo khi quá 3 lần mỗi ca |
| Sửa chấm công | Trong 7 ngày | Cũ hơn: chủ duyệt |

- **Người duyệt có mặt:** nhập PIN ngay trên màn quầy.
- **Người duyệt vắng mặt:** yêu cầu đẩy lên điện thoại quản lý; quá 5 phút chưa ai trả lời thì chuyển lên chủ.

### 4.4. Dùng chung một màn hình

1. **Màn quầy đăng nhập bằng thiết bị, không bằng người.** Chủ đăng ký màn quầy một lần; sau đó màn quầy luôn ở chế độ quầy.
2. **Vị trí theo chấm công.** Nhân viên chấm công bằng PIN và chọn Quầy hoặc Bar. Thao tác ở vùng Hàng pha ghi cho người đứng Bar, ở vùng Quầy ghi cho người đứng Quầy.
3. **Đổi vị trí giữa ca:** bấm "Đổi vị trí" và nhập PIN.
4. **Một người làm cả hai** khi người kia nghỉ giữa ca: bấm "Một mình", cả hai vùng ghi cho người đó.
5. **Thao tác nhạy cảm luôn hỏi PIN của người làm:** hủy món, giảm giá, mở két không bán, hoàn tiền, chi quỹ, đổi vị trí.
6. **Hai vùng độc lập.** Không có hộp thoại che cả màn hình; đang nhập dở ở vùng này không mất khi người kia bấm ở vùng kia.

---

## 5. Thiết bị và bố trí quầy

### 5.1. Thiết bị

| Thiết bị | Số lượng | Dùng để | Giá tham khảo |
|---|---|---|---|
| **Màn quầy:** tablet Android 11–13 inch có SIM 4G (hoặc laptop, máy POS), kèm giá đỡ xoay | 1 | Toàn bộ việc của nhân viên | 6–8 triệu |
| Máy in nhiệt 80 mm có dao cắt giấy | 1 | Phiếu pha, bill có VietQR, phiếu giao ca | 1,5–2,5 triệu |
| Két tiền nối máy in | 1 (tùy chọn) | Đựng tiền mặt; mỗi lần mở két đều được ghi lại | khoảng 1 triệu |
| QR dán bàn (in, ép plastic) và tấm đứng "Gọi món mang đi" | 12 và 1 | Khách tự gọi món | dưới 0,5 triệu |
| Điện thoại của quản lý và chủ | có sẵn | Quản trị, duyệt, báo cáo | – |

- **Tổng đầu tư** khoảng 9–12 triệu đồng.
- **Không cần:** tablet riêng cho Bar, màn hình gọi số, màn hình phụ cho khách, router 4G riêng.
- **Chi phí hằng tháng:** máy chủ cloud, tên miền, phí dịch vụ báo tiền về ngân hàng (có nhà cung cấp miễn phí gói nhỏ), tin Zalo ZNS (tính theo tin), SIM 4G cho tablet.

### 5.2. Bố trí quầy

```
         Lối vào  →  khách xếp hàng
   [Tấm QR gọi món mang đi]
 ┌─────────────────────────────────────┬──────────────────────────┐
 │  Két   MÀN QUẦY (giá xoay)   Máy in │ Máy pha  Máy xay  Tủ mát │
 │        ← người Quầy →        phiếu ↓│      ← người Bar →       │
 └─────────────────────────────────────┴──────────────────────────┘
   [Kệ trả đồ mang đi]   ← khách lấy món rồi ra
```

- **Màn quầy** đặt ở chỗ giáp giữa quầy thu và Bar để cả hai người cùng thấy; xoay được về phía khách khi cần hiện VietQR.
- **Máy in** đặt sát phía Bar: phiếu pha ra là người pha thấy ngay.
- **Tấm QR mang đi** đặt ở đầu hàng chờ: khách gọi và trả trong lúc xếp hàng.
- **Kệ trả đồ** ở cuối quầy, gần lối ra: khách lấy món không chen vào chỗ người đang gọi.

---

## 6. Kiến trúc hệ thống

### 6.1. Sơ đồ tổng thể

```
  Điện thoại khách            Màn quầy + máy in            Điện thoại quản lý, chủ
  (gọi món, trả tiền,         (Hàng pha, Bán, Bàn,         (quản trị, duyệt,
   đặt trước)                  Đơn, Ca)                     báo cáo)
         │                           │                            │
         └───────────────────────────┼────────────────────────────┘
                                     │  HTTPS + WebSocket
                                     ▼
              Máy chủ trên cloud (một khối, chia module)
   Thực đơn · Bàn và đơn · Thanh toán · Pha chế · Kho · Ca và két · Nhân sự
   Khách hàng · Phê duyệt · Báo cáo và cảnh báo · Người dùng và nhật ký
                                     │
              PostgreSQL · lưu ảnh · sao lưu liên tục
                                     │
   Ngân hàng (VietQR + báo tiền về) · Zalo OA/ZNS · Hóa đơn điện tử · App giao hàng

   Máy in nhiệt nối với màn quầy qua cầu nối in (Bluetooth, USB hoặc mạng nội bộ)
```

### 6.2. Các module

| Module | Trách nhiệm | Sự kiện phát ra |
|---|---|---|
| Thực đơn | Món, tùy chọn, giá theo kênh, lịch bán, còn hay hết món | `menu.changed`, `item.unavailable` |
| Bàn và đơn | Phiên bàn, xác nhận bàn, chủ bàn, đơn, tách bill | `order.placed`, `session.verify_needed`, `session.join_requested`, `table.call` |
| Thanh toán | Tạo VietQR, nhận báo tiền về, tiền mặt, hoàn tiền | `payment.paid`, `payment.needs_check` |
| Pha chế | Hàng pha, gom ly, in phiếu, chế độ cao điểm, thời gian chờ | `order.ready`, `rush.changed` |
| Kho | Công thức, sổ kho, mẻ bán thành phẩm, nhập, kiểm, hủy, gợi ý đặt hàng | `stock.low`, `stock.variance`, `batch.expiring` |
| Ca và két | Mở, giao, đóng ca; đếm két; thu chi quỹ; báo cáo cuối ngày | `shift.handover`, `cash.variance` |
| Nhân sự | Chấm công, lịch ca, lương | `attendance.needs_review` |
| Khách hàng | Hội viên, tem, voucher, khuyến mãi, đánh giá | `review.low` |
| Phê duyệt | Tạo yêu cầu, chuyển cấp, ghi kết quả | `approval.requested`, `approval.decided` |
| Báo cáo và cảnh báo | Tổng hợp số liệu, xét ngưỡng, gửi Zalo | `alert.raised` |
| Người dùng và nhật ký | Tài khoản, PIN, thiết bị, quyền, nhật ký thao tác | – |

### 6.3. Quyết định kiến trúc

| Quyết định | Chọn | Không chọn | Lý do |
|---|---|---|---|
| Đặt máy chủ ở đâu | Cloud | Máy tính trong quán | Khách quét QR thường dùng 4G chứ không vào Wi-Fi quán; chủ cần xem từ xa; máy trong quán hỏng là dừng bán |
| Kiểu kiến trúc | Một khối chia module (modular monolith) | Microservice | Một quán, ít người vận hành; module tách sẵn để sau này mở chuỗi thì tách dần |
| Ứng dụng | Web (PWA) | App cài trên máy | Không cài app; một bộ mã cho mọi thiết bị |
| Cập nhật tức thời | WebSocket | Hỏi lại định kỳ | Đơn tới quầy trong 2 giây; nhẹ tải máy chủ |
| Xác nhận chuyển khoản | VietQR động + báo tiền về | QR tĩnh, nhân viên tự kiểm | Tự xác nhận; chặn QR cá nhân và ảnh chụp giả |
| In ấn | Cầu nối in, lệnh ESC/POS | In từ trình duyệt | Nhanh, ổn định, cắt giấy, mở két, in mã QR |
| Nhiều cửa hàng | Có `store_id` ngay từ đầu | Thêm sau | Mở chi nhánh thứ hai không phải làm lại dữ liệu |

### 6.4. Tích hợp bên ngoài

| Hệ thống ngoài | Mục đích | Cách nối | Ghi chú |
|---|---|---|---|
| Ngân hàng, qua dịch vụ báo tiền về (ví dụ PayOS, SePay) | Tạo VietQR có số tiền và nội dung; nhận báo có tiền vào | API + webhook có chữ ký | Xử lý một lần theo mã giao dịch; lớp tích hợp đổi được nhà cung cấp |
| Zalo OA / ZNS | Báo cáo cuối ngày cho chủ, nhắc lịch ca, báo khách (có đồng ý) | API | ZNS cần mẫu tin được duyệt, tính phí theo tin |
| Hóa đơn điện tử (VNPT, Viettel, MISA…) | Xuất hóa đơn theo đơn | API nhà cung cấp | Kiểm tra nghĩa vụ theo Nghị định 70/2025 với kế toán |
| App giao hàng (Grab, ShopeeFood, Be) | Nhận đơn | Giai đoạn đầu nhập tay | Tích hợp tự động khi quán là đối tác API |
| Máy in nhiệt | Phiếu pha, bill, phiếu giao ca, mở két | Lệnh ESC/POS qua cầu nối in | – |

---

## 7. Use case

### 7.1. Tổng quan

```
 Khách       ──►  UC-01…UC-09   Gọi món · Trả tiền · Theo dõi · Mang đi · Đặt trước · Ưu đãi
 Nhân viên   ──►  UC-10…UC-19   Chấm công · Ca và két · Xác nhận bàn · Bán tại quầy · Pha chế
                                Kho nhanh · Yêu cầu duyệt
 Quản lý     ──►  UC-20…UC-24   Thực đơn và công thức · Nhập và kiểm kho · Lịch ca · Duyệt
                                Báo cáo vận hành
 Chủ         ──►  UC-23, UC-25…UC-27   Duyệt vượt hạn mức · Hôm nay và cảnh báo · Tài chính
                                       và lương · Thiết lập
 Ngân hàng   ──►  UC-03         Báo tiền về
 Bộ hẹn giờ  ──►  UC-28         Hủy đơn chưa trả · Báo cáo cuối ngày · Nhắc hạn dùng, lịch ca
```

### 7.2. Danh sách use case

| Mã | Tên | Tác nhân chính |
|---|---|---|
| UC-01 | Quét QR bàn, mở hoặc xin vào phiên bàn | Khách |
| UC-02 | Gọi món tại bàn | Khách |
| UC-03 | Trả tiền bằng chuyển khoản | Khách, Ngân hàng |
| UC-04 | Theo dõi đơn | Khách |
| UC-05 | Gọi nhân viên | Khách |
| UC-06 | Tách bill | Khách |
| UC-07 | Gọi món mang đi bằng QR ở quầy | Khách |
| UC-08 | Đặt trước đến lấy | Khách |
| UC-09 | Tích tem, dùng voucher, đánh giá | Khách |
| UC-10 | Chấm công và chọn vị trí | Nhân viên |
| UC-11 | Mở ca, giao ca, đóng ca | Nhân viên |
| UC-12 | Xác nhận bàn mới | Nhân viên |
| UC-13 | Bán tại quầy và thu tiền | Nhân viên |
| UC-14 | Pha chế và báo xong | Nhân viên |
| UC-15 | Báo hết món, ghi mẻ pha cốt | Nhân viên |
| UC-16 | Mang món, dọn bàn | Nhân viên |
| UC-17 | Ghi đơn app giao hàng | Nhân viên |
| UC-18 | Kiểm kho nhanh, ghi hàng hỏng | Nhân viên |
| UC-19 | Yêu cầu hủy, giảm giá, hoàn tiền, chi quỹ | Nhân viên |
| UC-20 | Quản lý thực đơn, công thức, khuyến mãi | Quản lý |
| UC-21 | Nhập hàng, kiểm kho toàn bộ | Quản lý |
| UC-22 | Xếp ca, duyệt chấm công và tăng ca | Quản lý |
| UC-23 | Duyệt ngoại lệ | Quản lý, Chủ |
| UC-24 | Xem báo cáo vận hành | Quản lý |
| UC-25 | Theo dõi "Hôm nay", nhận cảnh báo | Chủ |
| UC-26 | Báo cáo tài chính, tính lương | Chủ |
| UC-27 | Thiết lập thiết bị, quyền, hạn mức, chính sách | Chủ |
| UC-28 | Tác vụ hẹn giờ: hủy đơn chưa trả, báo cáo cuối ngày, nhắc hạn dùng, nhắc lịch ca | Hệ thống |

### 7.3. Đặc tả use case tiêu biểu

#### UC-02. Gọi món tại bàn

| Mục | Nội dung |
|---|---|
| Tác nhân | Khách; phụ: nhân viên đứng Quầy |
| Điều kiện trước | Quán đang mở ca và bật nhận đơn QR; màn quầy đang kết nối |
| Kết quả | Đơn ở trạng thái Đang pha, nằm trong phiên bàn; kho đã trừ theo định lượng |

**Luồng chính**
1. Khách quét QR bàn. Hệ thống mở phiên bàn mới (điện thoại này là chủ bàn) hoặc cho điện thoại xin vào phiên đang có.
2. Hệ thống hiện menu: món còn bán, ảnh, giá, thời gian chờ ước tính.
3. Khách chọn món, tùy chọn, ghi chú; giỏ hiện tạm tính do máy chủ tính.
4. Khách chọn *Trả ngay* hoặc *Trả khi về*, rồi bấm Gửi đơn.
5. Nếu là đơn đầu tiên của phiên và chưa trả, màn quầy báo "Bàn 5 có khách?"; nhân viên bấm **Có khách**.
6. Đơn vào hàng pha, máy in in phiếu pha; điện thoại khách hiện "Đang pha".

**Luồng phụ và ngoại lệ**
- **1a.** Điện thoại thứ hai xin vào phiên đang có: chủ bàn bấm Đồng ý, hoặc nhân viên duyệt trên màn quầy. Chưa được đồng ý thì không gọi món được.
- **4a.** Món vừa hết khi gửi: báo tên món, bỏ khỏi giỏ, khách chọn lại.
- **5a.** Nhân viên bấm **Không có ai**: đơn hủy, phiên bị khóa, điện thoại thấy "Vui lòng gọi món tại quầy".
- **5b.** Chưa ai xác nhận: màn quầy nhắc lại mỗi phút; quá 10 phút thì đơn tự hủy.
- **5c.** Màn quầy mất kết nối quá 60 giây: máy chủ tạm ngưng nhận đơn QR, điện thoại báo "Vui lòng gọi món tại quầy".

#### UC-03. Trả tiền bằng chuyển khoản

| Mục | Nội dung |
|---|---|
| Tác nhân | Khách; phụ: Ngân hàng, qua dịch vụ báo tiền về |
| Điều kiện trước | Có đơn hoặc bill phiên bàn chưa trả |
| Kết quả | Thanh toán ở trạng thái Đã trả, gắn với đơn hoặc phiên bàn và với ca hiện tại |

**Luồng chính**
1. Khách bấm Thanh toán, hoặc chọn Trả ngay khi gửi đơn.
2. Máy chủ tạo VietQR động: số tiền đúng bill, tài khoản của quán, nội dung là mã thanh toán ngắn, duy nhất (ví dụ `CF7K2Q`).
3. Điện thoại hiện mã kèm hai nút **Mở app ngân hàng** và **Lưu ảnh QR**.
4. Khách chuyển khoản trong app ngân hàng.
5. Ngân hàng báo tiền về; máy chủ khớp mã thanh toán và số tiền, ghi Thanh toán là **Đã trả**.
6. Điện thoại khách hiện "Đã thanh toán", màn quầy cập nhật bill; đơn trả trước được đưa vào hàng pha.

**Luồng phụ và ngoại lệ**
- **4a.** Khách đưa ảnh chụp "đã chuyển": không được tính; chỉ báo tiền từ ngân hàng mới đổi trạng thái.
- **5a.** Chuyển thiếu, thừa, hoặc nội dung không khớp: ghi **Cần kiểm tra**, báo màn quầy; nhân viên đối chiếu, thu thêm hoặc hoàn phần thừa.
- **5b.** Đơn trả trước quá 10 phút chưa thấy tiền: đơn tự hủy. Tiền về sau đó thì ghi Cần kiểm tra để khôi phục đơn hoặc hoàn tiền.
- **5c.** Ngân hàng gửi lại cùng một báo tiền: bỏ qua, mỗi mã giao dịch chỉ xử lý một lần.

#### UC-11. Giao ca

| Mục | Nội dung |
|---|---|
| Tác nhân | Nhân viên ca trước, nhân viên ca sau; phụ: quản lý và chủ (nhận báo cáo, cảnh báo) |
| Điều kiện trước | Ca đang mở; nhân viên ca sau đã chấm công |
| Kết quả | Ca trước đóng, ca sau mở; chênh lệch két và kho gắn với ca và người |

**Luồng chính**
1. Người đứng Quầy ca trước bấm **Giao ca**.
2. Màn quầy yêu cầu đếm tiền trong két theo mệnh giá, **không hiện số tiền hệ thống dự kiến** (đếm mù).
3. Hệ thống so với tiền mặt dự kiến = tiền đầu ca + tiền mặt thu − hoàn tiền mặt − chi quỹ, rồi ghi chênh lệch cho ca trước.
4. Kiểm nhanh 5 thứ chủ lực: nhập số đếm, hệ thống so với tồn trên sổ.
5. Ca trước ghi chú bàn giao, ví dụ "máy xay kêu lạ", "Bàn 3 chưa trả tiền".
6. Người đứng Quầy ca sau đếm lại két và bấm **Nhận ca**; ca mới mở với số tiền đã đếm.
7. Hệ thống in phiếu giao ca và gửi tóm tắt cho quản lý, chủ.

**Luồng phụ và ngoại lệ**
- **3a.** Chênh lệch vượt ngưỡng: yêu cầu đếm lại một lần; vẫn lệch thì ghi nhận và cảnh báo chủ.
- **6a.** Ca sau đếm khác ca trước: ghi cả hai số, đánh dấu để quản lý xem.

---

## 8. Luồng nghiệp vụ chi tiết

### 8.1. Khách ngồi tại bàn

1. **Mở phiên bàn.** Khách quét QR dán ở bàn. Mã QR là chuỗi ngẫu nhiên, không suy ra được mã của bàn khác.
   - Bàn đang trống: mở **phiên bàn** mới, điện thoại này là **chủ bàn**.
   - Bàn đang có phiên: điện thoại mới **xin vào bàn**; chủ bàn bấm Đồng ý, hoặc nhân viên duyệt trên màn quầy. Cách này chặn người lạ chụp QR rồi gọi món vào bill của bàn khác.
2. **Xem menu và chọn món.** Menu hiện món còn bán, ảnh, giá, thời gian chờ ước tính; món hết nguyên liệu tự ẩn. Khách chọn tùy chọn (size, đường, đá, topping) và ghi chú; giỏ hiện tạm tính do máy chủ tính.
3. **Chọn cách trả:** *Trả ngay* (VietQR) hoặc *Trả khi về*.
4. **Gửi đơn.**
   - Đơn đã trả: vào thẳng hàng pha.
   - Đơn đầu tiên của phiên mà chưa trả: chờ nhân viên đứng Quầy bấm **Có khách** (1 chạm).
   - Từ đơn thứ hai trở đi của phiên đã xác nhận: vào thẳng hàng pha.
5. **Theo dõi:** Đang pha → Xong → Đã mang ra. Khách gọi thêm món bất cứ lúc nào; nút **Gọi nhân viên** có lý do sẵn (nước lọc, khăn giấy, thanh toán, khác).
6. **Trả tiền khi về:** bấm Thanh toán trên điện thoại (VietQR) hoặc ra quầy trả tiền mặt. Muốn **tách bill** thì mỗi người chọn món của mình, mỗi phần một mã VietQR; phần chưa ai nhận do chủ bàn trả.
7. **Sau khi trả:** biên nhận điện tử, nhập SĐT để tích tem, chấm sao. Nhân viên dọn bàn rồi bấm **Dọn xong**, bàn về trống.

**Khách không dùng điện thoại** (thường là khách lớn tuổi): nhân viên đứng Quầy mở bàn trên màn quầy và **gọi món hộ**. Bill vẫn nằm trong phiên bàn như khách gọi bằng QR.

### 8.2. Mang đi bằng QR ở quầy

1. Khách đang xếp hàng quét tấm QR "Gọi món mang đi" đặt ở đầu hàng.
2. Gọi món và **bắt buộc trả ngay** bằng VietQR; mang đi không có "trả khi về".
3. Tiền về thì đơn vào hàng pha, máy in in phiếu pha; điện thoại khách hiện **số thứ tự**.
4. Pha xong: điện thoại khách hiện "Số 23 đã xong" kèm tiếng báo; nhân viên đặt ly lên **kệ trả đồ** và đọc to số.
5. Thu ngân không phải nhận đơn hay thu tiền của nhóm khách này, chỉ còn phục vụ khách trả tiền mặt.

### 8.3. Đặt trước đến lấy

- Khách đặt trên trang web của quán: chọn món, chọn **giờ lấy** theo khung 15 phút, trả trước bằng VietQR.
- Mỗi khung có **giới hạn số ly** theo công suất Bar (mặc định 15 ly mỗi khung, giờ cao điểm 8 ly). Khung đầy thì không chọn được.
- Đơn ở trạng thái *Đã hẹn*. Đến thời điểm giờ lấy trừ thời gian pha dự kiến, đơn tự vào hàng pha và in phiếu.
- Pha xong thì đặt lên kệ trả đồ, báo khách "Đơn đã sẵn sàng". Khách đến lấy, nhân viên bấm Đã giao.

### 8.4. Khách mua tại quầy

1. Nhân viên đứng Quầy chọn món trên lưới món hay bán (2–3 chạm một ly), tùy chọn, ghi chú.
2. Thu tiền:
   - **Tiền mặt:** màn quầy gợi ý mệnh giá, tính tiền thừa; bấm Đã thu, két mở (nếu có két).
   - **Chuyển khoản:** in bill tạm tính có VietQR riêng của đơn để khách quét từ giấy. Không có máy in thì vùng Quầy hiện VietQR cỡ lớn, xoay giá đỡ cho khách quét. Ngân hàng báo về là tự xác nhận.
3. Thu xong thì đơn vào hàng pha. Bill in **số thứ tự**; pha xong nhân viên đọc to số.

### 8.5. Đơn app giao hàng

- Nhân viên đứng Quầy chọn kênh (Grab, ShopeeFood, Be…), nhập mã đơn của app và món. Giá lấy theo **bảng giá riêng của kênh**; hệ thống ghi **hoa hồng** theo tỷ lệ của kênh để báo cáo lãi đúng.
- Đơn coi như đã trả (app thu tiền), vào hàng pha; phiếu pha ghi kênh và mã đơn app.
- Tài xế đến lấy thì bấm Đã giao.
- Tích hợp tự động với app khi quán đủ điều kiện làm đối tác API; trước đó nhập tay.

### 8.6. Pha chế với một màn hình

- **Định tuyến món.** Mỗi món có *trạm*: **Bar** (đồ uống cần pha) hoặc **Quầy** (bánh lấy từ tủ, nước đóng chai). Món trạm Quầy không vào hàng pha; thanh báo nhắc người đứng Quầy lấy kèm.
- **Thứ tự hàng pha.** Đơn nào vào trước pha trước. Đơn mang đi có khách đứng chờ được đánh dấu để người pha ưu tiên khi cần.
- **Phiếu pha.** Đơn vào hàng pha là in ngay: số đơn hoặc số bàn chữ to, món trạm Bar, tùy chọn, ghi chú, giờ vào. Người pha kẹp phiếu vào ly hoặc khay. Đơn mang đi nhiều ly có thể chọn in mỗi ly một phiếu.
- **Gom ly.** Đầu vùng Hàng pha hiện các ly giống nhau (cùng món, cùng tùy chọn) trong khoảng 10 ly sắp tới, ví dụ "3× Cà phê sữa đá, 1 ly ít đường". Pha một lượt rồi bấm **Xong cả nhóm**; đơn nào đủ ly thì tự chuyển Xong.
- **Báo xong:** một chạm "Xong" trên phiếu ở vùng Hàng pha.
  - Đơn tại bàn: thanh báo hiện "Mang ra Bàn 5" cho người đứng Quầy; mang xong bấm Đã mang.
  - Đơn mang đi, đặt trước: điện thoại khách báo xong.
- **Đồng hồ chờ** trên mỗi phiếu: vàng sau 5 phút, đỏ sau 10 phút.
- **Báo hết món một chạm:** món ẩn ngay trên menu khách và màn quầy; giỏ đang có món đó được báo khi gửi.
- **Thời gian chờ ước tính** cho khách = tổng thời gian pha các ly đang chờ (theo thời gian pha trung bình từng món, học từ dữ liệu) chia cho số người pha.
- **Chế độ cao điểm** tự bật khi hàng pha quá 12 ly hoặc ly chờ lâu nhất quá 8 phút; tự tắt khi còn dưới 6 ly:
  - tạm ẩn món pha lâu (đá xay, sinh tố) khỏi menu khách;
  - hiện thời gian chờ thật cho khách **trước khi** đặt;
  - giảm công suất các khung đặt trước;
  - vùng Hàng pha tự rộng ra trên màn quầy.
- **Không có máy in:** người pha xem thẳng vùng Hàng pha; chữ đã làm to để đọc từ cách 2 mét.

### 8.7. Thanh toán

| Tình huống | Cách trả | Xác nhận |
|---|---|---|
| Khách tại bàn, trả trên điện thoại | VietQR, kèm nút **Mở app ngân hàng** và **Lưu ảnh QR** | Tự động khi ngân hàng báo tiền về |
| Mang đi bằng QR, đặt trước | Bắt buộc trả ngay bằng VietQR | Tự động |
| Mua tại quầy, chuyển khoản | VietQR in trên bill, hoặc hiện trên màn quầy xoay về phía khách | Tự động |
| Tiền mặt | Màn quầy gợi ý mệnh giá, tính tiền thừa | Nhân viên bấm Đã thu; đối chiếu bằng đếm mù khi giao ca |
| App giao hàng | App đã thu | Ghi theo kênh |
| Tách bill | Mỗi phần một VietQR hoặc tiền mặt | Từng phần |

Quy tắc:
- **VietQR động theo chuẩn NAPAS:** số tiền đúng bill, tài khoản của quán, nội dung là mã thanh toán ngắn, duy nhất.
- **Trả trên chính điện thoại của khách.** Khách không thể dùng camera quét mã đang hiện trên chính máy mình, nên trang trả tiền luôn có hai nút:
  - **Mở app ngân hàng:** liên kết mở thẳng app, điền sẵn số tiền và nội dung; nhiều ngân hàng hỗ trợ;
  - **Lưu ảnh QR:** lưu ảnh mã, rồi trong app ngân hàng chọn quét từ ảnh.
- **Chỉ báo tiền từ ngân hàng mới đổi trạng thái** sang Đã trả. Ảnh chụp màn hình "đã chuyển" không có giá trị.
- **Khớp tiền theo mã thanh toán và số tiền.** Một số ngân hàng cắt bớt nội dung; khi không đọc được mã thì khớp theo số tiền và thời gian, rồi nhân viên xác nhận. Lệch số tiền thì ghi **Cần kiểm tra**.
- **Đơn trả trước quá 10 phút chưa thấy tiền** thì tự hủy, không vào hàng pha. Tiền về muộn thì ghi Cần kiểm tra để khôi phục đơn hoặc hoàn tiền.
- **Mỗi báo tiền xử lý đúng một lần** theo mã giao dịch ngân hàng, kể cả khi bị gửi lại.
- **QR tĩnh** (khách tự gõ số tiền) chỉ để dự phòng, không dùng làm cách chính.
- **Hóa đơn điện tử:** chừa sẵn điểm nối với nhà cung cấp (VNPT, Viettel, MISA…). Quy định hóa đơn điện tử khởi tạo từ máy tính tiền cho hộ kinh doanh (Nghị định 70/2025) cần kiểm tra với kế toán để biết quán có thuộc diện bắt buộc không.

### 8.8. Một ca làm việc

| Thời điểm | Việc | Hệ thống hỗ trợ |
|---|---|---|
| **Mở ca** | Chấm công PIN, chọn vị trí Quầy hoặc Bar | Chỉ chấm được trên thiết bị đã đăng ký của quán |
| | Mở két | Đếm tiền đầu ca theo mệnh giá |
| | Checklist mở quán | Máy pha, máy xay, đá, sữa, vệ sinh; ghi **mẻ pha cốt** (cốt cà phê, trà ủ) có hạn dùng tính theo giờ |
| | Bật nhận đơn QR | Menu khách mở |
| **Trong ca** | Bán, pha, mang món, dọn bàn | Sơ đồ bàn: trống, đang ngồi (bao lâu), chờ xác nhận, gọi thanh toán, đã trả, **cần dọn** |
| **Giao ca 14:00** | Ca sáng **đếm két mù** | Chênh lệch tự tính, gắn với ca và người |
| | Kiểm nhanh 5 thứ chủ lực | Sữa đặc, sữa tươi, cà phê, ly mang đi, bánh |
| | Ca chiều bấm **Nhận ca** | Hai bên cùng xác nhận; in phiếu giao ca |
| **Đóng quán** | Đếm két mù | Chuyển khoản tự đối soát |
| | Checklist đóng quán, chấm công ra | Báo cáo cuối ngày tự gửi chủ qua Zalo |

### 8.9. Hủy, giảm giá, hoàn tiền, chi quỹ

1. Nhân viên chọn thao tác, nhập **lý do** (chọn sẵn hoặc gõ) và **PIN** của mình.
2. Hệ thống xét hạn mức ở mục 4.3:
   - trong quyền nhân viên (hủy món chưa pha): làm ngay;
   - cần duyệt: tạo **yêu cầu duyệt**. Người duyệt có mặt thì nhập PIN ngay trên màn quầy; vắng mặt thì yêu cầu đẩy lên điện thoại quản lý, quá 5 phút chưa trả lời thì chuyển lên chủ.
3. Chưa duyệt thì chưa đổi gì: món vẫn trên bill, tiền vẫn như cũ.
4. Duyệt xong: ghi một dòng mới vào sổ cái (hủy, giảm, hoàn), không sửa dòng cũ; cộng lại kho nếu món chưa pha; nhật ký ghi người yêu cầu, người duyệt, lý do.
5. Giảm giá chỉ có hai loại: theo **chương trình có sẵn** (tự áp) và **giảm tay** (phải duyệt). Không có ô nhập giá tùy ý.

---

## 9. Vòng đời trạng thái

### 9.1. Đơn hàng

```
 Chờ trả tiền ──── tiền về ─────┐
 Chờ xác nhận bàn ─ bấm "Có" ───┼──► Đang pha ──► Xong ──► Đã giao
 Bán tại quầy, đã thu ──────────┘
 Đặt trước:  Chờ trả tiền ── tiền về ──► Đã hẹn ── đến giờ ──► Đang pha
 Đơn thứ hai trở đi của bàn đã xác nhận: vào thẳng Đang pha
 Trước "Đã giao" đều có thể chuyển sang Đã hủy (lý do, người làm, người duyệt nếu cần)
```

| Trạng thái | Ý nghĩa |
|---|---|
| Chờ trả tiền | Đơn trả trước đang chờ ngân hàng báo tiền |
| Chờ xác nhận bàn | Đơn đầu tiên của phiên bàn, chưa trả, chờ nhân viên bấm Có khách |
| Đã hẹn | Đơn đặt trước đã trả, chưa đến giờ đưa vào hàng pha |
| Đang pha | Đã ở trong hàng pha, phiếu đã in, kho đã trừ |
| Xong | Bar đã pha xong |
| Đã giao | Đã mang ra bàn hoặc khách đã lấy |
| Đã hủy | Có lý do và người làm; món chưa pha thì kho được cộng lại |

### 9.2. Các đối tượng khác

| Đối tượng | Trạng thái và chuyển tiếp |
|---|---|
| Phiên bàn | Đang ngồi → Gọi thanh toán → Đã trả → (bấm Dọn xong) → bàn Trống. Nhánh: **Bị khóa** khi nhân viên bấm "Không có ai" |
| Thanh toán | Chờ → Đã trả, hoặc Cần kiểm tra, hoặc Hết hạn. Đã trả → Đã hoàn một phần hoặc toàn bộ |
| Ca | Đang mở → Đang giao (đếm mù) → Đã đóng |
| Báo cáo cuối ngày | Nháp → Đã chốt (khóa, không sửa) |
| Chấm công | Đang làm → Đã ra, hoặc Cần xác nhận → Đã xác nhận |
| Yêu cầu duyệt | Chờ → Đã duyệt, hoặc Từ chối, hoặc Chuyển lên chủ |

---

## 10. Quản lý phía sau

### 10.1. Kho theo công thức

**Công thức mẫu: Cà phê sữa đá, size M**

| Thành phần | Định lượng | Tùy chọn làm thay đổi |
|---|---|---|
| Cốt cà phê (bán thành phẩm) | 40 ml | Size L: +15 ml; thêm shot: +20 ml |
| Sữa đặc | 25 ml | Ít đường: −7 ml; size L: +10 ml |
| Đá viên | 180 g | Ít đá: −60 g |
| Ly nhựa 16 oz, nắp, ống hút | 1 bộ | Chỉ trừ khi mang đi; size L dùng ly 22 oz |

**Các loại biến động trong sổ kho**

| Loại | Dấu | Khi nào |
|---|---|---|
| Nhập hàng | + | Nhận hàng nhà cung cấp |
| Bán | − | Đơn vào hàng pha, theo định lượng chụp lúc bán |
| Hoàn bán | + | Hủy món chưa pha |
| Mẻ pha | − nguyên liệu gốc, + bán thành phẩm | Ghi mẻ cốt cà phê, trà ủ |
| Hàng hỏng, hết hạn | − | Ghi có lý do |
| Đồ uống nhân viên | − | Đơn 0đ theo suất |
| Kiểm kê | ± | Chênh lệch giữa đếm thực tế và sổ |
| Trả nhà cung cấp | − | Hàng lỗi trả lại |

- **Kiểm kho:** kiểm nhanh 5 thứ chủ lực mỗi lần giao ca; kiểm toàn bộ mỗi tuần vào ngày quản lý có mặt. Lệch giữa sổ và thực tế quá 5% hoặc quá 50.000đ thì cảnh báo quản lý.
- **Bán thành phẩm:** ví dụ mẻ cốt cà phê dùng 500 g cà phê bột, ra khoảng 1,5 lít cốt, dùng trong 24 giờ. Ghi mẻ thì trừ cà phê bột, cộng cốt; quá hạn thì nhắc ghi hủy phần còn lại.
- **Nhập hàng:** phiếu nhập kèm ảnh hóa đơn nhà cung cấp; giá vốn tính bình quân gia quyền sau mỗi lần nhập. Quản lý vắng thì nhân viên ghi số lượng nhận, quản lý xác nhận giá sau.
- **Gợi ý đặt hàng** = lượng dùng trung bình mỗi ngày (14 ngày gần nhất) × (số ngày đến lần giao kế tiếp + 1 ngày dự phòng) − tồn hiện tại.
- **Tự báo hết món:** món nào không đủ nguyên liệu cho ít nhất một ly thì tự ẩn khỏi menu.

### 10.2. Nhân sự và lương

1. **Lịch rảnh và xếp ca.** Nhân viên đăng ký lịch rảnh tuần sau trên điện thoại (hạn tối thứ Sáu). Quản lý xếp ca từ lịch rảnh; hệ thống cảnh báo ca thiếu người hoặc thiếu người pha được. Lịch gửi qua Zalo.
2. **Chấm công bằng PIN trên màn quầy** (chỉ thiết bị đã đăng ký):
   - ân hạn 5 phút; làm tròn theo khối 15 phút;
   - đến sớm không tự cộng giờ (tính từ giờ bắt đầu ca), trừ khi quản lý duyệt;
   - về trễ quá 15 phút thành **tăng ca chờ duyệt**;
   - quên chấm ra: 2 giờ sau giờ kết thúc ca, bản ghi chuyển **Cần xác nhận**, giờ ra đề xuất bằng giờ kết thúc ca;
   - hỗ trợ ca gãy (sáng 6–11h, tối 17–22h) và nghỉ giữa ca không lương.
3. **Lương mỗi kỳ** (nửa tháng hoặc tháng):

   `Lương = giờ thường × lương giờ + giờ tăng ca × lương giờ × hệ số + phụ cấp + thưởng − phạt − tạm ứng`

   Hệ số theo Bộ luật Lao động 2019, Điều 98: làm thêm ngày thường ít nhất 150%, ngày nghỉ hằng tuần 200%, ngày lễ tết 300%; làm việc ban đêm (22h–6h) cộng thêm ít nhất 30%. **Tạm ứng** ghi qua thu chi quỹ và tự trừ vào kỳ lương.
4. **Phiếu lương** xem trên điện thoại sau khi nhập PIN; nhân viên bấm "Đã xem" hoặc "Có thắc mắc".
5. **Đồ uống nhân viên:** mỗi người một ly mỗi ca, ghi thành đơn 0đ để kho trừ đúng.

### 10.3. Khách hàng và ưu đãi

- **Hội viên chỉ cần SĐT** và tên gọi, có ô đồng ý lưu thông tin; không cần app, không cần mật khẩu.
- **Thẻ tem điện tử:** mỗi ly đồ uống được 1 tem, đủ 9 tem tặng 1 ly (cấu hình được).
- **Quà sinh nhật** (khách tự nhập ngày sinh nếu muốn) và **voucher mời bạn** (người mời và người được mời cùng nhận sau lần mua đầu).
- **Khuyến mãi tự áp:** giờ vàng (ví dụ 14–16h giảm 15% đồ uống), combo (cà phê và bánh). Mỗi bill tối đa 1 khuyến mãi và 1 voucher.
- **Đánh giá:** khách chấm sao sau khi trả; từ 2 sao trở xuống báo quản lý ngay để xử lý khi khách còn ở quán.

---

## 11. Chủ quán và chống thất thoát

### 11.1. Màn "Hôm nay" trên điện thoại chủ

- Doanh thu theo thời gian thực, so với cùng ngày tuần trước.
- Số đơn, giá trị trung bình mỗi đơn.
- Tiền mặt đang trong két, tiền chuyển khoản đã về.
- Chênh lệch két của các ca, món đang hết, ai đang làm.
- Yêu cầu đang chờ chủ duyệt.

### 11.2. Cảnh báo tức thời

| Cảnh báo | Ngưỡng mặc định | Gửi tới |
|---|---|---|
| Hủy món sau khi đã thu tiền | Mọi lần | Quản lý, chủ |
| Chênh lệch két | Quá 20.000đ | Quản lý, chủ |
| Giảm giá tay | Mọi lần | Quản lý; quá 10% thì cả chủ |
| Thanh toán cần kiểm tra | Mọi lần | Màn quầy, quản lý |
| Đơn trễ | Từ 5 đơn chờ quá 10 phút trong 30 phút | Quản lý |
| Lệch kho | Quá 5% hoặc quá 50.000đ | Quản lý |
| Mở két không bán | Quá 3 lần mỗi ca | Chủ |
| Tỷ lệ tiền mặt của một người bất thường | Cao hơn mức trung bình 4 tuần của người đó 20 điểm phần trăm | Chủ (dấu hiệu đưa QR cá nhân hoặc giữ tiền) |
| Chấm công ngoài lịch | Mọi lần | Quản lý |
| Đánh giá từ 2 sao trở xuống | Mọi lần | Quản lý |
| Màn quầy mất kết nối | Quá 2 phút trong giờ mở cửa | Quản lý, chủ |

### 11.3. Báo cáo cuối ngày

Tự gửi Zalo lúc đóng quán và khóa lại sau khi chốt:
- doanh thu theo kênh (tại bàn, mang đi, đặt trước, tại quầy, app) và theo phương thức (tiền mặt, chuyển khoản, app);
- số đơn, số ly, giá trị trung bình mỗi đơn;
- hủy, giảm giá, hoàn tiền: số lần, số tiền, người làm, người duyệt;
- tiền mặt dự kiến, tiền đếm được, chênh lệch từng ca; chuyển khoản đã về;
- thu chi quỹ trong ngày;
- 5 món bán chạy, món đã báo hết, nguyên liệu dưới mức tối thiểu;
- giờ công từng người, các bản chấm công cần xác nhận.

### 11.4. Báo cáo tuần và tháng

- **Lãi gộp** = doanh thu thuần − giá vốn (định lượng × giá vốn bình quân).
- **Giá vốn / doanh thu** (tham khảo 25–35%) và **chi phí nhân sự / doanh thu** (tham khảo không quá 25%). Tổng hai khoản này (prime cost) nên dưới khoảng 60%.
- **Lãi ước tính** = lãi gộp − chi phí nhân sự − chi phí cố định (mặt bằng, điện nước, khấu hao thiết bị) − hoa hồng app − phí dịch vụ.
- Doanh thu theo giờ và theo thứ (để xếp ca), theo kênh; tỷ lệ khách quay lại; điểm đánh giá trung bình.
- **Phân tích món** theo lượng bán và lãi mỗi ly:

| Nhóm | Bán | Lãi mỗi ly | Nên làm |
|---|---|---|---|
| Ngôi sao | Nhiều | Cao | Giữ nguyên, đặt ở vị trí đẹp trên menu |
| Ngựa kéo | Nhiều | Thấp | Tăng giá nhẹ hoặc giảm thành phần đắt |
| Câu đố | Ít | Cao | Quảng bá, đổi ảnh hoặc tên, gợi ý khi khách gọi món |
| Nên bỏ | Ít | Thấp | Bỏ khỏi menu hoặc thay món khác |

### 11.5. Chống thất thoát

| Rủi ro thường gặp | Hệ thống chặn bằng cách |
|---|---|
| Nhân viên đưa QR tài khoản cá nhân cho khách quét | Hệ thống chỉ hiện VietQR của quán, kèm mã thanh toán; đơn chỉ thành Đã trả khi ngân hàng báo tiền về; cảnh báo khi tỷ lệ tiền mặt của một người tăng bất thường |
| Khách đưa ảnh chụp chuyển khoản giả | Ảnh không có giá trị; chỉ báo tiền từ ngân hàng mới được tính |
| Thu tiền mặt rồi hủy đơn | Không xóa được đơn; hủy sau khi đã thu cần duyệt và báo chủ; có báo cáo hủy theo từng người |
| Giảm giá cho người quen | Chỉ giảm theo chương trình có sẵn; giảm tay phải được duyệt |
| Lệch két | Đếm mù khi giao ca; chênh lệch gắn với ca và người |
| Pha ly không ghi bill | Phiếu pha chỉ in từ đơn; đối chiếu sổ kho với thực tế của sữa, cà phê; ly nhân viên ghi riêng |
| Chấm công hộ | Mỗi người một PIN; chỉ chấm được trên thiết bị của quán |
| Sửa số liệu sau khi chốt | Nhật ký chỉ ghi thêm; báo cáo cuối ngày khóa sau khi chốt |

---

## 12. Thiết kế dữ liệu

### 12.1. Sơ đồ quan hệ chính

```
stores ─┬─< tables ─< table_sessions ─< orders ─< order_items ─< order_item_options
        │              └─< payments      └─< payments
        ├─< products ─< recipe_lines >─ ingredients ─< stock_moves
        ├─< shifts ─< cash_counts · cash_moves · payments
        ├─< users ─< time_entries · roster_slots · payslips
        └─< customers ─< loyalty_moves · vouchers · reviews

 Ký hiệu:  A ─< B  một A có nhiều B      A >─ B  nhiều A thuộc một B
 order_items ─< order_item_usage >─ ingredients   (định lượng chụp lúc bán)
```

### 12.2. Bảng chính

**Bán hàng**

| Bảng | Trường chính | Ghi chú |
|---|---|---|
| `stores` | id, name, address, phone, timezone | Mọi bảng nghiệp vụ khác có `store_id` |
| `tables` | id, store_id, area, code, name, qr_token, active | `qr_token` ngẫu nhiên, đổi được khi lộ |
| `table_sessions` | id, table_id, status, opened_at, verified_by, verified_at, closed_at | Một lượt khách ngồi bàn |
| `session_devices` | session_id, device_cookie, is_host, approved_by, joined_at | Điện thoại trong phiên; điện thoại sau phải được chủ bàn hoặc nhân viên đồng ý |
| `orders` | id (UUID), store_id, session_id, channel, day_number, status, pickup_at, subtotal, discount, total, customer_id, created_by, device_id, created_at | `channel`: tại bàn, mang đi QR, tại quầy, đặt trước, app giao hàng |
| `order_items` | id, order_id, product_id, name_snap, price_snap, qty, note, station, status | Tên và giá chụp lúc bán |
| `order_item_options` | order_item_id, option_id, name_snap, price_delta_snap | Tùy chọn đã chọn |
| `order_item_usage` | order_item_id, ingredient_id, qty | Định lượng chụp lúc bán, dùng để trừ kho |

**Tiền**

| Bảng | Trường chính | Ghi chú |
|---|---|---|
| `payments` | id, store_id, session_id, order_id, method, amount, status, pay_code, bank_txn_id, paid_at, shift_id, received_by | `bank_txn_id` là khóa duy nhất |
| `refunds` | id, payment_id, amount, method, reason, requested_by, approved_by, created_at | |
| `shifts` | id, store_id, opened_by, opened_at, opening_cash, status, closed_at | |
| `cash_counts` | id, shift_id, kind (mở, giao, đóng), counted_by, denominations, counted, expected, variance | `expected` không hiện cho người đếm |
| `cash_moves` | id, shift_id, type (thu, chi, tạm ứng), amount, reason, photo, requested_by, approved_by | |
| `daily_reports` | id, store_id, date, figures, locked_at | Báo cáo cuối ngày, khóa sau khi chốt |

**Thực đơn và kho**

| Bảng | Trường chính | Ghi chú |
|---|---|---|
| `categories`, `products` | product: id, category_id, name, photo, station, prep_seconds, active | `station`: Bar hoặc Quầy |
| `option_groups`, `options` | option: id, group_id, name, price_delta | Size, đường, đá, topping |
| `channel_prices` | product_id, channel, price | Giá app giao hàng khác giá tại quán |
| `ingredients` | id, name, unit, kind, avg_cost, min_level, shelf_hours | `kind`: nguyên liệu, bán thành phẩm, bao bì |
| `recipe_lines` | product_id hoặc option_id, ingredient_id, qty, takeaway_only | Bao bì chỉ trừ khi mang đi |
| `batches` | id, ingredient_id, qty, made_by, made_at, expires_at | Mẻ cốt cà phê, trà ủ |
| `stock_moves` | id, ingredient_id, type, qty (±), unit_cost, ref_type, ref_id, reason, user_id, created_at | Sổ cái kho, chỉ ghi thêm |
| `suppliers`, `purchase_receipts`, `receipt_lines` | receipt: supplier_id, photo, total, received_by, confirmed_by | |
| `stock_counts`, `stock_count_lines` | count: kind (nhanh, toàn bộ), shift_id; line: expected, counted, variance | |

**Con người**

| Bảng | Trường chính | Ghi chú |
|---|---|---|
| `users` | id, name, phone, role (nhân viên, quản lý, chủ), pin_hash, password_hash, hourly_rate, active | Nhân viên chỉ có PIN |
| `devices` | id, store_id, name, token_hash, last_seen_at, revoked_at | Màn quầy và thiết bị dự phòng |
| `time_entries` | id, user_id, position, clock_in, clock_out, status, device_id, edited_by, edit_reason | `status`: đang làm, đã ra, cần xác nhận |
| `availability`, `roster_slots` | slot: user_id, date, start, end, position | Lịch rảnh và lịch ca |
| `payslips` | id, period, user_id, regular_hours, overtime_hours, allowances, deductions, advances, total | |

**Khách hàng và hệ thống**

| Bảng | Trường chính | Ghi chú |
|---|---|---|
| `customers` | id, phone (duy nhất), nickname, birthday, consent_at | |
| `loyalty_moves` | id, customer_id, order_id, stamps (±), reason | Sổ tem, chỉ ghi thêm |
| `vouchers` | id, customer_id, code, kind, value, expires_at, used_order_id | |
| `reviews` | id, session_id, order_id, rating, comment, handled_by | |
| `approvals` | id, type, payload, requested_by, approver_id, status, decided_at | Duyệt tại chỗ hoặc từ xa |
| `audit_logs` | id, user_id, device_id, action, entity, entity_id, before, after, at | Chỉ ghi thêm |
| `settings` | store_id, key, value | Hạn mức, ngưỡng, giờ mở cửa |
| `notifications` | id, recipient, channel, template, status | Zalo, Web Push |

### 12.3. Quy tắc dữ liệu

1. Tiền, kho, tem chỉ thay đổi qua **sổ cái** (thêm dòng); số dư luôn tính lại được từ sổ.
2. Tên, giá, tùy chọn và định lượng được **chụp vào đơn** lúc bán; sửa thực đơn sau đó không làm sai đơn cũ.
3. Mã đơn là **UUID sinh ngay trên thiết bị**, nên đơn tạo lúc mất mạng không trùng; số thứ tự trong ngày do máy chủ cấp khi đồng bộ.
4. Báo tiền ngân hàng xử lý **một lần** theo `bank_txn_id`.
5. Tiền lưu **số nguyên đồng**; thời gian lưu UTC, hiển thị giờ Việt Nam.
6. Không xóa cứng dữ liệu đã có lịch sử (món đã bán, nhân viên đã làm), chỉ chuyển sang ngừng dùng.

---

## 13. Giao diện

### 13.1. Màn quầy

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ! Bàn 7: đơn mới – Có khách?   ! Bàn 3 gọi thanh toán   ✓ Mang ra Bàn 8   │
├─────────────────────────────┬─────────────────────────────────────────────┤
│ HÀNG PHA · Minh (Bar)       │ QUẦY · Lan        [Bán] [Bàn] [Đơn] [Ca]    │
│                             │                                             │
│ Gom: 3× Cà phê sữa đá       │ Cà phê đen   Cà phê sữa   Bạc xỉu           │
│      (1 ly ít đường)        │ Trà đào      Latte        Bánh croissant    │
│                             │                                             │
│ #21 Bàn 5     2:10  [Xong]  │ Giỏ: 2 món · 54.000đ                        │
│ #22 Mang đi   0:45  [Xong]  │ [Tiền mặt]   [Chuyển khoản]                 │
│ #23 Bàn 2     0:10  [Xong]  │                                             │
└─────────────────────────────┴─────────────────────────────────────────────┘
```

- **Thanh báo trên cùng, luôn hiện:** đơn bàn mới chờ xác nhận, gọi nhân viên, gọi thanh toán, món xong cần mang ra, thanh toán cần kiểm tra, món hết. Mỗi loại một tiếng chuông riêng.
- **Vùng trái, Hàng pha:** gom ly ở đầu, mỗi phiếu có đồng hồ chờ và nút Xong to.
- **Vùng phải, Quầy:**

| Tab | Nội dung |
|---|---|
| Bán | Lưới món hay bán, tìm món, giỏ, thu tiền mặt hoặc chuyển khoản, ghi đơn app |
| Bàn | Sơ đồ bàn theo trạng thái: trống, đang ngồi (bao lâu), chờ xác nhận, gọi thanh toán, đã trả, cần dọn; gọi món hộ |
| Đơn | Đơn đang chạy theo kênh, tìm theo số; hủy, hoàn tiền (cần duyệt) |
| Ca | Chấm công, đổi vị trí, thu chi quỹ, kiểm kho nhanh, giao ca, đóng ca |

- **Quản lý mở Quản trị bằng PIN:** màn Quản trị chiếm màn hình nhưng vẫn giữ thanh báo và một cột hàng pha thu nhỏ; để yên 2 phút thì tự quay về màn quầy.

### 13.2. Điện thoại khách và chủ

```
┌────────────────────────┐ ┌────────────────────────┐ ┌────────────────────────┐
│ Bàn 5 · Gọi món        │ │ Giỏ của bàn · 3 món    │ │ Đơn số 21 · Bàn 5      │
│ [Cà phê] [Trà] [Đá xay]│ │ Cà phê sữa đá M     29k│ │ ● Đã nhận         08:02│
│ ★ Hay gọi              │ │   ít đường             │ │ ● Đang pha             │
│ Cà phê sữa đá   29k [+]│ │ Bạc xỉu M           32k│ │ ○ Mang ra bàn          │
│ Bạc xỉu         32k [+]│ │ Bánh croissant      25k│ │                        │
│ Trà đào         35k [+]│ │ Tạm tính            86k│ │ Chờ khoảng 6 phút      │
│ Latte           hết món│ │                        │ │                        │
│                        │ │ (•) Trả ngay - VietQR  │ │ [Gọi thêm] [Gọi NV]    │
│                        │ │ ( ) Trả khi về         │ │ [Thanh toán]           │
│ [ 3 món · 86.000đ   → ]│ │ [      Gửi đơn       ] │ │                        │
└────────────────────────┘ └────────────────────────┘ └────────────────────────┘
      Menu theo bàn               Giỏ và cách trả             Theo dõi đơn

┌────────────────────────┐ ┌────────────────────────┐
│ Thanh toán 86.000đ     │ │ Hôm nay · 15:40        │
│ Nội dung: CF7K2Q       │ │ Doanh thu  4.250.000đ  │
│     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓     │ │ ▲ 12% so với tuần trước│
│     ▓▓  VietQR  ▓▓     │ │ 96 đơn · TB 44.300đ    │
│     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓     │ │ Tiền mặt  1.180.000đ   │
│                        │ │ Chuyển khoản 2.870.000đ│
│ [Mở app ngân hàng]     │ │ ! Lệch két ca sáng -20k│
│ [Lưu ảnh QR]           │ │ ! 2 món hủy sau khi thu│
│                        │ │ Đang làm: Lan, Minh    │
│ Đang chờ ngân hàng…    │ │ [Duyệt (1)] [Báo cáo]  │
└────────────────────────┘ └────────────────────────┘
   Trả tiền trên điện thoại       Chủ quán: Hôm nay
```

### 13.3. Phiếu pha và bill in

```
========================================
 SỐ 21            BÀN 5           08:02
========================================
 1 x Cà phê sữa đá (M)
     - ít đường
 1 x Bạc xỉu (M)
----------------------------------------
 Quầy lấy kèm: 1 x Bánh croissant
 Ghi chú: ít đá giúp mình
========================================

========================================
            QUÁN CÀ PHÊ ABC
     12 Đường XYZ · ĐT 0901 234 567
----------------------------------------
 Số 22 · Mua tại quầy       13/11 08:05
 Cà phê sữa đá (M)           1 x 29.000
 Bánh croissant              1 x 25.000
----------------------------------------
 TỔNG CỘNG                      54.000đ
----------------------------------------
 Chuyển khoản: quét mã dưới đây
            ▓▓▓▓▓▓▓▓▓▓▓▓
            ▓▓ VietQR ▓▓
            ▓▓▓▓▓▓▓▓▓▓▓▓
 Nội dung: CF9M4T     Số tiền: 54.000đ
========================================
```

### 13.4. Nguyên tắc giao diện

- **Màn quầy:** tên món trong vùng Hàng pha cỡ chữ từ 28 px, đọc được từ cách 2 mét; nút bấm từ 56 px, bấm được khi tay ướt.
- **Không có hộp thoại che cả màn quầy;** mỗi hộp thoại chỉ nằm trong vùng của nó.
- **Âm báo** khác nhau cho từng loại, chỉnh được âm lượng.
- **Khách gọi một món mặc định tối đa 3 chạm;** có tùy chọn chữ lớn cho người lớn tuổi.
- **Tiền luôn hiện đầy đủ** dạng "29.000đ"; trạng thái không chỉ báo bằng màu mà luôn kèm chữ hoặc biểu tượng.
- **Tiếng Việt trước;** menu khách có thể thêm tiếng Anh.

---

## 14. API và sự kiện realtime

### 14.1. Nhóm API

| Nhóm | Ví dụ | Ai gọi | Bảo vệ |
|---|---|---|---|
| Khách | `GET /api/t/{qrToken}` (bàn, menu) · `POST /api/t/{qrToken}/join` · `POST /api/orders` · `GET /api/orders/{id}` · `POST /api/payments` (tạo VietQR) · `POST /api/sessions/{id}/call` · `POST /api/sessions/{id}/splits` · `POST /api/reviews` | Điện thoại khách | Cookie phiên bàn; giới hạn tần suất; chỉ thấy phiên của mình |
| Màn quầy | `GET /api/counter/board` · `POST /api/sessions/{id}/verify` · `POST /api/counter/orders` · `POST /api/orders/{id}/ready` · `POST /api/orders/{id}/served` · `PUT /api/products/{id}/availability` · `POST /api/shifts/{id}/counts` · `POST /api/approvals` | Màn quầy | Mã thiết bị đã đăng ký; thao tác nhạy cảm kèm PIN |
| Quản lý, chủ | `/api/admin/products` · `/api/admin/recipes` · `/api/admin/stock/...` · `/api/admin/roster` · `/api/admin/payroll` · `/api/admin/reports/...` · `POST /api/approvals/{id}/decide` | Điện thoại, máy tính | Đăng nhập và quyền theo vai trò |
| Ngân hàng | `POST /api/webhooks/bank` | Dịch vụ báo tiền về | Kiểm chữ ký; xử lý một lần theo mã giao dịch |
| Đồng bộ ngoại tuyến | `POST /api/counter/sync` | Màn quầy khi có mạng lại | Mã thiết bị; đơn có UUID nên gửi lại không trùng |

### 14.2. Sự kiện realtime

| Sự kiện | Gửi tới | Khi nào |
|---|---|---|
| `order.placed` | Màn quầy | Có đơn mới |
| `session.verify_needed` | Màn quầy | Đơn đầu tiên của bàn chưa trả |
| `session.join_requested` | Điện thoại chủ bàn, màn quầy | Điện thoại khác xin vào bàn |
| `payment.paid` | Màn quầy, điện thoại khách | Ngân hàng báo tiền về và khớp |
| `payment.needs_check` | Màn quầy, quản lý | Tiền về lệch hoặc không khớp |
| `order.ready` | Màn quầy, điện thoại khách | Bar bấm Xong |
| `order.served` | Điện thoại khách | Nhân viên bấm Đã mang |
| `table.call` | Màn quầy | Khách bấm Gọi nhân viên |
| `table.bill_requested` | Màn quầy | Khách bấm Gọi thanh toán |
| `item.unavailable` | Điện thoại khách, màn quầy | Báo hết món hoặc hết nguyên liệu |
| `rush.changed` | Điện thoại khách, màn quầy | Bật hoặc tắt chế độ cao điểm |
| `approval.requested`, `approval.decided` | Điện thoại quản lý, chủ; màn quầy | Có yêu cầu duyệt; có kết quả |
| `alert.raised` | Quản lý, chủ | Vượt ngưỡng cảnh báo |

Màn quầy gửi nhịp kết nối mỗi 15 giây. Quá 60 giây không nhận được nhịp, máy chủ tự tạm ngưng nhận đơn QR; có lại nhịp thì mở lại.

---

## 15. Công nghệ và hạ tầng

| Lớp | Đề xuất | Lý do |
|---|---|---|
| Giao diện | Next.js (React, TypeScript), một bộ mã PWA, ba phần: Khách, Màn quầy, Quản trị | Không cài app; trang quán làm SEO tốt; một bộ mã |
| Máy chủ | NestJS (Node.js, TypeScript), REST + Socket.IO | Realtime tốt; cùng ngôn ngữ với giao diện |
| Cơ sở dữ liệu | PostgreSQL | Giao dịch chặt cho tiền và kho; khóa dòng khi cần |
| Việc nền | Hàng đợi chạy ngay trên PostgreSQL (ví dụ pg-boss) | Chưa cần Redis ở quy mô một quán |
| Hạ tầng | 1 VPS 2 vCPU / 4 GB ở Việt Nam hoặc Singapore, Docker Compose, HTTPS (Let's Encrypt) | Đủ cho 1–3 quán; có HTTPS mới dùng được thông báo đẩy |
| Sao lưu, giám sát | Bản đầy đủ hằng ngày và nhật ký thay đổi liên tục (WAL), lưu ra nơi khác 30 ngày; kiểm tra sống mỗi phút; theo dõi lỗi | Khôi phục được khi máy chủ hỏng; biết sự cố trước khách |
| In ấn | Lệnh ESC/POS (in, cắt giấy, mở két, in mã QR). Tablet Android dùng ứng dụng cầu nối in (ví dụ RawBT); laptop Windows dùng chương trình cầu nối nhỏ | Trình duyệt không in thẳng ra máy in nhiệt một cách ổn định |
| Ngoại tuyến | Service Worker giữ giao diện và menu; đơn lưu trong IndexedDB với mã UUID; số thứ tự tạm (T1, T2…) | Mất mạng vẫn bán, có mạng lại tự đồng bộ |
| Thanh toán | VietQR + dịch vụ báo tiền về (PayOS, SePay…) qua một lớp tích hợp đổi được nhà cung cấp | Tự xác nhận; không phụ thuộc một nhà cung cấp |
| Thông báo | Zalo OA/ZNS cho chủ, quản lý, khách (có đồng ý); Web Push cho quản lý, chủ | Người Việt dùng Zalo |

---

## 16. Yêu cầu phi chức năng

| Tiêu chí | Mục tiêu |
|---|---|
| Đơn hiện ở màn quầy và in phiếu | Trong 2 giây sau khi gửi, hoặc sau khi tiền về |
| Ngân hàng báo tiền → đơn chuyển Đã trả | Trong 3 giây sau khi máy chủ nhận báo |
| Mở menu QR trên 4G | Trong 3 giây (ảnh nén WebP, tải dần) |
| Khách gọi một món mặc định | Tối đa 3 chạm |
| Thu ngân bán một ly tại quầy | Tối đa 5 giây |
| Tải giờ cao điểm | 100 đơn mỗi giờ, 30 điện thoại cùng lúc, không chậm |
| Sẵn sàng | 99,5% trong giờ mở cửa; mất mạng vẫn bán tiền mặt |
| Đọc màn quầy | Tên món trong Hàng pha đọc được từ cách 2 mét |
| Học cách dùng | Nhân viên mới dùng được sau 30 phút hướng dẫn |
| Khôi phục | Máy chủ hỏng hẳn: mất tối đa 15 phút dữ liệu, khôi phục trong 2 giờ; đơn chưa đồng bộ trên màn quầy không mất |

---

## 17. Bảo mật và dữ liệu cá nhân

- **Đăng nhập:**
  - chủ và quản lý: tên đăng nhập và mật khẩu; chủ bật thêm xác thực hai lớp bằng ứng dụng OTP;
  - nhân viên: không có mật khẩu web, chỉ có **PIN 4 số** dùng trên thiết bị đã đăng ký; sai 5 lần khóa 5 phút;
  - khách: không có tài khoản; cookie phiên bàn hết hiệu lực khi phiên đóng.
- **Thiết bị:** màn quầy đăng ký bằng mã chủ cấp một lần; mã lưu dạng băm; chủ thu hồi được từ xa khi mất máy.
- **Quyền kiểm ở máy chủ;** giao diện chỉ ẩn hoặc hiện nút.
- **Chống lạm dụng QR:** xác nhận bàn mới; chủ bàn duyệt người xin vào; giới hạn số đơn mỗi phút của một phiên; đổi được mã QR từng bàn khi lộ; tự ngưng nhận đơn QR khi màn quầy mất kết nối.
- **Báo tiền ngân hàng:** chỉ nhận khi đúng chữ ký hoặc khóa bí mật của nhà cung cấp; xử lý một lần theo mã giao dịch.
- **Lưu trữ:** HTTPS toàn bộ; mật khẩu và PIN băm (bcrypt hoặc argon2); sao lưu mã hóa; nhật ký chỉ ghi thêm, giữ 12 tháng; SĐT khách che bớt trong báo cáo (090****567).
- **Dữ liệu cá nhân của khách:** chỉ thu SĐT, tên gọi, ngày sinh (nếu khách muốn); có đồng ý, cho rút đồng ý và xóa dữ liệu; tuân thủ Nghị định 13/2023 và Luật Bảo vệ dữ liệu cá nhân.

---

## 18. Xử lý sự cố

| Sự cố | Hệ thống tự làm | Nhân viên làm |
|---|---|---|
| Wi-Fi quán hỏng | Tablet tự chuyển sang 4G | Không cần làm gì |
| Mất hẳn internet | Màn quầy chuyển chế độ ngoại tuyến; máy chủ tự tạm ngưng nhận đơn QR sau 60 giây, khách thấy "Vui lòng gọi món tại quầy" | Bán tiền mặt tại quầy, phiếu vẫn in; có mạng lại thì tự đồng bộ và mở lại QR |
| Máy in hết giấy hoặc hỏng | Màn quầy báo; phiếu chưa in xếp hàng chờ in lại | Thay giấy; trong lúc đó pha theo vùng Hàng pha |
| Ngân hàng báo tiền chậm | Đơn Chờ trả tiền có nút "Kiểm tra lại"; quá 10 phút tự hủy; tiền về muộn thì ghi Cần kiểm tra | Hỏi khách; xử lý mục Cần kiểm tra để khôi phục đơn hoặc hoàn tiền |
| Màn quầy hỏng | – | Mở chế độ quầy trên **thiết bị dự phòng đã đăng ký sẵn** (điện thoại quản lý hoặc laptop) |
| Máy chủ cloud sự cố | Màn quầy chạy ngoại tuyến; giám sát báo người vận hành | Bán tiền mặt; người vận hành khôi phục từ sao lưu |
| Bán nhầm, thu nhầm | – | Dùng hủy hoặc hoàn có duyệt; không sửa trực tiếp |

---

## 19. Cấu hình mặc định

Chủ chỉnh được mọi giá trị trong bảng này.

| Thiết lập | Mặc định |
|---|---|
| Thời gian chờ trả tiền cho đơn trả trước | 10 phút |
| Xác nhận bàn mới | Nhắc lại mỗi phút; tự hủy sau 10 phút |
| Bật chế độ cao điểm | Hàng pha quá 12 ly, hoặc ly chờ lâu nhất quá 8 phút |
| Tắt chế độ cao điểm | Hàng pha dưới 6 ly |
| Đồng hồ chờ trên phiếu | Vàng sau 5 phút, đỏ sau 10 phút |
| Công suất đặt trước | 15 ly mỗi khung 15 phút; giờ cao điểm 8 ly |
| Tạm ngưng đơn QR khi màn quầy mất kết nối | Sau 60 giây |
| Ân hạn và làm tròn chấm công | 5 phút; khối 15 phút |
| Quên chấm ra | 2 giờ sau giờ kết thúc ca thì chuyển Cần xác nhận |
| Cảnh báo lệch két | Quá 20.000đ |
| Cảnh báo lệch kho | Quá 5% hoặc quá 50.000đ |
| Hạn mức duyệt | Xem mục 4.3 |
| Đóng phiên bàn đã trả | Khi bấm Dọn xong, hoặc tự đóng sau 30 phút |
| Thẻ tem | 9 tem tặng 1 ly |
| Giữ nhật ký thao tác | 12 tháng |
| Giữ sao lưu | 30 ngày |

---

## 20. Lộ trình triển khai

Thời gian ước tính cho một nhóm 1–2 lập trình viên.

| Giai đoạn | Nội dung | Thời gian | Đo thành công (tham khảo) |
|---|---|---|---|
| 0. Chuẩn bị | Chốt thực đơn, công thức, ảnh món; mở dịch vụ báo tiền về; mua thiết bị; in QR | 1 tuần | Đủ dữ liệu thực đơn và công thức |
| 1. Bán được | Thực đơn và tùy chọn; QR bàn và mang đi; màn quầy hai vùng; phiếu pha; VietQR tự xác nhận; tiền mặt; ca và két đếm mù; ba vai trò; báo cáo cuối ngày | 6–8 tuần | Ít nhất 50% đơn qua QR; giờ cao điểm khách chờ không quá 7 phút; chênh lệch két gần bằng 0 |
| 2. Kiểm soát | Kho theo công thức và bán thành phẩm, nhập hàng, kiểm kho; chấm công PIN, lịch ca; duyệt từ xa; cảnh báo qua Zalo; thẻ tem | 4–6 tuần | Hao hụt sữa và cà phê không quá 3%; giá vốn 25–35% doanh thu |
| 3. Tăng trưởng | Đặt trước theo khung giờ; lương; phân tích món; hóa đơn điện tử; tích hợp app giao hàng; bán cà phê đóng gói online | 6–8 tuần | Chi phí nhân sự không quá 25% doanh thu; tỷ lệ khách quay lại tăng |

**Cách đưa vào dùng**
1. Nhập thực đơn, công thức, tồn đầu kỳ; in QR; đăng ký màn quầy và thiết bị dự phòng; đặt PIN cho từng người.
2. Hướng dẫn mỗi người 30 phút; dán hướng dẫn 3 bước trên bàn: Quét mã, Chọn món, Trả tiền.
3. Chạy giờ vắng trước (buổi chiều); sau 3 ngày mới dùng cho giờ cao điểm.
4. Tuần đầu quản lý có mặt cả ngày, so số liệu với cách làm cũ.
5. Đo các chỉ số ở bảng trên trước và sau 4 tuần.

---

## 21. Rủi ro và cách giảm

| Rủi ro | Mức | Cách giảm |
|---|---|---|
| Khách lớn tuổi không quen QR | Trung bình | Luôn bán được tại quầy và gọi món hộ; hướng dẫn 3 bước trên bàn |
| Đơn ảo từ ảnh chụp QR | Trung bình | Xác nhận bàn mới, chủ bàn duyệt người vào, giới hạn tần suất, đổi mã QR |
| Mạng yếu giờ cao điểm | Cao | Menu nhẹ, tablet có 4G, chế độ ngoại tuyến, tự ngưng QR khi quầy mất kết nối |
| Một màn hình thành nút thắt | Trung bình | Hai vùng độc lập, phiếu in cho Bar, khách tự gọi và tự trả |
| Nhân viên lách quy trình (QR cá nhân, giữ tiền mặt) | Cao | Chỉ hiện VietQR của quán, đếm mù, cảnh báo tỷ lệ tiền mặt bất thường |
| Phí dịch vụ báo tiền hoặc Zalo thay đổi | Thấp | Lớp tích hợp đổi được nhà cung cấp |
| Phụ thuộc cloud | Trung bình | Ngoại tuyến tại quầy, sao lưu liên tục, giám sát |
| Quy định thuế, hóa đơn thay đổi | Trung bình | Chừa điểm nối hóa đơn điện tử; xuất dữ liệu cho kế toán |

---

## 22. Kịch bản nghiệm thu

| # | Kịch bản | Kết quả mong đợi |
|---|---|---|
| 1 | Khách quét QR Bàn 5, gọi 3 món, chọn Trả khi về | Màn quầy báo "Bàn 5 có khách?"; bấm Có thì phiếu pha in trong 2 giây |
| 2 | Điện thoại thứ hai quét QR Bàn 5 | Chủ bàn nhận "Có người xin vào bàn"; chưa đồng ý thì không gọi món được |
| 3 | Khách mang đi trả bằng VietQR | Tiền về thì đơn vào hàng pha và in phiếu; điện thoại hiện số thứ tự |
| 4 | Khách mang đi không trả trong 10 phút | Đơn tự hủy, không in phiếu |
| 5 | Khách chuyển thiếu 5.000đ | Thanh toán Cần kiểm tra; đơn không vào hàng pha |
| 6 | Ngân hàng gửi lại cùng một báo tiền | Chỉ ghi nhận một lần |
| 7 | Người Bar bấm Xong khi người Quầy đang nhập giỏ | Giỏ của người Quầy không mất; thao tác ghi đúng tên từng người |
| 8 | Hủy món đã thu tiền khi quản lý vắng | Yêu cầu lên điện thoại quản lý; chưa duyệt thì bill không đổi |
| 9 | Giao ca, đếm mù thiếu 30.000đ | Yêu cầu đếm lại; vẫn thiếu thì ghi chênh lệch cho ca sáng, chủ nhận cảnh báo |
| 10 | Rút mạng màn quầy | Vẫn bán tiền mặt và in phiếu; sau 60 giây khách quét QR thấy "Vui lòng gọi món tại quầy"; có mạng lại thì đồng bộ và QR mở lại |
| 11 | Báo hết Latte | Latte ẩn ngay trên điện thoại khách; giỏ đang có Latte được báo khi gửi |
| 12 | Bán 20 ly Cà phê sữa đá size M | Sổ kho trừ 800 ml cốt cà phê, 500 ml sữa đặc; kiểm nhanh lệch quá 5% thì cảnh báo |

---

## 23. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| PWA | Trang web dùng như ứng dụng, mở từ trình duyệt, chạy được một phần khi mất mạng |
| VietQR động | Mã QR chuyển khoản theo chuẩn NAPAS, có sẵn số tiền và nội dung cho từng bill |
| Báo tiền về (webhook) | Ngân hàng, qua dịch vụ trung gian, gọi vào máy chủ của quán khi có tiền vào tài khoản |
| Sổ cái chỉ ghi thêm | Mỗi thay đổi là một dòng mới; không sửa, không xóa dòng cũ |
| Đếm mù | Đếm tiền trong két mà không được xem số hệ thống dự kiến |
| Gom ly | Gộp các ly giống nhau từ nhiều đơn để pha một lượt |
| Bán thành phẩm | Thứ pha sẵn từ nguyên liệu gốc để dùng dần: cốt cà phê, trà ủ, syrup |
| Phiên bàn | Một lượt khách ngồi ở một bàn, từ lúc gọi món đến lúc trả tiền và dọn bàn |
| Chủ bàn | Điện thoại đầu tiên mở phiên bàn, duyệt các điện thoại khác xin vào |
| Màn quầy | Màn hình duy nhất của quán, chia vùng Hàng pha và vùng Quầy |
| ESC/POS | Bộ lệnh điều khiển máy in nhiệt: in, cắt giấy, mở két |
| Modular monolith | Một chương trình máy chủ duy nhất nhưng chia module tách bạch |
| Prime cost | Giá vốn cộng chi phí nhân sự |
