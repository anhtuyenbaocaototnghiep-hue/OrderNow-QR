# ADR-061 — Lương: không tự làm cho mình, sửa giờ đã duyệt phải duyệt lại, giữ dấu vết lịch sử lương

- **Trạng thái:** ACCEPTED (17/11/2026).
- **Nguồn:** chủ dự án hỏi "BẠN CÓ THỂ GIẢI QUYẾT KHÔNG" sau danh sách lỗ hổng chấm công / lương đã thử thật, rồi duyệt: "TIẾN HÀNH LÀM CÁI LƯƠNG TRƯỚC ĐI".
- **Bổ sung:** [ADR-030](ADR-030-cham-cong-tinh-luong.md) (D-130…D-134), [ADR-029](ADR-029-chong-sua-du-lieu.md) D-119, [ADR-037](ADR-037-quyen-rieng-tung-tai-khoan.md) (quyền riêng từng tài khoản).
- **Bối cảnh:** rà mã và thử thật trên CSDL thử (17/11/2026) cho thấy các lỗ hổng sau.
  1. **Người được giao quyền "Lương" tự làm được cho chính mình.** Đây thường là quản lý cửa hàng, cũng có tên trong bảng lương. Người đó:
     - tăng lương giờ của mình, cộng thưởng cho mình;
     - duyệt giờ làm thêm, báo quên chấm công, báo sai của mình;
     - đánh dấu đã trả lương cho mình;
     - chia thưởng cho ca mình làm, đặt ngày lễ vào ngày mình làm.

     Việc này trái D-119 ("không tự sửa của mình") và trái cách sổ quỹ đã chặn (`SELF_APPROVAL`).
  2. **Quyết định cũ vẫn áp sau khi giờ bị sửa.** Chủ quán duyệt "Tính giờ thật" cho 20 phút làm thêm. Sau đó người khác sửa giờ ra dài thêm gần 4 giờ. Quyết định cũ vẫn áp nên lương tăng mà không ai duyệt.
  3. **Chủ quán không được báo** khi người khác đổi lương hay số tài khoản ngân hàng của nhân viên, hoặc khi mở lại bảng lương đã chốt.
  4. **Lịch sử lương không còn dấu vết đầy đủ:**
     - xóa khoản cộng / trừ là xóa cứng;
     - tạm ứng còn chờ duyệt không chặn việc chốt tháng, duyệt sau khi chốt thì không bị trừ ở tháng nào;
     - chốt lại thì ghi đè số đã chốt, mà "Đã xem" của nhân viên vẫn giữ dù số tiền đã đổi.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-241 | **Không ai, trừ chủ quán, làm việc lương cho chính mình** → `403 PAYROLL_SELF`. Các việc bị chặn khi làm cho mình: (1) sửa hồ sơ lương; (2) thêm / xóa khoản cộng – trừ; (3) quyết định trả lương cho lần chấm công; (4) duyệt / không duyệt báo quên chấm công; (5) xử lý báo sai; (6) đánh dấu đã trả lương; (7) chia thưởng chung cho ca mình có chấm công; (8) thêm / xóa ngày lễ vào ngày mình có chấm công. Làm cho người khác vẫn như cũ. Chủ quán làm được cho mình (như D-119). |
| D-242 | **Báo chủ quán** bằng cảnh báo `PAYROLL_CHANGE`: chỉ chủ quán xem, có email tức thì theo cài đặt cảnh báo. Báo khi người không phải chủ quán: (1) đổi hồ sơ lương của người khác — cách trả, lương giờ, lương tháng, phụ cấp tối, giờ tính tối, hệ số lễ, chuyên cần, ngân hàng, số tài khoản, tên chủ tài khoản (ghi cũ → mới); (2) mở lại bảng lương đã chốt (kèm lý do). |
| D-243 | **Sửa giờ đã duyệt thì phải duyệt lại.** Khi người không phải chủ quán đổi giờ vào / giờ ra của lần chấm công đang có quyết định "Tính giờ thật" (`ACTUAL`) hoặc "Tính theo lịch" (`SCHEDULE`), quyết định đó bị bỏ. Lần chấm công được tính lại như chưa duyệt: làm thêm, ngoài lịch, bị báo vắng → thành việc chờ chủ quán. Quyết định "Không tính" (`NONE`) giữ nguyên vì không làm tăng lương. Chủ quán tự sửa thì giữ quyết định. |
| D-244 | **Giữ dấu vết lịch sử lương.** (a) Xóa khoản cộng / trừ = ẩn đi, ghi người xóa và lúc xóa. CSDL chặn xóa cứng (`HISTORY_NO_DELETE`). Trang Lương hiện khoản đã xóa (gạch ngang). (b) Tạm ứng lương còn chờ duyệt, ghi trong tháng, là việc chờ `ADVANCE_PENDING`: chưa duyệt / từ chối ở Sổ quỹ thì chưa chốt được tháng đó. (c) Chốt lại sau khi mở lại thì lưu bản chốt trước vào lịch sử: từng dòng, tổng thực nhận, người chốt, lúc mở lại, người mở lại, lý do. Trang Lương có mục "Lịch sử chốt". Người có thực nhận đổi thì mất "Đã xem" (nhân viên xem lại phiếu). "Đã trả" giữ nguyên, kèm số tiền lúc đánh dấu trả; nếu thực nhận mới khác số đã trả, trang Lương hiện phần chênh. |

## Phương án đã cân nhắc

- **Thu quyền Lương về riêng chủ quán:** an toàn nhất, nhưng chủ quán đã chọn giao được quyền này ([ADR-037](ADR-037-quyen-rieng-tung-tai-khoan.md)). Giữ việc giao quyền, chỉ chặn phần làm cho chính mình.
- **Cấm người được giao sửa hồ sơ lương của người khác:** quá chặt, vì đó là việc của người được giao. Thay bằng báo chủ quán (D-242).
- **Bỏ mọi quyết định khi giờ bị sửa, kể cả "Không tính":** "Không tính" không làm tăng lương. Bỏ nó đi lại có thể biến một lần chấm công đã bị từ chối thành được trả, nên giữ.

## Hệ quả

- **Mã nguồn:**
  - `payrollService`: chặn cho mình, báo chủ quán, việc chờ tạm ứng, lịch sử chốt.
  - `attendanceService`: chặn cho mình ở `decide` / `resolveDispute` / `resolveMissed`; `update` bỏ quyết định khi giờ đổi.
  - `payrollRepo`: ẩn khoản cộng / trừ, lịch sử chốt, `PaidAmount`, bỏ "Đã xem" khi thực nhận đổi.
  - `alertService.onPayrollChange`.
  - `OWNER_ONLY_ALERTS` thêm `PAYROLL_CHANGE`.
  - `routes/payroll.js`: truyền người thao tác.
  - Trang Lương: khoản đã xóa, lịch sử chốt, chênh "đã trả", việc chờ tạm ứng có nút sang Sổ quỹ.
- **CSDL:** migration `0060_luong_khong_tu_duyet.sql`:
  - `PayrollAdjustments.DeletedAt` / `DeletedBy`, kèm trigger chặn xóa;
  - `PayrollLines.PaidAmount`;
  - bảng `PayrollRunVersions` (chặn xóa);
  - `Alerts.Kind` thêm `PAYROLL_CHANGE`.
- **Quy tắc:** BR-110 sửa: chốt lại giữ "Đã trả", còn "Đã xem" bỏ khi thực nhận đổi. Thêm BR-127.
- **Test:**
  - `payroll-guard.test.js` (AC-098-01…06);
  - `payroll.test.js` AC-073-05: sửa kỳ vọng "Đã xem" theo D-244;
  - kịch bản thử gian lận chạy lại phần lương.
