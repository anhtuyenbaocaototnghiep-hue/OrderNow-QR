# FEATURE-073 — Tính lương từ chấm công

> **Nguồn:** chủ dự án 05/11/2026 (duyệt phương án chấm công + tính lương). Quyết định: [ADR-030](../quyết-định/ADR-030-cham-cong-tinh-luong.md) D-129…D-134.

- **Status:** CONFIRMED (ADR-030) · Triển khai: [TASK-089](../công-việc/TASK-089.md)
- **Actor:** **ACT-ADMIN** (hồ sơ lương, ngày lễ, quyết định giờ, thưởng / khấu trừ, chốt / mở lại, trả lương); **ACT-STAFF / ACT-LEAD** (xem giờ công + lương của mình, báo sai, "Đã xem" phiếu lương, ghi tạm ứng ở sổ quỹ).
- **Màn hình:** **Lương** `/admin/payroll` (SCR-51); **Giờ công của tôi** `/pos/me` (SCR-52); **Sổ quỹ** (tạm ứng chọn người nhận); **Lãi/lỗ** (dòng "Lương nhân viên").
- **Dữ liệu:** `PayProfiles`, `Holidays`, `PayrollAdjustments`, `PayrollRuns`, `PayrollLines`, `AttendanceDisputes`, `CashTransactions.EmployeeId`, danh mục `SALARY_ADVANCE`.

## User Story

- **US-073-1:** Là chủ quán, tôi muốn app tự tính lương tháng từ giờ chấm công thật theo luật rõ ràng và chỉ chốt khi đã xử lý hết việc chờ, để không phải tính tay và không trả thừa / thiếu.
- **US-073-2:** Là nhân viên, tôi muốn xem giờ công, ai sửa vì sao, lương tạm tính, phiếu lương của mình và báo sai ngay trong tháng, để cuối tháng không phải thắc mắc.
- **US-073-3:** Là chủ quán, tôi muốn tạm ứng có người nhận và không ai tự duyệt, trả lương bằng VietQR có đối chiếu tên, và thấy lương thật trong Lãi/lỗ, để tiền lương không bị lợi dụng hay tính hai lần.

## Quy tắc (BR-110)

1. Hồ sơ lương: theo giờ (> 0) hoặc theo tháng (> 0); phụ cấp tối mỗi giờ từ `NightStart` tới 06:00; hệ số lễ 1–5 (mặc định 3); chuyên cần khi cả tháng không trễ, không vắng; số tài khoản phải có ngân hàng trong danh sách.
2. Dòng lương = lương (giờ được tính × lương giờ, hoặc lương tháng) + phụ cấp tối + phụ trội lễ (giờ lễ × lương giờ quy đổi × (hệ số − 1)) + chuyên cần + cộng / trừ − tạm ứng đã duyệt. Làm tròn đồng từng khoản.
3. Việc chờ (EXTRA, OFF_SCHEDULE, AUTO_CLOSED, DISPUTED, EMPLOYEE_DISPUTE, OPEN, chưa có hồ sơ) → `409 PAYROLL_PENDING` khi chốt; tháng chưa hết → `409 MONTH_NOT_ENDED`.
4. Đã chốt: sửa giờ công / quyết định / cộng trừ / báo sai của tháng → `409 PAYROLL_LOCKED`; mở lại cần lý do; chốt lại giữ đã trả / đã xem.
5. Tạm ứng (`SALARY_ADVANCE`): thiếu người nhận → 400; luôn chờ duyệt; người nhận không tự duyệt (`403 SELF_APPROVAL`, trừ quản lý).
6. VietQR trả lương: thiếu ngân hàng / số tài khoản → `409 NO_BANK_ACCOUNT`; thực nhận ≤ 0 → `409 NOTHING_TO_PAY`; đánh dấu đã trả một lần (`409 PAY_NOT_ALLOWED`).
7. Thưởng chung một ca chia theo phút được tính lương trong ca; tổng chia đúng số tiền.
8. Lãi/lỗ khi có hồ sơ lương: trừ "Lương nhân viên" theo ngày (giờ được tính + phụ cấp; lương tháng chia đều theo ngày); tạm ứng không là chi phí.

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `GET /api/admin/payroll?month=YYYY-MM` | ADMIN | `{ month, status: DRAFT \| LOCKED, run, monthEnded, lines, pending, totals, adjustments }` |
| `POST /api/admin/payroll/{month}/lock` · `/reopen` | ADMIN | Chốt / mở lại (`{ reason }`) |
| `POST /api/admin/payroll/{month}/adjustments` · `DELETE /api/admin/payroll/adjustments/{id}` | ADMIN | Thưởng (+) / khấu trừ (−) |
| `POST /api/admin/payroll/team-bonus` | ADMIN | `{ shiftId, amount, reason }` → `{ month, shares }` |
| `GET /api/admin/payroll/{month}/lines/{userId}/qr` | ADMIN | `{ amount, bankName, bankAccount, accountName, content, payload, qr }` |
| `POST /api/admin/payroll/{month}/lines/{userId}/paid` | ADMIN | `{ method: CASH \| TRANSFER }` |
| `GET /api/admin/pay-profiles` · `PUT /api/admin/pay-profiles/{userId}` | ADMIN | Hồ sơ lương + danh sách ngân hàng |
| `GET /api/admin/holidays?year=` · `PUT` · `DELETE /api/admin/holidays/{date}` | ADMIN | Ngày lễ |
| `POST /api/admin/attendance/{id}/decision` | ADMIN | `{ decision: ACTUAL \| SCHEDULE \| NONE \| null, note }` |
| `GET /api/admin/attendance-disputes?month=` · `POST …/{id}/resolve` | ADMIN | Báo sai của nhân viên |
| `GET /api/me/attendance?month=` | Nhân viên | Của chính mình: `{ records, pay, disputes, payslipMonths }` |
| `POST /api/me/attendance/{id}/dispute` · `POST /api/me/payslips/{month}/ack` | Nhân viên | Báo sai · "Đã xem" phiếu lương |
| `POST /api/cash-transactions` | Nhân viên | Thêm `employeeId` (bắt buộc với "Lương tạm ứng") |
| `GET /api/admin/reports/pnl` | ADMIN | Thêm `laborCosts`, `payrollActive` |

## Acceptance Criteria

- AC-073-01: (unit) VietQR đúng chuẩn (trường, CRC-16, mã cố định / một lần, số tài khoản sai → lỗi); nội dung không dấu ≤ 25 ký tự; dòng lương theo giờ (lương, đêm, lễ, chuyên cần, cộng / trừ, tạm ứng) và theo tháng.
- AC-073-02: Hồ sơ lương kiểm số liệu và ngân hàng; ngày lễ; nhân viên / trưởng ca 403 với bảng lương và hồ sơ.
- AC-073-03: Bảng lương nháp đúng từng đồng theo lịch / sớm / trễ / làm thêm / ngoài lịch / vắng / lễ / đêm / cộng trừ; còn việc chờ → 409 PAYROLL_PENDING; tháng chưa hết → 409; quyết định chỉ quản lý.
- AC-073-04: Nhân viên xem giờ công của mình (giờ được tính, lịch, quyết định, ai sửa vì sao, lương tạm tính), không thấy của người khác; báo sai → việc chờ của quản lý; gửi trùng 409; quản lý xử lý.
- AC-073-05: Chốt → lưu dòng, khóa sửa giờ công / quyết định / cộng trừ / báo sai (409 PAYROLL_LOCKED); "Đã xem" phiếu lương; mở lại cần lý do; chốt lại giữ đã trả / đã xem.
- AC-073-06: VietQR trả lương: thiếu tài khoản 409; mã đúng ngân hàng, số tài khoản, số tiền, nội dung, CRC; đánh dấu đã chuyển khoản.
- AC-073-07: Tạm ứng: thiếu người nhận 400; luôn chờ duyệt; người nhận tự duyệt 403 SELF_APPROVAL; người khác duyệt → trừ vào lương tháng.
- AC-073-08: Thưởng chung chia theo phút trong ca; báo cáo tuần (lịch vs giờ được tính, sửa tay theo ngày sửa, % lương / doanh thu theo ca); Lãi/lỗ có "Lương nhân viên", tạm ứng không là chi phí.
- AC-073-09: Trên trình duyệt: quản lý chọn tháng ở trang Lương, thấy việc chờ "Chưa có hồ sơ lương" của người vừa chấm công, nhập hồ sơ lương → người đó vào bảng lương.

## Bằng chứng

`tests/payroll.test.js` (AC-073-01…08) · E2E "chấm công nhiều người + lương…" (AC-073-09).
