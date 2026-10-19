# 22. Chiến dịch theo nhóm khách (phân khúc)

> Quản lý chọn một **nhóm hội viên** theo điều kiện (ví dụ "khách Thân thiết đã 30 ngày chưa ghé"), soạn tin nhắn có **voucher riêng** cho từng người, rồi **xuất danh sách** (file CSV) để gửi qua Zalo / điện thoại, hoặc gửi qua Zalo OA nếu quán đã cấu hình. Sau đó xem được bao nhiêu người quay lại.

**Ai dùng:** chỉ quản lý. Trang: **Quản lý → Tích điểm, voucher & chiến dịch** → tab **Phân khúc & chiến dịch**.

## Bước 1 — Tạo phân khúc (nhóm khách)

Khung **Phân khúc** → **+ Thêm**:

1. **Tên phân khúc**.
2. Điều kiện (để trống ô nào là bỏ qua điều kiện đó; các điều kiện cộng dồn — khách phải thỏa **tất cả**):
   - **Hạng** (không chọn = mọi hạng);
   - **Chưa ghé ít nhất (ngày)** / **Có ghé trong (ngày)**;
   - **Số lượt ghé ≥** / **Số lượt ghé ≤**;
   - **Tổng chi ≥ (đ)**;
   - **Sinh nhật tháng (1–12)**;
   - **Điểm ≥**.
3. Bấm **Xem trước số người** → *"N hội viên (loại X người từ chối nhận tin; Y người vừa nhận tin trong 7 ngày sẽ bị bỏ qua)"* và vài ví dụ (tên, SĐT đã che).
4. **Lưu**.

Hội viên đã khóa, đã ẩn danh, hoặc **từ chối nhận tin** luôn bị loại.

## Bước 2 — Tạo chiến dịch

Khung **Chiến dịch** → **+ Tạo chiến dịch** (cần có ít nhất một phân khúc):

1. **Tên chiến dịch**, chọn **Phân khúc**.
2. **Kênh**:
   - **Xuất danh sách (CSV)** — mặc định, dùng được ngay;
   - **Zalo OA** — chỉ khi kỹ thuật đã cấu hình Zalo OA cho quán. Chưa cấu hình thì báo *"Chưa cấu hình Zalo OA (ZALO_OA_TOKEN) — dùng Xuất danh sách (CSV)"*.
3. **Nội dung**, dùng được các chỗ trống `{name}` (tên khách), `{voucher}` (mã voucher), `{expires}` (hạn dùng). Mặc định: *"Chào {name}! Quán tặng bạn mã {voucher}, dùng trước {expires}. Hẹn gặp lại!"*
4. Tick **Tặng mỗi người một voucher riêng** (mặc định có), **Giảm (%)** (mặc định 10), **Hạn (ngày)** (mặc định 14).
5. **Hẹn giờ chạy**: để trống = lưu nháp, bấm **Chạy ngay** sau; có giờ → máy tự chạy khi tới giờ (kiểm mỗi 5 phút).
6. **Lưu**.

## Bước 3 — Chạy và gửi

1. Bấm **Chạy ngay** trên chiến dịch (chạy luôn, **không hỏi lại**) → *"Đã chạy: N người nhận, bỏ qua M, lỗi K"*, cửa sổ kết quả tự mở.
2. Kênh CSV: bấm **Tải danh sách (CSV, có SĐT đầy đủ — được ghi nhật ký)** → file `chien-dich-<số>.csv` gồm Họ tên, SĐT, Hạng, Mã voucher, Hạn dùng, Nội dung. Mở bằng Excel rồi gửi tin cho từng khách.
3. Mỗi khách có voucher riêng mã **CD…**, dùng ở quầy như voucher thường (xem [mục 21](21-tích-điểm-tem-voucher-giới-thiệu.md)).

Một chiến dịch chỉ chạy **một lần**; đã chạy thì không sửa được nữa.

## Bước 4 — Xem kết quả

Bấm **Kết quả** trên chiến dịch đã chạy:

- 3 ô: **Voucher đã dùng** · **Doanh thu từ voucher** · **Quay lại trong 14 ngày** (số khách có thanh toán trong 14 ngày sau khi nhận tin).
- Bảng từng khách (tên, SĐT **đã che**): trạng thái **Trong file xuất** / **Đã gửi** / **Bỏ qua** / **Lỗi**; mã voucher có dấu ✔ nếu khách đã dùng.

## Quy tắc cần nhớ

- **Mỗi khách nhận tối đa 1 tin / 7 ngày.** Khách vừa nhận tin của chiến dịch khác trong 7 ngày → **Bỏ qua** ("Đã nhận tin trong 7 ngày gần đây"), không tạo voucher.
- **Khách từ chối nhận tin:** quản lý vào **Hội viên → Xem** → tick **Khách từ chối nhận tin chiến dịch (opt-out)** (lưu ngay). Khách đó không còn trong mọi phân khúc.
- **SĐT đầy đủ chỉ có trong file tải về**; màn hình luôn che. Mỗi lần tải file được ghi vào [Nhật ký thao tác](19-chấm-công-lịch-làm-nhật-ký.md).
- **SMS chưa hỗ trợ.**
- Phân khúc đang được chiến dịch dùng thì không xóa được.

*Kỹ thuật: [FEATURE-037](../tài-liệu/chức-năng/FEATURE-037.md).*
