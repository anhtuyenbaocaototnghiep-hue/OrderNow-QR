# FEATURE-098 — Lương: không tự duyệt cho mình, duyệt lại khi sửa giờ, giữ lịch sử lương

> **Nguồn:** chủ dự án 17/11/2026, sau danh sách lỗ hổng chấm công / lương đã thử thật:
> - "BẠN CÓ THỂ GIẢI QUYẾT KHÔNG"
> - "TIẾN HÀNH LÀM CÁI LƯƠNG TRƯỚC ĐI"
>
> **Quyết định:** [ADR-061](../quyết-định/ADR-061-luong-khong-tu-duyet-cho-minh.md) D-241…D-244.
>
> **Nền:** [F-073](FEATURE-073.md) tính lương, [F-071](FEATURE-071.md) chống sửa dữ liệu, [F-079](FEATURE-079.md) quyền riêng từng tài khoản.

- **Status:** CONFIRMED (ADR-061) · Triển khai: [TASK-120](../công-việc/TASK-120.md)
- **Actor:**
  - **ACT-ADMIN** (chủ quán): nhận cảnh báo, làm được mọi việc.
  - **ACT-STORE** (quản lý cửa hàng được giao quyền Lương).
  - **ACT-STAFF / ACT-LEAD**: xem phiếu lương, bấm "Đã xem".
- **Màn hình:** **SCR-51** Lương (`/admin/payroll`); phiếu lương ở Giờ công của tôi (`/pos/me`).
- **Dữ liệu:** migration `0060_luong_khong_tu_duyet.sql`.

## User Story

- **US-098-1:** Là chủ quán, tôi muốn người được giao quyền Lương không tự duyệt hay tự tăng lương cho chính mình, giờ đã duyệt mà bị sửa thì phải duyệt lại, và mọi lần xóa hay chốt lại đều còn dấu vết, để giao việc lương mà không sợ bị gian lận.

## Quy tắc

1. **Không làm cho chính mình (D-241).** Người không phải chủ quán không được làm các việc sau cho chính mình → `403 PAYROLL_SELF`:
   - sửa hồ sơ lương của mình;
   - thêm / xóa khoản cộng – trừ của mình;
   - quyết định trả lương cho lần chấm công của mình;
   - duyệt / không duyệt báo quên chấm công của mình, xử lý báo sai của mình;
   - đánh dấu đã trả lương cho mình;
   - chia thưởng chung cho ca có mình;
   - thêm / xóa ngày lễ vào ngày mình có chấm công.

   Chủ quán vẫn làm được cho mình.
2. **Báo chủ quán (D-242)** bằng cảnh báo `PAYROLL_CHANGE` (chỉ chủ quán xem, email tức thì theo cài đặt) khi người không phải chủ quán:
   - đổi lương hoặc tài khoản ngân hàng trong hồ sơ lương của người khác (ghi cũ → mới);
   - mở lại bảng lương đã chốt (kèm lý do).
3. **Sửa giờ đã duyệt phải duyệt lại (D-243).** Người không phải chủ quán đổi giờ vào / ra của lần chấm công đã có quyết định "Tính giờ thật" hoặc "Tính theo lịch" thì quyết định bị bỏ, lần đó lại chờ chủ quán. "Không tính" giữ nguyên.
4. **Giữ dấu vết (D-244):**
   - xóa khoản cộng / trừ = ẩn, ghi người xóa và lúc xóa; CSDL chặn xóa cứng;
   - tạm ứng còn chờ duyệt trong tháng là việc chờ, chặn chốt;
   - chốt lại thì lưu bản chốt trước vào "Lịch sử chốt";
   - thực nhận đổi thì mất "Đã xem";
   - "Đã trả" giữ nguyên kèm số đã trả; số này khác thực nhận mới thì hiện phần chênh.

## Acceptance Criteria

- **AC-098-01:** Quản lý cửa hàng được giao quyền Lương làm các việc sau **cho chính mình** → mỗi việc `403 PAYROLL_SELF`, dữ liệu không đổi:
  - sửa hồ sơ lương;
  - thêm khoản cộng, xóa khoản trừ;
  - quyết định "Tính giờ thật";
  - duyệt báo quên chấm công;
  - xử lý báo sai;
  - đánh dấu đã trả lương;
  - chia thưởng chung cho ca có mình;
  - thêm ngày lễ vào ngày mình có chấm công.

  Làm cùng các việc đó cho người khác thì được. Chủ quán làm cho chính mình thì được.
- **AC-098-02:** Có cảnh báo `PAYROLL_CHANGE` (người không phải chủ quán không thấy) khi:
  - quản lý cửa hàng đổi lương giờ và số tài khoản của nhân viên → cảnh báo ghi cũ → mới;
  - quản lý cửa hàng mở lại bảng lương đã chốt → cảnh báo kèm lý do.

  Chủ quán tự làm thì không có cảnh báo.
- **AC-098-03:** Chủ quán duyệt "Tính giờ thật" cho lần chấm công có 20 phút làm thêm. Sau đó quản lý cửa hàng sửa giờ ra dài thêm → quyết định bị bỏ, lần đó lại có việc chờ `EXTRA`, lương tính như chưa duyệt. Hai trường hợp quyết định giữ nguyên khi sửa:
  - quyết định là "Không tính";
  - người sửa là chủ quán.
- **AC-098-04:** Xóa khoản cộng / trừ → khoản đó không còn trong bảng lương, nhưng nằm trong danh sách khoản đã xóa (người xóa, lúc xóa). Lệnh `DELETE` thẳng trên `PayrollAdjustments` bị CSDL chặn (`HISTORY_NO_DELETE`).
- **AC-098-05:** Tạm ứng lương còn chờ duyệt trong tháng → có việc chờ `ADVANCE_PENDING` và chốt bị chặn (`409 PAYROLL_PENDING`). Duyệt hoặc từ chối xong thì chốt được; khoản đã duyệt được trừ vào lương.
- **AC-098-06:** Mở lại rồi chốt lại:
  - bản chốt trước nằm trong "Lịch sử chốt" (lúc chốt, người chốt, lý do mở lại, tổng thực nhận, từng dòng);
  - người có thực nhận đổi thì mất "Đã xem", người không đổi thì giữ;
  - người đã trả giữ "Đã trả" kèm số đã trả, và thấy phần chênh;
  - `DELETE` thẳng trên `PayrollRunVersions` bị CSDL chặn.

## Bằng chứng

- **Integration:** `ứng-dụng/máy-chủ/tests/payroll-guard.test.js` (AC-098-01…06); `payroll.test.js` AC-073-05 (đổi kỳ vọng "Đã xem").
- **Thử gian lận:** kịch bản thử 49 tình huống (TASK-120), chạy lại phần lương.
