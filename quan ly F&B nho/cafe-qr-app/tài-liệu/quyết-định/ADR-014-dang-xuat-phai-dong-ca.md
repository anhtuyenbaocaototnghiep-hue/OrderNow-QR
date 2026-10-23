# ADR-014 — Người mở ca phải đóng ca trước khi đăng xuất

- **Trạng thái:** ACCEPTED (23/10/2026). Chủ dự án chọn phương án trong phiên làm việc ngày 23/10/2026, trả lời câu hỏi trước khi code: "Người mở ca".
- **Bối cảnh:**
  - Chủ dự án yêu cầu ngày 23/10/2026: "khi đăng xuất bắt buộc phải đóng ca để có thể kiểm soát được".
  - Quầy chỉ có **một ca dùng chung** tại một thời điểm (F-018, `dbo.Shifts` — chỉ một dòng `ClosedAt IS NULL`); ca ghi người mở (`OpenedBy`). Mọi nhân viên thu tiền vào cùng ca; nhân viên nào cũng đóng được ca (`POST /api/shifts/{id}/close`, đếm tiền → chênh lệch).
  - Trước đây `POST /api/auth/logout` chỉ ghi giờ ra của chấm công (F-035) rồi trình duyệt xóa token — người đang giữ két có thể về mà không đếm tiền.
  - Ba cách hiểu đã đưa chủ dự án chọn: (1) người mở ca; (2) người cuối cùng còn trong giờ làm; (3) ai đăng xuất cũng phải đóng ca.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-59 | **Chỉ người mở ca đang chạy bị chặn đăng xuất** cho tới khi đếm tiền và đóng ca. Áp cho mọi vai (nhân viên, trưởng ca, quản lý) — ai mở ca thì người đó chịu trách nhiệm két. Người khác đăng xuất bình thường, ca vẫn chạy. <br>• Server: `POST /api/auth/logout` → `409 SHIFT_OPEN` (kèm `details.shiftId`), **không** ghi giờ ra chấm công. <br>• Giao diện: bấm Đăng xuất → hộp "Đóng ca trước khi đăng xuất" → trang **Ca & hoàn tiền** (`/pos/shift?then=logout`) tự mở hộp đóng ca; đóng xong (in được phiếu chốt ca) bấm **Đăng xuất**. Chọn "Ở lại" thì không rời trang. <br>• Ai ở lại bán tiếp thì mở ca mới (đếm tiền đầu ca) — mỗi ca một người chịu trách nhiệm. |

Chủ dự án **không chọn**:
- người cuối cùng còn trong giờ làm (theo chấm công) mới phải đóng ca;
- ai đăng xuất khi đang có ca mở cũng phải đóng ca.

## Giới hạn đã biết

- Đóng trình duyệt / tắt máy / token hết hạn (8 giờ) không đi qua nút Đăng xuất nên không chặn được; ca vẫn mở và hiện "Ca #… · từ …" cho người đăng nhập sau, như trước. Chấm công tự đóng theo job F-035.
- Đăng xuất khi mất mạng (không gọi được server) vẫn xóa phiên trên máy như trước — server không biết để chặn.
- **Còn khoản chi chờ duyệt** (sổ quỹ F-033): đóng ca bị từ chối (`CASH_PENDING`) cho tới khi trưởng ca / quản lý duyệt hoặc từ chối — người mở ca chưa đăng xuất được trong lúc đó. Lỗi `SHIFT_OPEN` trả `details.cashPending` và hộp nhắc nói rõ cần nhờ duyệt (review G3).
- **Chặn theo người, không theo máy**: quản lý mở ca ở quầy rồi đăng xuất trên điện thoại cũng bị yêu cầu đóng ca — đóng thì nhân viên đang bán phải mở ca mới. Muốn giữ ca chạy thì đừng đăng xuất trên máy khác (để phiên tự hết hạn), hoặc để nhân viên đứng quầy mở ca. Theo đúng D-59 (người mở ca chịu trách nhiệm két).

## Hệ quả

- Không migration, không đổi quyền. API: `POST /api/auth/logout` thêm lỗi `409 SHIFT_OPEN`.
- Sửa: `routes/finance.js`, `services/shiftService.js`; giao diện `js/auth.js`, `js/pages/pos-shift.js`, `js/ui.js` (`confirmDialog` thêm `cancelLabel`).
- Feature: [FEATURE-054](../chức-năng/FEATURE-054.md) — [TASK-068](../công-việc/TASK-068.md). Business rule: BR-086. Use case: UC-11.
