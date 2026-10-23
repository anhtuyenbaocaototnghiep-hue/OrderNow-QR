# Sổ đăng ký bí mật (Secrets Register)

> Sổ tay 15 bước — bước 15. Liệt kê **mọi bí mật** của hệ thống: dùng để làm gì, để ở đâu, ai giữ, khi nào đổi, đổi thế nào. **File này không bao giờ chứa giá trị thật** — chỉ ghi tên và nơi giữ. Liên quan: NFR-SEC-11, [security-model.md](../kiến-trúc/security-model.md), [security-check.md](../chất-lượng/security-check.md). Lập 23/10/2026 trong [TASK-070](../công-việc/TASK-070.md).

## 1. Quy tắc

1. Giá trị thật chỉ nằm ở **hai nơi**: file `.env` trên máy chủ, và **một bản cất giữ** của chủ quán (trình quản lý mật khẩu có xác thực 2 lớp, hoặc giấy niêm phong cất két).
2. **Không** đưa vào: git, chat / Zalo / email, ảnh chụp màn hình, tài liệu, prompt cho AI, nhật ký. `.env` đã bị `.gitignore` chặn; script sao lưu **không** sao lưu `.env`.
3. Mỗi người một tài khoản trong app; không dùng chung tài khoản quản lý ở quầy.
4. **Đổi ngay** khi: nghi bị lộ, người giữ nghỉ việc, máy chủ / bản sao lưu bị mất. **Rà soát** 3 tháng một lần (cột "Rà soát" ở §3).

## 2. Danh sách bí mật

| # | Bí mật | Dùng để | Nơi dùng | Ai giữ | Đổi định kỳ | Cách đổi | Ảnh hưởng khi đổi |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S-01 | `JWT_SECRET` | Ký phiên đăng nhập của nhân viên / quản lý | `.env` máy chủ | Chủ quán | 12 tháng, hoặc khi người kỹ thuật nghỉ | Tạo chuỗi mới: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` → sửa `.env` → khởi động lại app | Mọi người phải đăng nhập lại |
| S-02 | `DB_PASSWORD` (login SQL `cafe_app`) | App kết nối CSDL | `.env` máy chủ | Chủ quán | 12 tháng | Mở SSMS (đăng nhập Windows) → *Security → Logins → cafe_app → Properties* → đặt mật khẩu mới (không gõ mật khẩu vào dòng lệnh — lưu trong lịch sử lệnh) → sửa `.env` → khởi động lại app | App ngừng vài giây |
| S-03 | Tài khoản quản trị SQL Server (Windows admin của máy chủ / `sa` trên VPS) | Khôi phục CSDL, cấp quyền | Máy chủ | Chủ quán + người kỹ thuật | Khi người giữ nghỉ | Windows: đổi mật khẩu tài khoản; `sa`: `ALTER LOGIN sa WITH PASSWORD = …` | Cập nhật `RESTORE_SQL_PASSWORD` (VPS) và mật khẩu tác vụ Task Scheduler |
| S-04 | `ADMIN_SEED_PASSWORD` | Mật khẩu ban đầu của tài khoản quản lý do `npm run setup` tạo | `.env` (chỉ dùng lần cài đầu) | Người kỹ thuật | — | Đổi mật khẩu quản lý trong app ngay sau lần đăng nhập đầu; sau đó giá trị trong `.env` không còn tác dụng | — |
| S-05 | Mật khẩu tài khoản app (quản lý, trưởng ca, nhân viên). Tài khoản mẫu `staff1` / `Staff@123` do setup tạo **phải xóa** trên máy quán (mật khẩu có trong tài liệu công khai) | Đăng nhập quầy / quản lý | Mỗi người tự nhớ | Từng người | Khi nghi lộ | Quản lý → Tài khoản → đặt lại mật khẩu; nghỉ việc → **khóa tài khoản** (F-009) | Khóa tài khoản: phiên cũ bị từ chối ngay (BR-017). Chỉ đặt lại mật khẩu thì phiên cũ **vẫn dùng được tới khi hết hạn** (`JWT_EXPIRES_IN`, NFR-SEC-14 chưa có) → nghi lộ thì khóa tạm, đặt lại mật khẩu rồi mở khóa |
| S-06 | `ZALO_OA_TOKEN` (nếu dùng chiến dịch Zalo OA) | Gửi tin chiến dịch | `.env` | Chủ quán | Theo hạn của Zalo | Tạo lại trên trang Zalo OA → sửa `.env` → khởi động lại | Chiến dịch đang chờ gửi dùng token mới |
| S-07 | Mật khẩu Windows của tài khoản chạy app | Đăng nhập máy chủ, chạy tác vụ Task Scheduler | Máy chủ | Chủ quán + người kỹ thuật | 12 tháng | Đổi mật khẩu Windows → nhập lại mật khẩu ở 3 tác vụ `cafe-qr-*` | Quên nhập lại → app không tự chạy khi bật máy |
| S-08 | Mật khẩu quản trị router, Wi-Fi nội bộ | Cấu hình mạng, IP cố định | Router | Chủ quán | Khi nhân viên nghỉ | Trang quản trị router | Thiết bị phải kết nối lại Wi-Fi |
| S-09 | Tài khoản nơi giữ bản sao lưu ngoài máy (đám mây / USB mã hóa) | Lấy bản sao lưu khi máy chủ hỏng | Ngoài máy chủ | Chủ quán | Bật 2 lớp xác thực | Trang tài khoản của dịch vụ | — |
| S-10 | (VPS) khóa SSH, tài khoản nhà cung cấp VPS / tên miền, `RESTORE_SQL_PASSWORD` | Quản trị VPS dự phòng | Máy của người kỹ thuật, trình quản lý mật khẩu | Chủ quán + người kỹ thuật | Khi người giữ nghỉ | Tạo khóa mới, xóa khóa cũ trên VPS | — |

Mật khẩu Wi-Fi **dành cho khách** không phải bí mật của hệ thống (dán ở quầy), nhưng nên tách khỏi Wi-Fi nội bộ nếu router cho phép (lưu ý cách ly thiết bị — [deployment-checklist.md](deployment-checklist.md) §A1).

## 3. Nơi giữ và rà soát (chủ quán điền — không ghi giá trị)

| # | Đã cất bản giữ ở đâu | Người giữ | Đổi lần cuối | Rà soát lần cuối |
| --- | --- | --- | --- | --- |
| S-01 | | | | |
| S-02 | | | | |
| S-03 | | | | |
| S-04 | | | | |
| S-05 | (từng người tự giữ — ghi ngày rà danh sách tài khoản, đã xóa `staff1` chưa) | | | |
| S-06 | | | | |
| S-07 | | | | |
| S-08 | | | | |
| S-09 | | | | |
| S-10 | | | | |

## 4. Khi bí mật bị lộ

Làm theo [incident-runbook.md](incident-runbook.md) kịch bản **S8**: khóa tài khoản liên quan, đổi bí mật theo bảng §2 (ưu tiên S-01, S-02, S-05), xem Nhật ký thao tác trong Quản lý, ghi sự cố vào [defect-log.md](../chất-lượng/defect-log.md).
