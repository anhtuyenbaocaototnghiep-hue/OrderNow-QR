# 19. Chấm công, lịch làm, năng suất & nhật ký thao tác

> - **Chấm công tự động:** nhân viên đăng nhập máy quầy là **vào ca**, đăng xuất là **ra ca**. Không cần máy chấm công riêng.
> - **Lịch làm tuần:** quản lý xếp ca cho từng người; app báo ai **đi muộn**, ai **vắng**.
> - **Năng suất:** mỗi người thu bao nhiêu tiền, hoàn tất bao nhiêu đơn, làm bao nhiêu giờ.
> - **Nhật ký thao tác:** ghi lại ai đã làm gì với tiền, kho, quyền, giá — chỉ xem, không ai sửa / xóa được.

**Ai dùng:**

- **Nhân viên, trưởng ca:** chấm công tự động khi đăng nhập / đăng xuất.
- **Trưởng ca:** sửa / thêm chấm công **trong ngày hôm nay** ở quầy.
- **Quản lý:** lịch làm, năng suất, nhật ký, sửa chấm công mọi ngày ở **Quản lý → Nhân sự & chấm công** và **Nhật ký thao tác**.

## 1. Chấm công tự động

| Khi nào | Hệ thống làm gì |
| --- | --- |
| Nhân viên / trưởng ca **đăng nhập** | Ghi giờ **vào** (nếu đang chưa có lần chấm công mở) |
| Bấm **Đăng xuất** | Ghi giờ **ra** |
| Người bấm **Đóng ca** | Được ghi giờ ra ngay, dù chưa đăng xuất |
| Quên đăng xuất, phiên đăng nhập hết hạn (mặc định 8 giờ) | Máy tự đóng lần chấm công |
| Lần chấm công mở quá 12 giờ | Đóng ở mốc giờ vào + 12 giờ |

- Đăng nhập / đăng xuất **không hiện thông báo** gì về chấm công; máy ghi ngầm.
- Đăng nhập lại nhiều lần (hoặc trên nhiều máy cùng lúc) vẫn chỉ có **một** lần chấm công đang mở.
- **Quản lý không tự chấm công.** Cần thì thêm tay.
- Nhân viên thường không có màn xem chấm công của mình — hỏi trưởng ca / quản lý.

> Mẹo: dặn nhân viên **bấm Đăng xuất khi hết ca**, giờ ra sẽ chính xác.

## 2. Trưởng ca sửa chấm công ở quầy

**Ca & hoàn tiền** → thẻ **Chấm công hôm nay** (chỉ trưởng ca / quản lý thấy, và chỉ khi đang có ca mở):

- Bảng: Nhân viên · Vào · Ra · Thời gian · Nguồn (**Đăng nhập** / **Thêm tay**). Người chưa ra ca có nhãn xanh **Đang làm**. Dòng đã sửa ghi "Sửa bởi …: lý do".
- **Thêm chấm công:** chọn **Nhân viên**, **Giờ vào**, **Giờ ra (để trống nếu đang làm)**, **Lý do (bắt buộc — ghi vào nhật ký)** → **Lưu**.
- **Sửa** trên một dòng: đổi giờ vào / ra, ghi lý do → **Lưu**.

Máy chặn khi:

- thiếu lý do;
- trưởng ca sửa ngày khác: *"Trưởng ca chỉ sửa chấm công trong ngày hôm nay — ngày khác nhờ quản lý"*;
- trùng giờ với lần chấm công khác của cùng người;
- giờ ở tương lai, giờ ra trước giờ vào, hoặc một lần quá 24 giờ.

## 3. Quản lý: Nhân sự & chấm công

**Quản lý → Nhân sự & chấm công** có 3 tab.

### Tab Chấm công

- Lọc **Từ ngày / Đến ngày** (mặc định 7 ngày), **Nhân viên**.
- Thẻ **Tổng giờ làm**: mỗi người bao nhiêu lần, tổng bao nhiêu giờ.
- Thẻ **Các lần chấm công**: bảng như ở quầy, dòng nào cũng có **Sửa**. Nút **+ Thêm chấm công**. Quản lý sửa được **mọi ngày**.

### Tab Lịch làm tuần

1. Chọn tuần: **← Tuần trước** · **Tuần này** · **Tuần sau →**.
2. Lưới **người × ngày** (T2…CN, hôm nay được tô nổi).
3. **Thêm ca:** bấm **+** trong ô → hộp **Thêm ca làm**: Nhân viên, Ngày, **Bắt đầu** (mặc định 07:00), **Kết thúc** (mặc định 15:00), ghi chú (ví dụ "ca sáng, pha chế") → **Lưu**. Giờ kết thúc nhỏ hơn giờ bắt đầu = ca qua nửa đêm.
4. **Đổi người / đổi ngày:** **kéo** ô ca thả sang ô khác → *"Đã chuyển ca … sang …"*. Hoặc bấm vào ca → đổi Nhân viên / Ngày → **Lưu**.
5. **Xóa ca:** bấm vào ca → **Xóa ca** → xác nhận.
6. **Chép lịch tuần trước:** chép các ca của tuần liền trước sang tuần đang xem. Chạy ngay, không hỏi lại; ca đã có (cùng người, ngày, giờ bắt đầu) thì bỏ qua.

**Nhãn trên mỗi ca:**

| Nhãn | Nghĩa |
| --- | --- |
| **Đúng giờ** (xanh) | Đã chấm công vào, không muộn quá 15 phút |
| **+N′** (đỏ) | Đi muộn N phút (muộn hơn 15 phút) |
| **Vắng** (đỏ) | Đã quá giờ bắt đầu 15 phút mà chưa chấm công |
| (không nhãn) | Ca chưa tới giờ |

Có người muộn / vắng thì đầu tab hiện khung vàng *"Cảnh báo: … chưa chấm công · … muộn N phút"*.

### Tab Năng suất

Chọn khoảng ngày (dùng chung với tab Chấm công). Mỗi người: Vai trò · **Giờ làm** · **Lượt thu** · **Tiền thu** · **Đơn hoàn tất** · **Tiền thu / giờ**.

- Tiền thu = tổng số phải thu các lượt **người đó bấm thu tiền**.
- Đơn hoàn tất = đơn **người đó bấm Hoàn tất**.
- Giờ làm lấy theo chấm công trong kỳ.

## 4. Quản lý: Nhật ký thao tác

**Quản lý → Nhật ký thao tác** — chỉ xem.

**Ghi những gì:**

- mọi thay đổi ở trang Quản lý (thực đơn, giá, định lượng, khuyến mãi, tài khoản, cài đặt…);
- ở quầy: thu tiền, hoàn tiền, đơn mang đi, hủy đơn, mở / đóng ca, sổ quỹ, sơ chế, hủy hàng, hủy lô, nhận hàng, điều chỉnh / kiểm kê, sửa chấm công, tạm ngưng nhận đơn.

Tiếp nhận / hoàn tất / gọi món thường thì **không** ghi.

**Cách xem:**

1. Lọc **Từ ngày / Đến ngày** (mặc định 7 ngày), **Người thao tác**, **Đối tượng**, **Mã đối tượng** (ví dụ 12), **Hành động bắt đầu bằng** (ví dụ `payment.refund`). Hai ô gõ chữ lọc khi bấm Enter.
2. Bảng: Thời gian · Người · Hành động · Đối tượng · IP. Mỗi trang 50 dòng (**← Trước** / **Sau →**).
3. Bấm **Chi tiết** → xem **Trước** (dữ liệu trước khi đổi) và **Sau** (dữ liệu gửi lên + kết quả).

**Lưu ý:**

- Tên **hành động** và **đối tượng** đang là mã kỹ thuật tiếng Anh, ví dụ `payment.refund` (hoàn tiền), `shift.close` (đóng ca), `cash.approve` (duyệt chi), `attendance.update` (sửa chấm công).
- Nhật ký **không bao giờ** chứa mật khẩu; số điện thoại chỉ còn 3 số cuối.
- Không ai sửa / xóa được nhật ký. Bản ghi cũ hơn **12 tháng** tự được dọn.

## Hỏi nhanh

| Tình huống | Làm gì |
| --- | --- |
| Nhân viên quên đăng nhập lúc vào ca | Trưởng ca **Thêm chấm công** trong ngày (ghi lý do), hoặc quản lý thêm sau |
| Không thấy thẻ "Chấm công hôm nay" ở quầy | Thẻ chỉ hiện với trưởng ca / quản lý **khi đang có ca mở** |
| Sửa chấm công của hôm qua | Chỉ quản lý làm được, ở **Nhân sự & chấm công → Chấm công** |
| Muốn biết ai đã hoàn một lượt thu | **Nhật ký thao tác** → ô Hành động gõ `payment.refund` → Enter |

*Kỹ thuật: [FEATURE-035](../tài-liệu/chức-năng/FEATURE-035.md).*
