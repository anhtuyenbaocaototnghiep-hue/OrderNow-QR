# ADR-024 — Vòng quay may mắn sau thanh toán; "Ra món khi bạn bè tới"

- **Trạng thái:** ACCEPTED (03/11/2026). Chủ dự án chọn hai ý trong danh sách ý tưởng QR: "Vòng quay may mắn sau khi thanh toán" và "Ra món khi bạn bè tới" — "tiến hành làm cái này rồi làm ra thành file skill.md".
- **Bối cảnh:**
  - **Vòng quay:** quán nhỏ cần lý do để khách quay lại. App đã có voucher (F-038: mã, % / số tiền, hạn, gắn hội viên hoặc mã tự do) và tích điểm (F-039).
  - **Ra món khi bạn tới:** nhóm bạn đến lệch giờ. Người đến trước muốn gọi luôn cho cả nhóm, nhưng món làm ngay sẽ nguội / tan đá. Đơn dine-in hiện vào thẳng cột "Chờ xác nhận" ở quầy.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-89 | **Ai được quay:** mỗi **lượt thu** (một dòng `Payments`) từ `spin.min_amount` (mặc định 30.000đ) có **một** lượt quay, trong `spin.expire_hours` (24) giờ kể từ lúc thu. Lượt thu đã có hoàn tiền thì không quay được. Mã quay 32 ký tự ngẫu nhiên (không đoán được), tạo khi in hóa đơn hoặc khi khách mở màn cảm ơn. QR in ở **hóa đơn chính thức** (tại bàn, mang đi, từng phần chia bill); điện thoại khách tại bàn thấy nút quay ngay trên màn cảm ơn. |
| D-90 | **Kết quả do máy chủ quyết định** (ngẫu nhiên an toàn theo trọng số các ô); màn quay chỉ diễn hoạt cho tới ô đã chọn. **Ngân sách:** tối đa `spin.daily_win_cap` (20) lượt **trúng** mỗi ngày (giờ quán); hết thì lượt quay ra ô "Chúc may mắn lần sau". Đếm + ghi trong một transaction có khóa (`sp_SpinLucky`) — hai người quay cùng lúc không vượt ngân sách. |
| D-91 | **Phần quà:** voucher giảm % (có trần tiền giảm), voucher giảm số tiền, cộng điểm (chỉ khi lượt thu có hội viên — không có thì các ô điểm không hiện trên vòng), không trúng. Voucher: nguồn `GAME`, hạn `spin.voucher_days` (14) ngày, gắn hội viên nếu lượt thu có hội viên, không thì là mã tự do dùng một lần; không dùng được cho chính lượt thu đã quay. Điểm ghi sổ `PointTransactions` loại ADJUST (ghi chú "Vòng quay may mắn"). |
| D-92 | **Bật / tắt và cấu hình:** mặc định **tắt**. Quản lý bật, sửa ô quà (2–8 ô, phải có ít nhất một ô "Chúc may mắn" — không có quà, tổng trọng số > 0) ở **Khách hàng → Tích điểm & voucher → Vòng quay may mắn**; xem số lượt quay / trúng / voucher đã dùng. |
| D-93 | **Ra món khi bạn tới:** khi gửi đơn tại bàn, khách chọn **Làm ngay** (mặc định) / **Sau 10 phút** / **Sau 20 phút** / **Khi bạn tới**. Đơn vẫn `PENDING`, giữ kho như đơn thường (`HoldMode`, `HoldUntil`, `ReleasedAt` trên `Orders`). "Khi bạn tới" giữ tối đa 45 phút. |
| D-94 | **Quầy:** đơn đang giữ nằm cuối cột "Chờ xác nhận" với nhãn "Làm lúc 14:35" / "Chờ bạn tới · tối đa 15:20", **không kêu chuông lúc gửi**; tới giờ thì thành đơn chờ bình thường và kêu chuông; đồng hồ chờ tính từ lúc tới giờ. Bất kỳ điện thoại trong phiên bấm **"Bạn đã tới — làm món"** → báo quầy ngay (`order.released`). Quá 45 phút chưa báo → hiện như đơn chờ, nhãn "Hết giờ giữ — hỏi bàn trước khi làm". Nhân viên bấm Tiếp nhận đơn đang giữ = làm luôn. Đơn đang giữ không vào hàng chờ ước tính thời gian (F-025). Thu tiền bàn còn đơn đang giữ bị chặn như đơn chờ khác (`HAS_PENDING_ORDERS`). |

## Không chọn

- Quyết định kết quả ở trình duyệt: khách sửa được mã để luôn trúng.
- Ngân sách tính bằng tiền: voucher % không biết trước số tiền giảm; đếm số lượt trúng dễ hiểu và đủ kiểm soát cho quán nhỏ.
- Mỗi đơn một lượt quay: chia bill / thu chung làm đơn và lượt thu lệch nhau — lượt thu là thứ khách cầm hóa đơn.
- Giữ từng món riêng trong một đơn: đơn đang hoàn tất theo cả đơn (ADR-003 Q-006); khách tách thành đơn riêng cho người đến sau.
- Tự hủy đơn giữ quá hạn: món đã giữ kho, khách có thể vẫn đến — nhân viên hỏi bàn rồi quyết định.
- Cho nhân viên đặt giờ ra món ở "Gọi món tại bàn": đơn nhân viên nhập vào thẳng "Đang chuẩn bị" (F-024); để sau nếu cần.

## Hệ quả

- Migration `0043`: `Orders.HoldMode / HoldUntil / ReleasedAt`; `Vouchers.Source` thêm `GAME`; bảng `SpinPrizes` (4 ô mặc định), `LuckySpins`. SP mới `sp_SpinLucky`; `sp_SubmitOrder` thêm `@HoldMode`, `@HoldMinutes`.
- API mới: `POST /api/orders/{id}/release`, `GET /api/sessions/{id}/lucky-spins`, `GET /api/lucky-spins/{token}`, `POST /api/lucky-spins/{token}/spin`, `GET / PUT /api/admin/lucky-spin`. `POST /api/orders` nhận `hold`. Hóa đơn trả thêm `luckySpin`. Trang khách mới `/quay/{token}` (SCR-49).
- Feature: [FEATURE-065](../chức-năng/FEATURE-065.md) (vòng quay), [FEATURE-066](../chức-năng/FEATURE-066.md) (ra món khi bạn tới). Task: [TASK-083](../công-việc/TASK-083.md). BR-102, BR-103.
