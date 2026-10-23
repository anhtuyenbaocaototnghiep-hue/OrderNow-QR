# TASK-070 — Bước 15: triển khai và vận hành
Status: READY_FOR_REVIEW (23/10/2026)
Quyết định: [ADR-016](../quyết-định/ADR-016-trien-khai-van-hanh.md) D-61…D-63 (đóng Q-008) · NFR: NFR-AVL-06, NFR-AVL-07, NFR-SEC-11 · Gate: G5
Nguồn: chủ dự án yêu cầu 23/10/2026 ("còn thiếu bước 15 bạn làm cho tôi luôn"); chọn: máy tại quán (LAN) là chính, VPS dự phòng. · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-070-trien-khai-van-hanh` (tách từ `main`) · Phụ thuộc: không

## Mục tiêu
Đủ đầu ra bước 15 của sổ tay: **Release Plan, Deployment Checklist, Secrets Register, Backup, Monitoring, Incident**, có công cụ chạy được thật (sao lưu, khôi phục, kiểm tra hệ thống) và đã thử trên máy dev.

## Kế hoạch
1. Tài liệu trước code: ADR-016, task này.
2. Script:
   - `kịch-bản/db-backup.js` (`npm run db:backup`): sao lưu đầy đủ có checksum vào `BACKUP_DIR`, chép ảnh hóa đơn, chép thêm sang `BACKUP_COPY_DIR`, dọn bản cũ theo quy tắc giữ, ghi `last-backup.json`.
   - `kịch-bản/db-restore.js` (`npm run db:restore`): diễn tập khôi phục vào CSDL riêng rồi xóa; khôi phục thật có chặn nhầm.
   - `kịch-bản/ops-health.js` (`npm run ops:health`): API + CSDL, ổ đĩa, tuổi bản sao lưu, job nền lỗi, dung lượng CSDL.
   - Logic thuần (tên file, quy tắc giữ, đánh giá kết quả) ở `kịch-bản/lib/vận-hành.js` để test đơn vị.
3. File bấm đúp `hướng-dẫn/9-sao-lưu-ngay.cmd`, `10-kiểm-tra-hệ-thống.cmd`, `11-chạy-máy-chủ-quán.cmd` (chạy nền, ghi nhật ký).
4. Tài liệu vận hành `tài-liệu/vận-hành/`: `release-plan.md`, `deployment-checklist.md`, `secrets-register.md`, `backup-restore.md`, `monitoring.md`, `incident-runbook.md`, `README.md`.
5. Đồng bộ: `quy-trình-15-bước`, `quality-gates` (G5), `nfr` (NFR-AVL-06, 07), `open-questions` (Q-008), `local-development`, `.env.example`, `.gitignore`, `hướng-dẫn/README.md`.
6. Test đơn vị `tests/ops.test.js`; thử thật trên máy dev: sao lưu `CafeQrDev`, diễn tập khôi phục, kiểm tra hệ thống. Review G3 độc lập, gộp `main`.

## Phạm vi sửa
- **Script:** `kịch-bản/db-backup.js`, `db-restore.js`, `ops-health.js`, `lib/vận-hành.js` (mới); `package.json` (3 lệnh).
- **Hướng dẫn:** `hướng-dẫn/9…11-*.cmd` (mới), `hướng-dẫn/README.md`.
- **Test:** `ứng-dụng/máy-chủ/tests/ops.test.js`.
- **Tài liệu:** như mục 4–5.

## Không được sửa
- Code ứng dụng (`ứng-dụng/`), migration, dependency.
- Dữ liệu `CafeQrDev`: chỉ **đọc** để sao lưu thử; diễn tập khôi phục vào CSDL riêng rồi xóa.
- Không triển khai thật, không tạo tác vụ Task Scheduler trên máy chủ dự án, không gắn tag phát hành — chờ Gate G5.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run trace -- --check` · `npm run db:backup` (thư mục thử) · `npm run db:restore -- --drill` · `npm run ops:health`.

## Cần hỏi duyệt nếu
- Ngưỡng RPO / RTO, nơi để bản sao lưu ngoài máy.
- Mang dữ liệu chạy thử sang CSDL chạy thật.
- Triển khai thật, tạo tác vụ tự chạy, gắn tag phát hành.

## Kết quả thực chạy (23/10/2026, máy dev)

| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **302/302 PASS** (26 file — thêm `ops.test.js` 10 test, gồm 3 test review G3) |
| `npm run test:e2e` | **40/40 PASS** (không đổi code ứng dụng; chạy để có bằng chứng truy vết) |
| `npm run load` | NFR-002 10/10 vòng PASS; NFR-001 p50 69 ms, p95 211 ms |
| `npm run trace -- --check` | 129 US, 321 AC — PASS 321, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| `npm run db:backup` (CafeQrDev → thư mục thử trong `C:\Users\Public`, kèm `BACKUP_COPY_DIR`) | 14,1 MB / 0,2 giây; chép sang thư mục thứ hai; bản có nhãn `truoc-v1-0`; dọn đúng 2 bản giả quá hạn, giữ bản đầu tháng / có nhãn / file lạ |
| `npm run db:backup` vào thư mục SQL Server không ghi được | Báo đúng lệnh `icacls`; đường dẫn tương đối → từ chối |
| `npm run db:restore -- --drill` (2 lần, có lần lấy bản mới nhất từ `last-backup.json`) | **ĐẠT**: Orders 74, Payments 67, MenuItems 8, migration 0038; 0,3–0,4 giây; CSDL diễn tập đã xóa |
| `npm run db:restore -- --to CafeQrDev` (không `--replace`) / tên CSDL `Bad;Name` | Từ chối, không đụng CSDL |
| `npm run ops:health` | App chạy: ỔN (mã 0); app tắt: CÓ LỖI (mã 2) |
| `hướng-dẫn/9`, `10`, `11-*.cmd` | Chạy được với tên thư mục có dấu (file CRLF); `11` tạo `nhật-ký\server-YYYYMMDD.log` và ghi lỗi khởi động |

Thư mục thử chứa dữ liệu thật đã **xóa** sau khi thử. Chưa làm (chờ G5, cần chủ dự án): cài máy quán, tạo tác vụ Task Scheduler, diễn tập trên máy quán, VPS.

**Phát hiện khi làm:**
- `sqlcmd -E` qua `127.0.0.1,1433` bị từ chối ("untrusted domain") → khôi phục mặc định dùng kết nối nội bộ `.`.
- Gọi `process.exit()` khi kết nối CSDL lỗi còn đang đóng làm Node crash trên Windows (mã âm), và `if errorlevel` trong `.cmd` hiểu nhầm là thành công → script đặt `process.exitCode`, file `.cmd` so đúng mã 0 / 1.
- Tài khoản Windows thường không đọc được thư mục sao lưu mặc định của SQL Server → script ghi thẳng vào `BACKUP_DIR` đã cấp quyền.

## Review G3 (agent độc lập, 23/10/2026)
Kết luận lần 1: **Request changes** (6 phải sửa). Đã kiểm đúng: chặn tiêm SQL ở mọi giá trị ghép vào lệnh `sqlcmd`; dọn bản cũ chỉ đụng đúng file, đúng múi giờ / ranh giới tháng; file `.cmd` so đúng mã thoát; không lộ giá trị `.env`; câu về giấy phép Developer / Express và cache 1 giờ đúng. Đã sửa:

| # | Phát hiện | Xử lý |
| --- | --- | --- |
| M1 (phải sửa) | Rào "app đang chạy" chỉ coi HTTP 200 là chạy → CSDL hỏng (health trả 503 / treo) thì `--replace` ghi đè CSDL đang chạy — đúng lúc cần khôi phục | Có **bất kỳ** phản hồi HTTP hoặc quá giờ chờ = đang chạy; chỉ "bị từ chối kết nối" = đã dừng. Thử thật: cổng trả 200 → từ chối; server giả trả 503 → từ chối; cổng không ai nghe → cho ghi đè (trên CSDL tạm) |
| M2 (phải sửa) | `BACKUP_KEEP_DAYS="14 ngày"` → NaN → xóa mọi bản trừ 3 bản mới nhất (cả bản có nhãn / đầu tháng) | `positiveInt()` — sai thì dừng **trước** khi sao lưu / dọn; test đơn vị; thử thật |
| M3 (phải sửa) | Checklist bắt dùng Express nhưng mọi thứ giả định instance mặc định; lệnh `icacls` cho `MSSQL$SQLEXPRESS` trong nháy kép bị PowerShell hiểu sai | Hướng dẫn cài **Default instance**, cách xử lý nếu lỡ cài `SQLEXPRESS` (cổng 1433, `RESTORE_SQL_SERVER`); `icacls` dùng nháy đơn ở script và tài liệu; cùng bản 2022 ở máy quán / VPS |
| M4 (phải sửa) | `npm run setup` tạo `staff1` / `Staff@123` (mật khẩu công khai) + dữ liệu mẫu trên máy chạy thật | Checklist A3: xóa `staff1`, xóa món / nguyên liệu / bàn mẫu, không chạy test trên máy quán; kiểm thử khói thêm bước "staff1 bị từ chối"; sổ bí mật S-05 |
| M5 (phải sửa) | `11-…cmd` chạy `npm start` một lần; lúc mới bật máy SQL Server chưa sẵn sàng → app thoát, không tự lên lại | Vòng tự chạy lại sau 15 giây (chờ bằng `ping`, chạy được khi không có cửa sổ); đọc `LOG_DIR` từ `.env`. Thử thật: thoát → 15 giây sau tự khởi động |
| M6 (phải sửa) | VPS: thư mục sao lưu gắn khác đường dẫn giữa máy và container → mọi lần sao lưu báo lỗi; thiếu nhắc đặt `MSSQL_SA_PASSWORD` | Gắn cùng đường dẫn, `chown 10001`, bắt buộc đặt mật khẩu `sa` |
| N1 | Khôi phục mặc định lấy bản mới nhất — sau §4.2 bước 2 đó là bản chụp dữ liệu hỏng; tên file trơn tìm theo thư mục hiện tại | `--replace` bắt buộc chỉ rõ file; in CSDL gốc + giờ sao lưu (`RESTORE HEADERONLY`) trước khi làm; tên trơn tìm trong `BACKUP_DIR` |
| N2 | `SINGLE_USER` có thể bị kết nối khác chiếm trước `RESTORE` | Đổi sang `SET OFFLINE WITH ROLLBACK IMMEDIATE`, lỗi thì `SET ONLINE`; runbook S2 thêm cách gỡ CSDL kẹt Restoring / Offline. Thử thật trên CSDL tạm |
| N3 | Release plan nói migration "chỉ cộng thêm" — sai (0005, 0012, 0020, 0025, 0033 đổi cột / ràng buộc) | Sửa hướng dẫn quay lui theo loại migration |
| N4 | Ảnh hóa đơn / nhật ký nằm trong thư mục code → thay thư mục khi phát hành là mất | Checklist A3: `UPLOADS_DIR`, `LOG_DIR` ngoài thư mục app |
| N5 | OneDrive: `copied = true` chỉ là đã chép vào thư mục trên máy | Ghi rõ điều kiện tải lên + kiểm hằng tuần |
| N6 | `ops-health`: thiếu `finishedAt` làm lỗi, `pool.close()` lỗi làm mất kết quả; NFR-AVL-07 nói "phát hiện" nhưng không ai được báo | Sửa cả hai; NFR-AVL-07 và monitoring ghi rõ giới hạn, đề xuất dải cảnh báo trong "Hôm nay" (chờ duyệt) |
| N7 | Đổi mật khẩu S-02 qua dòng lệnh lưu vào lịch sử; bảng §3 thiếu S-05/06/10; nhãn toàn ký tự đặc biệt thành bản thường; lỗi bất ngờ không vào `backup.log`; `sqlcmd` chưa ép UTF-8 | Đổi qua SSMS; thêm dòng; nhãn rỗng → dừng; ghi `backup.log`; `-f 65001` |
| Test | Logic rủi ro nằm trong script không test | Chuyển đọc FILELISTONLY / HEADERONLY, chọn đích MOVE (CSDL mới / có sẵn / nhiều file), kiểm số ngày giữ vào `lib/` + 3 test đơn vị |

Chưa làm (ghi lại): kiểm dung lượng ổ chứa file dữ liệu SQL Server; xác minh trên máy thật việc dừng tác vụ Task Scheduler có tắt hẳn `node.exe` không (checklist A5 có bước kiểm).
