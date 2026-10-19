# 17. Trưởng ca & phân quyền

> App có thêm vai trò **Trưởng ca**, đứng giữa nhân viên quầy và quản lý. Trưởng ca được tự duyệt những việc hằng ngày ở quầy: giảm giá lớn hơn, hoàn tiền trong ca, duyệt chi quỹ, sửa chấm công trong ngày, điều chỉnh kho và kiểm kê. Trưởng ca **không** vào được trang Quản lý (thực đơn, giá, báo cáo tài chính, lãi / lỗ, tài khoản).

**Ai dùng:** quản lý tạo tài khoản và đặt ngưỡng; trưởng ca dùng quyền ở quầy.

## Ba vai trò làm được gì

| Việc | Nhân viên quầy | Trưởng ca | Quản lý |
| --- | --- | --- | --- |
| Bán, tiếp nhận, hoàn tất, thu tiền, mang đi, in bill | ✔ | ✔ | ✔ |
| Mở / đóng ca | ✔ | ✔ | ✔ |
| Ghi chi tiền / thu khác vào sổ quỹ | ✔ (khoản lớn chờ duyệt) | ✔ | ✔ |
| Sơ chế, hủy hàng, nhận hàng theo đơn đặt hàng | ✔ | ✔ | ✔ |
| Giảm giá tay tự duyệt | ≤ 10 % **và** ≤ 20.000đ | ≤ 20 % **và** ≤ 50.000đ | Không giới hạn |
| Hoàn tiền tự duyệt | ✘ (cần người duyệt) | Lượt thu trong ca đang mở | ✔ |
| Duyệt khoản chi quỹ | ✘ | Khoản ≤ 2.000.000đ | ✔ |
| Sửa / thêm chấm công | ✘ | Chỉ trong ngày hôm nay | Mọi ngày |
| Điều chỉnh kho tay, kiểm kê | ✘ | ✔ (ở quầy) | ✔ |
| Màn **Hôm nay** | ✘ | Bản rút gọn (không có giá vốn / lãi) | Đủ |
| Trang Quản lý (thực đơn, giá, định lượng, khuyến mãi, hội viên, tài khoản, báo cáo, lãi / lỗ, nhật ký…) | ✘ | ✘ | ✔ |

Các con số ngưỡng ở trên là mặc định; quản lý sửa được ở **Cài đặt** (xem cuối trang). Mọi quyền được **máy chủ kiểm**, không chỉ ẩn nút trên màn hình: làm việc không được phép sẽ báo *"Tài khoản của bạn không có quyền thực hiện thao tác này"*.

## Quản lý tạo tài khoản Trưởng ca

1. **Quản lý → Tài khoản** → **+ Thêm nhân viên**.
2. Điền **Tên đăng nhập**, **Mật khẩu (tối thiểu 6 ký tự)**, **Họ tên**; ô **Vai trò** chọn **Trưởng ca** (các lựa chọn: Nhân viên quầy / Trưởng ca / Quản lý).
3. **Tạo tài khoản** → người đó đăng nhập được ngay.

Đổi vai trò người đang có: bấm **Sửa** trên dòng → đổi **Vai trò** → **Lưu**. Không tự đổi vai trò của chính mình được.

**Luôn còn ít nhất một Quản lý:** hạ vai trò, khóa hoặc xóa quản lý cuối cùng đều bị chặn: *"Phải còn ít nhất một tài khoản Quản lý đang hoạt động"*. Hai quản lý cùng lúc hạ quyền nhau thì chỉ một người làm được.

## Trưởng ca thấy gì ở quầy

- **Thanh trên:** cạnh họ tên có nhãn xanh **Trưởng ca**. Thanh điều hướng có thêm mục **Hôm nay** (xem [Màn Hôm nay](24-màn-hôm-nay.md)). Trưởng ca không có mục **Quản lý**.
- **Ca & hoàn tiền:**
  - duyệt / từ chối khoản chi quỹ (xem [Sổ quỹ](18-sổ-quỹ.md));
  - thẻ **Chấm công hôm nay** để sửa / thêm chấm công trong ngày (xem [Chấm công](19-chấm-công-lịch-làm-nhật-ký.md));
  - hoàn tiền lượt thu trong ca đang mở mà không cần ai nhập tài khoản.
- **Kho & sơ chế:**
  - tab **Tồn kho** có nút **Điều chỉnh** trên từng nguyên liệu;
  - thêm tab **Kiểm kê** (xem [Kho nâng cao](16-kho-nâng-cao.md) mục 7).
- Mở trang Quản lý (`/admin`) → bị chuyển về quầy, báo *"Chức năng quản lý chỉ dành cho tài khoản Quản lý"*.

## Duyệt bằng cách nhập tài khoản

Khi người đang đứng máy không đủ quyền, người có quyền cao hơn **nhập tên đăng nhập + mật khẩu ngay trên máy đó** để duyệt. Không cần đăng xuất / đăng nhập lại.

### Giảm giá tay vượt ngưỡng

1. Trong khung **Hội viên · giảm giá · voucher**, nhập mức giảm ở dòng **Giảm giá tay** và **Lý do giảm (bắt buộc)**.
2. Vượt ngưỡng của người đang đứng máy → hiện *"Mức giảm vượt ngưỡng của bạn — cần trưởng ca / quản lý nhập tài khoản để duyệt:"* với hai ô **Tên đăng nhập trưởng ca / quản lý** và **Mật khẩu quản lý**.
3. Ví dụ:
   - nhân viên giảm 15 % → trưởng ca nhập tài khoản là được;
   - giảm 25 % → vượt cả ngưỡng trưởng ca → **chỉ quản lý** duyệt được (*"Cần tài khoản quản lý duyệt …"*).

Trưởng ca / quản lý tự giảm trong ngưỡng của mình thì không cần nhập gì. Hóa đơn lưu tên người duyệt.

### Hoàn tiền

**Ca & hoàn tiền → Lượt thu trong ca → Hoàn tiền:**

- **Nhân viên** thao tác → hiện *"Cần trưởng ca / quản lý xác thực:"*, người duyệt nhập tài khoản.
- **Trưởng ca** hoàn lượt thu của ca đang mở → không cần nhập gì. Lượt thu của ca khác → *"Cần quản lý xác thực (lượt thu của ca khác):"*.
- **Quản lý** không bao giờ cần nhập.

Quy tắc hoàn tiền còn lại giữ như cũ (chỉ trong ngày thu tiền) — xem [Hoàn tiền](08-hoàn-tiền.md).

### Duyệt khoản chi quỹ

Xem [Sổ quỹ](18-sổ-quỹ.md) mục "Duyệt / từ chối".

## Quản lý đặt ngưỡng

**Quản lý → Cài đặt** → thẻ **Trưởng ca & sổ quỹ**:

| Ô | Mặc định |
| --- | --- |
| Trưởng ca giảm tay tối đa % bill | 20 |
| Trưởng ca giảm tay tối đa (đ) | 50.000 |
| Khoản chi quỹ cần duyệt khi lớn hơn (đ) | 500.000 |
| Trưởng ca duyệt chi tối đa (đ) | 2.000.000 |
| Trưởng ca chỉ tự hoàn tiền cho lượt thu trong ca đang mở | Bật |

Thẻ **Giảm giá tay của nhân viên** (đã có từ trước) vẫn giữ ngưỡng của nhân viên. Bấm **Lưu cài đặt** ở cuối trang.

## Cần nhóm xác nhận (Q-022)

File yêu cầu ghi nhân viên **không** được mở / đóng ca và **không** được ghi chi quỹ. App đang giữ cách cũ của tài liệu dự án:

| Điểm | Đang làm |
| --- | --- |
| Nhân viên có được mở / đóng ca không? | **Có** (như [Chốt ca](06-chốt-ca.md)) |
| Nhân viên có được ghi khoản chi quỹ không? | **Có**, nhưng khoản > 500.000đ hoặc danh mục "Khác (chi)" phải chờ trưởng ca / quản lý duyệt |

Muốn đổi thì báo lại.

*Kỹ thuật: [FEATURE-036](../tài-liệu/chức-năng/FEATURE-036.md).*
