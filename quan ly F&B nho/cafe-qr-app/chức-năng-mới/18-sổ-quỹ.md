# 18. Sổ quỹ (chi tiền / thu khác ngoài bán hàng)

> Ghi lại mọi lần **lấy tiền trong két ra** (mua đá, trả shipper, tạm ứng lương…) hoặc **bỏ tiền vào két** không phải tiền bán hàng (chủ quán bổ sung tiền lẻ…). Khoản nào cũng có danh mục, lý do, có thể kèm ảnh hóa đơn. Khoản chi lớn phải chờ trưởng ca / quản lý duyệt. Cuối ca, **tiền dự kiến trong két đã tính cả sổ quỹ**, nên đếm két khớp.

**Ai dùng:**

- **Nhân viên, trưởng ca, quản lý:** ghi khoản ở **Quầy → Ca & hoàn tiền**.
- **Trưởng ca** (khoản ≤ 2.000.000đ) và **quản lý:** duyệt / từ chối.
- **Quản lý:** xem sổ quỹ nhiều ngày, xuất CSV, quản lý danh mục ở **Quản lý → Sổ quỹ**.

## Ghi một khoản chi / thu

Phải **đang có ca mở** (xem [Chốt ca](06-chốt-ca.md)).

1. **Ca & hoàn tiền** → thẻ **Sổ quỹ trong ca** → bấm **Chi tiền** (hoặc **Thu khác**).
2. Hộp **Chi tiền từ két** (hoặc **Thu khác vào két**):
   - **Danh mục**: chọn trong danh sách. Danh mục luôn cần duyệt có chữ "(cần duyệt)", ví dụ "Khác (chi) (cần duyệt)";
   - **Số tiền**;
   - **Nội dung / lý do (bắt buộc)**, ví dụ "mua 2 bao đá";
   - (chỉ khi chi) **Ảnh hóa đơn (không bắt buộc, ≤ 2 MB)**: chụp / chọn ảnh jpg, png hoặc webp.
3. Bấm **Ghi khoản chi** (hoặc **Ghi khoản thu**):
   - khoản được duyệt ngay → *"Đã ghi 50.000đ"*, két trừ ngay;
   - khoản phải chờ duyệt → *"Đã ghi … — chờ duyệt"*, **chưa trừ vào két**.

**Danh mục có sẵn:**

| Loại | Danh mục |
| --- | --- |
| Chi | Mua đá · Điện nước · Trả shipper · Lương tạm ứng · Mua vật tư nhỏ · Nộp tiền về két tổng (không tính là chi phí) · Khác (chi) — **luôn cần duyệt** |
| Thu | Bổ sung tiền lẻ · Thu khác |

**Khi nào phải chờ duyệt:** khoản chi **lớn hơn 500.000đ**, hoặc thuộc danh mục **luôn cần duyệt**. Khoản **thu** luôn được duyệt ngay.

## Bảng khoản trong ca

Thẻ **Sổ quỹ trong ca** liệt kê: Giờ · Loại (Thu / Chi) · Danh mục · Nội dung · Số tiền · Trạng thái (**Chờ duyệt** / **Đã duyệt** / **Từ chối**) · Người ghi. Có khoản chờ thì góc thẻ hiện nhãn cam "N chờ duyệt".

Nút trên từng dòng:

- **🧾 Ảnh**: xem ảnh hóa đơn đã gắn.
- **Gắn ảnh**: gắn ảnh cho khoản chi chưa có ảnh (người ghi khoản hoặc trưởng ca / quản lý).
- **Duyệt** / **Từ chối**: cho khoản đang chờ.

Phía trên trang có thêm ô **Thu khác (sổ quỹ)** và **Chi quỹ (đã duyệt)**, ô **Tiền dự kiến trong két** đã tính cả hai.

## Duyệt / từ chối

Bấm **Duyệt** (hoặc **Từ chối**) trên dòng → hộp **Duyệt khoản chi …**:

- **Trưởng ca / quản lý duyệt khoản của người khác:** bấm **Duyệt chi** là xong. Khoản vượt mức của trưởng ca (> 2.000.000đ) thì tick **Người khác duyệt (nhập tài khoản)** để quản lý nhập tài khoản.
- **Nhân viên đứng máy**, hoặc **trưởng ca duyệt khoản do chính mình ghi:** hộp hiện sẵn *"Người duyệt nhập tài khoản:"* → trưởng ca / quản lý khác nhập **Tên đăng nhập** và **Mật khẩu**.
- **Từ chối** bắt buộc nhập **Lý do từ chối**. Khoản bị từ chối không trừ vào két.

**Không ai tự duyệt khoản chi mình ghi**, trừ quản lý: *"Không tự duyệt khoản chi do chính mình tạo — nhờ trưởng ca / quản lý khác"*. Hai người cùng bấm duyệt một khoản thì người sau nhận *"Khoản này đã được duyệt / từ chối"*.

## Đóng ca

- **Tiền dự kiến trong két** = tiền đầu ca + đã thu − đã hoàn + **thu khác (đã duyệt)** − **chi quỹ (đã duyệt)**.
- **Còn khoản chờ duyệt thì chưa đóng ca được.** Hộp Đóng ca hiện khung vàng *"Còn N khoản chi chờ duyệt — duyệt hoặc từ chối trước khi đóng ca."*. Duyệt / từ chối hết rồi đóng.
- **Phiếu chốt ca** in kèm bảng sổ quỹ trong ca.
- Ca đã đóng thì không ghi thêm khoản vào ca đó được.

## Quản lý: trang Sổ quỹ

**Quản lý → Sổ quỹ** (nhóm Tài chính & nhân sự):

1. Lọc **Từ ngày / Đến ngày**, **Loại** (Tất cả / Chi / Thu), **Danh mục**, **Trạng thái**. Đổi bộ lọc là bảng tự cập nhật.
2. Ô số: **Thu khác (đã duyệt)** · **Chi quỹ (đã duyệt)** · **Ròng** · **Chờ duyệt** (tô đỏ khi còn khoản chờ).
3. Thẻ **Theo danh mục**: tổng các khoản đã duyệt. Danh mục có nhãn "chi phí" được tính vào [Lãi / lỗ](20-lãi-lỗ.md).
4. Thẻ **Các khoản**: cùng bảng như ở quầy. Khoản chờ duyệt chỉ duyệt / từ chối được **khi ca của khoản đó còn mở**.
5. Nút **Xuất CSV**: tải file `so-quy_<từ>_<đến>.csv` đúng theo bộ lọc, mở được bằng Excel.

### Tab Danh mục thu chi

- **+ Thêm danh mục** → **Tên danh mục**, **Loại** (Chi / Thu), tick **Tính vào chi phí (lãi/lỗ)**, tick **Luôn cần duyệt**, **Thứ tự** → **Lưu**.
- Công tắc **Đang dùng** để tạm ẩn danh mục.
- **Xóa** danh mục đã từng dùng → chỉ chuyển thành ngừng dùng, lịch sử vẫn giữ.

## Quy tắc cần nhớ

- Ảnh hóa đơn: chỉ **jpg / png / webp**, tối đa **2 MB**. Ảnh chỉ xem được khi đã đăng nhập.
- Mọi lần ghi / duyệt / từ chối đều được ghi vào [Nhật ký thao tác](19-chấm-công-lịch-làm-nhật-ký.md).
- "Nộp tiền về két tổng" làm giảm tiền trong két nhưng **không** tính là chi phí ở báo cáo lãi / lỗ.

## Hỏi nhanh

| Tình huống | Làm gì |
| --- | --- |
| *"Chưa mở ca — hãy mở ca trước khi thu tiền"* khi ghi khoản | Mở ca trước |
| Ghi nhầm số tiền | Khoản **đang chờ duyệt**: nhờ trưởng ca / quản lý **Từ chối** rồi ghi lại khoản đúng. Khoản **đã duyệt** thì app không có nút sửa / xóa — báo quản lý |
| Đóng ca bị chặn vì còn khoản chờ | Trưởng ca / quản lý **Duyệt** hoặc **Từ chối** hết các khoản chờ |
| *"Ảnh hóa đơn tối đa 2 MB"* | Chụp lại ảnh nhỏ hơn hoặc gửi ảnh chụp màn hình |

*Kỹ thuật: [FEATURE-033](../tài-liệu/chức-năng/FEATURE-033.md).*
