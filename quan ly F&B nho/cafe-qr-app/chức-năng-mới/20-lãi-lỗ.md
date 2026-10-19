# 20. Lãi / lỗ (ước tính) & điểm hòa vốn

> Chủ quán xem nhanh: tháng này **lãi hay lỗ** bao nhiêu, và **mỗi ngày phải bán được bao nhiêu** mới đủ bù chi phí cố định (mặt bằng, lương cố định…). Đây là số **ước tính** để quản lý quán, không phải báo cáo kế toán / thuế.

**Ai dùng:** chỉ quản lý. Trang: **Quản lý → Lãi / lỗ** (nhóm Tài chính & nhân sự). Trưởng ca không xem được.

## Bước 1 — Khai báo chi phí cố định (một lần)

Thẻ **Chi phí cố định / tháng** (cuối trang) → **+ Thêm**:

1. **Tên khoản** (ví dụ "Tiền mặt bằng").
2. **Số tiền mỗi tháng (đ)**.
3. **Hiệu lực từ** (mặc định ngày 1 tháng này) và **Đến (để trống = đang áp dụng)**.
4. **Lưu** → *"Đã lưu chi phí cố định"*.

Mỗi khoản được **chia đều theo số ngày của tháng** đó, chỉ tính trong thời gian hiệu lực. Ví dụ mặt bằng 30.000.000đ, tháng 9 có 30 ngày → mỗi ngày 1.000.000đ. Khoản hết hiệu lực giữa tháng chỉ tính tới ngày kết thúc.

Các khoản chi lặt vặt hằng ngày (mua đá, điện nước, trả shipper…) **không** khai ở đây mà ghi ở [Sổ quỹ](18-sổ-quỹ.md).

## Bước 2 — Xem lãi / lỗ

1. Chọn **Từ ngày / Đến ngày**, hoặc bấm nút nhanh **Tháng này** · **30 ngày** · **Năm nay**.
2. **Nhóm theo:** **Theo ngày** hoặc **Theo tháng**.
3. Trang hiện khung vàng **"Ước tính."** cố định, nhắc rằng giá vốn tính theo giá vốn bình quân lúc hoàn tất đơn, chi phí cố định chia đều theo ngày, chưa gồm thuế và các khoản chi ngoài sổ quỹ.

**Các ô số:**

| Ô | Nghĩa |
| --- | --- |
| **Doanh thu thuần** | Tiền thực thu − tiền hoàn. Dòng phụ: "Gộp … − giảm … − hoàn …" |
| **Giá vốn (COGS)** | Tiền nguyên liệu của các đơn đã hoàn tất (xem [Kho nâng cao](16-kho-nâng-cao.md) mục 1) |
| **Lãi gộp** | Doanh thu thuần − giá vốn; dòng phụ "Biên …%" |
| **Chi quỹ (chi phí)** | Khoản chi **đã duyệt** trong sổ quỹ thuộc danh mục tính chi phí ("Nộp tiền về két tổng" không tính) |
| **Chi phí cố định phân bổ** | Tổng chi phí cố định chia theo ngày trong kỳ; dòng phụ "…/ngày" |
| **Lợi nhuận hoạt động** | Lãi gộp − chi quỹ − cố định phân bổ (âm thì màu đỏ = lỗ) |
| **Hòa vốn mỗi ngày** | Doanh thu thuần cần đạt mỗi ngày để lợi nhuận = 0. Lãi gộp ≤ 0 thì hiện "—" |

**Bên dưới:**

- **Biểu đồ cột** Doanh thu thuần · Giá vốn · Chi phí (quỹ + cố định). Khi xem theo ngày có thêm **đường hòa vốn** — ngày nào cột doanh thu thấp hơn đường này là ngày chưa đủ bù chi phí.
- **Chi quỹ theo danh mục.**
- **Bảng theo ngày / tháng:** Doanh thu thuần · Giá vốn · Lãi gộp · Chi quỹ · Cố định · Lợi nhuận.

## Ví dụ một ngày

| Khoản | Số tiền |
| --- | --- |
| Thu tiền trong ngày | 2.000.000đ |
| Hoàn tiền | −100.000đ |
| **Doanh thu thuần** | **1.900.000đ** |
| Giá vốn | −600.000đ |
| **Lãi gộp** (biên 68,42 %) | **1.300.000đ** |
| Chi quỹ (mua đá, điện nước…) | −150.000đ |
| Cố định phân bổ (30.000.000đ ÷ 30 ngày) | −1.000.000đ |
| **Lợi nhuận hoạt động** | **150.000đ** |
| **Hòa vốn mỗi ngày** = 1.000.000 ÷ 68,42 % | ≈ **1.461.538đ** |

## Quy tắc cần nhớ

- **Đơn chưa có giá vốn chốt** (đơn trước khi có chức năng này, hoặc nguyên liệu chưa có giá lúc hoàn tất) → máy ước tính theo định lượng × giá vốn hiện tại, và khung vàng ghi thêm *"N dòng món chưa có giá vốn chốt — đã ước tính…"*.
- **Đơn hoàn tiền có hủy đơn** không tính giá vốn.
- **Khoảng xem tối đa khoảng 13 tháng.** Chọn sai khoảng (Từ ngày sau Đến ngày) thì trang báo lỗi — tải lại trang (F5) rồi chọn lại.
- **Xóa** chi phí cố định đã dùng trong kỳ cũ: hệ thống vẫn giữ cho báo cáo cũ.

> Mẹo: muốn số lãi / lỗ sát thực tế, hãy (1) nhập kho **có giá** cho mọi nguyên liệu, (2) ghi **mọi khoản chi tiền mặt** vào sổ quỹ, (3) khai đủ chi phí cố định.

*Kỹ thuật: [FEATURE-034](../tài-liệu/chức-năng/FEATURE-034.md).*
