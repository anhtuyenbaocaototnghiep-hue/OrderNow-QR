# Sao lưu và khôi phục (Backup & Restore)

> Sổ tay 15 bước — bước 15. Quyết định: [ADR-016](../quyết-định/ADR-016-trien-khai-van-hanh.md) D-62. NFR: NFR-AVL-06. Công cụ: `npm run db:backup`, `npm run db:restore`, `npm run ops:health` (thử trên máy dev 23/10/2026 — §6). Lập trong [TASK-070](../công-việc/TASK-070.md).

## 1. Mục tiêu

| Chỉ số | Mục tiêu (PROPOSED — chủ dự án chốt ở G5) | Nghĩa là |
| --- | --- | --- |
| RPO — mất tối đa bao nhiêu dữ liệu | **≤ 24 giờ** | Sao lưu mỗi đêm. Máy hỏng giữa ngày thì đơn từ tối hôm trước tới lúc hỏng phải nhập lại từ bill / sổ giấy |
| RTO — bao lâu chạy lại được | **≤ 2 giờ** (máy dự phòng có sẵn) | Cài app theo [deployment-checklist.md](deployment-checklist.md) + khôi phục bản mới nhất |

Muốn mất ít hơn: thêm một lần sao lưu giữa ngày (ví dụ 15:00, lúc vắng khách) — chỉ cần thêm một lịch cho tác vụ `cafe-qr-sao-luu`.

## 2. Sao lưu gì, ở đâu, khi nào

| Thứ | Có sao lưu? | Cách |
| --- | --- | --- |
| CSDL (đơn, tiền, kho, hội viên, cài đặt…) | Có | `BACKUP DATABASE … WITH CHECKSUM` → `BACKUP_DIR\<CSDL>_<YYYYMMDD-HHmm>[_<nhãn>].bak` |
| Ảnh hóa đơn sổ quỹ (`UPLOADS_DIR`) | Có | Chép vào `BACKUP_DIR\uploads\` (chỉ thêm, không xóa) |
| `.env` (mật khẩu, khóa) | **Không** | Giữ theo [secrets-register.md](secrets-register.md) — bản sao lưu bị lộ cũng không lộ mật khẩu |
| Mã nguồn | Không | Có trong git (tag phát hành) |

**Hai nơi:**
1. `BACKUP_DIR` trên máy chủ — nên ở **ổ khác** ổ cài Windows (ổ D: / USB cắm cố định).
2. `BACKUP_COPY_DIR` **ngoài máy** — chủ quán chọn một (D-62):
   - thư mục đồng bộ đám mây của chủ quán (OneDrive / Google Drive) có **xác thực 2 lớp**; hoặc
   - USB riêng, **mỗi tuần** chép thư mục `BACKUP_DIR` rồi mang về nhà.

   Bản sao lưu có SĐT, họ tên hội viên → không chia sẻ thư mục, không gửi qua chat / email.

   Thư mục đám mây: script chỉ biết file **đã chép vào thư mục trên máy** (`copied = true`); việc tải lên mạng do ứng dụng OneDrive / Google Drive làm. Ứng dụng đó phải chạy và **đăng nhập bằng đúng tài khoản Windows chạy tác vụ sao lưu**; mỗi tuần mở trang web của dịch vụ xem bản mới nhất đã lên chưa.

**Lịch:**
- Hằng ngày sau giờ đóng cửa — tác vụ `cafe-qr-sao-luu` ([deployment-checklist.md](deployment-checklist.md) §A5).
- Trước mỗi lần phát hành / migration: `npm run db:backup -- --label truoc-v1.1`.
- Trước khi sửa dữ liệu hàng loạt hoặc khôi phục: `npm run db:backup -- --label truoc-khoi-phuc`.

**Thiết lập lần đầu (làm một lần trên máy chủ):**
1. Tạo thư mục, ví dụ `D:\cafe-qr-backup`.
2. Cho SQL Server quyền ghi — PowerShell **Run as administrator**, giữ nguyên **dấu nháy đơn**:
   `icacls 'D:\cafe-qr-backup' /grant 'NT Service\MSSQLSERVER:(OI)(CI)M'`
   (lỡ cài instance có tên `SQLEXPRESS`: `'NT Service\MSSQL$SQLEXPRESS:(OI)(CI)M'` — dùng nháy kép thì PowerShell hiểu `$SQLEXPRESS` là biến và cấp quyền sai).
   Lý do: SQL Server ghi file `.bak` bằng tài khoản dịch vụ riêng, không phải tài khoản Windows của bạn. Thiếu quyền thì script báo đúng lệnh này.
3. Thêm vào `.env`: `BACKUP_DIR=D:\cafe-qr-backup`, `BACKUP_COPY_DIR=<thư mục ngoài máy>`.
4. Bấm đúp `hướng-dẫn/9-sao-lưu-ngay.cmd` → "SAO LƯU XONG"; bấm `hướng-dẫn/10-kiểm-tra-hệ-thống.cmd` → mục Sao lưu "ổn".
5. Diễn tập khôi phục lần đầu (§4.1) và ghi vào §6.

## 3. Giữ bao lâu

Script tự dọn sau mỗi lần sao lưu, cả ở `BACKUP_DIR` và `BACKUP_COPY_DIR`:
- giữ mọi bản trong **14 ngày** gần nhất (`BACKUP_KEEP_DAYS`);
- giữ **bản sớm nhất của mỗi tháng** và **mọi bản có nhãn** trong **12 tháng** (`BACKUP_KEEP_MONTHS`);
- luôn giữ ít nhất **3 bản mới nhất** (máy tắt lâu ngày vẫn còn bản);
- chỉ xóa file đúng mẫu tên của đúng CSDL; file khác trong thư mục không bị đụng.

Ước lượng dung lượng: CSDL chạy thử hiện ~14 MB / bản → ~26 bản ≈ 0,4 GB. Kiểm tra hệ thống cảnh báo khi ổ còn < 10 GB.

## 4. Khôi phục

Khôi phục cần quyền quản trị SQL Server: chạy trên máy chủ bằng tài khoản Windows quản trị (script gọi `sqlcmd -E`). Login của app (`cafe_app`) không tạo được CSDL.

- Trước khi làm, script in **CSDL gốc và thời điểm sao lưu** của file — đọc kỹ đúng bản cần dùng.
- Diễn tập / khôi phục thành CSDL mới: không chỉ file thì lấy bản mới nhất trong `BACKUP_DIR`. Tên file trơn (`CafeQr_20261023-2330.bak`) được tìm trong `BACKUP_DIR`.
- **Ghi đè (`--replace`) bắt buộc chỉ rõ file** — bản mới nhất có thể chính là bản chụp dữ liệu đang hỏng (§4.2 bước 2).
- Ghi đè CSDL đang chạy: script từ chối nếu cổng app **còn trả lời bất kỳ gì** (kể cả lỗi 503 khi CSDL hỏng) — phải dừng app thật sự.

### 4.1. Diễn tập hằng tháng (không ảnh hưởng quán)

```
npm run db:restore -- --drill
```
Khôi phục vào CSDL riêng `CafeQrRestoreDrill`, đếm đơn / lượt thu / món / migration, rồi **xóa** CSDL diễn tập. App vẫn chạy bình thường. Ghi kết quả vào §6.

### 4.2. Dữ liệu bị hỏng / ghi nhầm hàng loạt (cùng máy)

Sửa một vài chỗ sai thì dùng chức năng của app (điều chỉnh kho, hủy khoản quỹ, hoàn tiền…), **không** khôi phục. Chỉ khôi phục khi hỏng nhiều và không sửa được:
1. Chủ quán đồng ý (mất dữ liệu từ lúc sao lưu tới giờ). Chuyển sang bán bằng giấy ([incident-runbook.md](incident-runbook.md) §3).
2. Sao lưu hiện trạng để còn đối chiếu: `npm run db:backup -- --label truoc-khoi-phuc`.
3. Dừng app (dừng tác vụ `cafe-qr-app`).
4. `npm run db:restore -- --to CafeQr <file .bak tốt gần nhất> --replace` — chọn bản **trước** lúc dữ liệu hỏng (không phải bản `truoc-khoi-phuc` vừa tạo); script từ chối nếu app còn chạy.
5. `npm run db:migrate` (nếu bản sao lưu cũ hơn migration hiện tại), khởi động app, `npm run ops:health`, kiểm thử khói.
6. Nhập lại đơn phát sinh sau lúc sao lưu từ bill / sổ giấy; ghi sự cố vào defect-log.

### 4.3. Máy chủ hỏng / mất máy (máy mới hoặc VPS)

1. Cài máy mới theo [deployment-checklist.md](deployment-checklist.md) phần A (hoặc B cho VPS), lấy `.env` từ bản cất giữ (secrets-register), chạy `npm run setup` (tạo login `cafe_app` + CSDL rỗng).
2. Chép bản `.bak` mới nhất từ nơi ngoài máy vào `BACKUP_DIR` của máy mới.
3. `npm run db:restore -- --to CafeQr <file .bak> --replace` — ghi đè CSDL rỗng, script tự gắn lại user `cafe_app` với login mới.
4. Chép `uploads\` từ bản sao lưu vào thư mục ảnh của app.
5. `npm run db:migrate`, khởi động app, `npm run ops:health`, kiểm thử khói.
6. Địa chỉ máy chủ đổi (IP khác / VPS) → sửa `PUBLIC_BASE_URL` và **in lại QR bàn**.

## 5. Kiểm tra sao lưu có chạy

- `npm run ops:health` (mỗi 15 phút): bản gần nhất ≤ 26 giờ = ổn; lỡ một đêm = cần để ý; > 50 giờ, chưa có bản nào, hoặc chưa chép được ra ngoài máy = lỗi.
- `BACKUP_DIR\backup.log`: mỗi lần chạy một dòng `OK …` hoặc `FAIL …`.
- `BACKUP_DIR\last-backup.json`: bản mới nhất, dung lượng, thời gian, đã chép ra ngoài chưa, đã dọn bản nào.

## 6. Nhật ký diễn tập khôi phục

| Ngày | Máy | Bản sao lưu | Kết quả | Thời gian khôi phục | Người làm | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| 23/10/2026 | Máy dev (SQL Server 2019 Developer) | `CafeQrDev_20261023-1427.bak` (14,1 MB) | **ĐẠT** — Orders 74, Payments 67, MenuItems 8, migration 0038; đã xóa CSDL diễn tập | 0,4 giây | Claude (TASK-070) | Thư mục thử `C:\Users\Public\…` (đã xóa sau khi thử). Thử thêm: thiếu quyền ghi → báo lệnh `icacls`; `--to CafeQrDev` không `--replace` → từ chối |
| 23/10/2026 | Máy dev | `CafeQrDev_20261023-1431_truoc-v1-0.bak` (bản có nhãn, lấy tự động từ `last-backup.json`) | **ĐẠT** | 0,3 giây | Claude (TASK-070) | Dọn bản cũ đúng quy tắc §3 (xóa 2 bản giả quá hạn, giữ bản đầu tháng + bản có nhãn + file lạ) |
| 23/10/2026 | Máy dev | `CafeQrDev_20261023-1500.bak` | **ĐẠT** (sau sửa theo review G3) — diễn tập; tạo CSDL tạm `CafeQrRestoreTmp` rồi **ghi đè** nó (`--replace`, chế độ OFFLINE) → trở lại ONLINE, nhiều người dùng; đã xóa CSDL tạm | 0,3–0,4 giây | Claude (TASK-070) | Rào chặn: `--replace` thiếu file → từ chối; cổng app trả lời (200 hoặc 503 giả lập "CSDL hỏng") → từ chối; cổng không ai nghe → cho ghi đè. `BACKUP_KEEP_DAYS="14 ngày"` / nhãn `!!!` → dừng trước khi sao lưu |
| (máy quán) | | | | | | Lần đầu: trước khi ký G5 |
