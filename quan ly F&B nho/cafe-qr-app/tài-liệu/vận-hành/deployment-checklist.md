# Checklist triển khai (Deployment Checklist)

> Sổ tay 15 bước — bước 15. Quyết định: [ADR-016](../quyết-định/ADR-016-trien-khai-van-hanh.md) D-61. Phần **A** = máy tại quán (chính), phần **B** = VPS (dự phòng).
>
> **Đã thử trên máy dev (23/10/2026):** sao lưu / diễn tập khôi phục / kiểm tra hệ thống / file chạy máy chủ ghi nhật ký ([TASK-070](../công-việc/TASK-070.md)). **Chưa làm trên máy thật:** cấu hình router, tường lửa, Task Scheduler, VPS — đánh dấu khi làm, ghi ngày + người.

## A. Máy chủ tại quán (mạng LAN)

### A1. Phần cứng, điện, mạng

- [ ] Máy Windows 10 / 11 64-bit, RAM ≥ 8 GB, ổ SSD. Nên có **ổ thứ hai hoặc USB cắm cố định** cho bản sao lưu.
- [ ] **Bộ lưu điện (UPS)** cho máy chủ và router. Trong BIOS bật "Restore on AC power loss = Power On" để mất điện có lại thì máy tự bật, app tự chạy.
- [ ] Tắt chế độ ngủ khi cắm điện: `powercfg /change standby-timeout-ac 0`.
- [ ] Windows Update: đặt **Active hours** trùng giờ mở cửa để máy không tự khởi động lại khi đang bán.
- [ ] Router: **giữ IP cố định** cho máy chủ (DHCP reservation theo địa chỉ MAC). Đổi IP là QR bàn in sẵn không vào được nữa.
- [ ] Wi-Fi cho khách: nếu dùng mạng "Guest" có **cách ly thiết bị** (client isolation), điện thoại khách sẽ không vào được máy chủ. Hoặc cho mạng khách truy cập IP máy chủ cổng 3000, hoặc dùng chung mạng với máy chủ.
- [ ] Máy quầy, máy in nhiệt cùng mạng với máy chủ.

### A2. Phần mềm

- [ ] **Node.js 22 LTS** (≥ 22.9).
- [ ] **SQL Server 2022 Express** (miễn phí, mỗi CSDL ≤ 10 GB). **Không** dùng bản Developer cho quán chạy thật — giấy phép bản Developer chỉ cho phát triển / thử nghiệm.
  - Khi cài chọn **Custom** → **Default instance** (tên `MSSQLSERVER`). Bản Express mặc định cài thành instance có tên `SQLEXPRESS` với cổng động — khi đó app (`127.0.0.1:1433`), `sqlcmd -S .`, lệnh `icacls` và các hướng dẫn ở đây không khớp.
  - Đã lỡ cài `SQLEXPRESS`: trong *SQL Server Configuration Manager* → *TCP/IP* của instance đó → *IPAll*: xóa *TCP Dynamic Ports*, đặt *TCP Port* = `1433`, khởi động lại dịch vụ; đặt `RESTORE_SQL_SERVER=.\SQLEXPRESS`; lệnh `icacls` dùng `'NT Service\MSSQL$SQLEXPRESS:(OI)(CI)M'` (nháy đơn).
  - Dùng **cùng bản 2022** ở máy quán và VPS: bản sao lưu chỉ khôi phục được lên SQL Server bằng hoặc mới hơn bản tạo ra nó.
  - Bật *SQL Server and Windows Authentication mode* và TCP/IP như [hướng-dẫn/README.md](../../hướng-dẫn/README.md) §1.
- [ ] **sqlcmd** (đi kèm SQL Server / SSMS) — dùng cho khôi phục.
- [ ] Chrome trên máy quầy; driver máy in nhiệt, khổ 80 mm hoặc 58 mm.

### A3. Cài app

- [ ] Đặt app ở đường dẫn **không có ký tự `&`**, ví dụ `C:\cafe-qr-app` (đường dẫn có `&` làm hỏng lệnh `npx` của npm — [local-development.md](local-development.md)).
- [ ] Lấy code đúng phiên bản phát hành (tag `v1.0.0`), chạy `npm ci`.
- [ ] Tạo `.env` từ `.env.example` (chạy `npm run setup` sẽ hỏi và tự tạo), kiểm các dòng:

| Biến | Giá trị chạy thật |
| --- | --- |
| `DB_NAME` | `CafeQr` (CSDL mới, không dùng `CafeQrDev`) |
| `JWT_SECRET` | chuỗi ngẫu nhiên 64 ký tự (setup tự tạo) |
| `PUBLIC_BASE_URL` | `http://<IP cố định của máy chủ>:3000` |
| `NODE_ENV` | `production` |
| `JOBS_ENABLED` | `true` |
| `BACKUP_DIR` / `BACKUP_COPY_DIR` | theo [backup-restore.md](backup-restore.md) §2 |
| `ADMIN_SEED_PASSWORD` | mật khẩu mạnh, đổi lại trong app ngay sau lần đăng nhập đầu |
| `RATE_LIMIT` | để trống (bật giới hạn tần suất) |
| `UPLOADS_DIR`, `LOG_DIR` | thư mục **ngoài** thư mục app, ví dụ `D:\cafe-qr-data\uploads`, `D:\cafe-qr-data\nhat-ky` — thay thư mục app khi phát hành không làm mất ảnh hóa đơn / nhật ký |
| `RESTORE_SQL_SERVER` | để trống nếu cài *Default instance*; `.\SQLEXPRESS` nếu lỡ cài instance có tên |

- [ ] `npm run setup`: tạo CSDL + login `cafe_app` + bảng + tài khoản quản lý đầu tiên. Đăng nhập `/admin` → **đổi mật khẩu admin**.
- [ ] **Bỏ dữ liệu mẫu do setup tạo** (setup luôn tạo để chạy thử):
  - Quản lý → Tài khoản → **xóa tài khoản `staff1`** (mật khẩu `Staff@123` có trong tài liệu công khai — ai trong Wi-Fi quán cũng đăng nhập quầy được nếu còn);
  - xóa món, nguyên liệu, bàn mẫu (nút Xóa — CSDL mới chưa có lịch sử nên xóa hẳn) trước khi nhập dữ liệu thật ở §A7;
  - setup cũng tạo CSDL `CafeQrTest` cho test tự động — **không chạy test trên máy quán**; xóa CSDL này được.
- [ ] Ghi các bí mật vào nơi giữ theo [secrets-register.md](secrets-register.md); **không** chụp màn hình `.env`.

### A4. Bảo mật máy chủ

- [ ] Tài khoản Windows chạy app có mật khẩu; nhân viên không dùng chung tài khoản quản trị máy.
- [ ] Tường lửa: chỉ mở cổng 3000 cho mạng **Private**, không mở 1433 (SQL Server) ra mạng:
  `New-NetFirewallRule -DisplayName "cafe-qr-app 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Profile Private -Action Allow` (PowerShell quyền quản trị). Mạng Wi-Fi của quán phải đặt là *Private network*.
- [ ] **Không** mở cổng (port forwarding) trên router ra Internet. App không có HTTPS khi chạy trong LAN (NFR-SEC-13).
- [ ] Bật mã hóa ổ đĩa nếu Windows hỗ trợ (BitLocker / Device encryption) — máy mất thì dữ liệu hội viên không bị đọc.

### A5. Tự chạy và lịch định kỳ (Task Scheduler)

Cấp quyền ghi thư mục sao lưu cho SQL Server trước (lệnh `icacls` ở [backup-restore.md](backup-restore.md) §2). Tạo 3 tác vụ, cùng chạy bằng tài khoản Windows của app, chọn *Run whether user is logged on or not*:

| Tác vụ | Khi nào | Chạy | Cài đặt thêm |
| --- | --- | --- | --- |
| `cafe-qr-app` | Khi bật máy (*At startup*) | `cmd.exe /c "<thư mục app>\hướng-dẫn\11-chạy-máy-chủ-quán.cmd"` | Bỏ chọn *Stop the task if it runs longer than*. File `.cmd` **tự chạy lại app sau 15 giây** mỗi khi app dừng (SQL Server chưa sẵn sàng lúc mới bật máy, lỗi) — không dựa vào *restart on failure* của Task Scheduler |
| `cafe-qr-sao-luu` | Hằng ngày, sau giờ đóng cửa (ví dụ 23:30) | `cmd.exe /c npm run db:backup`, *Start in* = thư mục app | *Run task as soon as possible after a scheduled start is missed* |
| `cafe-qr-kiem-tra` | Mỗi 15 phút | `cmd.exe /c npm run ops:health`, *Start in* = thư mục app | — |

Cách nhanh bằng PowerShell (quyền quản trị, đứng ở thư mục app; **chưa chạy thử trên máy thật**):

```powershell
$app  = (Get-Location).Path
$user = "$env:COMPUTERNAME\<tài khoản chạy app>"
$cred = Get-Credential $user   # hỏi mật khẩu, không ghi vào lịch sử lệnh
$pw   = $cred.GetNetworkCredential().Password
$run  = { param($cmd) New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c $cmd" -WorkingDirectory $app }
Register-ScheduledTask -TaskName 'cafe-qr-app' -User $user -Password $pw -Trigger (New-ScheduledTaskTrigger -AtStartup) `
  -Action (& $run "`"$app\hướng-dẫn\11-chạy-máy-chủ-quán.cmd`"") `
  -Settings (New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero))
Register-ScheduledTask -TaskName 'cafe-qr-sao-luu' -User $user -Password $pw -Trigger (New-ScheduledTaskTrigger -Daily -At 23:30) `
  -Action (& $run 'npm run db:backup') -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable)
Register-ScheduledTask -TaskName 'cafe-qr-kiem-tra' -User $user -Password $pw `
  -Trigger (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15)) -Action (& $run 'npm run ops:health')
```

- [ ] Khởi động lại máy → không đăng nhập Windows → điện thoại vẫn mở được `http://<IP>:3000` (app tự chạy).
- [ ] Thư mục nhật ký (`LOG_DIR`) có `server-YYYYMMDD.log` và `health-latest.json` mới.
- [ ] Dừng tác vụ `cafe-qr-app` trong Task Scheduler → `netstat -ano | findstr :3000` không còn dòng nào (app đã tắt hẳn). Còn → tắt đúng tiến trình `node.exe` có PID đó (`taskkill /PID <số> /F`), ghi lại để sửa cách dừng. Chưa kiểm trên máy thật.

### A6. Máy quầy và máy in

- [ ] Lối tắt Chrome mở `http://<IP>:3000/pos` (đăng nhập tài khoản nhân viên, không dùng tài khoản quản lý ở quầy).
- [ ] In thử bill: chọn khổ giấy đúng ở màn hình quầy; tùy chọn chạy Chrome với `--kiosk-printing` để in không hiện hộp thoại.
- [ ] Bấm "Bật âm thanh" một lần mỗi khi mở trang quầy (trình duyệt chặn tự phát âm thanh).

### A7. Dữ liệu ban đầu

- [ ] Cài đặt quán (tên, địa chỉ in trên bill), giờ bán, ngưỡng giảm giá.
- [ ] Danh mục, món, giá, tùy chọn, định lượng (BOM); nguyên liệu + **tồn đầu kỳ** (kiểm kê thực tế ngày go-live).
- [ ] Bàn → **in QR** sau khi `PUBLIC_BASE_URL` đã đúng IP cố định. Dán QR, quét thử từng bàn.
- [ ] Tài khoản nhân viên / trưởng ca (mỗi người một tài khoản).

### A8. Kiểm thử khói (sau cài đặt và sau mỗi lần phát hành)

| # | Làm | Đạt khi |
| --- | --- | --- |
| 1 | `npm run ops:health` | Tổng: ỔN |
| 1b | Đăng nhập quầy bằng `staff1` / `Staff@123` | **Bị từ chối** (tài khoản mẫu đã xóa) |
| 2 | Đăng nhập quầy bằng tài khoản nhân viên, mở ca | Vào được màn Đơn hàng, ca mở |
| 3 | Điện thoại (Wi-Fi khách) quét QR một bàn, gọi 1 món | Quầy nhận đơn ngay, có chuông |
| 4 | Quầy tiếp nhận → hoàn tất | Kho nguyên liệu giảm đúng định lượng |
| 5 | Khách gọi thanh toán → quầy thu tiền mặt | In được bill, điện thoại khách hiện màn cảm ơn |
| 6 | Bán mang đi 1 món | Thu tiền, in bill |
| 7 | Quản lý mở Báo cáo hôm nay | Có 2 đơn vừa làm |
| 8 | Hủy / hoàn tiền thử, rồi đóng ca | Chênh lệch két đúng |
| 9 | `npm run db:backup` | Xong, có file `.bak` mới |
| 10 | Khởi động lại máy chủ | App tự chạy lại, bước 1 vẫn ỔN |

Đơn thử ở bước 3–8: ghi chú "THỬ" và hoàn tiền / hủy để báo cáo không lẫn doanh thu thật.

### A9. Bàn giao

- [ ] Điền [secrets-register.md](secrets-register.md) (nơi giữ, người giữ), danh sách người trực [incident-runbook.md](incident-runbook.md) §2 — in ra dán ở quầy.
- [ ] Diễn tập khôi phục lần đầu ĐẠT ([backup-restore.md](backup-restore.md) §5).
- [ ] Chủ dự án ký Gate G5; ghi Nhật ký phát hành ([release-plan.md](release-plan.md) §7).

## B. VPS dự phòng (Internet)

Dùng khi máy quán hỏng lâu, hoặc khi cần địa chỉ Internet (ví dụ thanh toán online có webhook). **Chưa thử** — làm theo khi cần, ghi lại kết quả.

- [ ] VPS Ubuntu 22.04 / 24.04, ≥ 2 vCPU, 4 GB RAM; tên miền trỏ về IP của VPS.
- [ ] Tường lửa (`ufw`): chỉ mở 22 (SSH bằng khóa, tắt đăng nhập mật khẩu), 80, 443.
- [ ] SQL Server 2022 bằng Docker, bản Express, **chỉ nghe nội bộ**: dựa trên `docker-compose.yml` của repo:
  - thêm `MSSQL_PID: Express`, đổi cổng thành `127.0.0.1:1433:1433`;
  - **đặt `MSSQL_SA_PASSWORD`** mạnh trong file `.env` của docker compose — không đặt thì compose dùng mật khẩu mặc định ghi trong repo;
  - gắn thư mục sao lưu **cùng một đường dẫn ở máy và trong container**, ví dụ `/var/opt/cafe-qr-backup:/var/opt/cafe-qr-backup`, rồi `chown 10001 /var/opt/cafe-qr-backup` (container chạy bằng user 10001). Script sao lưu cần đọc được file `.bak` từ máy chủ ở đúng đường dẫn SQL Server đã ghi.
- [ ] Node 22 chạy app bằng dịch vụ `systemd` (khởi động cùng máy, tự chạy lại khi lỗi).
- [ ] Reverse proxy có HTTPS tự động (ví dụ Caddy) → `localhost:3000`.
- [ ] `.env` khác bản LAN: `PUBLIC_BASE_URL=https://<tên miền>`, `TRUST_PROXY=true`, `DB_ENCRYPT=true` + `DB_TRUST_SERVER_CERT=true` (chứng chỉ tự ký của container), `NODE_ENV=production`, `BACKUP_DIR=/var/opt/cafe-qr-backup` (cùng đường dẫn ở máy và container), `RESTORE_SQL_USER` / `RESTORE_SQL_PASSWORD`.
- [ ] Khôi phục bản sao lưu mới nhất từ máy quán: chép `.bak` vào thư mục sao lưu của container → `npm run db:restore -- --to CafeQr <file> --replace` (app dừng) → `npm run db:migrate` → chép thư mục ảnh `uploads`.
- [ ] **In lại toàn bộ QR bàn**: QR chứa địa chỉ máy chủ, chuyển từ `http://<IP LAN>` sang `https://<tên miền>` thì QR cũ không dùng được.
- [ ] Kiểm thử khói như §A8 (bỏ bước 10, thay bằng khởi động lại VPS).
- [ ] Lịch sao lưu / kiểm tra bằng `cron` thay cho Task Scheduler; bản ngoài máy chép về máy quán hoặc kho lưu trữ khác nhà cung cấp VPS.
