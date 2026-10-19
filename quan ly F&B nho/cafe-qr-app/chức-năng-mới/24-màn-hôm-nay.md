# 24. Màn "Hôm nay" (bảng tóm tắt cho chủ quán)

> Mở điện thoại là biết ngay: **hôm qua bán được bao nhiêu**, két ca gần nhất có lệch không, kho có gì cần chú ý, món nào bán chạy, và **còn việc gì phải xử lý** (chi quỹ chờ duyệt, hàng đến hạn nhận, lô hết hạn, lâu chưa kiểm kê).

**Ai dùng:**

- **Quản lý:** bản đầy đủ. Mục đầu tiên trong menu quản lý: **Quản lý → Hôm nay**.
- **Trưởng ca:** bản rút gọn (không có giá vốn / lãi). Mục **Hôm nay** trên thanh quầy.
- **Nhân viên:** không xem được (bị chuyển về quầy).

Trang hiển thị gọn trên điện thoại, không phải cuộn ngang.

## Đọc màn hình

Góc trên có dòng **"Tính lúc …"** và nút **Tính lại hôm nay**.

**5 thẻ lớn:**

| Thẻ | Nội dung |
| --- | --- |
| **Doanh thu hôm qua (dd/mm)** | Doanh thu thuần; ▲ / ▼ % so với **cùng thứ tuần trước**; số đơn · bill trung bình. Quản lý thấy thêm **Lãi gộp ước tính** |
| **Lệch két ca gần nhất** | Thừa (+, xanh) / thiếu (−, đỏ) / 0đ của ca đóng gần nhất, kèm "Ca #… đóng …" |
| **Kho cần chú ý** | "Sắp hết: …" và "Còn N ngày: …" / "Đã hết hạn: …" (lô còn ≤ 2 ngày). Đây là ảnh chụp kho lúc tính |
| **Top 3 món hôm qua** | Tên món — số phần |
| **Hội viên hôm qua** | Số hội viên mới · số voucher đã dùng |

**Việc cần làm** — mỗi dòng là link bấm thẳng tới màn xử lý, chỉ hiện khi có việc:

| Dòng | Bấm vào sẽ tới |
| --- | --- |
| "N khoản chi quỹ chờ duyệt (…)" | Quầy → **Ca & hoàn tiền** (xem [Sổ quỹ](18-sổ-quỹ.md)) |
| "N đơn đặt hàng đến hạn nhận" | Quầy → **Kho & sơ chế** (tab Nhận hàng) |
| "N lô đã hết hạn còn hàng — cần hủy" | Quầy → **Kho & sơ chế** (tab Hạn dùng) |
| "Chưa từng chốt kiểm kê" / "N ngày chưa kiểm kê (quá 7 ngày)" | Quản lý: **Nhập kho & kiểm kê**; trưởng ca: **Kho & sơ chế** |

Không còn việc gì: *"✔ Không có việc tồn đọng."*

## Số liệu tính lúc nào

- **Mỗi đêm 00:30** máy tự tính số liệu của **hôm qua** và lưu lại, nên mở màn hình rất nhanh.
- Bấm **Tính lại hôm nay** để tính ngay số của hôm nay (và tính bù hôm qua nếu còn thiếu) → *"Đã tính lại số liệu hôm nay"*. Cả quản lý và trưởng ca đều bấm được.
- Doanh thu thuần, giá vốn, lãi gộp tính **cùng cách với trang [Lãi / lỗ](20-lãi-lỗ.md)**, nên số khớp nhau.
- Phần "Việc cần làm" luôn đếm trực tiếp lúc mở trang.

## Bản của trưởng ca khác gì

- **Không có** dòng "Lãi gộp ước tính" (máy chủ không gửi giá vốn / lãi cho trưởng ca, không chỉ ẩn trên màn hình).
- Dòng chi quỹ chờ duyệt **không kèm tổng tiền**.
- Link kiểm kê dẫn tới **Kho & sơ chế** ở quầy.
- Thanh bên chỉ có **☕ Hôm nay**, **← Màn hình quầy** và **Đăng xuất** (không có menu quản lý).

> Mẹo: trên điện thoại, mở `/admin/today` rồi chọn "Thêm vào màn hình chính" của trình duyệt để có biểu tượng mở nhanh mỗi sáng.

*Kỹ thuật: [FEATURE-043](../tài-liệu/chức-năng/FEATURE-043.md).*
