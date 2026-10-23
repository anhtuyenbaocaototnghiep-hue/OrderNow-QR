# Giám sát (Monitoring)

> Sổ tay 15 bước — bước 15. Quyết định: [ADR-016](../quyết-định/ADR-016-trien-khai-van-hanh.md) D-63. NFR: NFR-AVL-07. Công cụ: `npm run ops:health` (`hướng-dẫn/10-kiểm-tra-hệ-thống.cmd`). Lập 23/10/2026 trong [TASK-070](../công-việc/TASK-070.md).
>
> Quán nhỏ, không có người trực kỹ thuật thường xuyên và không dùng dịch vụ giám sát bên ngoài. Vì vậy giám sát gồm: **máy tự kiểm mỗi 15 phút và ghi lại**, cộng với **người xem đầu ngày** (2 phút).

## 1. Máy tự kiểm (mỗi 15 phút)

Tác vụ `cafe-qr-kiem-tra` chạy `npm run ops:health` ([deployment-checklist.md](deployment-checklist.md) §A5). Kết quả mới nhất: `nhật-ký\health-latest.json`; lịch sử: `nhật-ký\health-YYYYMM.log` (mỗi lần một dòng). Mã thoát 0 = ổn, 1 = cần để ý, 2 = có lỗi.

| Mục | Cách đo | Ổn | Cần để ý | Lỗi | Làm gì |
| --- | --- | --- | --- | --- | --- |
| API + CSDL | Gọi `GET /api/health` của app (5 giây) | Trả lời, CSDL `up` | Chậm > 2 giây | Không trả lời / CSDL `down` | [incident-runbook.md](incident-runbook.md) S1 / S2 |
| Ổ đĩa app, ổ đĩa sao lưu | Dung lượng trống | ≥ 10 GB | < 10 GB | < 2 GB | Dọn file, chuyển bản sao lưu cũ ra ngoài — S10 |
| Sao lưu | `BACKUP_DIR\last-backup.json` | ≤ 26 giờ | 26–50 giờ (lỡ một đêm) | > 50 giờ, chưa có bản nào, chưa chép được ra ngoài máy | Chạy `9-sao-lưu-ngay.cmd`, xem `backup.log` — [backup-restore.md](backup-restore.md) |
| Job nền | `JobRuns` trạng thái `FAILED` trong 24 giờ | Không có | Có job lỗi | — | Quản lý xem lỗi ở `GET /api/admin/jobs`, chạy lại (nút "Tính lại hôm nay" ở trang Hôm nay) |
| Dung lượng CSDL | Dữ liệu CSDL so với giới hạn 10 GB của bản Express | < 80 % | ≥ 80 % | ≥ 95 % | Lên kế hoạch nâng bản SQL Server / dọn dữ liệu cũ (cần chủ dự án quyết) |

**Giới hạn:** máy chỉ ghi lại kết quả, **không tự báo ai** — lỗi lúc nửa đêm được thấy khi người xem đầu ngày (§2) hoặc khi nhân viên thấy app không chạy. Không gửi cảnh báo ra ngoài (SMS / Zalo) ở bản này. Đề xuất làm sau (chức năng mới, cần chủ dự án duyệt): dải cảnh báo trong trang Quản lý → Hôm nay đọc kết quả kiểm tra mới nhất.

## 2. Người xem đầu ngày (trưởng ca / chủ quán, ~2 phút)

Trước khi mở cửa:

1. Bấm đúp `hướng-dẫn\10-kiểm-tra-hệ-thống.cmd` trên máy chủ → phải là **ỔN**. Có "CHÚ Ý" / "LỖI" → làm theo cột "Làm gì" ở §1.
2. Mở quầy, **mở ca**, bấm "Bật âm thanh"; quét thử QR một bàn bằng điện thoại.
3. Quản lý → **Hôm nay**: ca gần nhất đã đóng chưa và lệch két bao nhiêu, nguyên liệu sắp hết, lô sắp / đã hết hạn, khoản chi chờ duyệt, đơn đặt hàng đến hạn, kiểm kê quá hạn. Màn Quầy: dải "Đánh giá thấp" còn đánh giá chưa xử lý không.
4. Máy in còn giấy.

## 3. Theo dõi kinh doanh (chủ quán)

Ngoài "máy còn chạy không", chủ quán nên xem các dấu hiệu bất thường trong vận hành — nhiều sự cố F&B nằm ở đây chứ không ở máy:

| Dấu hiệu | Xem ở đâu | Tần suất |
| --- | --- | --- |
| Chênh lệch két khi đóng ca | Quản lý → Ca & hoàn tiền | Mỗi ngày |
| Hoàn tiền, xóa món đã gọi, hủy bàn, giảm giá tay nhiều bất thường | Quản lý → Nhật ký thao tác (lọc theo người / loại) | Mỗi tuần |
| Hao hụt kho, chênh lệch kiểm kê | Quản lý → Nhập kho & kiểm kê, báo cáo thất thoát | Mỗi tuần |
| Đánh giá thấp, món bị chê nhiều | Quản lý → Đánh giá món | Mỗi tuần |
| Doanh thu, giờ cao điểm, lãi / lỗ | Quản lý → Báo cáo, Phân tích, Lãi / lỗ | Mỗi tuần / tháng |

## 4. Nhật ký

| File | Nội dung | Giữ |
| --- | --- | --- |
| `nhật-ký\server-YYYYMMDD.log` | Mọi dòng app in ra (khởi động, lỗi). Không chứa mật khẩu / token (NFR-SEC-10) | 90 ngày — dọn tay mỗi tháng |
| `nhật-ký\health-YYYYMM.log`, `health-latest.json` | Kết quả kiểm tra mỗi 15 phút | 12 tháng |
| `BACKUP_DIR\backup.log`, `last-backup.json` | Kết quả từng lần sao lưu | Theo thư mục sao lưu |
| Nhật ký thao tác trong app (`AuditLogs`) | Thao tác đổi tiền / kho / quyền / giá | 12 tháng (job tự dọn) |

Thư mục `nhật-ký\` không commit (`.gitignore`).

## 5. Việc hằng tháng

- [ ] Diễn tập khôi phục `npm run db:restore -- --drill`, ghi vào [backup-restore.md](backup-restore.md) §6.
- [ ] Xem `health-YYYYMM.log` tháng trước: có lần nào "LỖI" kéo dài không, nguyên nhân gì.
- [ ] Dọn `nhật-ký\server-*.log` cũ hơn 90 ngày.
- [ ] Rà soát bí mật 3 tháng / lần ([secrets-register.md](secrets-register.md) §3).
- [ ] Cập nhật Windows / Node / SQL Server ngoài giờ mở cửa, sau khi sao lưu.
