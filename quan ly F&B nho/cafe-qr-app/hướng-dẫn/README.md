# Hướng dẫn mở app và chạy test

Dành cho cả nhóm. Trên **Windows** chỉ cần **bấm đúp** các file `.cmd` trong thư mục này. Trên macOS/Linux hoặc trong terminal của VS Code thì gõ lệnh ở cột "Lệnh tương đương" (đứng ở thư mục `cafe-qr-app`).

## Các file trong thư mục

| Bấm đúp | Làm gì | Lệnh tương đương | Thời gian |
| --- | --- | --- | --- |
| `1-cài-đặt-lần-đầu.cmd` | Cài thư viện, tạo `.env`, tạo database + tài khoản SQL nếu chưa có, tạo bảng + dữ liệu mẫu, (tùy chọn) cài Chromium cho test giao diện | `npm install` rồi `npm run setup` | 1–5 phút |
| `2-mở-app.cmd` | Chạy app và tự mở trình duyệt | `npm start` | vài giây |
| `3-test-nhanh.cmd` | 109 test tự động: bộ tính giá, stored procedure, API, phân quyền, realtime, xóa, hội viên, khuyến mãi, combo, ca, hoàn tiền, kho, gọi món tại bàn | `npm test` | ~1–2 phút |
| `4-test-giao-diện.cmd` | 21 test bấm thật trên trình duyệt Chromium: điện thoại khách, máy quầy, trang quản lý | `npm run test:e2e` | ~1–2 phút |
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

1. Mở **Quầy** (<http://localhost:3000/pos>), đăng nhập `staff1`, bấm **Bật âm thanh**. Bấm nút đỏ **⚠ Chưa mở ca** → nhập tiền lẻ đầu ca (có thể 0) → **Mở ca** (chưa mở ca thì không thu tiền được).
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
| `3-test-nhanh.cmd` · `npm test` | 217 test: bộ tính giá (không cần DB) + test trên SQL Server thật — SP (giữ/trừ kho, đồng thời), API, phân quyền, realtime, xóa, hội viên, khuyến mãi (tranh lượt đồng thời), combo, tùy chọn, ca, giảm giá tay, hoàn tiền (đồng thời), nhập kho, kiểm kê, gọi món tại bàn; giai đoạn 4–8: gọi lại đơn, lịch thực đơn, thời gian chờ, chia bill, kho nâng cao (lô, sơ chế, hủy hàng, đặt hàng, dự báo), trưởng ca + ma trận quyền, sổ quỹ, chấm công, nhật ký, lãi/lỗ, điểm/tem/voucher/giới thiệu, chiến dịch, phân tích, dashboard | Cuối có `ℹ pass 217` và `ℹ fail 0` |
| `4-test-giao-diện.cmd` · `npm run test:e2e` | 27 kịch bản bấm thật: đăng nhập, gộp bàn, gọi món 3 chạm, realtime < 2 giây, mất mạng quầy, thu tiền, in bill, báo cáo, nút Xóa, hội viên ở giỏ hàng, size/combo, gọi nhân viên, tạm ngưng nhận đơn, gọi món tại bàn, gọi lại đơn + thời gian chờ, chia bill, kho nâng cao, trưởng ca + sổ quỹ, CRM (điểm/voucher/chiến dịch), phân tích + "Hôm nay" trên điện thoại, ca + hoàn tiền | `27 passed` |
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
| `npm run db:seed:mau2` | Thêm mẫu chức năng mới: tùy chọn Size/Topping (Bạc xỉu, Latte), Combo sáng, khuyến mãi trà đào 14–17h + giảm 10% đơn từ 200k, ghim Latte. Chỉ chạy khi chưa có tùy chọn/combo/khuyến mãi nào |
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
| Bấm "Đã thu tiền" không được, báo *"Chưa mở ca"* | Bấm nút đỏ **⚠ Chưa mở ca** trên thanh quầy (hoặc trang *Ca & hoàn tiền*) → nhập tiền đầu ca → Mở ca |
| Giảm giá báo *"cần tài khoản quản lý duyệt"* | Mức giảm vượt 10% hoặc 20.000đ của bill — nhờ quản lý nhập tên + mật khẩu ở ô hiện ra (đổi ngưỡng ở Quản lý → Cài đặt) |
| Quầy không kêu "ting" | Bấm **Bật âm thanh**, kiểm tra loa và âm lượng của tab trình duyệt |
| Điện thoại không vào được link QR | Kiểm tra cùng Wi-Fi, `PUBLIC_BASE_URL` đúng IP LAN, đã mở firewall cổng 3000, đã in lại QR (mục 5) |
| Quên mật khẩu `admin` | Đăng nhập bằng một tài khoản quản lý khác để đặt lại. Nếu không có ai khác: trong `.env` đổi `ADMIN_SEED_USERNAME` thành tên mới (ví dụ `admin2`) rồi chạy `npm run db:seed`, máy sẽ tạo tài khoản quản lý mới với mật khẩu `ADMIN_SEED_PASSWORD` |
| Gõ `npx …` báo *"'B' is not recognized…"* | Do dấu `&` trong tên thư mục "quan ly F&B nho". Dùng các lệnh `npm run …` ở trên (đã né lỗi này), hoặc chuyển repo sang thư mục không có `&` |
| Test giao diện báo thiếu trình duyệt | `node node_modules/@playwright/test/cli.js install chromium` (file `4-…` tự làm bước này) |
| Cửa sổ đen hiện chữ tiếng Việt bị lỗi font | Chuột phải thanh tiêu đề → *Properties* → *Font* → chọn **Consolas** |

Tài liệu kỹ thuật chi tiết hơn: [`../tài-liệu/vận-hành/local-development.md`](../tài-liệu/vận-hành/local-development.md) · Kết quả test: [`../tài-liệu/chất-lượng/test-strategy.md`](../tài-liệu/chất-lượng/test-strategy.md)

## 9. Thử chức năng mới (giai đoạn 2)

Hướng dẫn chi tiết từng chức năng kèm ảnh: thư mục [`../chức-năng-mới/`](../chức-năng-mới/README.md).

Muốn có sẵn dữ liệu mẫu thì chạy `npm run db:seed:mau2` (chỉ thêm khi quán chưa tạo tùy chọn/combo/khuyến mãi nào), rồi tắt và mở lại app.

| Chức năng | Thử thế nào |
| --- | --- |
| **Hội viên** | Khách mở giỏ → **⭐ Nhập SĐT để nhận ưu đãi** → nhập số → nhập họ tên + tick đồng ý → đơn đầu giảm 10%. Lần sau chỉ cần nhập số. Quầy thấy giảm trong ô **Hội viên · giảm giá** khi thu tiền. Quản lý → **Hội viên** (danh sách che số, ẩn danh theo yêu cầu, tab Hạng) |
| **Combo** | Quản lý → **Combo** → + Thêm combo (chọn món + số lượng, đặt giá). Khách thấy mục **Combo** kèm "Tiết kiệm…"; quầy có tab **Combo** ở Bán mang đi |
| **Khuyến mãi** | Quản lý → **Khuyến mãi**: giá đặc biệt theo món/danh mục theo khung giờ (happy hour) hoặc giảm theo đơn tối thiểu; giới hạn lượt/ngày; nút **Thống kê** |
| **Gợi ý / bán chạy** | Menu khách có mục **⭐ Gợi ý cho bạn**. Quản lý → **Gợi ý & ghim**: ghim món + nhãn, ẩn món, chọn chế độ |
| **Tùy chọn món** | Quản lý → **Tùy chọn món** (Size, Topping… có phụ thu và định lượng thêm) → Thực đơn → Sửa món → tick nhóm. Khách bấm **Chọn size / tùy chọn ›** |
| **Chốt ca** | Quầy → **Ca & hoàn tiền**: tiền dự kiến trong két, **Đóng ca** → nhập tiền đếm được → chênh lệch, **In phiếu chốt ca** |
| **Giảm giá tay** | Khi thu tiền: mở **Hội viên · giảm giá** → nhập số tiền hoặc % + lý do. Vượt ngưỡng thì quản lý nhập tài khoản để duyệt |
| **Hoàn tiền** | Quầy → **Ca & hoàn tiền** → **Hoàn tiền** trên lượt thu (trong ngày thu); chọn đơn hủy, "hoàn kho" nếu món chưa giao |
| **Tạm ngưng nhận đơn QR** | Nút **QR: đang nhận đơn** trên thanh quầy → Tạm ngưng (khách thấy thông báo, quầy vẫn bán mang đi). Giờ bán từng danh mục: Thực đơn → Sửa danh mục |
| **Gọi nhân viên** | Khách: màn "Đơn của bạn" → **🙋 Gọi nhân viên** → chọn yêu cầu. Quầy: dải xanh + chuông → **Đã xử lý** |
| **Nhập kho & kiểm kê** | Quản lý → **Nhập kho & kiểm kê**: phiếu nhập (có giá nhập), phiếu kiểm kê (đếm → chốt), tab **Giá vốn & hao hụt** |
| **Báo cáo marketing** | Quản lý → Báo cáo → tab **Marketing & khách hàng** |
| **Gọi món tại bàn + ghi chú bàn** | Quầy → **Gọi món tại bàn** → chọn bàn → chạm món → **Gửi đơn Bàn …** (vào thẳng Đang pha). Ô **📝 Ghi chú bàn** chỉ nhân viên thấy; ở màn Đơn hàng mỗi bàn có nút **Gọi món** / **Ghi chú** |

## 10. Thử chức năng mới (giai đoạn 4–8)

Hướng dẫn chi tiết: thư mục [`../chức-năng-mới/`](../chức-năng-mới/README.md) (từ mục 14). Đặc tả: `tài-liệu/chức-năng/FEATURE-025…043, 045`.

| Chức năng | Thử thế nào |
| --- | --- |
| **Gọi lại đơn + món yêu thích** | Khách gắn SĐT hội viên ở giỏ → mục **Lần trước bạn gọi** → **Gọi lại**; bấm ♥ để lưu món yêu thích |
| **Lịch thực đơn** | Quản lý → **Lịch thực đơn & thời gian pha**: món chỉ hiện / ẩn theo khung giờ, ngày trong tuần |
| **Thời gian chờ** | Giỏ hàng và màn theo dõi đơn của khách hiện "khoảng … phút"; quầy thấy hàng chờ |
| **Chia bill** | Khách ở màn theo dõi → **Chia bill** → mỗi người chọn món của mình; quầy thu từng phần, phần cuối gộp món chung |
| **Kho nâng cao** | Quầy → **Kho & sơ chế** (sơ chế, hủy hàng, hạn dùng, nhận hàng theo đơn đặt). Quản lý → **Kho nguyên liệu** (bán thành phẩm, theo lô), **Nhập kho & kiểm kê** (đơn vị, giá vốn thực tế, thất thoát), **Nhà cung cấp & đặt hàng** (đề xuất nhập theo dự báo) |
| **Trưởng ca** | Quản lý → **Tài khoản** → vai trò **Trưởng ca**. Trưởng ca giảm giá đến 20 %/50.000đ, hoàn tiền trong ca, duyệt chi, sửa chấm công trong ngày, kiểm kê ở quầy; nút **Hôm nay** trên thanh quầy |
| **Sổ quỹ** | Quầy → **Ca & hoàn tiền** → **Chi tiền** / **Thu khác** (chi lớn chờ duyệt, gắn ảnh hóa đơn). Quản lý → **Sổ quỹ** (lọc, xuất CSV, danh mục) |
| **Chấm công, lịch làm, nhật ký** | Đăng nhập = vào ca, đăng xuất / đóng ca = ra ca. Quản lý → **Nhân sự & chấm công** (lịch tuần kéo thả, năng suất), **Nhật ký thao tác** (chỉ đọc) |
| **Lãi / lỗ** | Quản lý → **Lãi / lỗ**: nhập chi phí cố định / tháng → xem lãi gộp, lợi nhuận, điểm hòa vốn (ước tính) |
| **Tích điểm, tem, voucher, giới thiệu** | Quản lý → **Tích điểm, voucher & chiến dịch** (quà đổi điểm, chương trình tem, voucher). Thu tiền: ô **Hội viên · giảm giá · voucher** có điểm / tem, **Đổi thưởng**, nút voucher. Đăng ký hội viên có ô **SĐT người giới thiệu** |
| **Chiến dịch** | Cùng trang → tab **Phân khúc & chiến dịch**: tạo phân khúc (xem trước số người) → chiến dịch → **Chạy ngay** → **Kết quả** → tải CSV |
| **Phân tích** | Quản lý → **Phân tích & menu engineering**: nhóm món, giờ cao điểm, dự báo doanh thu, so sánh kỳ, theo bàn |
| **Hôm nay** | Quản lý → **Hôm nay** (mở được trên điện thoại): doanh thu hôm qua, lệch két, kho cần chú ý, top món, việc cần làm; **Tính lại hôm nay** |

Job nền (thống kê, dự báo, cảnh báo lô, chiến dịch hẹn giờ, tổng hợp ngày 00:30…) tự chạy khi app mở. Chạy tay: thống kê thời gian pha có nút **Tính lại** ở trang Lịch thực đơn & thời gian pha; tổng hợp ngày có nút **Tính lại hôm nay** ở trang Hôm nay; job khác gọi `POST /api/admin/jobs/{tên}/run` bằng tài khoản quản lý (danh sách: `GET /api/admin/jobs`). Tắt bằng `JOBS_ENABLED=false` trong `.env`.
