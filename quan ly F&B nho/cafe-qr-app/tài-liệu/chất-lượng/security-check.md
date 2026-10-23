# Kiểm tra bảo mật (Security Check)

> Sổ tay 15 bước — bước 14 (đầu ra bắt buộc "Security / Accessibility Check"), đối chiếu OWASP ASVS (mức tham khảo, không phải chứng nhận). Mô hình bảo mật (thiết kế): [security-model.md](../kiến-trúc/security-model.md) · Yêu cầu: [nfr.md](../sản-phẩm/nfr.md) (NFR-SEC, NFR-PRV) · Chạy ngày **20/10/2026**, TASK-057, máy local.

## 1. Kiểm tra tự động / công cụ

| Kiểm tra | Lệnh / bằng chứng | Kết quả |
| --- | --- | --- |
| Lỗ hổng thư viện (phụ thuộc chạy thật) | `npm audit --omit=dev` | **0** lỗ hổng (191 gói prod) |
| Lỗ hổng thư viện (kể cả dev) | `npm audit` | **0** lỗ hổng (299 gói) |
| Bí mật trong mã đã commit | `git grep` mẫu `password / secret / token / api_key = '…'` trên file theo dõi (trừ tài liệu, test, tài khoản demo đã công bố) | Không thấy |
| `.env` có bị commit | `git ls-files` | Không — `.gitignore` chặn `.env`, `.env.*` (trừ `.env.example`) |
| Dữ liệu cá nhân thật trong mã | `git grep` mẫu SĐT Việt Nam ngoài test / tài liệu | Không (chỉ một SĐT ví dụ trong thông báo lỗi) |
| Ma trận quyền actor × endpoint (server) | `tests/finance.test.js` "ma trận actor × endpoint sinh từ PERMISSIONS…" — sinh từ bảng `PERMISSIONS`, mỗi quyền một request đại diện | PASS — vai được phép không bị 401/403, vai khác 403 |
| Chưa đăng nhập → 401, khách gọi API quầy → 401 | `tests/api.test.js`, `table-order.test.js`, `void.test.js` (AC-046-01) | PASS |
| Sở hữu tài nguyên của khách (chỉ phiên của mình) | `api.test.js` (đọc phiên người khác → 403), `member-card.test.js` AC-047-04, `sales.test.js` (gọi nhân viên phiên khác 403) | PASS |
| Duyệt bởi người có quyền (giảm tay, hoàn tiền, xóa món) | `finance.test.js`, `operations.test.js`, `void.test.js` AC-046-02 (sai mật khẩu / nhân viên tự duyệt → 403) | PASS |
| Giới hạn tần suất | `members.test.js` "11 lần/phút từ một IP → 429…", `sales.test.js` gọi nhân viên < 60 giây → 429 | PASS |
| Nhật ký thao tác không lưu mật khẩu, bảng nhật ký chỉ đọc | `finance-unit.test.js` "che dữ liệu…", `void.test.js` "nhật ký thao tác…", trigger `TR_AuditLogs_ReadOnly` (`finance.test.js`) | PASS |
| Tải ảnh hóa đơn quỹ | `finance.test.js` (kiểm byte đầu file, ≤ 2 MB) | PASS |
| Đồng thời không vượt quyền / không âm kho | `npm run load` 10/10 vòng; test "đua" trong `sp.test.js`, `void.test.js` | PASS |
| Header bảo mật | `tests/acceptance.test.js` "mọi phản hồi có CSP, nosniff…" — CSP `default-src 'self'` + `frame-ancestors 'self'`, `nosniff`, không có `x-powered-by`, cookie `cf_client` HttpOnly + SameSite=Lax (`helmet` trong `src/app.js`, giới hạn JSON 100 KB) | PASS — HSTS tắt có chủ ý (chạy http trong LAN quán) |

## 2. Đối chiếu OWASP ASVS (tóm tắt)

| Chương ASVS | Kiểm soát trong dự án | Đánh giá |
| --- | --- | --- |
| V2 Xác thực | Mật khẩu `bcrypt` (cost 10), giới hạn đăng nhập sai, khóa tài khoản → token cũ hết hiệu lực | Đạt (mức đồ án) |
| V3 Phiên | JWT Bearer hết hạn `JWT_EXPIRES_IN` (mặc định 8 giờ); khách: cookie `cf_client` ngẫu nhiên | Đạt; thu hồi token tức thì chỉ khi khóa / xóa tài khoản |
| V4 Kiểm soát truy cập | `requirePermission` + bảng `PERMISSIONS` ở server, sở hữu phiên cho khách | Đạt — có test ma trận |
| V5 Kiểm tra đầu vào | `zod` ở mọi route; SQL tham số hóa / SP | Đạt |
| V7 Nhật ký | `AuditLogs` cho thao tác đổi tiền / kho / quyền / giá, che mật khẩu, chỉ đọc | Đạt |
| V8 Bảo vệ dữ liệu | SĐT / tên hội viên che khi trả cho khách (D-16), ẩn danh hóa, khách không thấy mã voucher | Đạt |
| V9 Kênh truyền | HTTP trong LAN quán, không TLS | **Rủi ro chấp nhận có điều kiện** — triển khai thật (bước 15, ngoài phạm vi) phải có HTTPS |
| V12 Tệp | Ảnh hóa đơn: kiểm loại thật + kích thước | Đạt |

## 3. Rủi ro còn lại (cần chủ dự án quyết ở G4 / trước khi chạy thật)

Gồm rủi ro vận hành và các lỗ hổng thiết kế G-01…G-10 ghi ở [security-model.md](../kiến-trúc/security-model.md). Không mục nào là lỗi sai tiền / kho / quyền trong phạm vi đã test; đều là **tăng cường** cần quyết định (sửa = đổi hành vi bảo mật → phải duyệt theo `.agent/rules.md`).

| ID | Rủi ro | Mức | Đề xuất | Quyết định |
| --- | --- | --- | --- | --- |
| SEC-R1 (G-10) | Tài khoản demo seed (`admin` / `Admin@123`, `staff1` / `Staff@123`) | Cao nếu chạy thật | Đổi mật khẩu ngay khi cài tại quán; không chạy `db:seed:demo` trên máy thật | |
| SEC-R2 (G-05) | HTTP trong LAN: JWT / mật khẩu đi không mã hóa, cookie không `Secure` | Trung bình | Wi-Fi quán WPA2+ có mật khẩu; đưa lên Internet bắt buộc HTTPS (bước 15) | |
| SEC-R3 (G-01, G-02) | JWT không thu hồi được khi đăng xuất / đổi mật khẩu (tối đa 8 giờ); socket đang mở không bị ngắt khi token hết hạn / tài khoản bị khóa | Trung bình | Danh sách token thu hồi + ngắt socket khi khóa tài khoản (task riêng) | |
| SEC-R4 | Chưa rà soát pháp lý dữ liệu cá nhân (Nghị định 13/2023/NĐ-CP) | Trung bình | Chủ dự án rà soát trước khi lưu SĐT khách thật ([project-brief.md](../sản-phẩm/project-brief.md)) | |
| SEC-R5 (G-03) | Ô tài khoản duyệt (trưởng ca / quản lý) ở hộp thoại giảm giá / hoàn tiền / xóa món không giới hạn số lần thử → nhân viên có thể dò mật khẩu quản lý | Trung bình | Giới hạn 5 lần sai / 10 phút / người gửi, ghi nhật ký (task riêng) | |
| SEC-R6 (G-04) | Mật khẩu nhân viên tối thiểu 6 ký tự (ASVS khuyến nghị 12) | Thấp | Nâng tối thiểu 8–12 ký tự khi tạo / đổi mật khẩu | |
| SEC-R7 (G-06) | Đăng nhập (thành công / sai) chưa ghi nhật ký thao tác; chưa có log tập trung / cảnh báo | Thấp | Ghi `auth.login` vào AuditLogs; log tập trung thuộc bước 15 | |
| SEC-R8 (G-07) | Tài khoản SQL của app là `db_owner` → có thể tắt trigger nhật ký; chưa chặn DELETE ở `AuditLogs` | Trung bình | Tạo login quyền tối thiểu (EXECUTE SP + DML cần thiết) khi triển khai (bước 15) | |
| SEC-R9 (G-08) | Chưa có test tự động cho giới hạn đăng nhập sai / gửi đơn (đang tắt bằng `RATE_LIMIT=off` khi test) | Thấp | Test riêng bật limiter (đã có test cho limiter tra cứu hội viên và header bảo mật) | |
| SEC-R10 (G-09) | Token nhân viên lưu `localStorage` (lộ nếu có XSS); API JSON không đặt `Cache-Control: no-store` | Thấp | CSP đã chặn script lạ; thêm `no-store` cho API khi triển khai | |

**Kết luận:** không có lỗ hổng mức Nghiêm trọng chưa xử lý trong phạm vi bước 01–14 (phân quyền, sở hữu dữ liệu, toàn vẹn tiền / kho đều có test PASS). SEC-R1 chỉ "Cao" khi chạy thật với tài khoản demo. SEC-R1…R10 ghi vào hồ sơ [G4](quality-gates.md) để chủ dự án **chấp nhận rủi ro** hoặc **mở task sửa** (cột Quyết định).
