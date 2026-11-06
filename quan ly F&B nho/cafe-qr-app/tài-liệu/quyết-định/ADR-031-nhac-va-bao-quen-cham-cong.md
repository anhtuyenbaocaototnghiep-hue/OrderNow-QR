# ADR-031 — Quên PIN, nhắc chấm công, nhân viên báo quên chấm công

- **Trạng thái:** ACCEPTED (06/11/2026). Chủ dự án hỏi "nếu nhân viên quên chấm công thì sao", agent nêu cách đã có + hai chỗ thiếu (không nhắc lúc đang quên; quên hẳn thì nhân viên không tự báo được) + hai chỗ về PIN đang chờ (bị khóa sau khi đặt PIN mới; dòng "Quên PIN?"). Chủ dự án: "ok tiến hành đi".
- **Bối cảnh:** ADR-030 (F-072 / F-073) xử lý quên chấm **ra** (người đóng ca chấm ra hộ, tự đóng sau 14 giờ → việc chờ của quản lý) và cho nhân viên **báo sai** một lần chấm công đã có. Nhưng: (1) quên chấm **vào** chỉ được phát hiện sau — lịch ghi "Vắng" — không có ai nhắc khi còn kịp; (2) ngày quên hẳn thì không có dòng nào để bấm "Báo sai", nhân viên phải nói miệng; (3) người nhập sai PIN 5 lần bị khóa 15 phút **kể cả sau khi đặt PIN mới**; (4) bàn phím PIN không chỉ cách xử lý khi quên, và người chưa có PIN phải đăng xuất máy quầy để đăng nhập đặt PIN.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-135 | **Quên PIN / chưa có PIN — đặt ngay ở màn chung.** Ở hộp Chấm công / Đổi người, người chưa có PIN vẫn chạm được tên mình (ô viền đứt, "Chưa đặt PIN — chạm để đặt"); mọi bàn phím PIN có dòng **"Quên PIN? Đặt lại bằng mật khẩu đăng nhập"**. Người đó nhập **mật khẩu đăng nhập của mình** + PIN mới; máy quầy vẫn đứng tên người đang dùng (không phải đăng xuất). Sai mật khẩu ở đây **tính chung với đăng nhập sai** (10 lần / 15 phút cùng tên + cùng máy, F-071) — không thành đường dò mật khẩu thứ hai, và người vừa bị khóa PIN vẫn đặt lại được ngay. Không dùng cho tài khoản quản lý. **Đặt PIN mới (ở đâu cũng vậy) hoặc quản lý xóa PIN → xóa mọi lần sai PIN cũ của người đó** → hết bị khóa 15 phút. |
| D-136 | **Nhắc chấm công ở máy quầy** (chỉ chế độ màn chung): dải trên mọi trang quầy — "**X có lịch 08:00–14:00 nhưng chưa chấm vào ca**" khi đã qua giờ bắt đầu lịch **10 phút** (kịp chấm trước mốc đi trễ 15 phút) mà người đó không có lần chấm công nào giao với lịch; "**Y hết lịch lúc 14:00 nhưng chưa chấm ra**" khi đang làm, lịch gần nhất đã hết **15 phút** và không còn lịch nào đang chạy / bắt đầu trong 30 phút. Làm ngoài lịch thì không nhắc (không đoán được giờ về — đã có tự đóng 14 giờ và kiểm khi đóng ca). Nút **Mở Chấm công**, **Ẩn** (ẩn tới khi danh sách đổi). Tải lại mỗi phút và sau khi đóng hộp Chấm công. |
| D-137 | **Nhân viên báo quên chấm công**: trang Giờ công của tôi liệt kê **ngày có lịch đã qua mà không có lần chấm công nào** (đang tính vắng) với nút **Báo quên chấm công** (điền sẵn giờ lịch); nút chung cùng tên cho ngày không có lịch. Nhân viên ghi giờ vào + giờ ra thật + lý do → **việc chờ** ở trang Lương (theo tháng của giờ vào) → chưa xử lý thì **không chốt được lương**. Quản lý **Duyệt** (sửa giờ được, ghi chú tùy chọn) → app tạo một lần chấm công nguồn `MANUAL`, người sửa = người duyệt, lý do "Báo quên chấm công: …" — rồi luật tính giờ ADR-030 áp như mọi lần chấm công khác; hoặc **Không duyệt** (bắt buộc lý do, nhân viên thấy). Chỉ quản lý (chủ quán) duyệt. |
| D-138 | **Giới hạn báo quên**: trong **7 ngày** gần đây (cũ hơn → nói trực tiếp với quản lý, quản lý thêm tay ở Nhân sự); giờ ra sau giờ vào, không ở tương lai, không quá 24 giờ; không trùng lần chấm công đã có (`409 ATTENDANCE_OVERLAP` — dùng "Báo sai" trên lần đó) hay báo quên đang chờ (`409 MISSED_PUNCH_OPEN`); tháng đã chốt lương → `409 PAYROLL_LOCKED` (cả khi gửi lẫn khi duyệt). Quản lý không tự gửi (`403 MISSED_PUNCH_ADMIN`). Bị từ chối thì gửi lại được. |
| D-139 | **Lưu vết**: bảng `MissedPunches` (người gửi, giờ, lý do, trạng thái, người / lúc / cách xử lý, lần chấm công đã tạo) **không xóa được** (trigger như F-071); duyệt / không duyệt ghi nhật ký thao tác (`missed-punches.approve` / `.reject`). Báo cáo tuần cộng báo quên đang chờ vào cột "Chờ xử lý". |

## Phương án đã cân nhắc

- **Nhắc qua Zalo / tin nhắn điện thoại:** cần dịch vụ ngoài, số điện thoại nhân viên — chưa có. Dải ở máy quầy đủ vì quầy luôn có người.
- **Tự chấm vào theo lịch khi quên:** sai — người không đi làm cũng được tính giờ. Giữ nguyên tắc ADR-030: giờ chưa xác nhận thì không tự trả.
- **Cho trưởng ca duyệt báo quên:** trưởng ca đã thêm tay được trong ngày cho người khác (F-035); việc trả tiền do chủ quán quyết — giữ chỉ quản lý.
- **Đặt lại PIN bằng mã gửi qua email:** nhân viên quán ít dùng email; mật khẩu đăng nhập đã là bằng chứng đúng người.
- **Giữ khóa PIN sau khi đặt PIN mới:** khóa để chặn dò PIN cũ — PIN cũ đã bỏ thì khóa không còn tác dụng, chỉ làm người thật không chấm công được.

## Hệ quả

- Migration `0050_bao_quen_cham_cong.sql` (chỉ thêm). API mới: `POST /api/auth/pin/kiosk`, `GET /api/attendance/reminders`, `POST /api/me/missed-punches`, `POST /api/admin/missed-punches/{id}/approve | reject`; `GET /api/me/attendance` thêm `missingDays`, `missedPunches`, `missedPunchDays`; việc chờ mã `MISSED_PUNCH`.
- Mã lỗi `PIN_NOT_SET` nay chỉ cách đặt ở màn chung.
