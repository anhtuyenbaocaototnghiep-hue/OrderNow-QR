# TASK-090 — Quên PIN, nhắc chấm công, nhân viên báo quên chấm công (F-072 bổ sung)
Status: READY_FOR_REVIEW (06/11/2026)
Quyết định: [ADR-031](../quyết-định/ADR-031-nhac-va-bao-quen-cham-cong.md) D-135…D-139 · Feature: [FEATURE-072](../chức-năng/FEATURE-072.md) (US-072-4, AC-072-08…12) · BR-111
Module: MOD-SHIFT, MOD-AUTH, MOD-FINANCE · Màn hình: thanh trên máy quầy (dải nhắc), SCR-53 (hộp Chấm công / Đổi người, bàn phím PIN), SCR-52 (Giờ công của tôi), SCR-51 (Lương), SCR-20 (Tài khoản — chữ hướng dẫn)
Nguồn: chủ dự án 06/11/2026 — hỏi "nếu nhân viên quên chấm công thì sao", agent đề xuất 4 việc (xóa khóa PIN khi đặt lại, "Quên PIN?", nhắc ở máy quầy, báo quên chấm công); chủ dự án: "ok tiến hành đi". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-090-nhac-va-bao-quen-cham-cong` chồng lên `task/TASK-089-cham-cong-tinh-luong` (chưa gộp `main`) · Kế hoạch: [TASK-090-plan.md](../kế-hoạch/TASK-090-plan.md)

## Mục tiêu
Quên chấm công không làm mất giờ công một cách âm thầm: máy quầy nhắc khi còn kịp, nhân viên tự báo ngày quên hẳn để quản lý duyệt, người quên / bị khóa PIN tự đặt lại ngay ở màn chung — vẫn giữ nguyên tắc giờ chưa xác nhận thì không tự trả lương.

## Phạm vi
1. Migration 0050 (`MissedPunches` + trigger chặn xóa).
2. Máy chủ: `authGuardRepo.clear`, `authGuardService.clearFailures`; `pinService` (`setPinWithPassword`, `setPinAtKiosk`, `resetPin` xóa lần sai); `attendanceRepo` (báo quên); `attendanceService` (`reminders`, `reportMissed`, `resolveMissed`); `payrollService` (việc chờ `MISSED_PUNCH`, `missingDays`, báo cáo tuần); `domain/payroll.js` (`ISSUE_LABEL.MISSED_PUNCH`); `routes/payroll.js`; nhật ký thao tác `missed-punches`.
3. Giao diện: `pin-pad.js` ("Quên PIN?"), `staff-pin.js` (ô chưa có PIN chạm được, hộp đặt PIN ở màn chung), `pos-shell.js` (dải nhắc), `pos-me.js` (thẻ Quên chấm công?, hộp báo quên), `admin-payroll.js` (Duyệt… / Không duyệt), `admin-users.js` (chữ hướng dẫn PIN), CSS.
4. Test integration + E2E; tài liệu; skill `nhac-va-bao-quen-cham-cong` (+ sửa mục Quên PIN của skill `cham-cong-tinh-luong`).

## Không được sửa
Luật tính giờ / lương ADR-030 (`evaluate`, `payLine`), `sp_CloseShift`, quy tắc khóa đăng nhập / duyệt của F-071 (chỉ thêm việc xóa lần sai PIN), `AttendanceDisputes`.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

## Kết quả thực chạy (06/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **434/434 PASS** (45 file; thêm `attendance-missed.test.js` 4 test — AC-072-08…11) |
| `npm run test:e2e` | **66/66 PASS** (thêm E2E "nhắc & báo quên chấm công…" — AC-072-12; lần chạy đầu FAIL, xem lỗi (4)) |
| `npm run trace -- --check` | 167 US, 454 AC — PASS 454, GAP 0 |
| Chụp màn hình 1366 / 390 px (CafeQrTest) | Dải nhắc (máy quầy, trang Đơn hàng + trang thường), hộp Chấm công có ô chưa có PIN, hộp Đặt PIN ở màn chung, bàn phím có "Quên PIN?", thẻ Quên chấm công? + hộp báo quên trên điện thoại, việc chờ + hộp Duyệt báo quên ở trang Lương (cả 390 px): không cuộn ngang |
| `npm run lint`, `npm run format:check` | PASS |
| `npm run db:migrate` (CafeQrDev) | 0050 đã áp (chỉ thêm bảng `MissedPunches` + trigger); máy chủ thử nghiệm chạy lại ở `http://10.50.2.7:3000` |
| Lỗi tìm được khi làm | (1) Chạy test: câu SQL duyệt báo quên khai biến bảng chung dòng với biến thường → SQL Server báo lỗi cú pháp (500) — tách hai dòng `DECLARE`. (2) Khi viết test: thiết kế ban đầu đếm sai mật khẩu ở "đặt PIN tại màn chung" vào khóa PIN → người vừa bị khóa PIN không đặt lại được — đổi sang khóa đăng nhập (tên + máy). (3) Khi viết test: báo quên có giờ ra = giờ vào sẽ lọt kiểm tra cũ rồi vướng ràng buộc CSDL — thêm `assertSpan` (giờ ra phải sau giờ vào, 400). (4) E2E AC-072-12 lần đầu FAIL: vừa chấm vào xong dải nhắc vẫn còn tên người đó — giờ vào DATETIME2(0) làm tròn lên sau "bây giờ", điều kiện "giờ vào < bây giờ" bỏ sót → chỉ xét lần chấm công giao với khung lịch; integration AC-072-09 thêm bước giờ vào muộn hơn "bây giờ" 1 giây (đã thử: điều kiện cũ làm test này FAIL) |

Chưa có review G3 độc lập; chưa gộp `main` ở máy; chưa đẩy GitHub.
