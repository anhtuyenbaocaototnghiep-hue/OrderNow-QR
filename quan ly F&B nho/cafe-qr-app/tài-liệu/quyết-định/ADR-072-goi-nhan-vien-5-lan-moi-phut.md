# ADR-072 — Gọi nhân viên: tối đa 5 lần trong 1 phút (thay "1 lần / 60 giây")

- **Trạng thái:** ACCEPTED (26/11/2026).
- **Chủ dự án yêu cầu (26/11/2026):** gửi ảnh hộp "Gọi nhân viên" (Xin nước lọc / Xin thêm đá / Xin khăn giấy / Dọn bàn) kèm "cái này được spam 5 lần thôi rồi sau đó chờ khoảng 1 phút".
- **Thay:** quy tắc chống spam của [FEATURE-021](../chức-năng/FEATURE-021.md) (ADR-005): "60 giây / phiên" — gọi một lần là phải chờ 60 giây mới gọi tiếp.
- **Bối cảnh:** khách thường xin vài thứ liền nhau (nước lọc, rồi thêm đá, rồi khăn giấy). Quy tắc cũ bắt chờ 60 giây giữa hai yêu cầu, nút trên điện thoại bị khóa đếm ngược ngay sau lần gọi đầu.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-265 | **Mỗi nhóm khách (phiên) gọi nhân viên tối đa 5 lần trong 60 giây gần nhất.**<ul><li>**Máy chủ:** lần gọi thứ 6 trong 60 giây → `429 TOO_SOON` kèm `retryAfter` = số giây tới khi lần gọi cũ nhất trong 5 lần đó qua đủ 60 giây ("chờ khoảng 1 phút" khi bấm liền tay). Đếm và ghi trong một câu lệnh có khóa như trước — hai máy cùng bàn bấm cùng lúc cũng không vượt 5.</li><li>**Điện thoại khách:** nút "Gọi nhân viên" không còn khóa sau mỗi lần gọi; chỉ khi máy chủ báo đủ 5 lần mới khóa và đếm ngược "Đã gọi nhân viên (gọi lại sau N giây)" đúng theo `retryAfter`. Dòng "Đã gọi nhân viên lúc … — nhân viên sẽ đến bàn ngay" vẫn hiện như cũ.</li><li>**Không đổi:** chỉ khách thuộc phiên mới gọi được (403); phiên đã đóng → 409; "Nhờ quầy chuyển bàn" (F-086) không tính vào 5 lần; quầy bấm "Đã xử lý" như cũ.</li></ul> |

## Phương án đã cân nhắc

- **5 lần rồi khóa cứng 60 giây tính từ lần thứ 5:** khách bấm rải rác vẫn có thể bị khóa lâu hơn cần thiết. Bỏ: đếm theo 60 giây gần nhất (cửa sổ trượt) — bấm liền 5 lần thì chờ gần đủ 1 phút, đúng ý chủ quán.
- **Đặt số lần / thời gian ở Cài đặt:** chủ quán đã nói rõ 5 lần / 1 phút; thêm ô cài đặt khi có nhu cầu.

## Hệ quả

- **Mã nguồn:** `staffCallService` (`CALL_LIMIT = 5`, `CALL_WINDOW_SEC = 60`), `staffCallsRepo.create` (đếm trong cửa sổ) + `recentForSession`; `call-staff.js`, `t-track.js` (nút chỉ khóa theo `retryAfter`).
- **Dữ liệu:** không đổi (bảng `StaffCalls`).
- **Vận hành:** phải khởi động lại máy chủ.
- **Tài liệu:** FEATURE-021 (quy tắc, AC-021-02 viết lại, AC-021-05), api-contract, screens-flows, tc-map.
