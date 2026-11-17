# ADR-063 — Tự xác nhận chuyển khoản qua SePay: tiền vào khớp bàn thì tự đóng bill

- **Trạng thái:** ACCEPTED (17/11/2026).
- **Chủ dự án duyệt:**
  1. Hỏi: "bạn có làm cái chuyển khoản xong báo về máy đã nhận chưa".
  2. Claude đề xuất dùng SePay: máy tự đóng bill khi tiền vào đúng nội dung và đúng số tiền.
  3. Chủ dự án: "tôi sài cá nhân" (tài khoản ngân hàng cá nhân).
  4. Chủ dự án: "ok làm trc đi rồi tôi đăng ký sepay sẽ báo với bạn".
- **Thay một phần:** [ADR-062](ADR-062-chuyen-khoan-vietqr.md) D-248 ("đã trả chỉ do nhân viên ghi"). Thêm một trường hợp máy tự ghi: ngân hàng báo tiền đã vào và khớp đủ điều kiện D-250.
- **Bối cảnh:**
  - ADR-062 cho khách quét VietQR có sẵn số tiền và nội dung "CF <mã bàn> <mã phiên>". Nhưng nhân viên vẫn phải mở app ngân hàng xem tiền vào rồi bấm "Đã nhận", và chủ quán muốn máy tự biết.
  - SePay (dịch vụ báo biến động số dư) hỗ trợ tài khoản cá nhân. SePay có API v2 liệt kê giao dịch:
    - xác thực bằng Bearer token, tạo ở my.sepay.vn → Cấu hình Công ty → API Access;
    - token xem được toàn bộ giao dịch;
    - giới hạn 3 lần / giây / IP.
  - Máy chủ của quán chạy trong Wi-Fi quán, nên không nhận được webhook từ Internet, nhưng vẫn gọi ra ngoài được.
  - Tài khoản là tài khoản **cá nhân**, nên ngoài tiền bán hàng còn có tiền vào khác (lương, người nhà chuyển…).

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-249 | **Nguồn báo tiền vào là SePay; máy chủ của quán tự hỏi mỗi 5 giây.**<ul><li>Gọi `GET https://userapi.sepay.vn/v2/transactions`, chỉ lấy tiền vào, sau giao dịch đã xét cuối. Lần đầu tính từ lúc bật, không xét tiền vào trước đó. Không cần mở cổng ra Internet.</li><li>Khóa API nằm trong `.env` (`SEPAY_API_TOKEN`), giống mật khẩu hộp thư gửi cảnh báo: không lưu trong CSDL, không hiện ở giao diện.</li><li>Bật / tắt ở Cài đặt (`pay.auto_confirm`): chỉ chủ quán, mặc định tắt.</li><li>**Chỉ khoản có mã của quán** ("CF <mã bàn> <6 ký tự mã phiên>" hoặc "CF MANG DI") mới được lưu và xét. Tiền vào khác của tài khoản cá nhân thì không lưu, không hiện ở quầy, không ai trong quán thấy.</li><li>SePay liên kết nhiều tài khoản mà không biết tài khoản nào của quán (không trùng số ở Cài đặt) → dừng hỏi, báo chủ quán đặt `SEPAY_BANK_ACCOUNT_ID`.</li><li>Mỗi khoản lưu một dòng `BankTransactions`, khóa duy nhất (nguồn + mã giao dịch) → không xử lý hai lần, không xóa được.</li></ul> |
| D-250 | **Tự đóng bill khi đủ cả 4 điều kiện:**<ol><li>Nội dung có mã của **đúng một** bàn đang mở. So khớp không phân biệt hoa / thường, bỏ dấu, bỏ khoảng trắng và ký tự lạ mà ngân hàng hay thêm.</li><li>**Số tiền = số phải thu**, tính lại lúc khớp.</li><li>Bàn không chia bill / chưa thu phần nào.</li><li>Đang mở ca.</li></ol>Khi đó máy thu tiền "chuyển khoản" cho bàn đó. Người ghi là tài khoản hệ thống "Tự động (ngân hàng)" (đã lưu trữ, không đăng nhập được). Điện thoại khách sang màn cảm ơn như khi nhân viên thu. |
| D-251 | **Không khớp thì không tự làm gì với tiền.**<ul><li>Các trường hợp: thiếu / dư tiền, mã không khớp bàn đang mở, hai bàn trùng mã, bàn chia bill, chưa mở ca, còn đơn chưa tiếp nhận, bàn đã thanh toán (khách chuyển hai lần).</li><li>Khoản đó hiện ở **"Tiền vào chưa khớp"** trên màn quầy, kèm lý do.</li><li>Thu ngân xử lý bằng một trong hai cách:<ul><li>**"Ghép & thu"** vào một bàn: số tiền phải đúng số phải thu → thu chuyển khoản, người ghi là chính thu ngân;</li><li>**"Đã xử lý"** kèm ghi chú: đã thu ở hộp Thu tiền, đã ghi bán mang đi, đã trả lại khách…</li></ul></li><li>Một khoản chỉ xử lý được một lần: hai máy quầy bấm cùng lúc thì máy sau bị chặn, nên một khoản tiền không thể thu cho hai bàn.</li><li>**Mã bán mang đi** ("CF MANG DI …") chỉ được báo ở quầy. Nhân viên ghi đơn mang đi như thường, không phải xử lý thêm.</li></ul> |
| D-252 | **Báo ngay ở quầy** (sự kiện `bank.received`, room `staff`; chỉ máy của người thu tiền kêu):<ul><li>tiếng chuông + đọc to bằng giọng tiếng Việt của máy (khi đã bật âm thanh ở quầy), ví dụ "Bàn 02 đã chuyển khoản 59.000 đồng" hoặc "Có tiền vào 59.000 đồng chưa khớp bàn";</li><li>máy không có giọng tiếng Việt thì chỉ kêu chuông.</li></ul>**Chủ quán thử trước bằng "Giả lập tiền vào"** ở Cài đặt: ghi nguồn `SIMULATED`, chạy y như giao dịch thật, chỉ dùng được khi đã bật tự xác nhận. |

## Phương án đã cân nhắc

- **Webhook SePay gửi thẳng tới máy chủ:** cần địa chỉ công khai (mở cổng / đường hầm) cho laptop trong Wi-Fi quán, phức tạp và kém an toàn hơn tự hỏi.
- **Lưu và hiện mọi khoản tiền vào:** với tài khoản cá nhân, nhân viên sẽ thấy tiền riêng của chủ quán. Bỏ, chỉ giữ khoản có mã của quán.
- **Báo tiền vào nhưng nhân viên vẫn bấm "Đã nhận":** an toàn nhưng không đúng yêu cầu "báo về máy đã nhận". Vẫn giữ cách này cho khoản không khớp (D-251).
- **Tự đóng cả khi chuyển dư:** bỏ. Chuyển dư cần thối hoặc ghi tip, phải có người quyết.

## Hệ quả

- **Mã nguồn:**
  - `repositories/bankRepo.js`, `services/bankFeedService.js` (mới);
  - `settingsService` (`pay.auto_confirm`, mốc bắt đầu, mã giao dịch cuối);
  - `config` (`SEPAY_API_TOKEN`, `SEPAY_BANK_ACCOUNT_ID`, `SEPAY_BASE_URL`);
  - `server.js` (vòng hỏi 5 giây, tắt khi `JOBS_ENABLED=false`);
  - routes `staff.js` (tiền vào chưa khớp, ghép bàn, đã xử lý) và `operations.js` (trạng thái, giả lập — chỉ chủ quán);
  - giao diện:
    - màn quầy: chuông, đọc to, dải và hộp "Tiền vào chưa khớp";
    - Cài đặt: công tắc, trạng thái, giả lập;
    - điện thoại khách: dòng "quán tự xác nhận khi tiền vào".
- **CSDL:** migration `0062_tien_vao_ngan_hang.sql` (`BankTransactions` + trigger chặn xóa, tài khoản hệ thống).
- **Vận hành:**
  - `.env.example` thêm `SEPAY_*`;
  - [hướng dẫn tự xác nhận chuyển khoản](../vận-hành/tu-xac-nhan-chuyen-khoan.md);
  - sổ bí mật S-12.
- **Quy tắc:**
  - BR-129;
  - `.agent/rules.md` ghi ngoại lệ: máy tự ghi đã thu chỉ khi ngân hàng xác nhận và khớp đủ D-250.
- **Test:**
  - `bank-feed.test.js` (AC-100-01…05, có máy chủ SePay giả trong test);
  - E2E (AC-100-06).
- **Còn để sau:** đối chiếu tổng tiền SePay báo với tổng "chuyển khoản" nhân viên ghi trong ca (cảnh báo F-060), và in bill tự động khi máy tự thu.
