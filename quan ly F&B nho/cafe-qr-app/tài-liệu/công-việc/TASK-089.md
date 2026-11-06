# TASK-089 — Chấm công nhiều người + tính lương
Status: READY_FOR_REVIEW (05/11/2026)
Quyết định: [ADR-030](../quyết-định/ADR-030-cham-cong-tinh-luong.md) D-124…D-134 · Feature: [FEATURE-072](../chức-năng/FEATURE-072.md), [FEATURE-073](../chức-năng/FEATURE-073.md) · BR-109, BR-110
Module: MOD-SHIFT, MOD-AUTH, MOD-FINANCE, MOD-BILLING · Màn hình: SCR-10…SCR-17 (thanh trên máy quầy), SCR-15 (Ca), SCR-37 (Nhân sự), SCR-20 (Tài khoản), SCR-51 (Lương — mới), SCR-52 (Giờ công của tôi — mới), SCR-53 (hộp Chấm công — mới), Lãi/lỗ
Nguồn: chủ dự án 05/11/2026 — duyệt phương án chấm công: "bỏ cái chấm công bằng khuôn mặt còn nhiu bắt đầu làm xog làm ra file skill.md cho tôi". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-089-cham-cong-tinh-luong` chồng lên `task/TASK-088-chong-sua-du-lieu` (chưa gộp `main`) · Kế hoạch: [TASK-089-plan.md](../kế-hoạch/TASK-089-plan.md)

## Mục tiêu
Quầy nhiều người chấm công đúng người bằng màn chung + PIN riêng; mọi thao tác tiền ghi đúng người; cuối tháng app tự ra bảng lương theo luật rõ ràng, chủ quán xử lý việc chờ, chốt, trả bằng VietQR; nhân viên tự xem giờ công / phiếu lương; Lãi/lỗ dùng lương thật.

## Phạm vi
1. Migration 0049 + sửa `sp_CreateCashTxn`, `sp_VoidCashTxn` (người nhận tạm ứng).
2. Máy chủ: `domain/payroll.js`, `domain/vietqr.js`, `auth/actorPin.js`, `pinService`, `payrollRepo`, `payrollService`, `routes/payroll.js`; sửa `attendanceService`, `userService`, `cashService`, `billingService`, `voidService`, `refundService`, `pnlRepo`, `pnlService`, `attendanceRepo`, `usersRepo`, `cashRepo`, `/auth/me`, đóng ca.
3. Giao diện: bàn phím PIN, hỏi PIN trong `api.js`, nút Chấm công / Đổi người / dải đặt PIN, đóng ca, tạm ứng chọn người nhận, trang Giờ công của tôi, trang Lương, Nhân sự (cách chấm công, báo cáo tuần), Tài khoản (Xóa PIN), Lãi/lỗ.
4. Test integration + E2E + a11y; tài liệu; skill `cham-cong-tinh-luong`.

## Không được sửa
`sp_CloseShift`, `sp_SubmitOrder`, `sp_SettleSession`, quy tắc duyệt hiện có (D-14, D-15, D-23, D-24, D-33); F-071 giữ nguyên (chỉ thêm loại khóa `PIN`).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

## Kết quả thực chạy (05/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **430/430 PASS** (44 file; thêm `attendance-kiosk.test.js` 6 test — AC-072-01…06, `payroll.test.js` 8 test — AC-073-01…08 với kịch bản tháng trước tính tay từng đồng; test cũ chạy chế độ cũ, sửa 2 test dùng "Lương tạm ứng" làm khoản chi lớn để ghi người nhận) |
| `npm run test:e2e` | **65/65 PASS** (thêm E2E "chấm công nhiều người + lương…" — AC-072-07, AC-073-09: đặt PIN từ dải nhắc, màn Chấm công, chi tiền hỏi PIN (sai → nhập lại), Đổi người, Giờ công của tôi, trang Lương nhập hồ sơ; a11y quét thêm `/pos/me`, `/admin/payroll`) |
| `npm run trace -- --check` | 166 US, 449 AC — PASS 449, GAP 0 |
| Chụp màn hình 1366 / 390 px (CafeQrTest) | Hộp Chấm công, bàn phím PIN, hộp đóng ca, trang Lương, Báo cáo tuần, Giờ công của tôi trên điện thoại: không cuộn ngang. Đã sửa theo ảnh: ô "Có mặt" trong hộp đóng ca bị cắt chữ (bảng → danh sách xuống dòng được); bảng chấm công ở Giờ công của tôi bị khuất cột trên điện thoại (bảng → khối từng ngày); việc chờ của người chưa có hồ sơ lương thiếu ngày giờ; ô nhập thưởng / ngày lễ kéo dài hết chiều ngang |
| `npm run lint`, `npm run format:check` | PASS |
| Lỗi tìm được khi chạy test | Người vừa chấm vào trong cùng giây không có trong danh sách đóng ca (giờ DATETIME2(0) làm tròn lên quá "bây giờ") → ca đang mở lấy mọi lần chấm công từ lúc mở ca |

| Sửa sau bàn giao (06/11/2026) | DEF-020: trang Tài khoản thêm cột **PIN** (Đã đặt / Chưa đặt / Không cần) + hướng dẫn đặt / đổi / quên PIN — chủ dự án không thấy chỗ đổi PIN vì chưa ai đặt. E2E 65/65 (thêm bước Tài khoản ghi "Đã đặt"), trace 449/449 |

Chưa có review G3 độc lập; chưa gộp `main` ở máy. Đã đẩy lên GitHub theo yêu cầu chủ dự án (05/11/2026, `72463af`).
