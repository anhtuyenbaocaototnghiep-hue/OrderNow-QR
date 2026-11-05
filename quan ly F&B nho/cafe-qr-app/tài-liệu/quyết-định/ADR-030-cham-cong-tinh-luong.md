# ADR-030 — Chấm công nhiều người và tính lương từ chấm công

- **Trạng thái:** ACCEPTED (05/11/2026). Chủ dự án duyệt phương án chấm công: "bỏ cái chấm công bằng khuôn mặt còn nhiu bắt đầu làm xog làm ra file skill.md cho tôi". Bốn điểm chọn sẵn được giữ: màn chấm công chung thay chấm công theo đăng nhập; đến sớm không tính nếu chưa duyệt; tính theo phút; chưa bắt buộc người thứ hai duyệt hoàn tiền.
- **Bối cảnh:** F-035 chấm công bằng đăng nhập máy quầy — một máy chỉ một người đăng nhập, nên quầy nhiều người (thu ngân, pha chế, phục vụ) không ghi đúng giờ ai, thao tác tiền không biết ai làm khi dùng chung tài khoản. Lương đang khai tay ở Chi phí cố định (F-034). F-071 đã chặn tự sửa chấm công, khóa tạm khi dò mật khẩu.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-124 | **Cách chấm công** (`attendance.mode`): **màn chấm công chung** (mặc định, `KIOSK`) — nút "Chấm công" trên máy quầy, mỗi người chạm tên mình + PIN riêng → Vào ca / Ra ca; đăng nhập / đăng xuất **không** chấm công. Giữ chế độ cũ **theo đăng nhập** (`LOGIN`) cho quán một người / quầy. |
| D-125 | **PIN riêng** 4–6 chữ số: người đó tự đặt sau khi nhập mật khẩu đăng nhập (quản lý không biết PIN của ai, chỉ **xóa** được để người đó đặt lại); lưu bcrypt; không nhận dãy dễ đoán (0000, 1234…). Bàn phím số **đổi chỗ** mỗi lần mở. Sai 5 lần / 15 phút cùng người bị thử + cùng người đứng quầy → `429 PIN_LOCKED` + cảnh báo `AUTH_LOCK` (F-071). |
| D-126 | **Đổi người đứng máy**: người sắp đứng máy chạm tên + PIN → phiên mới đứng tên người đó (mọi thao tác ghi đúng người). Chỉ nhân viên / trưởng ca; quản lý đăng nhập bằng mật khẩu. |
| D-127 | **PIN cho thao tác tiền** (`security.money_pin`, mặc định bật): giảm giá tay, hoàn tiền, xóa món đã tiếp nhận / đã pha, ghi chi sổ quỹ, hủy / sửa khoản sổ quỹ, tự duyệt khoản chi bằng phiên của mình → người đang dùng phiên phải nhập **PIN của chính mình mỗi lần** (header `X-Actor-Pin`; máy quầy tự hiện bàn phím PIN rồi gửi lại). Quản lý (chủ quán) miễn. |
| D-128 | **Đóng ca**: hộp đóng ca liệt kê ai làm trong ca — người quên chấm ra thì người đóng ca **chấm ra hộ** (đánh dấu cần xem lại), đánh dấu **có mặt / không có mặt**; không đánh dấu được bản ghi của chính mình. Lần chấm công mở quá 14 giờ → tự đóng ở giờ vào + 8 giờ, cần xem lại. |
| D-129 | **Minh bạch hai chiều**: trang **Giờ công của tôi** (mỗi người chỉ thấy của mình): giờ chấm công, giờ được tính lương, ai sửa / vì sao (từ nhật ký thao tác), quyết định của quản lý, lương tạm tính, phiếu lương ("Đã xem"); **báo sai** một lần chấm công → việc chờ của quản lý. Quản lý có **Báo cáo tuần**: lịch vs giờ được tính, đi trễ, vắng, ai sửa tay bao nhiêu lần, % tiền lương / doanh thu theo ca. |
| D-130 | **Luật tính giờ** (theo phút, không làm tròn): có lịch → trả phần giao với lịch (đến sớm / về muộn không tính); dư ngoài lịch > 15 phút → **chờ duyệt làm thêm**; không có lịch (làm thay, đổi ca) → tính giờ thật nhưng **chờ xác nhận**; quên chấm ra / bị báo không có mặt / nhân viên báo sai → chờ. Quyết định chỉ quản lý: **giờ thật** / **theo lịch** / **không tính**. Đi trễ: vào sau giờ lịch quá 15 phút. Vắng: lịch đã qua mà không chấm công giao với lịch. Một lần chấm công thuộc tháng của giờ vào (giờ VN). |
| D-131 | **Hồ sơ lương** từng người: theo giờ hoặc theo tháng; phụ cấp ca tối mỗi giờ (từ giờ cài đặt, mặc định 18:00, tới 06:00); hệ số ngày lễ (mặc định 3 — hỏi kế toán); thưởng chuyên cần (cả tháng không trễ, không vắng); ngân hàng + số tài khoản + tên chủ tài khoản. Lương tháng quy ra giờ = ÷ 208 (26 ngày × 8 giờ) cho phụ trội lễ và chi phí theo ca. Ngày lễ do quản lý nhập theo năm. |
| D-132 | **Bảng lương tháng**: nháp tính trực tiếp từ chấm công + lịch + quyết định; **chốt** chỉ tháng đã hết và khi hết việc chờ → lưu ảnh chụp từng dòng, **khóa** sửa giờ công / quyết định / cộng trừ / báo sai của tháng (`409 PAYROLL_LOCKED`); **mở lại** phải có lý do (nhật ký); chốt lại giữ "đã trả" / "đã xem". Khoản **thưởng / khấu trừ** do quản lý nhập; **thưởng chung / tip của một ca** chia theo số phút được tính lương của từng người trong ca. |
| D-133 | **Tạm ứng lương**: danh mục sổ quỹ "Lương tạm ứng" (`SALARY_ADVANCE`) phải chọn **người nhận**, **luôn chờ duyệt**; không ai duyệt khoản ứng của chính mình (kể cả khi người khác ghi hộ). Khoản đã duyệt trừ vào lương tháng ghi khoản. **Lãi/lỗ**: có hồ sơ lương → trừ "Lương nhân viên" theo chấm công từng ngày, tạm ứng không còn là chi phí. |
| D-134 | **Trả lương**: app tự tạo **VietQR** (chuẩn công khai NAPAS, không phí) tới tài khoản từng người với số thực nhận + nội dung "LUONG MM YYYY TÊN"; nhắc chủ quán đối chiếu **tên chủ tài khoản** app ngân hàng hiện ra; hoặc tiền mặt. Đánh dấu đã trả. Phiếu lương in được. Không tính bảo hiểm / thuế (kế toán). |

## Phương án đã cân nhắc

- **Máy chấm công khuôn mặt:** chủ dự án bỏ (05/11/2026).
- **Bắt buộc người thứ hai duyệt hoàn tiền / xóa món của chính lượt mình thu:** chưa bắt buộc (chủ dự án duyệt) — đã có PIN mỗi lần + cảnh báo hoàn tiền lớn (F-060).
- **Làm tròn 15 phút:** không — tính theo phút cho công bằng, dễ đối chiếu.
- **Giữ chấm công theo đăng nhập làm mặc định:** sai với quầy nhiều người; vẫn giữ làm lựa chọn.
- **PIN do quản lý đặt:** quản lý biết PIN của mọi người → không phân biệt được ai làm. Chọn tự đặt sau mật khẩu.
- **Trả lương tự động qua API ngân hàng:** không có API cho hộ kinh doanh; VietQR + chủ quán tự chuyển.

## Hệ quả

- Migration `0049_cham_cong_tinh_luong.sql`: `Users.PinHash`; `Attendance` nguồn `KIOSK`, `NeedsReview`, `ClosedBy`, `CheckResult`, `PayDecision`…; `AuthFailures.Kind` thêm `PIN`; bảng `PayProfiles`, `Holidays`, `PayrollAdjustments`, `PayrollRuns`, `PayrollLines`, `AttendanceDisputes`; `CashTransactions.EmployeeId`; danh mục `SALARY_ADVANCE`; trigger chặn xóa `PayrollRuns`, `AttendanceDisputes`. Thủ tục `sp_CreateCashTxn` (`@EmployeeId`), `sp_VoidCashTxn` (giữ người nhận khi sửa).
- Máy chủ: `domain/payroll.js`, `domain/vietqr.js`, `auth/actorPin.js`, `pinService`, `payrollService`, `payrollRepo`, `routes/payroll.js`; `attendanceService` (chế độ, màn chung, đóng ca, quyết định, báo sai, khóa tháng), `userService.switchTo`, `cashService` / `billingService` / `voidService` / `refundService` (PIN), `pnlService` (lương), `/auth/me` (`attendance`).
- Giao diện: máy quầy (Chấm công, Đổi người, dải "chưa đặt PIN", bàn phím PIN, hỏi PIN thao tác tiền, đóng ca, tạm ứng chọn người nhận), trang mới **Giờ công của tôi** `/pos/me` (SCR-52), **Lương** `/admin/payroll` (SCR-51), Nhân sự (cách chấm công, Báo cáo tuần), Tài khoản (Xóa PIN), Lãi/lỗ (Lương nhân viên).
- Test cũ chạy với chế độ cũ (`attendance.mode = LOGIN`, `security.money_pin = false` trong DB test / E2E); test F-072 / F-073 tự bật mặc định mới.
- Feature: [FEATURE-072](../chức-năng/FEATURE-072.md), [FEATURE-073](../chức-năng/FEATURE-073.md). Task: [TASK-089](../công-việc/TASK-089.md). BR-109, BR-110.
