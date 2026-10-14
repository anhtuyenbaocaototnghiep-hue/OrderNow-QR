# Hướng dẫn mở app và chạy test

Dành cho cả nhóm. Trên **Windows** chỉ cần **bấm đúp** các file `.cmd` trong thư mục này. Trên macOS/Linux hoặc trong terminal của VS Code thì gõ lệnh ở cột "Lệnh tương đương" (đứng ở thư mục `cafe-qr-app`).

## Các file trong thư mục

| Bấm đúp | Làm gì | Lệnh tương đương | Thời gian |
| --- | --- | --- | --- |
| `1-cài-đặt-lần-đầu.cmd` | Cài thư viện, tạo `.env`, tạo database + tài khoản SQL nếu chưa có, tạo bảng + dữ liệu mẫu, (tùy chọn) cài Chromium cho test giao diện | `npm install` rồi `npm run setup` | 1–5 phút |
| `2-mở-app.cmd` | Chạy app và tự mở trình duyệt | `npm start` | vài giây |
| `3-test-nhanh.cmd` | 46 test tự động: stored procedure, API, phân quyền, realtime, chức năng xóa | `npm test` | ~30 giây |
| `4-test-giao-diện.cmd` | 15 test bấm thật trên trình duyệt Chromium: điện thoại khách, máy quầy, trang quản lý | `npm run test:e2e` | ~1 phút |
| `5-test-ép-tải.cmd` | 30 khách gọi món cùng lúc × 10 vòng: kho không âm, không trừ kho 2 lần; đo độ trễ realtime | `npm run load` | ~1 phút |
| `6-kiểm-tra-code.cmd` | Tìm lỗi code (ESLint) và kiểm tra định dạng (Prettier) | `npm run lint` và `npm run format:check` | ~10 giây |
| `7-chạy-tất-cả-test.cmd` | Chạy lần lượt 3 → 6 và in tổng kết | — | ~3 phút |
| `8-xem-link-qr-bàn.cmd` | In link QR của từng bàn để vào vai khách | `npm run qr:links` | vài giây |

Các file `.cmd` mở một cửa sổ đen. Đọc dòng **KẾT QUẢ / TỔNG KẾT** ở cuối, rồi bấm phím bất kỳ để đóng.

---

## 1. Chuẩn bị máy (làm một lần)

1. **Node.js 22.9 trở lên** — tải bản LTS tại <https://nodejs.org>.
2. **SQL Server 2019 trở lên** (bản Developer hoặc Express đều được), cài kèm **SSMS** và **sqlcmd**. Cần bật 2 thứ:
   - **Đăng nhập bằng mật khẩu SQL:** mở SSMS → chuột phải tên server → *Properties* → *Security* → chọn **SQL Server and Windows Authentication mode** → OK.
   - **TCP/IP:** mở *SQL Server Configuration Manager* → *SQL Server Network Configuration* → *Protocols for MSSQLSERVER* → **TCP/IP = Enabled**.
   - Sau đó khởi động lại dịch vụ **SQL Server (MSSQLSERVER)** (trong Configuration Manager hoặc *services.msc*).

   Máy có Docker có thể dùng `docker compose up -d mssql` thay cho bước này (xem `docker-compose.yml`; cách này chưa thử trên máy thiết lập repo).

## 2. Cài đặt lần đầu

Bấm đúp **`1-cài-đặt-lần-đầu.cmd`**. Script sẽ hỏi vài câu (bấm **Enter** để dùng giá trị mặc định):

| Câu hỏi | Gợi ý |
| --- | --- |
| Mật khẩu cho tài khoản SQL "cafe_app" | Enter, máy tự tạo mật khẩu mạnh và lưu vào `.env` |
| Mật khẩu ban đầu cho tài khoản quản lý "admin" | Enter để dùng `Admin@123`, hoặc gõ mật khẩu riêng |
| Tạo database … bằng quyền Windows của bạn? | `c` (có) |
| Cài Chromium (~150 MB) để chạy test giao diện? | `c` nếu bạn sẽ chạy test giao diện; để sau cũng được |

Khi thấy dòng **"Cài đặt xong!"** là xong. Script làm những việc sau:

- tạo `.env` (chứa mật khẩu, **không gửi file này cho ai** và không commit);
- tạo 2 database: `CafeQrDev` là dữ liệu dùng hằng ngày, `CafeQrTest` là database riêng cho test;
- tạo các bảng và thủ tục;
- tạo dữ liệu mẫu: 8 món, 6 nguyên liệu, 6 bàn, tài khoản `admin` và `staff1`.

Chạy lại file này bao nhiêu lần cũng không mất dữ liệu.

## 3. Mở app hằng ngày

Bấm đúp **`2-mở-app.cmd`** → trình duyệt tự mở <http://localhost:3000>.

- **Giữ cửa sổ đen mở** trong lúc dùng app. Muốn tắt app thì bấm `Ctrl+C` (rồi `Y`) hoặc đóng cửa sổ.
- Nếu app đã chạy sẵn, file này chỉ mở thêm trình duyệt.

| Trang | Địa chỉ | Tài khoản |
| --- | --- | --- |
| Trang chủ | <http://localhost:3000> | — |
| Quầy (nhân viên) | <http://localhost:3000/pos> | `staff1` / `Staff@123` |
| Bán mang đi | <http://localhost:3000/pos/takeaway> | như trên |
| Quản lý | <http://localhost:3000/admin> | `admin` / mật khẩu `ADMIN_SEED_PASSWORD` trong `.env` (mặc định `Admin@123`) |
| Khách | link QR từng bàn (bấm `8-xem-link-qr-bàn.cmd`) | không cần đăng nhập |

> Lần đầu vào trang Quầy, bấm nút **"Bật âm thanh"** ở góc trên. Trình duyệt chặn âm thanh cho tới khi bạn bấm vào trang.

## 4. Thử nhanh một vòng (khoảng 5 phút)

1. Mở **Quầy** (<http://localhost:3000/pos>), đăng nhập `staff1`, bấm **Bật âm thanh**.
2. Bấm đúp `8-xem-link-qr-bàn.cmd`, copy link **Bàn 01**, mở bằng **cửa sổ ẩn danh** (`Ctrl+Shift+N`). Đây là điện thoại của khách.
3. **Khách:** bấm `+` một món → **Xem giỏ · Gửi đơn** → **Gửi đơn**.
4. **Quầy:** thẻ đơn nảy lên cột **Mới** kèm tiếng "ting" → **Tiếp nhận** → **Hoàn tất**. Khách thấy thông báo "Đã xong, vui lòng nhận tại quầy".
5. **Khách:** bấm **Gọi thanh toán** → **Xác nhận**.
6. **Quầy:** dải vàng **Gọi thanh toán** hiện "Bàn 01" → bấm vào → nhập tiền khách đưa (hoặc bấm *Đủ tiền*) → **Đã thu tiền & In bill**. Khách thấy "Cảm ơn quý khách!".
7. **Quản lý** (<http://localhost:3000/admin>): *Báo cáo* → **Hôm nay** thấy doanh thu; *Kho nguyên liệu* → **Lịch sử** thấy kho đã bị trừ.
8. Thử thêm:
   - **Gộp/tách bàn:** mở link cùng bàn ở một cửa sổ ẩn danh khác (hoặc trình duyệt khác) → chọn *Gộp chung nhóm* / *Tạo đơn cá nhân*.
   - **Bán mang đi:** vào <http://localhost:3000/pos/takeaway>.
   - **Hết món tức thì:** ở Quản lý → *Thực đơn* tắt "Còn bán" của một món → menu khách đổi ngay.

Muốn có dữ liệu báo cáo nhiều ngày: chạy `npm run db:seed:demo` (thêm 55 đơn đã thu tiền từ 01–10/10/2026), rồi xem Báo cáo với khoảng 01/10–10/10/2026.

## 5. Cho điện thoại thật quét QR

1. Máy tính chạy app và điện thoại phải **cùng Wi-Fi**.
2. Khi app khởi động, cửa sổ đen in dòng *"Trong mạng LAN: http://192.168.x.x:3000"*. Mở `.env`, sửa thành `PUBLIC_BASE_URL=http://192.168.x.x:3000` (đúng IP đó).
3. Cho phép cổng 3000 qua Windows Firewall. Lần đầu Windows hỏi thì bấm *Allow*; nếu không, mở *Windows Defender Firewall* → *Advanced settings* → *Inbound Rules* → *New Rule* → *Port* → *TCP 3000* → *Allow*.
4. Tắt app rồi mở lại (`2-mở-app.cmd`). Vào **Quản lý → Bàn & mã QR → In tất cả QR**. QR in ra lúc này mới trỏ đúng địa chỉ LAN.
5. Dùng camera điện thoại quét QR → vào thẳng menu của bàn.

## 6. Chạy test

| File / lệnh | Kiểm gì | Kết quả đúng trông như thế nào |
| --- | --- | --- |
| `3-test-nhanh.cmd` · `npm test` | 46 test trên SQL Server thật: SP (giữ/trừ kho, đồng thời), API, phân quyền, realtime, chức năng xóa | Cuối có `ℹ pass 46` và `ℹ fail 0` |
| `4-test-giao-diện.cmd` · `npm run test:e2e` | 15 kịch bản bấm thật: đăng nhập, gộp bàn, gọi món 3 chạm, realtime < 2 giây, mất mạng quầy, thu tiền, in bill, báo cáo, nút Xóa… | `15 passed` |
| `5-test-ép-tải.cmd` · `npm run load` | 30 khách gửi đơn cùng lúc khi kho chỉ đủ vài suất, lặp 10 vòng | `NFR-002: 10/10 vòng PASS (100 %)` và dòng `NFR-001 … p95 = … ms` (phải < 2000 ms) |
| `6-kiểm-tra-code.cmd` | ESLint + Prettier | `CODE SẠCH` |
| `7-chạy-tất-cả-test.cmd` | Tất cả các mục trên | `TỔNG KẾT: TẤT CẢ ĐỀU QUA` |

Lưu ý khi chạy test:

- Test **xóa sạch và tạo lại database `CafeQrTest`** mỗi lần chạy. Database `CafeQrDev` (dữ liệu bạn dùng hằng ngày) **không bị đụng tới**.
- Test giao diện dùng server riêng ở cổng **3100**, nên vẫn chạy được trong lúc app đang mở ở cổng 3000.
- Test giao diện mà lỗi thì ảnh chụp và *trace* nằm trong thư mục `test-results`. Xem lại từng bước bằng lệnh `node node_modules/@playwright/test/cli.js show-trace "test-results/<tên test>/trace.zip"`.

Chạy riêng một phần (trong terminal ở thư mục `cafe-qr-app`):

```bash
node --env-file-if-exists=.env --test "ứng-dụng/máy-chủ/tests/delete.test.js"   # một file test
npm run test:e2e -- -g "bán mang đi"                                               # một test giao diện theo tên
npm run load -- --rounds 3 --clients 50                                            # ép tải: 3 vòng, 50 khách
```

## 7. Lệnh khác hay dùng

| Lệnh | Dùng khi |
| --- | --- |
| `npm run dev` | Đang sửa code backend: app tự khởi động lại mỗi khi lưu file trong `ứng-dụng/máy-chủ/src` (sửa giao diện thì chỉ cần F5) |
| `npm run db:migrate` | Vừa kéo code mới có file trong `cơ-sở-dữ-liệu/chuyển-đổi` hoặc `thủ-tục` |
| `npm run db:seed` | Tạo lại phần dữ liệu mẫu còn thiếu (không xóa dữ liệu đang có); in link QR các bàn |
| `npm run db:seed:demo` | Thêm đơn mẫu 01–10/10/2026 để xem báo cáo |
| `npm run qr:links` | In link QR các bàn |
| `npm run format` | Tự sửa định dạng code trước khi commit |
| `npm run skills:check` / `npm run skills:sync` | (cần Git Bash) kiểm/đồng bộ skills cho Claude Code |

## 8. Xử lý lỗi thường gặp

| Hiện tượng | Cách xử lý |
| --- | --- |
| *"Không kết nối được SQL Server tại 127.0.0.1:1433"* | Chưa bật TCP/IP hoặc dịch vụ SQL Server chưa chạy. Làm lại mục 1, nhớ khởi động lại dịch vụ |
| *"Login failed for user 'cafe_app'"* | Mật khẩu trong `.env` khác mật khẩu của tài khoản SQL. Sửa `DB_PASSWORD` trong `.env` cho đúng, hoặc trong SSMS chạy `ALTER LOGIN [cafe_app] WITH PASSWORD = '<mật khẩu trong .env>'` |
| *"Cannot open database"* | Database chưa được tạo. Chạy lại `1-cài-đặt-lần-đầu.cmd` |
| App không mở, báo *EADDRINUSE* / cổng 3000 bận | App đã chạy ở một cửa sổ khác (bấm `2-mở-app.cmd` sẽ tự mở trình duyệt). Nếu là chương trình khác đang chiếm cổng thì đổi `PORT=3001` trong `.env` |
| Quầy không kêu "ting" | Bấm **Bật âm thanh**, kiểm tra loa và âm lượng của tab trình duyệt |
| Điện thoại không vào được link QR | Kiểm tra cùng Wi-Fi, `PUBLIC_BASE_URL` đúng IP LAN, đã mở firewall cổng 3000, đã in lại QR (mục 5) |
| Quên mật khẩu `admin` | Đăng nhập bằng một tài khoản quản lý khác để đặt lại. Nếu không có ai khác: trong `.env` đổi `ADMIN_SEED_USERNAME` thành tên mới (ví dụ `admin2`) rồi chạy `npm run db:seed`, máy sẽ tạo tài khoản quản lý mới với mật khẩu `ADMIN_SEED_PASSWORD` |
| Gõ `npx …` báo *"'B' is not recognized…"* | Do dấu `&` trong tên thư mục "quan ly F&B nho". Dùng các lệnh `npm run …` ở trên (đã né lỗi này), hoặc chuyển repo sang thư mục không có `&` |
| Test giao diện báo thiếu trình duyệt | `node node_modules/@playwright/test/cli.js install chromium` (file `4-…` tự làm bước này) |
| Cửa sổ đen hiện chữ tiếng Việt bị lỗi font | Chuột phải thanh tiêu đề → *Properties* → *Font* → chọn **Consolas** |

Tài liệu kỹ thuật chi tiết hơn: [`../tài-liệu/vận-hành/local-development.md`](../tài-liệu/vận-hành/local-development.md) · Kết quả test: [`../tài-liệu/chất-lượng/test-strategy.md`](../tài-liệu/chất-lượng/test-strategy.md)
