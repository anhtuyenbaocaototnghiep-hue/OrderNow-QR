# ADR-020 — Phát hiện bất thường và gửi cảnh báo qua email

- **Trạng thái:** ACCEPTED (27/10/2026). Chủ dự án: "phát hiện bất thường … gửi về email được ghi trong cài đặt … dễ dàng thay đổi" → "tiến hành làm". Phương án đã trình: `PHƯƠNG-ÁN-GỬI-CẢNH-BÁO-EMAIL.md`, `Ý-TƯỞNG-CẢNH-BÁO-BẤT-THƯỜNG-ZALO.md` (thư mục làm việc, ngoài repo).
- **Bối cảnh:** bài đã tách tiền mặt / chuyển khoản để két không "thiếu tiền giả" (ADR-019). Thất thoát thật vẫn có thể nằm ở: lệch két khi đóng ca, nhân viên nhận tiền mặt rồi bấm chuyển khoản, hủy món đã pha, hoàn tiền, giảm giá tay, sửa / hủy khoản chi đã duyệt. Dữ liệu đều đã có (ca, lượt thu, hoàn tiền, `OrderItemVoids`, sổ quỹ, nhật ký thao tác) nhưng chủ quán phải tự soi. Kênh gửi đã cân nhắc: Zalo ZNS (cần OA xác thực, mẫu tin được duyệt, ~200–800đ/tin), tin tư vấn Zalo OA (chỉ trong 48 giờ), Facebook Messenger (chỉ trong 24 giờ), Telegram, email.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-75 | **Phát hiện bằng luật dễ giải thích.** Lúc **đóng ca** kiểm 5 dấu hiệu: lệch két, tỉ lệ lượt thu chuyển khoản, số món **đã pha** bị hủy (`StockMode = WASTE`), số lượt hoàn tiền, số lượt giảm giá tay. **Tức thì**: hoàn tiền từ mức "lớn" trở lên; hủy / sửa khoản sổ quỹ đã duyệt. Mỗi dấu hiệu bất thường khi **vượt ngưỡng cố định** (quản lý chỉnh trong Cài đặt) **hoặc** — khi đã có ≥ 10 ca đóng trước đó — **vượt trung bình + 2 độ lệch chuẩn của 30 ca gần nhất** và không dưới mức tối thiểu của dấu hiệu đó (lệch két chỉ dùng ngưỡng cố định). Cảnh báo ghi rõ giá trị, ngưỡng, mức bình thường, người liên quan; là **gợi ý để kiểm tra**, không kết luận ai sai. |
| D-76 | **Kênh: trong app (luôn có) + email.** Cảnh báo lưu trong CSDL, hiện ở trang **"Cảnh báo bất thường"** (chỉ ADMIN). Email gửi qua SMTP (thư viện `nodemailer`): **người nhận** (1–5 địa chỉ) đặt trong **Cài đặt**, đổi lúc nào cũng có hiệu lực ngay; **hộp thư gửi** (`SMTP_*`, `MAIL_FROM`) đặt **một lần trong `.env`** — mật khẩu không vào CSDL / giao diện / nhật ký. Ba loại email bật / tắt riêng: **cảnh báo tức thì**, **báo cáo khi đóng ca** (luôn gửi khi bật — "két khớp ✔" hoặc có ⚠️), **tổng kết ngày** theo giờ đã cài. Zalo / Messenger / Telegram **không làm trong ADR này** (điều kiện / chi phí ở bối cảnh) — kênh mới sau này cắm vào cùng hàng đợi. |
| D-77 | **Hàng đợi gửi (`AlertOutbox`)** — đóng ca / hoàn tiền / sửa sổ quỹ **không bao giờ chờ hoặc lỗi vì email**. Bộ gửi nền (`src/jobs/alertMailer.js`, interval riêng 60 giây — không đăng ký vào scheduler để không ghi `JobRuns` mỗi phút) gửi; lỗi → thử lại 5 lần sau 1 → 5 → 15 → 60 → 240 phút (6 lần gửi), vẫn lỗi → `FAILED` (hiện ở Cài đặt, nút **"Gửi lại email lỗi"**); kick() và bộ gửi nền dùng chung một lượt gửi (không chạy chồng); mỗi email có khóa chống trùng; tối đa 20 email / giờ (tính cả email thử — chống dùng hộp thư của quán gửi hàng loạt); email tạo trong **giờ yên lặng** (nếu bật) hoãn tới hết giờ yên lặng (trừ thư báo đổi người nhận). Tổng kết ngày = **24 giờ tính tới giờ gửi** (22:00 hôm trước → 22:00 hôm nay — không bỏ sót ca đóng sau giờ gửi). Tổng kết **hôm qua** bị lỡ (máy tắt lúc đó) được **gửi bù** khi app chạy lại — chỉ khi danh sách email nhận đã lưu từ trước mốc gửi của hôm qua (người nhận mới không nhận thư của ngày cũ). |
| D-78 | **Riêng tư & chống giấu cảnh báo.** Chỉ ADMIN xem cảnh báo và sửa cài đặt cảnh báo; sự kiện realtime `alert.created` chỉ tới **phòng `admin`** (nhân viên không nhận). Email không chứa thông tin khách (SĐT, tên hội viên). **Đổi cài đặt cảnh báo (email nhận, bật / tắt loại email, giờ, ngưỡng) → gửi thư báo tới cả địa chỉ cũ lẫn mới** + ghi Nhật ký thao tác. Phát hiện chạy lại khi bị deadlock (an toàn nhờ khóa chống trùng). *Còn hở (chấp nhận, quán thường một quản lý):* quản lý có thể tự đánh dấu "Đã xử lý" cảnh báo về chính mình — trang Cảnh báo luôn ghi người + giờ xử lý; app sập đúng lúc giữa commit và bước phát hiện thì ca đó không được kiểm. |

## Không chọn

- Thuật toán học máy / mô hình dự đoán: khó giải thích khi phản biện, dữ liệu một quán ít.
- Gửi email đồng bộ trong request đóng ca: mất mạng / SMTP chậm sẽ làm treo quầy.
- Lưu mật khẩu SMTP trong Cài đặt: lộ qua API / sao lưu CSDL.

## Hệ quả

- Migration **0040**: bảng `Alerts`, `AlertOutbox`. Khóa cài đặt mới `alert.*` (mặc định trong code). Không đổi bảng cũ.
- Thư viện mới `nodemailer` 10.1.0 (MIT-0, không phụ thuộc thêm), ghim đúng phiên bản.
- Biến môi trường mới: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_HOURLY_MAX` (mặc định 20), `MAIL_TRANSPORT=json` (chỉ test / E2E: không gửi thật).
- Phòng realtime mới `admin`. Trang mới SCR-47 `/admin/alerts`.
- Feature: [FEATURE-060](../chức-năng/FEATURE-060.md) · Task: [TASK-075](../công-việc/TASK-075.md) · BR-093…BR-095.
